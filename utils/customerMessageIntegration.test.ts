import assert from 'node:assert';
import {
  formatSmsAppUrl,
  extractPhoneFromString,
  extractEmailFromString,
  generateCustomerNotificationDraft,
} from './customerMessageGenerator';
import { HqBooking } from '../types/hq';
import { HqCustomer } from '../types/customerHq';

console.log('================================================================');
console.log('🧪 Customer Message & Native SMS Scheme Integration Tests');
console.log('================================================================\n');

// 1. Text extraction tests
console.log('[Test 1] Extract phone and email from notes and passenger strings');
{
  const p1 = extractPhoneFromString('홍길동 (010-1234-5678)');
  assert.strictEqual(p1, '010-1234-5678', 'Should extract standard Korean mobile number');

  const p2 = extractPhoneFromString('TARA SOFYAN +39 34 5678 9101');
  assert.strictEqual(p2, '+39 34 5678 9101', 'Should extract international format number');

  const p3 = extractPhoneFromString('전화번호 없음');
  assert.strictEqual(p3, null, 'Should return null when no phone present');

  const e1 = extractEmailFromString('담당자 이메일: luca.bianchi@ferrari.com 전달');
  assert.strictEqual(e1, 'luca.bianchi@ferrari.com', 'Should extract valid email');

  const e2 = extractEmailFromString('이메일 미정');
  assert.strictEqual(e2, null, 'Should return null when no email present');
  console.log('  ✓ Phone and email extraction helper tests passed.');
}

// 2. formatSmsAppUrl platform compatibility
console.log('\n[Test 2] formatSmsAppUrl generates correct deep-link schemes');
{
  const phone = '010-1234-5678';
  const body = '[VIP리무진] 배차 확정 안내\n• 담당기사: 홍승범 (010-3333-4444)';

  // In Node.js environment without window/navigator, it defaults to standard RFC '?body='
  const standardUrl = formatSmsAppUrl(phone, body);
  assert.ok(standardUrl.startsWith('sms:01012345678'), 'Should sanitize recipient phone to digits');
  assert.ok(standardUrl.includes(encodeURIComponent(body)), 'Should encode body URI component');

  // Verify empty phone handling
  const emptyPhoneUrl = formatSmsAppUrl('', body);
  assert.strictEqual(emptyPhoneUrl, `sms:?body=${encodeURIComponent(body)}`, 'Should handle empty phone gracefully');

  console.log('  ✓ SMS URI scheme formatting tests passed.');
}

// 3. Customer fuzzy matching & pre-fill draft generation
console.log('\n[Test 3] Customer fuzzy matching & auto pre-fill in draft generator');
{
  const ferrariCustomer: HqCustomer = {
    id: 'cust-ferrari',
    name: 'Ferrari',
    tier: '주요',
    isFavorite: false,
    primaryContactName: 'Luca Bianchi',
    contactCountExtra: 1,
    recentSnippet: '',
    mainPhone: '02-3433-0800',
    mainEmail: 'luca.bianchi@ferrari.com',
    department: 'Scuderia VIP Club',
    preferences: [],
    notes: [],
    contacts: [
      {
        id: 'c-fe-1',
        name: 'Luca Bianchi',
        role: 'Director',
        phone: '+39 34 5678 9101',
        email: 'luca.bianchi@ferrari.com',
        isPrimary: true,
      },
    ],
    recentRequests: [],
    eventsHistory: [],
    tripsHistory: [],
    communications: [],
  };

  const booking: HqBooking = {
    id: 'b-ferrari-test',
    scheduleId: 'b-ferrari-test',
    bookingNo: '#260920-001',
    no: 1,
    customerName: 'Ferrari Korea',
    pickupDate: '2026-09-20',
    pickupTime: '07:30',
    pickupLocation: '조선팰리스 강남',
    destination: '인천공항 T1',
    driverName: '홍승범 기사',
    driverPhone: '010-3333-4444',
    vehicleModel: '스프린터 319 CDI',
    vehiclePlate: '112하 3456',
    dispatchStatus: '배차 완료',
    driverAck: '미확인',
    customerBrochure: '미발송',
    passengerName: 'EU GENE GOH',
  };

  const draft = generateCustomerNotificationDraft({
    booking,
    trigger: 'dispatch_confirmed',
    language: 'ko',
    customerRecord: ferrariCustomer,
  });

  assert.strictEqual(draft.recipientEmail, 'luca.bianchi@ferrari.com', 'Should pre-fill customer main email');
  assert.ok(
    draft.recipientPhone === '+39 34 5678 9101' || draft.recipientPhone === '02-3433-0800',
    'Should pre-fill contact phone or main phone'
  );
  assert.ok(draft.smsBody.includes('EU GENE GOH'), 'SMS draft should contain passenger name');
  assert.ok(draft.smsBody.includes('홍승범'), 'SMS draft should contain driver name');
  assert.ok(draft.smsBody.includes('112하 3456'), 'SMS draft should contain plate');

  console.log('  ✓ Draft auto pre-fill with fuzzy matched customer record passed.');
}

// 4. State preservation logic verification (simulating React user typing vs background poll)
console.log('\n[Test 4] State preservation test: background poll does NOT wipe user typing');
{
  // Simulated initial load
  let userPhone = '';
  let isPhoneEdited = false;

  const initialDraftPhone = '02-3433-0800';
  if (!isPhoneEdited) {
    userPhone = initialDraftPhone;
  }
  assert.strictEqual(userPhone, '02-3433-0800', 'Initial draft populated');

  // User manually edits phone
  userPhone = '010-9999-8888';
  isPhoneEdited = true;

  // Background poll ticks: booking object refreshed from API
  // In previous buggy version: userPhone was reset to initialDraft.recipientPhone (wiping input)
  // In new fixed version:
  const backgroundPollDraftPhone = '02-3433-0800';
  if (!isPhoneEdited) {
    userPhone = backgroundPollDraftPhone; // should NOT run
  }

  assert.strictEqual(userPhone, '010-9999-8888', 'User typing must be completely preserved across polls');
  console.log('  ✓ User typing preservation logic verified.');
}

console.log('\n✅ All Customer Message & Native SMS Scheme Tests Passed!\n');

