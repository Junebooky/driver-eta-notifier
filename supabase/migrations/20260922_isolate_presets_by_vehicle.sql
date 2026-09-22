-- ==============================================================================
-- Protocol Cockpit: Presets Vehicle Isolation Migration
-- Purpose: Add vehicle_no to presets to isolate custom presets per vehicle
-- Date: 2026-09-22
-- ==============================================================================

-- 1. cockpit.presets 테이블에 vehicle_no 컬럼 추가
ALTER TABLE IF EXISTS cockpit.presets 
ADD COLUMN IF NOT EXISTS vehicle_no TEXT NULL;

-- 2. vehicle_no 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_cockpit_presets_vehicle 
ON cockpit.presets (vehicle_no);

-- 3. 기존 name 단일 UNIQUE 제약조건 해제 (서로 다른 호차가 동일한 이름의 커스텀 거점 추가 가능하도록)
ALTER TABLE IF EXISTS cockpit.presets 
DROP CONSTRAINT IF EXISTS presets_name_key;

-- 4. 공통 거점(vehicle_no IS NULL)과 호차별 거점(vehicle_no)에 대한 정합성 유니크 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_global_name 
ON cockpit.presets (name) 
WHERE vehicle_no IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_vehicle_name 
ON cockpit.presets (vehicle_no, name) 
WHERE vehicle_no IS NOT NULL;

-- 5. 호환성 뷰 갱신 (cockpit_presets 뷰에 vehicle_no 컬럼 자동 반영)
CREATE OR REPLACE VIEW cockpit.cockpit_presets AS 
SELECT * FROM cockpit.presets;

-- 6. public.cockpit_presets 테이블 방어 구문 (공존 환경 대비)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cockpit_presets') THEN
    ALTER TABLE public.cockpit_presets ADD COLUMN IF NOT EXISTS vehicle_no TEXT NULL;
    CREATE INDEX IF NOT EXISTS idx_public_cockpit_presets_vehicle ON public.cockpit_presets (vehicle_no);
  END IF;
END $$;
