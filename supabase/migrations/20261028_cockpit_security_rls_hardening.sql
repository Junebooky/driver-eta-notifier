-- ==============================================================================
-- Migration: Cockpit Security, RLS Hardening & Pricing Standard Alignment
-- Target Schema: cockpit
-- ==============================================================================

-- 1. Enable RLS on all tables in cockpit schema
ALTER TABLE IF EXISTS cockpit.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cockpit.pricing_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cockpit.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cockpit.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cockpit.presets ENABLE ROW LEVEL SECURITY;

-- 2. Drop insecure legacy "Allow all" policies
DROP POLICY IF EXISTS "Allow all on presets" ON cockpit.presets;
DROP POLICY IF EXISTS "Allow all on drivers" ON cockpit.drivers;
DROP POLICY IF EXISTS "Allow all on schedules" ON cockpit.schedules;
DROP POLICY IF EXISTS "Allow all on customers" ON cockpit.customers;
DROP POLICY IF EXISTS "Allow all on pricing_presets" ON cockpit.pricing_presets;

-- 3. Revoke dangerous direct write access from anon & public roles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA cockpit FROM anon, public;

-- 4. Create explicit RLS policies for service_role (used by server backend API routes)
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

-- 5. Safe Read Policies for public/anon
DROP POLICY IF EXISTS "Public read active pricing_presets" ON cockpit.pricing_presets;
CREATE POLICY "Public read active pricing_presets" ON cockpit.pricing_presets
  FOR SELECT TO public USING (is_active = true);

DROP POLICY IF EXISTS "Public read presets" ON cockpit.presets;
CREATE POLICY "Public read presets" ON cockpit.presets
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public read drivers" ON cockpit.drivers;
CREATE POLICY "Public read drivers" ON cockpit.drivers
  FOR SELECT TO public USING (true);

-- Anonymous users cannot read customer records directly; must go through server API
DROP POLICY IF EXISTS "Public deny direct customer access" ON cockpit.customers;

-- 6. Update pricing presets to strictly reflect verified benchmark standards
-- Sprinter 319 CDI: Chauffeur included 1,000,000 KRW, Vehicle-only 800,000 KRW
UPDATE cockpit.pricing_presets
SET
  base_fare = 1000000,
  vehicle_only_fare = 800000,
  driver_labor_korean = 150000,
  driver_labor_english = 200000,
  overtime_rate_per_hour = 0, -- Overtime rate is 0 (협의 필요) unless explicitly confirmed
  updated_at = NOW()
WHERE id = 'preset-sprinter-319';

-- Sprinter 519 CDI: Chauffeur included 800,000 KRW, Vehicle-only 600,000 KRW
UPDATE cockpit.pricing_presets
SET
  base_fare = 800000,
  vehicle_only_fare = 600000,
  driver_labor_korean = 150000,
  driver_labor_english = 200000,
  overtime_rate_per_hour = 0,
  updated_at = NOW()
WHERE id = 'preset-sprinter-519';

-- General vehicles: Driver labor Korean 100,000 KRW, English 150,000 KRW (exactly 50,000 KRW lower)
UPDATE cockpit.pricing_presets
SET
  driver_labor_korean = 100000,
  driver_labor_english = 150000,
  overtime_rate_per_hour = 0,
  updated_at = NOW()
WHERE category != 'sprinter';

