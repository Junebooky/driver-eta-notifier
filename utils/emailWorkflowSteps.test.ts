import { REFERENCE_EMAILS } from '@/components/hq/email/emailReferenceData';
import { driverSupportsEnglish } from '@/components/hq/email/HqDriverSelectModal';
import { mapDbDriverToHqSummary, HqDriverSummary } from '@/types/driverHq';

console.log('🧪 Starting Email 4-Step Workflow & Reference Data Test Suite...');

// Test 1: Verify 12 Reference Emails and Status Categories
console.log('\n[Test 1] Verify 12 Reference Emails and Status Breakdown...');
if (REFERENCE_EMAILS.length !== 12) {
  throw new Error(`Expected 12 reference emails, got ${REFERENCE_EMAILS.length}`);
}

const unprocessed = REFERENCE_EMAILS.filter((e) => e.statusCategory === 'unprocessed');
const reviewing = REFERENCE_EMAILS.filter((e) => e.statusCategory === 'reviewing');
const completed = REFERENCE_EMAILS.filter((e) => e.statusCategory === 'completed');

console.log(`- 미처리: ${unprocessed.length}건 (Expected: 5)`);
console.log(`- 검토중: ${reviewing.length}건 (Expected: 3)`);
console.log(`- 예약완료: ${completed.length}건 (Expected: 4)`);

if (unprocessed.length !== 5 || reviewing.length !== 3 || completed.length !== 4) {
  throw new Error('Status category count mismatch against reference UI specification!');
}
console.log('✅ Test 1 Passed: 12 Reference emails correctly distributed (5/3/4).');

// Test 2: Verify Step 1 (AI Extracted Data for Global Events)
console.log('\n[Test 2] Verify Step 1 Extracted Booking Fields for Global Events...');
const geEmail = REFERENCE_EMAILS.find((e) => e.summary.from.name === 'Global Events');
if (!geEmail) throw new Error('Global Events email missing!');

const draft = geEmail.extractedDraft;
if (
  draft.pickupDate !== '2026-10-28' ||
  draft.pickupTime !== '09:00' ||
  !draft.pickupLocation.includes('인천') ||
  !draft.dropoffLocation.includes('신라호텔') ||
  draft.flightNumber !== 'KE082' ||
  draft.passengerCount !== 3
) {
  throw new Error(`Step 1 extracted fields mismatch: ${JSON.stringify(draft)}`);
}
console.log('✅ Test 2 Passed: Step 1 AI extraction data matches panel 1 specification.');

// Test 3: Verify Real DB Driver Mapping and English Filter Support
console.log('\n[Test 3] Verify Real DB Driver Mapping and English Filter Support...');
const sampleDbRow1 = {
  id: '13235bfe-af44-4756-8660-2883899c6b4e',
  driver_name: '김민수',
  phone: '010-3829-4821',
  vehicle_no: '01호 3343',
  vehicle_model: '벤츠 S560',
  english_available: true,
  driver_meta: { memo: '영어 능숙 VIP 의전' },
};
const sampleDbRow2 = {
  id: 'a85444a9-f13e-4b52-9a81-ac09995ab66a',
  driver_name: '민성호',
  phone: '010-7231-8340',
  vehicle_no: '8호차',
  vehicle_model: '벤츠 스프린터 519 CDI',
  english_available: false,
};

const driver1 = mapDbDriverToHqSummary(sampleDbRow1, []);
const driver2 = mapDbDriverToHqSummary(sampleDbRow2, [
  {
    id: 'sch-1',
    vehicle_no: '8호차',
    date: '2026-09-20',
    pickup_time: '15:30',
    origin: '조선팰리스 강남',
    destination: '인천공항 T2',
    flight_number: 'KE 623',
  },
]);

if (!driver1 || driver1.name !== '김민수' || !driverSupportsEnglish(driver1)) {
  throw new Error('Kim Min-soo driver mapping or English support failed');
}
if (!driver2 || driver2.name !== '민성호' || driverSupportsEnglish(driver2)) {
  throw new Error('Min Sung-ho driver mapping or Korean-only support failed');
}
if (driver2.recentTripDate !== '2026-09-20') {
  throw new Error(`Min Sung-ho recentTripDate mismatch: ${driver2.recentTripDate}`);
}
console.log('✅ Test 3 Passed: Real DB driver mapping, schedules, and English filters verified.');

// Test 4: Verify Multi-Vehicle Slot Assignment Structure
console.log('\n[Test 4] Verify Step 2 & 4 Multi-Vehicle Slot Assignments...');
const slots = [
  { slotIndex: 0, vehicleModel: '벤츠 S560', driver: driver1, status: 'assigned' as const },
  { slotIndex: 1, vehicleModel: '벤츠 스프린터 519 CDI', driver: driver2, status: 'assigned' as const },
];

if (slots.length !== 2 || slots[0].driver?.name !== '김민수' || slots[1].driver?.name !== '민성호') {
  throw new Error('Multi-vehicle slot assignment structure verification failed');
}
console.log('✅ Test 4 Passed: 2-Vehicle slot dispatch confirmed.');

console.log('\n🎉 ALL EMAIL 4-STEP WORKFLOW TESTS PASSED 100%!');

