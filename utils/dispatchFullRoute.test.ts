import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mapHydratedRowToScheduleItem } from '../lib/dispatch/scheduleServerStore';
import { scheduleToPresets } from '../data/ferrariSchedules';
import { mapScheduleItemToHqBooking } from './dispatchConflictDetector';
import { DispatchRouteTimeline } from '../components/common/DispatchRouteTimeline';
import { buildEmailDispatchPlan } from './emailDispatchPlan';
import { createEmptyDraft } from '../services/emailBookingGeminiService';

const stops = [
  { id: 'airport', order: 1, date: '2026-11-10', time: '09:00', location: '인천국제공항 제2여객터미널',
    address: '인천광역시 중구 제2터미널대로 446', lat: 37.4687, lng: 126.4341, isPoiConfirmed: true },
  { id: 'hotel-am', order: 2, date: '2026-11-10', time: '11:00', location: '그랜드 하얏트 서울',
    address: '서울특별시 용산구 소월로 322', lat: 37.5391, lng: 126.9976, isPoiConfirmed: true },
  { id: 'coex', order: 3, date: '2026-11-10', time: '14:00', location: '코엑스',
    address: '서울특별시 강남구 영동대로 513', lat: 37.5118, lng: 127.0592, isPoiConfirmed: true },
  { id: 'hotel-pm', order: 4, date: '2026-11-10', time: '18:00', location: '그랜드 하얏트 서울',
    address: '서울특별시 용산구 소월로 322', lat: 37.5391, lng: 126.9976, isPoiConfirmed: true },
];

/** Fixture uses sample verified coordinates; it does not call TMAP or modify real bookings. */
function persistedSchedule() {
  return {
    id: 'dispatch-test-11-10', vehicle_no: '193호 5336', date: '2026-11-10', pickup_time: '09:00:00',
    end_date: '2026-11-10', end_time: '18:00:00', time_display: '09:00 픽업',
    origin: stops[0].location, destination: stops[3].location,
    passenger_name: 'Alex Morgan', passenger_count: 3, status: 'scheduled',
    dispatch_status: 'published',
    schedule_meta: {
      dispatchStatus: 'published', placeVerified: true, version: 1, lastAckVersion: 0,
      customerName: '테스트코리아 A', intakeSource: 'email',
      routeWaypoints: stops,
    },
  };
}

test('email → DB: one date and one vehicle keep four ordered TMAP points with times', () => {
  const draft = {
    ...createEmptyDraft({ emailId: 'sample-email', subject: '11월 10일 차량 예약', sender: 'test@example.invalid', bodyText: '' }),
    companyName: '테스트코리아 A', pickupDate: '2026-11-10', pickupTime: '09:00',
    pickupLocation: stops[0].location, dropoffLocation: stops[3].location,
    passengerName: 'Alex Morgan', passengerCount: 3,
    specialRequests: '', requestedLanguage: 'ko' as const, waypoints: stops,
  };
  const plan = buildEmailDispatchPlan(draft, [
    { vehicleModel: '카니발', vehiclePlate: '193호 5336', driver: { id: 'driver-test', name: 'QA 테스트' } },
  ], 'published');
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].routeWaypoints?.map(p => p.time), ['09:00', '11:00', '14:00', '18:00']);
});

test('saved DB row → HQ table/detail and driver schedule preserve all stops, with two navigation via-points', () => {
  const schedule = mapHydratedRowToScheduleItem(persistedSchedule());
  assert.equal(schedule.routeWaypoints?.length, 4);
  assert.deepEqual(schedule.routeWaypoints?.map(p => p.location), stops.map(p => p.location));
  assert.deepEqual(schedule.routeWaypoints?.map(p => p.time), stops.map(p => p.time));
  assert.deepEqual(schedule.routeWaypoints?.map(p => p.address), stops.map(p => p.address));
  assert.equal(schedule.isAdminRoute, true);
  assert.deepEqual(schedule.adminWaypoints?.map(p => p.name), ['그랜드 하얏트 서울', '코엑스']);
  assert.deepEqual(schedule.adminWaypoints?.map(p => p.address), [stops[1].address, stops[2].address]);

  const hqBooking = mapScheduleItemToHqBooking(schedule, 0);
  assert.equal(hqBooking.routeWaypoints?.length, 4);
  assert.deepEqual(hqBooking.routeWaypoints?.map(p => p.time), ['09:00', '11:00', '14:00', '18:00']);

  const nav = scheduleToPresets(schedule);
  assert.equal(nav.isAdminRoute, true);
  assert.deepEqual(nav.adminWaypoints?.map(p => p.name), ['그랜드 하얏트 서울', '코엑스']);
  assert.equal(nav.originPreset.name, stops[0].location);
  assert.equal(nav.destinationPreset.name, stops[3].location);
});

test('shared HQ/driver route timeline visibly renders all four waypoints and their times', () => {
  const schedule = mapHydratedRowToScheduleItem(persistedSchedule());
  const html = renderToStaticMarkup(createElement(DispatchRouteTimeline, { waypoints: schedule.routeWaypoints! }));
  for (const time of ['09:00', '11:00', '14:00', '18:00']) assert.ok(html.includes(time), time);
  assert.ok(html.includes('코엑스'));
  assert.ok(html.includes('서울특별시 강남구 영동대로 513'));
  assert.ok(html.includes('경유 2곳'));
  assert.equal((html.match(/그랜드 하얏트 서울/g) || []).length, 2, 'Repeated hotel visits must remain separate stops');
});

test('single-leg legacy DB schedules remain compatible', () => {
  const raw = persistedSchedule();
  const schedule = mapHydratedRowToScheduleItem({ ...raw, schedule_meta: { version: 1, dispatchStatus: 'published' } });
  assert.equal(schedule.routeWaypoints, undefined);
  assert.equal(schedule.isAdminRoute, false);
});


test('HQ confirmed all route POIs remain verified even when optional address text is missing', () => {
  const raw = persistedSchedule();
  const noAddressStops = stops.map((point) => ({ ...point, address: '' }));
  const item = mapHydratedRowToScheduleItem({
    ...raw,
    origin_address: null,
    destination_address: null,
    schedule_meta: {
      ...raw.schedule_meta,
      routeWaypoints: noAddressStops,
      placeVerified: true,
    },
  });
  assert.equal(item.place_verified, true);
  assert.equal(item.routeWaypoints?.length, 4);
  assert.equal(item.routeWaypoints?.every((point) => point.isPoiConfirmed), true);
});

test('legacy coordinates alone do not establish administrator POI verification', () => {
  const raw = persistedSchedule();
  const unverified = mapHydratedRowToScheduleItem({
    ...raw,
    schedule_meta: { version: 1, dispatchStatus: 'published' },
  });
  assert.equal(unverified.place_verified, undefined);
});
