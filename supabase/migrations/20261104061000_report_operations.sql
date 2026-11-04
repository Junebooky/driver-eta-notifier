ALTER TABLE cockpit.report_workbook_versions ALTER COLUMN bytes DROP NOT NULL;
ALTER TABLE cockpit.report_workbook_versions ADD COLUMN IF NOT EXISTS ledger_year integer;
ALTER TABLE cockpit.report_workbook_versions ADD COLUMN IF NOT EXISTS object_path text;
ALTER TABLE cockpit.report_workbook_versions ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE cockpit.report_workbook_versions ADD COLUMN IF NOT EXISTS byte_size bigint;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='report_version_payload') THEN
 ALTER TABLE cockpit.report_workbook_versions ADD CONSTRAINT report_version_payload CHECK(bytes IS NOT NULL OR (object_path IS NOT NULL AND length(sha256)=64 AND byte_size BETWEEN 1 AND 12582912)); END IF;
END $$;
ALTER TABLE cockpit.report_submissions ADD COLUMN IF NOT EXISTS ledger_year integer;
CREATE TABLE IF NOT EXISTS cockpit.report_ledgers (
 org_id text NOT NULL,year integer NOT NULL CHECK(year BETWEEN 2000 AND 2099),active_version uuid NOT NULL REFERENCES cockpit.report_workbook_versions(id),filename text NOT NULL,PRIMARY KEY(org_id,year)
);
CREATE TABLE IF NOT EXISTS cockpit.report_month_templates (
 org_id text NOT NULL,year integer NOT NULL,month integer NOT NULL CHECK(month BETWEEN 1 AND 12),source_month text NOT NULL,
 approved_by uuid NOT NULL,approved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,year,month)
);
CREATE TABLE IF NOT EXISTS cockpit.report_jobs (
 submission_id uuid PRIMARY KEY REFERENCES cockpit.report_submissions(id),org_id text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,lease_until timestamptz,last_error text,finished_at timestamptz,last_success_at timestamptz
);
CREATE INDEX IF NOT EXISTS report_jobs_due ON cockpit.report_jobs(next_attempt_at,lease_until) WHERE finished_at IS NULL;
ALTER TABLE cockpit.report_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.report_month_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.report_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.report_ledgers,cockpit.report_month_templates,cockpit.report_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON cockpit.report_ledgers,cockpit.report_month_templates,cockpit.report_jobs TO service_role;
CREATE OR REPLACE FUNCTION cockpit.enqueue_report_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
BEGIN
 IF NEW.excel_status IN ('pending','error') THEN
  INSERT INTO cockpit.report_jobs(submission_id,org_id) VALUES(NEW.id,NEW.org_id)
  ON CONFLICT(submission_id) DO UPDATE SET attempts=CASE WHEN TG_OP='UPDATE' AND NEW.revision<>OLD.revision THEN 0 ELSE report_jobs.attempts END,
  next_attempt_at=CASE WHEN TG_OP='UPDATE' AND NEW.revision<>OLD.revision THEN now() ELSE report_jobs.next_attempt_at END,
  lease_token=CASE WHEN TG_OP='UPDATE' AND NEW.revision<>OLD.revision THEN NULL ELSE report_jobs.lease_token END,
  lease_until=CASE WHEN TG_OP='UPDATE' AND NEW.revision<>OLD.revision THEN NULL ELSE report_jobs.lease_until END,finished_at=NULL;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS report_queue_enqueue ON cockpit.report_submissions;
CREATE TRIGGER report_queue_enqueue AFTER INSERT OR UPDATE OF excel_status,revision ON cockpit.report_submissions FOR EACH ROW EXECUTE FUNCTION cockpit.enqueue_report_job();
INSERT INTO cockpit.report_jobs(submission_id,org_id) SELECT id,org_id FROM cockpit.report_submissions WHERE excel_status IN ('pending','error') ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION cockpit.claim_report_jobs(p_limit integer,p_org text DEFAULT NULL,p_id uuid DEFAULT NULL) RETURNS SETOF cockpit.report_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
BEGIN
 UPDATE cockpit.report_submissions s SET excel_status='review',review_status='pending',last_error='자동 재시도 한도를 초과했습니다.'
 WHERE s.excel_status IN ('pending','error') AND EXISTS(SELECT 1 FROM cockpit.report_jobs j WHERE j.submission_id=s.id AND j.attempts>=8 AND (j.lease_until IS NULL OR j.lease_until<now()));
 RETURN QUERY WITH due AS (
 SELECT j.submission_id FROM cockpit.report_jobs j JOIN cockpit.report_submissions s ON s.id=j.submission_id
 WHERE j.finished_at IS NULL AND j.next_attempt_at<=now() AND j.attempts<8 AND (j.lease_until IS NULL OR j.lease_until<now())
 AND s.excel_status IN ('pending','error') AND (p_org IS NULL OR j.org_id=p_org) AND (p_id IS NULL OR j.submission_id=p_id)
 ORDER BY j.next_attempt_at FOR UPDATE OF j SKIP LOCKED LIMIT least(greatest(p_limit,1),30)
 ) UPDATE cockpit.report_jobs j SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1
 FROM due WHERE j.submission_id=due.submission_id RETURNING j.*;
