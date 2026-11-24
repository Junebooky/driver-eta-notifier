import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findUnambiguousDrivingLogBooking } from './drivingLogBookingMatch';
import type { AutoBookingCandidate } from './drivingLogBookingMatch';

const orgId = 'vip_limousine_korea';
const driverId = 'd7a00000-0000-4000-8000-000000000001';
const booking = (overrides: Partial<AutoBookingCandidate> = {}): AutoBookingCandidate => ({
  id: 'a7a00000-0000-4000-8000-000000000001',
  org_id: orgId,
  driver_id: driverId,
  date: '2026-11-08',
  end_date: '2026-11-08',
  dispatch_status: 'published',
  vehicle_plate: '서울 12가 3456',
  schedule_meta: {},
  ...overrides,
});
const context = {
  orgId, driverId, drivingDate: '2026-11-08', vehiclePlate: '서울12가3456',
};

test('one valid published booking with verified driver, date, org and plate is matched', () => {
  assert.deepEqual(findUnambiguousDrivingLogBooking([booking()], context), {
    bookingId: booking().id, reason: 'unique_verified',
  });
});

test('two trips with the same driver on one day must stay unlinked, even with the same plate', () => {
  const second = booking({ id: 'b7b00000-0000-4000-8000-000000000002' });
  assert.equal(findUnambiguousDrivingLogBooking([booking(), second], context).reason, 'multiple_candidates');
});

test('different org, driver, date, status or vehicle-only service cannot be inferred', () => {
  for (const changed of [
    { org_id: 'other_company' }, { driver_id: 'other_driver' },
    { date: '2026-11-09', end_date: '2026-11-10' },
    { date: '2026-11-06', end_date: '2026-11-07' },
    { dispatch_status: 'cancelled' }, { dispatch_status: 'draft' },
    { schedule_meta: { serviceMode: 'vehicle_only' } },
  ]) {
    assert.equal(findUnambiguousDrivingLogBooking([booking(changed)], context).reason, 'no_candidate');
  }
});

test('a genuine multi-day assignment includes a log date within its service period', () => {
  assert.equal(findUnambiguousDrivingLogBooking([
    booking({ date: '2026-11-06', end_date: '2026-11-09' }),
  ], context).reason, 'unique_verified');
});

test('missing or mismatched license plates require HQ review, never auto-link', () => {
  assert.equal(findUnambiguousDrivingLogBooking([booking()], {
    ...context, vehiclePlate: '',
  }).reason, 'plate_missing');
  assert.equal(findUnambiguousDrivingLogBooking([booking({
    vehicle_plate: null, schedule_meta: {},
  })], context).reason, 'plate_missing');
  assert.equal(findUnambiguousDrivingLogBooking([booking({
    vehicle_plate: '서울99나9999',
  })], context).reason, 'plate_mismatch');
});

test('only real submitted driving logs may invoke the automatic link transaction', () => {
  const source = readFileSync('app/api/driving-logs/route.ts', 'utf8');
  assert.match(source, /isSubmitting\s*&&\s*!bookingId/);
  assert.match(source, /findUnambiguousDrivingLogBooking\(/);
  assert.match(source, /\.rpc\('link_driving_log_to_booking'/);
  assert.match(source, /\.eq\('org_id', auth\.session\.org\)/);
  assert.match(source, /\.eq\('driver_id', effectiveDriverId\)/);
});
