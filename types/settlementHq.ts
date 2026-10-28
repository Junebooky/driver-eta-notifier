import { HqExpenseRecord } from './expenseHq';

export type PricingTierSource =
  | 'preset'            // 1단계: 공통 임시 요금 프리셋
  | 'customer_contract' // 2단계: 고객사별 계약 요금
  | 'event_special'     // 3단계: 행사별 특별 요금
  | 'booking_override'  // 4단계: 개별 배차 관리자 확정 요금
  | 'unregistered';     // 요금 미등록 상태

export type ServiceIncludeMode = 'with_driver' | 'vehicle_only';

export type RequestedDriverLanguage = 'ko' | 'en' | 'other';

export type VatHandlingMode = 'unset' | 'excluded' | 'included';

export type ProfitConfirmStatus = 'provisional' | 'confirmed';

export interface DriverProfilePreset {
  id: string;
  name: string;
  phone: string;
  defaultVehicleRaw: string;
  plate: string;
  vehicleTier: 'sprinter' | 'general';
  isEnglishVerified: boolean;
  serviceLanguages: ('ko' | 'en' | 'ja' | 'zh')[];
  languageLabel: string; // e.g. "영어 가능 (검증됨)" | "한국어 전용"
  // 10시간 기본 인건비 (스프린터: 한 15만 / 영 20만, 일반차량: 한 10만 / 영 15만)
  baseLaborRateKo10h: number;
  baseLaborRateEn10h: number;
  customContractLaborRate?: number; // 기사별 개별 계약 수정값
  overtimeLaborRatePerHour?: number; // 미정일 경우 undefined (임의 계산 금지)
}

export interface VehiclePricingPreset {
  presetKey: string;
  modelKeyword: string;        // e.g. "스프린터 519 CDI", "스프린터 319 CDI", "스타리아", "G90L"
  displayName: string;         // 제조사명 제거된 표시명
  vehicleTier: 'sprinter' | 'general';
  baseHours: number;           // 기본 10시간
  vehicleOnlyRate: number;     // 차량만 대여 요금 (KRW)
  withDriverRate: number;      // 기사 포함 고객사 청구 요금 (KRW)
  overtimeRatePerHour?: number;// 초과시간당 요금 (미정 시 undefined)
  isTemporaryPreset: boolean;  // 임시 프리셋 여부
  isRegistered: boolean;       // 요금 등록 여부
}

export interface AppliedPricingSnapshot {
  capturedAt: string;
  pricingSource: PricingTierSource;
  isTemporaryPreset: boolean;
  serviceMode: ServiceIncludeMode;
  requestedLanguage: RequestedDriverLanguage;
  baseHours: number;
  baseVehicleFare: number;
  overtimeHourlyRate?: number;
  driverLaborCost10h: number;
  vatMode: VatHandlingMode;
}

export interface CustomerContractTerms {
  baseHours: number;              // e.g. 10 (hours)
  baseRate: number;               // e.g. 650000 (KRW) per vehicle
  vehicleOnlyRate?: number;       // 차량만 대여 시 계약 요금
  overtimeHourlyRate?: number;    // 초과시간 요율 (미등록 시 undefined -> 임의 계산 금지)
  roundingUnitMinutes: number;    // 10, 30, 60, or 1 (minute)
  roundingMethod: 'ceil' | 'round' | 'floor' | 'exact';
  includedKm?: number;            // e.g. 100
  overDistanceRatePerKm?: number; // e.g. 2000
  vatMode?: VatHandlingMode;      // 'unset' | 'excluded' | 'included'
  taxIncluded?: boolean;
  isTemporaryPreset?: boolean;    // true when using temporary preset
  pricingSource?: PricingTierSource;
  currency?: string;              // default 'KRW'
  notes?: string;                 // contract special conditions
}

