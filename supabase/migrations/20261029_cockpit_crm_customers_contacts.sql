-- ====================================================================
-- Migration Proposal: CRM Multi-Contact & Customer Metadata Extension
-- Schema: cockpit
-- Target Table: cockpit.customers
-- STATUS: PROPOSED (EXECUTION ON HOLD PENDING USER APPROVAL)
-- ====================================================================

-- 1. Add dedicated columns to cockpit.customers for CRM linkage
-- Currently, contacts and metadata are safely staged within pricing_preset jsonb.
-- Applying this migration will promote them to first-class schema columns.

ALTER TABLE cockpit.customers
  ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tier text DEFAULT '일반',
  ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_meta jsonb DEFAULT '{}'::jsonb;

-- 2. Backfill existing contacts from pricing_preset into first-class contacts column
UPDATE cockpit.customers
SET contacts = pricing_preset->'contacts'
WHERE pricing_preset ? 'contacts'
  AND (contacts IS NULL OR jsonb_array_length(contacts) = 0);

-- 3. Add index on customer name for rapid deduplication lookup
CREATE INDEX IF NOT EXISTS idx_customers_name_lower
  ON cockpit.customers (lower(name));

