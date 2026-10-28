import { HqExpenseRecord, HqExpenseStatus, HqExpenseKpiSummary } from '@/types/expenseHq';
import { ExpenseItem, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/utils/expense';
import type { ReconciledHipassItem } from '@/utils/hipassReconciler';

export const HQ_EXPENSES_STORAGE_KEY = 'cockpit_hq_expenses_v2';
export const HQ_EXPENSE_UPDATE_EVENT = 'cockpit_hq_expense_updated';

// 9 Rich Initial Mock HQ Expenses (Exact match with HQ Operations System)
export const INITIAL_HQ_EXPENSES: HqExpenseRecord[] = [
  {
    id: 'hq-exp-09',
    no: 9,
    submittedAt: '10/26 19:33',
    submittedDate: '2024. 10. 26 (토)',
    rawDate: '2024-10-26',
    time: '19:33',
    driverName: '윤태준',
    vehicleModel: '현대 스타리아 리무진',
    vehiclePlate: '116허 1514',
    category: 'meal',
    categoryLabel: '식비',
    merchant: 'CU 고양강매점',
    address: '경기도 고양시 덕양구 강매로247 (강매동 521-7)',
    amount: 9500,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '검수 대기',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_cu.jpg',
    memo: '야간 VIP 운행 대기 중 식대 (삼각김밥, 음료 등)',
    ocrExtracted: true,
    ocrSummary: 'CU 고양강매점 식음료 영수증 인식 완료 (총 7,500원 / 청구 9,500원)',
    ocrDetails: {
      merchantName: 'CU 고양강매점',
      bizNo: '780-85-02777',
      phone: '031-962-1027',
      address: '경기도 고양시 덕양구 강매로247 (강매동 521-7)',
      paymentTime: '2024-10-26 19:22:17',
      cardName: 'KB국민카드',
      cardNumber: '9445-12**-****-7731',
      approvalNo: '30012536',
      items: [
        { name: '삼각김밥참치마요', unitPrice: 1200, qty: 1, amount: 1200 },
        { name: 'CU파떡에그구이봉', unitPrice: 2300, qty: 1, amount: 2300 },
        { name: '바나나우유', unitPrice: 1800, qty: 1, amount: 1800 },
        { name: 'PB생수500ml', unitPrice: 700, qty: 1, amount: 700 },
        { name: '비타500', unitPrice: 1500, qty: 1, amount: 1500 },
      ],
      subtotal: 6819,
      vat: 681,
      total: 7500,
    },
  },
  {
    id: 'hq-exp-01',
    no: 1,
    submittedAt: '10/24 14:30',
    submittedDate: '2024. 10. 24 (목)',
    rawDate: '2024-10-24',
    time: '14:30',
    driverName: '정태훈',
    vehicleModel: '기아 카니발 하이리무진',
    vehiclePlate: '193호 5336',
    customerName: 'BMW Korea',
    customerId: 'cust-bmw',
    category: 'fuel',
    categoryLabel: '주유비',
    merchant: 'GS칼텍스 삼일주유소',
    address: '서울 강남구 테헤란로 152',
    amount: 80000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '검수 대기',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_fuel.jpg',
    memo: '인천공항 2회전 VIP 영접 후 경유 만석 주유',
    ocrExtracted: true,
    ocrSummary: 'GS칼텍스 삼일주유소 경유 80,000원 결제 승인',
  },
  {
    id: 'hq-exp-02',
    no: 2,
    submittedAt: '10/24 13:20',
    submittedDate: '2024. 10. 24 (목)',
    rawDate: '2024-10-24',
    time: '13:20',
    driverName: '김민수',
    vehicleModel: '벤츠 S560',
    vehiclePlate: '01호 3343',
    customerName: '신세계그룹',
    customerId: 'cust-shinsegae',
    category: 'toll',
    categoryLabel: '통행료',
    merchant: '인천국제공항고속도로 신공항영업소',
    address: '인천 서구 공항고속도로 14',
    amount: 18000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '검수 대기',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_fuel.jpg',
    memo: '호텔신라 ➔ 인천공항 T1 왕복 톨게이트 비용',
    ocrExtracted: true,
    ocrSummary: '신공항하이웨이 인천공항영업소 통행료 18,000원',
  },
  {
    id: 'hq-exp-03',
    no: 3,
    submittedAt: '10/24 11:45',
    submittedDate: '2024. 10. 24 (목)',
    rawDate: '2024-10-24',
    time: '11:45',
    driverName: '이준호',
    vehicleModel: '제네시스 G90 리무진',
    vehiclePlate: '102부 4280',
    customerName: 'CHANEL',
    customerId: 'cust-chanel',
    category: 'parking',
    categoryLabel: '주차비',
    merchant: '코엑스 인터컨티넨탈 호텔 주차장',
    address: '서울 강남구 봉은사로 524',
    amount: 12000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '승인 완료',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_fuel.jpg',
    memo: '고객 오찬 회담 대기 중 주차 요금',
    ocrExtracted: true,
    reviewNotes: '호텔 공식 주차 확인 완료 (법인카드 승인 번호 일치)',
    reviewedAt: '10/24 12:10',
    reviewedBy: '본사 관제실',
  },
  {
    id: 'hq-exp-04',
    no: 4,
    submittedAt: '10/24 10:15',
    submittedDate: '2024. 10. 24 (목)',
    rawDate: '2024-10-24',
    time: '10:15',
    driverName: '윤태준',
    vehicleModel: '현대 스타리아 리무진',
    vehiclePlate: '116허 1514',
    customerName: 'Ferrari',
    customerId: 'cust-ferrari',
    category: 'fuel',
    categoryLabel: '주유비',
    merchant: '서울 만남의광장 주유소',
    address: '서울 서초구 양재대로12길 73-71',
    amount: 72000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '검수 대기',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_fuel.jpg',
    memo: '기사 배차 출발 전 주유 만충',
    ocrExtracted: true,
    ocrSummary: '서울 만남의광장 주유소 경유 72,000원 자동 인식',
  },
  {
    id: 'hq-exp-05',
    no: 5,
    submittedAt: '10/23 18:30',
    submittedDate: '2024. 10. 23 (수)',
    rawDate: '2024-10-23',
    time: '18:30',
    driverName: '박서연',
    vehicleModel: '제네시스 GV80',
    vehiclePlate: '203호 5947',
    customerName: 'Samsung',
    customerId: 'cust-samsung',
    category: 'meal',
    categoryLabel: '식비',
    merchant: '영종도 한식당',
    address: '인천 중구 영종진로 21',
    amount: 15000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '승인 완료',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_cu.jpg',
    memo: 'VIP 야간 장기 대기로 인한 석식 식대',
    ocrExtracted: true,
    reviewNotes: '영수증 및 대기 일지 확인 승인',
    reviewedAt: '10/23 19:00',
    reviewedBy: '본사 관제실',
  },
  {
    id: 'hq-exp-06',
    no: 6,
    submittedAt: '10/23 16:10',
    submittedDate: '2024. 10. 23 (수)',
    rawDate: '2024-10-23',
    time: '16:10',
    driverName: '최동욱',
    vehicleModel: '벤츠 스프린터 519 CDI',
    vehiclePlate: '703서 2658',
    customerName: 'Intercos',
    customerId: 'cust-intercos',
    category: 'wash',
    categoryLabel: '세차비',
    merchant: '강남 프리미엄 손세차 클럽',
    address: '서울 서초구 효령로 320',
    amount: 55000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '승인 완료',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_fuel.jpg',
    memo: '국빈 영접 전 내외관 특수 세차',
    ocrExtracted: true,
    reviewNotes: '정기 특수 세차 배정건 정상 처리',
    reviewedAt: '10/23 17:00',
    reviewedBy: '본사 관제실',
  },
  {
    id: 'hq-exp-07',
    no: 7,
    submittedAt: '10/23 14:00',
    submittedDate: '2024. 10. 23 (수)',
    rawDate: '2024-10-23',
    time: '14:00',
    driverName: '김민수',
    vehicleModel: '벤츠 S560',
    vehiclePlate: '01호 3343',
    customerName: '신세계그룹',
    customerId: 'cust-shinsegae',
    category: 'parking',
    categoryLabel: '주차비',
    merchant: '여의도 파크원 타워 주차장',
    address: '서울 영등포구 여의대로 108',
    amount: 25000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '금액 확인',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_fuel.jpg',
    memo: '고객사 컨퍼런스 4시간 주차',
    ocrExtracted: true,
    reviewNotes: '주차 할인권 미적용 여부 기사 확인 요망',
    reviewedAt: '10/23 15:30',
    reviewedBy: '본사 관제실',
  },
  {
    id: 'hq-exp-08',
    no: 8,
    submittedAt: '10/22 17:40',
    submittedDate: '2024. 10. 22 (화)',
    rawDate: '2024-10-22',
    time: '17:40',
    driverName: '강원우',
    vehicleModel: '제네시스 G90L',
    vehiclePlate: '208호 2269',
    customerName: 'Hyundai',
    customerId: 'cust-hyundai',
    category: 'other',
    categoryLabel: '정비비',
    merchant: '제네시스 강남 서비스센터',
    address: '서울 강남구 영동대로 410',
    amount: 140000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '승인 완료',
    hasReceiptImage: true,
    receiptUrl: '/images/receipt_sample_fuel.jpg',
    memo: '와이퍼 블레이드 교체 및 냉각수 보충',
    ocrExtracted: true,
    reviewNotes: '공식 서비스센터 정비 명세서 확인 승인',
    reviewedAt: '10/22 18:00',
    reviewedBy: '본사 관제실',
  },
];

/**
 * Automatically resolve customer from dispatched schedule, driving log, and fleet assignments
 */
export function resolveCustomerForExpense(params: {
  driverName?: string;
  vehiclePlate?: string;
  date?: string;
  rawDate?: string;
  time?: string;
  memo?: string;
}): { customerName: string; customerId?: string } {
  const driver = (params.driverName || '').trim();
  const plate = (params.vehiclePlate || '').trim();
  const memo = (params.memo || '').toLowerCase();
  const dateStr = params.rawDate || params.date || '';

  // 1. Text keyword hints in memo
  if (memo.includes('ferrari') || memo.includes('페라리')) return { customerName: 'Ferrari', customerId: 'cust-ferrari' };
  if (memo.includes('chanel') || memo.includes('샤넬')) return { customerName: 'CHANEL', customerId: 'cust-chanel' };
  if (memo.includes('bmw')) return { customerName: 'BMW Korea', customerId: 'cust-bmw' };
  if (memo.includes('신세계')) return { customerName: '신세계그룹', customerId: 'cust-shinsegae' };
  if (memo.includes('samsung') || memo.includes('삼성')) return { customerName: 'Samsung', customerId: 'cust-samsung' };
  if (memo.includes('hyundai') || memo.includes('현대')) return { customerName: 'Hyundai', customerId: 'cust-hyundai' };
  if (memo.includes('netflix') || memo.includes('넷플릭스')) return { customerName: 'Netflix', customerId: 'cust-netflix' };
  if (memo.includes('intercos') || memo.includes('인터코스')) return { customerName: 'Intercos', customerId: 'cust-intercos' };
  if (memo.includes('sk') || memo.includes('하이닉스')) return { customerName: 'SK하이닉스', customerId: 'cust-sk' };
  if (memo.includes('lg')) return { customerName: 'LG전자', customerId: 'cust-lg' };

  // 2. Schedule lookup from cache if available in localStorage
  if (typeof window !== 'undefined') {
    try {
      const cachedSchedulesRaw = localStorage.getItem('cockpit_schedules_cache_v1');
      if (cachedSchedulesRaw) {
        const schedules = JSON.parse(cachedSchedulesRaw);
        if (Array.isArray(schedules)) {
          const matched = schedules.find((s) => {
            const dateMatch = !dateStr || s.date === dateStr;
            const driverMatch = driver && s.driver_name && s.driver_name.includes(driver);
            const vehicleMatch = plate && (s.vehicle_no?.includes(plate) || s.vehicle_plate?.includes(plate));
            return dateMatch && (driverMatch || vehicleMatch);
          });
          if (matched) {
            if (matched.customerName) return { customerName: matched.customerName, customerId: matched.customerId };
            if (matched.notes?.includes('CLUB CHALLENGE') || matched.notes?.includes('Ferrari') || matched.passenger?.includes('SOFYAN')) {
              return { customerName: 'Ferrari', customerId: 'cust-ferrari' };
            }
          }
        }
      }
    } catch {}
  }

  // 3. Driver & Vehicle assignment mapping
  if (driver === '정태훈' || plate.includes('5336')) {
    return { customerName: 'BMW Korea', customerId: 'cust-bmw' };
  }
  if (driver === '김민수' || plate.includes('3343')) {
    return { customerName: '신세계그룹', customerId: 'cust-shinsegae' };
  }
  if (driver === '이준호' || plate.includes('4280')) {
    return { customerName: 'CHANEL', customerId: 'cust-chanel' };
  }
  if (driver === '윤태준' || plate.includes('1514') || plate.includes('7811')) {
    return { customerName: 'Ferrari', customerId: 'cust-ferrari' };
  }
  if (driver === '박서연' || plate.includes('5947')) {
    return { customerName: 'Samsung', customerId: 'cust-samsung' };
  }
  if (driver === '최동욱' || plate.includes('2658')) {
    return { customerName: 'Intercos', customerId: 'cust-intercos' };
  }
  if (driver === '강원우' || plate.includes('2269')) {
    return { customerName: 'Hyundai', customerId: 'cust-hyundai' };
  }
  if (driver === '이호준') {
    return { customerName: 'LG전자', customerId: 'cust-lg' };
  }
  if (driver === '정태호') {
    return { customerName: 'SK하이닉스', customerId: 'cust-sk' };
  }
  if (driver === '이재훈') {
    return { customerName: 'Hyundai', customerId: 'cust-hyundai' };
  }

  return { customerName: 'Ferrari', customerId: 'cust-ferrari' };
}

let memoryExpenses: HqExpenseRecord[] = [...INITIAL_HQ_EXPENSES];

/**
 * Read all HQ expenses from localStorage (or memory cache in Node test environment)
 */
export const getHqExpenses = (): HqExpenseRecord[] => {
  if (typeof window === 'undefined') return memoryExpenses;
  try {
    const raw = localStorage.getItem(HQ_EXPENSES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(HQ_EXPENSES_STORAGE_KEY, JSON.stringify(INITIAL_HQ_EXPENSES));
      memoryExpenses = [...INITIAL_HQ_EXPENSES];
      return INITIAL_HQ_EXPENSES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Auto backfill customerName if missing in existing localStorage
      const synced = parsed.map((item) => {
        if (!item.customerName) {
          const resolved = resolveCustomerForExpense({
            driverName: item.driverName,
            vehiclePlate: item.vehiclePlate,
            date: item.rawDate,
            time: item.time,
            memo: item.memo,
          });
          return {
            ...item,
            customerName: resolved.customerName,
            customerId: resolved.customerId,
          };
        }
        return item;
      });
      memoryExpenses = synced;
      return synced;
    }
    return INITIAL_HQ_EXPENSES;
  } catch (err) {
    console.warn('Failed to parse HQ expenses from storage:', err);
    return INITIAL_HQ_EXPENSES;
  }
};

let cachedExpensesRaw = '';
let cachedExpensesSnapshot: HqExpenseRecord[] = INITIAL_HQ_EXPENSES;

export const subscribeHqExpenses = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(HQ_EXPENSE_UPDATE_EVENT, callback);
  window.addEventListener('cockpit_hq_expense_updated', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(HQ_EXPENSE_UPDATE_EVENT, callback);
    window.removeEventListener('cockpit_hq_expense_updated', callback);
    window.removeEventListener('storage', callback);
  };
};

