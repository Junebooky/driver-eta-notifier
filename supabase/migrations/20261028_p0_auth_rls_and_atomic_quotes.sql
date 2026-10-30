-- ==============================================================================
-- Migration: P0 Auth/RLS View Hardening & P1 Atomic Quote/Booking Integrity
-- Target Schema: cockpit
-- Description:
--   1. Enforces security_invoker = true on all 4 cockpit views so views cannot
--      bypass table RLS via owner (postgres) privileges.
--   2. Revokes ALL anon/public privileges on cockpit schema, tables, views,
--      sequences, and functions (protects driver personal phones & internal
--      pricing/labor costs from anonymous exposure).
--   3. Replaces permissive public SELECT policies with strict authenticated
--      JWT app_metadata (org = 'vip_limousine_korea', cockpit_role) policies.
--   4. Adds partial unique index idx_schedules_unique_quote_vehicle to block
--      duplicate active conversions of the same quote at the DB engine level.
--   5. Adds atomic transactional RPC functions:
--      - cockpit.save_customer_quote_atomic (row-locked JSONB save + global quoteNo uniqueness)
--      - cockpit.convert_quote_to_bookings_atomic (row-locked multi-vehicle unassigned
--        insert + quote converted status update in a single transaction)
-- ==============================================================================

-- 1. Enforce security_invoker on all views in cockpit schema
ALTER VIEW IF EXISTS cockpit.cockpit_drivers SET (security_invoker = true);
ALTER VIEW IF EXISTS cockpit.cockpit_presets SET (security_invoker = true);
ALTER VIEW IF EXISTS cockpit.cockpit_schedules SET (security_invoker = true);
ALTER VIEW IF EXISTS cockpit.driver_profiles SET (security_invoker = true);

-- 2. Enable RLS on all 5 base tables
ALTER TABLE IF EXISTS cockpit.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cockpit.pricing_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cockpit.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cockpit.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cockpit.presets ENABLE ROW LEVEL SECURITY;

-- 3. Revoke anonymous & public access completely across cockpit schema
REVOKE ALL ON SCHEMA cockpit FROM anon, public;
REVOKE ALL ON ALL TABLES IN SCHEMA cockpit FROM anon, public;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cockpit FROM anon, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cockpit FROM anon, public;

-- Restrict authenticated role to SELECT only (writes go through server-verified API routes)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA cockpit FROM authenticated;
GRANT USAGE ON SCHEMA cockpit TO authenticated, service_role;
GRANT SELECT ON
  cockpit.customers,
  cockpit.drivers,
  cockpit.presets,
  cockpit.pricing_presets,
  cockpit.schedules,
  cockpit.cockpit_drivers,
  cockpit.cockpit_presets,
  cockpit.cockpit_schedules,
  cockpit.driver_profiles
TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA cockpit TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cockpit TO service_role;

-- 4. Drop public read policies that exposed driver PII & internal pricing/labor costs
DROP POLICY IF EXISTS "Public read active pricing_presets" ON cockpit.pricing_presets;
DROP POLICY IF EXISTS "Public read presets" ON cockpit.presets;
DROP POLICY IF EXISTS "Public read drivers" ON cockpit.drivers;
DROP POLICY IF EXISTS "Public deny direct customer access" ON cockpit.customers;

-- Ensure service_role full access policies remain intact
DROP POLICY IF EXISTS "Service role full access on schedules" ON cockpit.schedules;
CREATE POLICY "Service role full access on schedules" ON cockpit.schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on drivers" ON cockpit.drivers;
CREATE POLICY "Service role full access on drivers" ON cockpit.drivers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on presets" ON cockpit.presets;
CREATE POLICY "Service role full access on presets" ON cockpit.presets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on customers" ON cockpit.customers;
CREATE POLICY "Service role full access on customers" ON cockpit.customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on pricing_presets" ON cockpit.pricing_presets;
CREATE POLICY "Service role full access on pricing_presets" ON cockpit.pricing_presets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Strict Authenticated RLS Policies bound to server-controlled app_metadata
DROP POLICY IF EXISTS "HQ admin read customers" ON cockpit.customers;
CREATE POLICY "HQ admin read customers" ON cockpit.customers
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'org') = 'vip_limousine_korea'
    AND (auth.jwt() -> 'app_metadata' ->> 'cockpit_role') = 'hq_admin'
  );

