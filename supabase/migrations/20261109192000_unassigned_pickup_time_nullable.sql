-- A client may provide a date and route without a departure time.
-- Never store fabricated 00:00: only unassigned/draft bookings may omit pickup_time.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE cockpit.schedules
  ALTER COLUMN pickup_time DROP NOT NULL;
ALTER TABLE cockpit.schedules
  ADD CONSTRAINT schedules_unknown_pickup_unassigned_only
  CHECK (pickup_time IS NOT NULL OR COALESCE(dispatch_status, 'published') IN ('unassigned', 'draft', 'cancelled'));
COMMIT;
