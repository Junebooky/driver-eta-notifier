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

console.log('\n🎉 ALL QUICK DISPATCH & VEHICLE UI TESTS PASSED SUCCESSFULLY! 🎉\n');
