-- Managed month row positions are synchronized atomically with Excel commits.
CREATE OR REPLACE FUNCTION cockpit.commit_report_plan(p_org text,p_id uuid,p_revision integer,p_lease uuid,p_actor uuid,p_plans jsonb,p_sheet text,p_row integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE s cockpit.report_submissions;j cockpit.report_jobs;plan jsonb;w cockpit.report_ledgers;v uuid;target_v uuid;man jsonb;target_year integer;mv record;next_row integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));
 SELECT * INTO s FROM cockpit.report_submissions WHERE id=p_id AND org_id=p_org FOR UPDATE;
 SELECT * INTO j FROM cockpit.report_jobs WHERE submission_id=p_id AND org_id=p_org FOR UPDATE;
 IF s.id IS NULL OR s.revision<>p_revision OR s.excel_status NOT IN ('pending','error') OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_until<=now() THEN RETURN false; END IF;
 target_year:=left(s.parsed_date,4)::integer;
 IF jsonb_array_length(p_plans) NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'invalid plan'; END IF;
 FOR plan IN SELECT * FROM jsonb_array_elements(p_plans) LOOP
  SELECT * INTO w FROM cockpit.report_ledgers WHERE org_id=p_org AND year=(plan->>'year')::integer FOR UPDATE;
  IF NOT FOUND OR w.active_version<>(plan->>'expected')::uuid THEN RETURN false; END IF;
 END LOOP;
 FOR plan IN SELECT * FROM jsonb_array_elements(p_plans) LOOP
  SELECT * INTO w FROM cockpit.report_ledgers WHERE org_id=p_org AND year=(plan->>'year')::integer;
  SELECT manifest-p_id::text INTO man FROM cockpit.report_workbook_versions WHERE id=w.active_version AND org_id=p_org;
  IF w.year=target_year THEN
   FOR mv IN SELECT * FROM jsonb_each(coalesce(plan->'moves','{}'::jsonb)) LOOP
    IF NOT man ? mv.key OR man->mv.key->>'sheet'<>p_sheet
      OR jsonb_typeof(mv.value)<>'number' OR (mv.value::text)::integer NOT BETWEEN 2 AND 25000
    THEN RAISE EXCEPTION 'invalid managed Excel row move'; END IF;
    next_row:=(mv.value::text)::integer;
    man:=jsonb_set(man,ARRAY[mv.key,'row'],to_jsonb(next_row),false);
   END LOOP;
   man:=man||jsonb_build_object(p_id::text,jsonb_build_object('sheet',p_sheet,'row',p_row));
  END IF;
  INSERT INTO cockpit.report_workbook_versions(org_id,ledger_year,bytes,object_path,sha256,byte_size,kind,created_by,source_submission_id,manifest)
  VALUES(p_org,w.year,decode(plan->'storage'->>'hex','hex'),plan->'storage'->>'path',plan->'storage'->>'sha256',(plan->'storage'->>'size')::bigint,'append',p_actor,p_id,man) RETURNING id INTO v;
  UPDATE cockpit.report_ledgers SET active_version=v WHERE org_id=p_org AND year=w.year;
  UPDATE cockpit.report_workbooks SET active_version=v WHERE org_id=p_org AND active_version=w.active_version;
  IF w.year=target_year THEN
   target_v:=v;
   FOR mv IN SELECT * FROM jsonb_each(coalesce(plan->'moves','{}'::jsonb)) LOOP
    next_row:=(mv.value::text)::integer;
    UPDATE cockpit.report_submissions
     SET excel_row_number=next_row,applied_version=v
     WHERE id=mv.key::uuid AND org_id=p_org AND ledger_year=target_year
      AND excel_status='applied' AND excel_sheet_name=p_sheet;
    IF NOT FOUND THEN RAISE EXCEPTION 'managed row reference missing'; END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF target_v IS NULL THEN RAISE EXCEPTION 'target year missing'; END IF;
 UPDATE cockpit.report_submissions SET excel_status='applied',last_error=NULL,excel_sheet_name=p_sheet,excel_row_number=p_row,applied_version=target_v,ledger_year=target_year WHERE id=p_id;
 UPDATE cockpit.report_jobs SET finished_at=now(),last_success_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE submission_id=p_id;
 INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id)
 VALUES(p_org,s.driver_id,'system','status',CASE WHEN s.applied_version IS NULL THEN 'Excel '||p_sheet||' 시트에 반영되었습니다.' ELSE '회사에서 운행보고를 정정해 Excel에 반영했습니다.' END,p_id);
 INSERT INTO cockpit.report_audit(org_id,actor_id,submission_id,action,detail) VALUES(p_org,p_actor,p_id,'workbook_committed',jsonb_build_object('version',target_v,'revision',p_revision));RETURN true;
