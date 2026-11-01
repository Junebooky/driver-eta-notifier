-- Read-only Supabase release inventory. No account identifiers or customer data leave the DB.
-- Run as the project SQL administrator. This reports prerequisites, not provider/device acceptance.
BEGIN TRANSACTION READ ONLY;
WITH required_tables(name) AS (VALUES
  ('cockpit.drivers'), ('cockpit.schedules'), ('cockpit.vehicles'),
  ('cockpit.fleet_vehicle_operations'), ('cockpit.dispatch_requests'),
  ('cockpit.auth_login_attempts'), ('cockpit.revoked_auth_sessions'),
  ('cockpit.driving_logs'), ('cockpit.expenses'),
  ('cockpit.driver_profile_assets'), ('cockpit.driver_vehicle_info_assets'),
  ('cockpit.driver_info_dispatch_logs'), ('cockpit.vehicle_custodies'), ('cockpit.vehicle_custody_requests')
), required_functions(signature) AS (VALUES
  ('cockpit.commit_dispatch_batch(jsonb,text,text,text)'),
  ('cockpit.consume_auth_login_attempt(text[])'),
  ('cockpit.is_active_auth_session(uuid,uuid)'),
  ('cockpit.update_driver_profile_by_id(uuid,jsonb,jsonb)'),
  ('cockpit.reporting_summary(text)'), ('cockpit.commit_vehicle_custody(text,uuid,text,text,jsonb)')
), protected_tables AS (
  SELECT name, to_regclass(name) AS oid FROM required_tables
  WHERE name NOT IN ('cockpit.vehicles', 'cockpit.schedules')
), accounts AS (
  SELECT to_jsonb(u)->'raw_app_meta_data' AS meta FROM auth.users u
), driver_accounts AS (
  SELECT meta->>'driver_id' AS driver_id FROM accounts
  WHERE meta->>'org' = 'vip_limousine_korea' AND meta->>'cockpit_role' = 'driver'
), bookings AS (
  SELECT to_jsonb(s) AS row FROM cockpit.schedules s
  WHERE coalesce(to_jsonb(s)->>'org_id', 'vip_limousine_korea') = 'vip_limousine_korea'
)
SELECT jsonb_build_object(
  'checked_at', now(),
  'missing_tables', (SELECT coalesce(jsonb_agg(name), '[]'::jsonb) FROM required_tables WHERE to_regclass(name) IS NULL),
  'missing_functions', (SELECT coalesce(jsonb_agg(signature), '[]'::jsonb) FROM required_functions WHERE to_regprocedure(signature) IS NULL),
  'email_source_uniqueness_ready', to_regclass('cockpit.schedules_email_day_slot_identity') IS NOT NULL,
  'protected_table_access', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table', name,
    'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE pg_class.oid = p.oid),
    'anon_direct_access', CASE WHEN oid IS NULL THEN NULL ELSE has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE') END,
    'authenticated_direct_access', CASE WHEN oid IS NULL THEN NULL ELSE has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE') END
  )), '[]'::jsonb) FROM protected_tables p),
  'representative_accounts', (SELECT count(*) FROM accounts WHERE meta->>'org' = 'vip_limousine_korea' AND meta->>'cockpit_role' = 'hq_admin' AND meta->>'cockpit_position' = 'representative'),
  'driver_records', (SELECT count(*) FROM cockpit.drivers),
  'driver_accounts', (SELECT count(*) FROM driver_accounts),
  'mapped_driver_accounts', (SELECT count(*) FROM driver_accounts a WHERE EXISTS (SELECT 1 FROM cockpit.drivers d WHERE d.id::text = a.driver_id)),
  'invalid_driver_mappings', (SELECT count(*) FROM driver_accounts a WHERE NOT EXISTS (SELECT 1 FROM cockpit.drivers d WHERE d.id::text = a.driver_id)),
  'duplicate_driver_mappings', (SELECT count(*) FROM (SELECT driver_id FROM driver_accounts WHERE driver_id IS NOT NULL GROUP BY driver_id HAVING count(*) > 1) duplicates),
  'schedules_total', (SELECT count(*) FROM bookings),
  'schedules_without_driver_uuid', (SELECT count(*) FROM bookings b WHERE NOT EXISTS (
    SELECT 1 FROM cockpit.drivers d WHERE d.id::text = coalesce(b.row->>'driver_id', b.row->'schedule_meta'->>'driverId')
  )),
  'schedules_needing_end_time_review', (SELECT count(*) FROM bookings WHERE
    coalesce(row->>'end_time', row->'schedule_meta'->>'endTime', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    OR coalesce(row->>'end_date', row->'schedule_meta'->>'endDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  'asset_bucket_private', (SELECT NOT public FROM storage.buckets WHERE id = 'cockpit-assets')
) AS release_preflight;
ROLLBACK;
