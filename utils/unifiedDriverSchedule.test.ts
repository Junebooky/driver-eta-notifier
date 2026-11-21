import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ScheduleItem } from '@/data/ferrariSchedules';
import { ScheduleCard } from '@/components/ScheduleCard';
import { DriverEventFavoritesSection } from '@/components/driver/DriverEventFavoritesSection';
import { buildDriverEventFavorites, getEventRouteLegs, scheduleToEventRoute } from '@/utils/driverEventFavorites';
import { DriverRouteLegRow } from '@/components/driver/DriverRouteLegRow';

const DRIVER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VEHICLE = '11111111-1111-4111-8111-111111111111';

function dispatch(): ScheduleItem {
  const date = '2026-11-12';
  const stops = [
    { id: 'one', date, order: 1, time: '09:00', location: '인천공항 T2', lat: 37.4687, lng: 126.4341, isPoiConfirmed: true, address: '' },
    { id: 'two', date, order: 2, time: '10:00', location: '조선팰리스', lat: 37.505, lng: 127.045, isPoiConfirmed: true, address: '' },
    { id: 'three', date, order: 3, time: '13:00', location: '코엑스', lat: 37.5118, lng: 127.0592, isPoiConfirmed: true, address: '' },
  ];
  return {
    id: 'test-dispatch', date, dateLabel: '11월 12일 (목)', pickup_time: '09:00', dropoff_time: null, time_display: '09:00',
    origin_name: '인천공항 T2', origin_address: '', origin_lat: 37.4687, origin_lng: 126.4341, origin_preset_id: 'o',
    destination_name: '코엑스', destination_address: '', destination_lat: 37.5118, destination_lng: 127.0592, destination_preset_id: 'd',
    status: 'confirmed', passenger: 'VIP', vehicle_no: '193호 5336', vehicle_plate: '193호 5336', driver_id: DRIVER,
    vehicle_id: VEHICLE, driver_name: '테스트기사', dispatch_status: 'published', intake_source: 'email',
    customer_name: 'FRED', event_id: 'email-FRED', event_name: 'FRED 행사',
    routeWaypoints: stops, isAcknowledged: true, operation_status: 'arrived_pickup', flight: 'KE704',
    place_verified: true, version: 2, last_ack_version: 2,
  };
}

test('one operational schedule card shows every leg and never hides flight, forecasting or HQ status controls', () => {
  const html = renderToStaticMarkup(createElement(ScheduleCard, {
    item: dispatch(), onNavigate: () => {}, onPredict: () => {},
    onNavigateLeg: () => {}, onPredictLeg: () => {},
    onOpenFlight: () => {}, onAcknowledge: () => {},
  }));
  assert.match(html, /FRED 행사/);
  assert.match(html, /KE704/);
  assert.match(html, /실시간 조회/);
  assert.match(html, /1구간/);
  assert.match(html, /2구간/);
  assert.match(html, /조선팰리스/);
  assert.match(html, /코엑스/);
  assert.match(html, /시간별 예측/);
  assert.match(html, /배차 확인됨/);
  assert.match(html, /실시간 운행 단계/);
  for (const stage of ['1.준비', '2.도착', '3.탑승', '4.이동', '5.종료']) {
    assert.ok(html.includes(stage), stage);
  }
  assert.equal((html.match(/까지 길안내/g) || []).length, 2);
});

test('compact event favorite reuses the same route row and card shell, without a second operational schedule', () => {
  const event = buildDriverEventFavorites([dispatch()], DRIVER);
  assert.equal(event.length, 1);
  const html = renderToStaticMarkup(createElement(DriverEventFavoritesSection, {
    compact: true, events: event, onLoadLeg: () => {},
  }));
  assert.match(html, /FRED 행사/);
  assert.match(html, /1구간/);
  assert.match(html, /2구간/);
  assert.match(html, /TMAP 위치 확정/);
  assert.match(html, /전체 방문지/);
  assert.equal((html.match(/까지 길안내/g) || []).length, 2);
});

