-- Optional no-login, submit-only shared report link.
-- Apply only to a reviewed isolated test database before operational approval.
CREATE TABLE IF NOT EXISTS cockpit.report_shared_links (
  org_id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64),
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
ALTER TABLE cockpit.report_shared_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.report_shared_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON cockpit.report_shared_links TO service_role;

-- The HQ-only server endpoint invokes this as service_role after verifying an HQ session.
-- Both the credential rotation and its audit entry commit in one transaction.
CREATE OR REPLACE FUNCTION cockpit.manage_report_shared_link(
  p_org text,p_actor uuid,p_action text,p_hash text,p_expires timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
BEGIN
  IF p_action='issue' THEN
    IF p_hash IS NULL OR length(p_hash)<>64 OR p_hash !~ '^[0-9a-f]{64}$'
       OR p_expires IS NULL OR p_expires<=now() THEN
      RAISE EXCEPTION 'invalid shared report link';
    END IF;
    INSERT INTO cockpit.report_shared_links(org_id,token_hash,issued_by,issued_at,expires_at,revoked_at)
    VALUES(p_org,p_hash,p_actor,now(),p_expires,NULL)
    ON CONFLICT(org_id) DO UPDATE SET
      token_hash=EXCLUDED.token_hash,
      issued_by=EXCLUDED.issued_by,
      issued_at=now(),
      expires_at=EXCLUDED.expires_at,
      revoked_at=NULL;
  ELSIF p_action='revoke' THEN
    UPDATE cockpit.report_shared_links SET revoked_at=now() WHERE org_id=p_org;
  ELSE
    RAISE EXCEPTION 'unsupported shared report link action';
  END IF;
  INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail)
  VALUES(p_org,p_actor,'shared_report_link_'||p_action,jsonb_build_object('expiry',p_expires));
END $$;
REVOKE ALL ON FUNCTION cockpit.manage_report_shared_link(text,uuid,text,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.manage_report_shared_link(text,uuid,text,text,timestamptz)
  TO service_role;
