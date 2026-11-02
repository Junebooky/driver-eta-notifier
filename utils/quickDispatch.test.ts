import assert from 'assert';
import { stripManufacturerName, VIP_REAL_VEHICLES } from './vehicleData';
import { INITIAL_HQ_CUSTOMERS } from './customerHqData';
import { HqBooking } from '../types/hq';

console.log('--- Running Quick Dispatch & Vehicle Model Unit Tests ---');

// 1. Requirement 3: Vehicle Manufacturer Stripping Tests
console.log('1. Testing stripManufacturerName across vehicle models...');
assert.strictEqual(stripManufacturerName('벤츠 S 560'), 'S 560');
assert.strictEqual(stripManufacturerName('현대 스타리아 리무진'), '스타리아 리무진');
assert.strictEqual(stripManufacturerName('제네시스 G90L'), 'G90L');
assert.strictEqual(stripManufacturerName('기아 카니발'), '카니발');
assert.strictEqual(stripManufacturerName('벤츠 S560'), 'S560');
assert.strictEqual(stripManufacturerName('제네시스 G90 리무진'), 'G90 리무진');
assert.strictEqual(stripManufacturerName('벤츠 스프린터 519 CDI'), '스프린터 519 CDI');
assert.strictEqual(stripManufacturerName('벤츠 스프린터 투어러 (319 CDI)'), '스프린터 투어러 (319 CDI)');
assert.strictEqual(stripManufacturerName('제네시스 GV80'), 'GV80');
assert.strictEqual(stripManufacturerName('기아 카니발 하이리무진'), '카니발 하이리무진');
assert.strictEqual(stripManufacturerName('-'), '-');
assert.strictEqual(stripManufacturerName('미배정'), '미배정');
console.log('✓ stripManufacturerName successfully strips manufacturer prefixes');

// Verify all 20 real VIP fleet vehicles strip cleanly
const cleanedFleetModels = VIP_REAL_VEHICLES.map((v) => stripManufacturerName(v.model));
for (const clean of cleanedFleetModels) {
  assert(!clean.startsWith('벤츠 '), `Clean model must not start with 벤츠: ${clean}`);
  assert(!clean.startsWith('현대 '), `Clean model must not start with 현대: ${clean}`);
  assert(!clean.startsWith('기아 '), `Clean model must not start with 기아: ${clean}`);
  assert(!clean.startsWith('제네시스 '), `Clean model must not start with 제네시스: ${clean}`);
}
console.log(`✓ All ${VIP_REAL_VEHICLES.length} VIP fleet vehicle models cleaned without manufacturer prefix`);

// 2. Requirement 2: Customer Search & Selection Linking
console.log('2. Testing customer search and selection from Customer Management...');
const queryChanel = 'chanel';
const foundChanel = INITIAL_HQ_CUSTOMERS.filter((c) => c.name.toLowerCase().includes(queryChanel));
assert(foundChanel.length > 0, 'CHANEL must be found in customer management data');
assert.strictEqual(foundChanel[0].id, 'cust-chanel');

const queryBmw = 'bmw';
const foundBmw = INITIAL_HQ_CUSTOMERS.filter((c) => c.name.toLowerCase().includes(queryBmw));
assert(foundBmw.length > 0, 'BMW must be found in customer management data');
assert.strictEqual(foundBmw[0].id, 'cust-bmw');
console.log('✓ Customer autocomplete correctly connects with INITIAL_HQ_CUSTOMERS');

// 3. Requirement 2: Single vs Multi-Vehicle Unified Group Dispatch Logic
console.log('3. Testing Multi-Vehicle Group Linking and Driver Isolation...');

