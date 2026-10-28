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
  getVehiclePresetsSnapshot,
  reassignBookingVehicleOrDriver,
  resetDemoPipelineData,
  runDemoPipelineScenario,
  saveVehiclePresets,
  syncSettlementReportById,
  updateSettlementReportContractTerms,
  updateSettlementReportStatus,
  upsertEventSettlementFromBookings,
  upsertHqCustomer,
} from './settlementStorage';
import {
  getHqExpenses,
  submitDriverExpensesToHq,
  updateHqExpenseRecord,
  updateHqExpenseStatus,
} from './expenseHqStorage';
import {
  getHqDrivingLogs,
  submitDriverLogToHq,
  updateHqDrivingLog,
} from './drivingLogHqStorage';
import { INITIAL_HQ_CUSTOMERS } from './customerHqData';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { HqExpenseRecord } from '@/types/expenseHq';
import { HqBooking } from '@/types/hq';

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

// ============================================================================
// 7. E2E PIPELINE SCENARIO A: 단일 차량 기본 의전 정산 (Sprinter 519 CDI)
// ============================================================================
console.log('\n7. Testing E2E Pipeline Scenario A (Single Vehicle + Garage Exclusion + Pass-Through vs Company Direct Expense)...');
resetDemoPipelineData();
const resA = runDemoPipelineScenario('A');
const repA = resA.reports.find((r) => r.id === 'rep-demo-scenario-a');
assert.ok(repA, 'Scenario A report must exist');
assert.equal(repA.vehicles.length, 1);

const vehA = repA.vehicles[0];
// Garage departure 08:00 and return 20:00 excluded; service time 09:00~19:00 = 600 min (10시간), overtime 0
assert.equal(vehA.garageDepartureTime, '08:00');
assert.equal(vehA.customerServiceStart, '09:00');
assert.equal(vehA.customerServiceEnd, '19:00');
assert.equal(vehA.garageArrivalTime, '20:00');
assert.equal(vehA.isServiceTimeVerified, true);
assert.equal(vehA.customerServiceMinutes, 600);
assert.equal(vehA.overtimeMinutes, 0);
assert.equal(vehA.baseFare, 800000);
assert.equal(vehA.overtimeFare, 0);

// Expenses: 15,000 parking (approved, client billable) + 12,000 meal (approved, company direct)
assert.equal(repA.totalApprovedExpenses, 15000);
assert.equal(repA.supplyAmount, 815000); // 800,000 + 15,000
assert.equal(repA.totalDriverLaborCost, 150000); // Korean Sprinter driver labor (never added to client supplyAmount!)
assert.equal(repA.totalReimbursableExpenseCost, 15000); // Pass-through cost outflow recorded!
assert.equal(repA.totalCompanyAbsorbedExpenseCost, 12000); // Meal absorbed by company!
assert.equal(repA.totalVehicleDirectCost, 27000); // 15,000 + 12,000
assert.equal(repA.totalDirectProfit, 638000); // 815,000 - 150,000 - 27,000 = 638,000 (no profit inflation from pass-through receipt!)
console.log('✓ Scenario A verified: Client ₩815,000 / Labor ₩150,000 / Direct Cost ₩27,000 (Reimbursable ₩15k + Meal ₩12k) / Profit ₩638,000');

// ============================================================================
// 8. E2E PIPELINE SCENARIO B: 복수 차량(3대) + 초과시간 + 대행사 발주 + 영수증 상태별 분리
// ============================================================================
console.log('\n8. Testing E2E Pipeline Scenario B (3 Vehicles + Overtime + Ordering Agency + Receipt States)...');
const resB = runDemoPipelineScenario('B');
const repB = resB.reports.find((r) => r.id === 'rep-demo-scenario-b');
assert.ok(repB, 'Scenario B report must exist');
assert.equal(repB.orderingAgency, '제일기획 (Cheil Worldwide)');
assert.equal(repB.billingTarget, 'ordering_agency');
assert.equal(repB.vehicles.length, 3);

