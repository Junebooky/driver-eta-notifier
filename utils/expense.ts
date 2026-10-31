/**
 * 경비지출 (Driver Expense Management) Domain Logic & Pure Utilities
 * Supports Korean date formatting, currency calculation, validation, sorting,
 * category styling definitions, and localStorage draft persistence.
 */

export type ExpenseCategoryKey =
  | 'fuel' // 주유비
  | 'meal' // 식비
  | 'parking' // 주차비
  | 'toll' // 통행료
  | 'stay' // 숙박비
  | 'wash' // 세차비
  | 'transit' // 교통비
  | 'other' // 기타
  | 'unclassified'; // 미분류

export type PaymentMethod =
  | 'company_card' // 회사 카드
  | 'driver_personal' // 기사 개인
  | 'client_card' // 고객 카드
  | 'cash' // 현금
  | 'other' // 기타
  | 'unspecified'; // 미확인

export interface CategoryMeta {
  key: ExpenseCategoryKey;
  label: string;
  badgeBg: string;
  badgeTextColor: string;
  badgeBorder: string;
  iconName: string;
  desc: string;
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategoryKey, CategoryMeta> = {
  meal: {
    key: 'meal',
    label: '식비',
    badgeBg: 'bg-[#FFF2E8]',
    badgeTextColor: 'text-[#FF7A00]',
    badgeBorder: 'border-[#FFE3CC]',
    iconName: 'utensils',
    desc: '운행 중 기사 식대 및 음료 영수증',
  },
  fuel: {
    key: 'fuel',
    label: '주유비',
    badgeBg: 'bg-[#EBF3FF]',
    badgeTextColor: 'text-[#1E60F3]',
    badgeBorder: 'border-[#D4E4FD]',
    iconName: 'car',
    desc: '주유소 유류비 및 전기차 충전비 영수증',
  },
  parking: {
    key: 'parking',
    label: '주차비',
    badgeBg: 'bg-[#E8F8F0]',
    badgeTextColor: 'text-[#00B060]',
    badgeBorder: 'border-[#C8F0DC]',
    iconName: 'parking',
    desc: '호텔, 공항, 빌딩 주차장 정산 영수증',
  },
  stay: {
    key: 'stay',
    label: '숙박비',
    badgeBg: 'bg-[#FFEBF4]',
    badgeTextColor: 'text-[#FF3B8A]',
    badgeBorder: 'border-[#FFD1E6]',
    iconName: 'bed',
    desc: '장거리 일정 숙박비 영수증',
  },
  toll: {
    key: 'toll',
    label: '통행료',
    badgeBg: 'bg-[#F3EBFF]',
    badgeTextColor: 'text-[#8B3DFF]',
    badgeBorder: 'border-[#E2D1FE]',
    iconName: 'milestone',
    desc: '고속도로 및 유료도로 통행료/하이패스 영수증',
  },
  wash: {
    key: 'wash',
    label: '세차비',
    badgeBg: 'bg-[#E6F9FF]',
    badgeTextColor: 'text-[#0099CC]',
    badgeBorder: 'border-[#BAEFFF]',
    iconName: 'sparkles',
    desc: '의전 전/후 차량 세차 및 디테일링 영수증',
  },
  transit: {
    key: 'transit',
    label: '교통비',
    badgeBg: 'bg-[#FFFBE6]',
    badgeTextColor: 'text-[#D48806]',
    badgeBorder: 'border-[#FFE58F]',
    iconName: 'bus',
    desc: '복귀 대중교통 및 택시비 영수증',
  },
  other: {
    key: 'other',
    label: '기타',
    badgeBg: 'bg-[#F1F5F9]',
    badgeTextColor: 'text-[#64748B]',
    badgeBorder: 'border-[#E2E8F0]',
    iconName: 'more',
    desc: '기타 부대비용 및 소모품 영수증',
  },
  unclassified: {
    key: 'unclassified',
    label: '미분류',
    badgeBg: 'bg-slate-100',
    badgeTextColor: 'text-slate-500',
    badgeBorder: 'border-dashed border-slate-300',
    iconName: 'help',
    desc: '항목 확인 필요',
  },
};

export const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'company_card', label: '회사 카드' },
  { key: 'driver_personal', label: '기사 개인' },
  { key: 'client_card', label: '고객 카드' },
  { key: 'cash', label: '현금' },
  { key: 'other', label: '기타' },
];

export interface ExpenseItem {
  id: string;
  category: ExpenseCategoryKey;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (24h)
  merchant: string; // 거래처 / 장소명
  address?: string; // 상세 주소
  amount: number; // 금액 (KRW integer)
  paymentMethod: PaymentMethod;
  memo?: string;
  receiptUrl?: string; // 사진 미리보기 URL
  isRefund?: boolean;
  createdAt: string;
  updatedAt: string;
  hqStatus?: '검수 대기' | '승인 완료' | '금액 확인' | '반려' | '미제출';
  submittedToHqAt?: string;
  bookingId?: string;
  driverId?: string;
  vehicleId?: string;
  organizationId?: string;
  receiptStoragePath?: string;
  ocrExtracted?: boolean;
  ocrSummary?: string;
}