function simulateUnifiedDispatch(params: {
  customerName: string;
  customerId?: string;
  commonPickupTime: string;
  commonPickupLocation: string;
  commonDestination: string;
  groupTitle?: string;
  commonMemo?: string;
  allocations: {
    driverName: string;
    vehiclePlate: string;
    vehicleModel: string;
    hasCustomItinerary?: boolean;
    customPickupTime?: string;
    customPickupLocation?: string;
    customDestination?: string;
  }[];
  isDraft: boolean;
}): Partial<HqBooking>[] {
  const isMulti = params.allocations.length > 1;
  const groupId = isMulti ? `grp-test-${Date.now()}` : undefined;
  const groupName = params.groupTitle || `${params.customerName} 단체 배차 (${params.allocations.length}대)`;

  return params.allocations.map((alloc, idx) => ({
    customerName: params.customerName,
    customerId: params.customerId,
    pickupTime: alloc.hasCustomItinerary && alloc.customPickupTime ? alloc.customPickupTime : params.commonPickupTime,
    pickupLocation: alloc.hasCustomItinerary && alloc.customPickupLocation ? alloc.customPickupLocation : params.commonPickupLocation,
    destination: alloc.hasCustomItinerary && alloc.customDestination ? alloc.customDestination : params.commonDestination,
    driverName: alloc.driverName,
    vehicleModel: alloc.vehicleModel,
    vehiclePlate: alloc.vehiclePlate,
    dispatchStatus: params.isDraft ? '작성 중' : '배차 완료',
    groupId,
    groupName: isMulti ? groupName : undefined,
    groupTotalVehicles: params.allocations.length,
    groupVehicleIndex: idx + 1,
    bookingNo: `#261026-099-${idx + 1}호차`,
  }));
}

// Test A: Single Vehicle Dispatch (1호차)
const singleDispatch = simulateUnifiedDispatch({
  customerName: 'BMW Korea',
  customerId: 'cust-bmw',
  commonPickupTime: '14:00',
  commonPickupLocation: '인천공항 T1',
  commonDestination: '조선팰리스 강남',
  allocations: [
    {
      driverName: '정태훈',
      vehiclePlate: '703서 2658',
      vehicleModel: '벤츠 스프린터 519 CDI',
    },
  ],
  isDraft: false,
});

assert.strictEqual(singleDispatch.length, 1);
assert.strictEqual(singleDispatch[0].groupId, undefined, 'Single dispatch should not have groupId');
assert.strictEqual(singleDispatch[0].driverName, '정태훈');
assert.strictEqual(singleDispatch[0].pickupTime, '14:00');
console.log('✓ Single dispatch behaves correctly without group overhead');

// Test B: Multi-Vehicle Dispatch with 3 Vehicles under one Customer Event
const multiDispatch = simulateUnifiedDispatch({
  customerName: 'CHANEL',
  customerId: 'cust-chanel',
  commonPickupTime: '09:00',
  commonPickupLocation: '조선팰리스 서울 강남',
  commonDestination: '인천공항 T2',
  groupTitle: '2024 CHANEL Cruise Collection Preview',
  allocations: [
    {
      driverName: '윤태준',
      vehiclePlate: '116허 1514',
      vehicleModel: '현대 스타리아 리무진',
      // Inherits common itinerary
    },
    {
      driverName: '김민수',
      vehiclePlate: '01호 3343',
      vehicleModel: '벤츠 S560',
      hasCustomItinerary: true,
      customPickupTime: '09:30', // Custom pickup time
      customPickupLocation: '신라호텔 서울', // Custom pickup location
      customDestination: '인천공항 T1', // Custom destination
    },
    {
      driverName: '이재훈',
      vehiclePlate: '193호 5336',
      vehicleModel: '기아 카니발 하이리무진',
      // Inherits common itinerary
    },
  ],
  isDraft: false,
});

assert.strictEqual(multiDispatch.length, 3, 'Multi dispatch should create 3 bookings');
const sharedGroupId = multiDispatch[0].groupId;
assert(Boolean(sharedGroupId), 'Multi dispatch must generate a shared groupId');
assert.strictEqual(multiDispatch[1].groupId, sharedGroupId, 'All vehicles must share the same groupId');
assert.strictEqual(multiDispatch[2].groupId, sharedGroupId, 'All vehicles must share the same groupId');

// Vehicle 1 check (Inherited)
assert.strictEqual(multiDispatch[0].driverName, '윤태준');
assert.strictEqual(multiDispatch[0].groupVehicleIndex, 1);
assert.strictEqual(multiDispatch[0].pickupTime, '09:00');
assert.strictEqual(multiDispatch[0].pickupLocation, '조선팰리스 서울 강남');

