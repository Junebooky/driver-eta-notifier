-- Draft migration: apply only through reviewed deployment. No production DB changes in development.
CREATE TABLE IF NOT EXISTS cockpit.report_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE, org_id text NOT NULL, driver_id uuid NOT NULL,
 request_key uuid NOT NULL, fingerprint text NOT NULL, raw_message text NOT NULL CHECK(length(raw_message) BETWEEN 1 AND 20000),
 parsed jsonb NOT NULL,
 parsed_date text GENERATED ALWAYS AS (parsed->'draft'->>'date') STORED,
 parsed_plate text GENERATED ALWAYS AS (parsed->'draft'->>'plate') STORED,
 parsed_vehicle_uuid text GENERATED ALWAYS AS (parsed->>'vehicleUuid') STORED,
 parsed_vehicle_model text GENERATED ALWAYS AS (parsed->'draft'->>'model') STORED,
 parsed_customer_name text GENERATED ALWAYS AS (parsed->'draft'->>'customer') STORED,
 parsed_driver_name text GENERATED ALWAYS AS (parsed->'draft'->>'driver') STORED,
 parsed_start_time text GENERATED ALWAYS AS (split_part(parsed->'draft'->>'time','~',1)) STORED,
 parsed_end_time text GENERATED ALWAYS AS (split_part(parsed->'draft'->>'time','~',2)) STORED,
 parsed_route text GENERATED ALWAYS AS (parsed->'draft'->>'route') STORED,
 total_work_minutes integer GENERATED ALWAYS AS ((parsed->>'totalWorkMinutes')::integer) STORED,
 ot_minutes integer GENERATED ALWAYS AS ((parsed->>'otMinutes')::integer) STORED,
 night_minutes integer GENERATED ALWAYS AS ((parsed->>'nightMinutes')::integer) STORED,
 excel_status text NOT NULL CHECK(excel_status IN ('pending','applied','review','error')),
 review_status text NOT NULL DEFAULT 'not_required', excel_sheet_name text, excel_row_number integer,
 applied_version uuid, revision integer NOT NULL DEFAULT 1, last_error text,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,driver_id,request_key), UNIQUE(org_id,driver_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS report_submission_queue ON cockpit.report_submissions(org_id,excel_status,seq);
CREATE TABLE IF NOT EXISTS cockpit.report_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 org_id text NOT NULL, driver_id uuid NOT NULL,
 sender_type text NOT NULL CHECK(sender_type IN ('driver','system','hq')),
 message_type text NOT NULL CHECK(message_type IN ('text','status','error')), body text NOT NULL,
 linked_submission_id uuid REFERENCES cockpit.report_submissions(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_messages_thread ON cockpit.report_messages(org_id,driver_id,seq DESC);
CREATE TABLE IF NOT EXISTS cockpit.report_workbook_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text NOT NULL, generation bigint GENERATED ALWAYS AS IDENTITY,
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 12582912),
 manifest jsonb NOT NULL DEFAULT '{}',
 kind text NOT NULL CHECK(kind IN ('original','append','restore')),
 source_submission_id uuid REFERENCES cockpit.report_submissions(id), created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_versions_org ON cockpit.report_workbook_versions(org_id,generation DESC);
CREATE TABLE IF NOT EXISTS cockpit.report_workbooks (
 org_id text PRIMARY KEY, active_version uuid NOT NULL REFERENCES cockpit.report_workbook_versions(id), filename text NOT NULL
);
CREATE TABLE IF NOT EXISTS cockpit.report_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id text NOT NULL, actor_id uuid NOT NULL,
 submission_id uuid REFERENCES cockpit.report_submissions(id), action text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- No direct browser grants: all access goes through verified server UUID/org checks.
ALTER TABLE cockpit.report_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.report_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.report_workbook_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.report_workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.report_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.report_submissions,cockpit.report_messages,cockpit.report_workbook_versions,cockpit.report_workbooks,cockpit.report_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON cockpit.report_submissions,cockpit.report_messages,cockpit.report_workbook_versions,cockpit.report_workbooks,cockpit.report_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE cockpit.report_submissions_seq_seq,cockpit.report_messages_seq_seq,cockpit.report_workbook_versions_generation_seq,cockpit.report_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION cockpit.submit_report(p_org text,p_driver uuid,p_request uuid,p_fingerprint text,p_raw text,p_parsed jsonb,p_reply text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE s cockpit.report_submissions; review boolean:=jsonb_array_length(p_parsed->'reviewReasons')>0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org||p_driver::text,0));
 SELECT * INTO s FROM cockpit.report_submissions WHERE org_id=p_org AND driver_id=p_driver AND request_key=p_request;
 IF FOUND THEN
  IF s.raw_message<>p_raw THEN RAISE EXCEPTION 'request key reused' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('id',s.id,'duplicate',true);
 END IF;
 SELECT * INTO s FROM cockpit.report_submissions WHERE org_id=p_org AND driver_id=p_driver AND fingerprint=p_fingerprint;
 IF FOUND THEN RETURN jsonb_build_object('id',s.id,'duplicate',true); END IF;
 INSERT INTO cockpit.report_submissions(org_id,driver_id,request_key,fingerprint,raw_message,parsed,excel_status,review_status)
 VALUES(p_org,p_driver,p_request,p_fingerprint,p_raw,p_parsed,CASE WHEN review THEN 'review' ELSE 'pending' END,CASE WHEN review THEN 'pending' ELSE 'not_required' END) RETURNING * INTO s;
 INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id) VALUES
 (p_org,p_driver,'driver','text',p_raw,s.id),(p_org,p_driver,'system','status',p_reply,s.id);
 RETURN jsonb_build_object('id',s.id,'duplicate',false);
