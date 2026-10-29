import assert from 'node:assert';
import test from 'node:test';
import { getDeterministicBookingDraft } from '@/services/emailBookingGeminiService';
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

test('CRM Integration (#21): Manual Save, Duplicate Prevention, and Contact Linking', () => {
  // Reset test storage to clean sample
  saveStoredCustomers([...INITIAL_HQ_CUSTOMERS]);

  // 1. Initial State: No customer auto-saved just by receiving email
  const beforeCount = getStoredCustomers().length;
  assert.strictEqual(beforeCount, INITIAL_HQ_CUSTOMERS.length);

  // 2. Existing Company Match & Duplicate Contact Detection (CHANEL - Marie Dupont)
  const existingMatch = findCustomerMatch('CHANEL', 'marie.dupont@chanel.com', '+33 6 12 34 56 78');
  assert.ok(existingMatch.companyMatch !== null, 'CHANEL must be found');
  assert.ok(existingMatch.contactMatch !== null, 'Marie Dupont must be found');

  const saveExistingResult = saveContactToCrm({
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
  const saveNewContactResult = saveContactToCrm({
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
  const saveNewCompanyResult = saveContactToCrm({
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