END $$;
CREATE OR REPLACE FUNCTION cockpit.finish_report_failure(p_org text,p_id uuid,p_lease uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE j cockpit.report_jobs;
BEGIN
 PERFORM 1 FROM cockpit.report_submissions WHERE id=p_id AND org_id=p_org FOR UPDATE;
 SELECT * INTO j FROM cockpit.report_jobs WHERE submission_id=p_id AND org_id=p_org FOR UPDATE;
 IF NOT FOUND OR j.lease_token IS DISTINCT FROM p_lease THEN RETURN; END IF;
 UPDATE cockpit.report_jobs SET last_error=left(p_reason,1000),lease_until=NULL,lease_token=NULL,next_attempt_at=now()+make_interval(secs=>least(3600,15*power(2,j.attempts)::integer)) WHERE submission_id=p_id;
 UPDATE cockpit.report_submissions SET excel_status=CASE WHEN j.attempts>=8 THEN 'review' ELSE 'error' END,review_status=CASE WHEN j.attempts>=8 THEN 'pending' ELSE review_status END,last_error=left(p_reason,1000) WHERE id=p_id;
 IF j.attempts=1 OR j.attempts=8 THEN INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id)
 SELECT org_id,driver_id,'system','error',CASE WHEN j.attempts>=8 THEN '회사 확인이 필요해 자동 반영을 잠시 멈췄어요. 보고는 보관되어 있습니다.' ELSE '보고는 접수됐어요. Excel 연결을 자동으로 다시 시도하고 있어요.' END,id FROM cockpit.report_submissions WHERE id=p_id; END IF;
END $$;
CREATE OR REPLACE FUNCTION cockpit.register_report_ledger(p_org text,p_year integer,p_actor uuid,p_filename text,p_storage jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE v uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));
 IF EXISTS(SELECT 1 FROM cockpit.report_ledgers WHERE org_id=p_org AND year=p_year) THEN RAISE EXCEPTION 'year already registered'; END IF;
 INSERT INTO cockpit.report_workbook_versions(org_id,ledger_year,bytes,object_path,sha256,byte_size,kind,created_by)
 VALUES(p_org,p_year,decode(p_storage->>'hex','hex'),p_storage->>'path',p_storage->>'sha256',(p_storage->>'size')::bigint,'original',p_actor) RETURNING id INTO v;
 INSERT INTO cockpit.report_ledgers VALUES(p_org,p_year,v,p_filename);
 INSERT INTO cockpit.report_workbooks VALUES(p_org,v,p_filename) ON CONFLICT(org_id) DO UPDATE SET active_version=v,filename=p_filename;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES(p_org,p_actor,'ledger_registered',jsonb_build_object('year',p_year,'version',v));
 RETURN v;
END $$;
CREATE OR REPLACE FUNCTION cockpit.bind_legacy_report_ledger(p_org text,p_year integer,p_expected uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE w cockpit.report_workbooks;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));SELECT * INTO w FROM cockpit.report_workbooks WHERE org_id=p_org FOR UPDATE;
 IF NOT FOUND OR w.active_version<>p_expected THEN RETURN false; END IF;
 INSERT INTO cockpit.report_ledgers VALUES(p_org,p_year,w.active_version,w.filename) ON CONFLICT DO NOTHING;
 UPDATE cockpit.report_workbook_versions SET ledger_year=p_year WHERE org_id=p_org AND ledger_year IS NULL;
 UPDATE cockpit.report_submissions SET ledger_year=p_year WHERE org_id=p_org AND applied_version IS NOT NULL AND ledger_year IS NULL;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION cockpit.activate_report_ledger(p_org text,p_year integer,p_actor uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE w cockpit.report_ledgers;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));SELECT * INTO w FROM cockpit.report_ledgers WHERE org_id=p_org AND year=p_year;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE cockpit.report_workbooks SET active_version=w.active_version,filename=w.filename WHERE org_id=p_org;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES(p_org,p_actor,'ledger_activated',jsonb_build_object('year',p_year));RETURN true;
