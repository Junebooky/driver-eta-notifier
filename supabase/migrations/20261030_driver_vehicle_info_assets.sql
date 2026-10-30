-- ==============================================================================
-- [PROPOSAL / 승인 대기] 20261030_driver_vehicle_info_assets.sql
-- VIP Limousine Korea - Driver Profiles & Driver × Vehicle Info Assets Schema (Issue #37)
--
-- ⚠️ IMPORTANT NOTICE:
-- DO NOT EXECUTE DIRECTLY ON PRODUCTION / SHARED DATABASE WITHOUT EXPLICIT OWNER APPROVAL.
-- This file serves as the formal migration specification & verification plan as required by Issue #37.
-- ==============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS cockpit;

-- ==============================================================================
-- 1. TABLE: cockpit.vehicles (Vehicle Master)
-- Provides immutable RFC 4122 UUID primary keys for VIP fleet vehicles.
-- Decouples vehicles from drivers and schedules.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cockpit.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL DEFAULT 'vip_limousine_korea',
  plate TEXT NOT NULL UNIQUE,
  plate_short TEXT,
  model TEXT NOT NULL,
  model_short TEXT,
  brand TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sprinter', 'staria', 'carnival', 'genesis', 's_class')),
  category_label TEXT NOT NULL,
  sub_type TEXT,
  capacity TEXT,
  fuel_type TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_org_category
ON cockpit.vehicles (organization_id, category);

CREATE INDEX IF NOT EXISTS idx_vehicles_plate
ON cockpit.vehicles (plate);

-- Seed canonical 20 VIP fleet vehicles with deterministic UUIDs
INSERT INTO cockpit.vehicles (id, organization_id, plate, plate_short, model, model_short, brand, category, category_label, sub_type, capacity, fuel_type, status)
VALUES
  ('e0f7c22a-0001-4c12-8800-000000009982', 'vip_limousine_korea', '125호 9982', '9982', '벤츠 스프린터 투어러 (319 CDI)', '스프린터 투어러 (319)', '벤츠', 'sprinter', '벤츠 스프린터', '투어러 (319 CDI)', '13인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000001458', 'vip_limousine_korea', '700호 1458', '1458', '벤츠 스프린터 319 CDI', '스프린터 319 CDI', '벤츠', 'sprinter', '벤츠 스프린터', '319 CDI', '11인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000008040', 'vip_limousine_korea', '125호 8040', '8040', '벤츠 스프린터 319 CDI', '스프린터 319 CDI', '벤츠', 'sprinter', '벤츠 스프린터', '319 CDI', '11인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000002658', 'vip_limousine_korea', '703서 2658', '2658', '벤츠 스프린터 519 CDI', '스프린터 519 CDI', '벤츠', 'sprinter', '벤츠 스프린터', '519 CDI', '15인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000003864', 'vip_limousine_korea', '70호 3864', '3864', '벤츠 스프린터 519 CDI', '스프린터 519 CDI', '벤츠', 'sprinter', '벤츠 스프린터', '519 CDI', '15인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000003338', 'vip_limousine_korea', '71두 3338', '3338', '벤츠 스프린터 519 CDI', '스프린터 519 CDI', '벤츠', 'sprinter', '벤츠 스프린터', '519 CDI', '15인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000002553', 'vip_limousine_korea', '73호 2553', '2553', '벤츠 스프린터 519 CDI', '스프린터 519 CDI', '벤츠', 'sprinter', '벤츠 스프린터', '519 CDI', '15인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000003285', 'vip_limousine_korea', '71두 3285', '3285', '벤츠 스프린터 519 CDI', '스프린터 519 CDI', '벤츠', 'sprinter', '벤츠 스프린터', '519 CDI', '15인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000001058', 'vip_limousine_korea', '711하 1058', '1058', '벤츠 스프린터 519 CDI', '스프린터 519 CDI', '벤츠', 'sprinter', '벤츠 스프린터', '519 CDI', '15인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000007665', 'vip_limousine_korea', '125호 7665', '7665', '현대 스타리아 리무진', '스타리아 리무진', '현대', 'staria', '현대 스타리아', '스타리아 리무진', '7인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000009037', 'vip_limousine_korea', '125호 9037', '9037', '현대 스타리아 리무진', '스타리아 리무진', '현대', 'staria', '현대 스타리아', '스타리아 리무진', '7인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000008407', 'vip_limousine_korea', '142호 8407', '8407', '현대 스타리아 리무진', '스타리아 리무진', '현대', 'staria', '현대 스타리아', '스타리아 리무진', '7인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000001514', 'vip_limousine_korea', '116허 1514', '1514', '현대 스타리아 리무진', '스타리아 리무진', '현대', 'staria', '현대 스타리아', '스타리아 리무진', '7인승', '디젤', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000007681', 'vip_limousine_korea', '101호 7681', '7681', '기아 카니발 리무진', '카니발 리무진', '기아', 'carnival', '기아 카니발', '카니발 리무진', '7인승', '가솔린', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000005336', 'vip_limousine_korea', '193호 5336', '5336', '기아 카니발 하이리무진', '카니발 하이리무진', '기아', 'carnival', '기아 카니발', '카니발 하이리무진', '7인승', '가솔린', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000005947', 'vip_limousine_korea', '203호 5947', '5947', '제네시스 GV80', '제네시스 GV80', '제네시스', 'genesis', '제네시스', 'GV80', '4인승', '가솔린', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000004280', 'vip_limousine_korea', '102부 4280', '4280', '제네시스 G90 리무진', 'G90 리무진', '제네시스', 'genesis', '제네시스', 'G90 리무진', '4인승', '가솔린', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000002269', 'vip_limousine_korea', '208호 2269', '2269', '제네시스 G90L', 'G90L (롱휠베이스)', '제네시스', 'genesis', '제네시스', 'G90L', '4인승', '가솔린', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000008839', 'vip_limousine_korea', '125호 8839', '8839', '제네시스 G90', '제네시스 G90', '제네시스', 'genesis', '제네시스', 'G90', '4인승', '가솔린', 'available'),
  ('e0f7c22a-0001-4c12-8800-000000003343', 'vip_limousine_korea', '01호 3343', '3343', '벤츠 S560', '벤츠 S560', '벤츠', 's_class', '벤츠 S560', 'S560', '4인승', '가솔린', 'available')
ON CONFLICT (plate) DO UPDATE SET
  model = EXCLUDED.model,
  model_short = EXCLUDED.model_short,
  category = EXCLUDED.category,
  category_label = EXCLUDED.category_label,
  sub_type = EXCLUDED.sub_type,
  capacity = EXCLUDED.capacity,
  fuel_type = EXCLUDED.fuel_type,
  updated_at = now();

-- ==============================================================================
-- 2. TABLE: cockpit.driver_profile_assets
-- Dedicated table for driver individual identification photos (Profile).
-- Exactly 1 active profile photo per driver, independent of vehicle.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cockpit.driver_profile_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL DEFAULT 'vip_limousine_korea',
  driver_id UUID NOT NULL REFERENCES cockpit.drivers(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
  uploaded_by TEXT NOT NULL DEFAULT '본사 관리자',
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index ensuring at most 1 active profile per driver
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profile_active
ON cockpit.driver_profile_assets (organization_id, driver_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_driver_profile_driver
ON cockpit.driver_profile_assets (driver_id);

-- ==============================================================================
-- 3. TABLE: cockpit.driver_vehicle_info_assets
-- Dedicated table for Driver × Vehicle composite Info guidance assets.
-- Each (driver_id, vehicle_id) combination holds:
-- - 1 PC horizontal image (variant = 'pc')
-- - 1 Mobile vertical image (variant = 'mobile')
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cockpit.driver_vehicle_info_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL DEFAULT 'vip_limousine_korea',
  driver_id UUID NOT NULL REFERENCES cockpit.drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES cockpit.vehicles(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('pc', 'mobile')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
  uploaded_by TEXT NOT NULL DEFAULT '본사 관리자',
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index ensuring at most 1 active asset per (driver, vehicle, variant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_vehicle_info_active
ON cockpit.driver_vehicle_info_assets (organization_id, driver_id, vehicle_id, variant)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_driver_vehicle_info_lookup
ON cockpit.driver_vehicle_info_assets (driver_id, vehicle_id);

-- ==============================================================================
-- 4. TABLE: cockpit.driver_info_dispatch_logs
-- Immutable customer brochure & info dispatch audit log.
-- Captures frozen snapshot of driver, vehicle, and asset paths at time of dispatch.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cockpit.driver_info_dispatch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL DEFAULT 'vip_limousine_korea',
  booking_id UUID NOT NULL REFERENCES cockpit.schedules(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES cockpit.drivers(id),
  driver_name TEXT NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES cockpit.vehicles(id),
  vehicle_plate TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  profile_asset_id UUID REFERENCES cockpit.driver_profile_assets(id) ON DELETE SET NULL,
  pc_info_asset_id UUID REFERENCES cockpit.driver_vehicle_info_assets(id) ON DELETE SET NULL,
  mobile_info_asset_id UUID REFERENCES cockpit.driver_vehicle_info_assets(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'manual_copy', 'download')),
  recipient TEXT NOT NULL,
  dispatched_by TEXT NOT NULL DEFAULT '본사 관리자',
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_logs_booking
ON cockpit.driver_info_dispatch_logs (booking_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_logs_driver_vehicle
ON cockpit.driver_info_dispatch_logs (driver_id, vehicle_id);

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict multi-tenant isolation and role-based access control.
-- ==============================================================================
ALTER TABLE cockpit.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.driver_profile_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.driver_vehicle_info_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.driver_info_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Vehicles: Readable by all authenticated users in the org; writable only by HQ admins
CREATE POLICY vehicles_select_policy ON cockpit.vehicles
  FOR SELECT
  TO authenticated
  USING (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
  );

CREATE POLICY vehicles_admin_modify_policy ON cockpit.vehicles
  FOR ALL
  TO authenticated
  USING (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
  )
  WITH CHECK (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
  );

-- Profile assets: Drivers can select own profile; HQ admins can manage all
CREATE POLICY driver_profile_select_policy ON cockpit.driver_profile_assets
  FOR SELECT
  TO authenticated
  USING (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND (
      auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
      OR driver_id::text = auth.jwt() -> 'app_metadata' ->> 'driver_id'
      OR driver_id::text = auth.uid()::text
    )
  );

CREATE POLICY driver_profile_admin_all_policy ON cockpit.driver_profile_assets
  FOR ALL
  TO authenticated
  USING (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
  )
  WITH CHECK (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
  );

-- Info assets: Drivers can select own info; HQ admins can manage all
CREATE POLICY driver_vehicle_info_select_policy ON cockpit.driver_vehicle_info_assets
  FOR SELECT
  TO authenticated
  USING (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND (
      auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
      OR driver_id::text = auth.jwt() -> 'app_metadata' ->> 'driver_id'
      OR driver_id::text = auth.uid()::text
    )
  );

CREATE POLICY driver_vehicle_info_admin_all_policy ON cockpit.driver_vehicle_info_assets
  FOR ALL
  TO authenticated
  USING (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
  )
  WITH CHECK (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
  );

-- Dispatch logs: HQ admins only
CREATE POLICY dispatch_logs_admin_all_policy ON cockpit.driver_info_dispatch_logs
  FOR ALL
  TO authenticated
  USING (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
  )
  WITH CHECK (
    organization_id = coalesce(auth.jwt() -> 'app_metadata' ->> 'organization_id', 'vip_limousine_korea')
    AND auth.jwt() -> 'app_metadata' ->> 'cockpit_role' = 'hq_admin'
  );

COMMIT;
