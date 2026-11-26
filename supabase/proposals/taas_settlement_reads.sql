-- REVIEW ONLY: same existing settlement tables and fingerprint, no live migration.
BEGIN;
CREATE FUNCTION cockpit.tenant_settlement_read_v1(p_org text,p_user uuid,p_session uuid,p_op text,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE output jsonb;
BEGIN
 IF current_user<>'service_role' OR p_org IS NULL OR p_user IS NULL OR p_session IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Match the existing dispatch / reporting lock order. The entire source
 -- projection and fingerprint below are evaluated in one SELECT snapshot.
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,10);
 PERFORM pg_catalog.pg_advisory_xact_lock(748201,12);
 PERFORM 1 FROM cockpit.organizations WHERE id=p_org AND status='active' AND runtime_enabled FOR SHARE;
 IF NOT FOUND OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cockpit.organization_members WHERE org_id=p_org AND user_id=p_user AND status='active' AND role IN ('company_owner','company_admin') AND driver_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_op='list' AND p_id IS NULL THEN
  SELECT jsonb_build_object('documents',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.updated_at DESC,d.id) FROM
    (SELECT d.* FROM cockpit.settlement_documents d JOIN cockpit.schedules s ON s.id=d.schedule_id AND s.org_id=p_org WHERE d.organization_id=p_org ORDER BY d.updated_at DESC,d.id LIMIT 150) d),'[]'::jsonb),
    'schedules',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.date DESC,s.id) FROM
    (SELECT id,org_id,date,customer_name,event_name,vehicle_model,vehicle_plate,driver_name,schedule_meta FROM cockpit.schedules WHERE org_id=p_org ORDER BY date DESC,id LIMIT 100) s),'[]'::jsonb)) INTO output;
 ELSIF p_op='document' AND p_id IS NOT NULL THEN
  SELECT to_jsonb(d) INTO output FROM cockpit.settlement_documents d JOIN cockpit.schedules s ON s.id=d.schedule_id AND s.org_id=p_org
   WHERE d.id=p_id AND d.organization_id=p_org;
 ELSIF p_op='source' AND p_id IS NOT NULL THEN
  -- Strict identity, no null-org fallback or name/plate matching for new tenants.
  SELECT jsonb_build_object('hash',cockpit.settlement_live_source_hash(s.id,p_org),
   'schedule',jsonb_build_object('id',s.id,'org_id',s.org_id,'date',s.date,'customer_name',s.customer_name,'event_name',s.event_name,
    'vehicle_model',s.vehicle_model,'vehicle_plate',s.vehicle_plate,'driver_name',s.driver_name,'driver_id',s.driver_id,'schedule_meta',s.schedule_meta),
   'logs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'organization_id',l.organization_id,'booking_id',l.booking_id,'driver_id',l.driver_id,'status',l.status,
      'customer_service_start',l.customer_service_start,'customer_service_end',l.customer_service_end) ORDER BY l.id)
    FROM cockpit.driving_logs l WHERE l.booking_id=s.id AND l.organization_id=p_org),'[]'::jsonb),
   'expenses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'organization_id',e.organization_id,'booking_id',e.booking_id,'driving_log_id',e.driving_log_id,
      'expense_date',e.expense_date,'category',e.category,'amount',e.amount,'merchant',e.merchant,'billable_to_customer',e.billable_to_customer,'status',e.status) ORDER BY e.id)
    FROM cockpit.expenses e WHERE e.organization_id=p_org AND (e.booking_id=s.id OR EXISTS(SELECT 1 FROM cockpit.driving_logs l WHERE l.id=e.driving_log_id AND l.booking_id=s.id AND l.organization_id=p_org))),'[]'::jsonb))
  INTO output FROM cockpit.schedules s WHERE s.id=p_id AND s.org_id=p_org
    AND (s.driver_id IS NULL OR EXISTS(SELECT 1 FROM cockpit.drivers d WHERE d.id=s.driver_id AND d.org_id=p_org))
    AND (s.vehicle_id IS NULL OR EXISTS(SELECT 1 FROM cockpit.vehicles v WHERE v.id=s.vehicle_id AND v.organization_id=p_org))
    AND (s.customer_id IS NULL OR EXISTS(SELECT 1 FROM cockpit.customers c WHERE c.id=s.customer_id AND c.org_id=p_org));
 ELSE RAISE EXCEPTION 'INVALID_OPERATION' USING ERRCODE='22023';
 END IF;
 IF output IS NULL OR cockpit.is_active_auth_session(p_session,p_user) IS DISTINCT FROM true THEN RAISE EXCEPTION 'RECORD_NOT_OWNED' USING ERRCODE='42501'; END IF;
 RETURN output;
END;
$$;
REVOKE ALL ON FUNCTION cockpit.tenant_settlement_read_v1(text,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cockpit.tenant_settlement_read_v1(text,uuid,uuid,text,uuid) TO service_role;
COMMIT;
