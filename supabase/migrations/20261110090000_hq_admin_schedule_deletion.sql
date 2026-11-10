-- HQ schedule removal: true delete for unlinked bookings, operator choice for
-- linked drafts, and retained tombstones for finalized/financial/custody records.
-- Never remove a submitted or reviewed record, issued settlement, receipt or
-- vehicle handover history through this workflow.
CREATE TABLE IF NOT EXISTS cockpit.schedule_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  schedule_ids uuid[] NOT NULL,
  actor_id text NOT NULL,
  requested_mode text NOT NULL,
  applied_mode text NOT NULL,
  record_counts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cockpit.schedule_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.schedule_deletion_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON cockpit.schedule_deletion_audit TO service_role;

CREATE OR REPLACE FUNCTION cockpit.admin_schedule_delete(
  p_ids uuid[], p_action text, p_actor text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, cockpit
AS $$
DECLARE
  v_org CONSTANT text := 'vip_limousine_korea';
  v_total int;
  v_logs int;
  v_expenses int;
  v_settlements int;
  v_links int;
  v_custodies int;
  v_custody_requests int;
  v_retain boolean;
  v_has_records boolean;
  v_counts jsonb;
  v_applied text;
  v_deleted int;
BEGIN
  IF p_action NOT IN ('inspect','schedule_only','include_drafts')
     OR p_actor IS NULL OR length(btrim(p_actor)) < 3 OR length(p_actor) > 128
     OR p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(p_ids) id WHERE id IS NULL)
     OR (SELECT count(DISTINCT id) FROM unnest(p_ids) id) <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'INVALID_DELETE_REQUEST' USING ERRCODE = '22023';
  END IF;

  -- The same lock family as the dispatch integrity guard prevents a concurrent
  -- dispatch edit while we check its related records and remove the assignment.
  IF p_action <> 'inspect' THEN
    PERFORM pg_advisory_xact_lock(748201, 10);
    PERFORM 1 FROM cockpit.schedules
      WHERE id = ANY(p_ids) ORDER BY id FOR UPDATE;
  END IF;

  SELECT count(*) INTO v_total FROM cockpit.schedules
    WHERE id = ANY(p_ids) AND coalesce(org_id,v_org) = v_org AND status <> 'deleted';
  IF v_total <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'DELETE_TARGET_CHANGED' USING ERRCODE = '40001';
  END IF;

  SELECT count(*) INTO v_logs FROM cockpit.driving_logs l
    WHERE l.organization_id = v_org AND l.booking_id = ANY(p_ids);
  SELECT count(*) INTO v_expenses FROM cockpit.expenses e
    WHERE e.organization_id = v_org
      AND (e.booking_id = ANY(p_ids) OR EXISTS (
        SELECT 1 FROM cockpit.driving_logs l
        WHERE l.id = e.driving_log_id AND l.organization_id = v_org AND l.booking_id = ANY(p_ids)
      ));
  SELECT count(*) INTO v_settlements FROM cockpit.settlement_documents d
    WHERE d.organization_id = v_org AND d.schedule_id = ANY(p_ids);
  SELECT count(*) INTO v_links FROM cockpit.driving_log_booking_link_audit l
    WHERE l.organization_id = v_org AND l.booking_id = ANY(p_ids);
  SELECT count(*) INTO v_custodies FROM cockpit.vehicle_custodies c
    WHERE c.organization_id = v_org AND c.booking_id = ANY(p_ids);
  SELECT count(*) INTO v_custody_requests FROM cockpit.vehicle_custody_requests c
    WHERE c.organization_id = v_org AND c.booking_id = ANY(p_ids);

  -- Anything acknowledged, paid, submitted, reviewed or supported by a receipt
  -- is retained. Even draft settlement documents have immutable audit/FKs.
  v_retain := (v_settlements + v_links + v_custodies + v_custody_requests > 0)
    OR EXISTS (
      SELECT 1 FROM cockpit.driving_logs l
      WHERE l.organization_id = v_org AND l.booking_id = ANY(p_ids)
        AND (l.status <> 'draft' OR l.submitted_at IS NOT NULL
             OR l.reviewed_at IS NOT NULL)
    )
    OR EXISTS (
      SELECT 1 FROM cockpit.expenses e
      WHERE e.organization_id = v_org
        AND (e.booking_id = ANY(p_ids) OR EXISTS (
          SELECT 1 FROM cockpit.driving_logs l WHERE l.id = e.driving_log_id
          AND l.organization_id = v_org AND l.booking_id = ANY(p_ids)))
        AND (e.status <> 'draft' OR e.submitted_at IS NOT NULL
             OR e.reviewed_at IS NOT NULL OR e.receipt_storage_path IS NOT NULL
             OR coalesce(e.has_receipt_image,false))
    );

  v_has_records := v_logs + v_expenses + v_settlements + v_links +
                   v_custodies + v_custody_requests > 0;
  v_counts := jsonb_build_object(
    'drivingLogs', v_logs, 'expenses', v_expenses,
    'settlements', v_settlements, 'linkAudits', v_links,
    'custodies', v_custodies, 'custodyRequests', v_custody_requests
  );
  IF p_action = 'inspect' THEN
    RETURN jsonb_build_object('ok',true,'count',v_total,
      'counts',v_counts,'hasRecords',v_has_records,
      'canIncludeDrafts',NOT v_retain);
  END IF;

  IF p_action = 'include_drafts' AND v_retain THEN
    RAISE EXCEPTION 'RECORDS_REQUIRE_RETENTION' USING ERRCODE = '23514';
  END IF;

  IF p_action = 'include_drafts' AND v_has_records THEN
    -- Within the same transaction, remove ONLY unsubmitted, unreviewed drafts.
    -- First remove expenses linked directly to bookings or through those logs.
    DELETE FROM cockpit.expenses e
      WHERE e.organization_id = v_org
      AND (e.booking_id = ANY(p_ids) OR EXISTS (
        SELECT 1 FROM cockpit.driving_logs l WHERE l.id = e.driving_log_id
        AND l.organization_id = v_org AND l.booking_id = ANY(p_ids)));
    DELETE FROM cockpit.driving_logs l
      WHERE l.organization_id = v_org AND l.booking_id = ANY(p_ids);
  END IF;

  IF p_action = 'schedule_only' AND v_has_records THEN
    -- FK-safe, preserves the exact source IDs for audit and accounting.
    UPDATE cockpit.schedules SET
      status = 'deleted', dispatch_status = 'cancelled', updated_at = now()
    WHERE id = ANY(p_ids) AND coalesce(org_id,v_org) = v_org;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_applied := 'archived_booking';
  ELSE
    -- No operational records (or only drafts explicitly removed above).
    DELETE FROM cockpit.schedules
      WHERE id = ANY(p_ids) AND coalesce(org_id,v_org) = v_org;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_applied := 'hard_deleted';
  END IF;

  IF v_deleted <> v_total THEN
    RAISE EXCEPTION 'DELETE_TARGET_CHANGED' USING ERRCODE = '40001';
  END IF;
  INSERT INTO cockpit.schedule_deletion_audit (
    organization_id,schedule_ids,actor_id,requested_mode,applied_mode,record_counts
  ) VALUES (v_org,p_ids,p_actor,p_action,v_applied,v_counts);

  RETURN jsonb_build_object('ok',true,'deletedCount',v_deleted,
    'appliedMode',v_applied,'counts',v_counts,
    'assignmentsReleased',true,'operationalRecordsPreserved',v_applied = 'archived_booking');
END;
$$;

REVOKE ALL ON FUNCTION cockpit.admin_schedule_delete(uuid[],text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cockpit.admin_schedule_delete(uuid[],text,text)
  TO service_role;
