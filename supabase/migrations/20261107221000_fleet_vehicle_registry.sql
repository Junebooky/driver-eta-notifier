-- HQ fleet inventory SSOT: shared across browsers, dispatch and availability.
-- Existing 20 verified default vehicles remain as seed data in vehicleData.ts.
-- Custom vehicles and archived defaults are tracked here using immutable UUIDs.
CREATE TABLE IF NOT EXISTS cockpit.fleet_vehicle_registry (
  vehicle_id uuid PRIMARY KEY,
  organization_id text NOT NULL CHECK (organization_id = 'vip_limousine_korea'),
  plate text NOT NULL,
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CONSTRAINT fleet_vehicle_registry_org_plate_unique UNIQUE (organization_id, plate)
);
CREATE INDEX IF NOT EXISTS fleet_vehicle_registry_active_org_idx
  ON cockpit.fleet_vehicle_registry (organization_id, archived);
ALTER TABLE cockpit.fleet_vehicle_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.fleet_vehicle_registry FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cockpit.fleet_vehicle_registry TO service_role;
-- Admin-only /api/fleet/registry authenticates before using the server-side service_role.
-- No public/driver RLS policy is granted for direct client access.
