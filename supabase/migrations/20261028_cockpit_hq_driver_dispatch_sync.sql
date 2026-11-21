-- ==============================================================================
-- Migration: Cockpit Schema HQ-Driver Dispatch & Acknowledgment Alignment
-- Ensures cockpit.drivers has the '미배정' sentinel key for unassigned HQ intake
-- and adds optional lifecycle columns directly to cockpit.schedules.
-- ==============================================================================

INSERT INTO cockpit.drivers (vehicle_no, car_number, driver_name, default_navi)
VALUES ('미배정', '미배정', '배차 대기', 'tmap')
ON CONFLICT (vehicle_no) DO NOTHING;

ALTER TABLE cockpit.schedules
  ADD COLUMN IF NOT EXISTS org_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS driver_id TEXT,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_id TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS place_verified BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS passenger_phone TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by TEXT,
  ADD COLUMN IF NOT EXISTS last_ack_version INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ack_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS cockpit.dispatch_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES cockpit.schedules(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ DEFAULT now(),
  device_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (schedule_id, version, driver_id)
);
