-- REVIEW ONLY. No live migration. Existing report/Excel tables and legacy triggers unchanged.
BEGIN;
CREATE TABLE cockpit.organization_reporting_requests (
 org_id text NOT NULL REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
 request_id text NOT NULL CHECK(length(request_id) BETWEEN 8 AND 160),
 actor_id uuid NOT NULL,
 command_digest text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('log','expense')),
 operation text NOT NULL CHECK(operation IN ('create','update','review')),
 record_id uuid NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(org_id,request_id)
);
ALTER TABLE cockpit.organization_reporting_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.organization_reporting_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON cockpit.organization_reporting_requests TO service_role;
CREATE INDEX organization_reporting_requests_record_idx ON cockpit.organization_reporting_requests(org_id,kind,record_id) WHERE operation='create';
CREATE FUNCTION cockpit.tenant_receipt_path_valid_v1(p_org text,p_driver uuid,p_path text)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(p_org~'^[a-z][a-z0-9_]{2,62}$' AND p_driver IS NOT NULL
 AND split_part(p_path,'/',1)=p_org
 AND split_part(p_path,'/',2)='expenses'
 AND split_part(p_path,'/',3)='receipts'
 AND split_part(p_path,'/',4)=p_driver::text
 AND p_path~'^[a-z][a-z0-9_]{2,62}/expenses/receipts/[0-9a-f-]{36}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{64}\.(jpg|png|webp|pdf)$',false);
$$;

