-- ==============================================================================
-- Migration: Secure HQ Manual Dispatch & Driver Mobile Acknowledgment (Issue #25 - Phase 1)
-- Description: 
--   1. Adds non-breaking audit & dispatch status columns to public.schedules
--   2. Creates public.dispatch_acknowledgments table for immutable acknowledgment audit trail
--   3. Adds index for high-performance driver mobile feed queries (filtered to published dispatches)
-- ==============================================================================

-- 1. Add non-breaking dispatch lifecycle columns to schedules
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS driver_id TEXT,                      -- Assigned driver identifier (e.g. driver_4 or UUID)
  ADD COLUMN IF NOT EXISTS driver_name TEXT,                    -- Denormalized driver name for UI display
  ADD COLUMN IF NOT EXISTS vehicle_id TEXT,                     -- Canonical vehicle link
  ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'draft',-- 'draft' | 'published' | 'cancelled'
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,           -- Revision number (increments on material change)
  ADD COLUMN IF NOT EXISTS place_verified BOOLEAN DEFAULT false,-- Whether origin & destination pins were verified
  ADD COLUMN IF NOT EXISTS passenger_phone TEXT,                -- Passenger contact phone number
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,            -- Exact timestamp when manager dispatched to driver
  ADD COLUMN IF NOT EXISTS published_by TEXT,                   -- Dispatching manager identity
  ADD COLUMN IF NOT EXISTS last_ack_version INTEGER DEFAULT 0,  -- Highest version acknowledged by the driver
  ADD COLUMN IF NOT EXISTS last_ack_at TIMESTAMPTZ;             -- Timestamp of latest acknowledgment

-- 2. High-performance index for mobile driver schedule feed (strictly published jobs)
CREATE INDEX IF NOT EXISTS idx_schedules_driver_published_feed
ON public.schedules (driver_id, date, pickup_time ASC)
WHERE dispatch_status = 'published';

CREATE INDEX IF NOT EXISTS idx_schedules_vehicle_published_feed
ON public.schedules (vehicle_no, date, pickup_time ASC)
WHERE dispatch_status = 'published';

-- 3. Driver Acknowledgment Audit Log Table
CREATE TABLE IF NOT EXISTS public.dispatch_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL,
  version INTEGER NOT NULL,
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ DEFAULT now(),
  device_summary TEXT, -- e.g. "Safari Mobile (iOS 18)"
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (schedule_id, version, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_acks_lookup
ON public.dispatch_acknowledgments (schedule_id, version);
