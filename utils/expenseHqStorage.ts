import { HqExpenseRecord, HqExpenseStatus, HqExpenseKpiSummary } from '@/types/expenseHq';
import { ExpenseItem, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/utils/expense';

export const HQ_EXPENSES_STORAGE_KEY = 'cockpit_hq_expenses_v1';
export const HQ_EXPENSE_UPDATE_EVENT = 'cockpit_hq_expense_updated';

// 8 Rich Initial Mock HQ Expenses
export const INITIAL_HQ_EXPENSES: HqExpenseRecord[] = [
  {
    id: 'hq-exp-01',
    no: 1,
    submittedAt: '10/24 14:30',
    submittedDate: '2024. 10. 24 (목)',
    rawDate: '2024-10-24',
    time: '14:30',
    driverName: '정태훈',
    vehicleModel: '카니발 하이리무진',
    vehiclePlate: '서울 78바 3120',
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
    vehicleModel: 'S클래스 8920',
    vehiclePlate: '서울 12가 8920',
    category: 'toll',
    categoryLabel: '통행료',
    merchant: '인천국제공항고속도로 신공항영업소',
    address: '인천 서구 공항고속도로 14',
    amount: 18000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '검수 대기',
    hasReceiptImage: true,
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
    vehicleModel: 'G90 리무진',
    vehiclePlate: '서울 34다 9182',
    category: 'parking',
    categoryLabel: '주차비',
    merchant: '코엑스 인터컨티넨탈 호텔 주차장',
    address: '서울 강남구 봉은사로 524',
    amount: 12000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '승인 완료',
    hasReceiptImage: true,
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
    vehicleModel: '116허 1514',
    vehiclePlate: '116허 1514',
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
    vehicleModel: '마이바흐 GLS',
    vehiclePlate: '서울 56라 4402',
    category: 'meal',
    categoryLabel: '식비',
    merchant: '영종도 한식당',
    address: '인천 중구 영종진로 21',
    amount: 15000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '승인 완료',
    hasReceiptImage: true,
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
    vehicleModel: '스프린터 15인승',
    vehiclePlate: '경기 89바 1029',
    category: 'wash',
    categoryLabel: '세차비',
    merchant: '강남 프리미엄 손세차 클럽',
    address: '서울 서초구 효령로 320',
    amount: 55000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '승인 완료',
    hasReceiptImage: true,
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
    vehicleModel: 'S클래스 8920',
    vehiclePlate: '서울 12가 8920',
    category: 'parking',
    categoryLabel: '주차비',
    merchant: '여의도 파크원 타워 주차장',
    address: '서울 영등포구 여의대로 108',
    amount: 25000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '금액 확인',
    hasReceiptImage: true,
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
    driverName: '강현우',
    vehicleModel: 'G90 리무진',
    vehiclePlate: '서울 23너 6711',
    category: 'other',
    categoryLabel: '정비비',
    merchant: '제네시스 강남 서비스센터',
    address: '서울 강남구 영동대로 410',
    amount: 140000,
    paymentMethod: 'company_card',
    paymentMethodLabel: '회사 카드',
    status: '승인 완료',
    hasReceiptImage: true,
    memo: '와이퍼 블레이드 교체 및 냉각수 보충',
    ocrExtracted: true,
    reviewNotes: '공식 서비스센터 정비 명세서 확인 승인',
    reviewedAt: '10/22 18:00',
    reviewedBy: '본사 관제실',
  },
];

/**
 * Read all HQ expenses from localStorage
 */
export const getHqExpenses = (): HqExpenseRecord[] => {
  if (typeof window === 'undefined') return INITIAL_HQ_EXPENSES;
  try {
    const raw = localStorage.getItem(HQ_EXPENSES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(HQ_EXPENSES_STORAGE_KEY, JSON.stringify(INITIAL_HQ_EXPENSES));
      return INITIAL_HQ_EXPENSES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return INITIAL_HQ_EXPENSES;
  } catch (err) {
    console.warn('Failed to parse HQ expenses from storage:', err);
    return INITIAL_HQ_EXPENSES;
  }
};

/**
 * Save all HQ expenses to localStorage & dispatch notification event
 */
export const saveHqExpenses = (expenses: HqExpenseRecord[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HQ_EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
    window.dispatchEvent(new CustomEvent(HQ_EXPENSE_UPDATE_EVENT, { detail: { count: expenses.length } }));
  } catch (err) {
    console.error('Failed to save HQ expenses to storage:', err);
  }
};

/**
 * Submit one or more driver expenses to the HQ Dashboard
 */
export const submitDriverExpensesToHq = (
  items: ExpenseItem[],
  driverName: string = '윤태준',
  vehiclePlate: string = '116허 1514',
  vehicleModel: string = '카니발 하이리무진'
): { success: boolean; count: number; totalAmount: number } => {
  if (!items || items.length === 0) {
    return { success: false, count: 0, totalAmount: 0 };
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

    return {
      id: `hq-sub-${Date.now()}-${index}`,
      no: existing.length + index + 1,
      submittedAt,
      submittedDate,
      rawDate: item.date || `${now.getFullYear()}-${m}-${d}`,
      time: item.time || `${hours}:${mins}`,
      driverName,
      vehicleModel,
      vehiclePlate,
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
      ocrExtracted: Boolean(item.receiptUrl),
      ocrSummary: `${item.merchant} ${item.amount.toLocaleString()}원 결제 내역`,
    };
  });

  const updated = [...newRecords, ...existing];
  saveHqExpenses(updated);

  return {
    success: true,
    count: newRecords.length,
    totalAmount,
  };
};

/**
 * Submit a single expense directly from AddExpenseModal
 */
export const submitSingleExpenseToHq = (
  item: ExpenseItem,
  driverName: string = '윤태준',
  vehiclePlate: string = '116허 1514',
  vehicleModel: string = '카니발 하이리무진'
): HqExpenseRecord => {
  submitDriverExpensesToHq([item], driverName, vehiclePlate, vehicleModel);
  const updated = getHqExpenses();
  return updated[0];
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
 * Calculate KPI summary for HQ Dashboard
 */
export const getHqExpenseKpiSummary = (expenses: HqExpenseRecord[] = getHqExpenses()): HqExpenseKpiSummary => {
  const todayRaw = new Date().toISOString().slice(0, 10);
  let todayTotal = 0;
  let monthTotal = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let actionNeededCount = 0;

  expenses.forEach((e) => {
    monthTotal += e.amount;
    if (e.rawDate === todayRaw || e.submittedAt.includes(new Date().getMonth() + 1 + '/')) {
      todayTotal += e.amount;
    }
    if (e.status === '검수 대기') pendingCount += 1;
    else if (e.status === '승인 완료') approvedCount += 1;
    else if (e.status === '금액 확인' || e.status === '반려') actionNeededCount += 1;
  });

  return {
    todayTotal: todayTotal || 170000,
    monthTotal: monthTotal || 4320000,
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
