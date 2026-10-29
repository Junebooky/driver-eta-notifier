import assert from 'assert';
import {
  resolveCustomerForExpense,
  getHqExpenses,
  submitDriverExpensesToHq,
  INITIAL_HQ_EXPENSES,
  saveHqExpenses,
  HQ_EXPENSES_STORAGE_KEY,
} from './expenseHqStorage';
import { ExpenseItem } from './expense';

console.log('--- Testing Customer Expense Auto-Mapping and Billing Logic ---');

// Setup mock window & localStorage
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => {
    mockStorage[key] = val;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const k in mockStorage) delete mockStorage[k];
  },
};

(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = {
  dispatchEvent: () => true,
  localStorage: mockLocalStorage,
  CustomEvent: class CustomEvent {
    detail: any;
    constructor(public type: string, init?: { detail: any }) {
      this.detail = init?.detail;
    }
  },
};

// 1. Test Seed Data Customer Enrichment
const seedExpenses = getHqExpenses();
assert(seedExpenses.length > 0, 'Seed expenses must exist');
const ferrariExp = seedExpenses.find((e) => e.customerName === 'Ferrari');
assert(Boolean(ferrariExp), 'Ferrari customer expense should exist in seed');
assert.strictEqual(ferrariExp?.customerId, 'cust-ferrari', 'Ferrari customer ID must match');

const bmwExp = seedExpenses.find((e) => e.customerName === 'BMW Korea');
assert(Boolean(bmwExp), 'BMW Korea customer expense should exist in seed');
assert.strictEqual(bmwExp?.customerId, 'cust-bmw', 'BMW customer ID must match');

const chanelExp = seedExpenses.find((e) => e.customerName === 'CHANEL');
assert(Boolean(chanelExp), 'CHANEL customer expense should exist in seed');
assert.strictEqual(chanelExp?.customerId, 'cust-chanel', 'CHANEL customer ID must match');

console.log('✓ Seed data customer enrichment verified');

// 2. Test resolveCustomerForExpense by Memo Keywords
const memoCustomer1 = resolveCustomerForExpense({
  memo: '[BMW VIP] 의전 행사 주유',
  driverName: '김테스트',
});
assert.strictEqual(memoCustomer1.customerName, 'BMW Korea');
assert.strictEqual(memoCustomer1.customerId, 'cust-bmw');

const memoCustomer2 = resolveCustomerForExpense({
  memo: '샤넬 앰버서더 픽업 톨게이트',
  driverName: '김테스트',
});
assert.strictEqual(memoCustomer2.customerName, 'CHANEL');
assert.strictEqual(memoCustomer2.customerId, 'cust-chanel');

const memoCustomer3 = resolveCustomerForExpense({
  memo: '신세계 본점 VIP 대기 주차비',
  driverName: '김테스트',
});
assert.strictEqual(memoCustomer3.customerName, '신세계그룹');
assert.strictEqual(memoCustomer3.customerId, 'cust-shinsegae');

console.log('✓ Keyword-based memo customer resolution verified');

// 3. Test resolveCustomerForExpense by Fleet Driver Assignment Fallback
const driverCustomer1 = resolveCustomerForExpense({
  memo: '일반 주유',
  driverName: '윤태준',
});
assert.strictEqual(driverCustomer1.customerName, 'Ferrari');
assert.strictEqual(driverCustomer1.customerId, 'cust-ferrari');

const driverCustomer2 = resolveCustomerForExpense({
  memo: '경비 제출',
  driverName: '정태훈',
});
assert.strictEqual(driverCustomer2.customerName, 'BMW Korea');
assert.strictEqual(driverCustomer2.customerId, 'cust-bmw');

const driverCustomer3 = resolveCustomerForExpense({
  memo: '식대 지출',
  driverName: '김민수',
});
assert.strictEqual(driverCustomer3.customerName, '신세계그룹');
assert.strictEqual(driverCustomer3.customerId, 'cust-shinsegae');

console.log('✓ Fleet driver assignment customer resolution verified');

// 4. Test submitDriverExpensesToHq Auto Customer Mapping
const driverItemsToSubmit: ExpenseItem[] = [
  {
    id: 'test-exp-01',
    date: '2026-10-28',
    time: '14:30',
    category: 'fuel',
    merchant: 'GS칼텍스 삼일로주유소',
    amount: 85000,
    paymentMethod: 'company_card',
    memo: 'BMW 행사 7시리즈 주유',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'test-exp-02',
    date: '2026-10-28',
    time: '15:10',
    category: 'toll',
    merchant: '인천국제공항고속도로',
    amount: 6600,
    paymentMethod: 'company_card',
    memo: '샤넬 VIP 공항 샌딩',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const submittedCount = submitDriverExpensesToHq(
  driverItemsToSubmit,
  '테스트기사',
  'Genesis G90',
  '서울 01가 9999'
);

assert.strictEqual(submittedCount.count, 2, 'Two expenses should be submitted to HQ');
const updatedExpenses = getHqExpenses();
const submittedBmw = updatedExpenses.find((e) => e.merchant === 'GS칼텍스 삼일로주유소');
assert.strictEqual(submittedBmw?.customerName, 'BMW Korea');
assert.strictEqual(submittedBmw?.customerId, 'cust-bmw');

const submittedChanel = updatedExpenses.find((e) => e.merchant === '인천국제공항고속도로');
assert.strictEqual(submittedChanel?.customerName, 'CHANEL');
assert.strictEqual(submittedChanel?.customerId, 'cust-chanel');

console.log('✓ submitDriverExpensesToHq auto customer mapping verified');

// 5. Test Customer Billing Aggregations
const chanelExpenses = updatedExpenses.filter((e) => e.customerId === 'cust-chanel');
const chanelTotal = chanelExpenses.reduce((sum, item) => sum + item.amount, 0);
const chanelApproved = chanelExpenses
  .filter((item) => item.status === '승인 완료')
  .reduce((sum, item) => sum + item.amount, 0);
const chanelPending = chanelExpenses
  .filter((item) => item.status === '검수 대기' || item.status === '금액 확인')
  .reduce((sum, item) => sum + item.amount, 0);

assert(chanelTotal > 0, 'CHANEL total billing must be positive');
assert(chanelTotal === chanelApproved + chanelPending, 'Total must equal approved + pending');
console.log(`✓ CHANEL billing verified: Total = ${chanelTotal.toLocaleString()}원 (Approved: ${chanelApproved.toLocaleString()}원, Pending: ${chanelPending.toLocaleString()}원)`);

console.log('\n🎉 ALL CUSTOMER EXPENSE MAPPING & BILLING TESTS PASSED! 🎉\n');
