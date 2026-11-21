import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('booking linkage always requires HQ authorization and deliberate confirmation',()=>{
  const api=readFileSync('app/api/hq/booking-log-links/route.ts','utf8');
  const ui=readFileSync('components/hq/reports/HqBookingLogLinkPanel.tsx','utf8');
  assert.match(api,/requireHqAdmin\(request\)/);
  assert.match(api,/body\.confirmed!==true/);
  assert.match(api,/validScheduleId\(body\.logId\)/);
  assert.match(api,/link_driving_log_to_booking/);
  assert.match(ui,/확인 후 서버에 연결/);
  assert.match(ui,/setConfirmed\(false\)/);
});

test('transaction prevents accidental matches, overwrites and bypass of settlement approval',()=>{
  const sql=readFileSync('supabase/migrations/20261108181500_booking_driving_log_links.sql','utf8');
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/DATE_MISMATCH/);
  assert.match(sql,/DRIVER_MISMATCH/);
  assert.match(sql,/VEHICLE_MISMATCH/);
  assert.match(sql,/BOOKING_HAS_LOG/);
  assert.match(sql,/SETTLEMENT_LOCKED/);
  assert.match(sql,/EXPENSE_BOOKING_CONFLICT/);
  assert.match(sql,/driving_log_booking_link_audit/);
  assert.match(sql,/REVOKE ALL ON FUNCTION cockpit\.link_driving_log_to_booking/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION cockpit\.link_driving_log_to_booking/);
  assert.ok(!/SECURITY DEFINER/.test(sql));
});