// Vehicle 1: Sprinter 519 CDI (800,000), Korean driver (150,000), 09:00~21:20 (12h 20m -> 2h 20m overtime -> 2.5h ceil * 80,000 = 200,000)
const vB1 = repB.vehicles[0];
assert.equal(vB1.baseFare, 800000);
assert.equal(vB1.customerServiceMinutes, 740); // 12h 20m
assert.equal(vB1.overtimeMinutes, 140); // 2h 20m
assert.equal(vB1.billedOvertimeHours, 2.5);
assert.equal(vB1.overtimeFare, 200000);
assert.equal(vB1.driverLaborCost, 150000);
assert.equal(vB1.approvedExpensesTotal, 18000); // 18k toll approved; 9.5k rejected excluded!
assert.equal(vB1.rejectedExpensesTotal, 9500);

// Vehicle 2: Sprinter 319 CDI (1,000,000), English driver (200,000), 09:30~19:30 (10h -> 0 overtime)
const vB2 = repB.vehicles[1];
assert.equal(vB2.baseFare, 1000000);
assert.equal(vB2.customerServiceMinutes, 600);
assert.equal(vB2.overtimeMinutes, 0);
assert.equal(vB2.overtimeFare, 0);
assert.equal(vB2.driverLaborCost, 200000);
assert.equal(vB2.approvedExpensesTotal, 24000); // 24k airport parking approved

// Vehicle 3: S 560 (650,000), General English driver (150,000 - 50k lower than Sprinter), 09:00~20:00 (11h -> 1h overtime = 80,000)
const vB3 = repB.vehicles[2];
assert.equal(vB3.baseFare, 650000);
assert.equal(vB3.customerServiceMinutes, 660);
assert.equal(vB3.overtimeMinutes, 60);
assert.equal(vB3.overtimeFare, 80000);
assert.equal(vB3.driverLaborCost, 150000);
assert.equal(vB3.approvedExpensesTotal, 0); // 30k valet is pending ('검수 대기') -> excluded from billing!
assert.equal(vB3.pendingExpensesTotal, 30000);

assert.equal(repB.totalBaseFare, 2450000); // 800k + 1,000k + 650k preserved!
assert.equal(repB.totalOvertimeFare, 280000); // 200k + 0 + 80k
assert.equal(repB.totalApprovedExpenses, 42000); // 18k + 24k
assert.equal(repB.totalPendingExpenses, 30000);
assert.equal(repB.supplyAmount, 2772000);
assert.equal(repB.totalDriverLaborCost, 500000); // 150k + 200k + 150k
console.log('✓ Scenario B verified: Base ₩2,450,000 / Overtime ₩280,000 / Approved Exp ₩42,000 / Supply ₩2,772,000 / Driver Labor ₩500,000');

// ============================================================================
// 9. E2E PIPELINE SCENARIO C: 수정 및 자동 재계산 (운행일지 시간 수정 / 영수증 수정 / 배차 차량·기사 변경)
// ============================================================================
console.log('\n9. Testing E2E Pipeline Scenario C (Live Edits & Automatic Recalculation)...');
// C-1 & C-2 via runDemoPipelineScenario('C')
const resC = runDemoPipelineScenario('C');
const repB_afterC1 = resC.reports.find((r) => r.id === 'rep-demo-scenario-b')!;
// 1호차 end time changed from 21:20 to 22:00 -> 13h total, 3.0h overtime * 80,000 = 240,000 (+40,000)
assert.equal(repB_afterC1.vehicles[0].customerServiceEnd, '22:00');
assert.equal(repB_afterC1.vehicles[0].overtimeMinutes, 180);
assert.equal(repB_afterC1.vehicles[0].overtimeFare, 240000);
assert.equal(repB_afterC1.totalOvertimeFare, 320000); // 240k + 0 + 80k
assert.equal(repB_afterC1.supplyAmount, 2812000); // 2,450,000 + 320,000 + 42,000

const repA_afterC2 = resC.reports.find((r) => r.id === 'rep-demo-scenario-a')!;
// Parking receipt changed from 15,000 to 20,000 -> supplyAmount = 820,000, reimbursable = 20,000, directProfit = 638,000
assert.equal(repA_afterC2.totalApprovedExpenses, 20000);
assert.equal(repA_afterC2.supplyAmount, 820000);
assert.equal(repA_afterC2.totalDirectProfit, 638000);

