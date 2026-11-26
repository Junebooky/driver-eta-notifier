-- REVIEW ONLY. No operating DB migration. Existing VIP trigger and RPC are preserved.
BEGIN;
-- Supplier relationships reuse the physical vehicles table; never invent a plate.
CREATE TABLE cockpit.organization_vehicle_suppliers (
 org_id text NOT NULL REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 160),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(org_id,id)
);
CREATE UNIQUE INDEX vehicles_taas_org_identity_idx ON cockpit.vehicles(organization_id,id);
CREATE TABLE cockpit.organization_vehicle_supply (
 org_id text NOT NULL,
 vehicle_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 supply_kind text NOT NULL CHECK(supply_kind IN ('supplier','temporary')),
 valid_from timestamptz,
 valid_until timestamptz,
 PRIMARY KEY(org_id,vehicle_id),
 FOREIGN KEY(org_id,vehicle_id) REFERENCES cockpit.vehicles(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(org_id,supplier_id) REFERENCES cockpit.organization_vehicle_suppliers(org_id,id) ON DELETE RESTRICT,
 CHECK(supply_kind<>'temporary' OR (valid_from IS NOT NULL AND valid_until IS NOT NULL)),
 CHECK(valid_from IS NULL OR valid_until IS NULL OR valid_until>valid_from)
);
ALTER TABLE cockpit.organization_vehicle_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.organization_vehicle_supply ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.organization_vehicle_suppliers,cockpit.organization_vehicle_supply FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cockpit.organization_vehicle_suppliers,cockpit.organization_vehicle_supply TO service_role;

-- Shared transaction-level availability validation. Must be called under the
-- same lock as existing dispatch and custody. No other-tenant details returned.
CREATE FUNCTION cockpit.assert_tenant_dispatch_ready_v1(s cockpit.schedules)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v cockpit.vehicles; d cockpit.drivers; supply cockpit.organization_vehicle_supply;
 w jsonb; start_at timestamptz; end_at timestamptz; off_start timestamptz; off_end timestamptz;
 mode text; points jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
 PERFORM 1 FROM cockpit.organizations o WHERE o.id=s.org_id AND o.status='active' AND o.runtime_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF s.date IS NULL OR s.pickup_time IS NULL OR s.end_time IS NULL OR s.pickup_time>=time '24:00' OR s.end_time>=time '24:00'
   OR NOT isfinite(s.date) OR NOT isfinite(coalesce(s.end_date,s.date)) THEN
  RAISE EXCEPTION 'INVALID_DISPATCH_INTERVAL' USING ERRCODE='23514';
 END IF;
 start_at:=cockpit.dispatch_start(s); end_at:=cockpit.dispatch_end(s);
 IF end_at-interval '60 minutes'<=start_at THEN RAISE EXCEPTION 'INVALID_DISPATCH_INTERVAL' USING ERRCODE='23514'; END IF;
 mode:=coalesce(s.schedule_meta->>'serviceMode','with_driver');
 IF mode NOT IN ('with_driver','vehicle_only') OR (mode='vehicle_only' AND s.driver_id IS NOT NULL) THEN
  RAISE EXCEPTION 'INVALID_SERVICE_MODE' USING ERRCODE='23514';
 END IF;
 points:=s.schedule_meta->'routeWaypoints';
 IF jsonb_typeof(points) IS DISTINCT FROM 'array' OR jsonb_array_length(points) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'ROUTE_NOT_VERIFIED' USING ERRCODE='23514';
 END IF;
 FOR w IN SELECT value FROM jsonb_array_elements(points) LOOP
  IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR jsonb_typeof(w->'location') IS DISTINCT FROM 'string'
    OR length(btrim(coalesce(w->>'location','')))=0 OR w->>'date' IS DISTINCT FROM s.date::text
    OR w->'isPoiConfirmed' IS DISTINCT FROM 'true'::jsonb
    OR jsonb_typeof(w->'lat') IS DISTINCT FROM 'number' OR jsonb_typeof(w->'lng') IS DISTINCT FROM 'number'
    OR abs((w->>'lat')::numeric)>90 OR abs((w->>'lng')::numeric)>180 THEN
   RAISE EXCEPTION 'ROUTE_NOT_VERIFIED' USING ERRCODE='23514';
  END IF;
 END LOOP;
 SELECT * INTO v FROM cockpit.vehicles WHERE id=s.vehicle_id AND organization_id=s.org_id AND NOT archived FOR SHARE;
 IF NOT FOUND OR cockpit.dispatch_plate(s) IS DISTINCT FROM regexp_replace(v.plate,'[[:space:]-]','','g')
   OR cockpit.dispatch_plate(s) IN ('','미배정','차량미지정') THEN
  RAISE EXCEPTION 'VEHICLE_NOT_OWNED' USING ERRCODE='42501';
 END IF;
 IF v.status IN ('maintenance','정비 중') OR EXISTS(SELECT 1 FROM cockpit.fleet_vehicle_operations o
    WHERE o.vehicle_id=v.id AND o.organization_id=s.org_id AND o.status='정비 중') THEN
  RAISE EXCEPTION 'VEHICLE_MAINTENANCE' USING ERRCODE='23P01';
 END IF;
 SELECT * INTO supply FROM cockpit.organization_vehicle_supply x WHERE x.org_id=s.org_id AND x.vehicle_id=v.id FOR SHARE;
 IF FOUND THEN
  PERFORM 1 FROM cockpit.organization_vehicle_suppliers x WHERE x.org_id=s.org_id AND x.id=supply.supplier_id AND x.active FOR SHARE;
  IF NOT FOUND OR (supply.valid_from IS NOT NULL AND start_at<supply.valid_from)
    OR (supply.valid_until IS NOT NULL AND end_at>supply.valid_until) THEN
   RAISE EXCEPTION 'SUPPLIER_NOT_AVAILABLE' USING ERRCODE='23P01';
  END IF;
 END IF;
 IF s.customer_id IS NOT NULL THEN
  PERFORM 1 FROM cockpit.customers c WHERE c.id=s.customer_id AND c.org_id=s.org_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_OWNED' USING ERRCODE='42501'; END IF;
 END IF;
 IF mode='with_driver' THEN
  SELECT * INTO d FROM cockpit.drivers WHERE id=s.driver_id AND org_id=s.org_id AND driver_meta->>'status'='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DRIVER_NOT_OWNED' USING ERRCODE='42501'; END IF;
  IF s.schedule_meta->>'requestedLanguage'='en' AND d.english_available IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'DRIVER_LANGUAGE_NOT_VERIFIED' USING ERRCODE='23514';
  END IF;
  FOR w IN SELECT value FROM jsonb_array_elements(coalesce(nullif(to_jsonb(d)->'unavailable_windows','null'::jsonb),'[]'::jsonb)) LOOP
   IF w->>'start_at' IS NOT NULL AND w->>'end_at' IS NOT NULL THEN
    off_start:=(w->>'start_at')::timestamptz;off_end:=(w->>'end_at')::timestamptz;
   ELSE
    off_start:=((coalesce(w->>'startDate',w->>'start_date'))::date+coalesce(w->>'startTime',w->>'start_time','00:00')::time) AT TIME ZONE 'Asia/Seoul';
    off_end:=((coalesce(w->>'endDate',w->>'end_date',w->>'startDate',w->>'start_date'))::date+coalesce(w->>'endTime',w->>'end_time','23:59')::time) AT TIME ZONE 'Asia/Seoul';
   END IF;
   IF off_start IS NULL OR off_end IS NULL OR off_end<=off_start OR (off_start<end_at AND start_at<off_end) THEN
    RAISE EXCEPTION 'DRIVER_UNAVAILABLE_WINDOW' USING ERRCODE='23P01';
   END IF;
  END LOOP;
 END IF;
 -- UUIDs are global physical identities; block a collision even if historical
 -- ownership is inconsistent. Do not match another company's driver by name.
 IF EXISTS(SELECT 1 FROM cockpit.schedules ex WHERE ex.id<>s.id AND cockpit.dispatch_is_active(ex)
   AND cockpit.dispatch_start(ex)<end_at AND start_at<cockpit.dispatch_end(ex)
   AND (ex.vehicle_id=s.vehicle_id OR cockpit.dispatch_plate(ex)=cockpit.dispatch_plate(s)
     OR (mode='with_driver' AND coalesce(ex.schedule_meta->>'serviceMode','with_driver')<>'vehicle_only' AND ex.driver_id=s.driver_id))) THEN
  RAISE EXCEPTION 'SCHEDULE_CONFLICT' USING ERRCODE='23P01';
 END IF;
 IF EXISTS(SELECT 1 FROM cockpit.vehicle_custodies c WHERE c.returned_at IS NULL AND c.booking_id<>s.id
   AND (c.vehicle_id=s.vehicle_id OR (mode='with_driver' AND c.driver_id=s.driver_id))
   AND start_at<CASE WHEN c.expected_return_at<=clock_timestamp() THEN 'infinity'::timestamptz ELSE c.expected_return_at+interval '60 minutes' END
   AND end_at>c.picked_up_at) THEN
  RAISE EXCEPTION 'CUSTODY_VEHICLE_OR_DRIVER_HELD' USING ERRCODE='23P01';
 END IF;
END;
$$;

-- Candidate rows alone use the new trigger; original VIP and unmarked paths
-- still call the original guard. No legacy function body changed.
-- Scope change/marker removal is forbidden for existing candidate rows.
CREATE FUNCTION cockpit.guard_tenant_dispatch_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.schedule_meta->>'taasDraftV1'='true' AND
    (NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.schedule_meta->>'taasDraftV1' IS DISTINCT FROM 'true') THEN
   RAISE EXCEPTION 'TENANT_SCOPE_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  IF OLD.schedule_meta->>'taasDraftV1' IS DISTINCT FROM 'true' AND NEW.schedule_meta->>'taasDraftV1'='true' THEN
   RAISE EXCEPTION 'LEGACY_RECORD_IMMUTABLE' USING ERRCODE='42501';
  END IF;
 END IF;
 IF NEW.schedule_meta->>'taasDraftV1'='true' THEN
  IF cockpit.dispatch_is_active(NEW) THEN
   PERFORM cockpit.assert_tenant_dispatch_ready_v1(NEW);
  ELSE
   PERFORM 1 FROM cockpit.organizations o WHERE o.id=NEW.org_id AND o.status='active' AND o.runtime_enabled FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_tenant_dispatch_v1 BEFORE INSERT OR UPDATE ON cockpit.schedules
 FOR EACH ROW EXECUTE FUNCTION cockpit.guard_tenant_dispatch_v1();
DROP TRIGGER guard_dispatch_schedule ON cockpit.schedules;
CREATE TRIGGER guard_dispatch_schedule BEFORE INSERT OR UPDATE ON cockpit.schedules
 FOR EACH ROW WHEN (NEW.org_id IS NULL OR NEW.org_id='vip_limousine_korea' OR (NEW.schedule_meta->>'taasDraftV1') IS DISTINCT FROM 'true')
 EXECUTE FUNCTION cockpit.guard_dispatch_schedule();

-- Atomic confirmation of already persisted, owned, unchanged drafts.
-- No notification, payment or API activation in this proposal.
CREATE FUNCTION cockpit.publish_tenant_dispatch_v1(p_org text,p_user uuid,p_session uuid,p_request text,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; s cockpit.schedules; saved cockpit.schedules; prior cockpit.dispatch_requests;
 req text; payload jsonb; result jsonb:='[]'::jsonb; sid uuid;
BEGIN
 IF current_user<>'service_role' OR p_org IS NULL OR p_user IS NULL OR p_session IS NULL THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
 PERFORM 1 FROM cockpit.organizations o WHERE o.id=p_org AND o.status='active' AND o.runtime_enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cockpit.organization_members m WHERE m.org_id=p_org AND m.user_id=p_user AND m.status='active'
   AND m.role IN ('company_owner','company_admin') AND m.driver_id IS NULL FOR SHARE;
 IF NOT FOUND OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR length(p_request) NOT BETWEEN 1 AND 160 OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 OR pg_column_size(p_items)>100000 THEN
  RAISE EXCEPTION 'INVALID_BATCH' USING ERRCODE='22023';
 END IF;
 req:='taas:publish:v1:'||p_request;payload:=jsonb_build_object('actor',p_user,'items',p_items);
 SELECT * INTO prior FROM cockpit.dispatch_requests WHERE organization_id=p_org AND request_id=req;
 IF FOUND THEN
  IF prior.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='40001'; END IF;
  RETURN prior.result;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('id','expected_updated_at'))
    OR item->>'id' IS NULL OR item->>'expected_updated_at' IS NULL THEN
   RAISE EXCEPTION 'INVALID_ITEM' USING ERRCODE='22023';
  END IF;
  sid:=(item->>'id')::uuid;
  SELECT * INTO s FROM cockpit.schedules WHERE id=sid AND org_id=p_org FOR UPDATE;
  IF NOT FOUND OR s.dispatch_status IS DISTINCT FROM 'draft' OR s.status IS DISTINCT FROM 'draft' OR s.schedule_meta->>'taasDraftV1' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'DRAFT_NOT_FOUND_OR_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  IF s.updated_at IS DISTINCT FROM (item->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'DRAFT_CHANGED' USING ERRCODE='40001'; END IF;
  PERFORM cockpit.assert_tenant_dispatch_ready_v1(s);
  UPDATE cockpit.schedules SET status='scheduled',dispatch_status='published',
   schedule_meta=s.schedule_meta||jsonb_build_object('dispatchStatus','published'),
   updated_at=clock_timestamp()
   WHERE id=sid AND org_id=p_org RETURNING * INTO saved;
  result:=result||jsonb_build_array(jsonb_build_object('id',saved.id,'org_id',saved.org_id,'dispatch_status',saved.dispatch_status,'updated_at',saved.updated_at));
 END LOOP;
 IF cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO cockpit.dispatch_requests(organization_id,request_id,request_payload,result) VALUES(p_org,req,payload,result);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.assert_tenant_dispatch_ready_v1(cockpit.schedules),cockpit.guard_tenant_dispatch_v1(),cockpit.publish_tenant_dispatch_v1(text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.assert_tenant_dispatch_ready_v1(cockpit.schedules),cockpit.guard_tenant_dispatch_v1(),cockpit.publish_tenant_dispatch_v1(text,uuid,uuid,text,jsonb) TO service_role;
COMMIT;