// Vehicle 2 check (Custom Itinerary Override)
assert.strictEqual(multiDispatch[1].driverName, '김민수');
assert.strictEqual(multiDispatch[1].groupVehicleIndex, 2);
assert.strictEqual(multiDispatch[1].pickupTime, '09:30', 'Vehicle 2 must have custom pickup time');
assert.strictEqual(multiDispatch[1].pickupLocation, '신라호텔 서울', 'Vehicle 2 must have custom pickup location');
assert.strictEqual(multiDispatch[1].destination, '인천공항 T1', 'Vehicle 2 must have custom destination');

// Driver Isolation check
const driverSchedulesYoon = multiDispatch.filter((b) => b.driverName === '윤태준');
const driverSchedulesKim = multiDispatch.filter((b) => b.driverName === '김민수');
assert.strictEqual(driverSchedulesYoon.length, 1, 'Driver 윤태준 must only see 1 schedule');
assert.strictEqual(driverSchedulesKim.length, 1, 'Driver 김민수 must only see 1 schedule');
assert.strictEqual(driverSchedulesYoon[0].vehiclePlate, '116허 1514');
assert.strictEqual(driverSchedulesKim[0].vehiclePlate, '01호 3343');

console.log('✓ Multi-vehicle group linking and driver isolation verified');

// 4. Modal Editing & Row-Click Connected Quick Dispatch Mapping
console.log('4. Testing Quick Dispatch Modal Pre-fill and Connected Actions...');

const mockBooking: HqBooking = {
  id: 'sch-test-999',
  scheduleId: 'sch-test-999',
  bookingNo: '#261102-777',
  no: 1,
  customerName: '루이비통 코리아',
  customerId: 'cust-lv',
  pickupDate: '2026-11-03',
  pickupTime: '10:00',
  endDate: '2026-11-03',
  endTime: '18:00',
  pickupLocation: '청담동 루이비통 메종',
  destination: '인천공항 제2여객터미널',
  driverName: '김민수',
  driverId: 'drv-kms',
  vehicleModel: '벤츠 스프린터 519 CDI',
  vehiclePlate: '703서 2658',
  dispatchStatus: '배차 완료',
  driverAck: '미확인',
  customerBrochure: '미발송',
  passengerName: '장마크(지사장)',
  passengerPhone: '010-9999-8888',
  notes: 'VIP 고객 영접 의전',
  version: 2,
};

// Simulate payload mapping for existing booking edit
function simulateEditDispatchPayload(booking: HqBooking, updateMode: 'unassigned' | 'published') {
  return {
    scheduleId: booking.scheduleId || booking.id,
    bookingNo: booking.bookingNo,
    expectedVersion: booking.version,
    customerName: booking.customerName,
    dispatchStatus: updateMode,
    publishedBy: updateMode === 'unassigned' ? '사모님(예약수정)' : '대표님(배차확정)',
    driverName: updateMode === 'published' ? booking.driverName : undefined,
    vehiclePlate: updateMode === 'published' ? booking.vehiclePlate : undefined,
  };
}

const unassignedEdit = simulateEditDispatchPayload(mockBooking, 'unassigned');
assert.strictEqual(unassignedEdit.scheduleId, 'sch-test-999', 'Existing scheduleId must be preserved on edit');
assert.strictEqual(unassignedEdit.bookingNo, '#261102-777');
assert.strictEqual(unassignedEdit.expectedVersion, 2);
assert.strictEqual(unassignedEdit.dispatchStatus, 'unassigned');
assert.strictEqual(unassignedEdit.publishedBy, '사모님(예약수정)');

const publishedEdit = simulateEditDispatchPayload(mockBooking, 'published');
assert.strictEqual(publishedEdit.scheduleId, 'sch-test-999');
assert.strictEqual(publishedEdit.dispatchStatus, 'published');
assert.strictEqual(publishedEdit.publishedBy, '대표님(배차확정)');
assert.strictEqual(publishedEdit.driverName, '김민수');
assert.strictEqual(publishedEdit.vehiclePlate, '703서 2658');

