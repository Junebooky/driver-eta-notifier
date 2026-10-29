import {
  calculateDutyDuration,
  calculateDrivingDistance,
  formatOdometer,
  sanitizeOdometer,
  isValidTimeHHMM,
  clampTimeComponent,
  checkStopTimelineConsistency,
  loadDrivingLogDraft,
  createReferenceDemoFixture,
} from './drivingLog';

function runTests() {
  let passed = 0;
  let total = 0;

  function assert(desc: string, condition: boolean) {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ ${desc}`);
    } else {
      console.error(`✗ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  console.log('--- 1. Testing Duty Duration Calculation ---');
  // 1. Exact requirement: 06:40 to 21:50 must display 15시간 10분
  const res1 = calculateDutyDuration('06:40', '21:50');
  assert('06:40 to 21:50 is 15시간 10분', res1.formatted === '15시간 10분' && res1.hours === 15 && res1.minutes === 10);

  // 2. Overnight rollover: 22:00 to 06:00 is 8시간 0분
  const res2 = calculateDutyDuration('22:00', '06:00');
  assert('22:00 to 06:00 is 8시간 0분', res2.formatted === '8시간 0분' && res2.hours === 8 && res2.minutes === 0);

  // 3. Same time: 09:00 to 09:00 is 0시간 0분
  const res3 = calculateDutyDuration('09:00', '09:00');
  assert('09:00 to 09:00 is 0시간 0분', res3.formatted === '0시간 0분');

  // 4. Empty inputs
  const res4 = calculateDutyDuration('', '');
  assert('Empty times return 0시간 0분', res4.formatted === '0시간 0분');

  // 5. Invalid time inputs (e.g. 99:99)
  const res5 = calculateDutyDuration('99:99', '21:50');
  assert('Invalid clockIn (99:99) returns error', res5.error !== null);

  console.log('\n--- 2. Testing Strict 24h Time Validation ---');
  assert('06:40 is valid', isValidTimeHHMM('06:40') === true);
  assert('23:59 is valid', isValidTimeHHMM('23:59') === true);
  assert('00:00 is valid', isValidTimeHHMM('00:00') === true);
  assert('99:99 is invalid', isValidTimeHHMM('99:99') === false);
  assert('24:00 is invalid', isValidTimeHHMM('24:00') === false);
  assert('12:60 is invalid', isValidTimeHHMM('12:60') === false);
  assert('empty is invalid', isValidTimeHHMM('') === false);

  assert('clamp hour 25 -> 23', clampTimeComponent(25, 23) === '23');
  assert('clamp minute 75 -> 59', clampTimeComponent(75, 59) === '59');
  assert('clamp minute 5 -> 05', clampTimeComponent(5, 59) === '05');

  console.log('\n--- 3. Testing Stop Timeline Consistency ---');
  const check1 = checkStopTimelineConsistency('06:40', '21:50', '08:50');
  assert('Stop 08:50 is within 06:40-21:50', check1.isConsistent === true);

  const check2 = checkStopTimelineConsistency('06:40', '21:50', '22:15');
  assert('Stop 22:15 is after 21:50 (inconsistent)', check2.isConsistent === false && check2.warning?.includes('퇴근시간') === true);

  const check3 = checkStopTimelineConsistency('06:40', '21:50', '05:30');
  assert('Stop 05:30 is before 06:40 (inconsistent)', check3.isConsistent === false && check3.warning?.includes('출근시간') === true);

  console.log('\n--- 4. Testing Driving Distance Calculation ---');
  // 6. Exact requirement: 154,725 km to 154,861 km must display 136 km
  const dist1 = calculateDrivingDistance('154,725', '154,861');
  assert('154,725 to 154,861 is 136 km', dist1.formatted === '136 km' && dist1.distanceKm === 136 && dist1.error === null);

  // 7. Non-negative validation: end < start
  const dist2 = calculateDrivingDistance('150,000', '140,000');
  assert('end < start produces validation error', dist2.error !== null && dist2.distanceKm === null);

  // 8. Numeric sanitizing & formatting
  assert('sanitizeOdometer cleans string', sanitizeOdometer(' 154,725 km ') === '154725');
  assert('formatOdometer adds commas', formatOdometer('154725') === '154,725');

  console.log('\n--- 5. Testing Fresh Report vs Demo Fixture ---');
  const freshDraft = loadDrivingLogDraft({ vehicleNo: '4호차', driverName: '윤태준', defaultNavi: 'tmap' });
  assert('Fresh draft starts with empty stops', freshDraft.stops.length === 0);
  assert('Fresh draft status is draft', freshDraft.status === 'draft');
  assert('Fresh draft is not demo fixture', freshDraft.isDemoFixture === false);

  const demoFixture = createReferenceDemoFixture({ vehicleNo: '4호차', driverName: '윤태준', defaultNavi: 'tmap' });
  assert('Demo fixture has 8 stops', demoFixture.stops.length === 8);
  assert('Demo fixture has 136 km', demoFixture.distanceKm === '136 km');
  assert('Demo fixture status is draft', demoFixture.status === 'draft');
  assert('Demo fixture isDemoFixture flag is true', demoFixture.isDemoFixture === true);

  console.log(`\nTests finished: ${passed}/${total} passed.`);
}

runTests();
