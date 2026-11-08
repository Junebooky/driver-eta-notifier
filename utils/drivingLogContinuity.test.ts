import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { belongsToDrivingLogDraftScope, selectDrivingLogForHydration } from './drivingLogContinuity';
import { loadDrivingLogDraft, saveDrivingLogDraft } from './drivingLog';
import type { DriverProfile } from '@/types';

const orgLog = (id: string, bookingId: string | null, date = '2026-11-08') =>
  ({ id, bookingId, rawDate: date });

test('daily submitted draft with server-linked booking ID survives reload', () => {
  const store = new Map<string, string>();
  const oldWindow = (globalThis as any).window;
  const oldLocalStorage = (globalThis as any).localStorage;
  try {
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key,value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    const profile = {
      id: 'd7a00000-0000-4000-8000-000000000001',
      driverId: 'd7a00000-0000-4000-8000-000000000001',
      driverName: '테스트 기사',
      passengerName: '승객',
      carNumber: '116허 1514',
    } as DriverProfile;
    const daily = loadDrivingLogDraft(profile, undefined, '2026-11-08');
    const serverLinked = {
      ...daily, submissionId: 'b7a00000-0000-4000-8000-000000000001',
      bookingId: 'a7a00000-0000-4000-8000-000000000001',
      status: 'submitted' as const,
    };
    assert.equal(saveDrivingLogDraft(serverLinked), true);
    const reopened = loadDrivingLogDraft(profile, undefined, '2026-11-08');
    assert.equal(reopened.bookingId, serverLinked.bookingId);
    assert.equal(reopened.submissionId, serverLinked.submissionId);
    assert.equal(reopened.status, 'submitted');
    // An explicit different booking never inherits the daily log.
    const otherBooking = loadDrivingLogDraft(
      profile, undefined, '2026-11-08',
      'c7a00000-0000-4000-8000-000000000003',
    );
    assert.notEqual(otherBooking.submissionId, serverLinked.submissionId);
  } finally {
    (globalThis as any).window = oldWindow;
    (globalThis as any).localStorage = oldLocalStorage;
  }
});

test('unsubmitted daily draft cannot silently acquire an arbitrary booking ID', () => {
  assert.equal(belongsToDrivingLogDraftScope({
    reportId:'report_driver_daily_2026-11-08',
    rawDate:'2026-11-08', driverId:'driver',
    bookingId:'booking-a',status:'draft',
  }, {
    reportId:'report_driver_daily_2026-11-08',
    rawDate:'2026-11-08',driverId:'driver',
  }),false);
});

test('hydrate auto-linked logs using the saved server ID, not the old null booking ID', () => {
  const rows = [
    orgLog('submitted','booking-one'),
    orgLog('other-report','booking-two'),
    orgLog('unlinked',null),
  ];
  assert.equal(selectDrivingLogForHydration(rows,{
    date:'2026-11-08', submissionId:'submitted',
    localStatus:'submitted',bookingId:'booking-one',
  })?.id,'submitted');
  assert.equal(selectDrivingLogForHydration(rows,{
    date:'2026-11-08', submissionId:'submitted',
    localStatus:'submitted',
  })?.id,'submitted');
});

test('never silently restore another trip or another date', () => {
  const rows = [orgLog('another','booking-two'),orgLog('unlinked',null)];
  assert.equal(selectDrivingLogForHydration(rows,{
    date:'2026-11-08',submissionId:'submitted',
    localStatus:'submitted',
  }),undefined);
  assert.equal(selectDrivingLogForHydration(rows,{
    date:'2026-11-08',submissionId:'another',
    bookingId:'booking-one',localStatus:'draft',
  }),undefined);
  assert.equal(selectDrivingLogForHydration([
    orgLog('wrong-date',null,'2026-11-09'),
  ],{date:'2026-11-08',localStatus:'draft'}),undefined);
  assert.equal(selectDrivingLogForHydration([
    orgLog('unlinked-a',null),orgLog('unlinked-b',null),
  ],{date:'2026-11-08',localStatus:'draft'}),undefined);
  assert.equal(selectDrivingLogForHydration([
    orgLog('one-unlinked',null),
  ],{date:'2026-11-08',localStatus:'draft'})?.id,'one-unlinked');
});

test('the driver and HQ UI preserve linked IDs and do not downgrade submitted reports', () => {
  const modal = readFileSync('components/DrivingLogModal.tsx','utf8');
  const hq = readFileSync('components/hq/reports/HqBookingLogLinkPanel.tsx','utf8');
  assert.match(modal,/selectDrivingLogForHydration/);
  assert.match(modal,/bookingId: row.bookingId \|\| previous.bookingId/);
  assert.match(modal,/disabled=\{logData.status !== 'draft'\}/);
  assert.match(hq,/조건이 명확하지 않은 기록만 검토/);
});