export const getHqExpensesSnapshot = (): HqExpenseRecord[] => {
  if (typeof window === 'undefined') return memoryExpenses;
  try {
    const raw = localStorage.getItem(HQ_EXPENSES_STORAGE_KEY);
    if (raw && raw === cachedExpensesRaw) return cachedExpensesSnapshot;
    const synced = getHqExpenses();
    cachedExpensesRaw = localStorage.getItem(HQ_EXPENSES_STORAGE_KEY) || '';
    cachedExpensesSnapshot = synced;
    return cachedExpensesSnapshot;
  } catch {
    return INITIAL_HQ_EXPENSES;
  }
};

export const getHqExpensesServerSnapshot = (): HqExpenseRecord[] => {
  return INITIAL_HQ_EXPENSES;
};

/**
 * Save all HQ expenses to localStorage & dispatch notification event.
 * Includes a multi-tier quota defense system to prevent browser QuotaExceededError:
 * - Tier 1: Prunes large base64 data URLs from older records (keeping top 3 recent receipt images)
 * - Tier 2: Prunes all base64 data URLs (retaining static image paths and all financial/audit metadata)
 * - Tier 3: Limits maximum retained records to most recent 50
 */
export const saveHqExpenses = (expenses: HqExpenseRecord[]): void => {
  memoryExpenses = expenses;
  if (typeof window === 'undefined') return;

  const tryPersist = (records: HqExpenseRecord[]): boolean => {
    try {
      localStorage.setItem(HQ_EXPENSES_STORAGE_KEY, JSON.stringify(records));
      window.dispatchEvent(
        new CustomEvent(HQ_EXPENSE_UPDATE_EVENT, { detail: { count: records.length } })
      );
      return true;
    } catch (e) {
      return false;
    }
  };

  // 1. Direct attempt
  if (tryPersist(expenses)) return;

  console.warn('[HQ Expense Storage] LocalStorage quota exceeded on direct write. Initiating Tier 1 defense...');

  // 2. Tier 1: Prune large base64 images from older records (beyond the top 3 newest)
  const tier1Records = expenses.map((rec, idx) => {
    if (idx >= 3 && rec.receiptUrl && rec.receiptUrl.startsWith('data:image/')) {
      return { ...rec, receiptUrl: undefined };
    }
    return rec;
  });
  if (tryPersist(tier1Records)) {
    console.info('[HQ Expense Storage] LocalStorage quota relieved via Tier 1 (pruned older receipt images).');
    return;
  }

  // 3. Tier 2: Strip all base64 data URLs (preserve static paths like /images/receipt_sample_fuel.jpg)
  console.warn('[HQ Expense Storage] LocalStorage quota still exceeded. Initiating Tier 2 defense...');
  const tier2Records = expenses.map((rec) => {
    if (rec.receiptUrl && rec.receiptUrl.startsWith('data:image/')) {
      return { ...rec, receiptUrl: undefined };
    }
    return rec;
  });
  if (tryPersist(tier2Records)) {
    console.info('[HQ Expense Storage] LocalStorage quota relieved via Tier 2 (stripped data URLs, metadata preserved).');
    return;
  }

  // 4. Tier 3: Limit to most recent 50 records without base64 images
  console.warn('[HQ Expense Storage] LocalStorage quota critical. Initiating Tier 3 defense...');
  const tier3Records = tier2Records.slice(0, 50);
  if (tryPersist(tier3Records)) {
    console.info('[HQ Expense Storage] LocalStorage quota relieved via Tier 3 (clamped to 50 items).');
    return;
  }

  console.warn('[HQ Expense Storage] Critical storage limit reached. Unable to persist all expenses to LocalStorage.');
};

