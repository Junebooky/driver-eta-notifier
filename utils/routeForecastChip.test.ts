import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleForecastDate } from '@/components/driver/RouteForecastChip';

test('TMAP card forecast uses the requested booking date and KST time, not current GPS or device timezone', () => {
  const time = scheduleForecastDate('2026-11-10', '09:00');
  assert.ok(time);
  assert.equal(time!.toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(scheduleForecastDate('2026-11-10', '23:45')?.toISOString(), '2026-11-10T14:45:00.000Z');
});

test('No estimate is requested without an explicit valid booking date and time', () => {
  assert.equal(scheduleForecastDate('2026-11-10', undefined), null);
  assert.equal(scheduleForecastDate('2026-11-10', ''), null);
  assert.equal(scheduleForecastDate('2026-11-10', '25:00'), null);
  assert.equal(scheduleForecastDate('2026-02-30', '09:00'), null);
  assert.equal(scheduleForecastDate('2026-11-31', '09:00'), null);
  assert.equal(scheduleForecastDate('10/11/2026', '09:00'), null);
});
