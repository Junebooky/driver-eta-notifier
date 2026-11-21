import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALL_HQ_DATES, formatHqDateRangeLabel, matchesHqDateRange, resolveHqDateBounds,
} from './hqDateRange';

const load = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('today and week use the KST calendar and a Monday-Sunday week across year end', () => {
  assert.deepEqual(resolveHqDateBounds({ mode: 'today' }, '2027-01-01'),
    { from: '2027-01-01', to: '2027-01-01' });
  assert.deepEqual(resolveHqDateBounds({ mode: 'week' }, '2027-01-01'),
    { from: '2026-12-28', to: '2027-01-03' });
  assert.equal(matchesHqDateRange('2026-12-28', { mode: 'week' }, '2027-01-01'), true);
  assert.equal(matchesHqDateRange('2027-01-03', { mode: 'week' }, '2027-01-01'), true);
  assert.equal(matchesHqDateRange('2027-01-04', { mode: 'week' }, '2027-01-01'), false);
});

test('month handles leap years and filters inclusively', () => {
  const range = { mode: 'month' as const };
  assert.deepEqual(resolveHqDateBounds(range, '2028-02-14'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(resolveHqDateBounds(range, '2027-02-14'), { from: '2027-02-01', to: '2027-02-28' });
  assert.equal(matchesHqDateRange('2028-02-29', range, '2028-02-14'), true);
  assert.equal(matchesHqDateRange('2028-03-01', range, '2028-02-14'), false);
});

test('custom ranges reject invalid and reversed dates, and include both endpoints', () => {
  const range = { mode: 'custom' as const, from: '2026-11-01', to: '2026-11-08' };
  assert.deepEqual(resolveHqDateBounds(range, '2026-11-08'), { from: '2026-11-01', to: '2026-11-08' });
  assert.equal(matchesHqDateRange('2026-11-01', range, '2026-11-08'), true);
  assert.equal(matchesHqDateRange('2026-11-08', range, '2026-11-08'), true);
  assert.equal(matchesHqDateRange('2026-10-31', range, '2026-11-08'), false);
  assert.equal(matchesHqDateRange('2026-11-09', range, '2026-11-08'), false);
  assert.equal(matchesHqDateRange('invalid', range, '2026-11-08'), false);
  assert.equal(matchesHqDateRange('', ALL_HQ_DATES), true);
  assert.equal(matchesHqDateRange('', range, '2026-11-08'), false);
  assert.equal(resolveHqDateBounds({ mode: 'custom', from: '2026-11-09', to: '2026-11-08' }, '2026-11-08'), null);
  assert.equal(resolveHqDateBounds({ mode: 'custom', from: '2026-02-30', to: '2026-03-01' }, '2026-11-08'), null);
  assert.equal(formatHqDateRangeLabel(range), '2026.11.01 ~ 2026.11.08');
});

test('driving log date selector filters the same list used by pagination and Excel', () => {
  const view = load('components/hq/driving-logs/HqDrivingLogsView.tsx');
  const bar = load('components/hq/driving-logs/HqDrivingLogsFilterBar.tsx');
  const picker = load('components/hq/ui/HqDateRangePicker.tsx');
  assert.match(view, /useState<HqDateRange>\(ALL_HQ_DATES\)/);
  assert.match(view, /matchesHqDateRange\(log.rawDate, dateRange\)/);
  assert.match(view, /\[logs, dateRange, selectedStatus/);
  assert.match(view, /onChangeDateRange=\{\(next\) => \{ setDateRange\(next\); setCurrentPage\(1\); \}\}/);
  assert.match(view, /exportDrivingLogsToCsv\(filteredLogs\)/);
  assert.match(view, /return filteredLogs\.slice\(start, start \+ pageSize\)/);
  assert.match(bar, /<HqDateRangePicker/);
  assert.match(bar, /<HqSearchSelect/);
  assert.match(picker, /resolveHqDateBounds\(\{ mode: 'custom', from, to \}\)/);
  assert.match(picker, /aria-label="필터 시작일"/);
  assert.match(picker, /aria-label="필터 종료일"/);
});

test('booking detail reuses common time and photo-rich fleet inputs and DB vehicle UUID', () => {
  const detail = load('components/hq/HqBookingDetailModal.tsx');
  const quick = load('components/hq/HqQuickDispatch.tsx');
  assert.equal((detail.match(/<HqDispatchTimeField/g) || []).length, 2);
  assert.equal((detail.match(/<HqSearchSelect/g) || []).length, 2);
  assert.doesNotMatch(detail, /type="time"/);
  assert.doesNotMatch(detail, /<select\b/);
  assert.match(detail, /parseFlexibleTimeInput/);
  assert.match(detail, /formatTimeKoreanAmPm/);
  assert.match(detail, /fleet\.data\?\.vehicles\.find\(\(v\) => v\.plate === selectedVehiclePlate\)/);
  assert.match(detail, /disabled: !v\.isAvailable/);
  assert.match(detail, /disabled: !driver\.isAvailable/);
  assert.match(detail, /categoryOptions=/);
  assert.match(quick, /renderAllocationSelector/);
});

test('dispatch list vehicle filter follows same server registry as vehicle management', () => {
  const table = load('components/hq/HqDispatchTable.tsx');
  assert.match(table, /fetch\('\/api\/fleet\/registry'/);
  assert.match(table, /row\.archived/);
  assert.match(table, /allBookingsForCounts \|\| bookings/);
  assert.match(table, /fleetFilterError &&/);
  assert.doesNotMatch(table, /vip_hq_custom_vehicles/);
  assert.doesNotMatch(table, /vip_hq_deleted_vehicle_ids/);
});
