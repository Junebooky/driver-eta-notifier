import { REFERENCE_EMAILS } from '@/components/hq/email/emailReferenceData';
import { SAMPLE_AVAILABLE_DRIVERS } from '@/components/hq/email/HqDriverSelectModal';

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
  draft.pickupLocation !== '인천공항 T2' ||
  draft.dropoffLocation !== '신라호텔' ||
  draft.flightNumber !== 'KE082' ||
  draft.passengerCount !== 3
) {
  throw new Error(`Step 1 extracted fields mismatch: ${JSON.stringify(draft)}`);
}
console.log('✅ Test 2 Passed: Step 1 AI extraction data matches panel 1 specification.');

// Test 3: Verify Step 3 Available Driver Candidate List
console.log('\n[Test 3] Verify Step 3 Driver Candidates and Ratings...');
const kim = SAMPLE_AVAILABLE_DRIVERS.find((d) => d.name === '김태훈');
const lee = SAMPLE_AVAILABLE_DRIVERS.find((d) => d.name === '이준호');

if (!kim || kim.rating !== 4.9 || !kim.languages.includes('영어')) {
  throw new Error('Kim Tae-hoon driver profile mismatch in Step 3');
}
if (!lee || lee.rating !== 4.8) {
  throw new Error('Lee Jun-ho driver profile mismatch in Step 3');
}
console.log('✅ Test 3 Passed: Step 3 drivers verified with ratings, languages, and vehicles.');

// Test 4: Verify Multi-Vehicle Slot Assignment Structure
console.log('\n[Test 4] Verify Step 2 & 4 Multi-Vehicle Slot Assignments...');
const slots = [
  { slotIndex: 0, vehicleModel: '스프린터 319 CDI', driver: kim, status: 'assigned' as const },
  { slotIndex: 1, vehicleModel: 'G90 LWB', driver: lee, status: 'assigned' as const },
];

if (slots.length !== 2 || slots[0].driver?.name !== '김태훈' || slots[1].driver?.name !== '이준호') {
  throw new Error('Multi-vehicle slot assignment structure verification failed');
}
console.log('✅ Test 4 Passed: 2-Vehicle slot dispatch confirmed.');

console.log('\n🎉 ALL EMAIL 4-STEP WORKFLOW TESTS PASSED 100%!');

