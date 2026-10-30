import assert from 'node:assert';
import {
  lookupApprovedAlias,
  formatEta12Hour,
  getReportVehicleNo,
  generateEnglishReportText,
  isPrivateAddress,
  decodeHtmlEntities,
  shortenEnglishPlaceName,
} from '../utils/locationTranslation.ts';
import { generateReportText } from '../utils/reportGenerator.ts';

console.log('--- STARTING GOOGLE CLOUD TRANSLATION REPORT TEST SUITE ---\n');

// -------------------------------------------------------------
// Test 1: Known Airport & Hotel Aliases (Task 3 & 4)
// -------------------------------------------------------------
console.log('Test 1: Company-Approved Aliases (No Google API call needed)');
assert.strictEqual(
  lookupApprovedAlias({ name: '인천공항 T1', shortName: '인천공항 T1', id: 'icn_t1' }),
  'Incheon Airport T1'
);
assert.strictEqual(
  lookupApprovedAlias({ name: '인천국제공항 제2여객터미널', shortName: '인천공항 T2' }),
  'Incheon Airport T2'
);
assert.strictEqual(
  lookupApprovedAlias({ name: '김포공항' }),
  'Gimpo Airport'
);
assert.strictEqual(
  lookupApprovedAlias({ name: '조선팰리스 강남', shortName: '조선팰리스 강남' }),
  'Josun Palace'
);
assert.strictEqual(
  lookupApprovedAlias({ name: '메리어트 호텔' }),
  'Marriott Hotel'
);
assert.strictEqual(
  lookupApprovedAlias({ name: '서울역' }),
  'Seoul Station'
);
assert.strictEqual(
  lookupApprovedAlias({ name: '판교 오피스' }),
  'Pangyo Office'
);
console.log('✓ All user-specified examples match approved aliases exactly!');

// -------------------------------------------------------------
// Test 2: HTML Entity Decoding & Conservative Shortening (Task 3 & 4)
// -------------------------------------------------------------
console.log('\nTest 2: HTML Entity Decoding & Conservative Abbreviation');
assert.strictEqual(
  decodeHtmlEntities('Josun Palace &amp; Marriott Hotel&#39;s'),
  "Josun Palace & Marriott Hotel's"
);
assert.strictEqual(
  shortenEnglishPlaceName('Incheon International Airport Terminal 1'),
  'Incheon Airport T1'
);
assert.strictEqual(
  shortenEnglishPlaceName('Incheon International Airport (Terminal 2)'),
  'Incheon Airport T2'
);
assert.strictEqual(
  shortenEnglishPlaceName('Gimpo International Airport'),
  'Gimpo Airport'
);
assert.strictEqual(
  shortenEnglishPlaceName('Josun Palace Seoul Gangnam'),
  'Josun Palace'
);
console.log('✓ HTML entity decoding and conservative place shortening passed!');

// -------------------------------------------------------------
// Test 3: ETA 12-Hour Natural Formatting (Task 2)
// -------------------------------------------------------------
console.log('\nTest 3: ETA 12-Hour Format Conversion');
assert.strictEqual(formatEta12Hour('19:34'), '7:34 PM');
assert.strictEqual(formatEta12Hour('07:34'), '7:34 AM');
assert.strictEqual(formatEta12Hour('19:34 (45분 소요)'), '7:34 PM');
assert.strictEqual(formatEta12Hour('12:05'), '12:05 PM');
assert.strictEqual(formatEta12Hour('00:15'), '12:15 AM');
assert.strictEqual(formatEta12Hour('7:34 PM'), '7:34 PM');
console.log('✓ ETA 12-hour formatting converts cleanly with AM/PM!');

// -------------------------------------------------------------
// Test 4: Vehicle Number Preservation (Task 2)
// -------------------------------------------------------------
console.log('\nTest 4: Vehicle Number Formatting');
assert.strictEqual(getReportVehicleNo({ vehicleNo: '116허 1514' }), '116허 1514');
assert.strictEqual(getReportVehicleNo({ vehicleNo: '호차 116허 1514' }), '116허 1514');
assert.strictEqual(getReportVehicleNo({ vehicleNo: '1호차', carNumber: '116허 1514' }), '116허 1514');
assert.strictEqual(getReportVehicleNo({ vehicleNo: '142호 7811' }), '142호 7811');
console.log('✓ Vehicle numbers and Korean characters (허, 호) preserved intact!');

