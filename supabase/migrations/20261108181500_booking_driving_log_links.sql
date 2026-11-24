-- HQ-reviewed explicit linking: never infer a booking from a customer name or plate.
-- Service-role-only transaction; no existing operational records are backfilled.
CREATE TABLE IF NOT EXISTS cockpit.driving_log_booking_link_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  driving_log_id uuid NOT NULL REFERENCES cockpit.driving_logs(id),
  booking_id uuid NOT NULL REFERENCES cockpit.schedules(id),
  actor_id text NOT NULL,
  expense_count integer NOT NULL DEFAULT 0,
  linked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cockpit.driving_log_booking_link_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.driving_log_booking_link_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON cockpit.driving_log_booking_link_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE cockpit.driving_log_booking_link_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION cockpit.link_driving_log_to_booking(
 p_org text, p_log uuid, p_booking uuid, p_actor text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, cockpit
AS $body$
DECLARE
  log_row cockpit.driving_logs%ROWTYPE;
  schedule_row cockpit.schedules%ROWTYPE;
  duplicate_count integer;
  mismatched_expenses integer;
  touched_expenses integer;
BEGIN
  IF p_org IS NULL OR p_org = '' OR p_actor IS NULL OR p_actor = ''
     OR p_log IS NULL OR p_booking IS NULL THEN
    RAISE EXCEPTION 'INVALID_LINK_INPUT';
  END IF;
  -- Serialize competing reviewers, even when targeting two different logs.
  PERFORM pg_advisory_xact_lock(hashtextextended('log_booking_link:' || p_org, 0));
  SELECT * INTO log_row FROM cockpit.driving_logs
    WHERE id = p_log AND organization_id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOG_NOT_FOUND'; END IF;
  SELECT * INTO schedule_row FROM cockpit.schedules
    WHERE id = p_booking AND (org_id = p_org OR org_id IS NULL) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF log_row.booking_id = p_booking THEN
    RETURN jsonb_build_object('ok', true, 'alreadyLinked', true, 'expenseCount', 0);
  END IF;
  IF log_row.booking_id IS NOT NULL THEN RAISE EXCEPTION 'LOG_ALREADY_LINKED'; END IF;
  IF log_row.driving_date IS NULL OR schedule_row.date IS NULL OR
     log_row.driving_date < schedule_row.date OR
     log_row.driving_date > COALESCE(schedule_row.end_date, schedule_row.date) THEN
    RAISE EXCEPTION 'DATE_MISMATCH';
  END IF;
  IF log_row.driver_id IS NOT NULL AND schedule_row.driver_id IS NOT NULL
     AND log_row.driver_id <> schedule_row.driver_id THEN
    RAISE EXCEPTION 'DRIVER_MISMATCH';
  END IF;
  IF NULLIF(TRIM(log_row.vehicle_plate), '') IS NOT NULL
     AND NULLIF(TRIM(schedule_row.vehicle_plate), '') IS NOT NULL
     AND regexp_replace(lower(log_row.vehicle_plate), '[^[:alnum:]]', '', 'g') <>
         regexp_replace(lower(schedule_row.vehicle_plate), '[^[:alnum:]]', '', 'g') THEN
    RAISE EXCEPTION 'VEHICLE_MISMATCH';
  END IF;
  SELECT COUNT(*) INTO duplicate_count FROM cockpit.driving_logs
   WHERE organization_id = p_org AND booking_id = p_booking AND id <> p_log;
  IF duplicate_count > 0 THEN RAISE EXCEPTION 'BOOKING_HAS_LOG'; END IF;
  IF EXISTS(SELECT 1 FROM cockpit.settlement_documents
      WHERE organization_id = p_org AND schedule_id = p_booking
        AND status IN ('approved', 'issued')) THEN
    RAISE EXCEPTION 'SETTLEMENT_LOCKED';
  END IF;
  SELECT COUNT(*) INTO mismatched_expenses FROM cockpit.expenses
    WHERE organization_id = p_org AND driving_log_id = p_log
      AND booking_id IS NOT NULL AND booking_id <> p_booking;
  IF mismatched_expenses > 0 THEN RAISE EXCEPTION 'EXPENSE_BOOKING_CONFLICT'; END IF;
  UPDATE cockpit.driving_logs
    SET booking_id = p_booking, updated_at = now()
    WHERE id = p_log AND organization_id = p_org AND booking_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'LINK_CONFLICT'; END IF;
  UPDATE cockpit.expenses
     SET booking_id = p_booking, updated_at = now()
     WHERE organization_id = p_org AND driving_log_id = p_log AND booking_id IS NULL;
  GET DIAGNOSTICS touched_expenses = ROW_COUNT;
  INSERT INTO cockpit.driving_log_booking_link_audit
    (organization_id, driving_log_id, booking_id, actor_id, expense_count)
  VALUES (p_org, p_log, p_booking, p_actor, touched_expenses);
  RETURN jsonb_build_object('ok', true, 'alreadyLinked', false,
    'expenseCount', touched_expenses);
END;
$body$;

REVOKE ALL ON FUNCTION cockpit.link_driving_log_to_booking(text,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cockpit.link_driving_log_to_booking(text,uuid,uuid,text)
  TO service_role;
