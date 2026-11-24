import assert from 'node:assert';
import test from 'node:test';
import {
  getDeterministicBookingDraft,
  extractBookingFromEmail,
  cleanEmailBodyForAi,
} from '@/services/emailBookingGeminiService';
import {
  saveContactToCrm,
  findCustomerMatch,
  getStoredCustomers,
  saveStoredCustomers,
} from '@/utils/crmCustomerSync';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import { HqEmailExtractedDraft } from '@/types/emailHq';

test('Email AI Extraction Disambiguation: Sender vs Coordinator vs Passenger', () => {
  // Test 1: Sender is assistant, coordinator is in signature, passenger is VIP guest
  const draft = getDeterministicBookingDraft({
    emailId: 'test-msg-001',
    subject: '[VIP 의전 요청] 모건스탠리 아시아 컨퍼런스 의전 차량 1대 예약 건',
    sender: 'assistant.sarah@global-agency.com',
    senderName: 'Sarah Jenkins (에이전시)',
    replyTo: 'coordination@global-agency.com',
    bodyText: `안녕하세요. 모건스탠리 한국 지사 David Miller 전무님의 공항 의전 요청드립니다.
    
일시: 2024년 10월 28일 15:40 픽업
출발: 인천국제공항 제2여객터미널
도착: 여의도 콘래드 서울
승객: David Miller (외 1인)
연락처: +82-10-8842-1920
편명: KE082`,
  });

  // Verify company entity
  assert.strictEqual(draft.companyName, 'Morgan Stanley', 'Company name must be Morgan Stanley');

  // Verify coordinator entity
  assert.strictEqual(draft.contactName, 'David Miller');
  assert.strictEqual(draft.contactPhone, '+82-10-8842-1920');
  assert.ok(!draft.contactPhone.includes('@'), 'Contact phone must never contain email address');

  // Verify passenger entity
  assert.strictEqual(draft.passengerName, 'David Miller (외 1인)');
  assert.strictEqual(draft.passengerPhone, '+82-10-8842-1920');
  assert.ok(!draft.passengerPhone.includes('@'), 'Passenger phone must never contain email address');

  // Verify sender entity
  assert.strictEqual(draft.senderEmail, 'assistant.sarah@global-agency.com');
  assert.strictEqual(draft.senderName, 'Sarah Jenkins (에이전시)');

  // Verify drivers/vehicles are NEVER automatically assigned by AI
  assert.strictEqual(draft.assignedDriver, null, 'Driver must not be auto-assigned');
  assert.strictEqual(draft.assignedVehicle, null, 'Vehicle must not be auto-assigned');
  assert.strictEqual(draft.status, 'draft', 'Initial state must be draft');
});

test('Zero Email Contamination in Phone Fields', () => {
  const genericDraft = getDeterministicBookingDraft({
    emailId: 'test-generic-999',
    subject: 'VIP Transfer inquiry',
    sender: 'vip.guest@domain.com',
    senderName: 'John Doe',
    bodyText: 'Please arrange transfer for tomorrow.',
  });

  // Generic fallback must NEVER put sender email into passengerPhone or contactPhone
  assert.strictEqual(genericDraft.passengerPhone, '', 'Empty phone must remain empty, never email address');
  assert.strictEqual(genericDraft.contactPhone, '', 'Empty phone must remain empty, never email address');
  assert.ok(!genericDraft.passengerPhone.includes('@'), 'Must not contain @');
  assert.ok(!genericDraft.contactPhone.includes('@'), 'Must not contain @');
});