END $$;
CREATE OR REPLACE FUNCTION cockpit.review_report(p_org text,p_actor uuid,p_id uuid,p_revision integer,p_parsed jsonb,p_note text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE s cockpit.report_submissions;
BEGIN
 SELECT * INTO s FROM cockpit.report_submissions WHERE id=p_id AND org_id=p_org FOR UPDATE;
 IF NOT FOUND OR s.revision<>p_revision THEN RETURN false; END IF;
 INSERT INTO cockpit.report_audit(org_id,actor_id,submission_id,action,detail) VALUES(p_org,p_actor,s.id,'review',jsonb_build_object('before',s.parsed,'after',p_parsed,'note',p_note));
 UPDATE cockpit.report_submissions SET parsed=p_parsed,revision=revision+1,review_status='approved',excel_status=CASE WHEN jsonb_array_length(p_parsed->'reviewReasons')=0 THEN 'pending' ELSE 'review' END,last_error=NULL WHERE id=s.id;
 INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id) VALUES(p_org,s.driver_id,'hq','status','회사에서 보고 내용을 확인했습니다. '||p_note,s.id);RETURN true;
END $$;
-- Up to two annual files change together when an applied report moves across years.
CREATE OR REPLACE FUNCTION cockpit.commit_report_plan(p_org text,p_id uuid,p_revision integer,p_lease uuid,p_actor uuid,p_plans jsonb,p_sheet text,p_row integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE s cockpit.report_submissions;j cockpit.report_jobs;plan jsonb;w cockpit.report_ledgers;v uuid;target_v uuid;man jsonb;target_year integer;
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
  IF w.year=target_year THEN man:=man||jsonb_build_object(p_id::text,jsonb_build_object('sheet',p_sheet,'row',p_row)); END IF;
  INSERT INTO cockpit.report_workbook_versions(org_id,ledger_year,bytes,object_path,sha256,byte_size,kind,created_by,source_submission_id,manifest)
  VALUES(p_org,w.year,decode(plan->'storage'->>'hex','hex'),plan->'storage'->>'path',plan->'storage'->>'sha256',(plan->'storage'->>'size')::bigint,'append',p_actor,p_id,man) RETURNING id INTO v;
  UPDATE cockpit.report_ledgers SET active_version=v WHERE org_id=p_org AND year=w.year;
  UPDATE cockpit.report_workbooks SET active_version=v WHERE org_id=p_org AND active_version=w.active_version;
  IF w.year=target_year THEN target_v:=v; END IF;
 END LOOP;
 IF target_v IS NULL THEN RAISE EXCEPTION 'target year missing'; END IF;
 UPDATE cockpit.report_submissions SET excel_status='applied',last_error=NULL,excel_sheet_name=p_sheet,excel_row_number=p_row,applied_version=target_v,ledger_year=target_year WHERE id=p_id;
 UPDATE cockpit.report_jobs SET finished_at=now(),last_success_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE submission_id=p_id;
 INSERT INTO cockpit.report_messages(org_id,driver_id,sender_type,message_type,body,linked_submission_id)
 VALUES(p_org,s.driver_id,'system','status',CASE WHEN s.applied_version IS NULL THEN 'Excel '||p_sheet||' 시트에 반영되었습니다.' ELSE '회사에서 운행보고를 정정해 Excel에 반영했습니다.' END,p_id);
 INSERT INTO cockpit.report_audit(org_id,actor_id,submission_id,action,detail) VALUES(p_org,p_actor,p_id,'workbook_committed',jsonb_build_object('version',target_v,'revision',p_revision));RETURN true;
END $$;
-- Permissions cover only the new operations, not unrelated functions.
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='cockpit' AND p.proname IN ('enqueue_report_job','claim_report_jobs','finish_report_failure','register_report_ledger','bind_legacy_report_ledger','activate_report_ledger','commit_report_plan') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.f);END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS cockpit.report_object_uploads(path text PRIMARY KEY,org_id text NOT NULL,sha256 text NOT NULL,byte_size bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE cockpit.report_object_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.report_object_uploads FROM PUBLIC,anon,authenticated;
GRANT ALL ON cockpit.report_object_uploads TO service_role;
CREATE OR REPLACE FUNCTION cockpit.commit_report_template(p_org text,p_year integer,p_month integer,p_source text,p_actor uuid,p_expected uuid,p_storage jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE w cockpit.report_ledgers;v uuid;man jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));SELECT * INTO w FROM cockpit.report_ledgers WHERE org_id=p_org AND year=p_year FOR UPDATE;
 IF NOT FOUND OR w.active_version<>p_expected THEN RETURN false; END IF;
 SELECT manifest INTO man FROM cockpit.report_workbook_versions WHERE id=w.active_version;
 INSERT INTO cockpit.report_workbook_versions(org_id,ledger_year,bytes,object_path,sha256,byte_size,kind,created_by,manifest)
 VALUES(p_org,p_year,decode(p_storage->>'hex','hex'),p_storage->>'path',p_storage->>'sha256',(p_storage->>'size')::bigint,'append',p_actor,man) RETURNING id INTO v;
 UPDATE cockpit.report_ledgers SET active_version=v WHERE org_id=p_org AND year=p_year;
 UPDATE cockpit.report_workbooks SET active_version=v WHERE org_id=p_org AND active_version=p_expected;
 INSERT INTO cockpit.report_month_templates VALUES(p_org,p_year,p_month,p_source,p_actor,now()) ON CONFLICT(org_id,year,month) DO UPDATE SET source_month=p_source,approved_by=p_actor,approved_at=now();
 UPDATE cockpit.report_submissions SET excel_status='pending',revision=revision+1 WHERE org_id=p_org AND left(parsed_date,4)=p_year::text AND excel_status IN ('error','review') AND jsonb_array_length(parsed->'reviewReasons')=0;
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES(p_org,p_actor,'month_template_approved',jsonb_build_object('year',p_year,'month',p_month,'source',p_source,'version',v));RETURN true;
END $$;
REVOKE ALL ON FUNCTION cockpit.commit_report_template(text,integer,integer,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_report_template(text,integer,integer,text,uuid,uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION cockpit.restore_report_workbook(p_org text,p_actor uuid,p_target uuid,p_expected uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
DECLARE t cockpit.report_workbook_versions;w cockpit.report_ledgers;v uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org,1));SELECT * INTO t FROM cockpit.report_workbook_versions WHERE id=p_target AND org_id=p_org;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO w FROM cockpit.report_ledgers WHERE org_id=p_org AND year=t.ledger_year FOR UPDATE;
 IF NOT FOUND OR w.active_version<>p_expected THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM cockpit.report_submissions WHERE org_id=p_org AND t.manifest ? id::text AND ledger_year IS NOT NULL AND ledger_year<>t.ledger_year) THEN RAISE EXCEPTION '연도 이관된 보고가 포함되어 있습니다. 연도별 복구를 먼저 확인해 주세요.'; END IF;
 INSERT INTO cockpit.report_workbook_versions(org_id,ledger_year,bytes,object_path,sha256,byte_size,kind,created_by,manifest)
 VALUES(p_org,t.ledger_year,t.bytes,t.object_path,t.sha256,t.byte_size,'restore',p_actor,t.manifest) RETURNING id INTO v;
 UPDATE cockpit.report_ledgers SET active_version=v WHERE org_id=p_org AND year=t.ledger_year;
 UPDATE cockpit.report_workbooks SET active_version=v WHERE org_id=p_org AND active_version=p_expected;
 UPDATE cockpit.report_submissions SET excel_status=CASE WHEN t.manifest ? id::text THEN 'applied' ELSE 'pending' END,
 excel_sheet_name=t.manifest->id::text->>'sheet',excel_row_number=(t.manifest->id::text->>'row')::integer,
 applied_version=CASE WHEN t.manifest ? id::text THEN v ELSE NULL END,ledger_year=t.ledger_year,revision=revision+1,last_error=NULL
 WHERE org_id=p_org AND ((ledger_year=t.ledger_year AND excel_status='applied') OR t.manifest ? id::text);
 INSERT INTO cockpit.report_audit(org_id,actor_id,action,detail) VALUES(p_org,p_actor,'restore',jsonb_build_object('target',p_target,'version',v));RETURN true;
