-- ==============================================================================
-- [PROPOSAL / 승인 대기] 20261029_cockpit_driving_logs_and_expenses.sql
-- VIP Limousine Korea - Cockpit Driving Logs & Expenses Real DB Schema (v2 - Hardened)
--
-- ⚠️ IMPORTANT NOTICE:
-- DO NOT EXECUTE DIRECTLY ON PRODUCTION / SHARED DATABASE WITHOUT EXPLICIT OWNER APPROVAL.
-- This file serves as the formal migration specification & verification plan.
-- ==============================================================================

BEGIN;

-- 1. Ensure cockpit schema exists
CREATE SCHEMA IF NOT EXISTS cockpit;

-- ==============================================================================
-- 2. TABLE: cockpit.driving_logs
-- Dedicated table for driver-submitted and HQ-reviewed daily/booking driving logs.
-- Uses verified UUID driver_id and text organization_id matching app_metadata.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cockpit.driving_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL DEFAULT 'vip_limousine_korea',
  booking_id UUID REFERENCES cockpit.schedules(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES cockpit.drivers(id) ON DELETE SET NULL,
  driver_name TEXT NOT NULL,
  vehicle_id TEXT,
  vehicle_plate TEXT,
  vehicle_model TEXT,
  customer_id TEXT,
  customer_name TEXT,
  event_id TEXT,
  event_name TEXT,

  -- Operational Timestamps & Timeline
  driving_date DATE NOT NULL,
  clock_in TIME,
  clock_out TIME,
  garage_departure_time TIME,
  customer_service_start TIME,
  customer_service_end TIME,
  garage_arrival_time TIME,
  total_duty_hours TEXT,

  -- Odometer & Distance
  start_km INTEGER,
  end_km INTEGER,
  distance_km INTEGER,

  -- Route Stops & Notes
  stops JSONB DEFAULT '[]'::jsonb,
  notes TEXT,

  -- Expense Aggregation
  expense_amount INTEGER DEFAULT 0,
  expense_count INTEGER DEFAULT 0,

  -- Lifecycle & Review Status
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_notes TEXT,
  review_history JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for cockpit.driving_logs
CREATE INDEX IF NOT EXISTS idx_driving_logs_org_driver_date
ON cockpit.driving_logs (organization_id, driver_id, driving_date DESC);

CREATE INDEX IF NOT EXISTS idx_driving_logs_booking_id
ON cockpit.driving_logs (booking_id);

CREATE INDEX IF NOT EXISTS idx_driving_logs_status
ON cockpit.driving_logs (status);

-- ==============================================================================
-- 3. TABLE: cockpit.expenses
-- Dedicated table for business expenses (fuel, toll, parking, meal, etc.)
-- Links to booking_id (priority) or stays unassigned if not confirmed.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cockpit.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL DEFAULT 'vip_limousine_korea',
  booking_id UUID REFERENCES cockpit.schedules(id) ON DELETE SET NULL,
  driving_log_id UUID REFERENCES cockpit.driving_logs(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES cockpit.drivers(id) ON DELETE SET NULL,
  driver_name TEXT NOT NULL,
  vehicle_id TEXT,
  vehicle_plate TEXT,
  vehicle_model TEXT,
  customer_id TEXT,
  customer_name TEXT,
  event_id TEXT,
  event_name TEXT,

  -- Expense Specifics
  expense_date DATE NOT NULL,
  expense_time TIME NOT NULL,
  category TEXT NOT NULL,
  category_label TEXT,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  merchant TEXT NOT NULL,
  address TEXT,
  payment_method TEXT DEFAULT 'company_card',
  payment_method_label TEXT,
  memo TEXT,

  -- Secure Receipt Storage (Private bucket path, zero public exposure)
  receipt_storage_path TEXT,
  receipt_mime_type TEXT,
  has_receipt_image BOOLEAN DEFAULT false,
  ocr_extracted BOOLEAN DEFAULT false,
  ocr_summary TEXT,
  ocr_details JSONB DEFAULT '{}'::jsonb,

  -- Hi-Pass Toll Metadata & Deduplication Key
  hipass_tx_key TEXT,
  hipass_entrance TEXT,
  hipass_exit TEXT,
  hipass_card_no TEXT,
  billable_to_customer BOOLEAN DEFAULT true,

  -- Lifecycle & Review Status
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  submitted_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_notes TEXT,
  audit_history JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for cockpit.expenses
CREATE INDEX IF NOT EXISTS idx_expenses_org_driver_date
ON cockpit.expenses (organization_id, driver_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_booking_id
ON cockpit.expenses (booking_id);

CREATE INDEX IF NOT EXISTS idx_expenses_driving_log_id
ON cockpit.expenses (driving_log_id);

CREATE INDEX IF NOT EXISTS idx_expenses_status
ON cockpit.expenses (status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_hipass_tx_key
ON cockpit.expenses (hipass_tx_key)
WHERE hipass_tx_key IS NOT NULL;

-- ==============================================================================
-- 4. STORAGE SPECIFICATION (Unified 'cockpit-assets' bucket)
-- Note: 'cockpit-assets' bucket pre-exists in Supabase project (15MB limit, private).
-- ZERO new buckets created to prevent multi-tenant bucket proliferation.
-- Receipts are strictly organized under:
-- cockpit-assets/vip_limousine_korea/expenses/receipts/{driver_uuid}/{yyyy}/{mm}/...
-- ==============================================================================

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- Strictly uses app_metadata.cockpit_role, app_metadata.org, and driver_id UUID.
-- ZERO name-matching OR conditions allowed.
-- ==============================================================================
ALTER TABLE cockpit.driving_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.expenses ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Driving Logs Policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS p_driving_logs_service_role ON cockpit.driving_logs;
CREATE POLICY p_driving_logs_service_role ON cockpit.driving_logs
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_driving_logs_select ON cockpit.driving_logs;
CREATE POLICY p_driving_logs_select ON cockpit.driving_logs
FOR SELECT TO authenticated USING (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
  )
);

DROP POLICY IF EXISTS p_driving_logs_insert ON cockpit.driving_logs;
CREATE POLICY p_driving_logs_insert ON cockpit.driving_logs
FOR INSERT TO authenticated WITH CHECK (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
    AND status IN ('draft', '검토 대기')
  )
);

DROP POLICY IF EXISTS p_driving_logs_update ON cockpit.driving_logs;
CREATE POLICY p_driving_logs_update ON cockpit.driving_logs
FOR UPDATE TO authenticated
USING (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
    AND status IN ('draft', '보완 필요')
  )
)
WITH CHECK (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
    AND status IN ('draft', '검토 대기')
  )
);

