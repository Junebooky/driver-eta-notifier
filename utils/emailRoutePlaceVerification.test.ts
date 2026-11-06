import test from 'node:test';
import assert from 'node:assert/strict';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import {
  changeEmailRouteStopName, confirmEmailRouteStop,
  getEmailRouteStops, getUnconfirmedEmailRouteStops,
} from './emailRoutePlaceVerification';

const draft = (): HqEmailExtractedDraft => ({
  id: 'draft-one', emailId: 'mail-01', companyName: '테스트코리아 A',
  passengerName: 'Alex Morgan', passengerPhone: '', passengerCount: 3,
  pickupDate: '2026-11-10', pickupTime: '09:00',
  pickupLocation: '인천국제공항 제2여객터미널', dropoffLocation: '그랜드 하얏트 서울',
  flightNumber: '', requestedVehicleClass: '카니발 하이리무진 1대', specialRequests: '영어 가능 기사',
  tripType: 'single', confidence: 0.99, warnings: [],
  assignedDriver: null, assignedVehicle: null, assignedVehiclePlate: null,
  status: 'draft', updatedAt: '2026-11-06T00:00:00Z',
  waypoints: [
    { id: 't1', order: 1, date: '2026-11-10', time: '09:00', location: '인천국제공항 제2여객터미널' },
    { id: 't2', order: 2, date: '2026-11-10', time: '11:00', location: '그랜드 하얏트 서울' },
    { id: 't3', order: 3, date: '2026-11-10', time: '14:00', location: '코엑스' },
    { id: 't4', order: 4, date: '2026-11-10', time: '18:00', location: '그랜드 하얏트 서울' },
  ],
});

const poi = (name: string) => ({
  name, address: '서울특별시 테스트구 도로 123', lat: 37.51, lng: 127.02,
});

test('four AI-extracted names remain unverified until real TMAP candidates are chosen', () => {
  const original = draft();
  assert.equal(getUnconfirmedEmailRouteStops(original).length, 4);
  const selected = confirmEmailRouteStop(original, 't3', poi('코엑스'));
  assert.equal(getUnconfirmedEmailRouteStops(selected).length, 3);
  assert.equal(selected.waypoints?.[2].address, '서울특별시 테스트구 도로 123');
  assert.equal(selected.waypoints?.[2].isPoiConfirmed, true);
  assert.equal(original.waypoints?.[2].isPoiConfirmed, undefined);
});

test('first and last POI update top-level coordinates and address without falsely confirming duplicate venue names', () => {
  const original = draft();
  const first = confirmEmailRouteStop(original, 't1', poi('인천국제공항 제2여객터미널'));
  assert.equal(first.pickupAddress, '서울특별시 테스트구 도로 123');
  assert.equal(first.pickupLat, 37.51);
  const last = confirmEmailRouteStop(first, 't4', poi('그랜드 하얏트 서울'));
  assert.equal(last.dropoffAddress, '서울특별시 테스트구 도로 123');
  assert.equal(last.waypoints?.[1].isPoiConfirmed, undefined);
  assert.equal(getEmailRouteStops(last).length, 4);
});

test('editing confirmed names invalidates old address and coordinates, preventing stale POI dispatch', () => {
  const selected = confirmEmailRouteStop(draft(), 't3', poi('코엑스'));
  const changed = changeEmailRouteStopName(selected, 't3', '다른 코엑스');
  assert.equal(changed.waypoints?.[2].address, undefined);
  assert.equal(changed.waypoints?.[2].lat, undefined);
  assert.equal(changed.waypoints?.[2].isPoiConfirmed, false);
  assert.equal(getUnconfirmedEmailRouteStops(changed).length, 4);
});

test('single-leg pickup/dropoff also retain verified addresses and require both stops', () => {
  const single = { ...draft(), waypoints: undefined };
  const confirmedPickup = confirmEmailRouteStop(single, 'pickup', poi('공항'));
  assert.equal(confirmedPickup.pickupAddress, '서울특별시 테스트구 도로 123');
  assert.equal(getUnconfirmedEmailRouteStops(confirmedPickup).length, 1);
  const confirmedBoth = confirmEmailRouteStop(confirmedPickup, 'dropoff', poi('호텔'));
  assert.equal(getUnconfirmedEmailRouteStops(confirmedBoth).length, 0);
  assert.equal(confirmedBoth.dropoffAddress, '서울특별시 테스트구 도로 123');
});

test('invalid/blank geocoding results do not masquerade as verified addresses', () => {
  assert.throws(() => confirmEmailRouteStop(draft(), 't2', { ...poi('호텔'), address: '' }), /주소/);
  assert.throws(() => confirmEmailRouteStop(draft(), 't2', { ...poi('호텔'), lat: NaN }), /좌표/);
});