// Toggle parking receipt to company-absorbed (billableToCustomer = false)
updateHqExpenseRecord('exp-demo-a-parking', { billableToCustomer: false });
const repA_afterToggle = syncSettlementReportById('rep-demo-scenario-a')!;
assert.equal(repA_afterToggle.totalApprovedExpenses, 0);
assert.equal(repA_afterToggle.supplyAmount, 800000);
assert.equal(repA_afterToggle.totalCompanyAbsorbedExpenseCost, 32000); // 12k meal + 20k parking
assert.equal(repA_afterToggle.totalDirectProfit, 618000); // 800,000 - 150,000 - 32,000

// C-3: Reassign Scenario A vehicle/driver from Sprinter 519 CDI (정태훈, Ko 150k) -> Sprinter 319 CDI (최영식, En 200k)
const repA_afterReassign = reassignBookingVehicleOrDriver({
  reportId: 'rep-demo-scenario-a',
  bookingId: 'b-demo-a-1',
  newVehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
  newVehiclePlate: '125호 9982',
  newDriverName: '최영식',
  newRequestedLanguage: 'en',
})!;
assert.equal(repA_afterReassign.vehicles[0].baseFare, 1000000);
assert.equal(repA_afterReassign.vehicles[0].driverLaborCost, 200000);
assert.equal(repA_afterReassign.supplyAmount, 1000000);
assert.equal(repA_afterReassign.totalDirectProfit, 768000); // 1,000,000 - 200,000 - 32,000
console.log('✓ Scenario C verified: C-1 (End time 21:20->22:00), C-2 (Receipt 15k->20k & billable toggle), C-3 (519->319 & Driver Ko->En)');

// ============================================================================
// 10. E2E PIPELINE SCENARIO D: 8대 예외 및 경계 조건 전수 검증 (D-1 ~ D-8)
// ============================================================================
console.log('\n10. Testing E2E Pipeline Scenario D (All 8 Edge Cases D-1 ~ D-8)...');
const resD = runDemoPipelineScenario('D');
const repD = resD.reports.find((r) => r.id === 'rep-demo-scenario-d')!;
assert.ok(repD, 'Scenario D report must exist');

// D-1: 운행일지는 제출됐지만 서비스 종료시간이 누락된 경우 -> 임의 19:00 추정 금지, '서비스 시간 확인 필요'
const vD1 = repD.vehicles[0];
assert.equal(vD1.isServiceTimeVerified, false);
assert.equal(vD1.customerServiceEnd, '미입력');
assert.equal(vD1.customerServiceFormatted, '서비스 시간 확인 필요');
assert.equal(vD1.customerServiceMinutes, 0);
assert.equal(vD1.overtimeFare, 0);
console.log('  ✓ D-1 verified: Missing service end time is never fabricated to 19:00; marked 서비스 시간 확인 필요');

// D-2: 초과시간이 발생했지만 고객사 초과요율이 미등록인 경우 -> 임의 계산 없이 0원 + 확인 필요 경고
const vD2 = repD.vehicles[1];
assert.equal(vD2.isServiceTimeVerified, true);
assert.equal(vD2.customerServiceMinutes, 720); // 12h
assert.equal(vD2.overtimeMinutes, 120); // 2h overtime
assert.equal(vD2.overtimeFare, 0);
assert.equal(vD2.isOvertimeRateConfirmed, false);
console.log('  ✓ D-2 verified: Unregistered overtime rate yields ₩0 overtimeFare with isOvertimeRateConfirmed=false');

// D-3: 영어 가능 기사 요청에 한국어 전용 기사가 예외 배정된 경우 -> 불일치 경고 + 임의 할증 없음
assert.ok(vD1.languageMismatchWarning?.includes('한국어 전용 기사'));
assert.ok(vD1.englishSurchargeNotice?.includes('임의 할증 없음'));
console.log('  ✓ D-3 verified: English request with Korean-only driver flags mismatch warning without fabricating surcharge');

