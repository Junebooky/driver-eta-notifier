-- REVIEW ONLY. Candidate follows existing settlement state transitions, with scoped actor and source checks.
-- Original VIP RPC and migration are unchanged. No new settlement ledger.
BEGIN;
CREATE FUNCTION cockpit.commit_tenant_settlement_v1(
  p_org text,
  p_schedule uuid,
  p_user uuid,
  p_session uuid,
  p_action text,
  p_expected_version integer,
  p_source_hash text,
  p_source_snapshot jsonb DEFAULT NULL,
  p_contract_snapshot jsonb DEFAULT NULL,
  p_totals_snapshot jsonb DEFAULT NULL
) RETURNS cockpit.settlement_documents
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, cockpit
AS $$
DECLARE
  v_row cockpit.settlement_documents%ROWTYPE;
  v_live text;
  v_count integer;
  v_exists boolean;
  v_source jsonb;
  p_actor text := p_user::text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('prepare','price','approve','issue')
    OR p_expected_version IS NULL OR p_expected_version < 0 OR p_schedule IS NULL
    OR p_source_hash IS NULL OR p_source_hash !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_REQUEST' USING ERRCODE='22023';
  END IF;
  -- Reuse the scoped read authorization and source snapshot; locks remain held
  -- through this transaction. Browser input never supplies source or totals.
  v_source := cockpit.tenant_settlement_read_v1(p_org,p_user,p_session,'source',p_schedule);
  IF v_source->>'hash' IS DISTINCT FROM p_source_hash THEN
    RAISE EXCEPTION 'SOURCE_CHANGED' USING ERRCODE='40001';
  END IF;
  IF p_action='prepare' AND (p_source_snapshot->>'scheduleId' IS DISTINCT FROM p_schedule::text
     OR jsonb_typeof(p_source_snapshot) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'INVALID_SOURCE_SNAPSHOT' USING ERRCODE='22023';
  END IF;
  IF p_action<>'prepare' AND p_source_snapshot IS NOT NULL OR
     p_action<>'price' AND (p_contract_snapshot IS NOT NULL OR p_totals_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_REQUEST' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_row FROM cockpit.settlement_documents
   WHERE organization_id = p_org AND schedule_id = p_schedule FOR UPDATE;
  v_exists := FOUND;
  -- Evaluate the live source after obtaining the document lock.
  v_live := cockpit.settlement_live_source_hash(p_schedule, p_org);
  IF v_live IS NULL THEN RAISE EXCEPTION 'SCHEDULE_NOT_FOUND'; END IF;
  IF v_live IS DISTINCT FROM p_source_hash THEN RAISE EXCEPTION 'SOURCE_CHANGED'; END IF;

  IF NOT v_exists THEN
    IF p_action <> 'prepare' OR p_expected_version <> 0
      OR jsonb_typeof(p_source_snapshot) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'SETTLEMENT_NOT_PREPARED';
    END IF;
    INSERT INTO cockpit.settlement_documents
      (organization_id,schedule_id,source_hash,source_snapshot,created_by,updated_by)
    VALUES (p_org,p_schedule,v_live,p_source_snapshot,p_actor,p_actor)
    RETURNING * INTO v_row;
  ELSE
    IF v_row.version <> p_expected_version THEN RAISE EXCEPTION 'SETTLEMENT_VERSION_CONFLICT'; END IF;
    IF v_row.status IN ('approved','issued') AND p_action IN ('prepare','price')
       THEN RAISE EXCEPTION 'SETTLEMENT_LOCKED'; END IF;
    IF p_action = 'prepare' THEN
      IF jsonb_typeof(p_source_snapshot) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_SOURCE_SNAPSHOT'; END IF;
      UPDATE cockpit.settlement_documents SET
        version=version+1,status='draft',source_hash=v_live,
        source_snapshot=p_source_snapshot,contract_snapshot='{}'::jsonb,
        totals_snapshot='{}'::jsonb,updated_by=p_actor,updated_at=now()
      WHERE id=v_row.id AND organization_id=p_org RETURNING * INTO v_row;
    ELSIF p_action = 'price' THEN
      IF v_row.status NOT IN ('draft','reviewing') OR v_row.source_hash <> v_live
        OR jsonb_typeof(p_contract_snapshot) IS DISTINCT FROM 'object'
        OR jsonb_typeof(p_totals_snapshot) IS DISTINCT FROM 'object'
        OR length(trim(COALESCE(p_contract_snapshot->>'reference',''))) < 6
        OR length(trim(COALESCE(p_contract_snapshot->>'laborReference',''))) < 6
        OR (p_totals_snapshot->>'supplyAmount') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'INVALID_SETTLEMENT_PRICING';
      END IF;
      UPDATE cockpit.settlement_documents SET
        version=version+1,status='reviewing',contract_snapshot=p_contract_snapshot,
        totals_snapshot=p_totals_snapshot,updated_by=p_actor,updated_at=now()
      WHERE id=v_row.id AND organization_id=p_org RETURNING * INTO v_row;
    ELSIF p_action = 'approve' THEN
      IF v_row.status <> 'reviewing' OR v_row.source_hash <> v_live
        OR v_row.source_snapshot->>'serviceVerified' IS DISTINCT FROM 'true'
        OR length(COALESCE(v_row.contract_snapshot->>'reference','')) < 6
        OR length(COALESCE(v_row.contract_snapshot->>'laborReference','')) < 6
        OR (v_row.totals_snapshot->>'supplyAmount') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'SETTLEMENT_NOT_APPROVABLE';
      END IF;
      SELECT count(*) INTO v_count FROM cockpit.driving_logs
        WHERE booking_id=p_schedule AND organization_id=p_org
          AND status IN ('승인 완료','approved') AND customer_service_start IS NOT NULL
          AND customer_service_end IS NOT NULL;
      IF v_count <> 1 OR
        EXISTS(SELECT 1 FROM cockpit.driving_logs
          WHERE booking_id=p_schedule AND organization_id=p_org
          AND status NOT IN ('승인 완료','approved')) OR
        EXISTS(SELECT 1 FROM cockpit.expenses e
          WHERE e.organization_id=p_org
          AND (e.booking_id=p_schedule OR EXISTS (
            SELECT 1 FROM cockpit.driving_logs l
             WHERE l.id=e.driving_log_id AND l.booking_id=p_schedule AND l.organization_id=p_org
          ))
          AND e.status NOT IN ('승인 완료','approved','반려','rejected')) THEN
        RAISE EXCEPTION 'UNVERIFIED_OPERATING_RECORDS';
      END IF;
      UPDATE cockpit.settlement_documents SET
        version=version+1,status='approved',approved_by=p_actor,
        approved_at=now(),updated_by=p_actor,updated_at=now()
      WHERE id=v_row.id AND organization_id=p_org RETURNING * INTO v_row;
    ELSIF p_action = 'issue' THEN
      IF v_row.status <> 'approved' OR v_row.source_hash <> v_live
        THEN RAISE EXCEPTION 'SETTLEMENT_NOT_ISSUABLE'; END IF;
      UPDATE cockpit.settlement_documents SET
        version=version+1,status='issued',issued_by=p_actor,
        issued_at=now(),updated_by=p_actor,updated_at=now()
      WHERE id=v_row.id AND organization_id=p_org RETURNING * INTO v_row;
    END IF;
  END IF;

  IF cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  INSERT INTO cockpit.settlement_document_audit
    (organization_id,document_id,version,action,actor_id,source_hash,record)
  VALUES (p_org,v_row.id,v_row.version,p_action,p_actor,v_row.source_hash,
    jsonb_build_object('status',v_row.status,'source',v_row.source_snapshot,
      'contract',v_row.contract_snapshot,'totals',v_row.totals_snapshot,
      'approvedBy',v_row.approved_by,'approvedAt',v_row.approved_at,
      'issuedBy',v_row.issued_by,'issuedAt',v_row.issued_at));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.commit_tenant_settlement_v1(text,uuid,uuid,uuid,text,integer,text,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_tenant_settlement_v1(text,uuid,uuid,uuid,text,integer,text,jsonb,jsonb,jsonb)
  TO service_role;
COMMIT;
