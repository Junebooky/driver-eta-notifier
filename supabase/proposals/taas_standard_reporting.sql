-- REVIEW ONLY. No live migration. Existing report/Excel tables and legacy triggers unchanged.
BEGIN;
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
  EXECUTE format('SELECT coalesce(jsonb_agg(r ORDER BY r->>''id''),''[]''::jsonb) FROM (SELECT to_jsonb(t)-''receipt_storage_path''-''hipass_card_no''-''ocr_details'' AS r FROM cockpit.%I t WHERE organization_id=$1 AND ($2::uuid IS NULL OR driver_id=$2) AND id>$3 ORDER BY id LIMIT $4) q',tbl)
   INTO result USING p_org,member.driver_id,cursor_key,page_size;
  RETURN jsonb_build_object('records',result,'nextCursor',CASE WHEN jsonb_array_length(result)=page_size THEN result->(page_size-1)->>'id' ELSE NULL END);
 END IF;
 IF op IS DISTINCT FROM 'create' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('kind','op','fields')) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
 END IF;
 f:=p_command->'fields';
 IF jsonb_typeof(f) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_FIELDS' USING ERRCODE='22023'; END IF;
 FOR field_key IN SELECT jsonb_object_keys(f) LOOP
  IF field_key NOT IN ('driverId','bookingId','vehicleId','date','submit')
    AND NOT(kind='log' AND field_key IN ('clockIn','clockOut','startKm','endKm','stops','notes'))
    AND NOT(kind='expense' AND field_key IN ('time','amount','category','merchant','paymentMethod','memo','drivingLogId')) THEN
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
    driving_date,clock_in,clock_out,start_km,end_km,distance_km,stops,notes,status,submitted_at,submitted_by)
  VALUES(rid,p_org,driver_key,driver.driver_name,booking_key,vehicle_key::text,vehicle.plate,vehicle.model,booking.customer_id,
    day_value,(f->>'clockIn')::time,(f->>'clockOut')::time,start_value,end_value,end_value-start_value,points,f->>'notes',
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
   expense_date,expense_time,amount,category,merchant,payment_method,memo,status,submitted_at,submitted_by)
  VALUES(rid,p_org,driver_key,driver.driver_name,booking_key,log_key,vehicle_key::text,vehicle.plate,vehicle.model,booking.customer_id,
   day_value,(f->>'time')::time,amount_value,f->>'category',btrim(f->>'merchant'),f->>'paymentMethod',f->>'memo',
   CASE WHEN submitted THEN '검수 대기' ELSE 'draft' END,CASE WHEN submitted THEN clock_timestamp() END,CASE WHEN submitted THEN p_user::text END)
  RETURNING * INTO expense;
  result:=jsonb_build_object('id',expense.id,'status',expense.status);
 END IF;
 IF cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.tenant_receipt_path_valid_v1(text,uuid,text),cockpit.tenant_standard_report_v1(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.tenant_receipt_path_valid_v1(text,uuid,text),cockpit.tenant_standard_report_v1(text,uuid,uuid,jsonb) TO service_role;
COMMIT;
