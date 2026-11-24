-- Ensure the G90 LWB navy vehicle plate uses the canonical '116허 1336' across vehicle & schedule records.
UPDATE cockpit.vehicles
SET plate = '116허 1336',
    plate_short = '1336',
    updated_at = now()
WHERE id = 'e0f7c22a-0001-4c12-8800-000000002269'
   OR plate = '116호 1336';

UPDATE cockpit.schedules
SET vehicle_plate = CASE WHEN vehicle_plate = '116호 1336' THEN '116허 1336' ELSE vehicle_plate END,
    vehicle_no = CASE WHEN vehicle_no = '116호 1336' THEN '116허 1336' ELSE vehicle_no END
WHERE vehicle_plate = '116호 1336'
   OR vehicle_no = '116호 1336';
