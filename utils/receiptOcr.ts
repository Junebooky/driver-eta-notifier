/**
 * Driver Expense Receipt OCR Domain Logic & Utility Suite
 * 
 * Provides:
 * 1. Multi-tier Gemini OCR fallback orchestration (Gemini 3.1 Flash-Lite -> Gemini 3.8 Flash)
 * 2. Strict validation & sanitization (no hallucinated amounts, guaranteed schema compliance)
 * 3. Official token pricing & cost computation for Gemini 3.1 Flash-Lite, 3.5 Flash-Lite, 3.8 Flash
 * 4. Zero-cost deterministic caching & sample receipt bypass
 * 5. Rate limiting & payload size guardrails
 */

import { ExpenseCategoryKey, PaymentMethod, EXPENSE_CATEGORIES } from './expense';

export interface ReceiptScanResult {
  success: boolean;
  merchant: string;
  address: string | null;
  amount: number | null;
  date: string | null;
  time: string | null;
  category: ExpenseCategoryKey;
  paymentMethod: PaymentMethod;
  summary: string;
  confidence: number;
  modelUsed?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  estimatedCostKrw?: number;
  processingTimeMs?: number;
  isCached?: boolean;
  error?: string;
}

export interface ReceiptModelPricing {
  modelId: string;
  name: string;
  inputPricePerMillionUsd: number;
  outputPricePerMillionUsd: number;
}

/**
 * Official Google Gemini API Pricing (2026 Official Documentation)
 */
export const GEMINI_MODEL_PRICING: Record<string, ReceiptModelPricing> = {
  'gemini-3.1-flash-lite': {
    modelId: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    inputPricePerMillionUsd: 0.25,
    outputPricePerMillionUsd: 1.50,
  },
  'gemini-3.5-flash-lite': {
    modelId: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    inputPricePerMillionUsd: 0.30,
    outputPricePerMillionUsd: 2.50,
  },
  'gemini-3.8-flash': {
    modelId: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    inputPricePerMillionUsd: 0.75, // Through Dec 31, 2026 ($1.50 starting 2027)
    outputPricePerMillionUsd: 3.75, // Through Dec 31, 2026 ($7.50 starting 2027)
  },
};

export const USD_TO_KRW_EXCHANGE_RATE = 1380;

/**
 * Compute actual USD and KRW cost from token counts
 */
export function calculateReceiptOcrCost(
  model: string,
  inputTokens: number = 0,
  outputTokens: number = 0
): { costUsd: number; costKrw: number } {
  let pricing = GEMINI_MODEL_PRICING[model];
  if (!pricing) {
    if (model.includes('3.8')) pricing = GEMINI_MODEL_PRICING['gemini-3.8-flash'];
    else if (model.includes('3.5')) pricing = GEMINI_MODEL_PRICING['gemini-3.5-flash-lite'];
    else pricing = GEMINI_MODEL_PRICING['gemini-3.1-flash-lite'];
  }

  const costUsd =
    (inputTokens / 1_000_000) * pricing.inputPricePerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPricePerMillionUsd;

  const costKrw = costUsd * USD_TO_KRW_EXCHANGE_RATE;

  return {
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    costKrw: Math.round(costKrw * 100) / 100,
  };
}

/**
 * Predefined deterministic sample presets to prevent waste of Gemini API calls
 */
export interface SampleReceiptPreset {
  merchant: string;
  address: string | null;
  amount: number;
  category: ExpenseCategoryKey;
  date: string;
  time: string;
  summary: string;
  memo: string;
}

export const SAMPLE_RECEIPT_PRESETS: Record<string, SampleReceiptPreset> = {
  '/images/receipt_sample_hangang.jpg': {
    merchant: '한강주유소',
    address: '경기도 고양시 덕양구 행주로 57-28',
    amount: 48000,
    category: 'fuel',
    date: '2026-10-26',
    time: '12:36',
    summary: '한강주유소에서 휘발유 48,000원 결제 영수증으로 판독되었습니다. (샘플 데이터 · API 비용 0원)',
    memo: 'VIP 의전 배차 전 주유',
  },
  '/images/receipt_sample_fuel.jpg': {
    merchant: '서울 만남의광장 주유소',
    address: '서울 서초구 양재대로12길 73-71',
    amount: 72000,
    category: 'fuel',
    date: '2026-10-24',
    time: '11:32',
    summary: '서울 만남의광장 주유소에서 경유 72,000원 결제 영수증으로 인식되었습니다. (샘플 데이터 · API 비용 0원)',
    memo: '서울 서초구 양재대로 주유',
  },
  '/images/receipt_sample_cu.jpg': {
    merchant: 'CU 고양강매점',
    address: '경기도 고양시 덕양구 강매로247 (강매동 521-7)',
    amount: 9500,
    category: 'meal',
    date: '2024-10-26',
    time: '19:22',
    summary: 'CU 고양강매점에서 식음료 9,500원 결제 영수증으로 판독되었습니다. (샘플 데이터 · API 비용 0원)',
    memo: '야간 대기 식대',
  },
};