export type ExpenseSortOption = 'newest' | 'oldest' | 'highest_amount' | 'lowest_amount';

export const EXPENSE_STORAGE_KEY = 'cockpit_expense_items_v1';
export const EXPENSE_DEMO_FLAG_KEY = 'cockpit_expense_use_demo_v1';

/**
 * Baseline 5 reference fixture items matching the screenshot
 * Oct 24 sum: 21,000 + 72,000 + 6,000 + 10,800 = ₩109,800
 * All 5 sum: ₩164,800
 */
export const REFERENCE_DEMO_EXPENSES: ExpenseItem[] = [
  {
    id: 'demo-exp-1',
    category: 'meal',
    date: '2026-10-24',
    time: '00:48',
    merchant: '서울 강남구 테헤란로 123',
    address: '서울 강남구 테헤란로 123',
    amount: 21000,
    paymentMethod: 'company_card',
    memo: '심야 대기 중 야간 식대 정산',
    receiptUrl: undefined,
    createdAt: '2026-10-24T00:48:00',
    updatedAt: '2026-10-24T00:48:00',
  },
  {
    id: 'demo-exp-2',
    category: 'fuel',
    date: '2026-10-24',
    time: '11:32',
    merchant: '서울 만남의광장 주유소',
    address: '서울 강남구 테헤란로 123',
    amount: 72000,
    paymentMethod: 'company_card',
    memo: '서울 강남구 테헤란로 주유',
    receiptUrl: '/images/receipt_sample_fuel.jpg',
    createdAt: '2026-10-24T11:32:00',
    updatedAt: '2026-10-24T11:32:00',
  },
  {
    id: 'demo-exp-3',
    category: 'parking',
    date: '2026-10-24',
    time: '09:15',
    merchant: '판교 제1테크노밸리 주차장',
    address: '경기 성남시 분당구 판교역로 235',
    amount: 6000,
    paymentMethod: 'company_card',
    memo: '임원 미팅 대기 주차권 정산',
    receiptUrl: undefined,
    createdAt: '2026-10-24T09:15:00',
    updatedAt: '2026-10-24T09:15:00',
  },
  {
    id: 'demo-exp-4',
    category: 'stay',
    date: '2026-10-23',
    time: '22:20',
    merchant: '메리어트 호텔',
    address: '서울 영등포구 영등포로 12',
    amount: 55000,
    paymentMethod: 'company_card',
    memo: 'VIP 1박 의전 대기 숙박 정산',
    receiptUrl: undefined,
    createdAt: '2026-10-23T22:20:00',
    updatedAt: '2026-10-23T22:20:00',
  },
  {
    id: 'demo-exp-5',
    category: 'toll',
    date: '2026-10-24',
    time: '08:12',
    merchant: '경부고속도로 서울요금소',
    address: '경기 성남시 분당구 대왕판교로 240',
    amount: 10800,
    paymentMethod: 'company_card',
    memo: '서울-판교 고속도로 통행료 정산',
    receiptUrl: undefined,
    createdAt: '2026-10-24T08:12:00',
    updatedAt: '2026-10-24T08:12:00',
  },
];

/**
 * Format currency to KRW representation with commas
 * e.g. 72000 -> "72,000원"
 */
export function formatKRW(amount: number, includeWonSuffix: boolean = true): string {
  const formatted = Math.round(amount).toLocaleString('ko-KR');
  return includeWonSuffix ? `${formatted}원` : formatted;
}

/**
 * Parse a raw currency input string into integer
 * Handles commas, won symbol, empty strings
 */
export function parseKRW(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

/**
 * Format Korean Date header (e.g. "2026년 10월 24일 (토)")
 */
export function formatExpenseHeaderDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return dateStr;
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()] || '토';
    return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
  } catch {
    return dateStr;
  }
}

/**
 * Format date + time for expense list item (e.g. "2026. 10. 24. 오전 11:32")
 */
export function formatExpenseItemDateTime(dateStr: string, timeStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [rawH, rawM] = (timeStr || '12:00').split(':').map(Number);
    const h = Number.isFinite(rawH) ? rawH : 12;
    const m = Number.isFinite(rawM) ? rawM : 0;
    const isPm = h >= 12;
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const padM = String(m).padStart(2, '0');
    const ampm = isPm ? '오후' : '오전';
    return `${year}. ${month}. ${day}. ${ampm} ${displayH}:${padM}`;
  } catch {
    return `${dateStr} ${timeStr}`;
  }
}

/**
 * Format date + time for picker display (e.g. "2026년 10월 24일 (토) 11:32")
 */
export function formatPickerDateTime(dateStr: string, timeStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()] || '토';
    const [h, m] = (timeStr || '12:00').split(':');
    return `${year}년 ${month}월 ${day}일 (${dayOfWeek}) ${h || '12'}:${m || '00'}`;
  } catch {
    return `${dateStr} ${timeStr}`;
  }
}

/**
 * Shift an ISO date string (YYYY-MM-DD) by given number of days
 */
