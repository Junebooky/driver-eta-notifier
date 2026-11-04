-- HQ can reopen existing shared links without storing their raw token.
-- The encrypted token is server-only; all original hashes and active links remain valid.
ALTER TABLE cockpit.report_shared_links ADD COLUMN IF NOT EXISTS sealed_token text;
CREATE TABLE IF NOT EXISTS cockpit.report_hq_seen(
 org_id text NOT NULL,
 actor_id uuid NOT NULL,
 submission_id uuid NOT NULL REFERENCES cockpit.report_submissions(id),
 seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,actor_id,submission_id)
);
ALTER TABLE cockpit.report_hq_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.report_hq_seen FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON cockpit.report_hq_seen TO service_role;
CREATE INDEX IF NOT EXISTS report_audit_applied_today
 ON cockpit.report_audit(org_id,created_at DESC,submission_id)
 WHERE action='workbook_committed';

CREATE OR REPLACE FUNCTION cockpit.manage_report_shared_link_secure(
 p_org text,p_actor uuid,p_action text,p_hash text,p_expires timestamptz,p_sealed text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,cockpit AS $$
BEGIN
 IF p_org IS NULL OR p_org='' OR p_actor IS NULL THEN RAISE EXCEPTION 'invalid issuer'; END IF;
 IF p_action IN ('issue','remember') THEN
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
   OR p_sealed IS NULL OR length(p_sealed)>500
   OR p_sealed !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  THEN RAISE EXCEPTION 'invalid protected link'; END IF;
 END IF;
 IF p_action='issue' THEN
  IF p_expires IS NULL OR p_expires<=now() THEN RAISE EXCEPTION 'invalid expiration'; END IF;
  INSERT INTO cockpit.report_shared_links(org_id,token_hash,issued_by,issued_at,expires_at,revoked_at,sealed_token)
   VALUES(p_org,p_hash,p_actor,now(),p_expires,NULL,p_sealed)
   ON CONFLICT(org_id) DO UPDATE SET
    token_hash=EXCLUDED.token_hash,
    issued_by=EXCLUDED.issued_by,
    issued_at=now(),
    expires_at=EXCLUDED.expires_at,
    revoked_at=NULL,
    sealed_token=EXCLUDED.sealed_token;
 ELSIF p_action='remember' THEN
  UPDATE cockpit.report_shared_links SET sealed_token=p_sealed
   WHERE org_id=p_org AND token_hash=p_hash AND revoked_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'link does not match active link'; END IF;
 ELSIF p_action='revoke' THEN
  UPDATE cockpit.report_shared_links SET revoked_at=now(),sealed_token=NULL WHERE org_id=p_org;
 ELSE RAISE EXCEPTION 'unsupported shared link action';
 END IF;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail)
  VALUES(p_org,p_actor,'shared_report_link_'||p_action,jsonb_build_object('expiry',p_expires));
END $$;
REVOKE ALL ON FUNCTION cockpit.manage_report_shared_link_secure(text,uuid,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.manage_report_shared_link_secure(text,uuid,text,text,timestamptz,text) TO service_role;

-- This counter tracks Excel commits TODAY in the Korean timezone, not the
-- driver's reported service date. A newly corrected/committed report counts
-- again if it was viewed before the latest Excel application.
CREATE OR REPLACE FUNCTION cockpit.unread_applied_reports(p_org text,p_actor uuid)
RETURNS TABLE(submission_id uuid) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,cockpit AS $$
 WITH latest_commit AS (
  SELECT a.submission_id,max(a.created_at) AS applied_at
  FROM cockpit.report_audit a JOIN cockpit.report_submissions s
   ON s.id=a.submission_id AND s.org_id=a.org_id AND s.excel_status='applied'
  WHERE a.org_id=p_org AND a.action='workbook_committed'
   AND a.created_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
  GROUP BY a.submission_id
 )
 SELECT latest_commit.submission_id FROM latest_commit
 LEFT JOIN cockpit.report_hq_seen v ON v.org_id=p_org
  AND v.actor_id=p_actor AND v.submission_id=latest_commit.submission_id
 WHERE v.seen_at IS NULL OR v.seen_at < latest_commit.applied_at;
$$;
REVOKE ALL ON FUNCTION cockpit.unread_applied_reports(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.unread_applied_reports(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION cockpit.mark_report_hq_seen(p_org text,p_actor uuid,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,cockpit AS $$
BEGIN
 IF p_org IS NULL OR p_actor IS NULL OR p_id IS NULL THEN RETURN false; END IF;
 INSERT INTO cockpit.report_hq_seen(org_id,actor_id,submission_id,seen_at)
 SELECT p_org,p_actor,id,now() FROM cockpit.report_submissions
 WHERE org_id=p_org AND id=p_id
 ON CONFLICT(org_id,actor_id,submission_id) DO UPDATE SET seen_at=EXCLUDED.seen_at;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION cockpit.mark_report_hq_seen(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.mark_report_hq_seen(text,uuid,uuid) TO service_role;