/**
 * Exact SHA-256 hashes of sample receipt images
 */
export const SAMPLE_RECEIPT_HASHES: Record<string, string> = {
  // Hangang
  '06a6e3751da4a1d4e9c7307ef34cc15021b7f879d97a09805b3dfef722c84306': '/images/receipt_sample_hangang.jpg',
  '10cf194efa1d4c46866676b4595f9ee22ed1d1f96fc36614e4d70a0b7c661ff9': '/images/receipt_sample_hangang.jpg',
  // Fuel / Mannam
  '85626cd9cc748946cfa2c2923735142e0be5960cf432e5717e4d03162c436f43': '/images/receipt_sample_fuel.jpg',
  '965cbdc71fa6e88d3ac2a290493e935309407eee96ceb141acc3db02d3845471': '/images/receipt_sample_fuel.jpg',
  // CU
  '70d6e1959bfc99a3d071d7c680f1563edc540e758bbbd014a58d1535b9a9bfd6': '/images/receipt_sample_cu.jpg',
  'd4beb96c5a067ba410814f6688fd71c0bd3ceeca7384f5002bbe1e1e40985f90': '/images/receipt_sample_cu.jpg',
};

/**
 * Match sample receipt preset by path, filename, or SHA-256 hash (0 Gemini API cost)
 */
export function matchSampleReceipt(identifier: string): ReceiptScanResult | null {
  if (!identifier) return null;
  const lower = identifier.trim().toLowerCase();

  let matchedPath: string | null = null;

  // 1. Exact hash check
  if (/^[a-f0-9]{64}$/.test(lower) && SAMPLE_RECEIPT_HASHES[lower]) {
    matchedPath = SAMPLE_RECEIPT_HASHES[lower];
  } else if (SAMPLE_RECEIPT_PRESETS[identifier]) {
    matchedPath = identifier;


  } else if (lower.includes('receipt_sample_fuel') || lower.includes('만남의광장')) {
    matchedPath = '/images/receipt_sample_fuel.jpg';
  } else if (lower.includes('receipt_sample_cu') || lower.includes('고양강매')) {
    matchedPath = '/images/receipt_sample_cu.jpg';
  }

  if (matchedPath && SAMPLE_RECEIPT_PRESETS[matchedPath]) {
    const p = SAMPLE_RECEIPT_PRESETS[matchedPath];
    return {
      success: true,
      merchant: p.merchant,
      address: p.address,
      amount: p.amount,
      date: p.date,
      time: p.time,
      category: p.category,
      paymentMethod: 'company_card',
      summary: p.summary,
      confidence: 0.99,
      modelUsed: '샘플 프리셋 (비용 0원)',
      isCached: true,
    };
  }

  return null;
}

/**
 * Normalize and validate ExpenseCategoryKey strictly
 */
export function normalizeCategory(cat: unknown): ExpenseCategoryKey {
  if (typeof cat !== 'string') return 'other';
  const trimmed = cat.trim().toLowerCase();
  const validKeys: ExpenseCategoryKey[] = [
    'fuel',
    'toll',
    'parking',
    'meal',
    'wash',
    'stay',
    'transit',
    'other',
    'unclassified',
  ];
  if ((validKeys as string[]).includes(trimmed)) {
    return trimmed as ExpenseCategoryKey;
  }
  // Mapping synonyms
  if (trimmed === 'gas' || trimmed === 'oil' || trimmed === '주유') return 'fuel';
  if (trimmed === 'food' || trimmed === 'cafe' || trimmed === '식대') return 'meal';
  if (trimmed === 'accommodation' || trimmed === 'hotel' || trimmed === '숙박') return 'stay';
  if (trimmed === 'tollgate' || trimmed === '통행') return 'toll';
  if (trimmed === 'carwash' || trimmed === '세차') return 'wash';
  if (trimmed === 'subway' || trimmed === 'taxi' || trimmed === '교통') return 'transit';
  return 'other';
}

/**
 * Normalize and validate PaymentMethod strictly
 */
export function normalizePaymentMethod(pm: unknown): PaymentMethod {
  if (typeof pm !== 'string') return 'company_card';
  const trimmed = pm.trim().toLowerCase();
  const validMethods: PaymentMethod[] = [
    'company_card',
    'driver_personal',
    'client_card',
    'cash',
    'other',
    'unspecified',
  ];
  if ((validMethods as string[]).includes(trimmed)) {
    return trimmed as PaymentMethod;
  }
  if (trimmed.includes('현금') || trimmed === 'cash') return 'cash';
  if (trimmed.includes('개인') || trimmed.includes('personal')) return 'driver_personal';
  if (trimmed.includes('고객') || trimmed.includes('client')) return 'client_card';
  return 'company_card';
}

/**
 * Strict date validation (YYYY-MM-DD)
 */
