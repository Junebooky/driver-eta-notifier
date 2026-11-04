-- PROPOSAL: review/approval required before applying to a shared database.
-- Replaces the earlier no-op/compensating-rollback design. No live data is rewritten.
-- cockpit.schedules is the existing table. This migration does not require PR #38.
BEGIN;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS driver_id uuid;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS vehicle_id uuid;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS org_id text DEFAULT 'vip_limousine_korea';
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS dispatch_status text;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS schedule_meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS vehicle_plate text;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS driver_name text;

-- The legacy vehicle_no -> drivers.vehicle_no FK conflates people and vehicles.
-- Remove only that FK; driver records are never created as a side effect of booking.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_catalog.pg_constraint
    WHERE conrelid = 'cockpit.schedules'::regclass AND contype = 'f'
      AND confrelid = 'cockpit.drivers'::regclass
      AND pg_catalog.pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (vehicle_no)%'
  LOOP EXECUTE format('ALTER TABLE cockpit.schedules DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='cockpit.schedules'::regclass AND conname='schedules_driver_id_fkey') THEN
    ALTER TABLE cockpit.schedules ADD CONSTRAINT schedules_driver_id_fkey FOREIGN KEY(driver_id) REFERENCES cockpit.drivers(id) NOT VALID;
  END IF;
END $$;
GRANT USAGE ON SCHEMA cockpit TO service_role;
-- Row-level FOR SHARE requires UPDATE privilege as well as SELECT. Clients receive neither.
GRANT SELECT, UPDATE ON cockpit.drivers TO service_role;

CREATE TABLE IF NOT EXISTS cockpit.fleet_vehicle_operations (
  vehicle_id uuid PRIMARY KEY,
  organization_id text NOT NULL CHECK (organization_id = 'vip_limousine_korea'),
  plate text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT '확인 필요' CHECK (status IN ('확인 필요','대기 중','운행 중','정비 중')),
  memo text NOT NULL DEFAULT '' CHECK (length(memo) <= 5000),
  color text NOT NULL DEFAULT '' CHECK (length(color) <= 100),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cockpit.dispatch_requests (
  organization_id text NOT NULL,
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 200),
  request_payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, request_id)
);
ALTER TABLE cockpit.fleet_vehicle_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.dispatch_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.fleet_vehicle_operations, cockpit.dispatch_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON cockpit.fleet_vehicle_operations, cockpit.dispatch_requests TO service_role;

CREATE OR REPLACE FUNCTION cockpit.dispatch_is_active(s cockpit.schedules)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(s.dispatch_status, s.schedule_meta->>'dispatchStatus',
    CASE WHEN s.status IN ('draft','unassigned','cancelled') THEN s.status ELSE 'published' END) = 'published'
    AND coalesce(s.status,'') NOT IN ('cancelled','completed');
$$;
CREATE OR REPLACE FUNCTION cockpit.dispatch_start(s cockpit.schedules)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (s.date + coalesce(s.pickup_time, time '00:00')) AT TIME ZONE 'Asia/Seoul';
$$;
CREATE OR REPLACE FUNCTION cockpit.dispatch_end(s cockpit.schedules)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  -- Unknown legacy end times are open holds, never guessed as 18:00/23:59.
  SELECT CASE WHEN s.end_time IS NULL THEN 'infinity'::timestamptz
    ELSE ((coalesce(s.end_date,s.date) + s.end_time) AT TIME ZONE 'Asia/Seoul') + interval '60 minutes' END;