// D-4: 같은 기사가 같은 날 서로 다른 두 행사를 수행한 경우 -> 운행일지 및 정산이 덮어써지지 않고 완벽 분리
submitDriverLogToHq({
  id: 'log-demo-d4-morning',
  bookingId: 'b-demo-d4-morning',
  eventId: 'ev-demo-d4-morning',
  customerId: 'cust-demo-a',
  customerName: '[DEMO/TEST] 오르비타 바이오 코리아',
  rawDate: '2026-10-29',
  driverName: '김민수',
  vehicleModel: '벤츠 S560',
  vehiclePlate: '01호 3343',
  customerServiceStart: '08:00',
  customerServiceEnd: '13:00',
  stops: [],
});
submitDriverLogToHq({
  id: 'log-demo-d4-evening',
  bookingId: 'b-demo-d4-evening',
  eventId: 'ev-demo-d4-evening',
  customerId: 'cust-demo-b',
  customerName: '[DEMO/TEST] 메종 드 파리 코리아',
  rawDate: '2026-10-29',
  driverName: '김민수',
  vehicleModel: '벤츠 S560',
  vehiclePlate: '01호 3343',
  customerServiceStart: '14:00',
  customerServiceEnd: '22:00',
  stops: [],
});
const allLogsAfterD4 = getHqDrivingLogs();
assert.ok(allLogsAfterD4.some((l) => l.id === 'log-demo-d4-morning'), 'Morning log must not be overwritten');
assert.ok(allLogsAfterD4.some((l) => l.id === 'log-demo-d4-evening'), 'Evening log must coexist');
console.log('  ✓ D-4 verified: Same driver performing 2 events on the same day preserves both logs without cross-contamination');

// D-5: 서로 다른 고객사 행사에 같은 금액의 주차비 영수증이 각각 존재하는 경우 -> 오탐지 없이 정상 분리 승인
const expD5_Client1: HqExpenseRecord = {
  id: 'exp-demo-d5-1',
  no: 501,
  submittedAt: '10/29 12:00',
  submittedDate: '2026. 10. 29',
  rawDate: '2026-10-29',
  time: '12:00',
  driverName: '김민수',
  vehicleModel: '벤츠 S560',
  vehiclePlate: '01호 3343',
  customerId: 'cust-demo-a',
  customerName: '오르비타',
  bookingId: 'b-demo-d4-morning',
  eventId: 'ev-demo-d4-morning',
  category: 'parking',
  categoryLabel: '주차비',
  merchant: '서울국제주차장',
  amount: 15000,
  paymentMethod: 'company_card',
  paymentMethodLabel: '회사 카드',
  status: '승인 완료',
  hasReceiptImage: true,
  memo: '',
  ocrExtracted: true,
  ocrDetails: { approvalNo: 'AP-D5-MORNING-111' },
};
const expD5_Client2: HqExpenseRecord = {
  ...expD5_Client1,
  id: 'exp-demo-d5-2',
  no: 502,
  customerId: 'cust-demo-b',
  customerName: '메종드파리',
  bookingId: 'b-demo-d4-evening',
  eventId: 'ev-demo-d4-evening',
  ocrDetails: { approvalNo: 'AP-D5-EVENING-222' },
};
const dupCrossCustomer = checkDuplicateReceipt(expD5_Client1, [expD5_Client1, expD5_Client2]);
assert.equal(dupCrossCustomer.isDuplicate, false, 'Different customers/bookings with distinct approvalNo must NOT be flagged as duplicate');

// Whereas identical approvalNo IS flagged as duplicate:
const expD5_TrueDup: HqExpenseRecord = {
  ...expD5_Client2,
  id: 'exp-demo-d5-3',
  ocrDetails: { approvalNo: 'AP-D5-MORNING-111' },
};
const dupSameApproval = checkDuplicateReceipt(expD5_Client1, [expD5_Client1, expD5_TrueDup]);
assert.equal(dupSameApproval.isDuplicate, true, 'Identical approvalNo must be flagged as duplicate');
console.log('  ✓ D-5 verified: Same-amount receipts across different customers are allowed; identical approvalNo is blocked');

