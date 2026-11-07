-- ====================================================================
-- Phase 2: Availability, Pricing Quotes, Live Operations & Driving Log
-- Schema: cockpit
-- Description: Idempotent migration adding Phase 2 availability, quote
--              conversion, operational tracking, and driving log fields.
-- ====================================================================

-- 1. Extend cockpit.drivers for fleet & chauffeur availability, maintenance, and language
ALTER TABLE cockpit.drivers
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_status text DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS english_available boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS unavailable_windows jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS driver_meta jsonb DEFAULT '{}'::jsonb;

-- 2. Extend cockpit.schedules for overnight trips, quote conversion, live operations, and driving logs
ALTER TABLE cockpit.schedules
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS end_time time without time zone,
  ADD COLUMN IF NOT EXISTS dispatch_status text DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_phone text,
  ADD COLUMN IF NOT EXISTS vehicle_plate text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS group_id text,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS group_total_vehicles integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS group_vehicle_index integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_ack_version integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by text,
  ADD COLUMN IF NOT EXISTS source_quote_no text,
  ADD COLUMN IF NOT EXISTS operation_status text DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS operation_updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS operation_history jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule_meta jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS driving_log jsonb DEFAULT '{}'::jsonb;

-- Backfill end_date for existing rows
UPDATE cockpit.schedules
SET end_date = date
WHERE end_date IS NULL;

-- 3. Unified customers & quotes table (avoids multiple unnecessary tables)
CREATE TABLE IF NOT EXISTS cockpit.customers (
  id text PRIMARY KEY,
  name text NOT NULL,
  business_number text,
  contact_person text,
  phone text,
  email text,
  address text,
  pricing_preset jsonb DEFAULT '{}'::jsonb,
  quotes jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Dynamic Pricing Presets table (editable by admin in HQ)
CREATE TABLE IF NOT EXISTS cockpit.pricing_presets (
  id text PRIMARY KEY,
  model_name text NOT NULL,
  category text NOT NULL DEFAULT 'sprinter',
  base_hours integer DEFAULT 10,
  base_fare integer NOT NULL,
  overtime_rate_per_hour integer DEFAULT 0,
  vehicle_only_fare integer DEFAULT 0,
  driver_labor_korean integer DEFAULT 150000,
  driver_labor_english integer DEFAULT 200000,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed standard VIP fleet pricing presets if not already seeded
INSERT INTO cockpit.pricing_presets (
  id, model_name, category, base_hours, base_fare, overtime_rate_per_hour,
  vehicle_only_fare, driver_labor_korean, driver_labor_english, is_active
) VALUES
  ('preset-sprinter-519', '벤츠 스프린터 519 CDI', 'sprinter', 10, 800000, 80000, 600000, 150000, 200000, true),
  ('preset-sprinter-319', '벤츠 스프린터 투어러 (319 CDI)', 'sprinter', 10, 750000, 75000, 550000, 150000, 200000, true),
  ('preset-v-class', '벤츠 V클래스 VIP 리무진', 'van', 10, 600000, 60000, 450000, 100000, 150000, true),
  ('preset-s-class', '벤츠 S클래스 세단 (S 560)', 'sedan', 10, 500000, 50000, 350000, 100000, 150000, true),
  ('preset-genesis-g90', '제네시스 G90 리무진', 'sedan', 10, 450000, 45000, 300000, 100000, 150000, true)
ON CONFLICT (id) DO UPDATE SET
  base_fare = EXCLUDED.base_fare,
  updated_at = now();

