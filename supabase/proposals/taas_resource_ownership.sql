-- REVIEW CANDIDATE ONLY. Run only after the dormant foundation in isolated Postgres.
-- Preserve all existing rows and legacy keys; NULL means unverified, not VIP.
BEGIN;
ALTER TABLE cockpit.drivers ADD COLUMN org_id text REFERENCES cockpit.organizations(id) ON DELETE RESTRICT;
ALTER TABLE cockpit.customers ADD COLUMN org_id text REFERENCES cockpit.organizations(id) ON DELETE RESTRICT;
CREATE INDEX drivers_taas_org_id_idx ON cockpit.drivers(org_id,id);
CREATE INDEX customers_taas_org_id_idx ON cockpit.customers(org_id,id);
-- No defaults, backfill, legacy unique/FK removal or existing grant/policy changes.
-- Do not enable a new tenant: legacy routes and RLS still need comprehensive scoping.
COMMIT;