END $$;

-- HQ can compact previously appended reports into the top data rows on demand.
-- This writes a new immutable version; the original file and all audit history remain.
CREATE OR REPLACE FUNCTION cockpit.commit_report_hq_reorder(
 p_org text,p_actor uuid,p_year integer,p_expected uuid,p_storage jsonb,p_sheet text,p_moves jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,cockpit AS $$
DECLARE w cockpit.report_ledgers;v uuid;man jsonb;mv record;next_row integer;
BEGIN
 IF p_org IS NULL OR p_actor IS NULL OR p_year NOT BETWEEN 2000 AND 2099
  OR p_sheet !~ '^(1[0-2]|[1-9])월$'
  OR p_storage->>'sha256' !~ '^[0-9a-f]{64}$'
  OR jsonb_typeof(p_moves)<>'object'
  OR (SELECT count(*) FROM jsonb_object_keys(p_moves)) > 1000
 THEN RAISE EXCEPTION 'invalid reorder request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));
 SELECT * INTO w FROM cockpit.report_ledgers WHERE org_id=p_org AND year=p_year FOR UPDATE;
 IF NOT FOUND OR w.active_version<>p_expected THEN RETURN false; END IF;
 SELECT manifest INTO man FROM cockpit.report_workbook_versions WHERE org_id=p_org AND id=p_expected;
 FOR mv IN SELECT * FROM jsonb_each(p_moves) LOOP
  IF NOT man ? mv.key OR man->mv.key->>'sheet'<>p_sheet OR
    jsonb_typeof(mv.value)<>'number' OR (mv.value::text)::integer NOT BETWEEN 2 AND 25000
   THEN RAISE EXCEPTION 'invalid report row move'; END IF;
  next_row:=(mv.value::text)::integer;
  man:=jsonb_set(man,ARRAY[mv.key,'row'],to_jsonb(next_row),false);
 END LOOP;
 INSERT INTO cockpit.report_workbook_versions(org_id,ledger_year,bytes,object_path,sha256,byte_size,kind,created_by,manifest)
 VALUES(p_org,p_year,decode(p_storage->>'hex','hex'),p_storage->>'path',p_storage->>'sha256',
  (p_storage->>'size')::bigint,'append',p_actor,man) RETURNING id INTO v;
 UPDATE cockpit.report_ledgers SET active_version=v WHERE org_id=p_org AND year=p_year;
 UPDATE cockpit.report_workbooks SET active_version=v WHERE org_id=p_org AND active_version=p_expected;
 FOR mv IN SELECT * FROM jsonb_each(p_moves) LOOP
  UPDATE cockpit.report_submissions SET excel_row_number=(mv.value::text)::integer,applied_version=v
  WHERE org_id=p_org AND id=mv.key::uuid AND ledger_year=p_year
   AND excel_status='applied' AND excel_sheet_name=p_sheet;
  IF NOT FOUND THEN RAISE EXCEPTION 'linked report row missing'; END IF;
 END LOOP;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES
 (p_org,p_actor,'hq_month_sorted',jsonb_build_object('year',p_year,'sheet',p_sheet,'moves',p_moves,'version',v));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION cockpit.commit_report_hq_reorder(text,uuid,integer,uuid,jsonb,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_report_hq_reorder(text,uuid,integer,uuid,jsonb,text,jsonb)
 TO service_role;
