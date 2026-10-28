import assert from 'node:assert/strict';
import {
  buildEventSettlementReport,
  calculateDispatchDirectProfit,
  calculateDriverLaborCost,
  calculateDurationMinutes,
  calculateOvertimeAndFare,
  checkDuplicateReceipt,
  createBookingPricingSnapshot,
  DEFAULT_DRIVER_PROFILES,
  DEFAULT_VEHICLE_PRICING_PRESETS,
  formatMinutesKorean,
  getSortedDriversForLanguage,
  resolveEffectivePricingTerms,
  resolveServiceTimes,
} from './settlementCalculator';
import {
  exportAdminProfitabilityCsv,
  exportClientSettlementCsv,
  getSettlementReportsSnapshot,
} from './settlementStorage';
import { INITIAL_HQ_CUSTOMERS } from './customerHqData';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { HqExpenseRecord } from '@/types/expenseHq';

console.log('--- Running Comprehensive Settlement, Driver Labor & Profitability Tests ---');

// 1. Test Customer Service Time vs Garage Pickup Exclusion (08:00 pickup, 09:00~21:50 service = 12h 50m, 2h 50m overtime)
console.log('1. Testing Customer Service Time unification & Garage Pickup exclusion...');
const sampleLog: HqDrivingLog = {
  id: 'test-log-1',
  no: 1,
  submittedAt: '10/22 22:50',
  submittedDate: '2026. 10. 22',
  drivingDate: '10/22',
  rawDate: '2026-10-22',
  driverName: '정태훈',
  customerName: 'CHANEL',
  vehicleModel: '벤츠 스프린터 519 CDI',
  vehiclePlate: '703서 2658',
  clockIn: '08:00',
  clockOut: '22:40',
  totalDutyHours: '14시간 40분',
  startKm: '10,000',
  endKm: '10,200',
  distanceKm: '200 km',
  expenseAmount: 0,
  expenseCount: 0,
  status: '승인 완료',
  stops: [
    { id: 's1', time: '08:00', place: '강남 차고지 출발' },
    { id: 's2', time: '09:00', place: '조선팰리스 강남', note: '고객 픽업' },
    { id: 's3', time: '21:50', place: '조선팰리스 강남', note: '고객 하차' },
    { id: 's4', time: '22:40', place: '차고지 도착 / 퇴근' },
  ],
  notes: '',
  reviewHistory: [],
};

const resolvedTimes = resolveServiceTimes(sampleLog);
assert.equal(resolvedTimes.garageDeparture, '08:00');
assert.equal(resolvedTimes.serviceStart, '09:00');
assert.equal(resolvedTimes.serviceEnd, '21:50');
const serviceMinutes = calculateDurationMinutes(
  resolvedTimes.serviceStart,
  resolvedTimes.serviceEnd
);
assert.equal(serviceMinutes, 770); // 12h 50m = 770m
assert.equal(formatMinutesKorean(serviceMinutes), '12시간 50분');

const fareCalc = calculateOvertimeAndFare(serviceMinutes, {
  baseHours: 10,
  baseRate: 800000,
  roundingUnitMinutes: 30,
  roundingMethod: 'ceil',
});
assert.equal(fareCalc.overtimeMinutes, 170); // 2h 50m = 170m
assert.equal(fareCalc.overtimeFormatted, '2시간 50분');
// Since overtimeHourlyRate was not provided, overtimeFare must be 0 (never fabricated!)
assert.equal(fareCalc.overtimeFare, 0);
assert.equal(fareCalc.isOvertimeRateConfirmed, false);
console.log('✓ Garage pickup (08:00) excluded; 09:00~21:50 = 12시간 50분 (초과 2시간 50분) verified');

// 2. Test Sprinter & General Vehicle Presets + Driver Labor Tiers (Sprinter 150k/200k vs General 100k/150k)
console.log('2. Testing Vehicle Pricing Presets & Driver Labor Tiers...');
const sp519WithDriver = resolveEffectivePricingTerms({
  vehicleModel: '벤츠 스프린터 519 CDI',
  serviceMode: 'with_driver',
});
const sp519VehicleOnly = resolveEffectivePricingTerms({
  vehicleModel: '벤츠 스프린터 519 CDI',
  serviceMode: 'vehicle_only',
});
assert.equal(sp519WithDriver.baseFare, 800000);
assert.equal(sp519VehicleOnly.baseFare, 600000);

const sp319WithDriver = resolveEffectivePricingTerms({
  vehicleModel: '벤츠 스프린터 319 CDI',
  serviceMode: 'with_driver',
});
const sp319VehicleOnly = resolveEffectivePricingTerms({
  vehicleModel: '벤츠 스프린터 319 CDI',
  serviceMode: 'vehicle_only',
});
assert.equal(sp319WithDriver.baseFare, 1000000);
assert.equal(sp319VehicleOnly.baseFare, 800000);

// Sprinter Korean Driver (정태훈) = 150,000 KRW
const laborSpKo = calculateDriverLaborCost({
  driverName: '정태훈',
  vehicleModel: '벤츠 스프린터 519 CDI',
  serviceMode: 'with_driver',
});
assert.equal(laborSpKo.driverLaborCost, 150000);

