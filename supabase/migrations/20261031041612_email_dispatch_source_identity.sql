ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS last_ack_version integer NOT NULL DEFAULT 0;
ALTER TABLE cockpit.schedules ADD COLUMN IF NOT EXISTS last_ack_at timestamptz;
-- PROPOSAL: validate in staging before owner-approved shared DB release.
-- Cross-device/operator retries must not create the same email/day/vehicle-slot twice.
CREATE UNIQUE INDEX IF NOT EXISTS schedules_email_day_slot_identity
ON cockpit.schedules(org_id,date,(schedule_meta->>'eventId'),(schedule_meta->>'groupVehicleIndex'))
WHERE schedule_meta->>'intakeSource'='email' AND schedule_meta->>'eventId' IS NOT NULL;
