import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HqBooking } from '@/types/hq';
import { mapHydratedRowToScheduleItem } from '../lib/dispatch/scheduleServerStore';
import { mapScheduleItemToHqBooking } from './dispatchConflictDetector';
import { evaluateDispatchEscalationAlerts, type UnackEscalationAlert } from './unackAlertEngine';
import { AlertItemCard } from '../components/hq/dispatch/HqDispatchAlertDrawer';

const stops = [
  { id: 'airport', order: 1, date: '2026-11-10', time: '09:00',
    location: '인천국제공항 제2여객터미널', address: '인천광역시 중구 제2터미널대로 446',
    lat: 37.4687, lng: 126.4341, isPoiConfirmed: true },
  { id: 'hotel-am', order: 2, date: '2026-11-10', time: '11:00',
    location: '그랜드 하얏트 서울', address: '서울특별시 용산구 소월로 322',
    lat: 37.5391, lng: 126.9976, isPoiConfirmed: true },
  { id: 'coex', order: 3, date: '2026-11-10', time: '14:00',
    location: '코엑스', address: '서울특별시 강남구 영동대로 513',
    lat: 37.5118, lng: 127.0592, isPoiConfirmed: true },
  { id: 'hotel-pm', order: 4, date: '2026-11-10', time: '18:00',
    location: '그랜드 하얏트 서울', address: '서울특별시 용산구 소월로 322',
    lat: 37.5391, lng: 126.9976, isPoiConfirmed: true },
];

function bookingFromDb(): HqBooking {
  const schedule = mapHydratedRowToScheduleItem({
    id: 'schedule-2026-11-10', vehicle_no: '193호 5336',
    date: '2026-11-10', pickup_time: '09:00:00',
    end_date: '2026-11-10', end_time: '18:00:00',
    origin: stops[0].location, destination: stops[3].location,
    passenger_name: 'Alex Morgan', passenger_count: 3,
    dispatch_status: 'published', status: 'scheduled',
    schedule_meta: {
      dispatchStatus: 'published', customerName: '테스트코리아 A',
      routeWaypoints: stops, placeVerified: true, version: 1, lastAckVersion: 0,
      intakeSource: 'email',
    },
  });
  const booking = mapScheduleItemToHqBooking(schedule, 0);
  return {
    ...booking,
    driverName: 'QA 테스트',
    driverAck: '미확인',
    dispatchStatus: '배차 완료',
    publishedAt: '2026-11-09T08:00:00+09:00',
  };
}

const now = Date.parse('2026-11-09T09:00:00+09:00');

function htmlForAlert(alert: UnackEscalationAlert) {
  return renderToStaticMarkup(createElement(AlertItemCard, {
    item: alert,
    feedback: undefined,
    isReminding: false,
    onRemind: () => {},
    onClose: () => {},
    onOpenBookingDetail: () => {},
    onOpenCustomerMessage: () => {},
  }));
}

test('DB → HQ booking → unacknowledged alert keeps every time, POI name and address', () => {
  const alerts = evaluateDispatchEscalationAlerts([bookingFromDb()], now).alerts;
  const pending = alerts.find((a) => a.category === 'unacked_delayed');
  assert.ok(pending, 'New dispatch creates driver confirmation notification');
  assert.deepEqual(pending.routeWaypoints?.map((p) => p.time), ['09:00', '11:00', '14:00', '18:00']);
  assert.deepEqual(pending.routeWaypoints?.map((p) => p.location), stops.map((p) => p.location));
  assert.deepEqual(pending.routeWaypoints?.map((p) => p.address), stops.map((p) => p.address));
  const html = htmlForAlert(pending);
  for (const time of ['09:00', '11:00', '14:00', '18:00']) assert.ok(html.includes(time), time);
  assert.ok(html.includes('중구 제2터미널대로 446'));
  assert.ok(html.includes('서울특별시 강남구 영동대로 513'));
  assert.ok(html.includes('경유 2곳'));
  assert.equal((html.match(/그랜드 하얏트 서울/g) || []).length, 2,
    'Repeated visits to the same hotel must stay distinct');
});

test('pending customer-notice alert retains the complete itinerary', () => {
  const booking = { ...bookingFromDb(), pendingCustomerTrigger: 'dispatch_confirmed' as const };
  const alerts = evaluateDispatchEscalationAlerts([booking], now).alerts;
  const alert = alerts.find((a) => a.category === 'customer_notify_pending');
  assert.ok(alert);
  assert.equal(alert.routeWaypoints?.length, 4);
  assert.ok(htmlForAlert(alert).includes('14:00'));
});

test('unassigned dispatch warning also includes mid-route stops when available', () => {
  const booking = {
    ...bookingFromDb(), dispatchStatus: '미배정' as const,
    driverAck: '-' as const, isTomorrow: true,
  };
  const alerts = evaluateDispatchEscalationAlerts([booking], now).alerts;
  const alert = alerts.find((a) => a.category === 'unassigned_omission');
  assert.ok(alert);
  assert.deepEqual(alert.routeWaypoints?.map((p) => p.location), stops.map((p) => p.location));
  assert.ok(htmlForAlert(alert).includes('11:00'));
});

test('legacy two-stop alert falls back to the original compact origin → destination row', () => {
  const booking = { ...bookingFromDb(), routeWaypoints: undefined };
  const alert = evaluateDispatchEscalationAlerts([booking], now).alerts[0];
  assert.ok(alert);
  const html = htmlForAlert(alert);
  assert.ok(html.includes('구간'));
  assert.ok(html.includes('인천국제공항 제2여객터미널'));
  assert.ok(html.includes('그랜드 하얏트 서울'));
  assert.ok(!html.includes('경유 2곳'));
});
