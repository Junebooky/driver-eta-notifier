-- Additive follow-up for existing PR #46 installations; no file migration or deletion.



CREATE OR REPLACE FUNCTION cockpit.issue_report_invite(p_org text,p_driver uuid,p_actor uuid,p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE result uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org||p_driver::text,3));
 IF NOT cockpit.report_driver_active(p_org,p_driver) THEN RAISE EXCEPTION 'driver unavailable' USING ERRCODE='42501'; END IF;
 UPDATE cockpit.report_driver_invites SET revoked_at=now() WHERE org_id=p_org AND driver_id=p_driver AND used_at IS NULL AND revoked_at IS NULL;
 UPDATE cockpit.report_driver_devices SET revoked_at=now() WHERE org_id=p_org AND driver_id=p_driver AND revoked_at IS NULL;
 INSERT INTO cockpit.report_driver_invites(org_id,driver_id,created_by,token_hash) VALUES(p_org,p_driver,p_actor,p_hash) RETURNING id INTO result;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES(p_org,p_actor,'invite_issued',jsonb_build_object('driver',p_driver,'invite',result));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION cockpit.report_auth_link_state(p_driver uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE amount integer:=0;denied boolean:=false;
BEGIN
 IF to_regclass('auth.users') IS NOT NULL THEN
 EXECUTE 'SELECT count(*),coalesce(bool_or(coalesce((raw_app_meta_data->>''disabled'')::boolean,false) OR coalesce((raw_app_meta_data->>''require_mfa'')::boolean,false) OR raw_app_meta_data->>''cockpit_role'' IS DISTINCT FROM ''driver'' OR raw_app_meta_data->>''org'' IS DISTINCT FROM ''vip_limousine_korea''),false) FROM auth.users WHERE raw_app_meta_data->>''driver_id''=$1' INTO amount,denied USING p_driver::text;
 END IF;
 RETURN jsonb_build_object('count',amount,'allowed',amount<=1 AND NOT denied);
END $$;

