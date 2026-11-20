import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlightInfo } from '@/types';
import {
  buildFallbackFlightHint,
  formatLiveFlightHint,
  normalizeFlightCode,
} from './emailFlightHint';

test('normalizeFlightCode accepts airline flight numbers and rejects placeholders', () => {
  assert.equal(normalizeFlightCode('ke 2102'), 'KE2102');
  assert.equal(normalizeFlightCode('7C-101'), '7C101');
  assert.equal(normalizeFlightCode('항공편 없음'), null);
  assert.equal(normalizeFlightCode('미정'), null);
  assert.equal(normalizeFlightCode(''), null);
});

test('buildFallbackFlightHint resolves GMP international, ICN T2, and Asiana T2 rules cleanly', () => {
  const gmpHint = buildFallbackFlightHint({
    flightNumber: 'KE2102',
    date: '2026-11-09',
    originAirport: 'HND',
    destinationAirport: 'GMP',
    role: 'arrival',
    scheduledArrival: '15:00',
  });
  assert.ok(gmpHint);
  assert.equal(gmpHint.airportLabel, '김포공항');
  assert.equal(gmpHint.terminalLabel, '국제선');
  assert.equal(gmpHint.summaryText, '김포공항 국제선 · 15:00 도착 · 도쿄(하네다)발');
  assert.equal(gmpHint.isLiveApi, false);

  const icnKeHint = buildFallbackFlightHint({
    flightNumber: 'KE082',
    date: '2026-11-12',
    destinationAirport: 'ICN',
    role: 'arrival',
  });
  assert.ok(icnKeHint);
  assert.equal(icnKeHint.summaryText, '인천공항 제2여객터미널');

  const ozT2Hint = buildFallbackFlightHint({
    flightNumber: 'OZ113',
    date: '2026-11-12',
    destinationAirport: 'ICN',
    role: 'arrival',
  });
  assert.ok(ozT2Hint);
  assert.equal(ozT2Hint.summaryText, '인천공항 제2여객터미널');
});

test('formatLiveFlightHint formats arrival exit, delay delta, and departure door concisely', () => {
  const arrival: FlightInfo = {
    flightId: 'KE2102',
    airline: '대한항공',
    type: 'arrival',
    airport: '도쿄(하네다)',
    airportCode: 'HND',
    airportKind: 'GMP',
    airportName: '김포국제공항',
    isDomestic: false,
    scheduleTimeFormatted: '15:00',
    estimatedTimeFormatted: '15:15',
    statusText: '15:15 (지연 시간 +15분)',
    diffMinutes: 15,
    terminal: '국제선',
    terminalId: 'GMP_INT',
    exit: 'A',
    arrivalLocationText: '국제선 도착',
    suggestedDoor: '',
    departureLocationText: '',
    targetPreset: {
      id: 'gmp', name: '김포국제공항 국제선', shortName: '김포 국제선',
      lat: 37.558, lng: 126.79, category: 'AIRPORT',
    },
  };
  const live = formatLiveFlightHint(arrival);
  assert.equal(live.isLiveApi, true);
  assert.equal(live.summaryText, '김포공항 국제선 · 15:15 도착(+15분) · 도쿄(하네다)발 · A출구');

  const departure: FlightInfo = {
    ...arrival,
    flightId: 'OZ202',
    airline: '아시아나항공',
    type: 'departure',
    airport: '로스앤젤레스',
    airportCode: 'LAX',
    airportKind: 'ICN',
    airportName: '인천국제공항',
    scheduleTimeFormatted: '14:40',
    estimatedTimeFormatted: '14:40',
    diffMinutes: 0,
    terminal: '제2여객터미널',
    terminalId: 'P03',
    exit: null,
    suggestedDoor: '4번 도어 앞',
    departureLocationText: '제2여객터미널 3층',
  };
  const depHint = formatLiveFlightHint(departure);
  assert.equal(depHint.summaryText, '인천공항 제2여객터미널 · 14:40 출발 · 로스앤젤레스행 · 4번 도어 앞');
});
