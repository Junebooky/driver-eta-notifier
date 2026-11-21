-- PROPOSAL ONLY: validate on an isolated Supabase database before owner-approved release.
-- No user accounts are created and no existing driver identities are rewritten.
BEGIN;
CREATE TABLE IF NOT EXISTS cockpit.auth_login_attempts (
  subject_key text PRIMARY KEY CHECK (subject_key ~ '^(email|ip):[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
CREATE TABLE IF NOT EXISTS cockpit.revoked_auth_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cockpit.auth_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.revoked_auth_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.auth_login_attempts,cockpit.revoked_auth_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON cockpit.auth_login_attempts,cockpit.revoked_auth_sessions TO service_role;
-- Driver directory/profile access goes through UUID-authorized server routes.
REVOKE ALL ON cockpit.drivers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON cockpit.drivers TO service_role;

CREATE OR REPLACE FUNCTION cockpit.consume_auth_login_attempt(p_keys text[])
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; n integer; t timestamptz; maximum integer;
BEGIN
  IF cardinality(p_keys) <> 2 THEN RAISE EXCEPTION 'INVALID_KEYS' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(748201,11);
  FOREACH k IN ARRAY p_keys LOOP
    IF k !~ '^(email|ip):[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_KEY' USING ERRCODE='22023'; END IF;
    maximum := CASE WHEN k LIKE 'email:%' THEN 8 ELSE 100 END;
    SELECT attempts,window_started_at INTO n,t FROM cockpit.auth_login_attempts WHERE subject_key=k FOR UPDATE;
    IF FOUND AND t > now()-interval '15 minutes' AND n >= maximum THEN RETURN false; END IF;
  END LOOP;
  FOREACH k IN ARRAY p_keys LOOP
    INSERT INTO cockpit.auth_login_attempts VALUES(k,now(),1)
    ON CONFLICT(subject_key) DO UPDATE SET
      attempts=CASE WHEN cockpit.auth_login_attempts.window_started_at <= now()-interval '15 minutes' THEN 1 ELSE cockpit.auth_login_attempts.attempts+1 END,
      window_started_at=CASE WHEN cockpit.auth_login_attempts.window_started_at <= now()-interval '15 minutes' THEN now() ELSE cockpit.auth_login_attempts.window_started_at END;
  END LOOP;
  RETURN true;
END $$;

-- Only this narrow, service-only function reads Auth's private session table.
CREATE OR REPLACE FUNCTION cockpit.is_active_auth_session(p_session_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=p_session_id AND s.user_id=p_user_id
    AND (s.not_after IS NULL OR s.not_after>now()))
    AND NOT EXISTS(SELECT 1 FROM cockpit.revoked_auth_sessions r WHERE r.session_id=p_session_id);
$$;
REVOKE EXECUTE ON FUNCTION cockpit.consume_auth_login_attempt(text[]),cockpit.is_active_auth_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.consume_auth_login_attempt(text[]),cockpit.is_active_auth_session(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION cockpit.update_driver_profile_by_id(p_driver_id uuid,p_patch jsonb,p_preferences jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d cockpit.drivers;
BEGIN
  IF jsonb_typeof(p_patch) <> 'object' OR jsonb_typeof(p_preferences) <> 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('driver_name','phone','default_navi','passenger_name'))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_preferences) k WHERE k NOT IN ('homeLocation','presetOrder')) THEN
    RAISE EXCEPTION 'INVALID_PROFILE_PATCH' USING ERRCODE='22023';
  END IF;
  SELECT * INTO d FROM cockpit.drivers WHERE id=p_driver_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  UPDATE cockpit.drivers SET
    driver_name=CASE WHEN p_patch ? 'driver_name' THEN p_patch->>'driver_name' ELSE driver_name END,
    phone=CASE WHEN p_patch ? 'phone' THEN p_patch->>'phone' ELSE phone END,
    default_navi=CASE WHEN p_patch ? 'default_navi' THEN p_patch->>'default_navi' ELSE default_navi END,
    passenger_name=CASE WHEN p_patch ? 'passenger_name' THEN p_patch->>'passenger_name' ELSE passenger_name END,
    driver_meta=(CASE WHEN jsonb_typeof(driver_meta)='object' THEN driver_meta ELSE '{}'::jsonb END)||p_preferences
  WHERE id=p_driver_id RETURNING * INTO d;
  RETURN to_jsonb(d);
END $$;
REVOKE EXECUTE ON FUNCTION cockpit.update_driver_profile_by_id(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.update_driver_profile_by_id(uuid,jsonb,jsonb) TO service_role;
COMMIT;