// -------------------------------------------------------------
// Test 5: Fixed English Report Templates (Departure & Arrival)
// -------------------------------------------------------------
console.log('\nTest 5: Fixed English Departure Template');
const departureReport = generateEnglishReportText({
  vehicleNo: '116허 1514',
  originEn: 'Josun Palace',
  destinationEn: 'Incheon Airport T1',
  etaFormatted: '19:34',
  mode: 'DEPARTURE',
});

const expectedDeparture = `• Vehicle No.: 116허 1514\n• Route: Josun Palace → Incheon Airport T1\n• ETA: 7:34 PM`;
assert.strictEqual(departureReport, expectedDeparture);
console.log('Generated Departure Report:\n' + departureReport);
console.log('✓ Exact match with prompt departure example!');

console.log('\nTest 6: Fixed English Arrival Template');
const arrivalReport = generateEnglishReportText({
  vehicleNo: '116허 1514',
  originEn: 'Josun Palace',
  destinationEn: 'Incheon Airport T1',
  mode: 'ARRIVED',
});

const expectedArrival = `• Vehicle No.: 116허 1514\n• Destination: Incheon Airport T1\n• Status: Arrived`;
assert.strictEqual(arrivalReport, expectedArrival);
console.log('Generated Arrival Report:\n' + arrivalReport);
console.log('✓ Exact match with prompt arrival example!');

// -------------------------------------------------------------
// Test 7: Formatting Rule — Every line starts with "• "
// -------------------------------------------------------------
console.log('\nTest 7: Formatting Rule — Every line starts with •');
departureReport.split('\n').forEach((line, idx) => {
  assert.ok(line.startsWith('• '), `Line ${idx + 1} does not start with "• ": ${line}`);
});
arrivalReport.split('\n').forEach((line, idx) => {
  assert.ok(line.startsWith('• '), `Line ${idx + 1} does not start with "• ": ${line}`);
});
console.log('✓ All English report lines strictly start with "• "!');

// -------------------------------------------------------------
// Test 8: Waypoint Route chaining in Departure
// -------------------------------------------------------------
console.log('\nTest 8: Waypoints chained with → in Route');
const wpReport = generateEnglishReportText({
  vehicleNo: '116허 1514',
  originEn: 'Josun Palace',
  destinationEn: 'Incheon Airport T1',
  waypointsEn: ['COEX', 'Seoul Station'],
  etaFormatted: '21:15',
  mode: 'DEPARTURE',
});
assert.ok(wpReport.includes('• Route: Josun Palace → COEX → Seoul Station → Incheon Airport T1'));
assert.ok(wpReport.includes('• ETA: 9:15 PM'));
console.log('✓ Waypoints correctly joined with " → "!');

// -------------------------------------------------------------
// Test 9: Korean Report Remains 100% Unchanged
// -------------------------------------------------------------
console.log('\nTest 9: Korean Report Preservation');
const koreanDeparture = generateReportText({
  mode: 'DEPARTURE',
  profile: { vehicleNo: '116허 1514', driverName: '김기사', defaultNavi: 'tmap' },
  origin: '조선팰리스 강남',
  destination: '인천공항 T1',
  etaFormatted: '19:34',
});
assert.ok(koreanDeparture.includes('[116허 1514 김기사]'));
assert.ok(koreanDeparture.includes('• 이동: 조선팰리스 강남 → 인천공항 T1'));
assert.ok(koreanDeparture.includes('• ETA: 19:34'));
console.log('✓ Korean report format completely intact and operational!');

// -------------------------------------------------------------
// Test 10: Privacy Guardrail on Residential Addresses (Task 5)
// -------------------------------------------------------------
console.log('\nTest 10: Privacy Guardrail for Personal Addresses');
assert.strictEqual(isPrivateAddress('래미안 퍼스티지 102동 1402호'), true);
assert.strictEqual(isPrivateAddress('반포자이 201동 502호'), true);
assert.strictEqual(isPrivateAddress('성수동 아크로포레스트 A동 2301호'), true);
assert.strictEqual(isPrivateAddress('인천공항 T1'), false);
assert.strictEqual(isPrivateAddress('조선팰리스 강남'), false);
console.log('✓ Residential unit numbers identified and blocked from public cache!');

console.log('\n🎉 ALL 10 TEST SUITES PASSED FLAWLESSLY!');