export interface EventVehicleSettlement {
  vehicleIndex: number;           // 1호차, 2호차...
  vehiclePlate: string;           // "703서 2658"
  vehicleModel: string;           // "스프린터 519 CDI" (제조사명 제거됨)
  vehicleModelRaw?: string;       // "벤츠 스프린터 519 CDI"
  vehicleTier: 'sprinter' | 'general';
  driverName: string;             // "정태훈"
  driverPhone?: string;           // "010-5542-1928"
  driverIsEnglishVerified?: boolean;
  requestedLanguage: RequestedDriverLanguage;
  languageMismatchWarning?: string; // 영어 요청에 한국어 기사 배정 시 경고
  englishSurchargeNotice?: string;  // "영어 가능 기사 요청 — 고객사 추가할증 미정 (관리자 확인 필요)"
  serviceMode: ServiceIncludeMode;  // 'with_driver' | 'vehicle_only'
  pricingSource: PricingTierSource;
  isTemporaryPreset: boolean;

  bookingId?: string;
  bookingNo?: string;
  drivingLogId?: string;
  drivingLogStatus?: string;

  // 1. Garage vs Customer Service Times (핵심 운영 원칙)
  garageDepartureTime?: string;   // e.g. "08:00" (차고지 픽업 - 청구 제외)
  customerServiceStart: string;   // e.g. "09:00" (고객사 서비스 시작)
  customerServiceEnd: string;     // e.g. "21:50" (고객사 서비스 종료)
  garageArrivalTime?: string;     // e.g. "22:30" (차고지 복귀 - 청구 제외)
  totalDutyFormatted?: string;    // e.g. "14시간 30분" (법정 근로시간 관리용 기록 보존)

  // 2. Calculated Service Times (고객사 청구 기준)
  customerServiceMinutes: number; // 770 (12시간 50분)
  customerServiceFormatted: string; // "12시간 50분"
  baseContractHours: number;      // 10
  overtimeMinutes: number;        // 170 (2시간 50분)
  billedOvertimeHours: number;    // 3.0 (based on rounding rule)
  overtimeFormatted: string;      // "2시간 50분"
  billedOvertimeFormatted: string; // "3시간 (30분 올림 기준)" or "초과요율 미정"

  // 3. Client Billing Fares (고객사 청구 금액 — 기사 인건비 이중 합산 금지)
  baseFare: number;               // e.g. 800,000원 (Sprinter 519 CDI 기사포함)
  overtimeFare: number;           // 초과요율 등록 시 계산, 미정 시 0원 + 확인 필요 표시
  isOvertimeRateConfirmed: boolean;
  vehicleFareSubtotal: number;    // baseFare + overtimeFare
  hasContractTerms: boolean;      // if false, fares are 0
  contractWarning?: string;       // "요금 미등록 / 초과요율 확인 필요"

  // 4. Mileage & Notes
  mileageKm?: string;             // "280 km"
  notes?: string;                 // 운행 특이사항

  // 5. Expenses & Receipts (고객 재청구 실비 vs 회사 부담 직접비 분리)
  expenses: HqExpenseRecord[];
  approvedExpensesTotal: number;  // 관리자 승인 완료된 고객 재청구 실비
  companyDirectExpensesTotal: number; // 회사 자체 부담 차량 직접비 (유류비/유지비 등)
  pendingExpensesTotal: number;   // 미승인/검수대기 (청구 미반영)
  hasDuplicateWarning?: boolean;  // 중복 영수증 의심 플래그