// D-6: 차량만 대여한 배차에서 기사 인건비가 0원으로 처리되는 경우
const vD6 = repD.vehicles[2];
assert.equal(vD6.serviceMode, 'vehicle_only');
assert.equal(vD6.baseFare, 600000); // Sprinter 519 CDI vehicle_only = 600,000
assert.equal(vD6.driverLaborCost, 0); // Driver labor = 0
console.log('  ✓ D-6 verified: Vehicle-Only Sprinter 519 CDI bills ₩600,000 with ₩0 driver labor cost');

// D-7: 임시 프리셋 수정 후 신규 배차에는 변경값이 적용되지만 기존 확정 스냅샷은 보존되는 경우
const originalPresets = getVehiclePresetsSnapshot();
const lockedSnapshotBooking: HqBooking = {
  id: 'b-demo-d7-locked',
  bookingNo: '#DEMO-D7-001',
  no: 971,
  customerName: '노바테크',
  customerId: 'cust-demo-d',
  eventId: 'ev-demo-d7-locked',
  pickupDate: '2026-10-29',
  pickupTime: '09:00',
  pickupLocation: '서울',
  destination: '수원',
  driverName: '정태훈',
  vehicleModel: '벤츠 스프린터 519 CDI',
  vehiclePlate: '703서 2658',
  dispatchStatus: '배차 완료',
  driverAck: '확인완료',
  customerBrochure: '발송됨',
  serviceMode: 'with_driver',
  requestedLanguage: 'ko',
  appliedPricingSnapshot: createBookingPricingSnapshot({
    vehicleModel: '벤츠 스프린터 519 CDI',
    driverName: '정태훈',
    serviceMode: 'with_driver',
    requestedLanguage: 'ko',
    vehiclePresets: originalPresets,
  }),
};
assert.equal(lockedSnapshotBooking.appliedPricingSnapshot?.baseVehicleFare, 800000);
assert.equal(lockedSnapshotBooking.appliedPricingSnapshot?.snapshotLocked, true);

// Now modify Sprinter 519 CDI preset from 800,000 -> 880,000
const modifiedPresets = originalPresets.map((p) =>
  p.presetKey === 'sprinter_519' ? { ...p, withDriverRate: 880000 } : p
);
saveVehiclePresets(modifiedPresets);

// Verify existing locked booking keeps 800,000 while new booking gets 880,000
const resolvedLocked = resolveEffectivePricingTerms({
  vehicleModel: '벤츠 스프린터 519 CDI',
  serviceMode: 'with_driver',
  bookingSnapshot: lockedSnapshotBooking.appliedPricingSnapshot,
  vehiclePresets: getVehiclePresetsSnapshot(),
});
const newBookingSnapshot = createBookingPricingSnapshot({
  vehicleModel: '벤츠 스프린터 519 CDI',
  driverName: '정태훈',
  serviceMode: 'with_driver',
  requestedLanguage: 'ko',
  vehiclePresets: getVehiclePresetsSnapshot(),
});
assert.equal(resolvedLocked.baseFare, 800000, 'Locked historical snapshot must preserve 800,000');
assert.equal(newBookingSnapshot.baseVehicleFare, 880000, 'New dispatch must use updated 880,000 preset');
// Restore original presets
saveVehiclePresets(originalPresets);
console.log('  ✓ D-7 verified: Preset update (800k->880k) applies to new dispatches while preserving locked 800k snapshots');

// D-8: 상태 저장 일관성 및 엄격한 수익 확정(profitConfirmStatus) 검증
// Report D has unverified service time on Vehicle 1; even if status is set to 'approved' and areAllDirectCostsConfirmed=true, profitConfirmStatus must remain 'provisional'!
const approvedD = updateSettlementReportStatus('rep-demo-scenario-d', 'approved', '승인 시도', true)!;
assert.equal(approvedD.status, 'approved');
assert.equal(
  approvedD.profitConfirmStatus,
  'provisional',
  'Report with unverified service time or temporary preset must remain provisional even when approved'
);
console.log('  ✓ D-8 verified: State persistence and strict profitConfirmStatus (provisional when unverified items exist)');

resetDemoPipelineData();
console.log('\n🎉 ALL UNIT & E2E PIPELINE SCENARIOS (A, B, C, D-1..D-8) PASSED 100%! 🎉\n');


