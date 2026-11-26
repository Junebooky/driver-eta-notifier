-- REVIEW ONLY. Reuse existing organization_features. No new table or live changes.
BEGIN;
CREATE FUNCTION cockpit.tenant_feature_policy_v1(p_org text,p_user uuid,p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m cockpit.organization_members;
BEGIN
 IF current_user<>'service_role' OR p_org IS NULL OR p_user IS NULL OR p_session IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
 PERFORM 1 FROM cockpit.organizations WHERE id=p_org AND status='active' AND runtime_enabled FOR SHARE;
 IF NOT FOUND OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM cockpit.organization_members WHERE org_id=p_org AND user_id=p_user AND status='active' FOR SHARE;
 IF NOT FOUND OR m.role NOT IN ('company_owner','company_admin','driver') OR
 (m.role='driver' AND m.driver_id IS NULL) OR (m.role<>'driver' AND m.driver_id IS NOT NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF m.role='driver' THEN
  PERFORM 1 FROM cockpit.drivers WHERE id=m.driver_id AND org_id=p_org AND driver_meta->>'status'='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN jsonb_build_object('orgId',p_org,'userId',p_user,'sessionId',p_session,'role',m.role,'driverId',m.driver_id,
  'legacyReportExcel',p_org='vip_limousine_korea' AND EXISTS(SELECT 1 FROM cockpit.organization_features WHERE org_id=p_org AND feature_key='legacy_report_excel' AND enabled));
END;
$$;
REVOKE ALL ON FUNCTION cockpit.tenant_feature_policy_v1(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.tenant_feature_policy_v1(text,uuid,uuid) TO service_role;
COMMIT;
