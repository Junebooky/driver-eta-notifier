import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HqBooking } from '@/types/hq';
import { HqDispatchCalendar } from '../components/hq/HqDispatchCalendar';
import { getKstTodayDateStr } from './dispatchConflictDetector';
import { getHqCalendarDays, isHqBookingScheduledOn, shiftHqCalendarMonth, sortHqCalendarBookings, hqBookingSeriesKey, getHqCalendarContinuity } from './hqDispatchCalendar';

test('November 2026 grid begins on Sunday and covers all 30 days in five full weeks', () => {
  const days = getHqCalendarDays('2026-11');
  assert.equal(days.length, 35);
  assert.equal(days[0].iso, '2026-11-01');
  assert.equal(days[29].iso, '2026-11-30');
  assert.equal(days[34].iso, '2026-12-05');
  assert.equal(days.filter(d => d.inMonth).length, 30);
  assert.equal(days[9].iso, '2026-11-10');
});

test('week boundaries, leap February, month navigation and year rollover are date-safe', () => {
  assert.equal(shiftHqCalendarMonth('2026-12', 1), '2027-01');
  assert.equal(shiftHqCalendarMonth('2027-01', -1), '2026-12');
  const leap = getHqCalendarDays('2028-02');
  assert.equal(leap.filter(d => d.inMonth).length, 29);
  assert.equal(leap.length % 7, 0);
});

test('multi-day stays visible on each occupied date, without creating new booking records', () => {
  const b = { pickupDate: '2026-11-10', endDate: '2026-11-12' };
  assert.equal(isHqBookingScheduledOn(b, '2026-11-09'), false);
  assert.equal(isHqBookingScheduledOn(b, '2026-11-10'), true);
  assert.equal(isHqBookingScheduledOn(b, '2026-11-11'), true);
  assert.equal(isHqBookingScheduledOn(b, '2026-11-12'), true);
  assert.equal(isHqBookingScheduledOn(b, '2026-11-13'), false);
  assert.equal(isHqBookingScheduledOn({ pickupDate: '2026-11-10', endDate: '2026-11-08' }, '2026-11-10'), true);
  assert.equal(isHqBookingScheduledOn({ pickupDate: 'invalid' }, '2026-11-10'), false);
});

test('chronological ordering preserves different vehicles assigned to the same customer', () => {
  const rows = [
    { id: 'b', pickupTime: '14:00', customerName: '테스트코리아 A' },
    { id: 'a', pickupTime: '09:00', customerName: '테스트코리아 A' },
  ];
  assert.deepEqual(sortHqCalendarBookings(rows).map(x=>x.id), ['a', 'b']);
});

test('calendar renders actual HQ booking values, not demonstration fixtures or fixed customer names', () => {
  const today = getKstTodayDateStr();
  const realBooking = {
    id: 'live-calendar-test',
    bookingNo: 'LIVE-CAL-TEST',
    pickupDate: today,
    pickupTime: '09:00',
    customerName: '실제데이터 연결 검증',
    vehiclePlate: '193호 5336',
    driverName: '김기사',
    pickupLocation: '인천국제공항 제2여객터미널',
    destination: '그랜드 하얏트 서울',
    dispatchStatus: '배차 완료',
  } as HqBooking;
  const html = renderToStaticMarkup(createElement(HqDispatchCalendar, {
    bookings: [realBooking], onViewBooking: () => {}, onOpenNewBooking: () => {},
  }));
  assert.ok(html.includes('실제데이터 연결 검증'));
  assert.ok(html.includes('193호 5336'));
  assert.ok(html.includes('김기사'));
  const empty = renderToStaticMarkup(createElement(HqDispatchCalendar, {
    bookings: [], onViewBooking: () => {}, onOpenNewBooking: () => {},
  }));
  assert.ok(empty.includes('이 날짜에 등록된 배차가 없어요.'));
  assert.equal(empty.includes('실제데이터 연결 검증'), false);
});

test('contiguous multi-day indicators require a real booking or explicit series and matching vehicle', () => {
  const base = {
    id: 'multi', customerName: '연속 실제 운행', customerId: 'org-a',
    pickupDate: '2026-11-10', endDate: '2026-11-12', pickupTime: '09:00',
    vehicleId: 'vehicle-a', vehiclePlate: '193호 5336',
  } as HqBooking;
  const within = getHqCalendarContinuity([base], '2026-11-11');
  assert.deepEqual({ previous: within?.previous, next: within?.next, days: within?.days },
    { previous: true, next: true, days: 3 });
  assert.equal(getHqCalendarContinuity([base], '2026-11-09'), null);
  const first = { ...base, id: 'day-1', endDate: undefined, groupId: 'real-group-a' };
  const second = { ...base, id: 'day-2', pickupDate: '2026-11-11', endDate: undefined, groupId: 'real-group-a' };
  assert.equal(getHqCalendarContinuity([first, second], '2026-11-10')?.next, true);
  assert.equal(getHqCalendarContinuity([first, second], '2026-11-11')?.previous, true);
  assert.equal(getHqCalendarContinuity([first, { ...second, vehicleId: 'vehicle-b' }], '2026-11-10'), null);
  assert.equal(getHqCalendarContinuity([first, { ...second, groupId: 'group-b' }], '2026-11-10'), null);
  assert.equal(getHqCalendarContinuity([{ ...first, groupId: undefined }, { ...second, groupId: undefined }], '2026-11-10'), null);
  assert.notEqual(hqBookingSeriesKey(first), hqBookingSeriesKey({ ...second, vehicleId: 'vehicle-b' }));
});

test('calendar keeps seven slim columns and exposes mobile tap / desktop hover preview without losing detail callback', () => {
  const source = readFileSync(new URL('../components/hq/HqDispatchCalendar.tsx', import.meta.url), 'utf8');
  assert.match(source, /grid grid-cols-7/);
  assert.match(source, /data-calendar-peek-trigger/);
  assert.match(source, /onMouseEnter=/);
  assert.match(source, /createPortal\(/);
  assert.match(source, /onViewBooking\(booking\)/);
  assert.match(source, /aria-label=.*배차 미리보기/);
  assert.match(source, /continuation\.days/);
});