$$;
CREATE OR REPLACE FUNCTION cockpit.dispatch_plate(s cockpit.schedules)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT regexp_replace(coalesce(nullif(s.vehicle_plate,''), nullif(s.schedule_meta->>'vehiclePlate',''), s.vehicle_no, ''), '[[:space:]-]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION cockpit.guard_dispatch_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE s cockpit.schedules; changed boolean; driver_json jsonb; w jsonb; unavailable_start timestamptz; unavailable_end timestamptz;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(748201, 10);
  IF NOT cockpit.dispatch_is_active(NEW) THEN RETURN NEW; END IF;
  changed := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    changed := ROW(NEW.date,NEW.pickup_time,NEW.end_date,NEW.end_time,NEW.driver_id,NEW.vehicle_id,NEW.vehicle_plate,NEW.vehicle_no,NEW.dispatch_status)
      IS DISTINCT FROM ROW(OLD.date,OLD.pickup_time,OLD.end_date,OLD.end_time,OLD.driver_id,OLD.vehicle_id,OLD.vehicle_plate,OLD.vehicle_no,OLD.dispatch_status);
  END IF;
  -- Allow unrelated acknowledgments/notes on legacy holds without inventing an end.
  IF NOT changed THEN RETURN NEW; END IF;
  IF NEW.org_id IS DISTINCT FROM 'vip_limousine_korea' OR NEW.date IS NULL OR NEW.pickup_time IS NULL
    OR NEW.end_time IS NULL OR NEW.pickup_time >= time '24:00' OR NEW.end_time >= time '24:00'
    OR cockpit.dispatch_end(NEW) - interval '60 minutes' <= cockpit.dispatch_start(NEW)
    OR NEW.vehicle_id IS NULL OR cockpit.dispatch_plate(NEW) IN ('','미배정','차량미지정') THEN
    RAISE EXCEPTION 'INVALID_DISPATCH_INTERVAL_OR_ASSIGNMENT' USING ERRCODE = '23514';
  END IF;
  IF coalesce(NEW.schedule_meta->>'serviceMode','with_driver') <> 'vehicle_only' AND NEW.driver_id IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_DRIVER_ID_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF coalesce(NEW.schedule_meta->>'serviceMode','with_driver') <> 'vehicle_only' THEN
    SELECT to_jsonb(d) INTO driver_json FROM cockpit.drivers d WHERE d.id=NEW.driver_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VERIFIED_DRIVER_REQUIRED' USING ERRCODE='23514'; END IF;
    IF driver_json->'driver_meta'->>'status' = 'inactive' THEN
      RAISE EXCEPTION 'DRIVER_UNAVAILABLE' USING ERRCODE='23P01';
    END IF;
    IF NEW.schedule_meta->>'requestedLanguage' = 'en' AND coalesce((driver_json->>'english_available')::boolean,false)=false
      AND coalesce((NEW.schedule_meta->>'languageOverrideConfirmed')::boolean,false)=false THEN
      RAISE EXCEPTION 'DRIVER_LANGUAGE_NOT_VERIFIED' USING ERRCODE='23514';
    END IF;
    IF nullif(driver_json->>'driver_name','') IS NOT NULL THEN
      NEW.driver_name := driver_json->>'driver_name';
      NEW.schedule_meta := jsonb_set(coalesce(NEW.schedule_meta,'{}'::jsonb),'{driverName}',to_jsonb(NEW.driver_name));
    END IF;
    FOR w IN SELECT value FROM jsonb_array_elements(coalesce(nullif(driver_json->'unavailable_windows','null'::jsonb),'[]'::jsonb)) LOOP
      IF w->>'start_at' IS NOT NULL AND w->>'end_at' IS NOT NULL THEN
        unavailable_start := (w->>'start_at')::timestamptz;
        unavailable_end := (w->>'end_at')::timestamptz;
      ELSE
        unavailable_start := ((coalesce(w->>'startDate',w->>'start_date'))::date + coalesce(w->>'startTime',w->>'start_time','00:00')::time) AT TIME ZONE 'Asia/Seoul';
        unavailable_end := ((coalesce(w->>'endDate',w->>'end_date',w->>'startDate',w->>'start_date'))::date + coalesce(w->>'endTime',w->>'end_time','23:59')::time) AT TIME ZONE 'Asia/Seoul';
      END IF;
      IF unavailable_start IS NULL OR unavailable_end IS NULL OR unavailable_end <= unavailable_start
        OR (unavailable_start < cockpit.dispatch_end(NEW) AND cockpit.dispatch_start(NEW) < unavailable_end) THEN
        RAISE EXCEPTION 'DRIVER_UNAVAILABLE_WINDOW' USING ERRCODE='23P01';
      END IF;
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM cockpit.fleet_vehicle_operations o WHERE o.vehicle_id = NEW.vehicle_id AND o.status = '정비 중') THEN
    RAISE EXCEPTION 'VEHICLE_MAINTENANCE' USING ERRCODE = '23P01';
  END IF;
  FOR s IN SELECT * FROM cockpit.schedules ex WHERE ex.id <> NEW.id AND cockpit.dispatch_is_active(ex)
    AND coalesce(ex.org_id,'vip_limousine_korea') = NEW.org_id
    AND cockpit.dispatch_start(ex) < cockpit.dispatch_end(NEW)
    AND cockpit.dispatch_start(NEW) < cockpit.dispatch_end(ex)
  LOOP
    IF (NEW.vehicle_id IS NOT NULL AND NEW.vehicle_id = s.vehicle_id)
      OR cockpit.dispatch_plate(NEW) = cockpit.dispatch_plate(s)
      OR (coalesce(NEW.schedule_meta->>'serviceMode','with_driver') <> 'vehicle_only'
        AND coalesce(s.schedule_meta->>'serviceMode','with_driver') <> 'vehicle_only'
        AND CASE WHEN s.driver_id IS NOT NULL THEN s.driver_id = NEW.driver_id
          ELSE nullif(regexp_replace(coalesce(s.driver_name,s.schedule_meta->>'driverName',''), '\s*기사(님)?$', ''),'')
            = nullif(regexp_replace(coalesce(NEW.driver_name,''), '\s*기사(님)?$', ''),'') END) THEN
      RAISE EXCEPTION 'SCHEDULE_CONFLICT: %', s.id USING ERRCODE = '23P01';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_dispatch_schedule ON cockpit.schedules;
