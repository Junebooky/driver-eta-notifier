process.env.DEV_AUTH_ENABLED = 'true';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getFlightLocationPreset,
  formatFlightReport,
  resolveGimpoArrival,
  resolveGimpoDeparture,
  cleanExitCode,
  formatExitText,
} from './flightMapping';
import { FlightInfo, DriverProfile } from '@/types';

// Load .env.local if running standalone outside Next.js runtime
if (!process.env.INCHEON_AIRPORT_API_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (!process.env[key]) process.env[key] = value;
        }
      });
    }
  } catch {
    // fallback
  }
}

async function runFlightTests() {
  console.log('🧪 Starting P1 Flight Gimpo & Incheon Auto-detect Test Suite...');

  const mockProfile: DriverProfile = {
    driverName: '홍승범',
    vehicleNo: '2호차',
    phone: '010-3333-4444',
    passengerName: 'VIP 게스트',
    defaultNavi: 'tmap',
  };

  // 1. Gimpo Domestic Presets
  const gmpDomArr = getFlightLocationPreset('김포공항 국내선', 'arrival', 'GMP', true);
  assert.strictEqual(gmpDomArr.id, 'custom_flight_gmp_dom_arr', 'GMP domestic arrival preset ID mismatch');
  assert.strictEqual(gmpDomArr.lat, 37.5594, 'GMP domestic arrival latitude mismatch');
  assert.strictEqual(gmpDomArr.lng, 126.8035, 'GMP domestic arrival longitude mismatch');

  const gmpDomDep = getFlightLocationPreset('김포공항 국내선', 'departure', 'GMP', true);
  assert.strictEqual(gmpDomDep.id, 'custom_flight_gmp_dom_dep', 'GMP domestic departure preset ID mismatch');
  assert.strictEqual(gmpDomDep.lat, 37.5587, 'GMP domestic departure latitude mismatch');

  // 2. Gimpo International Presets
  const gmpIntArr = getFlightLocationPreset('김포공항 국제선', 'arrival', 'GMP', false);
  assert.strictEqual(gmpIntArr.id, 'custom_flight_gmp_int_arr', 'GMP international arrival preset ID mismatch');
  assert.strictEqual(gmpIntArr.lat, 37.5641, 'GMP international arrival latitude mismatch');

  const gmpIntDep = getFlightLocationPreset('김포공항 국제선', 'departure', 'GMP', false);
  assert.strictEqual(gmpIntDep.id, 'custom_flight_gmp_int_dep', 'GMP international departure preset ID mismatch');
  assert.strictEqual(gmpIntDep.lat, 37.5645, 'GMP international departure latitude mismatch');

  // 3. Incheon Presets (Backward Compatibility)
  const icnT1Arr = getFlightLocationPreset('제1여객터미널', 'arrival', 'ICN', false);
  assert.strictEqual(icnT1Arr.id, 'custom_flight_icn_t1_arr', 'ICN T1 arrival preset mismatch');
  const icnT2Dep = getFlightLocationPreset('제2여객터미널', 'departure', 'ICN', false);
  assert.strictEqual(icnT2Dep.id, 'custom_flight_icn_t2_dep', 'ICN T2 departure preset mismatch');

  console.log('✅ Preset locations verified: Gimpo Dom/Int & Incheon T1/T2.');

  // 4. Gimpo Arrival Gate Resolution (Strict No Fake Gate Generation)
  const resolvedWithGate = resolveGimpoArrival('김포공항 국내선', '14', true);
  assert.ok(resolvedWithGate.arrivalLocationText.includes('14번 게이트'), 'Known gate should be formatted');

  const resolvedWithoutGate = resolveGimpoArrival('김포공항 국내선', null, true);
  assert.ok(
    resolvedWithoutGate.arrivalLocationText.includes('확인 필요'),
    'Unassigned gate must strictly show 확인 필요 without inventing fake gates'
  );

  // 5. Gimpo Report Generation (Kakao Multi-line)
  const mockGmpFlight: FlightInfo = {
    flightId: 'KE1234',
    airline: '대한항공',
    type: 'arrival',
    airport: '제주',
    airportCode: 'CJU',
    airportKind: 'GMP',
    airportName: '김포국제공항',
    isDomestic: true,
    scheduleTimeFormatted: '14:30',
    estimatedTimeFormatted: '14:30',
    statusText: '14:30 (정상 도착)',
    diffMinutes: 0,
    terminal: '김포공항 국내선',
    terminalId: 'GMP_DOM',
    arrivalLocationText: '김포공항 국내선 1층 입국장 (도착 게이트 14번 게이트)',
    departureLocationText: '김포공항 국내선 2층 출발층',
    suggestedDoor: '2층 출발 2~3번 도어 앞',
    targetPreset: gmpDomArr,
  };

  const report = formatFlightReport(mockProfile, mockGmpFlight);
  assert.ok(report.includes('[2호차 홍승범]'), 'Report header should include driver & vehicle');
  assert.ok(report.includes('KE1234 (제주 ➔ GMP)'), 'GMP airport destination should be reflected');
  assert.ok(report.includes('예상착륙: 14:30 (정상 도착)'), 'Status text must be present');

  console.log('✅ Gimpo Kakao report & unassigned gate safety verified.');

  // 6. Test GET handler directly from route.ts
  const { GET } = await import('../app/api/flight/route');
  const { NextRequest } = await import('next/server');

  // Test 6a: Gimpo Domestic Flight KE1234
  const reqGmpDom = new NextRequest('http://localhost:3000/api/flight?flightId=KE1234&type=arrival');
  const resGmpDom = await GET(reqGmpDom);
  const dataGmpDom = await resGmpDom.json();

  assert.strictEqual(resGmpDom.status, 200, 'KE1234 lookup should succeed');
  assert.strictEqual(dataGmpDom.success, true);
  assert.strictEqual(dataGmpDom.flight.airportKind, 'GMP');
  assert.strictEqual(dataGmpDom.flight.airport, '제주');
  assert.strictEqual(dataGmpDom.flight.isDomestic, true);
  assert.strictEqual(dataGmpDom.flight.targetPreset.id, 'custom_flight_gmp_dom_arr');
  assert.ok(dataGmpDom.flight.dataSource, 'DataSource must be indicated');

  // Test 6b: Gimpo International Flight NH862
  const reqGmpInt = new NextRequest('http://localhost:3000/api/flight?flightId=NH862&type=departure');
  const resGmpInt = await GET(reqGmpInt);
  const dataGmpInt = await resGmpInt.json();

  assert.strictEqual(resGmpInt.status, 200, 'NH862 lookup should succeed');
  assert.strictEqual(dataGmpInt.flight.airportKind, 'GMP');
  assert.strictEqual(dataGmpInt.flight.isDomestic, false);
  assert.strictEqual(dataGmpInt.flight.targetPreset.id, 'custom_flight_gmp_int_dep');

  // Test 6c: Incheon Live Flight Lookup (e.g. KE012 or OM308 or SQ612)
  const reqIcn = new NextRequest('http://localhost:3000/api/flight?flightId=KE012&type=arrival');
  const resIcn = await GET(reqIcn);
  const dataIcn = await resIcn.json();

  // If IIAC live API is accessible, it will return 200 or 404 (if not flying today)
  if (resIcn.status === 200) {
    assert.strictEqual(dataIcn.flight.airportKind, 'ICN');
    assert.strictEqual(dataIcn.flight.isMock, false);
    console.log('✅ Incheon live API returned valid real-time flight.');
  } else {
    console.log(`ℹ️ Incheon flight lookup status: ${resIcn.status} (${dataIcn.message})`);
  }

  // Test 6d: Short invalid flight ID error
  const reqInvalid = new NextRequest('http://localhost:3000/api/flight?flightId=K&type=arrival');
  const resInvalid = await GET(reqInvalid);
  assert.strictEqual(resInvalid.status, 400, 'Short flight ID must return 400');

  // Test 6e: Verify AF264 candidates exclude past dates (KST today and future only)
  const reqAf = new NextRequest('http://localhost:3000/api/flight?flightId=AF264&type=arrival');
  const resAf = await GET(reqAf);
  const dataAf = await resAf.json();

  if (resAf.status === 200 && Array.isArray(dataAf.candidates)) {
    const todayKst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    for (const cand of dataAf.candidates) {
      if (cand.flightDate) {
        assert.ok(
          cand.flightDate >= todayKst,
          `Candidate flight date ${cand.flightDate} must be >= today (${todayKst})`
        );
      }
    }
    console.log(`✅ AF264 past date filtering verified: all ${dataAf.candidates.length} candidates >= ${todayKst}.`);
  }

  console.log('🎉 All P1 Flight Gimpo & Incheon Tests Passed 100%!\n');
}

runFlightTests().catch((err) => {
  console.error('❌ Flight Test Failure:', err);
  process.exit(1);
});
