-- Proposal: apply with the coordinated personal-auth/atomic-dispatch release, after staging validation.
-- Custody is physical possession, not GPS motion or the driver's work clock.
BEGIN;
CREATE TABLE IF NOT EXISTS cockpit.vehicle_custodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL CHECK (organization_id='vip_limousine_korea'),
  driver_id uuid NOT NULL REFERENCES cockpit.drivers(id), driver_name text NOT NULL,
  booking_id uuid NOT NULL REFERENCES cockpit.schedules(id), booking_version integer NOT NULL CHECK (booking_version>0),
  vehicle_id uuid NOT NULL, vehicle_plate text NOT NULL,
  pickup_odometer integer NOT NULL CHECK (pickup_odometer BETWEEN 0 AND 9999999),
  pickup_details jsonb NOT NULL, picked_up_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  picked_up_by text NOT NULL, pickup_request_id text NOT NULL, return_request_id text, expected_return_at timestamptz NOT NULL,
  return_odometer integer, return_details jsonb, returned_at timestamptz, returned_by text,
  CHECK ((returned_at IS NULL AND return_odometer IS NULL AND returned_by IS NULL) OR
    (returned_at IS NOT NULL AND return_odometer>=pickup_odometer AND returned_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_custodies_one_vehicle ON cockpit.vehicle_custodies(organization_id,vehicle_id) WHERE returned_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_custodies_one_driver ON cockpit.vehicle_custodies(organization_id,driver_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS vehicle_custodies_booking ON cockpit.vehicle_custodies(organization_id,booking_id,picked_up_at DESC);
CREATE TABLE IF NOT EXISTS cockpit.vehicle_custody_requests (
  request_id text PRIMARY KEY, organization_id text NOT NULL CHECK (organization_id='vip_limousine_korea'),
  actor_id text NOT NULL, driver_id uuid NOT NULL REFERENCES cockpit.drivers(id), driver_name text NOT NULL,
  booking_id uuid NOT NULL REFERENCES cockpit.schedules(id),
  request_payload jsonb NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz, resolved_by text, resolution_note text
);
CREATE INDEX IF NOT EXISTS vehicle_custody_unresolved ON cockpit.vehicle_custody_requests(organization_id,created_at DESC)
  WHERE result->>'outcome'='mismatch' AND resolved_at IS NULL;
ALTER TABLE cockpit.vehicle_custodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.vehicle_custody_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.vehicle_custodies,cockpit.vehicle_custody_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON cockpit.vehicle_custodies,cockpit.vehicle_custody_requests TO service_role;

CREATE OR REPLACE FUNCTION cockpit.commit_vehicle_custody(p_org text,p_driver_id uuid,p_actor_id text,p_request_id text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s cockpit.schedules; c cockpit.vehicle_custodies; previous cockpit.vehicle_custody_requests;
  driver_json jsonb; outcome_json jsonb; action text:=p_data->>'action'; current_version integer;
  chosen uuid:=(p_data->>'vehicleId')::uuid; details jsonb:=p_data->'inspection';
  odo integer:=(p_data->'inspection'->>'odometer')::integer; booking uuid;
  at_time timestamptz:=clock_timestamp(); return_at timestamptz;
BEGIN
  IF current_user<>'service_role' OR p_org IS DISTINCT FROM 'vip_limousine_korea' OR p_driver_id IS NULL OR nullif(p_actor_id,'') IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF action IS NULL OR action NOT IN ('pickup','return') OR p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 8 AND 200
    OR chosen IS NULL OR p_data->>'confirmed' IS DISTINCT FROM 'true'
    OR odo IS NULL OR odo NOT BETWEEN 0 AND 9999999 OR jsonb_typeof(details) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_CUSTODY_INPUT' USING ERRCODE='22023';
  END IF;
  -- Same serialization boundary as atomic dispatch; no process-local locks or compensating deletes.
  PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
  SELECT * INTO previous FROM cockpit.vehicle_custody_requests WHERE request_id=p_request_id;
  IF FOUND THEN
    IF previous.organization_id IS DISTINCT FROM p_org OR previous.actor_id IS DISTINCT FROM p_actor_id OR previous.driver_id IS DISTINCT FROM p_driver_id
      OR previous.request_payload IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='40001'; END IF;
    RETURN previous.result;
  END IF;
  SELECT to_jsonb(d) INTO driver_json FROM cockpit.drivers d WHERE id=p_driver_id FOR SHARE;
  IF NOT FOUND OR (action='pickup' AND driver_json->'driver_meta'->>'status'='inactive') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF action='return' THEN
    SELECT * INTO c FROM cockpit.vehicle_custodies WHERE id=(p_data->>'custodyId')::uuid AND organization_id=p_org AND driver_id=p_driver_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CUSTODY_NOT_FOUND' USING ERRCODE='42501'; END IF;
    IF c.returned_at IS NOT NULL THEN RAISE EXCEPTION 'CUSTODY_ALREADY_RETURNED' USING ERRCODE='40001'; END IF;
    IF chosen IS DISTINCT FROM c.vehicle_id OR p_data->>'vehiclePlate' IS DISTINCT FROM c.vehicle_plate OR odo<c.pickup_odometer THEN
      RAISE EXCEPTION 'INVALID_RETURN_VEHICLE_OR_ODOMETER' USING ERRCODE='22023';
    END IF;
    -- The original owner can return physical custody even after dispatch cancellation/reassignment.
    UPDATE cockpit.vehicle_custodies SET return_odometer=odo,return_details=details,returned_at=at_time,returned_by=p_actor_id,return_request_id=p_request_id WHERE id=c.id RETURNING * INTO c;
    booking:=c.booking_id;
    outcome_json:=jsonb_build_object('ok',true,'outcome','returned','custody',to_jsonb(c),'requestId',p_request_id);
  ELSE
    booking:=(p_data->>'bookingId')::uuid;
    SELECT * INTO s FROM cockpit.schedules WHERE id=booking FOR UPDATE;
    IF NOT FOUND OR coalesce(s.org_id,'vip_limousine_korea') IS DISTINCT FROM p_org OR s.driver_id IS DISTINCT FROM p_driver_id THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
    END IF;
    current_version:=coalesce((to_jsonb(s)->>'version')::integer,(s.schedule_meta->>'version')::integer,1);
    IF NOT cockpit.dispatch_is_active(s) OR s.status IN ('cancelled','completed') OR coalesce(s.schedule_meta->>'serviceMode','with_driver')='vehicle_only'
      OR s.vehicle_id IS NULL OR current_version IS DISTINCT FROM (p_data->>'expectedVersion')::integer THEN
      RAISE EXCEPTION 'CUSTODY_STALE_ASSIGNMENT' USING ERRCODE='40001';
    END IF;
    return_at:=cockpit.dispatch_end(s)-interval '60 minutes';
    IF s.end_time IS NULL OR at_time<cockpit.dispatch_start(s)-interval '6 hours' OR at_time>return_at+interval '6 hours' THEN
      RAISE EXCEPTION 'CUSTODY_OUTSIDE_SHIFT_WINDOW' USING ERRCODE='22023';
    END IF;
    IF chosen IS DISTINCT FROM s.vehicle_id THEN
      IF length(trim(coalesce(p_data->>'reason',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'MISMATCH_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
      outcome_json:=jsonb_build_object('ok',true,'outcome','mismatch','assignedPlate',coalesce(s.vehicle_plate,s.schedule_meta->>'vehiclePlate',s.vehicle_no),
        'actualPlate',p_data->>'vehiclePlate','hasPhoto',details ? 'photoPath','reason',p_data->>'reason','requestId',p_request_id);
    ELSE
      IF regexp_replace(coalesce(s.vehicle_plate,s.schedule_meta->>'vehiclePlate',s.vehicle_no),'\s','','g') IS DISTINCT FROM regexp_replace(p_data->>'vehiclePlate','\s','','g') THEN
        RAISE EXCEPTION 'INVALID_CUSTODY_PLATE' USING ERRCODE='22023';
      END IF;
      IF EXISTS(SELECT 1 FROM cockpit.fleet_vehicle_operations WHERE vehicle_id=chosen AND status='정비 중') THEN RAISE EXCEPTION 'CUSTODY_MAINTENANCE' USING ERRCODE='23P01'; END IF;
      IF EXISTS(SELECT 1 FROM cockpit.vehicle_custodies WHERE organization_id=p_org AND returned_at IS NULL AND (vehicle_id=chosen OR driver_id=p_driver_id)) THEN
        RAISE EXCEPTION 'CUSTODY_ALREADY_IN_USE' USING ERRCODE='23P01';
      END IF;
      IF EXISTS(SELECT 1 FROM cockpit.schedules other WHERE other.id<>s.id AND coalesce(other.org_id,p_org)=p_org AND cockpit.dispatch_is_active(other)
        AND other.status IS DISTINCT FROM 'completed' AND other.operation_status IS DISTINCT FROM 'completed'
        AND (other.vehicle_id=chosen OR other.driver_id=p_driver_id) AND cockpit.dispatch_start(other)<cockpit.dispatch_end(s)
        AND cockpit.dispatch_end(other)>at_time) THEN RAISE EXCEPTION 'CUSTODY_OTHER_ASSIGNMENT_ACTIVE' USING ERRCODE='23P01'; END IF;
      IF EXISTS(SELECT 1 FROM cockpit.vehicle_custodies WHERE organization_id=p_org AND vehicle_id=chosen AND return_odometer>odo) THEN
        RAISE EXCEPTION 'CUSTODY_ODOMETER_BELOW_PREVIOUS_RETURN' USING ERRCODE='22023';
      END IF;
      INSERT INTO cockpit.vehicle_custodies(organization_id,driver_id,driver_name,booking_id,booking_version,vehicle_id,vehicle_plate,pickup_odometer,pickup_details,picked_up_by,pickup_request_id,expected_return_at)
        VALUES(p_org,p_driver_id,coalesce(driver_json->>'driver_name','담당 기사'),booking,current_version,chosen,p_data->>'vehiclePlate',odo,details,p_actor_id,p_request_id,return_at) RETURNING * INTO c;
      UPDATE cockpit.vehicle_custody_requests SET resolved_at=at_time,resolved_by=p_actor_id,resolution_note='최신 배차와 실제 차량 일치 확인 후 인수'
        WHERE organization_id=p_org AND booking_id=booking AND driver_id=p_driver_id AND result->>'outcome'='mismatch' AND resolved_at IS NULL;
      outcome_json:=jsonb_build_object('ok',true,'outcome','picked_up','custody',to_jsonb(c),'requestId',p_request_id);
    END IF;
  END IF;
  INSERT INTO cockpit.vehicle_custody_requests(request_id,organization_id,actor_id,driver_id,driver_name,booking_id,request_payload,result)
    VALUES(p_request_id,p_org,p_actor_id,p_driver_id,coalesce(driver_json->>'driver_name','담당 기사'),booking,p_data,outcome_json);
  RETURN outcome_json;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.commit_vehicle_custody(text,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_vehicle_custody(text,uuid,text,text,jsonb) TO service_role;

-- Both availability and dispatch respect unreturned possession. Expired expected returns are open holds.
CREATE OR REPLACE FUNCTION cockpit.guard_custody_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c cockpit.vehicle_custodies; hold_end timestamptz;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.driver_id,NEW.vehicle_id) IS DISTINCT FROM ROW(OLD.driver_id,OLD.vehicle_id)
      AND EXISTS(SELECT 1 FROM cockpit.vehicle_custodies WHERE booking_id=OLD.id AND returned_at IS NULL) THEN
      RAISE EXCEPTION 'CUSTODY_RETURN_REQUIRED_BEFORE_REASSIGNMENT' USING ERRCODE='23P01';
    END IF;
    IF ROW(NEW.date,NEW.pickup_time,NEW.end_date,NEW.end_time,NEW.driver_id,NEW.vehicle_id,NEW.dispatch_status)
      IS NOT DISTINCT FROM ROW(OLD.date,OLD.pickup_time,OLD.end_date,OLD.end_time,OLD.driver_id,OLD.vehicle_id,OLD.dispatch_status) THEN RETURN NEW; END IF;
  END IF;
  IF NOT cockpit.dispatch_is_active(NEW) THEN RETURN NEW; END IF;
  FOR c IN SELECT * FROM cockpit.vehicle_custodies WHERE organization_id=NEW.org_id AND returned_at IS NULL AND booking_id<>NEW.id
    AND (vehicle_id=NEW.vehicle_id OR driver_id=NEW.driver_id) LOOP
    hold_end:=CASE WHEN c.expected_return_at<=clock_timestamp() THEN 'infinity'::timestamptz ELSE c.expected_return_at+interval '60 minutes' END;
    IF cockpit.dispatch_start(NEW)<hold_end AND cockpit.dispatch_end(NEW)>c.picked_up_at THEN
      RAISE EXCEPTION 'CUSTODY_VEHICLE_OR_DRIVER_HELD' USING ERRCODE='23P01';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_custody_dispatch ON cockpit.schedules;
CREATE TRIGGER guard_custody_dispatch BEFORE INSERT OR UPDATE ON cockpit.schedules FOR EACH ROW EXECUTE FUNCTION cockpit.guard_custody_dispatch();
REVOKE ALL ON FUNCTION cockpit.guard_custody_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.guard_custody_dispatch() TO service_role;
COMMIT;