-- Atomic first-write/read candidate, not a new public endpoint.
-- Caller is the verified server adapter, never the browser. Receipt object
-- verification is a separate gate: no receipt path accepted in this slice.
CREATE FUNCTION cockpit.tenant_standard_report_v1(p_org text,p_user uuid,p_session uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE member cockpit.organization_members; driver cockpit.drivers; booking cockpit.schedules;
 vehicle cockpit.vehicles; linked cockpit.driving_logs; logrow cockpit.driving_logs; expense cockpit.expenses;
 kind text; op text; tbl text; driver_key uuid; booking_key uuid; vehicle_key uuid; log_key uuid;
 rid uuid; day_value date; start_value integer; end_value integer; amount_value integer; points jsonb;
 f jsonb; result jsonb; cursor_key uuid; page_size integer; field_key text; submitted boolean;
 req text; digest text; previous cockpit.organization_reporting_requests; old_row jsonb; next_status text; at_time timestamptz; audit jsonb;
BEGIN
 IF current_user<>'service_role' OR p_org IS NULL OR p_user IS NULL OR p_session IS NULL THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,12);
 PERFORM 1 FROM cockpit.organizations WHERE id=p_org AND status='active' AND runtime_enabled FOR SHARE;
 IF NOT FOUND OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO member FROM cockpit.organization_members WHERE org_id=p_org AND user_id=p_user AND status='active' FOR SHARE;
 IF NOT FOUND OR member.role NOT IN ('driver','company_owner','company_admin') OR
   (member.role='driver' AND member.driver_id IS NULL) OR (member.role<>'driver' AND member.driver_id IS NOT NULL) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF member.role='driver' THEN
  PERFORM 1 FROM cockpit.drivers WHERE id=member.driver_id AND org_id=p_org AND driver_meta->>'status'='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR pg_column_size(p_command)>100000 THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
 END IF;
 kind:=p_command->>'kind';op:=p_command->>'op';
 IF kind='log' THEN tbl:='driving_logs'; ELSIF kind='expense' THEN tbl:='expenses';
 ELSE RAISE EXCEPTION 'INVALID_KIND' USING ERRCODE='22023'; END IF;
 IF op='list' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('kind','op','cursor','limit')) THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
  END IF;
  cursor_key:=coalesce((p_command->>'cursor')::uuid,'00000000-0000-0000-0000-000000000000'::uuid);
  page_size:=coalesce((p_command->>'limit')::integer,50);
  IF page_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(r ORDER BY r->>''id''),''[]''::jsonb) FROM (SELECT (to_jsonb(t)-''receipt_storage_path''-''hipass_card_no''-''ocr_details'')||jsonb_build_object(''revision'',encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'')) AS r FROM cockpit.%I t WHERE organization_id=$1 AND ($2::uuid IS NULL OR driver_id=$2) AND id>$3 ORDER BY id LIMIT $4) q',tbl)
   INTO result USING p_org,member.driver_id,cursor_key,page_size;
  RETURN jsonb_build_object('records',result,'nextCursor',CASE WHEN jsonb_array_length(result)=page_size THEN result->(page_size-1)->>'id' ELSE NULL END);
 END IF;
 IF op IS NULL OR op NOT IN ('create','update','review') OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('kind','op','fields','requestId','id','revision')) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
 END IF;
 req:=p_command->>'requestId';
 IF req IS NULL OR length(req) NOT BETWEEN 8 AND 160 OR (op='create' AND (p_command?'id' OR p_command?'revision')) THEN
  RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
 END IF;
 IF op='review' AND member.role='driver' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 SELECT * INTO previous FROM cockpit.organization_reporting_requests WHERE org_id=p_org AND request_id=req;
 IF FOUND THEN
  IF previous.actor_id IS DISTINCT FROM p_user OR previous.command_digest IS DISTINCT FROM digest THEN
   RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='40001';
  END IF;
  RETURN previous.result;
 END IF;
 f:=p_command->'fields';
 IF kind='log' THEN
  FOR field_key IN SELECT unnest(ARRAY['customerServiceStart','customerServiceEnd']) LOOP
   IF f?field_key AND f->field_key IS DISTINCT FROM 'null'::jsonb
    AND (jsonb_typeof(f->field_key) IS DISTINCT FROM 'string' OR (f->>field_key)!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') THEN
    RAISE EXCEPTION 'INVALID_SERVICE_TIME' USING ERRCODE='22023';
   END IF;
  END LOOP;
 ELSIF f?'billableToCustomer' AND jsonb_typeof(f->'billableToCustomer') IS DISTINCT FROM 'boolean' THEN
  RAISE EXCEPTION 'INVALID_BILLABLE_FLAG' USING ERRCODE='22023';
 END IF;
 IF op IN ('update','review') THEN
  rid:=(p_command->>'id')::uuid;
  IF rid IS NULL OR coalesce(p_command->>'revision','')!~'^[0-9a-f]{64}$' OR jsonb_typeof(f) IS DISTINCT FROM 'object' OR f='{}'::jsonb THEN
   RAISE EXCEPTION 'INVALID_MUTATION' USING ERRCODE='22023';
  END IF;
  -- Existing legacy records cannot be adopted or overwritten by a candidate command.
  PERFORM 1 FROM cockpit.organization_reporting_requests q WHERE q.org_id=p_org AND q.kind=CASE WHEN tbl='driving_logs' THEN 'log' ELSE 'expense' END AND q.record_id=rid AND q.operation='create';
  IF NOT FOUND THEN RAISE EXCEPTION 'RECORD_NOT_OWNED' USING ERRCODE='42501'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM cockpit.%I t WHERE organization_id=$1 AND id=$2 AND ($3::uuid IS NULL OR driver_id=$3) FOR UPDATE',tbl)
    INTO old_row USING p_org,rid,member.driver_id;
  IF old_row IS NULL THEN RAISE EXCEPTION 'RECORD_NOT_OWNED' USING ERRCODE='42501'; END IF;
  IF encode(sha256(convert_to(old_row::text,'UTF8')),'hex') IS DISTINCT FROM p_command->>'revision' THEN
   RAISE EXCEPTION 'RECORD_CHANGED' USING ERRCODE='40001';
  END IF;
  at_time:=clock_timestamp();
  IF op='review' THEN
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('status','notes') AND NOT(kind='expense' AND k='billableToCustomer')) OR
     coalesce(f->>'status','') NOT IN ('승인 완료','보완 필요','반려') OR length(coalesce(f->>'notes',''))>10000 OR
     old_row->>'status' IS DISTINCT FROM (CASE WHEN kind='log' THEN '검토 대기' ELSE '검수 대기' END) THEN
    RAISE EXCEPTION 'INVALID_REVIEW' USING ERRCODE='22023';
   END IF;
   next_status:=f->>'status';
   audit:=jsonb_build_array(jsonb_build_object('actorId',p_user,'at',at_time,'actionType',next_status,'before',old_row->>'status','notes',f->>'notes'));
   IF kind='log' THEN
    UPDATE cockpit.driving_logs SET status=next_status,reviewed_at=at_time,reviewed_by=p_user::text,review_notes=f->>'notes',
     review_history=audit||coalesce(review_history,'[]'::jsonb),updated_at=at_time WHERE id=rid AND organization_id=p_org RETURNING * INTO logrow;
   ELSE
    -- Preserve the original decision and record any customer-billing correction.
    IF f?'billableToCustomer' THEN
     audit:=jsonb_build_array((audit->0)||jsonb_build_object('billableToCustomerBefore',old_row->'billable_to_customer','billableToCustomerAfter',f->'billableToCustomer'));
    END IF;
    -- Existing expense_approval_integrity trigger still requires receipt or Hi-Pass evidence.
    UPDATE cockpit.expenses SET status=next_status,reviewed_at=at_time,reviewed_by=p_user::text,review_notes=f->>'notes',
     billable_to_customer=CASE WHEN f?'billableToCustomer' THEN (f->>'billableToCustomer')::boolean ELSE billable_to_customer END,
     audit_history=audit||coalesce(audit_history,'[]'::jsonb),updated_at=at_time WHERE id=rid AND organization_id=p_org RETURNING * INTO expense;
   END IF;
  ELSE
   IF coalesce(old_row->>'status','') NOT IN ('draft','보완 필요') THEN RAISE EXCEPTION 'RECORD_UNDER_REVIEW' USING ERRCODE='42501'; END IF;
   IF f?'submit' AND jsonb_typeof(f->'submit') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_FIELDS' USING ERRCODE='22023'; END IF;
   submitted:=coalesce((f->>'submit')::boolean,false);
   next_status:=CASE WHEN submitted THEN CASE WHEN kind='log' THEN '검토 대기' ELSE '검수 대기' END ELSE old_row->>'status' END;
   IF kind='log' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('submit','clockIn','clockOut','startKm','endKm','notes','stops','customerServiceStart','customerServiceEnd')) THEN RAISE EXCEPTION 'INVALID_FIELDS' USING ERRCODE='22023'; END IF;
    start_value:=CASE WHEN f?'startKm' THEN (f->>'startKm')::integer ELSE (old_row->>'start_km')::integer END;
    end_value:=CASE WHEN f?'endKm' THEN (f->>'endKm')::integer ELSE (old_row->>'end_km')::integer END;
    points:=coalesce(f->'stops','[]'::jsonb);
    IF start_value<0 OR end_value<0 OR end_value<start_value OR length(coalesce(f->>'notes',''))>10000 OR jsonb_typeof(points) IS DISTINCT FROM 'array' OR jsonb_array_length(points)>200 OR EXISTS(SELECT 1 FROM jsonb_array_elements(points) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'INVALID_LOG' USING ERRCODE='22023'; END IF;
    -- Append/merge by stable action or stop ID; omission never removes a prior stop.
    SELECT coalesce(jsonb_agg(value ORDER BY first_ord),'[]'::jsonb) INTO points FROM (
     SELECT DISTINCT ON (key) value, min(ord) OVER(PARTITION BY key) first_ord FROM (
      SELECT value,ord,coalesce(value->>'actionIdempotencyKey',value->>'id',md5(value::text)) key
      FROM jsonb_array_elements(coalesce(old_row->'stops','[]'::jsonb)||points) WITH ORDINALITY AS j(value,ord)
     ) src ORDER BY key,ord DESC
    ) merged;
    IF jsonb_array_length(points)>200 THEN RAISE EXCEPTION 'INVALID_LOG' USING ERRCODE='22023'; END IF;
    UPDATE cockpit.driving_logs SET start_km=start_value,end_km=end_value,distance_km=end_value-start_value,stops=points,
     clock_in=CASE WHEN f?'clockIn' THEN (f->>'clockIn')::time ELSE clock_in END,clock_out=CASE WHEN f?'clockOut' THEN (f->>'clockOut')::time ELSE clock_out END,
     customer_service_start=CASE WHEN f?'customerServiceStart' THEN (f->>'customerServiceStart')::time ELSE customer_service_start END,
     customer_service_end=CASE WHEN f?'customerServiceEnd' THEN (f->>'customerServiceEnd')::time ELSE customer_service_end END,
     notes=CASE WHEN f?'notes' THEN f->>'notes' ELSE notes END,status=next_status,
     submitted_at=CASE WHEN submitted THEN at_time ELSE submitted_at END,submitted_by=CASE WHEN submitted THEN p_user::text ELSE submitted_by END,updated_at=at_time
     WHERE id=rid AND organization_id=p_org RETURNING * INTO logrow;
   ELSE
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('submit','amount','merchant','category','paymentMethod','memo','time','billableToCustomer')) THEN RAISE EXCEPTION 'INVALID_FIELDS' USING ERRCODE='22023'; END IF;
    amount_value:=CASE WHEN f?'amount' THEN (f->>'amount')::integer ELSE (old_row->>'amount')::integer END;
    IF amount_value IS NULL OR amount_value<=0 OR coalesce(f->>'category',old_row->>'category','') NOT IN ('fuel','meal','parking','toll','stay','wash','transit','other') OR
     coalesce(f->>'paymentMethod',old_row->>'payment_method','') NOT IN ('company_card','driver_personal','client_card','cash','other') OR
     length(btrim(coalesce(f->>'merchant',old_row->>'merchant',''))) NOT BETWEEN 1 AND 500 OR length(coalesce(f->>'memo',''))>10000 THEN RAISE EXCEPTION 'INVALID_EXPENSE' USING ERRCODE='22023'; END IF;
    UPDATE cockpit.expenses SET amount=amount_value,merchant=btrim(coalesce(f->>'merchant',merchant)),category=coalesce(f->>'category',category),
     payment_method=coalesce(f->>'paymentMethod',payment_method),memo=CASE WHEN f?'memo' THEN f->>'memo' ELSE memo END,expense_time=coalesce((f->>'time')::time,expense_time),
     billable_to_customer=CASE WHEN f?'billableToCustomer' THEN (f->>'billableToCustomer')::boolean ELSE billable_to_customer END,
     status=next_status,submitted_at=CASE WHEN submitted THEN at_time ELSE submitted_at END,submitted_by=CASE WHEN submitted THEN p_user::text ELSE submitted_by END,updated_at=at_time
     WHERE id=rid AND organization_id=p_org RETURNING * INTO expense;
   END IF;
  END IF;
  result:=jsonb_build_object('id',rid,'status',next_status);
 ELSE
 IF jsonb_typeof(f) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_FIELDS' USING ERRCODE='22023'; END IF;
 FOR field_key IN SELECT jsonb_object_keys(f) LOOP
  IF field_key NOT IN ('driverId','bookingId','vehicleId','date','submit')
    AND NOT(kind='log' AND field_key IN ('clockIn','clockOut','startKm','endKm','stops','notes','customerServiceStart','customerServiceEnd'))
    AND NOT(kind='expense' AND field_key IN ('time','amount','category','merchant','paymentMethod','memo','drivingLogId','billableToCustomer')) THEN
   RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF f?'submit' AND jsonb_typeof(f->'submit') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_FIELDS' USING ERRCODE='22023'; END IF;
 submitted:=coalesce((f->>'submit')::boolean,false);
 driver_key:=coalesce(member.driver_id,(f->>'driverId')::uuid);
 IF driver_key IS NULL OR (f?'driverId' AND (f->>'driverId')::uuid IS DISTINCT FROM driver_key) THEN
  RAISE EXCEPTION 'DRIVER_NOT_OWNED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO driver FROM cockpit.drivers WHERE id=driver_key AND org_id=p_org AND driver_meta->>'status'='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'DRIVER_NOT_OWNED' USING ERRCODE='42501'; END IF;
 day_value:=(f->>'date')::date;booking_key:=(f->>'bookingId')::uuid;vehicle_key:=(f->>'vehicleId')::uuid;
 IF day_value IS NULL OR NOT isfinite(day_value) THEN RAISE EXCEPTION 'INVALID_DATE' USING ERRCODE='22023'; END IF;
 IF booking_key IS NOT NULL THEN
  SELECT * INTO booking FROM cockpit.schedules WHERE id=booking_key AND org_id=p_org AND driver_id=driver_key
    AND dispatch_status='published' AND status NOT IN ('cancelled','draft')
    AND day_value BETWEEN date AND coalesce(end_date,date) FOR SHARE;
  IF NOT FOUND OR (vehicle_key IS NOT NULL AND vehicle_key IS DISTINCT FROM booking.vehicle_id) THEN
   RAISE EXCEPTION 'BOOKING_NOT_OWNED' USING ERRCODE='42501';
  END IF;
  vehicle_key:=booking.vehicle_id;
 END IF;
 IF vehicle_key IS NOT NULL THEN
  SELECT * INTO vehicle FROM cockpit.vehicles WHERE id=vehicle_key AND organization_id=p_org FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEHICLE_NOT_OWNED' USING ERRCODE='42501'; END IF;
 END IF;
 IF booking.customer_id IS NOT NULL THEN
  PERFORM 1 FROM cockpit.customers WHERE id=booking.customer_id AND org_id=p_org FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_OWNED' USING ERRCODE='42501'; END IF;
 END IF;
 rid:=gen_random_uuid();
 IF kind='log' THEN
  start_value:=(f->>'startKm')::integer;end_value:=(f->>'endKm')::integer;points:=coalesce(f->'stops','[]'::jsonb);
  IF start_value<0 OR end_value<0 OR (start_value IS NOT NULL AND end_value IS NOT NULL AND end_value<start_value)
    OR jsonb_typeof(points) IS DISTINCT FROM 'array' OR jsonb_array_length(points)>200
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(points) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object')
    OR length(coalesce(f->>'notes',''))>10000 THEN RAISE EXCEPTION 'INVALID_LOG' USING ERRCODE='22023'; END IF;
  INSERT INTO cockpit.driving_logs(id,organization_id,driver_id,driver_name,booking_id,vehicle_id,vehicle_plate,vehicle_model,customer_id,
    driving_date,clock_in,clock_out,customer_service_start,customer_service_end,start_km,end_km,distance_km,stops,notes,status,submitted_at,submitted_by)
  VALUES(rid,p_org,driver_key,driver.driver_name,booking_key,vehicle_key::text,vehicle.plate,vehicle.model,booking.customer_id,
    day_value,(f->>'clockIn')::time,(f->>'clockOut')::time,(f->>'customerServiceStart')::time,(f->>'customerServiceEnd')::time,start_value,end_value,end_value-start_value,points,f->>'notes',
    CASE WHEN submitted THEN '검토 대기' ELSE 'draft' END,CASE WHEN submitted THEN clock_timestamp() END,CASE WHEN submitted THEN p_user::text END)
  RETURNING * INTO logrow;
  result:=jsonb_build_object('id',logrow.id,'status',logrow.status);
 ELSE
  amount_value:=(f->>'amount')::integer;log_key:=(f->>'drivingLogId')::uuid;
  IF amount_value IS NULL OR amount_value<=0 OR coalesce(f->>'category','') NOT IN ('fuel','meal','parking','toll','stay','wash','transit','other')
   OR coalesce(f->>'paymentMethod','') NOT IN ('company_card','driver_personal','client_card','cash','other')
   OR length(btrim(coalesce(f->>'merchant',''))) NOT BETWEEN 1 AND 500 OR f->>'time' IS NULL
   OR length(coalesce(f->>'memo',''))>10000 THEN RAISE EXCEPTION 'INVALID_EXPENSE' USING ERRCODE='22023'; END IF;
  IF log_key IS NOT NULL THEN
   SELECT * INTO linked FROM cockpit.driving_logs WHERE id=log_key AND organization_id=p_org AND driver_id=driver_key
     AND driving_date=day_value AND booking_id IS NOT DISTINCT FROM booking_key FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'LOG_NOT_OWNED' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO cockpit.expenses(id,organization_id,driver_id,driver_name,booking_id,driving_log_id,vehicle_id,vehicle_plate,vehicle_model,customer_id,
   expense_date,expense_time,amount,category,merchant,payment_method,memo,billable_to_customer,status,submitted_at,submitted_by)
  VALUES(rid,p_org,driver_key,driver.driver_name,booking_key,log_key,vehicle_key::text,vehicle.plate,vehicle.model,booking.customer_id,
   day_value,(f->>'time')::time,amount_value,f->>'category',btrim(f->>'merchant'),f->>'paymentMethod',f->>'memo',coalesce((f->>'billableToCustomer')::boolean,true),
   CASE WHEN submitted THEN '검수 대기' ELSE 'draft' END,CASE WHEN submitted THEN clock_timestamp() END,CASE WHEN submitted THEN p_user::text END)
  RETURNING * INTO expense;
  result:=jsonb_build_object('id',expense.id,'status',expense.status);
 END IF;
 END IF;
 IF cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO cockpit.organization_reporting_requests(org_id,request_id,actor_id,command_digest,kind,operation,record_id,result)
 VALUES(p_org,req,p_user,digest,kind,op,rid,result);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.tenant_receipt_path_valid_v1(text,uuid,text),cockpit.tenant_standard_report_v1(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.tenant_receipt_path_valid_v1(text,uuid,text),cockpit.tenant_standard_report_v1(text,uuid,uuid,jsonb) TO service_role;
COMMIT;
