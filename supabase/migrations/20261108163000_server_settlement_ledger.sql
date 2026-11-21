-- Server-owned HQ settlement snapshots. No browser samples are imported.
-- Additive migration: does not rewrite schedules, logs, expenses, or the HQ workbook.
CREATE TABLE IF NOT EXISTS cockpit.settlement_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL DEFAULT 'vip_limousine_korea',
  schedule_id uuid NOT NULL REFERENCES cockpit.schedules(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'approved', 'issued')),
  source_hash text NOT NULL CHECK (length(source_hash) = 32),
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  contract_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contract_snapshot) = 'object'),
  totals_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(totals_snapshot) = 'object'),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  issued_by text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, schedule_id)
);
CREATE INDEX IF NOT EXISTS settlement_documents_org_status_idx
  ON cockpit.settlement_documents (organization_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS cockpit.settlement_document_audit (
  id bigserial PRIMARY KEY,
  organization_id text NOT NULL,
  document_id uuid NOT NULL REFERENCES cockpit.settlement_documents(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  action text NOT NULL CHECK (action IN ('prepare', 'price', 'approve', 'issue')),
  actor_id text NOT NULL,
  source_hash text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);
CREATE INDEX IF NOT EXISTS settlement_audit_document_idx
  ON cockpit.settlement_document_audit (organization_id, document_id, created_at DESC);

ALTER TABLE cockpit.settlement_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.settlement_document_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.settlement_documents, cockpit.settlement_document_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE cockpit.settlement_document_audit_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON cockpit.settlement_documents TO service_role;
GRANT SELECT, INSERT ON cockpit.settlement_document_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE cockpit.settlement_document_audit_id_seq TO service_role;

-- One canonical DB fingerprint. Also recalculated INSIDE the row-locked transaction
-- so stale operating records cannot be approved or issued.
CREATE OR REPLACE FUNCTION cockpit.settlement_live_source_hash(
  p_schedule uuid, p_org text
) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, cockpit
AS $$
  SELECT md5(jsonb_build_object(
    'schedule', to_jsonb(s),
    'logs', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
      FROM cockpit.driving_logs l
      WHERE l.booking_id = s.id AND l.organization_id = p_org
    ), '[]'::jsonb),
    'expenses', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM cockpit.expenses e
      WHERE e.organization_id = p_org AND (
        e.booking_id = s.id OR EXISTS (
          SELECT 1 FROM cockpit.driving_logs linked
          WHERE linked.id = e.driving_log_id
            AND linked.booking_id = s.id AND linked.organization_id = p_org
        )
      )
    ), '[]'::jsonb)
  )::text)
  FROM cockpit.schedules s
  WHERE s.id = p_schedule AND COALESCE(s.org_id, p_org) = p_org
$$;
REVOKE ALL ON FUNCTION cockpit.settlement_live_source_hash(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cockpit.settlement_live_source_hash(uuid,text) TO service_role;

-- Atomic CAS state machine, immutable approval/issuance and append-only audit.
-- The frontend cannot invoke this RPC: only the verified Next.js HQ route can.
CREATE OR REPLACE FUNCTION cockpit.commit_settlement_document(
  p_org text,
  p_schedule uuid,
  p_actor text,
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
BEGIN
  IF p_org IS DISTINCT FROM 'vip_limousine_korea'
    OR p_actor IS NULL OR length(trim(p_actor)) < 3 OR length(p_actor) > 128
    OR p_action NOT IN ('prepare','price','approve','issue')
    OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_REQUEST';
  END IF;
  SELECT * INTO v_row FROM cockpit.settlement_documents
   WHERE organization_id = p_org AND schedule_id = p_schedule FOR UPDATE;
  -- Evaluate the live source after obtaining the document lock.
  v_live := cockpit.settlement_live_source_hash(p_schedule, p_org);
  IF v_live IS NULL THEN RAISE EXCEPTION 'SCHEDULE_NOT_FOUND'; END IF;
  IF v_live IS DISTINCT FROM p_source_hash THEN RAISE EXCEPTION 'SOURCE_CHANGED'; END IF;

  IF NOT FOUND THEN
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
      WHERE id=v_row.id RETURNING * INTO v_row;
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
      WHERE id=v_row.id RETURNING * INTO v_row;
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
      WHERE id=v_row.id RETURNING * INTO v_row;
    ELSIF p_action = 'issue' THEN
      IF v_row.status <> 'approved' OR v_row.source_hash <> v_live
        THEN RAISE EXCEPTION 'SETTLEMENT_NOT_ISSUABLE'; END IF;
      UPDATE cockpit.settlement_documents SET
        version=version+1,status='issued',issued_by=p_actor,
        issued_at=now(),updated_by=p_actor,updated_at=now()
      WHERE id=v_row.id RETURNING * INTO v_row;
    END IF;
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
REVOKE ALL ON FUNCTION cockpit.commit_settlement_document(text,uuid,text,text,integer,text,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_settlement_document(text,uuid,text,text,integer,text,jsonb,jsonb,jsonb)
  TO service_role;