DROP POLICY IF EXISTS p_driving_logs_delete ON cockpit.driving_logs;
CREATE POLICY p_driving_logs_delete ON cockpit.driving_logs
FOR DELETE TO authenticated USING (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
    AND status = 'draft'
  )
);

-- ------------------------------------------------------------------------------
-- Expenses Policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS p_expenses_service_role ON cockpit.expenses;
CREATE POLICY p_expenses_service_role ON cockpit.expenses
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_expenses_select ON cockpit.expenses;
CREATE POLICY p_expenses_select ON cockpit.expenses
FOR SELECT TO authenticated USING (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
  )
);

DROP POLICY IF EXISTS p_expenses_insert ON cockpit.expenses;
CREATE POLICY p_expenses_insert ON cockpit.expenses
FOR INSERT TO authenticated WITH CHECK (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
    AND status IN ('draft', '검수 대기')
  )
);

DROP POLICY IF EXISTS p_expenses_update ON cockpit.expenses;
CREATE POLICY p_expenses_update ON cockpit.expenses
FOR UPDATE TO authenticated
USING (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
    AND status IN ('draft', '보완 필요')
  )
)
WITH CHECK (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
    AND status IN ('draft', '검수 대기')
  )
);

DROP POLICY IF EXISTS p_expenses_delete ON cockpit.expenses;
CREATE POLICY p_expenses_delete ON cockpit.expenses
FOR DELETE TO authenticated USING (
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
  )
  OR
  (
    ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) = organization_id
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
    AND driver_id = (((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text)::uuid)
    AND status = 'draft'
  )
);

-- ------------------------------------------------------------------------------
-- Storage Objects Policies for 'cockpit-assets' Bucket
-- Strict multi-tenant and driver-level path isolation:
-- HQ Admin: Access all assets within their organization (name LIKE '<org>/%')
-- Driver: Strictly restricted to their own driver_id receipt path (name LIKE '<org>/expenses/receipts/<driver_id>/%')
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS p_storage_cockpit_assets_select ON storage.objects;
CREATE POLICY p_storage_cockpit_assets_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'cockpit-assets'
  AND (
    (
      ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
      AND name LIKE (((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) || '/%')
    )
    OR
    (
      ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
      AND (
        name LIKE (
          ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) || '/expenses/receipts/' ||
          ((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text) || '/%'
        )
        OR
        name LIKE (
          ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) || '/drivers/profiles/' ||
          ((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text) || '/%'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS p_storage_cockpit_assets_insert ON storage.objects;
CREATE POLICY p_storage_cockpit_assets_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'cockpit-assets'
  AND (
    (
      ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'hq_admin'::text
      AND name LIKE (((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) || '/%')
    )
    OR
    (
      ((auth.jwt() -> 'app_metadata'::text) ->> 'cockpit_role'::text) = 'driver'::text
      AND name LIKE (
        ((auth.jwt() -> 'app_metadata'::text) ->> 'org'::text) || '/expenses/receipts/' ||
        ((auth.jwt() -> 'app_metadata'::text) ->> 'driver_id'::text) || '/%'
      )
    )
  )
);

COMMIT;

-- ==============================================================================
-- 6. APPLICATION & ROLLBACK (RECOVERY) SPECIFICATION
-- ==============================================================================
-- [적용 순서 (Application Sequence)]
-- 1. 기존 비공개 버킷 'cockpit-assets' 내 19개 말단 폴더 구조 확인
-- 2. cockpit.driving_logs 생성 (외래키 ON DELETE SET NULL로 schedules, drivers 종속성 무해)
-- 3. cockpit.expenses 생성 (외래키 ON DELETE SET NULL로 schedules, drivers, driving_logs 종속성 무해)
-- 4. RLS 활성화 및 app_metadata 기반 정책 등록
--
-- [단계적 schedules 매핑 계획 (Phased Schedules Mapping)]
-- - 현재 cockpit.schedules는 driver_name, vehicle_no 기준 매핑이 유지되고 있습니다.
-- - 본 마이그레이션 적용 후에도 booking_id는 ON DELETE SET NULL 외래키이므로 기존 schedules 테이블에 무영향입니다.
-- - 차후 cockpit.schedules에 driver_id UUID 컬럼 추가 시 1:1 안전 승격이 가능합니다.
--
-- [롤백 순서 (Rollback Sequence)]
-- 1. DROP POLICY IF EXISTS p_storage_cockpit_assets_insert ON storage.objects;
-- 2. DROP POLICY IF EXISTS p_storage_cockpit_assets_select ON storage.objects;
-- 3. DROP TABLE IF EXISTS cockpit.expenses CASCADE;
-- 4. DROP TABLE IF EXISTS cockpit.driving_logs CASCADE;
-- ==============================================================================
