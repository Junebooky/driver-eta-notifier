-- Preserve the existing cockpit.vehicles physical fleet as the only fleet SSOT.
-- Add archival and optional UI extras without replacing existing 20 vehicle UUIDs.
ALTER TABLE cockpit.vehicles
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS vehicles_org_archived_idx
  ON cockpit.vehicles (organization_id, archived);
ALTER TABLE cockpit.vehicles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON cockpit.vehicles TO service_role;
-- Existing cockpit.vehicles admin/organization RLS policies remain intact.
-- HQ server APIs recheck requireHqAdmin and perform writes with service_role.