test('shared route rows never enable unverified or same-place navigation', () => {
  const [first] = getEventRouteLegs(scheduleToEventRoute(dispatch()));
  const invalid = {
    ...first,
    ready: false,
    destination: { ...first.destination, isPoiConfirmed: false, lat: undefined },
  };
  const html = renderToStaticMarkup(createElement(DriverRouteLegRow, {
    leg: invalid, pickupTime: '09:00', onNavigate: () => {},
  }));
  assert.match(html, /disabled/);
  assert.match(html, /관리자의 TMAP 위치 확정이 필요/);
});

test('one driver sees two assigned flights as separate inline lookup actions without duplicate detail rows', () => {
  const html = renderToStaticMarkup(createElement(ScheduleCard, {
    item: { ...dispatch(), passenger: 'Guest A, Guest B, Guest C', passenger_phone: '010-1234-5678',
      flight: 'KE2104, NH867', flightType: 'arrival' },
    onNavigate: () => {}, onPredict: () => {}, onOpenFlight: () => {},
  }));
  assert.match(html, /KE2104/);
  assert.match(html, /NH867/);
  assert.match(html, /2편/);
  assert.match(html, /항공편 KE2104 실시간 조회/);
  assert.match(html, /항공편 NH867 실시간 조회/);
  assert.match(html, /Guest A, Guest B, Guest C/);
  assert.match(html, /tel:010-1234-5678/);
  assert.equal((html.match(/실시간 조회<\/button>/g) || []).length, 2);
  assert.equal((html.match(/항공편 · 입국/g) || []).length, 1, 'flight information is not repeated in detail table');
});

test('same-place lunch is shown as a timed activity with no navigation or TMAP estimate', () => {
  const schedule = dispatch();
  const coex = schedule.routeWaypoints![2];
  schedule.routeWaypoints!.push({
    ...coex, id: 'lunch', order: 4, time: '14:00', notes: '점심 식사',
  });
  const html = renderToStaticMarkup(createElement(ScheduleCard, {
    item: schedule, onNavigate: () => {}, onPredict: () => {},
    onNavigateLeg: () => {}, onPredictLeg: () => {},
  }));
  assert.match(html, /체류 일정/);
  assert.match(html, /14:00 일정/);
  assert.match(html, /코엑스 · 이동 없음/);
  assert.match(html, /점심 식사/);
  assert.equal((html.match(/까지 길안내/g) || []).length, 2, 'the extra dwell must not create a third navigation route');
});

test('unconfirmed stops use an amber confirmation warning, while legacy direct navigation is disabled', () => {
  const html = renderToStaticMarkup(createElement(ScheduleCard, {
    item: { ...dispatch(), routeWaypoints: undefined, place_verified: false },
    onNavigate: () => {}, onPredict: () => {},
  }));
  assert.match(html, /관리자 위치 확인 필요/);
  assert.match(html, /관리자 위치 확인 후 길안내 가능/);
  assert.match(html, /bg-\[#FCF4E9\]/);
  assert.match(html, /disabled=""[^>]*aria-label="길안내 실행"/);
});

test('two confirmed names sharing one building centroid are NOT a confirmed same-place activity', () => {
  const schedule = dispatch();
  const last = schedule.routeWaypoints![2];
  schedule.routeWaypoints!.push({
    ...last, id: 'different-venue', order: 4, location: '코엑스 서문', time: '14:00',
  });
  const legs = getEventRouteLegs(scheduleToEventRoute(schedule));
  const lastLeg = legs[legs.length - 1];
  assert.equal(lastLeg.samePlace, false);
  assert.equal(lastLeg.coordinateConflict, true);
  assert.equal(lastLeg.ready, false);
  const html = renderToStaticMarkup(createElement(DriverRouteLegRow, {
    leg: lastLeg, onNavigate: () => {}, onPredict: () => {},
  }));
  assert.match(html, /장소 이름이 다르지만 지도 좌표가 같습니다/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /체류 일정/);
});