DROP POLICY IF EXISTS "HQ admin read pricing_presets" ON cockpit.pricing_presets;
CREATE POLICY "HQ admin read pricing_presets" ON cockpit.pricing_presets
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'org') = 'vip_limousine_korea'
    AND (auth.jwt() -> 'app_metadata' ->> 'cockpit_role') = 'hq_admin'
  );

DROP POLICY IF EXISTS "Authenticated read own or HQ drivers" ON cockpit.drivers;
CREATE POLICY "Authenticated read own or HQ drivers" ON cockpit.drivers
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'org') = 'vip_limousine_korea'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'cockpit_role') = 'hq_admin'
      OR (
        (auth.jwt() -> 'app_metadata' ->> 'cockpit_role') = 'driver'
        AND (
          driver_name = (auth.jwt() -> 'app_metadata' ->> 'driver_name')
          OR vehicle_no = (auth.jwt() -> 'app_metadata' ->> 'vehicle_no')
          OR id::text = (auth.jwt() -> 'app_metadata' ->> 'driver_id')
        )
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated read own or HQ schedules" ON cockpit.schedules;
CREATE POLICY "Authenticated read own or HQ schedules" ON cockpit.schedules
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'org') = 'vip_limousine_korea'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'cockpit_role') = 'hq_admin'
      OR (
        (auth.jwt() -> 'app_metadata' ->> 'cockpit_role') = 'driver'
        AND COALESCE(dispatch_status, 'published') IN ('published', 'cancelled')
        AND vehicle_no <> '미배정'
        AND (
          driver_name = (auth.jwt() -> 'app_metadata' ->> 'driver_name')
          OR vehicle_no = (auth.jwt() -> 'app_metadata' ->> 'vehicle_no')
          OR vehicle_plate = (auth.jwt() -> 'app_metadata' ->> 'car_number')
        )
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated read common or own presets" ON cockpit.presets;
CREATE POLICY "Authenticated read common or own presets" ON cockpit.presets
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'org') = 'vip_limousine_korea'
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'cockpit_role') = 'hq_admin'
      OR vehicle_no IS NULL
      OR vehicle_no = (auth.jwt() -> 'app_metadata' ->> 'vehicle_no')
    )
  );

-- 6. DB-Level Unique Partial Index to prevent concurrent duplicate quote conversions
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_unique_quote_vehicle
  ON cockpit.schedules (source_quote_no, COALESCE(group_vehicle_index, 1))
  WHERE source_quote_no IS NOT NULL AND COALESCE(dispatch_status, 'published') <> 'cancelled';