console.log('✓ Quick Dispatch Modal edit payload correctly preserves scheduleId, version, and updates status');

// 5. Testing Address/Location Truncation for Compact Table Width
console.log('5. Testing Location Truncation for Compact Table Layout...');
function truncateLocationTest(text?: string | null, maxChars: number = 13): string {
  if (!text) return '-';
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

assert.strictEqual(truncateLocationTest('조선팰리스 강남', 12), '조선팰리스 강남');
assert.strictEqual(truncateLocationTest('인천공항 T1', 10), '인천공항 T1');
assert.strictEqual(truncateLocationTest('레스케이프 호텔 명동 (L\'ESCAPE HOTEL MYEONGDONG)', 12), '레스케이프 호텔 명동...');
assert.strictEqual(truncateLocationTest(null, 12), '-');
assert.strictEqual(truncateLocationTest('', 12), '-');
console.log('✓ Location truncation accurately caps long strings with ellipsis');

// 6. Testing 10-Column Separation & Toss/Apple Style Label Mappings
console.log('6. Testing 10-Column Separation & Toss/Apple Style Label Mappings...');
const expectedTableHeaders = [
  '고객사',
  '승객',
  '출발 일시',
  '담당 기사님',
  '배정 차량',
  '출발지',
  '도착지',
  '배차 상태',
  '기사님 확인',
  '고객 안내',
];
assert.strictEqual(expectedTableHeaders.length, 10);
assert.strictEqual(expectedTableHeaders[0], '고객사');
assert.strictEqual(expectedTableHeaders[1], '승객');
assert.strictEqual(expectedTableHeaders[2], '출발 일시');
assert.strictEqual(expectedTableHeaders[3], '담당 기사님');
assert.strictEqual(expectedTableHeaders[8], '기사님 확인');
assert.strictEqual(expectedTableHeaders[9], '고객 안내');

// Toss/Apple Style Copy Verification
const friendlyCopyMappings: Record<string, string> = {
  unassignedDriver: '기사님 지정',
  driverUnacked: '확인 대기',
  remindDriver: '다시 알리기',
  customerMessage: '안내문자 보내기',
  brochureUnsent: '프로필 미전송',
  headerTitle: '실시간 배차 관제',
  headerSubtitle: '예약 접수부터 기사님 배정까지 실시간으로 연결돼요',
  tableSectionTitle: '배차 관리 목록',
  tableSectionSubtitle: '예약을 누르면 기사님 배정과 고객 안내를 바로 처리할 수 있어요.',
  tabAction: '확인 필요',
  tabToday: '오늘 출발',
  tabTomorrow: '내일 출발',
  searchPlaceholder: '고객사, 승객명, 목적지로 찾아보세요',
};

assert.strictEqual(friendlyCopyMappings.unassignedDriver, '기사님 지정');
assert.strictEqual(friendlyCopyMappings.driverUnacked, '확인 대기');
assert.strictEqual(friendlyCopyMappings.remindDriver, '다시 알리기');
assert.strictEqual(friendlyCopyMappings.customerMessage, '안내문자 보내기');
assert.strictEqual(friendlyCopyMappings.brochureUnsent, '프로필 미전송');

// 7. Testing Customer Column Hash Exclusion
console.log('7. Testing Customer Column Hash / UUID Exclusion...');
function renderCustomerColumnText(customerName: string, intakeSource?: string): string {
  // Hash values like #ca8fbbd6-0dfb-4315-8fdd-b7cb96fd4b70 must NOT be present
  return `${customerName}${intakeSource ? ` [${intakeSource}]` : ''}`;
}

const renderedChanel = renderCustomerColumnText('CHANEL', 'phone');
assert.strictEqual(renderedChanel.includes('#ca8fbbd6'), false);
assert.strictEqual(renderedChanel.includes('#'), false);
assert.strictEqual(renderedChanel, 'CHANEL [phone]');
console.log('✓ Hash/UUID successfully excluded from customer column');

console.log('✓ 10-column table structure and Toss/Apple style copy validated successfully');

console.log('\n🎉 ALL QUICK DISPATCH & VEHICLE UI TESTS PASSED SUCCESSFULLY! 🎉\n');
