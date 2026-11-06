-- Safe, versioned annual Excel source replacement.
-- Apply in the reviewed release migration, not against live data during development.
-- The old Excel bytes and their submission positions remain in immutable workbook versions.
-- Previous submissions are marked archived, never silently duplicated into a new owner's file.
ALTER TABLE cockpit.report_submissions
  DROP CONSTRAINT IF EXISTS report_submissions_excel_status_check;
ALTER TABLE cockpit.report_submissions
  ADD CONSTRAINT report_submissions_excel_status_check
  CHECK (excel_status IN ('pending','applied','review','error','archived'));

CREATE OR REPLACE FUNCTION cockpit.replace_report_ledger(
 p_org text,p_year integer,p_actor uuid,p_expected uuid,p_filename text,p_storage jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE
 old_ledger cockpit.report_ledgers;
 replacement uuid;
 archived_count integer:=0;
BEGIN
 IF p_year NOT BETWEEN 2000 AND 2099 OR length(p_filename) NOT BETWEEN 1 AND 200
    OR p_storage IS NULL OR (p_storage->>'size')::bigint NOT BETWEEN 1 AND 12582912
 THEN RAISE EXCEPTION 'invalid replacement workbook'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));
 SELECT * INTO old_ledger FROM cockpit.report_ledgers
 WHERE org_id=p_org AND year=p_year FOR UPDATE;
 -- A background report commit or another HQ edit may have changed the current workbook.
 IF NOT FOUND OR old_ledger.active_version<>p_expected THEN RETURN NULL; END IF;

 INSERT INTO cockpit.report_workbook_versions(
   org_id,ledger_year,bytes,object_path,sha256,byte_size,
   kind,created_by,manifest
 ) VALUES (
   p_org,p_year,decode(p_storage->>'hex','hex'),p_storage->>'path',
   p_storage->>'sha256',(p_storage->>'size')::bigint,
   'original',p_actor,'{}'::jsonb
 ) RETURNING id INTO replacement;
 UPDATE cockpit.report_ledgers
 SET active_version=replacement,filename=p_filename
 WHERE org_id=p_org AND year=p_year AND active_version=p_expected;
 -- Do not unexpectedly switch the global current workbook if HQ has selected another year.
 UPDATE cockpit.report_workbooks
 SET active_version=replacement,filename=p_filename
 WHERE org_id=p_org AND active_version=p_expected;

 -- The old reports remain available through prior workbook versions and the audit trail.
 -- Never leave stale sheet/row pointers into the newly uploaded owner's workbook.
 UPDATE cockpit.report_submissions
 SET excel_status='archived',excel_sheet_name=NULL,excel_row_number=NULL,
     applied_version=NULL,revision=revision+1,last_error=NULL
 WHERE org_id=p_org AND ledger_year=p_year AND excel_status='applied';
 GET DIAGNOSTICS archived_count=ROW_COUNT;

 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail)
 VALUES(p_org,p_actor,'ledger_replaced',jsonb_build_object(
   'year',p_year,'previousVersion',p_expected,'newVersion',replacement,
   'previousFilename',old_ledger.filename,'filename',p_filename,
   'archivedReports',archived_count
 ));
 RETURN jsonb_build_object('version',replacement,'previousVersion',p_expected,
   'archivedReports',archived_count,'year',p_year,'filename',p_filename);
END $$;
REVOKE ALL ON FUNCTION cockpit.replace_report_ledger(text,integer,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.replace_report_ledger(text,integer,uuid,uuid,text,jsonb) TO service_role;
