-- P0 metadata-only audit; no customer/report contents or writes.
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname AS schema_name,c.relname AS relation_name,c.relkind,c.relrowsecurity,c.reloptions,
 ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attname IN ('org_id','organization_id','tenant_id','user_id','driver_id')) AS scope_columns,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('cockpit','chauffeur') AND c.relkind IN ('r','p','v','m') ORDER BY 1,2;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('cockpit','chauffeur') ORDER BY 1,2,3;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('cockpit','chauffeur') ORDER BY 1,2,3;
SELECT n.nspname,c.relname,co.conname,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('cockpit','chauffeur') ORDER BY 1,2,3;
SELECT id,public FROM storage.buckets WHERE id LIKE 'cockpit%' OR id LIKE 'chauffeur%';
ROLLBACK;