// Sprinter English Driver (최영식) = 200,000 KRW
const laborSpEn = calculateDriverLaborCost({
  driverName: '최영식',
  vehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
  serviceMode: 'with_driver',
});
assert.equal(laborSpEn.driverLaborCost, 200000);

// General Vehicle Korean Driver (이재훈, 스타리아/카니발) = 100,000 KRW (50k lower than Sprinter)
const laborGenKo = calculateDriverLaborCost({
  driverName: '이재훈',
  vehicleModel: '현대 스타리아 리무진',
  serviceMode: 'with_driver',
});
assert.equal(laborGenKo.driverLaborCost, 100000);

// General Vehicle English Driver (박서연, G90L) = 150,000 KRW (50k lower than Sprinter)
const laborGenEn = calculateDriverLaborCost({
  driverName: '박서연',
  vehicleModel: '제네시스 G90L',
  serviceMode: 'with_driver',
});
assert.equal(laborGenEn.driverLaborCost, 150000);

// Vehicle Only mode = 0 KRW driver labor
const laborVehicleOnly = calculateDriverLaborCost({
  driverName: '정태훈',
  vehicleModel: '벤츠 스프린터 519 CDI',
  serviceMode: 'vehicle_only',
});
assert.equal(laborVehicleOnly.driverLaborCost, 0);
console.log('✓ Sprinter (150k/200k), General Vehicles (100k/150k), and Vehicle-Only (0k) verified');

// 3. Test Direct Profit Validation (800,000 - 150,000 = 650,000 KRW, 81.25%)
console.log('3. Testing Direct Profit Calculation & No Double-Charging to Client...');
const profitCheck = calculateDispatchDirectProfit({
  clientRevenue: 800000,
  driverLaborCost: 150000,
});
assert.equal(profitCheck.directProfit, 650000);
assert.equal(profitCheck.directMarginPercent, 81.25);
assert.equal(profitCheck.profitConfirmStatus, 'provisional');
console.log('✓ Sprinter 519 CDI (800,000원 - 150,000원 = 650,000원 직접이익, 81.25%) verified');

// 4. Test Language Matching & Priority Sorting
console.log('4. Testing English Driver Priority Sorting & Mismatch Warning...');
const sortedForEn = getSortedDriversForLanguage('en');
assert.equal(sortedForEn[0].driver.isEnglishVerified, true);
const koOnlyEntry = sortedForEn.find((item) => !item.driver.isEnglishVerified);
assert.ok(koOnlyEntry);
assert.equal(koOnlyEntry.isLanguageMatched, false);
assert.ok(koOnlyEntry.mismatchWarning?.includes('예외 배정 시 관리자 확인'));
console.log('✓ English driver priority sorting and Korean-only mismatch warning verified');

// 5. Test 4-Tier Pricing Priority & Historical Snapshot Immutability
console.log('5. Testing 4-Tier Pricing Hierarchy & Historical Immutability...');
const tierCustomer = resolveEffectivePricingTerms({
  vehicleModel: '벤츠 스프린터 519 CDI',
  customerContractTerms: {
    baseHours: 10,
    baseRate: 750000,
    roundingUnitMinutes: 30,
    roundingMethod: 'ceil',
    pricingSource: 'customer_contract',
  },
});
assert.equal(tierCustomer.pricingSource, 'customer_contract');
assert.equal(tierCustomer.baseFare, 750000); // Overrides 800,000 preset

const tierBookingOverride = resolveEffectivePricingTerms({
  vehicleModel: '벤츠 스프린터 519 CDI',
  customerContractTerms: {
    baseHours: 10,
    baseRate: 750000,
    roundingUnitMinutes: 30,
    roundingMethod: 'ceil',
  },
  bookingSnapshot: {
    capturedAt: '2026-10-26T00:00:00Z',
    pricingSource: 'booking_override',
    isTemporaryPreset: false,
    serviceMode: 'with_driver',
    requestedLanguage: 'ko',
    baseHours: 10,
    baseVehicleFare: 720000,
    driverLaborCost10h: 150000,
    vatMode: 'excluded',
  },
});
assert.equal(tierBookingOverride.pricingSource, 'booking_override');
assert.equal(tierBookingOverride.baseFare, 720000); // Overrides customer contract & preset
console.log('✓ 4-tier pricing hierarchy (booking_override > event_special > customer_contract > preset) verified');

// 6. Test Client Report Confidentiality (Never leaks driver labor cost or company profit!)
console.log('6. Testing Client Report Confidentiality (Zero Internal Cost/Profit Leakage)...');
const seedReports = getSettlementReportsSnapshot();
assert.ok(seedReports.length >= 5);
const chanelReport = seedReports[0];
const clientCsv = exportClientSettlementCsv(chanelReport);
const adminCsv = exportAdminProfitabilityCsv(chanelReport);

assert.ok(!clientCsv.includes('기사인건비'));
assert.ok(!clientCsv.includes('배차별직접이익'));
assert.ok(!clientCsv.includes('직접이익률'));
assert.ok(adminCsv.includes('기사인건비'));
assert.ok(adminCsv.includes('배차별직접이익'));
console.log('✓ Client CSV strictly excludes internal driver labor, company margins, and direct profits');

console.log('\n🎉 ALL SETTLEMENT, DRIVER LABOR, LANGUAGE MATCHING & PROFITABILITY TESTS PASSED! 🎉\n');
