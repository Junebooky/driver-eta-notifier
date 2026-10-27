/**
 * Unit tests for Driver Expense Receipt OCR Logic & Validation
 */

import {
  calculateReceiptOcrCost,
  validateReceiptScanResult,
  shouldTriggerFallback,
  checkRateLimit,
  normalizeDate,
  normalizeTime,
  normalizeCategory,
  normalizePaymentMethod,
  matchSampleReceipt,
  GEMINI_MODEL_PRICING,
} from './receiptOcr';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- Running Receipt OCR Domain & Cost Optimization Tests ---');

// 1. Cost calculation & pricing tests
assert(GEMINI_MODEL_PRICING['gemini-3.1-flash-lite'].inputPricePerMillionUsd === 0.25, '3.1 Flash-Lite input price 0.25');
assert(GEMINI_MODEL_PRICING['gemini-3.8-flash'].inputPricePerMillionUsd === 0.75, '3.8 Flash input price 0.75');

const liteCost = calculateReceiptOcrCost('gemini-3.1-flash-lite', 1000, 200);
// 1000 / 1M * 0.25 = 0.00025, 200 / 1M * 1.50 = 0.00030 -> total = 0.00055 USD
assert(liteCost.costUsd === 0.00055, `Expected 0.00055 USD for 3.1 Flash-Lite, got ${liteCost.costUsd}`);
assert(liteCost.costKrw > 0.7 && liteCost.costKrw < 0.8, `Expected ~0.76 KRW for 3.1 Flash-Lite, got ${liteCost.costKrw}`);

const flashCost = calculateReceiptOcrCost('gemini-3.8-flash', 1000, 200);
// 1000 / 1M * 0.75 = 0.00075, 200 / 1M * 3.75 = 0.00075 -> total = 0.00150 USD
assert(flashCost.costUsd === 0.00150, `Expected 0.00150 USD for 3.8 Flash, got ${flashCost.costUsd}`);
console.log(`✓ Cost Comparison: 3.1 Flash-Lite ($${liteCost.costUsd}) vs 3.8 Flash ($${flashCost.costUsd}) -> ${((1 - liteCost.costUsd / flashCost.costUsd) * 100).toFixed(1)}% savings`);

// 2. Strict validation: Never invent amounts or allow hallucinations
const validRaw = {
  merchant: 'GS칼텍스 만남의광장주유소',
  address: '서울 서초구 양재대로 123',
  amount: 72000,
  date: '2026-10-24',
  time: '11:32:00',
  category: 'fuel',
  paymentMethod: 'company_card',
  confidence: 0.95,
};
const v1 = validateReceiptScanResult(validRaw, 'gemini-3.1-flash-lite');
assert(v1.isValid === true, 'v1 should be valid');
assert(v1.result.amount === 72000, 'v1 amount should be 72000');
assert(v1.result.time === '11:32', 'v1 time seconds stripped to HH:mm');
assert(v1.result.category === 'fuel', 'v1 category fuel');

// 3. Reject negative, zero, or NaN amounts (Never fabricate amount)
const invalidAmountRaw = {
  merchant: '스타벅스 강남점',
  amount: -5000,
  category: 'meal',
};
const v2 = validateReceiptScanResult(invalidAmountRaw, 'gemini-3.1-flash-lite');
assert(v2.result.amount === null, 'Negative amount must be rejected as null');
assert(v2.rejectionReasons.includes('amount_out_of_range'), 'Must flag amount out of range');

const stringAmountRaw = {
  merchant: '스타벅스',
  amount: '4,500원',
  category: 'meal',
};
const v3 = validateReceiptScanResult(stringAmountRaw, 'gemini-3.1-flash-lite');
assert(v3.result.amount === 4500, 'String with comma and won symbol must parse to 4500');

// 4. Date & Time Normalization
assert(normalizeDate('2026.10.24') === '2026-10-24', 'Normalize dot date');
assert(normalizeDate('2026/10/24') === '2026-10-24', 'Normalize slash date');
assert(normalizeDate('9999-99-99') === null, 'Reject invalid date');
assert(normalizeTime('14:30:45') === '14:30', 'Strip seconds from time');
assert(normalizeTime('25:60') === null, 'Reject impossible time');

// 5. Category and Payment Method Normalization
assert(normalizeCategory('주유') === 'fuel', 'Category syn gas/주유');
assert(normalizeCategory('식대') === 'meal', 'Category syn 식대');
assert(normalizeCategory('unknown_xyz') === 'other', 'Fallback unknown category to other');
assert(normalizePaymentMethod('현금영수증') === 'cash', 'Payment method 현금');
assert(normalizePaymentMethod('신용승인') === 'company_card', 'Payment method 신용');

// 6. Two-tier fallback decision logic
// RULE: Never retry automatically without a clear validation reason!
const validResult = {
  merchant: '한강주유소',
  amount: 48000,
  confidence: 0.95,
};
const fb1 = shouldTriggerFallback(validResult);
assert(fb1.fallbackNeeded === false, 'Valid high-confidence extraction must NOT trigger fallback');

const missingAmountResult = {
  merchant: '한강주유소',
  amount: null,
  confidence: 0.85,
};
const fb2 = shouldTriggerFallback(missingAmountResult);
assert(fb2.fallbackNeeded === true, 'Missing amount MUST trigger fallback');
assert(fb2.reason === 'missing_or_invalid_amount', 'Fallback reason missing amount');

const lowConfidenceResult = {
  merchant: '일반가맹점',
  amount: 15000,
  confidence: 0.45,
};
const fb3 = shouldTriggerFallback(lowConfidenceResult, 0.60);
assert(fb3.fallbackNeeded === true, 'Low confidence (<0.60) MUST trigger fallback');

// 7. Rate limiter tests
const clientIp = '127.0.0.1';
for (let i = 0; i < 5; i++) {
  const check = checkRateLimit(clientIp, 5, 1000);
  assert(check.allowed === true, `Call ${i + 1} should be allowed`);
}
const blocked = checkRateLimit(clientIp, 5, 1000);
assert(blocked.allowed === false, 'Call 6 should be blocked by rate limit');

// 8. Sample preset zero-cost match
const sampleResult = matchSampleReceipt('/images/receipt_sample_hangang.jpg');
assert(sampleResult !== null, 'Sample receipt should match preset');
assert(sampleResult?.amount === 48000, 'Sample amount 48,000');
assert(sampleResult?.modelUsed?.includes('0원') === true, 'Sample modelUsed indicates 0 cost');

console.log('✓ All 25/25 Receipt OCR Unit Tests Passed Successfully!');