CREATE TRIGGER guard_dispatch_schedule BEFORE INSERT OR UPDATE ON cockpit.schedules
FOR EACH ROW EXECUTE FUNCTION cockpit.guard_dispatch_schedule();

-- Drop the insecure old prototype; APIs use the versioned row-envelope contract below.
DROP FUNCTION IF EXISTS cockpit.atomic_dispatch_schedules(jsonb, integer);
CREATE OR REPLACE FUNCTION cockpit.commit_dispatch_batch(p_items jsonb, p_request_id text, p_org text, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item jsonb; patch jsonb; old_row cockpit.schedules; new_row cockpit.schedules;
  previous cockpit.dispatch_requests; result jsonb := '[]'::jsonb; assignments text; columns text;
BEGIN
  IF current_user <> 'service_role' OR p_org IS DISTINCT FROM 'vip_limousine_korea' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
    OR p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_BATCH' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(748201, 10);
  SELECT * INTO previous FROM cockpit.dispatch_requests WHERE organization_id = p_org AND request_id = p_request_id;
  IF FOUND THEN
    IF previous.request_payload IS DISTINCT FROM to_jsonb(p_fingerprint) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '40001';
    END IF;
    RETURN previous.result;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    patch := item->'row';
    IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch->>'org_id' IS DISTINCT FROM p_org THEN
      RAISE EXCEPTION 'INVALID_ORGANIZATION' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO old_row FROM cockpit.schedules WHERE id = (patch->>'id')::uuid FOR UPDATE;
    IF coalesce((item->>'is_update')::boolean,false) THEN
      IF old_row.id IS NULL OR coalesce(old_row.org_id,'vip_limousine_korea') <> p_org THEN
        RAISE EXCEPTION 'SCHEDULE_NOT_FOUND' USING ERRCODE = '22023';
      END IF;
      IF old_row.updated_at IS DISTINCT FROM (item->>'expected_updated_at')::timestamptz THEN
        RAISE EXCEPTION 'SCHEDULE_CHANGED' USING ERRCODE = '40001';
      END IF;
    ELSIF old_row.id IS NOT NULL THEN
      RAISE EXCEPTION 'SCHEDULE_ID_EXISTS' USING ERRCODE = '23505';
    END IF;
    -- Only existing columns in the server-generated patch are written. Preserve every other column.
    SELECT string_agg(format('%I = r.%I',a.attname,a.attname), ', '), string_agg(format('%I',a.attname), ', ')
      INTO assignments, columns FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'cockpit.schedules'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND a.attgenerated = '' AND patch ? a.attname;
    IF coalesce((item->>'is_update')::boolean,false) THEN
      EXECUTE format('UPDATE cockpit.schedules s SET %s FROM jsonb_populate_record(NULL::cockpit.schedules,$1) r WHERE s.id = r.id RETURNING s.*', assignments)
        INTO new_row USING patch;
    ELSE
      EXECUTE format('INSERT INTO cockpit.schedules (%s) SELECT %s FROM jsonb_populate_record(NULL::cockpit.schedules,$1) RETURNING *', columns, columns)
        INTO new_row USING patch;
    END IF;
    -- A trigger checks each row against earlier inserts in this batch. Any exception rolls back ALL rows.
    result := result || jsonb_build_array(to_jsonb(new_row));
  END LOOP;
  INSERT INTO cockpit.dispatch_requests VALUES (p_org,p_request_id,to_jsonb(p_fingerprint),result,now());
  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION cockpit.commit_dispatch_batch(jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.commit_dispatch_batch(jsonb,text,text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION cockpit.guard_dispatch_schedule() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION cockpit.dispatch_is_active(cockpit.schedules), cockpit.dispatch_start(cockpit.schedules),
 cockpit.dispatch_end(cockpit.schedules), cockpit.dispatch_plate(cockpit.schedules) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.guard_dispatch_schedule(), cockpit.dispatch_is_active(cockpit.schedules),
 cockpit.dispatch_start(cockpit.schedules), cockpit.dispatch_end(cockpit.schedules), cockpit.dispatch_plate(cockpit.schedules) TO service_role;
REVOKE ALL ON cockpit.schedules FROM anon, authenticated;
GRANT ALL ON cockpit.schedules TO service_role;
COMMIT;
