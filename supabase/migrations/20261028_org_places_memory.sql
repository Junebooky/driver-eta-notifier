-- Migration: 20261028_org_places_memory.sql
-- Description: Organization verified place memory, alias matching, and entry gate notes (Phase 2)

CREATE TABLE IF NOT EXISTS public.org_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  road_address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  entry_gate_notes TEXT,
  verified_by TEXT DEFAULT 'HQ_MANAGER',
  verified_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fast array search index for aliases
CREATE INDEX IF NOT EXISTS idx_org_places_aliases ON public.org_places USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_org_places_name ON public.org_places (name);
CREATE INDEX IF NOT EXISTS idx_org_places_org_id ON public.org_places (org_id);

-- Seed Initial Verified VIP Place Memory
INSERT INTO public.org_places (id, org_id, name, aliases, road_address, lat, lng, entry_gate_notes)
VALUES
  (
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '조선팰리스 서울 강남',
    ARRAY['조선팰리스', '조선 팰리스', 'Josun Palace', '역삼 조선팰리스', '센터필드 조선팰리스'],
    '서울 강남구 테헤란로 231 센터필드 웨스트타워',
    37.5042,
    127.0425,
    '지하 1층 드롭오프 존 진입 후 의전 발렛 구역 정차'
  ),
  (
    '00000000-0000-0000-0001-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '서울신라호텔',
    ARRAY['신라호텔', '서울 신라', 'Shilla Hotel', '장충동 신라호텔'],
    '서울 중구 동호로 249',
    37.5562,
    127.0051,
    '영빈관 입구 통과 후 메인 로비 정문 드롭오프 존'
  ),
  (
    '00000000-0000-0000-0001-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '인천국제공항 제2여객터미널',
    ARRAY['인천공항 T2', '인천공항 2터미널', '인천국제공항 T2', 'ICN T2'],
    '인천 중구 제2터미널대로 446',
    37.4688,
    126.4335,
    '3층 출국장 3번 게이트 앞 의전 정차 구역'
  ),
  (
    '00000000-0000-0000-0001-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '인천국제공항 제1여객터미널',
    ARRAY['인천공항 T1', '인천공항 1터미널', '인천국제공항 T1', 'ICN T1'],
    '인천 중구 공항로 272',
    37.4495,
    126.4507,
    '3층 출국장 7번 게이트 앞 의전 정차 구역'
  ),
  (
    '00000000-0000-0000-0001-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '심텍 본사 (오창)',
    ARRAY['심텍', '심텍 본사', '심텍오창', 'Simmtech HQ', '심텍 오창공장'],
    '충북 청주시 청원구 오창읍 양청3길 39',
    36.7118,
    127.4243,
    '정문 경비실에서 의전 차량 사전 등록 확인 후 VIP 주차구역 안내 수령'
  )
ON CONFLICT (id) DO NOTHING;