END $$;
CREATE OR REPLACE FUNCTION cockpit.retry_report_job(p_org text,p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
BEGIN
 UPDATE cockpit.report_jobs SET next_attempt_at=now(),attempts=0,finished_at=NULL WHERE org_id=p_org AND submission_id=p_id AND (lease_until IS NULL OR lease_until<now());RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION cockpit.retry_report_job(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.retry_report_job(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION cockpit.report_storage_usage(p_org text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,cockpit AS $$
 SELECT jsonb_build_object('versions',(SELECT count(*) FROM cockpit.report_workbook_versions WHERE org_id=p_org),
 'bytes',(SELECT coalesce(sum(coalesce(byte_size,octet_length(bytes))),0) FROM cockpit.report_workbook_versions WHERE org_id=p_org),
 'unreferencedUploads',(SELECT count(*) FROM cockpit.report_object_uploads u WHERE u.org_id=p_org AND NOT EXISTS(SELECT 1 FROM cockpit.report_workbook_versions v WHERE v.object_path=u.path)),
 'lastSuccess',(SELECT max(last_success_at) FROM cockpit.report_jobs WHERE org_id=p_org),
 'overdue',(SELECT count(*) FROM cockpit.report_jobs WHERE org_id=p_org AND finished_at IS NULL AND next_attempt_at<now()-interval '30 minutes'))
$$;
REVOKE ALL ON FUNCTION cockpit.report_storage_usage(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.report_storage_usage(text) TO service_role;
