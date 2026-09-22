-- ==============================================================================
-- Protocol Cockpit: Supabase Enterprise Schema
-- Dedicated Schema: cockpit
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS cockpit;

-- PostgREST Exposure
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, cockpit';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- Grants
GRANT USAGE ON SCHEMA cockpit TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cockpit TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA cockpit TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cockpit TO anon, authenticated, service_role, postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA cockpit 
GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA cockpit 
GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA cockpit 
GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 1. 공통 거점 마스터 테이블
CREATE TABLE IF NOT EXISTS cockpit.presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'custom',
  name TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 호차별 드라이버 프로필 테이블
CREATE TABLE IF NOT EXISTS cockpit.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no TEXT NOT NULL UNIQUE,
  car_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  phone TEXT,
  default_navi TEXT DEFAULT 'tmap',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 호차별 배차 스케줄 테이블
CREATE TABLE IF NOT EXISTS cockpit.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no TEXT NOT NULL REFERENCES cockpit.drivers(vehicle_no) ON DELETE CASCADE,
  date DATE NOT NULL,
  pickup_time TIME NOT NULL,
  time_display TEXT NOT NULL,
  origin TEXT NOT NULL,
  origin_address TEXT,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination TEXT NOT NULL,
  destination_address TEXT,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  passenger_name TEXT,
  passenger_count INTEGER DEFAULT 1,
  passenger_note TEXT,
  flight_number TEXT,
  protocol_notes TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cockpit_schedules_lookup 
ON cockpit.schedules (vehicle_no, date, pickup_time ASC);

-- RLS
ALTER TABLE cockpit.presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on presets" ON cockpit.presets;
CREATE POLICY "Allow all on presets" ON cockpit.presets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on drivers" ON cockpit.drivers;
CREATE POLICY "Allow all on drivers" ON cockpit.drivers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on schedules" ON cockpit.schedules;
CREATE POLICY "Allow all on schedules" ON cockpit.schedules FOR ALL USING (true) WITH CHECK (true);

-- 호환성 뷰
CREATE OR REPLACE VIEW cockpit.cockpit_presets AS SELECT * FROM cockpit.presets;
CREATE OR REPLACE VIEW cockpit.cockpit_drivers AS SELECT * FROM cockpit.drivers;
CREATE OR REPLACE VIEW cockpit.cockpit_schedules AS SELECT * FROM cockpit.schedules;
