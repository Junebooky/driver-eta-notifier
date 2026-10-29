/**
 * Unit tests for Expense Management (경비지출) Domain Logic
 */

import {
  REFERENCE_DEMO_EXPENSES,
  calculateTotalExpense,
  filterExpensesByDate,
  formatKRW,
  parseKRW,
  formatExpenseHeaderDate,
  formatExpenseItemDateTime,
  shiftDateIso,
  sortExpenses,
  validateExpenseInput,
  ExpenseItem,
} from './expense';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- Running Expense Management Domain Unit Tests ---');

// 1. Total calculations
const allTotal = calculateTotalExpense(REFERENCE_DEMO_EXPENSES);
console.log(`All 5 reference demo items total: ${allTotal}원`);
assert(allTotal === 164800, `Expected 164,800원 but got ${allTotal}`);

const oct24Items = filterExpensesByDate(REFERENCE_DEMO_EXPENSES, '2026-10-24');
const oct24Total = calculateTotalExpense(oct24Items);
console.log(`Oct 24 items count: ${oct24Items.length}, total: ${oct24Total}원`);
assert(oct24Items.length === 4, `Expected 4 items for Oct 24 but got ${oct24Items.length}`);
assert(oct24Total === 109800, `Expected 109,800원 for Oct 24 but got ${oct24Total}`);

const oct23Items = filterExpensesByDate(REFERENCE_DEMO_EXPENSES, '2026-10-23');
const oct23Total = calculateTotalExpense(oct23Items);
console.log(`Oct 23 items count: ${oct23Items.length}, total: ${oct23Total}원`);
assert(oct23Items.length === 1, `Expected 1 item for Oct 23 but got ${oct23Items.length}`);
assert(oct23Total === 55000, `Expected 55,000원 for Oct 23 but got ${oct23Total}`);

// 2. Refund calculation
const withRefund: ExpenseItem[] = [
  ...REFERENCE_DEMO_EXPENSES,
  {
    id: 'refund-1',
    category: 'fuel',
    date: '2026-10-24',
    time: '12:00',
    merchant: '주유 취소 환불',
    amount: 10000,
    isRefund: true,
    paymentMethod: 'company_card',
    createdAt: '',
    updatedAt: '',
  },
];
const refundTotal = calculateTotalExpense(withRefund);
assert(refundTotal === 154800, `Expected 154,800원 after refund but got ${refundTotal}`);

// 3. Currency formatting and parsing
assert(formatKRW(72000) === '72,000원', 'formatKRW with suffix');
assert(formatKRW(72000, false) === '72,000', 'formatKRW without suffix');
assert(formatKRW(0) === '0원', 'formatKRW zero');
assert(parseKRW('72,000') === 72000, 'parseKRW with comma');
assert(parseKRW('₩ 72,000원') === 72000, 'parseKRW with won symbol');
assert(parseKRW('') === 0, 'parseKRW empty');

// 4. Date formatting
assert(formatExpenseHeaderDate('2026-10-24') === '2026년 10월 24일 (토)', 'header date format');
assert(formatExpenseHeaderDate('2026-10-25') === '2026년 10월 25일 (일)', 'header sunday format');

// 5. Item date & time formatting
assert(
  formatExpenseItemDateTime('2026-10-24', '11:32') === '2026. 10. 24. 오전 11:32',
  'item datetime am'
);
assert(
  formatExpenseItemDateTime('2026-10-24', '00:48') === '2026. 10. 24. 오전 12:48',
  'item datetime midnight'
);
assert(
  formatExpenseItemDateTime('2026-10-23', '22:20') === '2026. 10. 23. 오후 10:20',
  'item datetime pm'
);

// 6. Date shift helpers
assert(shiftDateIso('2026-10-24', 1) === '2026-10-25', 'shift +1 day');
assert(shiftDateIso('2026-10-24', -1) === '2026-10-23', 'shift -1 day');
assert(shiftDateIso('2026-10-31', 1) === '2026-11-01', 'shift month rollover');

// 7. Sorting
const sortedByAmountDesc = sortExpenses(REFERENCE_DEMO_EXPENSES, 'highest_amount');
assert(sortedByAmountDesc[0].amount === 72000, 'highest amount first is fuel 72,000');
assert(sortedByAmountDesc[sortedByAmountDesc.length - 1].amount === 6000, 'lowest amount is parking 6,000');

const sortedByAmountAsc = sortExpenses(REFERENCE_DEMO_EXPENSES, 'lowest_amount');
assert(sortedByAmountAsc[0].amount === 6000, 'lowest amount first');

const sortedNewest = sortExpenses(REFERENCE_DEMO_EXPENSES, 'newest');
assert(sortedNewest[0].date === '2026-10-24' && sortedNewest[0].time === '11:32', 'newest item first is Oct 24 11:32');

// 8. Validation
const validCheck = validateExpenseInput({
  category: 'fuel',
  date: '2026-10-24',
  time: '11:32',
  merchant: '서울주유소',
  amount: 72000,
});
assert(validCheck.isValid === true, 'valid input should pass');
assert(Object.keys(validCheck.errors).length === 0, 'no errors for valid input');

const invalidCheck = validateExpenseInput({
  category: undefined,
  date: '',
  time: '',
  merchant: '',
  amount: 0,
});
assert(invalidCheck.isValid === false, 'invalid input should fail');
assert(Boolean(invalidCheck.errors.category), 'category error present');
assert(Boolean(invalidCheck.errors.merchant), 'merchant error present');
assert(Boolean(invalidCheck.errors.amount), 'amount error present');

console.log('All 20/20 Expense Input & Pure Domain Tests Passed Successfully!');

