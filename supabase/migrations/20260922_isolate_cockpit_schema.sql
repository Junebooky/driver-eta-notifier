-- ==============================================================================
-- Protocol Cockpit: Dedicated Schema Isolation Migration
-- Schema: cockpit (completely isolated from public)
-- Date: 2026-09-22
-- ==============================================================================

-- 1. 기존 public 스키마에 잘못 생성된 cockpit 관련 테이블 완전 정리 (기존 타 프로젝트 보호)
DROP TABLE IF EXISTS public.cockpit_schedules CASCADE;
DROP TABLE IF EXISTS public.cockpit_drivers CASCADE;
DROP TABLE IF EXISTS public.cockpit_presets CASCADE;

-- 2. 독립 전용 스키마 'cockpit' 생성
CREATE SCHEMA IF NOT EXISTS cockpit;

-- 3. PostgREST (Supabase API)에 'cockpit' 스키마 노출 및 리로드
-- 기존 public 스키마와 새로운 cockpit 스키마를 함께 노출합니다.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, cockpit';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- 4. 권한 부여 (anon, authenticated, service_role 역할에 스키마 사용권 및 테이블 DDL/DML 권한 부여)
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

-- ==============================================================================
-- 5. 'cockpit' 전용 스키마 내 테이블 생성
-- ==============================================================================

-- (1) 공통 거점 마스터 테이블 (cockpit.presets)
CREATE TABLE IF NOT EXISTS cockpit.presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'custom', -- 'airport' | 'hotel' | 'circuit' | 'custom'
  name TEXT NOT NULL UNIQUE,              -- e.g. '조선팰리스 강남', '인천공항 T1', '인제스피디움 호텔'
  address TEXT NOT NULL,                 -- 정밀 도로명 주소
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- (2) 호차별 드라이버 프로필 테이블 (cockpit.drivers)
CREATE TABLE IF NOT EXISTS cockpit.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no TEXT NOT NULL UNIQUE,       -- e.g. '1호차', '2호차', '4호차' (고유 격리 키)
  car_number TEXT NOT NULL,              -- e.g. '142호 7811'
  driver_name TEXT NOT NULL,             -- e.g. '윤태준'
  phone TEXT,
  default_navi TEXT DEFAULT 'tmap',      -- 'tmap' | 'kakao' | 'naver'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- (3) 호차별 배차 스케줄 테이블 (cockpit.schedules)
CREATE TABLE IF NOT EXISTS cockpit.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no TEXT NOT NULL REFERENCES cockpit.drivers(vehicle_no) ON DELETE CASCADE,
  date DATE NOT NULL,                    -- '2026-09-18'
  pickup_time TIME NOT NULL,             -- 정렬용 공식 픽업/시작 시각 (e.g. '09:00:00')
  time_display TEXT NOT NULL,            -- 공식 고시 텍스트 원본 (e.g. '09:00 픽업' 또는 '09:00 - 10:20')
  
  -- 동선 정보
  origin TEXT NOT NULL,
  origin_address TEXT,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination TEXT NOT NULL,
  destination_address TEXT,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  
  -- 승객 및 의전 상세
  passenger_name TEXT,
  passenger_count INTEGER DEFAULT 1,
  passenger_note TEXT,
  flight_number TEXT,
  protocol_notes TEXT,
  
  -- 관제 상태
  status TEXT DEFAULT 'scheduled',       -- 'scheduled' | 'moving' | 'standby' | 'driving' | 'completed'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 복합 인덱스 (호차별, 일자별, 픽업 시간순 고속 스캔)
CREATE INDEX IF NOT EXISTS idx_cockpit_schedules_lookup 
ON cockpit.schedules (vehicle_no, date, pickup_time ASC);

-- 6. Row Level Security (RLS) 설정
ALTER TABLE cockpit.presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on presets" ON cockpit.presets;
CREATE POLICY "Allow all on presets" ON cockpit.presets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on drivers" ON cockpit.drivers;
CREATE POLICY "Allow all on drivers" ON cockpit.drivers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on schedules" ON cockpit.schedules;
CREATE POLICY "Allow all on schedules" ON cockpit.schedules FOR ALL USING (true) WITH CHECK (true);

-- 호환성 뷰 (cockpit_presets, cockpit_drivers, cockpit_schedules 이름으로도 즉시 접근 가능)
CREATE OR REPLACE VIEW cockpit.cockpit_presets AS SELECT * FROM cockpit.presets;
CREATE OR REPLACE VIEW cockpit.cockpit_drivers AS SELECT * FROM cockpit.drivers;
CREATE OR REPLACE VIEW cockpit.cockpit_schedules AS SELECT * FROM cockpit.schedules;

-- ==============================================================================
-- 7. 공식 데이터 시드 적재 (SEED DATA)
-- ==============================================================================

-- (1) 공통 거점 마스터 시드 (SSOT Presets)
INSERT INTO cockpit.presets (id, name, address, lat, lng, category, order_index)
VALUES
  ('3c7e416a-1111-4111-a111-111111111111', '인천공항 T1', '인천 중구 공항로 272', 37.4495, 126.4512, 'airport', 1),
  ('3c7e416a-2222-4222-a222-222222222222', '인천공항 T2', '인천 중구 제2소화물통로 255', 37.4691, 126.4344, 'airport', 2),
  ('3c7e416a-3333-4333-a333-333333333333', '조선팰리스 강남', '서울 강남구 테헤란로 231', 37.5042, 127.0425, 'hotel', 3),
  ('3c7e416a-4444-4444-a444-444444444444', '시그니엘 서울', '서울 송파구 올림픽로 300 롯데월드타워', 37.5126, 127.1025, 'hotel', 4),
  ('3c7e416a-5555-4555-a555-555555555555', '인제스피디움 호텔', '강원 인제군 기린면 상하답로 130', 38.0051, 128.2917, 'circuit', 5),
  ('3c7e416a-6666-4666-a666-666666666666', '인제스피디움 피트/패독', '강원 인제군 기린면 상하답로 130 패독', 38.0065, 128.2930, 'circuit', 6),
  ('3c7e416a-7777-4777-a777-777777777777', '차량 반납지 (하남/미사)', '경기 하남시 미사강변대로 123', 37.5614, 127.1932, 'custom', 7)
