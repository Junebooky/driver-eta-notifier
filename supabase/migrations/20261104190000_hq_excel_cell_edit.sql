-- Safe HQ inline Excel edits: compare-and-swap of an immutable workbook version.
-- The UI only writes existing, nonformula A-L cells. Historical raw messages remain unchanged.
CREATE OR REPLACE FUNCTION cockpit.commit_report_hq_cell_edit(
 p_org text,p_actor uuid,p_year integer,p_expected uuid,p_storage jsonb,
 p_sheet text,p_row integer,p_column text,p_before text,p_after text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,cockpit AS $$
DECLARE w cockpit.report_ledgers;v uuid;man jsonb;linked uuid;column_key text;value_for_report text;existing_plate text;
BEGIN
 IF p_org IS NULL OR p_actor IS NULL OR p_year NOT BETWEEN 2000 AND 2099
  OR p_sheet !~ '^(1[0-2]|[1-9])월$' OR p_row<2 OR p_row>25000
  OR p_column !~ '^[A-L]$' OR length(p_after)>2400
  OR p_storage->>'sha256' !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid HQ cell edit'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));
 SELECT * INTO w FROM cockpit.report_ledgers WHERE org_id=p_org AND year=p_year FOR UPDATE;
 IF NOT FOUND OR w.active_version<>p_expected THEN RETURN false; END IF;
 SELECT manifest INTO man FROM cockpit.report_workbook_versions WHERE org_id=p_org AND id=p_expected;
 SELECT entry.key::uuid INTO linked
  FROM jsonb_each(man) AS entry(key,value)
  WHERE entry.value->>'sheet'=p_sheet AND (entry.value->>'row')::integer=p_row
  LIMIT 1;
 column_key:=CASE p_column
  WHEN 'A' THEN 'date' WHEN 'B' THEN 'plate' WHEN 'C' THEN 'model'
  WHEN 'D' THEN 'customer' WHEN 'E' THEN 'driver' WHEN 'F' THEN 'time'
  WHEN 'G' THEN 'route' WHEN 'H' THEN 'serviceType' WHEN 'I' THEN 'overtime'
  WHEN 'J' THEN 'amount' WHEN 'K' THEN 'payment' WHEN 'L' THEN 'totalWithVat' END;
 value_for_report:=p_after;
 IF linked IS NOT NULL AND p_column='B' THEN
  IF p_after !~ '^[0-9]{4}$' THEN RAISE EXCEPTION '차량번호 마지막 네 자리를 확인해 주세요.'; END IF;
  SELECT parsed->'draft'->>'plate' INTO existing_plate FROM cockpit.report_submissions WHERE org_id=p_org AND id=linked;
  IF existing_plate IS NULL OR existing_plate !~ '[0-9]{4}$' THEN RAISE EXCEPTION '원래 번호판을 확인해 주세요.'; END IF;
  value_for_report:=regexp_replace(existing_plate,'[0-9]{4}$',p_after);
 END IF;
 IF linked IS NOT NULL AND p_column='A' AND
    (p_after !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(p_after,4)::integer<>p_year
     OR substring(p_after,6,2)::integer<>regexp_replace(p_sheet,'월','','g')::integer)
 THEN RAISE EXCEPTION '장부의 동일 연도·월 날짜만 수정할 수 있습니다.'; END IF;
 INSERT INTO cockpit.report_workbook_versions(
  org_id,ledger_year,bytes,object_path,sha256,byte_size,kind,created_by,manifest)
 VALUES(p_org,p_year,decode(p_storage->>'hex','hex'),p_storage->>'path',
  p_storage->>'sha256',(p_storage->>'size')::bigint,'append',p_actor,man)
 RETURNING id INTO v;
 UPDATE cockpit.report_ledgers SET active_version=v WHERE org_id=p_org AND year=p_year;
 UPDATE cockpit.report_workbooks SET active_version=v WHERE org_id=p_org AND active_version=p_expected;
 IF linked IS NOT NULL THEN
  UPDATE cockpit.report_submissions SET
    parsed=jsonb_set(parsed,ARRAY['draft',column_key],to_jsonb(value_for_report),true),
    applied_version=v,revision=revision+1
   WHERE org_id=p_org AND id=linked AND ledger_year=p_year AND excel_status='applied';
 END IF;
 INSERT INTO cockpit.report_audit(org_id,actor_id,submission_id,action,detail)
 VALUES(p_org,p_actor,linked,'hq_cell_edit',jsonb_build_object(
  'year',p_year,'sheet',p_sheet,'row',p_row,'column',p_column,
  'before',p_before,'after',p_after,'version',v));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION cockpit.commit_report_hq_cell_edit(text,uuid,integer,uuid,jsonb,text,integer,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_report_hq_cell_edit(text,uuid,integer,uuid,jsonb,text,integer,text,text,text)
 TO service_role;