END $$;

-- Compare-and-swap under one org lock: bytes + active version + submission state + reply commit together.
CREATE OR REPLACE FUNCTION cockpit.commit_report_workbook(p_org text,p_actor uuid,p_expected uuid,p_bytes bytea,p_filename text,p_submission uuid DEFAULT NULL,p_revision integer DEFAULT NULL,p_sheet text DEFAULT NULL,p_row integer DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE current_id uuid; version_id uuid; current_manifest jsonb:='{}'; s cockpit.report_submissions;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));
 SELECT active_version INTO current_id FROM cockpit.report_workbooks WHERE org_id=p_org FOR UPDATE;
 IF current_id IS DISTINCT FROM p_expected THEN RETURN false; END IF;
 IF p_submission IS NULL AND current_id IS NOT NULL THEN RAISE EXCEPTION 'original already registered'; END IF;
 IF p_submission IS NOT NULL THEN
  SELECT * INTO s FROM cockpit.report_submissions WHERE id=p_submission AND org_id=p_org FOR UPDATE;
  IF NOT FOUND OR s.revision IS DISTINCT FROM p_revision OR s.excel_status NOT IN ('pending','error') THEN RETURN false; END IF;
  IF current_id IS NULL THEN RAISE EXCEPTION 'workbook missing'; END IF;
 END IF;
 IF current_id IS NOT NULL THEN SELECT manifest INTO current_manifest FROM cockpit.report_workbook_versions WHERE id=current_id AND org_id=p_org; END IF;
 IF p_submission IS NOT NULL THEN current_manifest:=current_manifest||jsonb_build_object(p_submission::text,jsonb_build_object('sheet',p_sheet,'row',p_row)); END IF;
 INSERT INTO cockpit.report_workbook_versions(org_id,bytes,kind,source_submission_id,created_by,manifest)
 VALUES(p_org,p_bytes,CASE WHEN p_submission IS NULL THEN 'original' ELSE 'append' END,p_submission,p_actor,current_manifest) RETURNING id INTO version_id;
 INSERT INTO cockpit.report_workbooks VALUES(p_org,version_id,p_filename) ON CONFLICT(org_id) DO UPDATE SET active_version=EXCLUDED.active_version;
 IF p_submission IS NOT NULL THEN
  UPDATE cockpit.report_submissions SET excel_status='applied',last_error=NULL,excel_sheet_name=p_sheet,excel_row_number=p_row,applied_version=version_id WHERE id=s.id;
  INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id)
   VALUES(p_org,s.driver_id,'system','status','Excel '||p_sheet||' 시트에 반영되었습니다.',s.id);
 END IF;
 INSERT INTO cockpit.report_audit(org_id,actor_id,submission_id,action,detail) VALUES(p_org,p_actor,p_submission,'workbook_'||CASE WHEN p_submission IS NULL THEN 'registered' ELSE 'applied' END,jsonb_build_object('version',version_id));
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION cockpit.review_report(p_org text,p_actor uuid,p_id uuid,p_revision integer,p_parsed jsonb,p_note text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE s cockpit.report_submissions;
BEGIN
 SELECT * INTO s FROM cockpit.report_submissions WHERE id=p_id AND org_id=p_org FOR UPDATE;
 IF NOT FOUND OR s.revision<>p_revision OR s.excel_status='applied' THEN RETURN false; END IF;
 INSERT INTO cockpit.report_audit(org_id,actor_id,submission_id,action,detail) VALUES(p_org,p_actor,s.id,'review',jsonb_build_object('before',s.parsed,'after',p_parsed,'note',p_note));
 UPDATE cockpit.report_submissions SET parsed=p_parsed,revision=revision+1,review_status='approved',excel_status=CASE WHEN jsonb_array_length(p_parsed->'reviewReasons')=0 THEN 'pending' ELSE 'review' END,last_error=NULL WHERE id=s.id;
 INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id) VALUES(p_org,s.driver_id,'hq','status','회사에서 보고 내용을 확인했습니다. '||p_note,s.id);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION cockpit.fail_report(p_org text,p_id uuid,p_revision integer,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE s cockpit.report_submissions;
BEGIN
 SELECT * INTO s FROM cockpit.report_submissions WHERE id=p_id AND org_id=p_org FOR UPDATE;
 IF NOT FOUND OR s.revision<>p_revision OR s.excel_status NOT IN ('pending','error') THEN RETURN false; END IF;
 IF s.excel_status<>'error' OR s.last_error IS DISTINCT FROM p_reason THEN
  INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id) VALUES(p_org,s.driver_id,'system','error','운행보고는 보관되어 있습니다. Excel 반영을 회사에서 확인하고 있어요.',s.id);
 END IF;
 UPDATE cockpit.report_submissions SET excel_status='error',last_error=p_reason WHERE id=s.id;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION cockpit.restore_report_workbook(p_org text,p_actor uuid,p_target uuid,p_expected uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE target cockpit.report_workbook_versions; current_id uuid; new_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));
 SELECT active_version INTO current_id FROM cockpit.report_workbooks WHERE org_id=p_org FOR UPDATE;
 IF current_id IS DISTINCT FROM p_expected THEN RETURN false; END IF;
 SELECT * INTO target FROM cockpit.report_workbook_versions WHERE id=p_target AND org_id=p_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'version missing'; END IF;
 INSERT INTO cockpit.report_workbook_versions(org_id,bytes,kind,created_by,manifest) VALUES(p_org,target.bytes,'restore',p_actor,target.manifest) RETURNING id INTO new_id;
 UPDATE cockpit.report_workbooks SET active_version=new_id WHERE org_id=p_org;
 -- A version manifest, rather than generation comparisons, also handles restoring an earlier restore.
 INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id)
 SELECT p_org,driver_id,'system','status','회사에서 Excel 작업본을 복구해 반영 상태를 다시 확인하고 있어요.',id
 FROM cockpit.report_submissions WHERE org_id=p_org AND (excel_status='applied' OR target.manifest ? id::text);
 UPDATE cockpit.report_submissions SET
 excel_status=CASE WHEN target.manifest ? id::text THEN 'applied' ELSE 'pending' END,
 excel_sheet_name=target.manifest->id::text->>'sheet',excel_row_number=(target.manifest->id::text->>'row')::integer,
 applied_version=CASE WHEN target.manifest ? id::text THEN new_id ELSE NULL END,revision=revision+1,last_error=NULL
 WHERE org_id=p_org AND (excel_status='applied' OR target.manifest ? id::text);
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES(p_org,p_actor,'restore',jsonb_build_object('target',p_target,'version',new_id));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION cockpit.submit_report(text,uuid,uuid,text,text,jsonb,text),cockpit.commit_report_workbook(text,uuid,uuid,bytea,text,uuid,integer,text,integer),cockpit.review_report(text,uuid,uuid,integer,jsonb,text),cockpit.fail_report(text,uuid,integer,text),cockpit.restore_report_workbook(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.submit_report(text,uuid,uuid,text,text,jsonb,text),cockpit.commit_report_workbook(text,uuid,uuid,bytea,text,uuid,integer,text,integer),cockpit.review_report(text,uuid,uuid,integer,jsonb,text),cockpit.fail_report(text,uuid,integer,text),cockpit.restore_report_workbook(text,uuid,uuid,uuid) TO service_role;
