-- REVIEW ONLY. Extend staged settings; legacy manifest and operating rows remain untouched.
BEGIN;
ALTER TABLE cockpit.organization_settings
 ADD COLUMN app_short_name text CHECK (app_short_name IS NULL OR length(btrim(app_short_name)) BETWEEN 1 AND 32),
 ADD COLUMN app_description text CHECK (app_description IS NULL OR length(btrim(app_description)) BETWEEN 1 AND 160),
 ADD COLUMN icon_192_sha256 text CHECK (icon_192_sha256 IS NULL OR icon_192_sha256 ~ '^[0-9a-f]{64}$'),
 ADD COLUMN icon_512_sha256 text CHECK (icon_512_sha256 IS NULL OR icon_512_sha256 ~ '^[0-9a-f]{64}$');
-- Only public branding metadata, not membership, settings, contracts or credentials.
-- Host must originate from verified ingress in the eventual server adapter.
CREATE FUNCTION cockpit.tenant_public_brand_v1(p_hostname text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('hostname',d.hostname,'orgId',o.id,'displayName',o.display_name,
   'appName',s.app_name,'shortName',s.app_short_name,'description',s.app_description,
   'icon192',s.icon_192_sha256,'icon512',s.icon_512_sha256)
 FROM cockpit.organization_domains d
 JOIN cockpit.organizations o ON o.id=d.org_id
 JOIN cockpit.organization_settings s ON s.org_id=o.id
 WHERE current_user='service_role' AND d.hostname=p_hostname
  AND d.status='verified' AND d.verified_at<=statement_timestamp()
  AND o.status='active' AND o.runtime_enabled
  AND s.app_short_name IS NOT NULL AND s.app_description IS NOT NULL
  AND s.icon_192_sha256 IS NOT NULL AND s.icon_512_sha256 IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION cockpit.tenant_public_brand_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.tenant_public_brand_v1(text) TO service_role;
COMMIT;
