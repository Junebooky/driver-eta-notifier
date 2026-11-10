process.env.DEV_AUTH_ENABLED = 'true';
import assert from 'node:assert/strict';
import {
  resolveTerminal,
  resolveDepartureDoor,
  resolveArrivalCrossValidation,
  getFlightLocationPreset,
  formatFlightReportEnglish,
} from './flightMapping';
import type { DriverProfile, FlightInfo } from '@/types';

async function run(): Promise<void> {
  const t2 = { terminal: '제2여객터미널', isT2: true };
  const t1 = { terminal: '제1여객터미널', isT2: false };

  // ASIANA's ICN move was effective from 00:00 KST on 2026-01-14.
  // A stale P01/P02 from the live airport feed must not send guests to T1.
  for (const terminalId of ['P01', 'P02', 'P03', '']) {
    assert.deepEqual(resolveTerminal(terminalId, 'OZ113', '2026-11-08', '아시아나항공'), t2);
  }
  assert.deepEqual(resolveTerminal('P01', 'OZ741', '2026-11-09', 'Asiana Airlines'), t2);
  assert.deepEqual(resolveTerminal('P01', 'OZ113'), t2, 'Current OZ lookup without date must use T2');
  assert.deepEqual(resolveTerminal('P01', 'OZ113', '2026-01-13', '아시아나항공'), t1);
  assert.deepEqual(resolveTerminal('P03', 'OZ113', '202601132359', '아시아나항공'), t1);
  assert.deepEqual(resolveTerminal('P01', 'OZ113', '2026-01-14', '아시아나항공'), t2);

  // Marketing/codeshare OZ numbers with a different known operator must
  // follow the airport's actual terminal, not the OZ prefix.
  assert.deepEqual(resolveTerminal('P01', 'OZ999', '2026-11-08', 'United Airlines'), t1);
  assert.deepEqual(resolveTerminal('P03', 'OZ999', '2026-11-08', 'United Airlines'), t2);
  assert.deepEqual(resolveTerminal('P01', 'KE012', '2026-11-08', '대한항공'), t1);
  assert.deepEqual(resolveTerminal('P03', 'KE012', '2026-11-08', '대한항공'), t2);
  assert.deepEqual(resolveTerminal(null, 'KE012', '2026-11-08', '대한항공'), t2);

  const ozoneDoor = resolveDepartureDoor('제2여객터미널', true, 'OZ113', null, '아시아나항공');
  assert.match(ozoneDoor.departureLocationText, /G~J열/);
  assert.equal(ozoneDoor.suggestedDoor, '현장 확인');
  assert.doesNotMatch(ozoneDoor.departureLocationText, /1번 도어|카운터 A/);

  const confirmedCounter = resolveDepartureDoor('제2여객터미널', true, 'OZ113', 'H', '아시아나항공');
  assert.match(confirmedCounter.departureLocationText, /카운터 H/);
  assert.equal(confirmedCounter.suggestedDoor, '현장 확인');

  const arrival = resolveArrivalCrossValidation(t2.terminal, 'B', '13');
  assert.equal(arrival.exit, 'B출구');
  assert.equal(arrival.recommendedParking, 'T2 동편 단기 지상');
  assert.equal(getFlightLocationPreset(t2.terminal, 'arrival', 'ICN').id, 'custom_flight_icn_t2_arr');
  assert.equal(getFlightLocationPreset(t2.terminal, 'departure', 'ICN').id, 'custom_flight_icn_t2_dep');

  const profile: DriverProfile = {
    driverName: '테스트 기사',
    vehicleNo: '테스트 차량',
    phone: '',
    defaultNavi: 'tmap',
  };
  const sampleDeparture: FlightInfo = {
    flightId: 'OZ113',
    airline: '아시아나항공',
    type: 'departure',
    airport: '오사카',
    airportCode: 'KIX',
    airportKind: 'ICN',
    terminal: t2.terminal,
    terminalId: 'P03',
    scheduleTimeFormatted: '10:00',
    estimatedTimeFormatted: '10:00',
    statusText: '정상 출발',
    diffMinutes: 0,
    arrivalLocationText: '제2여객터미널 1층 (출구 배정 중)',
    departureLocationText: ozoneDoor.departureLocationText,
    suggestedDoor: ozoneDoor.suggestedDoor,
    targetPreset: getFlightLocationPreset(t2.terminal, 'departure', 'ICN'),
  };
  const enReport = formatFlightReportEnglish(profile, sampleDeparture);
  assert.match(enReport, /Terminal 2/);
  assert.match(enReport, /Counter G.?J/);
  assert.match(enReport, /Door TBD/);
  assert.doesNotMatch(enReport, /Door 4~5|Door 1(?:\D|$)/);

  // End-to-end route handler mapping with a mocked airport response.
  // No real airport API key or live request is needed in CI.
  const savedKey = process.env.INCHEON_AIRPORT_API_KEY;
  const savedFetch = globalThis.fetch;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace(/[^0-9]/g, '');
  try {
    process.env.INCHEON_AIRPORT_API_KEY = 'test-only-no-network';
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('getPassengerArrivalsDeOdp')) {
        return new Response(JSON.stringify({
          response: { body: { items: [{
            flightId: 'OZ113',
            airline: '아시아나항공',
            airport: '오사카',
            airportCode: 'KIX',
            terminalid: 'P01', // Simulate outdated airport T1 identifier
            scheduleDateTime: today + '2200',
            estimatedDateTime: today + '2210',
            gatenumber: '251',
            carousel: '13',
            exitnumber: 'B',
            remark: '운항중',
          }] } },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ response: { body: { items: [] } } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    };

    const { GET } = await import('../app/api/flight/route');
    const { NextRequest } = await import('next/server');
    const result = await GET(new NextRequest('http://localhost:3000/api/flight?flightId=OZ113&type=arrival'));
    const payload = await result.json();
    assert.equal(result.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.flight.flightId, 'OZ113');
    assert.equal(payload.flight.terminal, t2.terminal);
    assert.equal(payload.flight.terminalId, 'P03');
    assert.equal(payload.flight.targetPreset.id, 'custom_flight_icn_t2_arr');
    assert.equal(payload.flight.recommendedParking, 'T2 동편 단기 지상');
    assert.equal(payload.flight.exitNumber, 'B');
    assert.ok(payload.flight.dataSource?.includes('인천공항공사'));
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.INCHEON_AIRPORT_API_KEY;
    else process.env.INCHEON_AIRPORT_API_KEY = savedKey;
  }

  console.log('PASS: Asiana T2 relocation, codeshare precedence, curbside, navi preset, reports and live API mapping');
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
