import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScheduleItem } from '@/data/ferrariSchedules';
import { buildDriverEventFavorites, eventRouteToPresets } from './driverEventFavorites';

const DRIVER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRIVER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function schedule(id: string, date: string, overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  const stops = [
    { id: id + '-1', date, order: 1, time: '09:00', location: '조선팰리스', address: '서울 강남구 테헤란로 231', lat: 37.505, lng: 127.045, isPoiConfirmed: true },
    { id: id + '-2', date, order: 2, time: '11:00', location: '성수 행사장', address: '서울 성동구 성수동2가', lat: 37.544, lng: 127.063, isPoiConfirmed: true },
    { id: id + '-3', date, order: 3, time: '18:00', location: '그랜드하얏트', address: '서울 용산구 소월로 322', lat: 37.539, lng: 126.997, isPoiConfirmed: true },
  ];
  return {
    id, date, dateLabel: date, pickup_time: '09:00', dropoff_time: null, time_display: '09:00',
    origin_name: stops[0].location, origin_address: stops[0].address,
    origin_lat: stops[0].lat, origin_lng: stops[0].lng, origin_preset_id: 'start',
    destination_name: stops[2].location, destination_address: stops[2].address,
    destination_lat: stops[2].lat, destination_lng: stops[2].lng, destination_preset_id: 'end',
    status: 'confirmed', passenger: 'VIP 게스트',
    driver_id: DRIVER_A, vehicle_id: '11111111-1111-4111-8111-111111111111',
    vehicle_no: '4호차', vehicle_plate: '123허4567',
    dispatch_status: 'published', intake_source: 'email', service_mode: 'with_driver',
    event_id: 'email-FRED-2026', event_name: 'FRED 90주년 행사',
    customer_name: 'FRED', group_id: 'email-FRED-2026-' + date,
    routeWaypoints: stops,
    ...overrides,
  };
}

test('two-day email dispatch becomes one event with two ordered days, every stop kept', () => {
  const events = buildDriverEventFavorites([
    schedule('day2', '2026-11-13'), schedule('day1', '2026-11-12'),
  ], DRIVER_A);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'FRED 90주년 행사');
  assert.equal(events[0].customerName, 'FRED');
  assert.deepEqual(events[0].days.map(d => d.date), ['2026-11-12', '2026-11-13']);
  assert.deepEqual(events[0].days[0].routes[0].stops.map(s => s.name), [
    '조선팰리스', '성수 행사장', '그랜드하얏트',
  ]);
  const route = events[0].days[0].routes[0];
  assert.equal(route.ready, true);
  const nav = eventRouteToPresets(route);
  assert.equal(nav?.origin.address, '서울 강남구 테헤란로 231');
  assert.equal(nav?.destination.name, '그랜드하얏트');
  assert.equal(nav?.waypoints.length, 1);
  assert.equal(nav?.waypoints[0].name, '성수 행사장');
});

test('same-name events from different emails never get merged', () => {
  const events = buildDriverEventFavorites([
    schedule('e1', '2026-11-12'),
    schedule('e2', '2026-11-13', { event_id: 'email-other' }),
  ], DRIVER_A);
  assert.equal(events.length, 2);
});

test('only own published email services with confirmed driver and vehicle are exposed', () => {
  const base = schedule('valid', '2026-11-12');
  const unrelated = [
    schedule('other-driver', '2026-11-12', { driver_id: DRIVER_B }),
    schedule('cancelled', '2026-11-12', { dispatch_status: 'cancelled', status: 'cancelled' }),
    schedule('unassigned', '2026-11-12', { dispatch_status: 'unassigned' }),
    schedule('draft', '2026-11-12', { dispatch_status: 'draft' }),
    schedule('no-car', '2026-11-12', { vehicle_id: undefined }),
    schedule('manually-added', '2026-11-12', { intake_source: 'manual' }),
    schedule('vehicle-only', '2026-11-12', { service_mode: 'vehicle_only' }),
  ];
  const events = buildDriverEventFavorites([base, ...unrelated, base], DRIVER_A);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].days[0].routes.map(r => r.scheduleId), ['valid']);
  assert.deepEqual(buildDriverEventFavorites([base], ''), []);
  assert.deepEqual(buildDriverEventFavorites([base], DRIVER_B), []);
});

test('admin edits appear in the next read; cancelled/reassigned itineraries disappear', () => {
  const old = schedule('one', '2026-11-12');
  const changed = schedule('one', '2026-11-12', {
    version: 2,
    routeWaypoints: old.routeWaypoints!.map((p, i) => i === 1 ?
      { ...p, location: '신규 행사장', address: '서울 새 주소' } : p),
  });
  assert.equal(buildDriverEventFavorites([old], DRIVER_A)[0].days[0].routes[0].stops[1].name, '성수 행사장');
  assert.equal(buildDriverEventFavorites([changed], DRIVER_A)[0].days[0].routes[0].stops[1].name, '신규 행사장');
  assert.deepEqual(buildDriverEventFavorites([{ ...changed, driver_id: DRIVER_B }], DRIVER_A), []);
  assert.deepEqual(buildDriverEventFavorites([{ ...changed, dispatch_status: 'cancelled' }], DRIVER_A), []);
});

test('legacy incomplete route and unverified coordinates are display-only', () => {
  const legacy = schedule('legacy', '2026-11-12', { routeWaypoints: undefined });
  const legacyRoute = buildDriverEventFavorites([legacy], DRIVER_A)[0].days[0].routes[0];
  assert.equal(legacyRoute.fullItinerary, false);
  assert.equal(legacyRoute.ready, false);
  assert.equal(eventRouteToPresets(legacyRoute), null);

  const invalid = schedule('invalid', '2026-11-13', {
    routeWaypoints: schedule('temp', '2026-11-13').routeWaypoints!.map((s, i) =>
      i === 1 ? { ...s, isPoiConfirmed: false, lat: undefined } : s),
  });
  const invalidRoute = buildDriverEventFavorites([invalid], DRIVER_A)[0].days[0].routes[0];
  assert.equal(invalidRoute.ready, false);
  assert.equal(eventRouteToPresets(invalidRoute), null);
});

test('two schedules same day keep separate route cards, ordered by pickup', () => {
  const items = [
    schedule('late', '2026-11-12', { pickup_time: '17:00' }),
    schedule('early', '2026-11-12', { pickup_time: '08:00' }),
  ];
  const events = buildDriverEventFavorites(items, DRIVER_A);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].days[0].routes.map(r => r.scheduleId), ['early', 'late']);
});
