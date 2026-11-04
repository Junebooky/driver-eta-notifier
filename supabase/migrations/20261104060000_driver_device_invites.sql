-- Reviewed deployment only. Uses existing master UUIDs; never creates auth users/drivers.
CREATE TABLE IF NOT EXISTS cockpit.report_driver_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id text NOT NULL,driver_id uuid NOT NULL REFERENCES cockpit.drivers(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64), created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 used_at timestamptz,revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS cockpit.report_driver_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id text NOT NULL,driver_id uuid NOT NULL REFERENCES cockpit.drivers(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),label text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',absolute_expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS report_devices_driver ON cockpit.report_driver_devices(org_id,driver_id);
ALTER TABLE cockpit.report_driver_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.report_driver_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.report_driver_invites,cockpit.report_driver_devices FROM PUBLIC,anon,authenticated;
GRANT ALL ON cockpit.report_driver_invites,cockpit.report_driver_devices TO service_role;
CREATE OR REPLACE FUNCTION cockpit.report_driver_active(p_org text,p_driver uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
 SELECT EXISTS(SELECT 1 FROM cockpit.drivers d WHERE d.id=p_driver
 AND coalesce(to_jsonb(d)->>'organization_id',d.driver_meta->>'organization_id','vip_limousine_korea')=p_org
 AND coalesce(d.driver_meta->>'status','active') NOT IN ('inactive','retired','disabled','퇴사','비활성'))
$$;
CREATE OR REPLACE FUNCTION cockpit.issue_report_invite(p_org text,p_driver uuid,p_actor uuid,p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE result uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org||p_driver::text,3));
 IF NOT cockpit.report_driver_active(p_org,p_driver) THEN RAISE EXCEPTION 'driver unavailable' USING ERRCODE='42501'; END IF;
 UPDATE cockpit.report_driver_invites SET revoked_at=now() WHERE org_id=p_org AND driver_id=p_driver AND used_at IS NULL AND revoked_at IS NULL;
 INSERT INTO cockpit.report_driver_invites(org_id,driver_id,created_by,token_hash) VALUES(p_org,p_driver,p_actor,p_hash) RETURNING id INTO result;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES(p_org,p_actor,'invite_issued',jsonb_build_object('driver',p_driver,'invite',result));
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION cockpit.redeem_report_invite(p_hash text,p_device_hash text,p_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE i cockpit.report_driver_invites; device uuid;
BEGIN
 SELECT * INTO i FROM cockpit.report_driver_invites WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR i.used_at IS NOT NULL OR i.revoked_at IS NOT NULL OR i.expires_at<=now() OR NOT cockpit.report_driver_active(i.org_id,i.driver_id) OR (i.requires_auth_link AND (cockpit.report_auth_link_state(i.driver_id)->>'count')::integer<>1) THEN RETURN NULL; END IF;
 UPDATE cockpit.report_driver_invites SET used_at=now() WHERE id=i.id;
 INSERT INTO cockpit.report_driver_devices(org_id,driver_id,token_hash,label) VALUES(i.org_id,i.driver_id,p_device_hash,left(p_label,80)) RETURNING id INTO device;
 RETURN jsonb_build_object('device',device,'driver',i.driver_id);
END $$;
CREATE OR REPLACE FUNCTION cockpit.verify_report_device(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE s cockpit.report_driver_devices; d cockpit.drivers;
BEGIN
 SELECT * INTO s FROM cockpit.report_driver_devices WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR s.absolute_expires_at<=now() OR NOT cockpit.report_driver_active(s.org_id,s.driver_id) OR (s.requires_auth_link AND (cockpit.report_auth_link_state(s.driver_id)->>'count')::integer<>1) THEN RETURN NULL; END IF;
 SELECT * INTO d FROM cockpit.drivers WHERE id=s.driver_id;
 UPDATE cockpit.report_driver_devices SET last_seen_at=now(),expires_at=least(now()+interval '7 days',absolute_expires_at) WHERE id=s.id RETURNING * INTO s;
 RETURN jsonb_build_object('userId',s.driver_id,'driverId',s.driver_id,'driverName',d.driver_name,'displayName',d.driver_name,'org',s.org_id,'role','driver','reportDevice',true,'sessionId',s.id,'issuedAt',extract(epoch FROM s.created_at)::bigint,'expiresAt',extract(epoch FROM s.expires_at)::bigint);
END $$;
CREATE OR REPLACE FUNCTION cockpit.revoke_report_devices(p_org text,p_driver uuid,p_actor uuid,p_device uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
BEGIN
 UPDATE cockpit.report_driver_devices SET revoked_at=now() WHERE org_id=p_org AND driver_id=p_driver AND (p_device IS NULL OR id=p_device);
 IF p_device IS NULL THEN UPDATE cockpit.report_driver_invites SET revoked_at=now() WHERE org_id=p_org AND driver_id=p_driver AND revoked_at IS NULL; END IF;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES(p_org,p_actor,'device_revoked',jsonb_build_object('driver',p_driver,'device',p_device));
END $$;
CREATE OR REPLACE FUNCTION cockpit.invalidate_inactive_report_driver() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
BEGIN
 IF coalesce(NEW.driver_meta->>'status','active') IN ('inactive','retired','disabled','퇴사','비활성') THEN
 UPDATE cockpit.report_driver_devices SET revoked_at=now() WHERE driver_id=NEW.id AND revoked_at IS NULL;
 UPDATE cockpit.report_driver_invites SET revoked_at=now() WHERE driver_id=NEW.id AND revoked_at IS NULL;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS report_driver_disabled ON cockpit.drivers;
CREATE TRIGGER report_driver_disabled AFTER UPDATE OF driver_meta ON cockpit.drivers FOR EACH ROW EXECUTE FUNCTION cockpit.invalidate_inactive_report_driver();
REVOKE ALL ON FUNCTION cockpit.report_driver_active(text,uuid),cockpit.issue_report_invite(text,uuid,uuid,text),cockpit.redeem_report_invite(text,text,text),cockpit.verify_report_device(text),cockpit.revoke_report_devices(text,uuid,uuid,uuid),cockpit.invalidate_inactive_report_driver() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.report_driver_active(text,uuid),cockpit.issue_report_invite(text,uuid,uuid,text),cockpit.redeem_report_invite(text,text,text),cockpit.verify_report_device(text),cockpit.revoke_report_devices(text,uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION cockpit.replace_report_device(p_hash text,p_device_hash text,p_label text,p_old_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE result jsonb;
BEGIN
 result:=cockpit.redeem_report_invite(p_hash,p_device_hash,p_label);
 IF result IS NOT NULL AND p_old_hash IS NOT NULL THEN UPDATE cockpit.report_driver_devices SET revoked_at=now() WHERE token_hash=p_old_hash; END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION cockpit.replace_report_device(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.replace_report_device(text,text,text,text) TO service_role;
ALTER TABLE cockpit.report_driver_invites ADD COLUMN IF NOT EXISTS requires_auth_link boolean NOT NULL DEFAULT false;
ALTER TABLE cockpit.report_driver_devices ADD COLUMN IF NOT EXISTS requires_auth_link boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION cockpit.report_auth_link_state(p_driver uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE amount integer:=0;denied boolean:=false;
BEGIN
 IF to_regclass('auth.users') IS NOT NULL THEN
 EXECUTE 'SELECT count(*),coalesce(bool_or(coalesce((raw_app_meta_data->>''disabled'')::boolean,false) OR raw_app_meta_data->>''cockpit_role'' IS DISTINCT FROM ''driver''),false) FROM auth.users WHERE raw_app_meta_data->>''driver_id''=$1' INTO amount,denied USING p_driver::text;
 END IF;
 RETURN jsonb_build_object('count',amount,'allowed',amount<=1 AND NOT denied);
END $$;
CREATE OR REPLACE FUNCTION cockpit.report_driver_active(p_org text,p_driver uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
 SELECT EXISTS(SELECT 1 FROM cockpit.drivers d WHERE d.id=p_driver
 AND coalesce(to_jsonb(d)->>'organization_id',d.driver_meta->>'organization_id','vip_limousine_korea')=p_org
 AND coalesce(d.driver_meta->>'status','active') NOT IN ('inactive','retired','disabled','퇴사','비활성'))
 AND (cockpit.report_auth_link_state(p_driver)->>'allowed')::boolean
$$;
-- Preserve whether an existing personal Auth binding was required at issuance.
CREATE OR REPLACE FUNCTION cockpit.remember_report_auth_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
BEGIN
 NEW.requires_auth_link:=(cockpit.report_auth_link_state(NEW.driver_id)->>'count')::integer>0;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS report_invite_auth_binding ON cockpit.report_driver_invites;
CREATE TRIGGER report_invite_auth_binding BEFORE INSERT ON cockpit.report_driver_invites FOR EACH ROW EXECUTE FUNCTION cockpit.remember_report_auth_link();
DROP TRIGGER IF EXISTS report_device_auth_binding ON cockpit.report_driver_devices;
CREATE TRIGGER report_device_auth_binding BEFORE INSERT ON cockpit.report_driver_devices FOR EACH ROW EXECUTE FUNCTION cockpit.remember_report_auth_link();
REVOKE ALL ON FUNCTION cockpit.report_auth_link_state(uuid),cockpit.remember_report_auth_link() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.report_auth_link_state(uuid) TO service_role;