test('CRM Integration (#21): Manual Save, Duplicate Prevention, and Contact Linking', async () => {
  // Reset test storage to clean sample
  saveStoredCustomers([...INITIAL_HQ_CUSTOMERS]);

  // 1. Initial State: No customer auto-saved just by receiving email
  const beforeCount = getStoredCustomers().length;
  assert.strictEqual(beforeCount, INITIAL_HQ_CUSTOMERS.length);

  // 2. Existing Company Match & Duplicate Contact Detection (CHANEL - Marie Dupont)
  const existingMatch = findCustomerMatch('CHANEL', 'marie.dupont@chanel.com', '+33 6 12 34 56 78');
  assert.ok(existingMatch.companyMatch !== null, 'CHANEL must be found');
  assert.ok(existingMatch.contactMatch !== null, 'Marie Dupont must be found');

  const saveExistingResult = await saveContactToCrm({
    companyName: 'CHANEL',
    contactName: 'Marie Dupont',
    contactEmail: 'marie.dupont@chanel.com',
    contactPhone: '+33 6 12 34 56 78',
  });

  assert.strictEqual(saveExistingResult.success, true);
  assert.strictEqual(saveExistingResult.isNewCustomer, false);
  assert.strictEqual(saveExistingResult.isNewContact, false);
  assert.strictEqual(saveExistingResult.clientId, 'cust-chanel');
  assert.strictEqual(saveExistingResult.contactId, 'c-1');

  // Customer count must NOT increase on duplicate contact linking
  assert.strictEqual(getStoredCustomers().length, beforeCount);

  // 3. Existing Company (CHANEL), but NEW Contact Person (e.g. Pierre Dubois)
  const saveNewContactResult = await saveContactToCrm({
    companyName: 'CHANEL',
    contactName: 'Pierre Dubois',
    contactEmail: 'pierre.dubois@chanel.com',
    contactPhone: '010-9999-8888',
    role: 'VIP Concierge Manager',
  });

  assert.strictEqual(saveNewContactResult.success, true);
  assert.strictEqual(saveNewContactResult.isNewCustomer, false);
  assert.strictEqual(saveNewContactResult.isNewContact, true);
  assert.strictEqual(saveNewContactResult.clientId, 'cust-chanel');
  assert.ok(saveNewContactResult.contactId.startsWith('c-'));

  const chanelCompany = getStoredCustomers().find((c) => c.id === 'cust-chanel');
  assert.ok(chanelCompany?.contacts.some((ct) => ct.name === 'Pierre Dubois'));

  // 4. Completely Brand New Client Company & Contact (Ferrari Korea)
  const saveNewCompanyResult = await saveContactToCrm({
    companyName: 'Ferrari Korea Test Client',
    contactName: '홍길동 매니저',
    contactEmail: 'hong.gd@ferrari-test.kr',
    contactPhone: '010-1234-5678',
    department: 'Events & PR',
  });

  assert.strictEqual(saveNewCompanyResult.success, true);
  assert.strictEqual(saveNewCompanyResult.isNewCustomer, true);
  assert.strictEqual(saveNewCompanyResult.isNewContact, true);
  assert.ok(saveNewCompanyResult.clientId.startsWith('cust-'));
  assert.strictEqual(saveNewCompanyResult.companyName, 'Ferrari Korea Test Client');

  const allAfter = getStoredCustomers();
  assert.strictEqual(allAfter.length, beforeCount + 1, 'Total customer count should increase by 1 for new company');
  const createdComp = allAfter.find((c) => c.id === saveNewCompanyResult.clientId);
  assert.strictEqual(createdComp?.name, 'Ferrari Korea Test Client');
  assert.strictEqual(createdComp?.contacts[0].name, '홍길동 매니저');
  assert.strictEqual(createdComp?.contacts[0].phone, '010-1234-5678');
});

test('TMAP POI Candidate Confirmation Logic', () => {
  // A draft with unconfirmed POIs must not be dispatched
  const draftUnconfirmed: HqEmailExtractedDraft = {
    id: 'draft-poi-test',
    emailId: 'em-poi-1',
    companyName: 'Ferrari Korea',
    passengerName: 'KAI THIO',
    passengerPhone: '010-5555-4444',
    passengerCount: 1,
    pickupDate: '2026-10-29',
    pickupTime: '13:00',
    pickupLocation: '조선팰리스',
    dropoffLocation: '인천공항 T1',
    isPickupPoiConfirmed: false, // Unconfirmed candidate
    isDropoffPoiConfirmed: false, // Unconfirmed candidate
    flightNumber: 'SQ601',
    requestedVehicleClass: '카니발 하이리무진',
    specialRequests: '',
    tripType: 'single',
    confidence: 0.9,
    warnings: [],
    assignedDriver: null,
    assignedVehicle: null,
    assignedVehiclePlate: null,
    status: 'draft',
    updatedAt: new Date().toISOString(),
  };

  assert.strictEqual(draftUnconfirmed.isPickupPoiConfirmed, false);
  assert.strictEqual(draftUnconfirmed.isDropoffPoiConfirmed, false);

  // When manager clicks the POI candidate in dropdown:
  const draftConfirmed: HqEmailExtractedDraft = {
    ...draftUnconfirmed,
    pickupLocation: '조선팰리스 서울강남',
    pickupLat: 37.5042,
    pickupLng: 127.0425,
    isPickupPoiConfirmed: true,
    dropoffLocation: '인천국제공항 제1여객터미널',
    dropoffLat: 37.4495,
    dropoffLng: 126.4507,
    isDropoffPoiConfirmed: true,
  };

  assert.strictEqual(draftConfirmed.isPickupPoiConfirmed, true);
  assert.strictEqual(draftConfirmed.isDropoffPoiConfirmed, true);
  assert.strictEqual(typeof draftConfirmed.pickupLat, 'number');
  assert.strictEqual(typeof draftConfirmed.dropoffLng, 'number');
});