  // 6. Company Cost & Direct Profit Analysis (관리자 전용, 고객사 리포트에 절대 노출 금지)
  clientTotalRevenue: number;     // vehicleFareSubtotal + approvedExpensesTotal (고객사 매출)
  driverLaborCost: number;        // 기사 인건비 (차량만 대여 시 0원, 스프린터 한15만/영20만, 일반 한10만/영15만)
  driverOvertimeLaborWarning?: string; // 초과 근무 발생 시 "기사 초과수당 요율 미정 (관리자 확인)"
  vehicleDirectCost: number;      // 차량 직접비
  otherDirectCost: number;        // 기타 직접비 (외주비 등)
  directProfit: number;           // 고객사 매출 - 기사 인건비 - 차량 직접비 - 기타 직접비
  directMarginPercent: number;    // (directProfit / clientTotalRevenue) * 100
  profitConfirmStatus: ProfitConfirmStatus; // 'provisional' (잠정 수익) | 'confirmed' (확정 직접이익)

  // 7. Real-time Status & ETA
  dispatchStatus?: string;        // "운행 완료" | "운행 중" | "도착"
  lastEta?: string;
}

export type SettlementReportStatus = 'draft' | 'reviewing' | 'approved' | 'invoiced';

export interface EventSettlementReport {
  id: string;                    // "rep-chanel-cruise-2024"
  reportNo: string;              // "REP-20241026-001"
  status: SettlementReportStatus;
  createdAt: string;

  // 1. Client & Agency & Brand Relationship
  customerId: string;            // "cust-chanel"
  customerName: string;          // "CHANEL"
  orderingAgency?: string;       // "제일기획" (대행사 발주 시)
  endBrand: string;              // "CHANEL"
  billingTarget: 'ordering_agency' | 'end_brand' | 'custom';
  billingTargetName: string;     // 실제 청구 대상

  // 2. Event Info
  eventId: string;
  eventName: string;             // "2024 CHANEL Cruise Collection Preview"
  eventDate: string;             // "2024. 10. 22"
  location: string;              // "조선팰리스 서울 강남"
  groupId?: string;              // linked booking group

  // 3. Pricing & Contract Terms applied
  pricingSource: PricingTierSource;
  isTemporaryPreset: boolean;
  vatMode: VatHandlingMode;
  contractTerms?: CustomerContractTerms;
  contractWarning?: string;      // "임시 단가 프리셋 적용 중 / 계약조건 확인 필요"

  // 4. Vehicles & Drivers list
  vehicles: EventVehicleSettlement[];
  totalVehiclesCount: number;

  // 5. Client Billing Totals (고객사 청구 항목)
  totalCustomerServiceMinutes: number;
  totalServiceHoursFormatted: string;
  totalOvertimeMinutes: number;
  totalOvertimeHoursFormatted: string;
  totalBaseFare: number;
  totalOvertimeFare: number;
  totalVehicleFare: number;
  totalApprovedExpenses: number; // 고객 청구 승인 실비 합계
  totalPendingExpenses: number;
  supplyAmount: number;          // 공급가액 (차량요금 + 고객청구 승인경비)
  vatAmount: number;             // VAT (vatMode === 'excluded' 일 때 10%, 'unset' 이면 0)
  grandTotal: number;            // 최종 청구금액

  // 6. Internal Profitability Totals (본사 관리자 전용 - 고객사 리포트 제외)
  totalDriverLaborCost: number;  // 기사 인건비 합계
  totalVehicleDirectCost: number;// 차량 직접비 합계
  totalOtherDirectCost: number;  // 기타 직접비 합계
  totalDirectCost: number;       // 총 직접원가 (기사 인건비 + 차량 직접비 + 기타 직접비)
  totalDirectProfit: number;     // 배차별 직접이익 합계 (고객사 매출 - 총 직접원가)
  averageDirectMarginPercent: number; // 직접이익률 (%)
  profitConfirmStatus: ProfitConfirmStatus;
  // 향후 영업이익/순이익 확장용 필드
  indirectCostAllocation?: number; // 본사 관리비/간접비 배부액
  estimatedOperatingProfit?: number; // 추정 영업이익
  taxAndFinanceCost?: number;      // 금융비용 및 세금
  estimatedNetProfit?: number;     // 추정 순이익

  // 7. Review & Audit
  adminNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
}