export function shiftDateIso(dateStr: string, offsetDays: number): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + offsetDays);
    const nextY = date.getFullYear();
    const nextM = String(date.getMonth() + 1).padStart(2, '0');
    const nextD = String(date.getDate()).padStart(2, '0');
    return `${nextY}-${nextM}-${nextD}`;
  } catch {
    return dateStr;
  }
}

/**
 * Filter items by date string (YYYY-MM-DD)
 */
export function filterExpensesByDate(items: ExpenseItem[], dateIso: string): ExpenseItem[] {
  return items.filter((item) => item.date === dateIso);
}

/**
 * Calculate total expense sum from items list
 */
export function calculateTotalExpense(items: ExpenseItem[]): number {
  return items.reduce((sum, item) => sum + (item.isRefund ? -item.amount : item.amount), 0);
}

/**
 * Sort expense items
 */
export function sortExpenses(items: ExpenseItem[], sortOption: ExpenseSortOption): ExpenseItem[] {
  const copy = [...items];
  switch (sortOption) {
    case 'newest':
      return copy.sort((a, b) => {
        const dateTimeA = `${a.date}T${a.time}:00`;
        const dateTimeB = `${b.date}T${b.time}:00`;
        return dateTimeB.localeCompare(dateTimeA);
      });
    case 'oldest':
      return copy.sort((a, b) => {
        const dateTimeA = `${a.date}T${a.time}:00`;
        const dateTimeB = `${b.date}T${b.time}:00`;
        return dateTimeA.localeCompare(dateTimeB);
      });
    case 'highest_amount':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'lowest_amount':
      return copy.sort((a, b) => a.amount - b.amount);
    default:
      return copy;
  }
}

/**
 * Validate expense input fields before saving
 */
export function validateExpenseInput(item: {
  category?: ExpenseCategoryKey;
  date?: string;
  time?: string;
  merchant?: string;
  amount?: number;
}): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!item.category) {
    errors.category = '지출 항목을 선택해 주세요.';
  }

  if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    errors.date = '올바른 지출 일자를 입력해 주세요.';
  }

  if (!item.time || !/^\d{2}:\d{2}$/.test(item.time)) {
    errors.time = '올바른 지출 시간을 입력해 주세요.';
  }

  if (!item.merchant || !item.merchant.trim()) {
    errors.merchant = '거래처 또는 장소명을 입력해 주세요.';
  }

  if (item.amount === undefined || item.amount === null || isNaN(item.amount) || item.amount <= 0) {
    errors.amount = '0원 이상의 지출 금액을 입력해 주세요.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Pure loader for expenses with localStorage fallback
 */
export function loadExpenses(driverId?: string): { items: ExpenseItem[]; isDemo: boolean } {
  if (typeof window === 'undefined') {
    return { items: [], isDemo: false };
  }

  try {
    const rawDemo = localStorage.getItem(driverId ? `${EXPENSE_DEMO_FLAG_KEY}_${driverId}` : EXPENSE_DEMO_FLAG_KEY);
    const rawItems = localStorage.getItem(driverId ? `${EXPENSE_STORAGE_KEY}_${driverId}` : EXPENSE_STORAGE_KEY);

    if (rawDemo === 'false' && rawItems) {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) {
        return { items: parsed, isDemo: false };
      }
    }

    if (rawItems) {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { items: parsed, isDemo: rawDemo !== 'false' };
      }
    }

    // Default to reference demo fixture
    return { items: [], isDemo: false };
  } catch (err) {
    console.error('Failed to load expenses from localStorage:', err);
    return { items: [], isDemo: false };
  }
}

/**
 * Pure saver for expenses to localStorage with multi-tier quota defense
 */
export function saveExpenses(items: ExpenseItem[], isDemo: boolean = false, driverId?: string): void {
  if (typeof window === 'undefined') return;

  const tryPersist = (records: ExpenseItem[]): boolean => {
    try {
      localStorage.setItem(driverId ? `${EXPENSE_STORAGE_KEY}_${driverId}` : EXPENSE_STORAGE_KEY, JSON.stringify(records));
      localStorage.setItem(driverId ? `${EXPENSE_DEMO_FLAG_KEY}_${driverId}` : EXPENSE_DEMO_FLAG_KEY, isDemo ? 'true' : 'false');
      return true;
    } catch {
      return false;
    }
  };

  // 1. Direct attempt
  if (tryPersist(items)) return;

  // 2. Tier 1: Prune large base64 images from older records (beyond the top 3 newest)
  const tier1Items = items.map((rec, idx) => {
    if (idx >= 3 && rec.receiptUrl && rec.receiptUrl.startsWith('data:image/')) {
      return { ...rec, receiptUrl: undefined };
    }
    return rec;
  });
  if (tryPersist(tier1Items)) return;

  // 3. Tier 2: Strip all base64 data URLs
  const tier2Items = items.map((rec) => {
    if (rec.receiptUrl && rec.receiptUrl.startsWith('data:image/')) {
      return { ...rec, receiptUrl: undefined };
    }
    return rec;
  });
  if (tryPersist(tier2Items)) return;

  // 4. Tier 3: Clamp to top 30 records
  tryPersist(tier2Items.slice(0, 30));
}
