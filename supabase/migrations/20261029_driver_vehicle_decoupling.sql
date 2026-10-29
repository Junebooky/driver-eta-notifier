-- ==============================================================================
-- [PROPOSAL / 승인 대기] 20261029_driver_vehicle_decoupling.sql
-- VIP Limousine Korea - Driver & Vehicle Resource Decoupling Migration Plan
-- 
-- ⚠️ IMPORTANT NOTICE:
-- DO NOT EXECUTE DIRECTLY ON PRODUCTION/STAGING DATABASE WITHOUT EXPLICIT OWNER APPROVAL.
-- This file serves as the formal migration specification & verification plan as required by Issue #33.
-- ==============================================================================

-- 1. CURRENT SCHEMA ANALYSIS & CONSTRAINTS:
-- - `cockpit.drivers` table currently holds 33 records.
-- - Primary key: `id` (UUID, DEFAULT gen_random_uuid()).
-- - Current constraint `drivers_vehicle_no_key`: UNIQUE (vehicle_no) on `cockpit.drivers`.
-- - Current foreign key `schedules_vehicle_no_fkey`: `cockpit.schedules(vehicle_no)` REFERENCES `cockpit.drivers(vehicle_no)` ON DELETE CASCADE.
-- - Problem statement:
--   1) Vehicle (`vehicle_no`) is tightly coupled to Driver (`cockpit.drivers`), requiring every driver
--      to possess a unique `vehicle_no`, which prevents unassigned/freelance drivers without a permanent vehicle.
--   2) Schedules currently link to drivers strictly via `vehicle_no`. If a driver drives multiple vehicles
--      or a vehicle is shared across shift drivers, the schedule cannot distinguish driver assignment from vehicle assignment.

-- 2. NON-DESTRUCTIVE INTERIM STRATEGY (CURRENT LIVE CODE COMPATIBLE):
-- - Without altering live schema, the application stores driver metadata in `cockpit.drivers.driver_meta` (JSONB):
--   `driver_meta` -> { "affiliation": "employed" | "freelance", "memo": text, "residence": text, "has_dedicated_vehicle": boolean }
-- - For drivers without dedicated vehicles, surrogate vehicle identifiers (e.g. 'DRV-' || SUBSTRING(id::text, 1, 8))
--   satisfy the NOT NULL and UNIQUE constraint while preventing collisions with real fleet plates.

-- 3. PROPOSED FORMAL MIGRATION (TO BE EXECUTED ONLY UPON EXPLICIT USER APPROVAL):

BEGIN;

-- Step A: Add nullable `driver_id` foreign key column to `cockpit.schedules`
ALTER TABLE cockpit.schedules
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES cockpit.drivers(id) ON DELETE SET NULL;

-- Step B: Backfill `driver_id` in `cockpit.schedules` from existing `vehicle_no` matches
UPDATE cockpit.schedules s
SET driver_id = d.id
FROM cockpit.drivers d
WHERE s.vehicle_no = d.vehicle_no
  AND s.driver_id IS NULL;

-- Step C: Relax `vehicle_no` in `cockpit.drivers` to allow NULL for unassigned / freelance drivers
ALTER TABLE cockpit.drivers
ALTER COLUMN vehicle_no DROP NOT NULL;

-- Step D: Replace rigid UNIQUE constraint with partial UNIQUE index (only where vehicle_no is non-null)
ALTER TABLE cockpit.drivers
DROP CONSTRAINT IF EXISTS drivers_vehicle_no_key;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_vehicle_no_idx
ON cockpit.drivers(vehicle_no)
WHERE vehicle_no IS NOT NULL;

-- Step E: Relax `car_number` in `cockpit.drivers` to allow NULL
ALTER TABLE cockpit.drivers
ALTER COLUMN car_number DROP NOT NULL;

-- Step F: Index on `driver_id` for fast schedule conflict lookups
CREATE INDEX IF NOT EXISTS idx_schedules_driver_id
ON cockpit.schedules(driver_id);

CREATE INDEX IF NOT EXISTS idx_schedules_date_time
ON cockpit.schedules(date, pickup_time);

COMMIT;

-- ==============================================================================
-- 4. VERIFICATION PLAN (검증 계획):
-- 1. Check existing 16 schedule records retain valid driver_id UUIDs matching their existing vehicle_no.
-- 2. Ensure driver queries with NULL vehicle_no succeed without constraint violation.
-- 3. Ensure vehicle conflict detection continues using `schedules.vehicle_no` / `schedules.vehicle_plate`.
-- 4. Ensure driver conflict detection uses `schedules.driver_id` instead of loose vehicle matching.
-- ==============================================================================
