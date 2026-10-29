-- ==============================================================================
-- [PROPOSAL / 승인 대기] 20261029_cockpit_driving_logs_and_expenses.sql
-- VIP Limousine Korea - Cockpit Driving Logs & Expenses Real DB Schema
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
-- Supports multiple bookings per driver per day without collision.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cockpit.driving_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  booking_id UUID REFERENCES cockpit.schedules(id) ON DELETE SET NULL,
  driver_id TEXT,
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
-- Never exposes raw public receipt URLs or localStorage blobs.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cockpit.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  booking_id UUID REFERENCES cockpit.schedules(id) ON DELETE SET NULL,
  driving_log_id UUID REFERENCES cockpit.driving_logs(id) ON DELETE SET NULL,
  driver_id TEXT,
  driver_name TEXT NOT NULL,
  vehicle_id TEXT,
  vehicle_plate TEXT,
  vehicle_model TEXT,
  customer_id TEXT,
  customer_name TEXT,
  event_id TEXT,

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
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE cockpit.driving_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.expenses ENABLE ROW LEVEL SECURITY;

-- Driving logs: Drivers can only access their own logs; HQ admin has full access for their org
DROP POLICY IF EXISTS p_driving_logs_select ON cockpit.driving_logs;
CREATE POLICY p_driving_logs_select ON cockpit.driving_logs
FOR SELECT USING (
  (auth.role() = 'service_role') OR
  (auth.jwt() ->> 'role' = 'hq_admin' AND (auth.jwt() ->> 'org_id')::uuid = organization_id) OR
  (auth.jwt() ->> 'role' = 'driver' AND (auth.jwt() ->> 'user_id' = driver_id OR auth.jwt() ->> 'driver_name' = driver_name))
);

DROP POLICY IF EXISTS p_driving_logs_insert ON cockpit.driving_logs;
CREATE POLICY p_driving_logs_insert ON cockpit.driving_logs
FOR INSERT WITH CHECK (
  (auth.role() = 'service_role') OR
  (auth.jwt() ->> 'role' = 'hq_admin' AND (auth.jwt() ->> 'org_id')::uuid = organization_id) OR
  (auth.jwt() ->> 'role' = 'driver' AND (auth.jwt() ->> 'user_id' = driver_id OR auth.jwt() ->> 'driver_name' = driver_name))
);

DROP POLICY IF EXISTS p_driving_logs_update ON cockpit.driving_logs;
CREATE POLICY p_driving_logs_update ON cockpit.driving_logs
FOR UPDATE USING (
  (auth.role() = 'service_role') OR
  (auth.jwt() ->> 'role' = 'hq_admin' AND (auth.jwt() ->> 'org_id')::uuid = organization_id) OR
  (auth.jwt() ->> 'role' = 'driver' AND (auth.jwt() ->> 'user_id' = driver_id OR auth.jwt() ->> 'driver_name' = driver_name) AND status = 'draft')
);

-- Expenses: Drivers can only access their own expenses; HQ admin has full access for their org
DROP POLICY IF EXISTS p_expenses_select ON cockpit.expenses;
CREATE POLICY p_expenses_select ON cockpit.expenses
FOR SELECT USING (
  (auth.role() = 'service_role') OR
  (auth.jwt() ->> 'role' = 'hq_admin' AND (auth.jwt() ->> 'org_id')::uuid = organization_id) OR
  (auth.jwt() ->> 'role' = 'driver' AND (auth.jwt() ->> 'user_id' = driver_id OR auth.jwt() ->> 'driver_name' = driver_name))
);

DROP POLICY IF EXISTS p_expenses_insert ON cockpit.expenses;
CREATE POLICY p_expenses_insert ON cockpit.expenses
FOR INSERT WITH CHECK (
  (auth.role() = 'service_role') OR
  (auth.jwt() ->> 'role' = 'hq_admin' AND (auth.jwt() ->> 'org_id')::uuid = organization_id) OR
  (auth.jwt() ->> 'role' = 'driver' AND (auth.jwt() ->> 'user_id' = driver_id OR auth.jwt() ->> 'driver_name' = driver_name))
);

DROP POLICY IF EXISTS p_expenses_update ON cockpit.expenses;
CREATE POLICY p_expenses_update ON cockpit.expenses
FOR UPDATE USING (
  (auth.role() = 'service_role') OR
  (auth.jwt() ->> 'role' = 'hq_admin' AND (auth.jwt() ->> 'org_id')::uuid = organization_id) OR
  (auth.jwt() ->> 'role' = 'driver' AND (auth.jwt() ->> 'user_id' = driver_id OR auth.jwt() ->> 'driver_name' = driver_name) AND status = 'draft')
);

COMMIT;

-- ==============================================================================
-- 5. DATA PRESERVATION & COMPATIBILITY VERIFICATION PLAN:
-- 1. Zero alteration to existing `cockpit.schedules`, `cockpit.drivers`, or `cockpit.customers`.
-- 2. New tables use foreign keys with ON DELETE SET NULL to prevent cascading data loss.
-- 3. Backward compatibility: Existing `schedules.driving_log` JSONB column remains intact.
-- 4. Storage security: Receipt files stored under private bucket path; zero public URLs.
-- ==============================================================================