-- 7. Atomic Quote Save Function (Prevents duplicate quoteNo & JSONB lost updates)
CREATE OR REPLACE FUNCTION cockpit.save_customer_quote_atomic(
  p_customer_id text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_contact_person text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_quote jsonb DEFAULT '{}'::jsonb,
  p_allow_update boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cockpit, public
AS $$
DECLARE
  v_quote_no text;
  v_cust_id text;
  v_quotes jsonb;
  v_existing_quote jsonb;
  v_final_quote jsonb;
  v_next_quotes jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- Serialize global quoteNo uniqueness & customer creation across concurrent calls
  PERFORM pg_advisory_xact_lock(hashtext('cockpit_quote_save_global'));

  v_quote_no := NULLIF(btrim(p_quote ->> 'quoteNo'), '');
  IF v_quote_no IS NULL THEN
    RAISE EXCEPTION 'INVALID_QUOTE_NO: 견적번호(quoteNo)가 필요합니다.'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(COALESCE(p_customer_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_NAME: 고객사명이 필요합니다.'
      USING ERRCODE = '22023';
  END IF;

  -- Locate existing customer row with row-level lock
  IF NULLIF(btrim(COALESCE(p_customer_id, '')), '') IS NOT NULL THEN
    SELECT id INTO v_cust_id
    FROM cockpit.customers
    WHERE id = btrim(p_customer_id)
    FOR UPDATE;
  END IF;

  IF v_cust_id IS NULL THEN
    SELECT id INTO v_cust_id
    FROM cockpit.customers
    WHERE lower(btrim(name)) = lower(btrim(p_customer_name))
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_cust_id IS NULL THEN
    v_cust_id := COALESCE(
      NULLIF(btrim(p_customer_id), ''),
      'cust-' || substr(md5(random()::text || v_now::text), 1, 10)
    );
    INSERT INTO cockpit.customers (id, name, contact_person, phone, email, quotes, created_at, updated_at)
    VALUES (
      v_cust_id,
      btrim(p_customer_name),
      NULLIF(btrim(COALESCE(p_contact_person, '')), ''),
      NULLIF(btrim(COALESCE(p_phone, '')), ''),
      NULLIF(btrim(COALESCE(p_email, '')), ''),
      '[]'::jsonb,
      v_now,
      v_now
    );
  END IF;

  -- Enforce global quoteNo uniqueness across ALL other customers
  IF EXISTS (
    SELECT 1
    FROM cockpit.customers c,
         jsonb_array_elements(COALESCE(c.quotes, '[]'::jsonb)) elem
    WHERE c.id <> v_cust_id
      AND elem ->> 'quoteNo' = v_quote_no
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_QUOTE_NO: 이미 다른 고객사에 등록된 견적번호(%)입니다.', v_quote_no
      USING ERRCODE = '23505';
  END IF;

  -- Lock and read freshest quotes array on target customer
  SELECT COALESCE(quotes, '[]'::jsonb)
  INTO v_quotes
  FROM cockpit.customers
  WHERE id = v_cust_id
  FOR UPDATE;

  SELECT elem
  INTO v_existing_quote
  FROM jsonb_array_elements(v_quotes) elem
  WHERE elem ->> 'quoteNo' = v_quote_no
  LIMIT 1;

  IF v_existing_quote IS NOT NULL THEN
    IF (v_existing_quote ->> 'status') = 'converted' THEN
      RAISE EXCEPTION 'QUOTE_ALREADY_CONVERTED: 이미 예약으로 전환된 견적서(%)는 덮어쓸 수 없습니다.', v_quote_no
        USING ERRCODE = '23505';
    END IF;
    IF NOT p_allow_update THEN
      RAISE EXCEPTION 'DUPLICATE_QUOTE_NO: 동일한 견적번호(%)가 이미 저장되어 있습니다.', v_quote_no
        USING ERRCODE = '23505';
    END IF;
  END IF;

  v_final_quote := jsonb_set(p_quote, '{customerId}', to_jsonb(v_cust_id), true);

  SELECT jsonb_build_array(v_final_quote) || COALESCE(
    (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(v_quotes) elem
      WHERE COALESCE(elem ->> 'quoteNo', '') <> v_quote_no
    ),
    '[]'::jsonb
  )
  INTO v_next_quotes;

  UPDATE cockpit.customers
  SET
    quotes = v_next_quotes,
    contact_person = COALESCE(NULLIF(btrim(COALESCE(p_contact_person, '')), ''), contact_person),
    phone = COALESCE(NULLIF(btrim(COALESCE(p_phone, '')), ''), phone),
    email = COALESCE(NULLIF(btrim(COALESCE(p_email, '')), ''), email),
    updated_at = v_now
  WHERE id = v_cust_id;

  RETURN jsonb_build_object(
    'customer_id', v_cust_id,
    'quote', v_final_quote
  );
END;
$$;

-- 8. Atomic Quote -> Multi-Vehicle Unassigned Bookings Conversion Function
CREATE OR REPLACE FUNCTION cockpit.convert_quote_to_bookings_atomic(
  p_customer_id text,
  p_quote_no text,
  p_verified_quote jsonb,
  p_schedules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cockpit, public
AS $$
DECLARE
  v_clean_quote_no text;
  v_cust_id text;
  v_quotes jsonb;
  v_existing_quote jsonb;
  v_existing_booking_ids uuid[];
  v_item jsonb;
  v_idx integer := 0;
  v_total_count integer;
  v_inserted_id uuid;
  v_booking_ids text[] := ARRAY[]::text[];
  v_now timestamptz := clock_timestamp();
  v_now_iso text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_converted_quote jsonb;
  v_next_quotes jsonb;
  v_origin text;
  v_dest text;
  v_model text;
  v_date date;
  v_pickup_time time;
  v_end_date date;
  v_end_time time;
BEGIN
  v_clean_quote_no := NULLIF(btrim(COALESCE(p_quote_no, '')), '');
  IF v_clean_quote_no IS NULL THEN
    RAISE EXCEPTION 'INVALID_QUOTE_NO: quoteNo가 필요합니다.'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent conversion attempts for the same quote AND quote JSONB updates
  PERFORM pg_advisory_xact_lock(hashtext('cockpit_quote_save_global'));
  PERFORM pg_advisory_xact_lock(hashtext('convert_quote:' || v_clean_quote_no));

  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array' OR jsonb_array_length(p_schedules) < 1 THEN
    RAISE EXCEPTION 'INVALID_SCHEDULES_PAYLOAD: 최소 1대 이상의 예약 차량 정보가 필요합니다.'
      USING ERRCODE = '22023';
  END IF;

  -- 1. Check active schedules for this quoteNo
  SELECT array_agg(id)
  INTO v_existing_booking_ids
  FROM cockpit.schedules
  WHERE source_quote_no = v_clean_quote_no
    AND COALESCE(dispatch_status, 'published') <> 'cancelled';

  IF v_existing_booking_ids IS NOT NULL AND array_length(v_existing_booking_ids, 1) > 0 THEN
    RAISE EXCEPTION 'QUOTE_ALREADY_CONVERTED: 이미 예약으로 전환된 견적서입니다 (%).', v_clean_quote_no
      USING ERRCODE = '23505';
  END IF;

  -- 2. Lock target customer row
  v_cust_id := NULLIF(btrim(COALESCE(p_customer_id, '')), '');
  IF v_cust_id IS NULL THEN
    RAISE EXCEPTION 'QUOTE_CUSTOMER_NOT_FOUND: 고객사 ID가 필요합니다.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(quotes, '[]'::jsonb)
  INTO v_quotes
  FROM cockpit.customers
  WHERE id = v_cust_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUOTE_CUSTOMER_NOT_FOUND: 고객사(%)를 찾을 수 없습니다.', v_cust_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT elem
  INTO v_existing_quote
  FROM jsonb_array_elements(v_quotes) elem
  WHERE elem ->> 'quoteNo' = v_clean_quote_no
  LIMIT 1;

  IF v_existing_quote IS NOT NULL AND (v_existing_quote ->> 'status') = 'converted' THEN
    RAISE EXCEPTION 'QUOTE_ALREADY_CONVERTED: 이미 예약으로 전환 완료된 견적서입니다 (%).', v_clean_quote_no
      USING ERRCODE = '23505';
  END IF;

  -- 3. Ensure FK sentinel '미배정' exists in cockpit.drivers
  INSERT INTO cockpit.drivers (vehicle_no, car_number, driver_name, default_navi)
  VALUES ('미배정', '미배정', '배차 대기', 'tmap')
  ON CONFLICT (vehicle_no) DO NOTHING;

  -- 4. Insert all vehicles atomically with dispatch_status = 'unassigned' ('미배정')
  v_total_count := jsonb_array_length(p_schedules);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    v_idx := v_idx + 1;
    v_origin := NULLIF(btrim(COALESCE(v_item ->> 'origin', '')), '');
    v_dest := NULLIF(btrim(COALESCE(v_item ->> 'destination', '')), '');
    v_model := NULLIF(btrim(COALESCE(v_item ->> 'vehicle_model', '')), '');

    IF v_origin IS NULL OR v_dest IS NULL OR v_model IS NULL OR NULLIF(btrim(COALESCE(v_item ->> 'date', '')), '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_SCHEDULE_ITEM: %호차 필수 정보(일자/출발지/목적지/차종)가 누락되어 전체 전환이 취소되었습니다.', v_idx
        USING ERRCODE = '23502';
    END IF;

    v_date := (v_item ->> 'date')::date;
    v_pickup_time := COALESCE(NULLIF(v_item ->> 'pickup_time', ''), '09:00:00')::time;
    v_end_date := COALESCE(NULLIF(v_item ->> 'end_date', ''), v_item ->> 'date')::date;
    v_end_time := COALESCE(NULLIF(v_item ->> 'end_time', ''), '19:00:00')::time;

    INSERT INTO cockpit.schedules (
      vehicle_no,
      date,
      pickup_time,
      time_display,
      origin,
      origin_address,
      origin_lat,
      origin_lng,
      destination,
      destination_address,
      destination_lat,
      destination_lng,
      passenger_name,
      passenger_count,
      passenger_note,
      protocol_notes,
      status,
      dispatch_status,
      operation_status,
      end_date,
      end_time,
      driver_name,
      driver_phone,
      vehicle_plate,
      vehicle_model,
      customer_id,
      customer_name,
      event_name,
      group_id,
      group_name,
      group_total_vehicles,
      group_vehicle_index,
      version,
      last_ack_version,
      source_quote_no,
      schedule_meta,
      created_at,
      updated_at
    ) VALUES (
      '미배정',
      v_date,
      v_pickup_time,
      COALESCE(NULLIF(v_item ->> 'time_display', ''), '픽업 ' || substr(v_pickup_time::text, 1, 5)),
      v_origin,
      NULLIF(v_item ->> 'origin_address', ''),
      CASE WHEN v_item ? 'origin_lat' AND jsonb_typeof(v_item -> 'origin_lat') = 'number' THEN (v_item ->> 'origin_lat')::double precision ELSE NULL END,
      CASE WHEN v_item ? 'origin_lng' AND jsonb_typeof(v_item -> 'origin_lng') = 'number' THEN (v_item ->> 'origin_lng')::double precision ELSE NULL END,
      v_dest,
      NULLIF(v_item ->> 'destination_address', ''),
      CASE WHEN v_item ? 'destination_lat' AND jsonb_typeof(v_item -> 'destination_lat') = 'number' THEN (v_item ->> 'destination_lat')::double precision ELSE NULL END,
      CASE WHEN v_item ? 'destination_lng' AND jsonb_typeof(v_item -> 'destination_lng') = 'number' THEN (v_item ->> 'destination_lng')::double precision ELSE NULL END,
      COALESCE(NULLIF(v_item ->> 'passenger_name', ''), 'VIP 고객'),
      COALESCE((v_item ->> 'passenger_count')::integer, 1),
      v_item ->> 'passenger_note',
      NULLIF(v_item ->> 'protocol_notes', ''),
      'unassigned',
      'unassigned',
      'ready',
      v_end_date,
      v_end_time,
      NULL,
      NULL,
      NULL,
      v_model,
      v_cust_id,
      COALESCE(NULLIF(v_item ->> 'customer_name', ''), p_verified_quote ->> 'customerName'),
      NULLIF(v_item ->> 'event_name', ''),
      NULLIF(v_item ->> 'group_id', ''),
      NULLIF(v_item ->> 'group_name', ''),
      COALESCE((v_item ->> 'group_total_vehicles')::integer, v_total_count),
      COALESCE((v_item ->> 'group_vehicle_index')::integer, v_idx),
      1,
      0,
      v_clean_quote_no,
      COALESCE(v_item -> 'schedule_meta', '{}'::jsonb),
      v_now,
      v_now
    )
    RETURNING id INTO v_inserted_id;

    v_booking_ids := array_append(v_booking_ids, v_inserted_id::text);
  END LOOP;

  -- 5. Atomically mark quote as 'converted' in cockpit.customers.quotes
  v_converted_quote := COALESCE(v_existing_quote, '{}'::jsonb) || COALESCE(p_verified_quote, '{}'::jsonb) || jsonb_build_object(
    'quoteNo', v_clean_quote_no,
    'customerId', v_cust_id,
    'status', 'converted',
    'convertedBookingId', v_booking_ids[1],
    'convertedBookingIds', to_jsonb(v_booking_ids),
    'convertedAt', v_now_iso,
    'updatedAt', v_now_iso
  );

  SELECT jsonb_build_array(v_converted_quote) || COALESCE(
    (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(v_quotes) elem
      WHERE COALESCE(elem ->> 'quoteNo', '') <> v_clean_quote_no
    ),
    '[]'::jsonb
  )
  INTO v_next_quotes;

  UPDATE cockpit.customers
  SET
    quotes = v_next_quotes,
    updated_at = v_now
  WHERE id = v_cust_id;

  RETURN jsonb_build_object(
    'quote_no', v_clean_quote_no,
    'customer_id', v_cust_id,
    'booking_ids', to_jsonb(v_booking_ids),
    'dispatch_status', 'unassigned'
  );
END;
$$;

-- Restrict RPC execution strictly to service_role
REVOKE ALL ON FUNCTION cockpit.save_customer_quote_atomic(text, text, text, text, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cockpit.save_customer_quote_atomic(text, text, text, text, text, jsonb, boolean) TO service_role;

REVOKE ALL ON FUNCTION cockpit.convert_quote_to_bookings_atomic(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cockpit.convert_quote_to_bookings_atomic(text, text, jsonb, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