ON CONFLICT (name) DO UPDATE 
SET 
  address = EXCLUDED.address,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  category = EXCLUDED.category,
  order_index = EXCLUDED.order_index;

-- (2) 호차별 드라이버 프로필 시드 (4호차, 1호차, 2호차)
INSERT INTO cockpit.drivers (vehicle_no, car_number, driver_name, phone, default_navi)
VALUES
  ('4호차', '142호 7811', '윤태준', '010-1234-5678', 'tmap'),
  ('1호차', '111호 1111', '김의전', '010-9876-5432', 'tmap'),
  ('2호차', '222호 2222', '박의전', '010-5555-5555', 'tmap')
ON CONFLICT (vehicle_no) DO UPDATE
SET
  car_number = EXCLUDED.car_number,
  driver_name = EXCLUDED.driver_name,
  phone = EXCLUDED.phone,
  default_navi = EXCLUDED.default_navi;

-- (3) 호차별 스케줄 시드
-- 4호차 (윤태준 드라이버 - 페라리 VIP 의전 공식 4일치 원본 배차표)
INSERT INTO cockpit.schedules (
  id, vehicle_no, date, pickup_time, time_display,
  origin, origin_address, origin_lat, origin_lng,
  destination, destination_address, destination_lat, destination_lng,
  passenger_name, passenger_count, flight_number, protocol_notes, status
)
VALUES
  (
    '44444444-0001-4000-a000-000000000001', '4호차', '2026-09-17', '09:50:00', '09:50 착륙',
    '인천공항 T1', '인천 중구 공항로 272', 37.4495, 126.4512,
    '조선팰리스 강남', '서울 강남구 테헤란로 231', 37.5042, 127.0425,
    'DENZEL SOFYAN 외 1명 (TARA SOFYAN)', 2, 'SQ 612', 'CLUB CHALLENGE VIP 영접 • T1 입국장 피켓 대기', 'scheduled'
  ),
  (
    '44444444-0002-4000-a000-000000000002', '4호차', '2026-09-18', '09:00:00', '09:00 픽업',
    '조선팰리스 강남', '서울 강남구 테헤란로 231', 37.5042, 127.0425,
    '인제스피디움 호텔', '강원 인제군 기린면 상하답로 130', 38.0051, 128.2917,
    'DENZEL SOFYAN 외 1명 (TARA SOFYAN)', 2, NULL, 'CLUB CHALLENGE 서킷 행사 이동 • 인제 호텔 체크인', 'scheduled'
  ),
  (
    '44444444-0003-4000-a000-000000000003', '4호차', '2026-09-19', '14:30:00', '14:30 픽업',
    '인제스피디움 피트/패독', '강원 인제군 기린면 상하답로 130 패독', 38.0065, 128.2930,
    '조선팰리스 강남', '서울 강남구 테헤란로 231', 37.5042, 127.0425,
    'DENZEL SOFYAN 외 1명 (TARA SOFYAN)', 2, NULL, 'CLUB CHALLENGE 트랙 세션 종료 후 강남 복귀', 'scheduled'
  ),
  (
    '44444444-0004-4000-a000-000000000004', '4호차', '2026-09-20', '13:00:00', '13:00 픽업',
    '조선팰리스 강남', '서울 강남구 테헤란로 231', 37.5042, 127.0425,
    '인천공항 T1', '인천 중구 공항로 272', 37.4495, 126.4512,
    'KAI THIO (1명)', 1, 'SQ 601 (16:45 출국)', 'CLUB CHALLENGE C/D 출국 샌딩', 'scheduled'
  )
ON CONFLICT (id) DO UPDATE
SET
  vehicle_no = EXCLUDED.vehicle_no,
  date = EXCLUDED.date,
  pickup_time = EXCLUDED.pickup_time,
  time_display = EXCLUDED.time_display,
  origin = EXCLUDED.origin,
  origin_address = EXCLUDED.origin_address,
  destination = EXCLUDED.destination,
  destination_address = EXCLUDED.destination_address,
  passenger_name = EXCLUDED.passenger_name,
  flight_number = EXCLUDED.flight_number,
  protocol_notes = EXCLUDED.protocol_notes,
  status = EXCLUDED.status;

-- 1호차 격리 검증용 별도 일정 (4호차와 완전히 분리됨)
INSERT INTO cockpit.schedules (
  id, vehicle_no, date, pickup_time, time_display,
  origin, origin_address, origin_lat, origin_lng,
  destination, destination_address, destination_lat, destination_lng,
  passenger_name, passenger_count, flight_number, protocol_notes, status
)
VALUES
  (
    '11111111-0001-4000-a000-000000000001', '1호차', '2026-09-17', '11:00:00', '11:00 착륙',
    '인천공항 T2', '인천 중구 제2소화물통로 255', 37.4691, 126.4344,
    '시그니엘 서울', '서울 송파구 올림픽로 300 롯데월드타워', 37.5126, 127.1025,
    'FERRARI GLOBAL VIP (2명)', 2, 'KE 012', '1호차 전담 VIP 영접 의전', 'scheduled'
  )
ON CONFLICT (id) DO NOTHING;