// 9. Quota Defense & LocalStorage QuotaExceededError Resiliency Test
console.log('--- Testing LocalStorage Quota Defense ---');
import { saveHqExpenses, getHqExpenses, HQ_EXPENSES_STORAGE_KEY } from './expenseHqStorage';
import { HqExpenseRecord } from '@/types/expenseHq';
import { saveExpenses, loadExpenses, EXPENSE_STORAGE_KEY } from './expense';

const storageMock: Record<string, string> = {};
let maxAllowedLength = 3000; // Trigger quota if payload exceeds 3000 characters

(globalThis as any).window = {
  dispatchEvent: () => true,
  CustomEvent: class CustomEvent {
    constructor(public type: string, public detail: any) {}
  },
};

(globalThis as any).localStorage = {
  getItem: (key: string) => storageMock[key] || null,
  setItem: (key: string, val: string) => {
    if (val.length > maxAllowedLength) {
      const err = new Error("Failed to execute 'setItem' on 'Storage': Setting the value exceeded the quota.");
      err.name = 'QuotaExceededError';
      throw err;
    }
    storageMock[key] = val;
  },
  removeItem: (key: string) => {
    delete storageMock[key];
  },
  clear: () => {
    Object.keys(storageMock).forEach((k) => delete storageMock[k]);
  },
  length: 0,
  key: () => null,
};

// Create a list of 10 HQ expenses where older records have huge base64 strings
const dummyHeavyExpenses: HqExpenseRecord[] = Array.from({ length: 8 }, (_, i) => ({
  id: `hq-test-${i}`,
  no: i + 1,
  submittedAt: '10/28 01:00',
  submittedDate: '2026. 10. 28',
  rawDate: '2026-10-28',
  time: '01:00',
  driverName: '윤태준',
  vehicleModel: '스타리아',
  vehiclePlate: '116허 1514',
  category: 'fuel',
  categoryLabel: '주유비',
  merchant: `테스트 가맹점 ${i}`,
  amount: 50000,
  paymentMethod: 'company_card',
  paymentMethodLabel: '회사 카드',
  status: '검수 대기',
  hasReceiptImage: true,
  receiptUrl: `data:image/jpeg;base64,${'A'.repeat(800)}`, // Each is ~800 chars -> Total > 6400 chars > 3000 maxAllowedLength
}));

// Test Scenario A: Quota allows top 3 records with images (Tier 1 defense)
// Direct payload is ~9,600 chars; setting quota to 6,500 forces Tier 1 (which is ~5,600 chars)
maxAllowedLength = 6500;
saveHqExpenses(dummyHeavyExpenses);
assert(Boolean(storageMock[HQ_EXPENSES_STORAGE_KEY]), 'saveHqExpenses recovered and saved under quota');
const savedHqTier1 = JSON.parse(storageMock[HQ_EXPENSES_STORAGE_KEY]);
assert(savedHqTier1.length === 8, 'All 8 records preserved');
assert(savedHqTier1[0].receiptUrl !== undefined, 'Top 0 receiptUrl preserved in Tier 1');
assert(savedHqTier1[1].receiptUrl !== undefined, 'Top 1 receiptUrl preserved in Tier 1');
assert(savedHqTier1[2].receiptUrl !== undefined, 'Top 2 receiptUrl preserved in Tier 1');
assert(savedHqTier1[5].receiptUrl === undefined, 'Older record receiptUrl pruned to relieve quota in Tier 1');
assert(savedHqTier1[5].hasReceiptImage === true, 'Metadata hasReceiptImage preserved');
assert(savedHqTier1[5].amount === 50000, 'Metadata amount preserved');
console.log('✓ saveHqExpenses successfully relieved quota through Tier 1 defense');

// Test Scenario B: Tight quota forces stripping all base64 images (Tier 2 defense)
// Setting quota to 3,500 forces Tier 2 (all base64 pruned, ~3,200 chars)
maxAllowedLength = 3500;
saveHqExpenses(dummyHeavyExpenses);
const savedHqTier2 = JSON.parse(storageMock[HQ_EXPENSES_STORAGE_KEY]);
assert(savedHqTier2.length === 8, 'All 8 records preserved in Tier 2');
assert(savedHqTier2[0].receiptUrl === undefined, 'All base64 pruned in Tier 2');
assert(savedHqTier2[0].hasReceiptImage === true, 'Metadata hasReceiptImage preserved in Tier 2');
assert(savedHqTier2[0].merchant === '테스트 가맹점 0', 'Merchant preserved in Tier 2');
console.log('✓ saveHqExpenses successfully relieved quota through Tier 2 defense');

// Test driver saveExpenses quota defense
const dummyDriverItems: ExpenseItem[] = Array.from({ length: 6 }, (_, i) => ({
  id: `driver-test-${i}`,
  category: 'meal',
  date: '2026-10-28',
  time: '12:00',
  merchant: `식당 ${i}`,
  amount: 12000,
  paymentMethod: 'company_card',
  receiptUrl: `data:image/jpeg;base64,${'B'.repeat(800)}`,
  createdAt: '',
  updatedAt: '',
}));

maxAllowedLength = 4000;
saveExpenses(dummyDriverItems, false);
assert(Boolean(storageMock[EXPENSE_STORAGE_KEY]), 'saveExpenses recovered and saved under quota');
const savedDriver = JSON.parse(storageMock[EXPENSE_STORAGE_KEY]);
assert(savedDriver.length === 6, 'All 6 driver items preserved');
assert(savedDriver[5].receiptUrl === undefined, 'Older driver item receiptUrl pruned');

console.log('✓ saveExpenses successfully relieved quota through Tier 1 defense');
console.log('🎉 ALL 24 EXPENSE & QUOTA DEFENSE TESTS PASSED! 🎉');