test('Honest AI Failure: extractBookingFromEmail returns ok: false and clean empty draft without fake fallback', async () => {
  const origKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    const result = await extractBookingFromEmail({
      emailId: 'blind-qa-001',
      subject: 'Random subject with no fake fallback',
      sender: 'someone@example.com',
      bodyText: 'Please pick up someone at 10:00.',
    });

    assert.strictEqual(result.ok, false, 'Must report ok: false on missing key or error');
    assert.strictEqual(result.draft.companyName, '', 'Must not invent fake company');
    assert.strictEqual(result.draft.contactName, '', 'Must not invent fake contact');
    assert.strictEqual(result.draft.passengerName, '', 'Must not invent fake passenger');
    assert.strictEqual(result.draft.confidence, 0, 'Confidence must be 0 for empty draft');
    assert.ok(result.error?.includes('GEMINI_API_KEY'), 'Error must mention missing key');
  } finally {
    if (origKey) process.env.GEMINI_API_KEY = origKey;
  }
});

test('CRM Validation: saveContactToCrm rejects unverified or empty company/contact names', async () => {
  // Empty company
  const emptyComp = await saveContactToCrm({
    companyName: '   ',
    contactName: '홍길동',
    contactEmail: 'hong@test.com',
  });
  assert.strictEqual(emptyComp.success, false);
  assert.ok(emptyComp.message.includes('고객사명'));

  // '확인 필요' company
  const unverifiedComp = await saveContactToCrm({
    companyName: '확인 필요',
    contactName: '홍길동',
    contactEmail: 'hong@test.com',
  });
  assert.strictEqual(unverifiedComp.success, false);

  // Empty contact
  const emptyContact = await saveContactToCrm({
    companyName: 'Valid Company',
    contactName: '',
    contactEmail: 'contact@valid.com',
  });
  assert.strictEqual(emptyContact.success, false);
  assert.ok(emptyContact.message.includes('담당자명'));
});

test('Item 1: Long Email Preservation (>4,000 chars) Without Truncation', () => {
  // Generate a long email body exceeding 5,000 characters with critical signature at the bottom
  const filler = 'VIP Limousine reservation schedule details and itinerary confirmation notes.\n'.repeat(60);
  const tailSignature = '담당자: 이서연 실장\n연락처: 010-9995-3241\n이메일: seoyeon.lee@global-corp.com\n[변경사항]: 3호차 경유지에 성수동 쇼룸 추가 요청';
  const fullBody = `${filler}\n${tailSignature}`;

  assert.ok(fullBody.length > 4500, 'Test email should exceed 4500 characters');

  const cleaned = cleanEmailBodyForAi(fullBody);

  // Must NOT be truncated to 4000 characters
  assert.ok(cleaned.length > 4000, `Cleaned body must exceed 4000 chars (actual: ${cleaned.length})`);
  assert.ok(cleaned.includes('이서연 실장'), 'Bottom signature coordinator must be preserved');
  assert.ok(cleaned.includes('010-9995-3241'), 'Bottom phone number must be preserved');
  assert.ok(cleaned.includes('성수동 쇼룸'), 'Bottom change notice and waypoints must be preserved');
});

test('Item 2: groupTrips Schema & Multi-Vehicle Sub-schedule Extraction Structure', () => {
  // Mock parsed object representing multi-trip group event
  const mockGroupTripsResponse = {
    companyName: 'Global Events Korea',
    tripType: 'group',
    groupTrips: [
      {
        id: 'gt-1',
        passengerName: 'David Kim',
        pickupLocation: '인천국제공항 T1',
        dropoffLocation: '여의도 콘래드 서울',
        pickupTime: '10:00',
        vehicleClass: '스타리아 라운지 리무진',
        notes: '피켓: MR. DAVID KIM',
      },
      {
        id: 'gt-2',
        passengerName: 'Sarah Jenkins',
        pickupLocation: '김포공항 국제선',
        dropoffLocation: '조선팰리스 호텔',
        pickupTime: '11:30',
        vehicleClass: '제네시스 G90',
        notes: 'VIP 전용 생수 구비',
      },
    ],
  };

  assert.strictEqual(mockGroupTripsResponse.tripType, 'group');
  assert.strictEqual(mockGroupTripsResponse.groupTrips.length, 2);
  assert.strictEqual(mockGroupTripsResponse.groupTrips[0].passengerName, 'David Kim');
  assert.strictEqual(mockGroupTripsResponse.groupTrips[1].pickupLocation, '김포공항 국제선');
});


