-- REVIEW ONLY: apply in disposable CI, never to the operating database here.
BEGIN;
CREATE TABLE cockpit.organization_verified_receipts (
 org_id text NOT NULL REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
 expense_id uuid NOT NULL REFERENCES cockpit.expenses(id) ON DELETE RESTRICT,
 driver_id uuid NOT NULL,
 object_path text NOT NULL,
 sha256 text NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
 verified_by uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(org_id,expense_id),
 CHECK(cockpit.tenant_receipt_path_valid_v1(org_id,driver_id,object_path))
);
ALTER TABLE cockpit.organization_verified_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.organization_verified_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON cockpit.organization_verified_receipts TO service_role;

-- Actor, expense and scope are rechecked in every phase. Storage attestation
-- is accepted ONLY from the internal trusted server that read and hashed bytes.
CREATE FUNCTION cockpit.tenant_receipt_v1(p_org text,p_user uuid,p_session uuid,p_expense uuid,p_op text,p_evidence jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m cockpit.organization_members; e cockpit.expenses; proof cockpit.organization_verified_receipts;
 revision text; path_value text; digest_value text; mime_value text; ext text; size_value integer;
BEGIN
 IF current_user<>'service_role' OR p_org IS NULL OR p_user IS NULL OR p_session IS NULL OR p_expense IS NULL THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,12);
 PERFORM 1 FROM cockpit.organizations WHERE id=p_org AND status='active' AND runtime_enabled FOR SHARE;
 IF NOT FOUND OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM cockpit.organization_members WHERE org_id=p_org AND user_id=p_user AND status='active' FOR SHARE;
 IF NOT FOUND OR m.role NOT IN ('driver','company_owner','company_admin') OR (m.role='driver' AND m.driver_id IS NULL) OR (m.role<>'driver' AND m.driver_id IS NOT NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF m.role='driver' THEN
  PERFORM 1 FROM cockpit.drivers WHERE id=m.driver_id AND org_id=p_org AND driver_meta->>'status'='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM 1 FROM cockpit.organization_reporting_requests q WHERE q.org_id=p_org AND q.kind='expense' AND q.operation='create' AND q.record_id=p_expense;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECORD_NOT_OWNED' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM cockpit.expenses WHERE id=p_expense AND organization_id=p_org AND (m.driver_id IS NULL OR driver_id=m.driver_id) FOR UPDATE;
 IF NOT FOUND OR e.driver_id IS NULL THEN RAISE EXCEPTION 'RECORD_NOT_OWNED' USING ERRCODE='42501'; END IF;
 revision:=encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex');
 SELECT * INTO proof FROM cockpit.organization_verified_receipts WHERE org_id=p_org AND expense_id=e.id;
 IF p_op='read' THEN
  IF proof.expense_id IS NULL OR proof.driver_id IS DISTINCT FROM e.driver_id OR proof.object_path IS DISTINCT FROM e.receipt_storage_path OR proof.mime_type IS DISTINCT FROM e.receipt_mime_type THEN RAISE EXCEPTION 'EVIDENCE_NOT_VERIFIED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('expenseId',e.id,'driverId',e.driver_id,'path',proof.object_path,'sha256',proof.sha256,'size',proof.byte_size,'mime',proof.mime_type,'revision',revision);
 END IF;
 IF p_op IS NULL OR p_op NOT IN ('prepare','attach') THEN RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE='22023'; END IF;
 IF p_op='prepare' THEN
  IF e.status NOT IN ('draft','보완 필요') OR e.receipt_storage_path IS NOT NULL OR proof.expense_id IS NOT NULL THEN RAISE EXCEPTION 'EVIDENCE_IMMUTABLE' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('expenseId',e.id,'driverId',e.driver_id,'revision',revision);
 END IF;
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_evidence) k WHERE k NOT IN ('path','sha256','size','mime','revision')) THEN RAISE EXCEPTION 'INVALID_EVIDENCE' USING ERRCODE='22023'; END IF;
 path_value:=p_evidence->>'path';digest_value:=p_evidence->>'sha256';mime_value:=p_evidence->>'mime';size_value:=(p_evidence->>'size')::integer;
 ext:=CASE mime_value WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'application/pdf' THEN 'pdf' END;
 IF NOT cockpit.tenant_receipt_path_valid_v1(p_org,e.driver_id,path_value) OR digest_value IS NULL OR digest_value!~'^[0-9a-f]{64}$'
  OR ext IS NULL OR split_part(path_value,'/',7) IS DISTINCT FROM digest_value||'.'||ext OR size_value IS NULL OR size_value NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'INVALID_EVIDENCE' USING ERRCODE='22023'; END IF;
 -- An exact replay is harmless even if the record has subsequently been submitted.
 IF proof.expense_id IS NOT NULL THEN
  IF proof.driver_id=e.driver_id AND proof.object_path=path_value AND proof.sha256=digest_value AND proof.mime_type=mime_value AND proof.byte_size=size_value
   AND e.receipt_storage_path=path_value AND e.receipt_mime_type=mime_value THEN RETURN jsonb_build_object('expenseId',e.id,'attached',true); END IF;
  RAISE EXCEPTION 'EVIDENCE_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 IF e.status NOT IN ('draft','보완 필요') OR e.receipt_storage_path IS NOT NULL THEN RAISE EXCEPTION 'EVIDENCE_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF revision IS DISTINCT FROM p_evidence->>'revision' THEN RAISE EXCEPTION 'RECORD_CHANGED' USING ERRCODE='40001'; END IF;
 IF cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO cockpit.organization_verified_receipts(org_id,expense_id,driver_id,object_path,sha256,byte_size,mime_type,verified_by)
 VALUES(p_org,e.id,e.driver_id,path_value,digest_value,size_value,mime_value,p_user);
 UPDATE cockpit.expenses SET receipt_storage_path=path_value,receipt_mime_type=mime_value,has_receipt_image=true,updated_at=clock_timestamp(),
 audit_history=jsonb_build_array(jsonb_build_object('actorId',p_user,'at',clock_timestamp(),'actionType','receipt_verified'))||coalesce(audit_history,'[]'::jsonb)
 WHERE id=e.id AND organization_id=p_org;
 RETURN jsonb_build_object('expenseId',e.id,'attached',true);
