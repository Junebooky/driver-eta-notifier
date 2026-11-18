-- HQ-only optimistic-lock commits for manual blank rows and custom columns M-Z.
-- Never shifts or changes auto-generated A-L report references. Each edit creates
-- a new immutable workbook version and an audit event.
CREATE OR REPLACE FUNCTION cockpit.commit_report_hq_sheet_change(
 p_org text,p_actor uuid,p_year integer,p_expected uuid,p_storage jsonb,
 p_sheet text,p_action text,p_row integer DEFAULT NULL,p_column text DEFAULT NULL,p_label text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,cockpit AS $$
DECLARE ledger cockpit.report_ledgers; prior_manifest jsonb; next_version uuid;
BEGIN
 IF p_org IS NULL OR length(p_org)=0 OR p_actor IS NULL OR p_expected IS NULL
  OR p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2099
  OR p_sheet IS NULL OR p_sheet !~ '^(1[0-2]|[1-9])월$'
  OR p_action IS NULL OR p_action NOT IN ('add_row','add_column','edit_extra')
  OR p_storage IS NULL OR p_storage->>'sha256' IS NULL
  OR p_storage->>'sha256' !~ '^[0-9a-f]{64}$'
  OR p_storage->>'size' IS NULL
  OR (p_storage->>'size')::bigint NOT BETWEEN 1 AND 12582912
  OR (p_storage->>'hex' IS NULL AND p_storage->>'path' IS NULL)
 THEN RAISE EXCEPTION 'invalid HQ worksheet change'; END IF;
 IF (p_action='add_row' AND (p_row IS NULL OR p_row NOT BETWEEN 2 AND 25000 OR p_column IS NOT NULL))
  OR (p_action='add_column' AND (p_column IS NULL OR p_column !~ '^[M-Z]$' OR p_label IS NULL OR length(p_label) NOT BETWEEN 1 AND 60))
  OR (p_action='edit_extra' AND (p_column IS NULL OR p_column !~ '^[M-Z]$' OR p_row IS NULL OR p_row NOT BETWEEN 2 AND 25000))
 THEN RAISE EXCEPTION 'invalid worksheet edit position'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));
 SELECT * INTO ledger FROM cockpit.report_ledgers WHERE org_id=p_org AND year=p_year FOR UPDATE;
 IF NOT FOUND OR ledger.active_version<>p_expected THEN RETURN false; END IF;
 SELECT manifest INTO prior_manifest FROM cockpit.report_workbook_versions
 WHERE org_id=p_org AND id=p_expected;
 IF NOT FOUND THEN RAISE EXCEPTION 'active Excel version missing'; END IF;
 INSERT INTO cockpit.report_workbook_versions(
  org_id,ledger_year,bytes,object_path,sha256,byte_size,kind,created_by,manifest
 ) VALUES (
  p_org,p_year,decode(p_storage->>'hex','hex'),p_storage->>'path',
  p_storage->>'sha256',(p_storage->>'size')::bigint,'append',p_actor,prior_manifest
 ) RETURNING id INTO next_version;
 UPDATE cockpit.report_ledgers SET active_version=next_version WHERE org_id=p_org AND year=p_year;
 UPDATE cockpit.report_workbooks SET active_version=next_version
  WHERE org_id=p_org AND active_version=p_expected;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail)
 VALUES(p_org,p_actor,'hq_sheet_changed',jsonb_build_object(
  'year',p_year,'sheet',p_sheet,'action',p_action,
  'row',p_row,'column',p_column,'label',p_label,'version',next_version
 ));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION cockpit.commit_report_hq_sheet_change(text,uuid,integer,uuid,jsonb,text,text,integer,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_report_hq_sheet_change(text,uuid,integer,uuid,jsonb,text,text,integer,text,text)
 TO service_role;
