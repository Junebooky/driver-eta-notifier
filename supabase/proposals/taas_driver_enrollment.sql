-- REVIEW ONLY. No live migration. Existing Auth, report devices, users and histories unchanged.
BEGIN;
CREATE TABLE cockpit.organization_driver_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id text NOT NULL REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
 driver_id uuid NOT NULL,
 email text NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 issued_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 revoked_at timestamptz,
 redeemed_by uuid,
 CHECK(expires_at>created_at),
 CHECK((used_at IS NULL)=(redeemed_by IS NULL))
);
CREATE INDEX organization_driver_invites_scope_idx ON cockpit.organization_driver_invites(org_id,driver_id);
ALTER TABLE cockpit.organization_driver_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.organization_driver_invites FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cockpit.organization_driver_invites TO service_role;

-- Shared actor check for enrollment operations; no privilege elevation.
CREATE FUNCTION cockpit.assert_enrollment_actor_v1(p_org text,p_user uuid,p_session uuid,p_admin boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user<>'service_role' OR p_org IS NULL OR p_user IS NULL OR p_session IS NULL THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
 PERFORM 1 FROM cockpit.organizations WHERE id=p_org AND status='active' AND runtime_enabled FOR SHARE;
 IF NOT FOUND OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_admin THEN
  PERFORM 1 FROM cockpit.organization_members WHERE org_id=p_org AND user_id=p_user AND status='active'
   AND role IN ('company_owner','company_admin') AND driver_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
END;
$$;

CREATE FUNCTION cockpit.issue_tenant_driver_invite_v1(p_org text,p_user uuid,p_session uuid,p_driver uuid,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target_email text; invitation cockpit.organization_driver_invites;
BEGIN
 PERFORM cockpit.assert_enrollment_actor_v1(p_org,p_user,p_session,true);
 IF p_hash IS NULL OR p_hash!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_INVITE' USING ERRCODE='22023'; END IF;
 SELECT lower(btrim(driver_meta->>'enrollment_email')) INTO target_email FROM cockpit.drivers
  WHERE id=p_driver AND org_id=p_org AND driver_meta->>'status'='active' FOR UPDATE;
 IF NOT FOUND OR target_email IS NULL OR length(target_email)>254 OR target_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'DRIVER_NOT_ELIGIBLE' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM cockpit.organization_members WHERE driver_id=p_driver) THEN
  RAISE EXCEPTION 'DRIVER_ALREADY_LINKED' USING ERRCODE='23505';
 END IF;
 UPDATE cockpit.organization_driver_invites SET revoked_at=clock_timestamp()
  WHERE org_id=p_org AND driver_id=p_driver AND used_at IS NULL AND revoked_at IS NULL;
 INSERT INTO cockpit.organization_driver_invites(org_id,driver_id,email,token_hash,issued_by,expires_at)
  VALUES(p_org,p_driver,target_email,p_hash,p_user,clock_timestamp()+interval '24 hours') RETURNING * INTO invitation;
 RETURN jsonb_build_object('id',invitation.id,'expires_at',invitation.expires_at);
END;
$$;

-- The server must first verify the user's access JWT with Supabase Auth.
-- p_email is that verified provider email, NEVER a browser supplied email.
-- No existing auth metadata or user credentials are changed.
CREATE FUNCTION cockpit.redeem_tenant_driver_invite_v1(p_org text,p_user uuid,p_session uuid,p_email text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE invitation cockpit.organization_driver_invites; current_email text;
BEGIN
 PERFORM cockpit.assert_enrollment_actor_v1(p_org,p_user,p_session,false);
 SELECT * INTO invitation FROM cockpit.organization_driver_invites
  WHERE org_id=p_org AND token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR invitation.revoked_at IS NOT NULL OR invitation.used_at IS NOT NULL
  OR invitation.expires_at<=clock_timestamp() OR invitation.email IS DISTINCT FROM lower(btrim(p_email)) THEN
  RAISE EXCEPTION 'INVITE_NOT_AVAILABLE' USING ERRCODE='42501';
 END IF;
 SELECT lower(btrim(driver_meta->>'enrollment_email')) INTO current_email FROM cockpit.drivers
  WHERE id=invitation.driver_id AND org_id=p_org AND driver_meta->>'status'='active' FOR UPDATE;
 IF NOT FOUND OR current_email IS DISTINCT FROM invitation.email THEN
  RAISE EXCEPTION 'INVITE_NOT_AVAILABLE' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM cockpit.organization_members WHERE (org_id=p_org AND user_id=p_user) OR driver_id=invitation.driver_id) THEN
  RAISE EXCEPTION 'MEMBERSHIP_ALREADY_EXISTS' USING ERRCODE='23505';
 END IF;
 INSERT INTO cockpit.organization_members(org_id,user_id,role,status,driver_id)
  VALUES(p_org,p_user,'driver','pending',invitation.driver_id);
 UPDATE cockpit.organization_driver_invites SET used_at=clock_timestamp(),redeemed_by=p_user WHERE id=invitation.id;
 RETURN jsonb_build_object('driver_id',invitation.driver_id,'status','pending');
END;
$$;

-- Approve/revoke only the existing tenant driver membership. Revoke never
-- deletes a shared Auth account or historical rows, or changes other memberships.
CREATE FUNCTION cockpit.set_tenant_driver_membership_v1(p_org text,p_user uuid,p_session uuid,p_driver uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m cockpit.organization_members; result_status text; current_email text;
BEGIN
 PERFORM cockpit.assert_enrollment_actor_v1(p_org,p_user,p_session,true);
 IF p_action IS NULL OR p_action NOT IN ('approve','revoke','deactivate') THEN RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE='22023'; END IF;
 SELECT lower(btrim(driver_meta->>'enrollment_email')) INTO current_email FROM cockpit.drivers WHERE id=p_driver AND org_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM cockpit.organization_members WHERE org_id=p_org AND driver_id=p_driver AND role='driver' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF p_action='approve' THEN
  IF m.status<>'pending' OR NOT EXISTS(SELECT 1 FROM cockpit.drivers WHERE id=p_driver AND org_id=p_org AND driver_meta->>'status'='active')
    OR NOT EXISTS(SELECT 1 FROM cockpit.organization_driver_invites i WHERE i.org_id=p_org AND i.driver_id=p_driver AND i.redeemed_by=m.user_id AND i.used_at IS NOT NULL AND i.revoked_at IS NULL AND i.email=current_email) THEN
   RAISE EXCEPTION 'MEMBERSHIP_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;
  result_status:='active';
 ELSE
  result_status:='revoked';
  IF p_action='deactivate' THEN
   -- Refuse profile deactivation while a future/open active dispatch or
   -- unreturned vehicle exists. Access revocation is separately available.
   IF EXISTS(SELECT 1 FROM cockpit.schedules s WHERE s.driver_id=p_driver AND cockpit.dispatch_is_active(s) AND cockpit.dispatch_end(s)>clock_timestamp())
     OR EXISTS(SELECT 1 FROM cockpit.vehicle_custodies c WHERE c.driver_id=p_driver AND c.returned_at IS NULL) THEN
    RAISE EXCEPTION 'DRIVER_HAS_ACTIVE_ASSIGNMENTS' USING ERRCODE='23P01';
   END IF;
   UPDATE cockpit.drivers SET driver_meta=coalesce(driver_meta,'{}'::jsonb)||jsonb_build_object('status','inactive')
    WHERE id=p_driver AND org_id=p_org;
  END IF;
  UPDATE cockpit.organization_driver_invites SET revoked_at=clock_timestamp() WHERE org_id=p_org AND driver_id=p_driver AND revoked_at IS NULL;
 END IF;
 UPDATE cockpit.organization_members SET status=result_status WHERE org_id=p_org AND user_id=m.user_id AND driver_id=p_driver;
 RETURN jsonb_build_object('driver_id',p_driver,'status',result_status);
END;
$$;
REVOKE ALL ON FUNCTION cockpit.assert_enrollment_actor_v1(text,uuid,uuid,boolean),cockpit.issue_tenant_driver_invite_v1(text,uuid,uuid,uuid,text),cockpit.redeem_tenant_driver_invite_v1(text,uuid,uuid,text,text),cockpit.set_tenant_driver_membership_v1(text,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.assert_enrollment_actor_v1(text,uuid,uuid,boolean),cockpit.issue_tenant_driver_invite_v1(text,uuid,uuid,uuid,text),cockpit.redeem_tenant_driver_invite_v1(text,uuid,uuid,text,text),cockpit.set_tenant_driver_membership_v1(text,uuid,uuid,uuid,text) TO service_role;
COMMIT;