export interface ExpenseSubmissionContext {
  customerId?: string;
  customerName?: string;
  bookingId?: string;
  eventId?: string;
  drivingLogId?: string;
  billableToCustomer?: boolean;
  approvalNo?: string;
}

/**
 * Submit one or more driver expenses to the HQ Dashboard
 */
export const submitDriverExpensesToHq = (
  items: ExpenseItem[],
  driverName: string = '윤태준',
  vehiclePlate: string = '116허 1514',
  vehicleModel: string = '현대 스타리아 리무진',
  context?: ExpenseSubmissionContext
): { success: boolean; count: number; totalAmount: number; records: HqExpenseRecord[] } => {
  if (!items || items.length === 0) {
    return { success: false, count: 0, totalAmount: 0, records: [] };
  }

  const existing = getHqExpenses();
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const submittedAt = `${m}/${d} ${hours}:${mins}`;
  const submittedDate = `${now.getFullYear()}. ${m}. ${d}`;

  let totalAmount = 0;
  const newRecords: HqExpenseRecord[] = items.map((item, index) => {
    totalAmount += item.amount;
    const catMeta = EXPENSE_CATEGORIES[item.category] || EXPENSE_CATEGORIES.other;
    const payMeta = PAYMENT_METHODS.find((p) => p.key === item.paymentMethod);
    const resolvedCustomer =
      context?.customerName && context?.customerId
        ? { customerName: context.customerName, customerId: context.customerId }
        : resolveCustomerForExpense({
            driverName,
            vehiclePlate,
            date: item.date,
            time: item.time,
            memo: item.memo,
          });

    return {
      id: item.id || `hq-sub-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      no: existing.length + index + 1,
      submittedAt,
      submittedDate,
      rawDate: item.date || `${now.getFullYear()}-${m}-${d}`,
      time: item.time || `${hours}:${mins}`,
      driverName,
      vehicleModel,
      vehiclePlate,
      customerName: context?.customerName || resolvedCustomer.customerName,
      customerId: context?.customerId || resolvedCustomer.customerId,
      bookingId: context?.bookingId,
      eventId: context?.eventId,
      drivingLogId: context?.drivingLogId,
      billableToCustomer:
        context?.billableToCustomer !== undefined
          ? context.billableToCustomer
          : item.category !== 'meal',
      category: item.category,
      categoryLabel: catMeta.label,
      merchant: item.merchant,
      address: item.address,
      amount: item.amount,
      paymentMethod: item.paymentMethod,
      paymentMethodLabel: payMeta?.label || '회사 카드',
      status: '검수 대기',
      receiptUrl: item.receiptUrl,
      hasReceiptImage: Boolean(item.receiptUrl),
      memo: item.memo || '기사 Cockpit 앱에서 제출됨',
      ocrExtracted: Boolean(item.receiptUrl || context?.approvalNo),
      ocrSummary: `${item.merchant} ${item.amount.toLocaleString()}원 결제 내역`,
      ocrDetails: context?.approvalNo
        ? {
            approvalNo: context.approvalNo,
            supplyAmount: Math.round(item.amount / 1.1),
            vat: item.amount - Math.round(item.amount / 1.1),
          }
        : undefined,
    };
  });

  const updated = [...newRecords, ...existing];
  saveHqExpenses(updated);

  // Synchronize directly with driving logs in localStorage
  if (typeof window !== 'undefined') {
    try {
      const rawLogs = localStorage.getItem('cockpit_submitted_driving_logs_v1');
      if (rawLogs) {
        const parsedLogs = JSON.parse(rawLogs);
        if (Array.isArray(parsedLogs)) {
          let logFound = false;
          const syncedLogs = parsedLogs.map((log) => {
            const isMatched = context?.bookingId
              ? log.bookingId === context.bookingId
              : !log.bookingId &&
                (log.driverName === driverName ||
                  (Boolean(vehiclePlate) && log.vehiclePlate === vehiclePlate));

            if (isMatched) {
              const matchingExps = updated.filter((e) =>
                log.bookingId
                  ? e.bookingId === log.bookingId
                  : !e.bookingId &&
                    (e.driverName === driverName ||
                      (Boolean(vehiclePlate) && e.vehiclePlate === vehiclePlate))
              );
              logFound = true;
              return {
                ...log,
                expenseAmount: matchingExps.reduce((sum, e) => sum + e.amount, 0),
                expenseCount: matchingExps.length,
              };
            }
            return log;
          });

          if (logFound) {
            localStorage.setItem('cockpit_submitted_driving_logs_v1', JSON.stringify(syncedLogs));
          }
        }
      }
      // Broadcast update event so 운행일지 dashboard reacts immediately
      window.dispatchEvent(new CustomEvent('cockpit_driving_log_updated'));
    } catch (syncErr) {
      console.warn('Failed to sync driving log with submitted expenses:', syncErr);
    }
  }

  return {
    success: true,
    count: newRecords.length,
    totalAmount,
    records: newRecords,
  };
};

/**
 * Submit a single expense directly from AddExpenseModal
 */
export const submitSingleExpenseToHq = (
  item: ExpenseItem,
  driverName: string = '윤태준',
  vehiclePlate: string = '116허 1514',
  vehicleModel: string = '현대 스타리아 리무진',
  context?: ExpenseSubmissionContext
): HqExpenseRecord => {
  const res = submitDriverExpensesToHq([item], driverName, vehiclePlate, vehicleModel, context);
  return res.records[0] || getHqExpenses()[0];
};

/**
 * Update the review status of an expense record in HQ
 */
export const updateHqExpenseStatus = (
  id: string,
  status: HqExpenseStatus,
  reviewNotes?: string,
  reviewer: string = '본사 관리자'
): HqExpenseRecord | null => {
  const existing = getHqExpenses();
  const index = existing.findIndex((e) => e.id === id);
  if (index === -1) return null;

  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');

  const updatedItem: HqExpenseRecord = {
    ...existing[index],
    status,
    reviewNotes: reviewNotes !== undefined ? reviewNotes : existing[index].reviewNotes,
    reviewedAt: `${m}/${d} ${hours}:${mins}`,
    reviewedBy: reviewer,
  };

  const nextList = [...existing];
  nextList[index] = updatedItem;
  saveHqExpenses(nextList);

  return updatedItem;
};

/**
 * Update arbitrary fields on an HQ expense record (e.g., amount, billableToCustomer, status, category)
 */
export const updateHqExpenseRecord = (
  id: string,
  patch: Partial<HqExpenseRecord>,
  reviewer: string = '본사 관리자'
): HqExpenseRecord | null => {
  const existing = getHqExpenses();
  const index = existing.findIndex((e) => e.id === id);
  if (index === -1) return null;

  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');

  const updatedItem: HqExpenseRecord = {
    ...existing[index],
    ...patch,
    reviewedAt: `${m}/${d} ${hours}:${mins}`,
    reviewedBy: reviewer,
  };

  const nextList = [...existing];
  nextList[index] = updatedItem;
  saveHqExpenses(nextList);

  return updatedItem;
};

/**
 * Calculate KPI summary for HQ Dashboard
 */
export const getHqExpenseKpiSummary = (expenses: HqExpenseRecord[] = getHqExpenses()): HqExpenseKpiSummary => {
  let todayTotal = 0;
  let monthTotal = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let actionNeededCount = 0;

  expenses.forEach((e) => {
    monthTotal += e.amount;
    todayTotal += e.amount;
    if (e.status === '검수 대기') pendingCount += 1;
    else if (e.status === '승인 완료') approvedCount += 1;
    else if (e.status === '금액 확인' || e.status === '반려') actionNeededCount += 1;
  });

  return {
    todayTotal,
    monthTotal,
    pendingCount,
    approvedCount,
    actionNeededCount,
    totalCount: expenses.length,
  };
};

/**
 * Export HQ expenses to CSV
 */
export const exportExpensesToCsv = (expenses: HqExpenseRecord[]): string => {
  const headers = ['No', '제출일시', '기사명', '차량번호', '지출항목', '가맹점/상호', '금액(원)', '결제수단', '상태', '메모'];
  const rows = expenses.map((e) => [
    e.no,
    e.submittedAt,
    e.driverName,
    e.vehiclePlate,
    e.categoryLabel,
    `"${(e.merchant || '').replace(/"/g, '""')}"`,
    e.amount,
    e.paymentMethodLabel,
    e.status,
    `"${(e.memo || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
};

/**
 * Imports confirmed Hi-Pass toll rows into HQ Expenses & Driving Logs with strict duplicate prevention.
 */
export const importReconciledHipassTolls = (
  items: ReconciledHipassItem[],
  reviewer: string = '하이패스 자동정산'
): {
  addedCount: number;
  skippedDuplicates: number;
  totalAmount: number;
  updatedLogsCount: number;
  records: HqExpenseRecord[];
} => {
  if (!items || items.length === 0) {
    return { addedCount: 0, skippedDuplicates: 0, totalAmount: 0, updatedLogsCount: 0, records: [] };
  }

  const existing = getHqExpenses();
  const existingTxKeys = new Set(existing.map((e) => e.hipassTxKey).filter(Boolean));

  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const submittedAt = `${m}/${d} ${hours}:${mins}`;
  const submittedDate = `${now.getFullYear()}. ${m}. ${d}`;

  let skippedDuplicates = 0;
  let totalAmount = 0;
  const newRecords: HqExpenseRecord[] = [];

  items.forEach((item, idx) => {
    if (!item.hipassTxKey || item.amount <= 0) return;

    const sameNaturalToll = existing.some(
      (e) =>
        e.category === 'toll' &&
        e.rawDate === item.rawDate &&
        e.time === item.time &&
        e.amount === item.amount &&
        e.vehiclePlate.replace(/\s+/g, '') === (item.resolvedPlate || item.vehiclePlateRaw).replace(/\s+/g, '')
    );

    if (existingTxKeys.has(item.hipassTxKey) || sameNaturalToll) {
      skippedDuplicates++;
      return;
    }

    existingTxKeys.add(item.hipassTxKey);
    totalAmount += item.amount;

    const resolvedCustomer =
      item.matchedCustomerName
        ? { customerName: item.matchedCustomerName, customerId: item.matchedCustomerId }
        : resolveCustomerForExpense({
            driverName: item.resolvedDriverName,
            vehiclePlate: item.resolvedPlate || item.vehiclePlateRaw,
            rawDate: item.rawDate,
            time: item.time,
          });

    const routeDesc = `${item.entrance} ➔ ${item.exit}`;
    const bookingBadge = item.matchedBookingNo ? ` (${item.matchedBookingNo})` : '';

    newRecords.push({
      id: `hq-hipass-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      no: existing.length + newRecords.length + 1,
      submittedAt,
      submittedDate,
      rawDate: item.rawDate,
      time: item.time,
      driverName: item.resolvedDriverName || '미지정 기사',
      vehicleModel: item.resolvedModel || '법인 차량',
      vehiclePlate: item.resolvedPlate || item.vehiclePlateRaw,
      customerName: resolvedCustomer.customerName,
      customerId: resolvedCustomer.customerId,
      bookingId: item.matchedScheduleId,
      drivingLogId: item.matchedDrivingLogId,
      billableToCustomer: true,
      hipassTxKey: item.hipassTxKey,
      hipassEntrance: item.entrance,
      hipassExit: item.exit,
      hipassCardNo: item.cardNo,
      category: 'toll',
      categoryLabel: '통행료',
      merchant: item.merchantLabel || `하이패스 (${routeDesc})`,
      address: `${item.roadType || '고속도로'} ${routeDesc}`,
      amount: item.amount,
      paymentMethod: item.paymentMethod || 'company_card',
      paymentMethodLabel:
        item.paymentMethod === 'driver_personal' ? '기사 개인 선납 (환급 대상)' : '법인 하이패스 카드',
      status: '승인 완료',
      hasReceiptImage: false,
      memo:
        item.paymentMethod === 'driver_personal'
          ? `[하이패스 기사개인선납 · 환급대상] ${routeDesc} 통행료${bookingBadge}`
          : `[하이패스 자동정산] ${routeDesc} 통행료${bookingBadge}`,
      ocrExtracted: true,
      ocrSummary: `하이패스 ${routeDesc} ${item.amount.toLocaleString()}원 내역 자동 대조 완료`,
      ocrDetails: {
        merchantName: item.merchantLabel || `하이패스 (${routeDesc})`,
        paymentTime: `${item.rawDate} ${item.time}`,
        cardName: '법인 하이패스 카드',
        cardNumber: item.cardNo,
        approvalNo: item.approvalNo,
        supplyAmount: Math.round(item.amount / 1.1),
        vat: item.amount - Math.round(item.amount / 1.1),
        total: item.amount,
      },
      reviewNotes: item.matchedScheduleId
        ? `배차(${item.matchedBookingNo || item.matchedScheduleId.slice(0, 8)}) 및 운행일지 자동 연결 완료`
        : '차량번호 기준 통행료 자동 등록 완료',
      reviewedAt: submittedAt,
      reviewedBy: reviewer,
    });
  });

  if (newRecords.length === 0) {
    return { addedCount: 0, skippedDuplicates, totalAmount: 0, updatedLogsCount: 0, records: [] };
  }

  const updatedExpenses = [...newRecords, ...existing];
  saveHqExpenses(updatedExpenses);

  let updatedLogsCount = 0;
  if (typeof window !== 'undefined') {
    try {
      const rawLogs = localStorage.getItem('cockpit_submitted_driving_logs_v1');
      if (rawLogs) {
        const parsedLogs = JSON.parse(rawLogs);
        if (Array.isArray(parsedLogs)) {
          const syncedLogs = parsedLogs.map((log) => {
            const matchedNewItems = newRecords.filter(
              (rec) =>
                (rec.drivingLogId && rec.drivingLogId === log.id) ||
                (rec.bookingId && log.bookingId && rec.bookingId === log.bookingId) ||
                (rec.rawDate === log.rawDate &&
                  rec.vehiclePlate.replace(/\s+/g, '') === String(log.vehiclePlate || '').replace(/\s+/g, ''))
            );

            if (matchedNewItems.length === 0) return log;

            updatedLogsCount++;
            const addedAmt = matchedNewItems.reduce((s, r) => s + r.amount, 0);
            const prevAudit = Array.isArray(log.reviewHistory) ? log.reviewHistory : [];

            return {
              ...log,
              expenseAmount: (Number(log.expenseAmount) || 0) + addedAmt,
              expenseCount: (Number(log.expenseCount) || 0) + matchedNewItems.length,
              reviewHistory: [
                ...prevAudit,
                {
                  id: `audit-hp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  time: submittedAt,
                  message: `하이패스 통행료 ${matchedNewItems.length}건(${addedAmt.toLocaleString()}원)이 자동 연결되었습니다.`,
                  actor: reviewer,
                  actionType: 'approved',
                },
              ],
            };
          });

          if (updatedLogsCount > 0) {
            localStorage.setItem('cockpit_submitted_driving_logs_v1', JSON.stringify(syncedLogs));
            window.dispatchEvent(new CustomEvent('cockpit_driving_log_updated'));
          }
        }
      }
    } catch (err) {
      console.warn('Failed to sync driving logs with Hi-Pass tolls:', err);
    }
  }

  return {
    addedCount: newRecords.length,
    skippedDuplicates,
    totalAmount,
    updatedLogsCount,
    records: newRecords,
  };
};

/**
 * Hydrates Hi-Pass tolls persisted in Supabase `cockpit.schedules.driving_log` into local HQ Expense view
 * so PC & Mobile share reconciled tolls without duplicates.
 */
export const mergeServerHipassTollsIntoExpenses = (
  serverTolls: Array<{
    hipassTxKey: string;
    scheduleId: string;
    bookingNo: string;
    customerName: string;
    customerId?: string;
    driverName: string;
    vehiclePlate: string;
    vehicleModel: string;
    rawDate: string;
    time: string;
    entrance: string;
    exit: string;
    amount: number;
    cardNo?: string;
    approvalNo?: string;
    syncedAt: string;
  }>
): number => {
  if (!serverTolls || serverTolls.length === 0) return 0;

  const mapped: ReconciledHipassItem[] = serverTolls.map((t, idx) => ({
    rowIndex: idx + 1,
    hipassTxKey: t.hipassTxKey,
    rawDate: t.rawDate,
    time: t.time,
    vehiclePlateRaw: t.vehiclePlate,
    entrance: t.entrance,
    exit: t.exit,
    amount: t.amount,
    cardNo: t.cardNo,
    approvalNo: t.approvalNo,
    merchantLabel: `하이패스 (${t.entrance}→${t.exit})`,
    matchStatus: 'matched',
    matchStatusLabel: '배차 연결됨',
    resolvedPlate: t.vehiclePlate,
    resolvedModel: t.vehicleModel,
    resolvedDriverName: t.driverName,
    matchedScheduleId: t.scheduleId,
    matchedBookingNo: t.bookingNo,
    matchedCustomerName: t.customerName,
    matchedCustomerId: t.customerId,
    isDuplicate: false,
  }));

  const res = importReconciledHipassTolls(mapped, 'Supabase 하이패스 동기화');
  return res.addedCount;
};
