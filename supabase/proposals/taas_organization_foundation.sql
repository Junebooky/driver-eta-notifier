-- REVIEW CANDIDATE ONLY. Not a production migration. Exercise in disposable Postgres.
-- P0-01 creates only new relations. No seeds, backfills, existing-table ALTERs,
-- changes to auth.users, auth metadata, Storage, existing views, RPCs or policies.
-- New tenant authorization is intentionally impossible until later security gates.
BEGIN;
CREATE TABLE cockpit.organizations (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{2,62}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','archived')),
  runtime_enabled boolean NOT NULL DEFAULT false,
  CONSTRAINT organizations_p0_runtime_hold CHECK (runtime_enabled = false),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cockpit.organization_members (
  org_id text NOT NULL REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('company_owner','company_admin','driver')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','revoked')),
  driver_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id,user_id),
  CONSTRAINT organization_members_p0_activation_hold CHECK (status <> 'active'),
  CONSTRAINT organization_members_driver_identity_unique UNIQUE (driver_id)
);
-- user_id/driver_id are staged references, NOT authority. Do not add FKs or
-- triggers to the shared Auth or legacy driver master before ownership review.
-- A later migration must prove real Auth user and tenant-owned driver mapping
-- before allowing active memberships.
CREATE INDEX organization_members_user_org_idx ON cockpit.organization_members(user_id,org_id);
CREATE TABLE cockpit.organization_domains (
  hostname text PRIMARY KEY CHECK (
    length(hostname) BETWEEN 4 AND 253
    AND hostname = lower(hostname)
    AND hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  org_id text NOT NULL REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','disabled')),
  verified_at timestamptz,
  CHECK (status <> 'verified' OR verified_at IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_domains_org_idx ON cockpit.organization_domains(org_id);
CREATE TABLE cockpit.organization_settings (
  org_id text PRIMARY KEY REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
  app_name text NOT NULL CHECK (length(btrim(app_name)) BETWEEN 1 AND 100),
  signup_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_settings_p0_signup_hold CHECK (signup_enabled = false)
);
CREATE TABLE cockpit.organization_features (
  org_id text NOT NULL REFERENCES cockpit.organizations(id) ON DELETE RESTRICT,
  feature_key text NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (org_id,feature_key),
  CONSTRAINT organization_features_legacy_excel_vip_only CHECK (
    feature_key <> 'legacy_report_excel' OR NOT enabled OR org_id = 'vip_limousine_korea'
  )
);
-- Existing schema-level/default grants are not trusted. These new tables
-- deliberately have no browser-facing RLS policies and no DELETE grant.
ALTER TABLE cockpit.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.organization_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cockpit.organization_features ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cockpit.organizations,cockpit.organization_members,cockpit.organization_domains,
  cockpit.organization_settings,cockpit.organization_features FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE cockpit.organizations,cockpit.organization_members,cockpit.organization_domains,
  cockpit.organization_settings,cockpit.organization_features TO service_role;
COMMIT;
