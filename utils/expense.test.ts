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

console.log('All 20/20 Expense Unit Tests Passed Successfully!');
