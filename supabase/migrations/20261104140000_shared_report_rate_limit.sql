-- Shared report link only. No changes to cockpit.drivers or personal Auth.
-- Required for /api/public-report without applying the optional driver invite migration.
CREATE TABLE IF NOT EXISTS cockpit.report_link_attempts(
  bucket text PRIMARY KEY CHECK(length(bucket)=64),
  hits integer NOT NULL,
  window_start timestamptz NOT NULL
);
ALTER TABLE cockpit.report_link_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.report_link_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON cockpit.report_link_attempts TO service_role;
CREATE OR REPLACE FUNCTION cockpit.allow_report_link_attempt(p_bucket text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE amount integer;
BEGIN
  IF p_bucket IS NULL OR p_bucket !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  DELETE FROM cockpit.report_link_attempts WHERE window_start<now()-interval '1 day';
  INSERT INTO cockpit.report_link_attempts VALUES(p_bucket,1,now())
  ON CONFLICT(bucket) DO UPDATE SET
    hits=CASE WHEN report_link_attempts.window_start<now()-interval '1 minute' THEN 1 ELSE report_link_attempts.hits+1 END,
    window_start=CASE WHEN report_link_attempts.window_start<now()-interval '1 minute' THEN now() ELSE report_link_attempts.window_start END
  RETURNING hits INTO amount;
  RETURN amount<=60;
END $$;
REVOKE ALL ON FUNCTION cockpit.allow_report_link_attempt(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.allow_report_link_attempt(text) TO service_role;
