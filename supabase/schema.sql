-- ==============================================================================
-- Fleet Cockpit Supabase Schema Migration
-- Database Architecture for Driver ETA Notifier
-- ==============================================================================

-- 1. Table: cockpit_presets (Global & Driver-specific Location Presets)
CREATE TABLE IF NOT EXISTS public.cockpit_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short_name TEXT,
    address TEXT,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    category TEXT DEFAULT 'CUSTOM',
    is_global BOOLEAN NOT NULL DEFAULT FALSE,
    driver_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast driver / global filtering
CREATE INDEX IF NOT EXISTS idx_cockpit_presets_global_driver 
ON public.cockpit_presets(is_global, driver_id);

-- 2. Table: cockpit_drivers (Driver Profile, Home Location & Preset Ordering)
CREATE TABLE IF NOT EXISTS public.cockpit_drivers (
    id TEXT PRIMARY KEY,
    vehicle_no TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    home_location JSONB DEFAULT NULL,
    preset_order TEXT[] DEFAULT ARRAY[]::TEXT[],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.cockpit_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cockpit_drivers ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for cockpit_presets
DROP POLICY IF EXISTS "Allow select cockpit_presets" ON public.cockpit_presets;
CREATE POLICY "Allow select cockpit_presets" ON public.cockpit_presets
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert cockpit_presets" ON public.cockpit_presets;
CREATE POLICY "Allow insert cockpit_presets" ON public.cockpit_presets
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update cockpit_presets" ON public.cockpit_presets;
CREATE POLICY "Allow update cockpit_presets" ON public.cockpit_presets
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete cockpit_presets" ON public.cockpit_presets;
CREATE POLICY "Allow delete cockpit_presets" ON public.cockpit_presets
    FOR DELETE USING (true);

-- 5. RLS Policies for cockpit_drivers
DROP POLICY IF EXISTS "Allow select cockpit_drivers" ON public.cockpit_drivers;
CREATE POLICY "Allow select cockpit_drivers" ON public.cockpit_drivers
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow upsert cockpit_drivers" ON public.cockpit_drivers;
CREATE POLICY "Allow upsert cockpit_drivers" ON public.cockpit_drivers
    FOR ALL USING (true);

-- ==============================================================================
-- Seed Data
-- ==============================================================================

-- Global Core Presets (is_global = true)
INSERT INTO public.cockpit_presets (id, name, short_name, address, lat, lng, category, is_global, driver_id)
VALUES
    ('3c7e416a-1111-4111-a111-111111111111', '인천국제공항 제1여객터미널', '인천공항 T1', '인천 중구 공항로 272', 37.4495, 126.4512, 'AIRPORT', true, NULL),
    ('3c7e416a-2222-4222-a222-222222222222', '인천국제공항 제2여객터미널', '인천공항 T2', '인천 중구 제2소화물통로 255', 37.4691, 126.4344, 'AIRPORT', true, NULL),
    ('3c7e416a-3333-4333-a333-333333333333', '조선팰리스 강남', '조선팰리스 강남', '서울 강남구 테헤란로 231', 37.5042, 127.0425, 'HOTEL', true, NULL),
    ('3c7e416a-4444-4444-a444-444444444444', '시그니엘 서울', '시그니엘 서울', '서울 송파구 올림픽로 300 롯데월드타워', 37.5126, 127.1025, 'HOTEL', true, NULL),
    ('3c7e416a-5555-4555-a555-555555555555', '인제스피디움 호텔', '인제스피디움 호텔', '강원 인제군 기린면 상하답로 130', 38.0051, 128.2917, 'CIRCUIT', true, NULL),
    ('3c7e416a-6666-4666-a666-666666666666', '인제스피디움 피트/패독', '인제 패독', '강원 인제군 기린면 상하답로 130 패독', 38.0065, 128.2930, 'CIRCUIT', true, NULL),
    ('3c7e416a-7777-4777-a777-777777777777', '차량 반납지 (하남/미사)', '차량 반납지', '경기 하남시 미사강변대로 123', 37.5614, 127.1932, 'RETURN', true, NULL)
ON CONFLICT (id) DO UPDATE 
SET 
    name = EXCLUDED.name,
    short_name = EXCLUDED.short_name,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    category = EXCLUDED.category,
    is_global = EXCLUDED.is_global;

-- Default Seed Driver ('driver_4')
INSERT INTO public.cockpit_drivers (id, vehicle_no, driver_name, home_location, preset_order)
VALUES
    (
        'driver_4',
        '4호차',
        '윤태준',
        '{"name":"자택","address":"서울 강남구 역삼동","lat":37.5000,"lng":127.0350}'::jsonb,
        ARRAY[
            '3c7e416a-1111-4111-a111-111111111111',
            '3c7e416a-2222-4222-a222-222222222222',
            '3c7e416a-3333-4333-a333-333333333333',
            '3c7e416a-4444-4444-a444-444444444444',
            '3c7e416a-5555-4555-a555-555555555555',
            '3c7e416a-6666-4666-a666-666666666666',
            '3c7e416a-7777-4777-a777-777777777777'
        ]
    )
ON CONFLICT (id) DO NOTHING;
