-- REVIEW CANDIDATE ONLY: never apply to the operating DB in this phase.
-- Reuse cockpit.schedules and dispatch_requests; no parallel reservation authority.
-- Existing VIP RPCs, triggers, rows, grants and legacy constraints are untouched.
BEGIN;
CREATE FUNCTION cockpit.commit_tenant_draft_v1(
  p_org text,p_user uuid,p_session uuid,p_request text,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; patch jsonb; old_row cockpit.schedules; saved cockpit.schedules;
  previous cockpit.dispatch_requests; payload jsonb; result jsonb:='[]'::jsonb;
  k text; schedule_id uuid; driver_id_value uuid; vehicle_id_value uuid; customer_id_value text;
  vehicle_plate_value text; driver_name_value text; day_value date; end_day_value date;
  start_value time; end_value time; points jsonb; meta jsonb; request_key text;
  actor_role text;
BEGIN
  IF current_user <> 'service_role' OR p_org IS NULL OR p_user IS NULL OR p_session IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  -- Same transaction lock as legacy dispatch. Do not bypass existing guards.
  PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
  PERFORM 1 FROM cockpit.organizations o WHERE o.id=p_org AND o.status='active' AND o.runtime_enabled=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT m.role INTO actor_role FROM cockpit.organization_members m
    WHERE m.org_id=p_org AND m.user_id=p_user AND m.status='active'
      AND m.role IN ('company_owner','company_admin') AND m.driver_id IS NULL FOR SHARE;
  IF NOT FOUND OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
    OR p_request IS NULL OR length(p_request) NOT BETWEEN 1 AND 160
    OR pg_column_size(p_items)>2000000 THEN
    RAISE EXCEPTION 'INVALID_BATCH' USING ERRCODE='22023';
  END IF;
  request_key:='taas:draft:v1:'||p_request;
  payload:=jsonb_build_object('actor',p_user,'items',p_items);
  SELECT * INTO previous FROM cockpit.dispatch_requests
    WHERE organization_id=p_org AND request_id=request_key;
  IF FOUND THEN
    IF previous.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='40001'; END IF;
    RETURN previous.result;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_ITEM' USING ERRCODE='22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(item) LOOP
      IF k NOT IN ('row','expected_updated_at') THEN RAISE EXCEPTION 'INVALID_ITEM_FIELD' USING ERRCODE='22023'; END IF;
    END LOOP;
    patch:=item->'row';
    IF jsonb_typeof(patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_ROW' USING ERRCODE='22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(patch) LOOP
      IF k NOT IN ('id','date','pickup_time','end_date','end_time','origin','destination','driver_id','vehicle_id','customer_id','routeWaypoints','group_id','serviceMode') THEN
        RAISE EXCEPTION 'INVALID_ROW_FIELD' USING ERRCODE='22023';
      END IF;
    END LOOP;
    schedule_id:=(patch->>'id')::uuid;
    day_value:=(patch->>'date')::date;
    start_value:=nullif(patch->>'pickup_time','')::time;
    end_day_value:=coalesce(nullif(patch->>'end_date','')::date,day_value);
    end_value:=nullif(patch->>'end_time','')::time;
    IF schedule_id IS NULL OR day_value IS NULL OR NOT isfinite(day_value) OR NOT isfinite(end_day_value) OR end_day_value<day_value
      OR start_value>=time '24:00' OR end_value>=time '24:00'
      OR (start_value IS NULL AND end_value IS NOT NULL)
      OR (start_value IS NOT NULL AND end_value IS NOT NULL AND day_value+start_value>=end_day_value+end_value)
      OR length(btrim(coalesce(patch->>'origin',''))) NOT BETWEEN 1 AND 1000
      OR length(btrim(coalesce(patch->>'destination',''))) NOT BETWEEN 1 AND 1000
      OR (patch?'group_id' AND length(coalesce(patch->>'group_id',''))>160)
      OR coalesce(patch->>'serviceMode','with_driver') NOT IN ('with_driver','vehicle_only')
      THEN RAISE EXCEPTION 'INVALID_DRAFT' USING ERRCODE='22023'; END IF;
    points:=coalesce(patch->'routeWaypoints','[]'::jsonb);
    IF jsonb_typeof(points) IS DISTINCT FROM 'array' OR jsonb_array_length(points)>200
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(points) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object') THEN
      RAISE EXCEPTION 'INVALID_ROUTE' USING ERRCODE='22023';
    END IF;
    SELECT * INTO old_row FROM cockpit.schedules s WHERE s.id=schedule_id FOR UPDATE;
    IF FOUND THEN
      IF old_row.org_id IS DISTINCT FROM p_org OR old_row.dispatch_status IS DISTINCT FROM 'draft'
        OR old_row.status IS DISTINCT FROM 'draft' OR old_row.schedule_meta->>'taasDraftV1' IS DISTINCT FROM 'true'
        OR NOT (item?'expected_updated_at') OR item->>'expected_updated_at' IS NULL THEN
        RAISE EXCEPTION 'DRAFT_NOT_FOUND_OR_IMMUTABLE' USING ERRCODE='42501';
      END IF;
      IF old_row.updated_at IS DISTINCT FROM (item->>'expected_updated_at')::timestamptz THEN
        RAISE EXCEPTION 'DRAFT_CHANGED' USING ERRCODE='40001';
      END IF;
    ELSIF item?'expected_updated_at' AND item->>'expected_updated_at' IS NOT NULL THEN
      RAISE EXCEPTION 'DRAFT_NOT_FOUND_OR_IMMUTABLE' USING ERRCODE='42501';
    END IF;
    driver_id_value:=nullif(patch->>'driver_id','')::uuid;
    vehicle_id_value:=nullif(patch->>'vehicle_id','')::uuid;
    customer_id_value:=nullif(patch->>'customer_id','');
    driver_name_value:=NULL; vehicle_plate_value:=NULL;
    IF coalesce(patch->>'serviceMode','with_driver')='vehicle_only' AND driver_id_value IS NOT NULL THEN
      RAISE EXCEPTION 'DRIVER_NOT_ALLOWED' USING ERRCODE='22023';
    END IF;
    IF driver_id_value IS NOT NULL THEN
      SELECT d.driver_name INTO driver_name_value FROM cockpit.drivers d
        WHERE d.id=driver_id_value AND d.org_id=p_org AND d.driver_meta->>'status'='active' FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_OWNED' USING ERRCODE='42501'; END IF;
    END IF;
    IF vehicle_id_value IS NOT NULL THEN
      SELECT v.plate INTO vehicle_plate_value FROM cockpit.vehicles v
        WHERE v.id=vehicle_id_value AND v.organization_id=p_org AND NOT v.archived
          AND v.status NOT IN ('maintenance','정비 중') FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_OWNED' USING ERRCODE='42501'; END IF;
    END IF;
    IF customer_id_value IS NOT NULL THEN
      PERFORM 1 FROM cockpit.customers c WHERE c.id=customer_id_value AND c.org_id=p_org FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_OWNED' USING ERRCODE='42501'; END IF;
    END IF;
    meta:=coalesce(old_row.schedule_meta,'{}'::jsonb)||jsonb_build_object(
      'taasDraftV1',true,'routeWaypoints',points,'serviceMode',coalesce(patch->>'serviceMode','with_driver'),
      'groupId',patch->>'group_id','dispatchStatus','draft');
    IF old_row.id IS NULL THEN
      INSERT INTO cockpit.schedules(id,org_id,date,pickup_time,end_date,end_time,time_display,origin,destination,
        driver_id,driver_name,vehicle_id,vehicle_plate,vehicle_no,customer_id,status,dispatch_status,schedule_meta,updated_at)
      VALUES(schedule_id,p_org,day_value,start_value,end_day_value,end_value,'',patch->>'origin',patch->>'destination',
        driver_id_value,driver_name_value,vehicle_id_value,vehicle_plate_value,coalesce(vehicle_plate_value,'미배정'),customer_id_value,
        'draft','draft',meta,clock_timestamp()) RETURNING * INTO saved;
    ELSE
      UPDATE cockpit.schedules s SET date=day_value,pickup_time=start_value,end_date=end_day_value,end_time=end_value,
        origin=patch->>'origin',destination=patch->>'destination',driver_id=driver_id_value,driver_name=driver_name_value,
        vehicle_id=vehicle_id_value,vehicle_plate=vehicle_plate_value,vehicle_no=coalesce(vehicle_plate_value,'미배정'),
        customer_id=customer_id_value,schedule_meta=meta,updated_at=clock_timestamp()
      WHERE s.id=schedule_id AND s.org_id=p_org RETURNING * INTO saved;
    END IF;
    result:=result||jsonb_build_array(jsonb_build_object('id',saved.id,'org_id',saved.org_id,'updated_at',saved.updated_at,'dispatch_status',saved.dispatch_status));
  END LOOP;
  IF cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  INSERT INTO cockpit.dispatch_requests(organization_id,request_id,request_payload,result)
    VALUES(p_org,request_key,payload,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.commit_tenant_draft_v1(text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_tenant_draft_v1(text,uuid,uuid,text,jsonb) TO service_role;
COMMIT;
