-- ==============================================================================
-- [PROPOSAL ONLY / 승인 대기] 20261030_atomic_dispatch_and_fleet_schema.sql
-- VIP Limousine Korea - Fleet Availability & Atomic Dispatch RPC Guard (Issue #10)
--
-- ⚠️ STRICT OPERATIONAL CONSTRAINTS:
-- 1. DO NOT EXECUTE DIRECTLY ON PRODUCTION / SHARED DATABASE WITHOUT EXPLICIT OWNER APPROVAL.
-- 2. This file serves as the formal migration specification & concurrency guard proposal for Issue #10.
-- 3. Production DB schema alignment verified via read-only inspection:
--    - cockpit.schedules uses `passenger_name` (NOT `passenger`).
--    - driver_id, vehicle_id, end_date, end_time, dispatch_status columns are added conditionally.
-- ==============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS cockpit;

-- ==============================================================================
-- 1. PREREQUISITE COLUMNS (IF NOT EXISTS): Safe Schema Alignment
-- Aligns with cockpit.schedules without mutating live production unapproved.
-- ==============================================================================
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS driver_id UUID;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'draft';
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS driver_name TEXT;

-- ==============================================================================
-- 2. INDEXES: Fast Range & Availability Lookups
-- Enables sub-millisecond conflict checks even under thousands of historic schedules.
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_schedules_fleet_avail
ON cockpit.schedules (date, end_date, vehicle_id, driver_id)
WHERE dispatch_status NOT IN ('cancelled', 'unassigned', 'draft');

CREATE INDEX IF NOT EXISTS idx_schedules_vehicle_plate_norm
ON cockpit.schedules (lower(replace(vehicle_no, ' ', '')))
WHERE dispatch_status NOT IN ('cancelled', 'unassigned', 'draft');

-- ==============================================================================
-- 3. FUNCTION: cockpit.atomic_dispatch_schedules
-- Atomically validates driver and vehicle availability with turnaround buffer
-- and prevents double-booking race conditions across concurrent HQ dispatchers.
-- If conflict-free, atomically executes the upsert batch inside the transaction.
-- ==============================================================================
CREATE OR REPLACE FUNCTION cockpit.atomic_dispatch_schedules(
  p_candidates JSONB,
  p_buffer_minutes INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cockpit, public, pg_temp
AS $$
DECLARE
  v_cand JSONB;
  v_cand_schedule_id UUID;
  v_cand_driver_id UUID;
  v_cand_vehicle_id UUID;
  v_cand_driver_name TEXT;
  v_cand_vehicle_plate TEXT;
  v_cand_start_date DATE;
  v_cand_start_time TIME;
  v_cand_end_date DATE;
  v_cand_end_time TIME;
  v_cand_service_mode TEXT;
  v_cand_dispatch_status TEXT;
  v_cand_passenger_name TEXT;
  v_cand_origin TEXT;
  v_cand_destination TEXT;
  
  v_conflict RECORD;
  v_conflict_found BOOLEAN := FALSE;
  v_conflicts JSONB := '[]'::JSONB;
  v_inserted_ids JSONB := '[]'::JSONB;
  v_new_id UUID;
BEGIN
  -- 1. Acquire transaction-level advisory lock to serialize concurrent multi-booking commits
  PERFORM pg_advisory_xact_lock(hashtext('cockpit_dispatch_lock'));

  -- 2. Pre-validation and Conflict Detection for all candidates
  FOR v_cand IN SELECT * FROM jsonb_array_elements(p_candidates)
  LOOP
    v_cand_schedule_id := NULLIF(v_cand->>'scheduleId', '')::UUID;
    v_cand_driver_id := NULLIF(v_cand->>'driverId', '')::UUID;
    v_cand_vehicle_id := NULLIF(v_cand->>'vehicleId', '')::UUID;
    v_cand_driver_name := trim(regexp_replace(COALESCE(v_cand->>'driverName', ''), '\s*기사(님)?$', ''));
    v_cand_vehicle_plate := trim(replace(COALESCE(v_cand->>'vehiclePlate', v_cand->>'vehicleNo', ''), ' ', ''));
    v_cand_start_date := (v_cand->>'pickupDate')::DATE;
    v_cand_start_time := (v_cand->>'pickupTime')::TIME;
    v_cand_dispatch_status := COALESCE(v_cand->>'dispatchStatus', 'published');
    v_cand_service_mode := COALESCE(v_cand->>'serviceMode', 'with_driver');

    -- Mandatory end_time validation for published dispatch
    IF v_cand_dispatch_status = 'published' AND (v_cand->>'endTime' IS NULL OR trim(v_cand->>'endTime') = '') THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'error', 'END_TIME_REQUIRED',
        'message', '확정 배차에는 종료 시간(endTime)이 필수입니다.'
      );
    END IF;

    v_cand_end_date := COALESCE(NULLIF(v_cand->>'endDate', '')::DATE, v_cand_start_date);
    v_cand_end_time := COALESCE(NULLIF(v_cand->>'endTime', '')::TIME, '23:59:00'::TIME);

    -- Only published dispatches reserve capacity and conflict-check
    IF v_cand_dispatch_status = 'published' THEN
      -- 3. Check Driver Conflicts (unless vehicle-only service mode)
      IF v_cand_service_mode <> 'vehicle_only' AND v_cand_driver_name <> '' AND v_cand_driver_name NOT IN ('기사 미배정', '자차 운행', '차량만 대여') THEN
        SELECT s.id, s.driver_name, s.vehicle_no, s.pickup_time, s.end_time, s.date, s.end_date, s.passenger_name
        INTO v_conflict
        FROM cockpit.schedules s
        WHERE s.dispatch_status NOT IN ('cancelled', 'unassigned', 'draft')
          AND (v_cand_schedule_id IS NULL OR s.id <> v_cand_schedule_id)
          AND (
            -- Strict UUID matching when both IDs exist; fallback to name only if legacy unmapped
            CASE 
              WHEN v_cand_driver_id IS NOT NULL AND s.driver_id IS NOT NULL THEN s.driver_id = v_cand_driver_id
              ELSE trim(regexp_replace(COALESCE(s.driver_name, ''), '\s*기사(님)?$', '')) = v_cand_driver_name
            END
          )
          AND (
            -- Interval overlap with turnaround buffer: [start, end + buffer)
            ((s.date::TEXT || ' ' || s.pickup_time::TEXT)::TIMESTAMPTZ < ((v_cand_end_date::TEXT || ' ' || v_cand_end_time::TEXT)::TIMESTAMPTZ + (p_buffer_minutes || ' minutes')::INTERVAL))
            AND
            (((v_cand_start_date::TEXT || ' ' || v_cand_start_time::TEXT)::TIMESTAMPTZ) < ((COALESCE(s.end_date, s.date)::TEXT || ' ' || COALESCE(s.end_time, '23:59:00')::TEXT)::TIMESTAMPTZ + (p_buffer_minutes || ' minutes')::INTERVAL))
          )
        LIMIT 1;

        IF FOUND THEN
          v_conflict_found := TRUE;
          v_conflicts := v_conflicts || jsonb_build_object(
            'type', 'driver',
            'target', v_cand_driver_name,
            'conflictingScheduleId', v_conflict.id,
            'conflictingCustomer', v_conflict.passenger_name,
            'message', format('[기사 중복] %s 기사는 %s %s 기존 일정과 배차 시간이 겹칩니다.', v_cand_driver_name, v_conflict.date, v_conflict.pickup_time)
          );
        END IF;
      END IF;

      -- 4. Check Vehicle Conflicts
      IF v_cand_vehicle_plate <> '' AND v_cand_vehicle_plate NOT IN ('미배정', '차량미지정') THEN
        SELECT s.id, s.driver_name, s.vehicle_no, s.pickup_time, s.end_time, s.date, s.end_date, s.passenger_name
        INTO v_conflict
        FROM cockpit.schedules s
        WHERE s.dispatch_status NOT IN ('cancelled', 'unassigned', 'draft')
          AND (v_cand_schedule_id IS NULL OR s.id <> v_cand_schedule_id)
          AND (
            -- Strict UUID matching when both IDs exist; fallback to plate string
            CASE 
              WHEN v_cand_vehicle_id IS NOT NULL AND s.vehicle_id IS NOT NULL THEN s.vehicle_id = v_cand_vehicle_id
              ELSE trim(replace(COALESCE(s.vehicle_no, ''), ' ', '')) = v_cand_vehicle_plate
            END
          )
          AND (
            -- Interval overlap with turnaround buffer
            ((s.date::TEXT || ' ' || s.pickup_time::TEXT)::TIMESTAMPTZ < ((v_cand_end_date::TEXT || ' ' || v_cand_end_time::TEXT)::TIMESTAMPTZ + (p_buffer_minutes || ' minutes')::INTERVAL))
            AND
            (((v_cand_start_date::TEXT || ' ' || v_cand_start_time::TEXT)::TIMESTAMPTZ) < ((COALESCE(s.end_date, s.date)::TEXT || ' ' || COALESCE(s.end_time, '23:59:00')::TEXT)::TIMESTAMPTZ + (p_buffer_minutes || ' minutes')::INTERVAL))
          )
        LIMIT 1;

        IF FOUND THEN
          v_conflict_found := TRUE;
          v_conflicts := v_conflicts || jsonb_build_object(
            'type', 'vehicle',
            'target', v_cand_vehicle_plate,
            'conflictingScheduleId', v_conflict.id,
            'conflictingCustomer', v_conflict.passenger_name,
            'message', format('[차량 중복] %s 차량은 %s %s 기존 일정과 배차 시간이 겹칩니다.', v_cand_vehicle_plate, v_conflict.date, v_conflict.pickup_time)
          );
        END IF;
      END IF;
    END IF;

  END LOOP;

  -- 5. If conflicts exist, reject transaction fail-closed
  IF v_conflict_found THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'error', 'CONFLICT_DETECTED',
      'conflicts', v_conflicts
    );
  END IF;

  -- 6. Atomic Upsert Execution: Conflict-free -> Execute inserts/updates inside transaction
  FOR v_cand IN SELECT * FROM jsonb_array_elements(p_candidates)
  LOOP
    v_cand_schedule_id := NULLIF(v_cand->>'scheduleId', '')::UUID;
    v_cand_driver_id := NULLIF(v_cand->>'driverId', '')::UUID;
    v_cand_vehicle_id := NULLIF(v_cand->>'vehicleId', '')::UUID;
    v_cand_driver_name := trim(regexp_replace(COALESCE(v_cand->>'driverName', ''), '\s*기사(님)?$', ''));
    v_cand_vehicle_plate := trim(COALESCE(v_cand->>'vehiclePlate', v_cand->>'vehicleNo', '미배정'));
    v_cand_start_date := (v_cand->>'pickupDate')::DATE;
    v_cand_start_time := (v_cand->>'pickupTime')::TIME;
    v_cand_end_date := COALESCE(NULLIF(v_cand->>'endDate', '')::DATE, v_cand_start_date);
    v_cand_end_time := NULLIF(v_cand->>'endTime', '')::TIME;
    v_cand_dispatch_status := COALESCE(v_cand->>'dispatchStatus', 'published');
    v_cand_passenger_name := COALESCE(v_cand->>'passengerName', v_cand->>'customerName', 'VIP');
    v_cand_origin := COALESCE(v_cand->>'origin', '미확인');
    v_cand_destination := COALESCE(v_cand->>'destination', '미확인');

    IF v_cand_schedule_id IS NOT NULL THEN
      UPDATE cockpit.schedules
      SET
        vehicle_no = v_cand_vehicle_plate,
        date = v_cand_start_date,
        pickup_time = v_cand_start_time,
        end_date = v_cand_end_date,
        end_time = v_cand_end_time,
        origin = v_cand_origin,
        destination = v_cand_destination,
        passenger_name = v_cand_passenger_name,
        driver_name = v_cand_driver_name,
        driver_id = v_cand_driver_id,
        vehicle_id = v_cand_vehicle_id,
        dispatch_status = v_cand_dispatch_status,
        updated_at = now()
      WHERE id = v_cand_schedule_id;
      v_inserted_ids := v_inserted_ids || jsonb_build_array(v_cand_schedule_id);
    ELSE
      v_new_id := gen_random_uuid();
      INSERT INTO cockpit.schedules (
        id,
        vehicle_no,
        date,
        pickup_time,
        time_display,
        origin,
        destination,
        passenger_name,
        driver_name,
        driver_id,
        vehicle_id,
        end_date,
        end_time,
        dispatch_status,
        created_at,
        updated_at
      ) VALUES (
        v_new_id,
        v_cand_vehicle_plate,
        v_cand_start_date,
        v_cand_start_time,
        v_cand_start_time::TEXT,
        v_cand_origin,
        v_cand_destination,
        v_cand_passenger_name,
        v_cand_driver_name,
        v_cand_driver_id,
        v_cand_vehicle_id,
        v_cand_end_date,
        v_cand_end_time,
        v_cand_dispatch_status,
        now(),
        now()
      );
      v_inserted_ids := v_inserted_ids || jsonb_build_array(v_new_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'count', jsonb_array_length(v_inserted_ids),
    'scheduleIds', v_inserted_ids,
    'message', '가용성 검증 및 원자적 배차 저장 완료'
  );
END;
$$;

-- Security hardening: Disallow public invocation of privileged atomic dispatch RPC
REVOKE EXECUTE ON FUNCTION cockpit.atomic_dispatch_schedules(JSONB, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cockpit.atomic_dispatch_schedules(JSONB, INT) TO service_role, authenticated;

COMMIT;