END;
$$;
-- Existing VIP rows are unaffected. Candidate approvals must use verified
-- receipt metadata; Hi-Pass approval is intentionally held for its own gate.
CREATE FUNCTION cockpit.guard_tenant_receipt_approval_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.status='승인 완료' AND EXISTS(SELECT 1 FROM cockpit.organization_reporting_requests q WHERE q.org_id=NEW.organization_id AND q.kind='expense' AND q.operation='create' AND q.record_id=NEW.id) THEN
  IF NOT EXISTS(SELECT 1 FROM cockpit.organization_verified_receipts r WHERE r.org_id=NEW.organization_id AND r.expense_id=NEW.id AND r.driver_id=NEW.driver_id AND r.object_path=NEW.receipt_storage_path AND r.mime_type=NEW.receipt_mime_type) THEN RAISE EXCEPTION 'EVIDENCE_NOT_VERIFIED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER tenant_receipt_approval_v1 BEFORE UPDATE ON cockpit.expenses FOR EACH ROW EXECUTE FUNCTION cockpit.guard_tenant_receipt_approval_v1();
REVOKE ALL ON FUNCTION cockpit.tenant_receipt_v1(text,uuid,uuid,uuid,text,jsonb),cockpit.guard_tenant_receipt_approval_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.tenant_receipt_v1(text,uuid,uuid,uuid,text,jsonb),cockpit.guard_tenant_receipt_approval_v1() TO service_role;
COMMIT;