export function normalizeDate(dateStr: unknown): string | null {
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    if (y >= 2020 && y <= 2035 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Strict time validation (HH:mm)
 */
export function normalizeTime(timeStr: unknown): string | null {
  if (typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Validate and sanitize raw JSON output from Gemini OCR.
 * Ensures:
 * - Amount is a positive integer number or null. NEVER invent or hallucinate amounts.
 * - Merchant is a non-empty string.
 * - Category and paymentMethod are normalized.
 * - Confidence is between 0.0 and 1.0.
 */
export function validateReceiptScanResult(
  raw: Record<string, unknown>,
  modelName: string
): { isValid: boolean; result: ReceiptScanResult; rejectionReasons: string[] } {
  const rejectionReasons: string[] = [];

  // 1. Merchant validation
  let merchant = typeof raw.merchant === 'string' ? raw.merchant.trim() : '';
  if (!merchant || merchant === 'null' || merchant === 'undefined') {
    merchant = '상호 미확인 가맹점';
    rejectionReasons.push('merchant_missing');
  }

  // 2. Amount validation (Strict positive integer; reject negative, NaN, 0, or invented values)
  let amount: number | null = null;
  if (typeof raw.amount === 'number' && !isNaN(raw.amount) && isFinite(raw.amount)) {
    const rounded = Math.round(raw.amount);
    if (rounded > 0 && rounded < 100_000_000) {
      amount = rounded;
    } else {
      rejectionReasons.push('amount_out_of_range');
    }
  } else if (typeof raw.amount === 'string') {
    const parsed = parseInt((raw.amount as string).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 100_000_000) {
      amount = parsed;
    } else {
      rejectionReasons.push('amount_invalid_string');
    }
  } else {
    rejectionReasons.push('amount_missing');
  }

  // 3. Address validation
  const address =
    typeof raw.address === 'string' && raw.address.trim() && raw.address.trim() !== 'null'
      ? raw.address.trim()
      : null;

  // 4. Date & Time validation
  const date = normalizeDate(raw.date);
  const time = normalizeTime(raw.time);

  // 5. Category & Payment method normalization
  const category = normalizeCategory(raw.category);
  const paymentMethod = normalizePaymentMethod(raw.paymentMethod);

  // 6. Confidence score
  let confidence = 0.80;
  if (typeof raw.confidence === 'number' && !isNaN(raw.confidence)) {
    confidence = Math.max(0.0, Math.min(1.0, raw.confidence));
  } else if (amount && merchant !== '상호 미확인 가맹점') {
    confidence = 0.90;
  } else {
    confidence = 0.50;
  }

  // 7. Summary
  let summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  if (!summary) {
    const catLabel = EXPENSE_CATEGORIES[category]?.label || '경비';
    summary = `${merchant}${amount ? ` · ${amount.toLocaleString()}원` : ''} (${catLabel}) 영수증이 판독되었습니다.`;
  }

  // A scan is considered valid if we at least extracted either a valid positive amount OR a clear merchant name
  const isValid = Boolean(amount !== null || merchant !== '상호 미확인 가맹점');

  const result: ReceiptScanResult = {
    success: isValid,
    merchant,
    address,
    amount,
    date,
    time,
    category,
    paymentMethod,
    summary,
    confidence,
    modelUsed: modelName,
  };

  return { isValid, result, rejectionReasons };
}

/**
 * Determine whether to trigger the fallback model (e.g. Gemini 3.8 Flash).
 * RULE: Never retry automatically without a clear validation reason!
 * Triggers fallback ONLY IF:
 * 1. Crucial amount extraction failed (amount is null)
 * 2. Confidence is lower than minConfidence (default: 0.60)
 * 3. Merchant is unidentifiable
 */
export function shouldTriggerFallback(
  result: Partial<ReceiptScanResult>,
  minConfidence: number = 0.60
): { fallbackNeeded: boolean; reason?: string } {
  if (!result) {
    return { fallbackNeeded: true, reason: 'empty_result' };
  }

  if (result.amount === null || result.amount === undefined || result.amount <= 0) {
    return { fallbackNeeded: true, reason: 'missing_or_invalid_amount' };
  }

  if (!result.merchant || result.merchant === '상호 미확인 가맹점') {
    return { fallbackNeeded: true, reason: 'unidentified_merchant' };
  }

  if (typeof result.confidence === 'number' && result.confidence < minConfidence) {
    return { fallbackNeeded: true, reason: `low_confidence_${result.confidence.toFixed(2)}` };
  }

  return { fallbackNeeded: false };
}

/**
 * In-memory sliding rate limiter (e.g. 20 requests per minute per IP)
 */
interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitBucket>();

export function checkRateLimit(
  clientKey: string,
  limit: number = 20,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const bucket = rateLimitMap.get(clientKey) || { timestamps: [] };

  // Filter timestamps within window
  const activeTimestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (activeTimestamps.length >= limit) {
    const oldest = activeTimestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }

  activeTimestamps.push(now);
  rateLimitMap.set(clientKey, { timestamps: activeTimestamps });

  return {
    allowed: true,
    remaining: limit - activeTimestamps.length,
    resetMs: windowMs,
  };
}
