-- REVIEW ONLY. No live DB migration or runtime activation.
-- Reuse authoritative existing registry tables and retain all legacy identifiers.
BEGIN;
CREATE TABLE cockpit.organization_registry_requests (
 org_id text NOT NULL REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
 request_id text NOT NULL CHECK(length(request_id) BETWEEN 8 AND 160),
 actor_id uuid NOT NULL,
 request_digest text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(org_id,request_id)
);
ALTER TABLE cockpit.organization_registry_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.organization_registry_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON cockpit.organization_registry_requests TO service_role;

-- Never return raw metadata, pricing history, or internal credentials from a roster.
CREATE FUNCTION cockpit.tenant_registry_project_v1(p_kind text,r jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (CASE p_kind
 WHEN 'driver' THEN jsonb_build_object('id',r->'id','org_id',r->'org_id','name',r->'driver_name',
  'phone',r->'phone','vehicleNo',r->'vehicle_no','carNumber',r->'car_number','vehicleModel',r->'vehicle_model',
  'englishAvailable',r->'english_available','affiliationType',r->'driver_meta'->'affiliation',
  'residence',r->'driver_meta'->'residence','memo',r->'driver_meta'->'memo',
  'email',r->'driver_meta'->'enrollment_email','status',r->'driver_meta'->'status')
 WHEN 'customer' THEN jsonb_build_object('id',r->'id','org_id',r->'org_id','name',r->'name',
  'contactPerson',r->'contact_person','phone',r->'phone','email',r->'email','address',r->'address','businessNumber',r->'business_number')
 WHEN 'vehicle' THEN jsonb_build_object('id',r->'id','org_id',r->'organization_id','plate',r->'plate','model',r->'model',
  'brand',r->'brand','category',r->'category','categoryLabel',r->'category_label','capacity',r->'capacity',
  'fuelType',r->'fuel_type','status',r->'status','archived',r->'archived','memo',r->'profile'->'adminMemo')
 WHEN 'supplier' THEN jsonb_build_object('id',r->'id','org_id',r->'org_id','name',r->'display_name','active',r->'active')
 END)||jsonb_build_object('revision',encode(sha256(convert_to(r::text,'UTF8')),'hex'));
$$;

CREATE FUNCTION cockpit.tenant_registry_v1(p_org text,p_user uuid,p_session uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE kind text; op text; tbl text; scope_col text; allowed text[]; f jsonb; k text; v jsonb;
 rid text; old_row jsonb; new_row jsonb; projected jsonb; result jsonb;
 req text; digest text; prior cockpit.organization_registry_requests; generated_id uuid;
 page_size integer; cursor_id text;
BEGIN
 IF current_user<>'service_role' OR p_org IS NULL OR p_user IS NULL OR p_session IS NULL THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- Serialize registry edits with the existing dispatch/custody writes.
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
 PERFORM 1 FROM cockpit.organizations o WHERE o.id=p_org AND o.status='active' AND o.runtime_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cockpit.organization_members m WHERE m.org_id=p_org AND m.user_id=p_user
  AND m.status='active' AND m.role IN ('company_owner','company_admin') AND m.driver_id IS NULL FOR SHARE;
 IF NOT FOUND OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR pg_column_size(p_command)>50000 THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
 END IF;
 kind:=p_command->>'kind';op:=p_command->>'op';
 CASE kind
 WHEN 'driver' THEN tbl:='drivers';scope_col:='org_id';allowed:=ARRAY['name','phone','email','affiliationType','englishAvailable','residence','memo'];
 WHEN 'customer' THEN tbl:='customers';scope_col:='org_id';allowed:=ARRAY['name','contactPerson','phone','email','address','businessNumber'];
 WHEN 'vehicle' THEN tbl:='vehicles';scope_col:='organization_id';allowed:=ARRAY['plate','model','brand','category','categoryLabel','capacity','fuelType','memo'];
 WHEN 'supplier' THEN tbl:='organization_vehicle_suppliers';scope_col:='org_id';allowed:=ARRAY['name'];
 ELSE RAISE EXCEPTION 'INVALID_KIND' USING ERRCODE='22023';
 END CASE;
 IF op IS NULL OR op NOT IN ('list','create','update') THEN RAISE EXCEPTION 'INVALID_OPERATION' USING ERRCODE='22023'; END IF;
 IF op='list' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) x WHERE x NOT IN ('kind','op','cursor','limit')) THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
  page_size:=coalesce((p_command->>'limit')::integer,50);
  cursor_id:=coalesce(p_command->>'cursor','');
  IF page_size NOT BETWEEN 1 AND 100 OR length(cursor_id)>256 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
  -- Identifiers only from the fixed CASE above; values bound as SQL parameters.
  EXECUTE format('SELECT coalesce(jsonb_agg(cockpit.tenant_registry_project_v1($1,r) ORDER BY r->>''id''),''[]''::jsonb) FROM (SELECT to_jsonb(t) r FROM cockpit.%I t WHERE %I=$2 AND id::text>$3 ORDER BY id::text LIMIT $4) q',tbl,scope_col)
    INTO result USING kind,p_org,cursor_id,page_size;
  RETURN jsonb_build_object('records',result,'nextCursor',CASE WHEN jsonb_array_length(result)=page_size THEN result->(page_size-1)->>'id' ELSE NULL END);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) x WHERE x NOT IN ('kind','op','fields','id','revision','requestId')) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
 END IF;
 f:=p_command->'fields';req:=p_command->>'requestId';rid:=p_command->>'id';
 IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR f='{}'::jsonb OR req IS NULL OR length(req) NOT BETWEEN 8 AND 160
   OR (op='create' AND (p_command?'id' OR p_command?'revision'))
   OR (op='update' AND (rid IS NULL OR length(rid) NOT BETWEEN 1 AND 256 OR coalesce(p_command->>'revision','')!~'^[0-9a-f]{64}$')) THEN
  RAISE EXCEPTION 'INVALID_MUTATION' USING ERRCODE='22023';
 END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(f) LOOP
  IF NOT(k=ANY(allowed)) OR (op='update' AND k='plate') THEN RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE='22023'; END IF;
  IF k='englishAvailable' THEN
   IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE='22023'; END IF;
  ELSIF jsonb_typeof(v)<>'string' OR length(f->>k)>CASE WHEN k='memo' THEN 5000 ELSE 500 END THEN
   RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE='22023';
  END IF;
  IF k IN ('name','model','brand','category','categoryLabel','capacity','fuelType','plate') AND length(btrim(f->>k))=0 THEN
   RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE='22023';
  END IF;
 END LOOP;
 IF f?'email' AND f->>'email'<>'' AND (length(f->>'email')>254 OR f->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE='22023'; END IF;
 IF f?'affiliationType' AND f->>'affiliationType' NOT IN ('employed','freelance') THEN RAISE EXCEPTION 'INVALID_AFFILIATION' USING ERRCODE='22023'; END IF;
 IF f?'category' AND f->>'category' NOT IN ('sprinter','staria','carnival','genesis','s_class') THEN RAISE EXCEPTION 'INVALID_CATEGORY' USING ERRCODE='22023'; END IF;
 IF f?'fuelType' AND f->>'fuelType' NOT IN ('디젤','가솔린','하이브리드') THEN RAISE EXCEPTION 'INVALID_FUEL' USING ERRCODE='22023'; END IF;
 digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 SELECT * INTO prior FROM cockpit.organization_registry_requests WHERE org_id=p_org AND request_id=req;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM p_user OR prior.request_digest IS DISTINCT FROM digest THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='40001'; END IF;
  RETURN prior.result;
 END IF;
 IF op='update' THEN
  EXECUTE format('SELECT to_jsonb(t) FROM cockpit.%I t WHERE %I=$1 AND id::text=$2 FOR UPDATE',tbl,scope_col) INTO old_row USING p_org,rid;
  IF old_row IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF encode(sha256(convert_to(old_row::text,'UTF8')),'hex') IS DISTINCT FROM p_command->>'revision' THEN RAISE EXCEPTION 'RESOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 ELSE
  generated_id:=gen_random_uuid();rid:=generated_id::text;
  IF kind IN ('driver','customer','supplier') AND NOT(f?'name') THEN RAISE EXCEPTION 'NAME_REQUIRED' USING ERRCODE='22023'; END IF;
  IF kind='vehicle' AND (NOT(f?&ARRAY['plate','model','brand','category','categoryLabel','capacity','fuelType'])
    OR length(f->>'plate')>60 OR regexp_replace(f->>'plate','[[:space:]-]','','g')!~'[0-9]{3,4}$') THEN
   RAISE EXCEPTION 'VEHICLE_FIELDS_REQUIRED' USING ERRCODE='22023';
  END IF;
 END IF;
 IF kind='driver' THEN
  IF op='create' THEN
   INSERT INTO cockpit.drivers(id,org_id,vehicle_no,car_number,driver_name,phone,english_available,default_navi,vehicle_status,driver_meta)
   VALUES(generated_id,p_org,'DRV-'||generated_id::text,'차량 미등록',btrim(f->>'name'),nullif(f->>'phone',''),
    coalesce((f->>'englishAvailable')::boolean,false),'tmap','available',
    jsonb_build_object('status','active','affiliation',coalesce(f->>'affiliationType','employed'),'residence',coalesce(f->>'residence','미입력'),
      'memo',coalesce(f->>'memo',''),'enrollment_email',nullif(lower(btrim(f->>'email')),''),'createdVia','tenant_hq'))
   RETURNING to_jsonb(drivers) INTO new_row;
  ELSE
   UPDATE cockpit.drivers SET driver_name=CASE WHEN f?'name' THEN btrim(f->>'name') ELSE driver_name END,
    phone=CASE WHEN f?'phone' THEN nullif(f->>'phone','') ELSE phone END,
    english_available=CASE WHEN f?'englishAvailable' THEN (f->>'englishAvailable')::boolean ELSE english_available END,
    driver_meta=coalesce(driver_meta,'{}'::jsonb)
      ||CASE WHEN f?'affiliationType' THEN jsonb_build_object('affiliation',f->>'affiliationType') ELSE '{}'::jsonb END
      ||CASE WHEN f?'residence' THEN jsonb_build_object('residence',f->>'residence') ELSE '{}'::jsonb END
      ||CASE WHEN f?'memo' THEN jsonb_build_object('memo',f->>'memo') ELSE '{}'::jsonb END
      ||CASE WHEN f?'email' THEN jsonb_build_object('enrollment_email',nullif(lower(btrim(f->>'email')),'')) ELSE '{}'::jsonb END
    WHERE org_id=p_org AND id::text=rid RETURNING to_jsonb(drivers) INTO new_row;
  END IF;
 ELSIF kind='customer' THEN
  IF op='create' THEN
   INSERT INTO cockpit.customers(id,org_id,name,contact_person,phone,email,address,business_number,pricing_preset,quotes,created_at,updated_at)
    VALUES(rid,p_org,btrim(f->>'name'),f->>'contactPerson',f->>'phone',f->>'email',f->>'address',f->>'businessNumber','{}','[]',clock_timestamp(),clock_timestamp())
    RETURNING to_jsonb(customers) INTO new_row;
  ELSE
   UPDATE cockpit.customers SET name=coalesce(btrim(f->>'name'),name),contact_person=coalesce(f->>'contactPerson',contact_person),
    phone=coalesce(f->>'phone',phone),email=coalesce(f->>'email',email),address=coalesce(f->>'address',address),
    business_number=coalesce(f->>'businessNumber',business_number),updated_at=clock_timestamp()
    WHERE org_id=p_org AND id=rid RETURNING to_jsonb(customers) INTO new_row;
  END IF;
 ELSIF kind='vehicle' THEN
  IF op='create' THEN
   -- Global physical identity stays unique. Do not return another tenant's details.
   IF EXISTS(SELECT 1 FROM cockpit.vehicles WHERE regexp_replace(plate,'[[:space:]-]','','g')=regexp_replace(f->>'plate','[[:space:]-]','','g')) THEN
    RAISE EXCEPTION 'VEHICLE_IDENTITY_UNAVAILABLE' USING ERRCODE='23505';
   END IF;
   INSERT INTO cockpit.vehicles(id,organization_id,plate,plate_short,model,model_short,brand,category,category_label,sub_type,capacity,fuel_type,profile,updated_by)
   VALUES(generated_id,p_org,btrim(f->>'plate'),right(regexp_replace(f->>'plate','[[:space:]-]','','g'),4),
    btrim(f->>'model'),btrim(f->>'model'),f->>'brand',f->>'category',f->>'categoryLabel',f->>'model',f->>'capacity',f->>'fuelType',
    jsonb_build_object('adminMemo',coalesce(f->>'memo','')),p_user::text) RETURNING to_jsonb(vehicles) INTO new_row;
  ELSE
   UPDATE cockpit.vehicles SET model=coalesce(btrim(f->>'model'),model),model_short=coalesce(btrim(f->>'model'),model_short),
    brand=coalesce(f->>'brand',brand),category=coalesce(f->>'category',category),category_label=coalesce(f->>'categoryLabel',category_label),
    capacity=coalesce(f->>'capacity',capacity),fuel_type=coalesce(f->>'fuelType',fuel_type),
    profile=profile||CASE WHEN f?'memo' THEN jsonb_build_object('adminMemo',f->>'memo') ELSE '{}'::jsonb END,
    updated_by=p_user::text,updated_at=clock_timestamp()
    WHERE organization_id=p_org AND id::text=rid AND NOT archived RETURNING to_jsonb(vehicles) INTO new_row;
  END IF;
 ELSE
  IF op='create' THEN
   INSERT INTO cockpit.organization_vehicle_suppliers(org_id,id,display_name) VALUES(p_org,generated_id,btrim(f->>'name')) RETURNING to_jsonb(organization_vehicle_suppliers) INTO new_row;
  ELSE
   UPDATE cockpit.organization_vehicle_suppliers SET display_name=btrim(f->>'name') WHERE org_id=p_org AND id::text=rid RETURNING to_jsonb(organization_vehicle_suppliers) INTO new_row;
  END IF;
 END IF;
 IF new_row IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 projected:=cockpit.tenant_registry_project_v1(kind,new_row);
 -- Store only the non-PII reference/revision for idempotent replay, not full profile.
 result:=jsonb_build_object('id',projected->'id','revision',projected->'revision');
 INSERT INTO cockpit.organization_registry_requests(org_id,request_id,actor_id,request_digest,result) VALUES(p_org,req,p_user,digest,result);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.tenant_registry_v1(text,uuid,uuid,jsonb),cockpit.tenant_registry_project_v1(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.tenant_registry_v1(text,uuid,uuid,jsonb),cockpit.tenant_registry_project_v1(text,jsonb) TO service_role;
COMMIT;
