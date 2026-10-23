import {
  calculateDutyDuration,
  calculateDrivingDistance,
  formatOdometer,
  sanitizeOdometer,
} from '../utils/drivingLog';

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

  console.log('--- Testing Duty Duration Calculation ---');
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

  console.log('\n--- Testing Driving Distance Calculation ---');
  // 5. Exact requirement: 154,725 km to 154,861 km must display 136 km
  const dist1 = calculateDrivingDistance('154,725', '154,861');
  assert('154,725 to 154,861 is 136 km', dist1.formatted === '136 km' && dist1.distanceKm === 136 && dist1.error === null);

  // 6. Non-negative validation: end < start
  const dist2 = calculateDrivingDistance('150,000', '140,000');
  assert('end < start produces validation error', dist2.error !== null && dist2.distanceKm === null);

  // 7. Numeric sanitizing & formatting
  assert('sanitizeOdometer cleans string', sanitizeOdometer(' 154,725 km ') === '154725');
  assert('formatOdometer adds commas', formatOdometer('154725') === '154,725');

  console.log(`\nTests finished: ${passed}/${total} passed.`);
}

runTests();
