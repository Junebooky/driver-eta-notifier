-- PROPOSAL: staging validation and explicit owner approval are required before shared DB release.
-- Self-contained replacement for the older reporting-table proposal; no data or users are seeded.
BEGIN;
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

ALTER TABLE cockpit.driving_logs ADD COLUMN IF NOT EXISTS passenger_count integer CHECK(passenger_count>=0);
ALTER TABLE cockpit.driving_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.driving_logs,cockpit.expenses FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON cockpit.driving_logs,cockpit.expenses TO service_role;
-- One report per driver, booking and actual working date, including an unassigned daily report.
CREATE UNIQUE INDEX IF NOT EXISTS driving_logs_identity_date_key ON cockpit.driving_logs
  (organization_id,driver_id,driving_date,booking_id) NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION cockpit.reporting_log_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(748201,12);
  IF TG_OP='UPDATE' AND OLD.status IN ('승인 완료','검토 중') AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'REPORT_ALREADY_UNDER_REVIEW' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status='draft' THEN
    SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO NEW.stops FROM (
      SELECT DISTINCT ON (coalesce(value->>'actionIdempotencyKey',value->>'id',md5(value::text))) value,ordinal
      FROM jsonb_array_elements(coalesce(OLD.stops,'[]'::jsonb)||coalesce(NEW.stops,'[]'::jsonb)) WITH ORDINALITY AS s(value,ordinal)
      ORDER BY coalesce(value->>'actionIdempotencyKey',value->>'id',md5(value::text)),ordinal DESC
    ) merged;
  END IF;
  SELECT coalesce(sum(e.amount),0),count(*) INTO NEW.expense_amount,NEW.expense_count
  FROM cockpit.expenses e WHERE e.organization_id=NEW.organization_id AND e.driver_id=NEW.driver_id
    AND e.expense_date=NEW.driving_date AND e.booking_id IS NOT DISTINCT FROM NEW.booking_id
    AND e.status NOT IN ('draft','반려');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cockpit.reporting_expense_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d cockpit.driving_logs;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(748201,12);
  IF TG_OP='UPDATE' AND OLD.status IN ('승인 완료','검토 중') AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'EXPENSE_ALREADY_UNDER_REVIEW' USING ERRCODE='42501';
  END IF;
  IF NEW.driving_log_id IS NOT NULL THEN
    SELECT * INTO d FROM cockpit.driving_logs WHERE id=NEW.driving_log_id;
    IF NOT FOUND OR d.organization_id<>NEW.organization_id OR d.driver_id IS DISTINCT FROM NEW.driver_id
      OR d.driving_date<>NEW.expense_date OR d.booking_id IS DISTINCT FROM NEW.booking_id THEN
      RAISE EXCEPTION 'REPORT_EXPENSE_IDENTITY_MISMATCH' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO d FROM cockpit.driving_logs WHERE organization_id=NEW.organization_id AND driver_id=NEW.driver_id
      AND driving_date=NEW.expense_date AND booking_id IS NOT DISTINCT FROM NEW.booking_id;
    IF FOUND THEN NEW.driving_log_id:=d.id; END IF;
  END IF;
  IF NEW.receipt_storage_path IS NOT NULL AND (position('..' IN NEW.receipt_storage_path)>0
    OR NEW.receipt_storage_path NOT LIKE NEW.organization_id||'/expenses/receipts/'||NEW.driver_id::text||'/%') THEN
    RAISE EXCEPTION 'RECEIPT_OWNER_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cockpit.reporting_log_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  UPDATE cockpit.expenses SET driving_log_id=NEW.id
  WHERE driving_log_id IS NULL AND organization_id=NEW.organization_id AND driver_id=NEW.driver_id
    AND expense_date=NEW.driving_date AND booking_id IS NOT DISTINCT FROM NEW.booking_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION cockpit.reporting_expense_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    UPDATE cockpit.driving_logs SET expense_amount=expense_amount
      WHERE organization_id=OLD.organization_id AND driver_id=OLD.driver_id AND driving_date=OLD.expense_date
        AND booking_id IS NOT DISTINCT FROM OLD.booking_id;
  END IF;
  IF TG_OP<>'DELETE' THEN
    UPDATE cockpit.driving_logs SET expense_amount=expense_amount
      WHERE organization_id=NEW.organization_id AND driver_id=NEW.driver_id AND driving_date=NEW.expense_date
        AND booking_id IS NOT DISTINCT FROM NEW.booking_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS reporting_log_before_write ON cockpit.driving_logs;
CREATE TRIGGER reporting_log_before_write BEFORE INSERT OR UPDATE ON cockpit.driving_logs
  FOR EACH ROW EXECUTE FUNCTION cockpit.reporting_log_before_write();
DROP TRIGGER IF EXISTS reporting_log_after_write ON cockpit.driving_logs;
CREATE TRIGGER reporting_log_after_write AFTER INSERT OR UPDATE OF driver_id,booking_id,driving_date ON cockpit.driving_logs
  FOR EACH ROW EXECUTE FUNCTION cockpit.reporting_log_after_write();
DROP TRIGGER IF EXISTS reporting_expense_before_write ON cockpit.expenses;
CREATE TRIGGER reporting_expense_before_write BEFORE INSERT OR UPDATE ON cockpit.expenses
  FOR EACH ROW EXECUTE FUNCTION cockpit.reporting_expense_before_write();
DROP TRIGGER IF EXISTS reporting_expense_after_write ON cockpit.expenses;
CREATE TRIGGER reporting_expense_after_write AFTER INSERT OR UPDATE OR DELETE ON cockpit.expenses
  FOR EACH ROW EXECUTE FUNCTION cockpit.reporting_expense_after_write();

CREATE OR REPLACE FUNCTION cockpit.reporting_summary(p_org text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'logs',jsonb_build_object('total',count(*),'submitted',count(*) FILTER(WHERE l.status<>'draft'),
      'pending',count(*) FILTER(WHERE l.status='검토 대기'),'distanceKm',coalesce(sum(l.distance_km) FILTER(WHERE l.status<>'draft'),0)),
    'expenses',(SELECT jsonb_build_object('total',count(*),'pending',count(*) FILTER(WHERE status='검수 대기'),
      'amount',coalesce(sum(amount) FILTER(WHERE status NOT IN ('draft','반려')),0),
      'approvedAmount',coalesce(sum(amount) FILTER(WHERE status='승인 완료'),0),
      'unlinked',count(*) FILTER(WHERE driving_log_id IS NULL)) FROM cockpit.expenses WHERE organization_id=p_org)
  ) FROM cockpit.driving_logs l WHERE l.organization_id=p_org;
$$;
REVOKE EXECUTE ON FUNCTION cockpit.reporting_log_before_write(),cockpit.reporting_log_after_write(),
  cockpit.reporting_expense_before_write(),cockpit.reporting_expense_after_write(),cockpit.reporting_summary(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.reporting_log_before_write(),cockpit.reporting_log_after_write(),
  cockpit.reporting_expense_before_write(),cockpit.reporting_expense_after_write(),cockpit.reporting_summary(text) TO service_role;
-- Backfill exact verified relationships only; duplicates stop the unique-index installation above.
UPDATE cockpit.expenses e SET driving_log_id=l.id FROM cockpit.driving_logs l
 WHERE e.driving_log_id IS NULL AND e.organization_id=l.organization_id AND e.driver_id=l.driver_id
 AND e.expense_date=l.driving_date AND e.booking_id IS NOT DISTINCT FROM l.booking_id;
UPDATE cockpit.driving_logs SET expense_amount=expense_amount;
COMMIT;
