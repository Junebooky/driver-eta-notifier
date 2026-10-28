/**
 * Pure Calculation Engine for Customer Service Times, Overtime, Multi-Tier Pricing,
 * Driver Labor Presets, and Direct Profit Analysis.
 *
 * Implements strict adherence to core operational principles:
 * 1. Customer billing time is strictly from Customer Service Start to Customer Service End.
 * 2. Garage pickup / repositioning time is excluded from customer billing and overtime.
 * 3. 4-Tier pricing hierarchy: booking_override > event_special > customer_contract > preset.
 * 4. "With Driver" vehicle rate is the client billing price — NEVER double-charge driver labor to the client.
 * 5. "Vehicle Only" mode does not automatically charge driver labor (0 KRW).
 * 6. English driver request does not fabricate client surcharge — marks "관리자 확인 필요".
 * 7. Direct Profit = Client Revenue - Driver Labor - Vehicle Direct Cost - Other Direct Cost.
 */

import {
  AppliedPricingSnapshot,
  CustomerContractTerms,
  DriverProfilePreset,
  EventSettlementReport,
  EventVehicleSettlement,
  PricingTierSource,
  ProfitConfirmStatus,
  RequestedDriverLanguage,
  ServiceIncludeMode,
  VatHandlingMode,
  VehiclePricingPreset,
} from '@/types/settlementHq';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { HqExpenseRecord } from '@/types/expenseHq';
import { HqBooking } from '@/types/hq';
import { HqCustomer } from '@/types/customerHq';
import { stripManufacturerName } from '@/utils/vehicleData';

/**
 * 1. 기본 임시 차량 요금 프리셋 (기본 10시간 기준, 원화 KRW, 수정 가능)
 * - Sprinter 519 CDI: 차량만 600,000원 / 기사 포함 800,000원
 * - Sprinter 319 CDI: 차량만 800,000원 / 기사 포함 1,000,000원
 * - 일반 차종 (스타리아, 카니발, G90, GV80, S560): 임시 프리셋 설정
 */
export const DEFAULT_VEHICLE_PRICING_PRESETS: VehiclePricingPreset[] = [
  {
    presetKey: 'sprinter_519',
    modelKeyword: '519 CDI',
    displayName: 'Sprinter 519 CDI',
    vehicleTier: 'sprinter',
    baseHours: 10,
    vehicleOnlyRate: 600000,
    withDriverRate: 800000,
    isTemporaryPreset: true,
    isRegistered: true,
  },
  {
    presetKey: 'sprinter_319',
    modelKeyword: '319 CDI',
    displayName: 'Sprinter 319 CDI',
    vehicleTier: 'sprinter',
    baseHours: 10,
    vehicleOnlyRate: 800000,
    withDriverRate: 1000000,
    isTemporaryPreset: true,
    isRegistered: true,
  },
  {
    presetKey: 's_560',
    modelKeyword: 'S560',
    displayName: 'S 560',
    vehicleTier: 'general',
    baseHours: 10,
    vehicleOnlyRate: 500000,
    withDriverRate: 650000,
    isTemporaryPreset: true,
    isRegistered: true,
  },
  {
    presetKey: 'g90_limo',
    modelKeyword: 'G90L',
    displayName: 'G90L / G90 리무진',
    vehicleTier: 'general',
    baseHours: 10,
    vehicleOnlyRate: 450000,
    withDriverRate: 600000,
    isTemporaryPreset: true,
    isRegistered: true,
  },
  {
    presetKey: 'g90_standard',
    modelKeyword: 'G90',
    displayName: 'G90',
    vehicleTier: 'general',
    baseHours: 10,
    vehicleOnlyRate: 350000,
    withDriverRate: 500000,
    isTemporaryPreset: true,
    isRegistered: true,
  },
  {
    presetKey: 'gv80',
    modelKeyword: 'GV80',
    displayName: 'GV80',
    vehicleTier: 'general',
    baseHours: 10,
    vehicleOnlyRate: 350000,
    withDriverRate: 500000,
    isTemporaryPreset: true,
    isRegistered: true,
  },
  {
    presetKey: 'carnival',
    modelKeyword: '카니발',
    displayName: '카니발 리무진 / 하이리무진',
    vehicleTier: 'general',
    baseHours: 10,
    vehicleOnlyRate: 300000,
    withDriverRate: 450000,
    isTemporaryPreset: true,
    isRegistered: true,
  },
  {
    presetKey: 'staria',
    modelKeyword: '스타리아',
    displayName: '스타리아 리무진',
    vehicleTier: 'general',
    baseHours: 10,
    vehicleOnlyRate: 280000,
    withDriverRate: 400000,
    isTemporaryPreset: true,
    isRegistered: true,
  },
];

/**
 * 2. 기사 인건비 기준 (회사 지급 기준, 10시간 기본)
 * - 스프린터 (519, 319): 한국어 서비스 기사 150,000원 / 영어 서비스 가능 기사 200,000원
 * - 일반차량 (스타리아, G90, GV80, 카니발, S560): 스프린터보다 50,000원 낮음 (한국어 100,000원 / 영어 150,000원)
 */
export const DRIVER_LABOR_RATES = {
  sprinter: {
    ko: 150000,
    en: 200000,
  },
  general: {
    ko: 100000,
    en: 150000,
  },
} as const;

export const DEFAULT_DRIVER_PROFILES: DriverProfilePreset[] = [
  {
    id: '윤태준',
    name: '윤태준',
    phone: '010-8842-1920',
    defaultVehicleRaw: '현대 스타리아 리무진',
    plate: '116허 1514',
    vehicleTier: 'general',
    isEnglishVerified: true,
    serviceLanguages: ['ko', 'en'],
    languageLabel: '영어 가능 (검증됨)',
    baseLaborRateKo10h: DRIVER_LABOR_RATES.general.ko,
    baseLaborRateEn10h: DRIVER_LABOR_RATES.general.en,
  },
  {
    id: '김민수',
    name: '김민수',
    phone: '010-3829-4821',
    defaultVehicleRaw: '벤츠 S560',
    plate: '01호 3343',
    vehicleTier: 'general',
    isEnglishVerified: true,
    serviceLanguages: ['ko', 'en'],
    languageLabel: '영어 가능 (검증됨)',
    baseLaborRateKo10h: DRIVER_LABOR_RATES.general.ko,
    baseLaborRateEn10h: DRIVER_LABOR_RATES.general.en,
  },
  {
    id: '박서연',
    name: '박서연',
    phone: '010-7281-9304',
    defaultVehicleRaw: '제네시스 G90 리무진',
    plate: '102부 4280',
    vehicleTier: 'general',
    isEnglishVerified: true,
    serviceLanguages: ['ko', 'en'],
    languageLabel: '영어 가능 (검증됨)',
    baseLaborRateKo10h: DRIVER_LABOR_RATES.general.ko,
    baseLaborRateEn10h: DRIVER_LABOR_RATES.general.en,
  },
  {
    id: '최영식',
    name: '최영식',
    phone: '010-2341-9876',
    defaultVehicleRaw: '벤츠 스프린터 투어러 (319 CDI)',
    plate: '125호 9982',
    vehicleTier: 'sprinter',
    isEnglishVerified: true,
    serviceLanguages: ['ko', 'en'],
    languageLabel: '영어 가능 (검증됨)',
    baseLaborRateKo10h: DRIVER_LABOR_RATES.sprinter.ko,
    baseLaborRateEn10h: DRIVER_LABOR_RATES.sprinter.en,
  },
  {
    id: '정태훈',
    name: '정태훈',
    phone: '010-5542-1928',
    defaultVehicleRaw: '벤츠 스프린터 519 CDI',
    plate: '703서 2658',
    vehicleTier: 'sprinter',
    isEnglishVerified: false,
    serviceLanguages: ['ko'],
    languageLabel: '한국어 서비스',
    baseLaborRateKo10h: DRIVER_LABOR_RATES.sprinter.ko,
    baseLaborRateEn10h: DRIVER_LABOR_RATES.sprinter.en,
  },
  {
    id: '이재훈',
    name: '이재훈',
    phone: '010-9182-3746',
    defaultVehicleRaw: '기아 카니발 하이리무진',
    plate: '193호 5336',
    vehicleTier: 'general',
    isEnglishVerified: false,
    serviceLanguages: ['ko'],
    languageLabel: '한국어 서비스',
    baseLaborRateKo10h: DRIVER_LABOR_RATES.general.ko,
    baseLaborRateEn10h: DRIVER_LABOR_RATES.general.en,
  },
  {
    id: '이준호',
    name: '이준호',
    phone: '010-8831-2940',
    defaultVehicleRaw: '제네시스 GV80',
    plate: '203호 5947',
    vehicleTier: 'general',
    isEnglishVerified: false,
    serviceLanguages: ['ko'],
    languageLabel: '한국어 서비스',
    baseLaborRateKo10h: DRIVER_LABOR_RATES.general.ko,
    baseLaborRateEn10h: DRIVER_LABOR_RATES.general.en,
  },
];

/**
 * Determine whether a vehicle model belongs to 'sprinter' or 'general' tier
 */
export function resolveVehicleTier(rawModel?: string | null): 'sprinter' | 'general' {
  if (!rawModel) return 'general';
  const normalized = rawModel.toLowerCase();
  if (
    normalized.includes('스프린터') ||
    normalized.includes('sprinter') ||
    normalized.includes('519') ||
    normalized.includes('319')
  ) {
    return 'sprinter';
  }
  return 'general';
}

/**
 * Find matching vehicle pricing preset from vehicle model string
 */
export function findVehiclePricingPreset(
  rawModel?: string | null,
  customPresets: VehiclePricingPreset[] = DEFAULT_VEHICLE_PRICING_PRESETS
): VehiclePricingPreset | null {
  if (!rawModel || rawModel === '-' || rawModel === '미배정') return null;
  const normalized = rawModel.toUpperCase().replace(/\s+/g, '');

  if (normalized.includes('519')) {
    return customPresets.find((p) => p.presetKey === 'sprinter_519') || null;
  }
  if (normalized.includes('319') || normalized.includes('투어러') || normalized.includes('스프린터')) {
    return customPresets.find((p) => p.presetKey === 'sprinter_319') || null;
  }
  if (normalized.includes('S560') || normalized.includes('S클래스') || normalized.includes('S-CLASS')) {
    return customPresets.find((p) => p.presetKey === 's_560') || null;
  }
  if (normalized.includes('G90L') || normalized.includes('G90리무진')) {
    return customPresets.find((p) => p.presetKey === 'g90_limo') || null;
  }
  if (normalized.includes('G90')) {
    return customPresets.find((p) => p.presetKey === 'g90_standard') || null;
  }
  if (normalized.includes('GV80') || normalized.includes('G80')) {
    return customPresets.find((p) => p.presetKey === 'gv80') || null;
  }
  if (normalized.includes('카니발')) {
    return customPresets.find((p) => p.presetKey === 'carnival') || null;
  }
  if (normalized.includes('스타리아')) {
    return customPresets.find((p) => p.presetKey === 'staria') || null;
  }

  return null;
}

/**
 * Find driver profile by name or ID
 */
export function findDriverProfile(
  driverName?: string | null,
  profiles: DriverProfilePreset[] = DEFAULT_DRIVER_PROFILES
): DriverProfilePreset | undefined {
  if (!driverName || driverName === '-' || driverName === '미배정') return undefined;
  const clean = driverName.replace(/\s*기사$/, '').trim();
  return profiles.find((d) => d.name === clean || d.id === clean);
}

/**
 * Sort and filter drivers by requested language:
 * - When 'en' is requested, verified English-capable drivers come first.
 */
export function getSortedDriversForLanguage(
  requestedLanguage: RequestedDriverLanguage,
  profiles: DriverProfilePreset[] = DEFAULT_DRIVER_PROFILES
): {
  driver: DriverProfilePreset;
  isLanguageMatched: boolean;
  mismatchWarning?: string;
}[] {
  const list = profiles.map((driver) => {
    const isLanguageMatched =
      requestedLanguage === 'en' ? driver.isEnglishVerified : true;
    const mismatchWarning =
      requestedLanguage === 'en' && !driver.isEnglishVerified
        ? `${driver.name} 기사는 영어 서비스 가능 여부가 검증되지 않았습니다. 예외 배정 시 관리자 확인이 필요합니다.`
        : undefined;
    return { driver, isLanguageMatched, mismatchWarning };
  });

  if (requestedLanguage === 'en') {
    list.sort((a, b) => Number(b.driver.isEnglishVerified) - Number(a.driver.isEnglishVerified));
  }

  return list;
}

/**
 * Calculate driver 10-hour base labor cost (회사 지급 기준)
 * - If vehicle_only: 0 KRW
 * - If driver has customContractLaborRate: use that
 * - Otherwise:
 *   - Sprinter: Korean 150,000 / English 200,000
 *   - General (Staria, G90, GV80, Carnival, S560): Korean 100,000 / English 150,000 (50,000 lower than Sprinter)
 */
export function calculateDriverLaborCost(params: {
  driverName?: string | null;
  vehicleModel?: string | null;
  serviceMode?: ServiceIncludeMode;
  customLaborOverride?: number;
  profiles?: DriverProfilePreset[];
}): {
  driverLaborCost: number;
  isEnglishVerified: boolean;
  vehicleTier: 'sprinter' | 'general';
} {
  const {
    driverName,
    vehicleModel,
    serviceMode = 'with_driver',
    customLaborOverride,
    profiles = DEFAULT_DRIVER_PROFILES,
  } = params;

  const vehicleTier = resolveVehicleTier(vehicleModel);

  // 차량만 선택한 경우 기사 인건비를 자동 부과하지 않는다
  if (serviceMode === 'vehicle_only') {
    return { driverLaborCost: 0, isEnglishVerified: false, vehicleTier };
  }

  if (typeof customLaborOverride === 'number' && customLaborOverride >= 0) {
    const profile = findDriverProfile(driverName, profiles);
    return {
      driverLaborCost: customLaborOverride,
      isEnglishVerified: profile?.isEnglishVerified ?? false,
      vehicleTier,
    };
  }

  const profile = findDriverProfile(driverName, profiles);
  const isEnglish = profile?.isEnglishVerified ?? false;

  if (profile?.customContractLaborRate !== undefined) {
    return {
      driverLaborCost: profile.customContractLaborRate,
      isEnglishVerified: isEnglish,
      vehicleTier,
    };
  }

  const tierRates = DRIVER_LABOR_RATES[vehicleTier];
  const driverLaborCost = isEnglish ? tierRates.en : tierRates.ko;

  return {
    driverLaborCost,
    isEnglishVerified: isEnglish,
    vehicleTier,
  };
}

/**
 * Parse "HH:mm" time into total minutes from 00:00
 */
export function timeToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h * 60 + m;
}

/**
 * Format total minutes into "X시간 Y분"
 */
export function formatMinutesKorean(minutes: number): string {
  const safeMin = Math.max(0, Math.round(minutes));
  const h = Math.floor(safeMin / 60);
  const m = safeMin % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/**
 * Calculate duration between two "HH:mm" times with overnight rollover support.
 */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end < start) {
    end += 24 * 60; // Overnight rollover
  }
  return Math.max(0, end - start);
}

/**
 * Extract customer service start and end times from a driving log.
 * - Garage departure (차고지) is excluded.
 * - Service start is the first customer-related stop (or booking pickup time).
 * - Service end is the last customer-related stop (before garage return).
 */
export function resolveServiceTimes(
  log?: HqDrivingLog | null,
  fallbackBooking?: HqBooking | null
): {
  garageDeparture: string;
  serviceStart: string;
  serviceEnd: string;
  garageArrival: string;
  source: 'driving_log_explicit' | 'driving_log_stops' | 'booking_fallback';
} {
  if (log?.customerServiceStart && log?.customerServiceEnd) {
    return {
      garageDeparture: log.garageDepartureTime || log.clockIn || '08:00',
      serviceStart: log.customerServiceStart,
      serviceEnd: log.customerServiceEnd,
      garageArrival: log.garageArrivalTime || log.clockOut || '21:00',
      source: 'driving_log_explicit',
    };
  }

  if (log?.stops && log.stops.length >= 2) {
    const stops = log.stops;
    let startStop = stops.find(
      (s) =>
        s.note?.includes('픽업') ||
        s.note?.includes('탑승') ||
        (!s.place.includes('차고지') && !s.place.includes('출근'))
    );
    if (!startStop) startStop = stops[1] || stops[0];

    const reversed = [...stops].reverse();
    let endStop = reversed.find(
      (s) =>
        s.note?.includes('하차') ||
        s.note?.includes('종료') ||
        (!s.place.includes('차고지') && !s.place.includes('퇴근') && !s.place.includes('입고'))
    );
    if (!endStop || endStop === startStop) endStop = reversed[1] || stops[stops.length - 1];

    const garageDep = stops[0]?.time || log.clockIn || '08:00';
    const garageArr = stops[stops.length - 1]?.time || log.clockOut || '21:00';

    return {
      garageDeparture: garageDep,
      serviceStart: startStop.time,
      serviceEnd: endStop.time,
      garageArrival: garageArr,
      source: 'driving_log_stops',
    };
  }

  const bPickup = fallbackBooking?.pickupTime || '09:00';
  return {
    garageDeparture: '08:00',
    serviceStart: bPickup,
    serviceEnd: '19:00',
    garageArrival: '20:00',
    source: 'booking_fallback',
  };
}

/**
 * 4-Tier Pricing Priority Resolution:
 * 1. booking_override (appliedPricingSnapshot on booking)
 * 2. event_special (customContractTerms on event/report)
 * 3. customer_contract (customer.contractTerms)
 * 4. preset (DEFAULT_VEHICLE_PRICING_PRESETS)
 * 5. unregistered (if vehicle model has no preset and no contract)
 */
export function resolveEffectivePricingTerms(params: {
  vehicleModel?: string | null;
  serviceMode?: ServiceIncludeMode;
  bookingSnapshot?: AppliedPricingSnapshot | null;
  eventSpecialTerms?: CustomerContractTerms | null;
  customerContractTerms?: CustomerContractTerms | null;
  vehiclePresets?: VehiclePricingPreset[];
}): {
  pricingSource: PricingTierSource;
  isTemporaryPreset: boolean;
  hasContractTerms: boolean;
  baseHours: number;
  baseFare: number;
  overtimeHourlyRate?: number;
  roundingUnitMinutes: number;
  roundingMethod: 'ceil' | 'round' | 'floor' | 'exact';
  vatMode: VatHandlingMode;
  contractWarning?: string;
} {
  const {
    vehicleModel,
    serviceMode = 'with_driver',
    bookingSnapshot,
    eventSpecialTerms,
    customerContractTerms,
    vehiclePresets = DEFAULT_VEHICLE_PRICING_PRESETS,
  } = params;

  // Tier 4 (Highest Priority): Individual Booking Snapshot Override
  if (bookingSnapshot && bookingSnapshot.pricingSource === 'booking_override') {
    return {
      pricingSource: 'booking_override',
      isTemporaryPreset: bookingSnapshot.isTemporaryPreset,
      hasContractTerms: true,
      baseHours: bookingSnapshot.baseHours || 10,
      baseFare: bookingSnapshot.baseVehicleFare,
      overtimeHourlyRate: bookingSnapshot.overtimeHourlyRate,
      roundingUnitMinutes: 30,
      roundingMethod: 'ceil',
      vatMode: bookingSnapshot.vatMode || 'unset',
    };
  }

  // Tier 3: Event Special Terms
  if (eventSpecialTerms && eventSpecialTerms.baseRate > 0) {
    const rate =
      serviceMode === 'vehicle_only' && eventSpecialTerms.vehicleOnlyRate !== undefined
        ? eventSpecialTerms.vehicleOnlyRate
        : eventSpecialTerms.baseRate;
    return {
      pricingSource: eventSpecialTerms.pricingSource || 'event_special',
      isTemporaryPreset: Boolean(eventSpecialTerms.isTemporaryPreset),
      hasContractTerms: true,
      baseHours: eventSpecialTerms.baseHours || 10,
      baseFare: rate,
      overtimeHourlyRate: eventSpecialTerms.overtimeHourlyRate,
      roundingUnitMinutes: eventSpecialTerms.roundingUnitMinutes || 30,
      roundingMethod: eventSpecialTerms.roundingMethod || 'ceil',
      vatMode: eventSpecialTerms.vatMode || 'unset',
    };
  }

  // Tier 2: Customer Contract Terms
  if (customerContractTerms && customerContractTerms.baseRate > 0) {
    const rate =
      serviceMode === 'vehicle_only' && customerContractTerms.vehicleOnlyRate !== undefined
        ? customerContractTerms.vehicleOnlyRate
        : customerContractTerms.baseRate;
    return {
      pricingSource: customerContractTerms.pricingSource || 'customer_contract',
      isTemporaryPreset: Boolean(customerContractTerms.isTemporaryPreset),
      hasContractTerms: true,
      baseHours: customerContractTerms.baseHours || 10,
      baseFare: rate,
      overtimeHourlyRate: customerContractTerms.overtimeHourlyRate,
      roundingUnitMinutes: customerContractTerms.roundingUnitMinutes || 30,
      roundingMethod: customerContractTerms.roundingMethod || 'ceil',
      vatMode: customerContractTerms.vatMode || 'unset',
    };
  }

  // Tier 1: Temporary Vehicle Pricing Preset (기본 10시간 기준)
  const matchedPreset = findVehiclePricingPreset(vehicleModel, vehiclePresets);
  if (matchedPreset && matchedPreset.isRegistered) {
    const baseFare =
      serviceMode === 'vehicle_only'
        ? matchedPreset.vehicleOnlyRate
        : matchedPreset.withDriverRate;

    return {
      pricingSource: 'preset',
      isTemporaryPreset: true,
      hasContractTerms: true,
      baseHours: matchedPreset.baseHours || 10,
      baseFare,
      overtimeHourlyRate: matchedPreset.overtimeRatePerHour, // undefined unless configured
      roundingUnitMinutes: 30,
      roundingMethod: 'ceil',
      vatMode: 'unset',
      contractWarning: '임시 요금 프리셋 적용 중 (실제 고객사 계약 단가 미확정)',
    };
  }

  // Unregistered vehicle & no contract
  return {
    pricingSource: 'unregistered',
    isTemporaryPreset: false,
    hasContractTerms: false,
    baseHours: 10,
    baseFare: 0,
    overtimeHourlyRate: undefined,
    roundingUnitMinutes: 30,
    roundingMethod: 'ceil',
    vatMode: 'unset',
    contractWarning: '차량 요금 및 계약조건 미등록 — 임의 금액 생성 방지 (관리자 확인 필요)',
  };
}

/**
 * Calculate overtime and vehicle fares strictly based on resolved pricing/contract terms.
 * - Never fabricates overtime fares when overtimeHourlyRate is undefined.
 * - Never double-adds driver labor cost to client baseFare.
 */
export function calculateOvertimeAndFare(
  serviceMinutes: number,
  contractTerms?: CustomerContractTerms | null
): {
  baseContractHours: number;
  overtimeMinutes: number;
  billedOvertimeHours: number;
  overtimeFormatted: string;
  billedOvertimeFormatted: string;
  baseFare: number;
  overtimeFare: number;
  isOvertimeRateConfirmed: boolean;
  vehicleFareSubtotal: number;
  hasContractTerms: boolean;
  contractWarning?: string;
} {
  if (!contractTerms || contractTerms.baseHours <= 0 || contractTerms.baseRate <= 0) {
    const fallbackBaseHours = 10;
    const overtimeMin = Math.max(0, serviceMinutes - fallbackBaseHours * 60);
    return {
      baseContractHours: fallbackBaseHours,
      overtimeMinutes: overtimeMin,
      billedOvertimeHours: 0,
      overtimeFormatted: formatMinutesKorean(overtimeMin),
      billedOvertimeFormatted: '미정 (계약조건 미등록)',
      baseFare: 0,
      overtimeFare: 0,
      isOvertimeRateConfirmed: false,
      vehicleFareSubtotal: 0,
      hasContractTerms: false,
      contractWarning: '계약조건 미설정 — 임의 금액 생성 방지 (관리자 확인 필요)',
    };
  }

  const baseMinutes = contractTerms.baseHours * 60;
  const overtimeMinutes = Math.max(0, serviceMinutes - baseMinutes);

  let billedOvertimeHours = 0;
  let billedOvertimeFormatted = '0시간';

  if (overtimeMinutes > 0) {
    const unit = contractTerms.roundingUnitMinutes || 30;
    const method = contractTerms.roundingMethod || 'ceil';

    if (method === 'exact') {
      billedOvertimeHours = overtimeMinutes / 60;
      billedOvertimeFormatted = `${formatMinutesKorean(overtimeMinutes)} (분 단위 실계산)`;
    } else if (method === 'ceil') {
      const units = Math.ceil(overtimeMinutes / unit);
      const roundedMinutes = units * unit;
      billedOvertimeHours = roundedMinutes / 60;
      billedOvertimeFormatted = `${(roundedMinutes / 60).toFixed(1).replace(/\.0$/, '')}시간 (${unit}분 단위 올림)`;
    } else if (method === 'round') {
      const units = Math.round(overtimeMinutes / unit);
      const roundedMinutes = units * unit;
      billedOvertimeHours = roundedMinutes / 60;
      billedOvertimeFormatted = `${(roundedMinutes / 60).toFixed(1).replace(/\.0$/, '')}시간 (${unit}분 반올림)`;
    } else {
      const units = Math.floor(overtimeMinutes / unit);
      const roundedMinutes = units * unit;
      billedOvertimeHours = roundedMinutes / 60;
      billedOvertimeFormatted = `${(roundedMinutes / 60).toFixed(1).replace(/\.0$/, '')}시간 (${unit}분 단위 절사)`;
    }
  }

  const baseFare = contractTerms.baseRate;
  const hasOvertimeRate =
    typeof contractTerms.overtimeHourlyRate === 'number' && contractTerms.overtimeHourlyRate > 0;

  // 미등록 초과요율은 임의 계산하지 않는다
  const overtimeFare =
    overtimeMinutes > 0 && hasOvertimeRate
      ? Math.round(billedOvertimeHours * (contractTerms.overtimeHourlyRate || 0))
      : 0;

  if (overtimeMinutes > 0 && !hasOvertimeRate) {
    billedOvertimeFormatted = `${formatMinutesKorean(overtimeMinutes)} 초과 (초과요율 미등록 · 관리자 확인 필요)`;
  }

  const vehicleFareSubtotal = baseFare + overtimeFare;

  return {
    baseContractHours: contractTerms.baseHours,
    overtimeMinutes,
    billedOvertimeHours,
    overtimeFormatted: formatMinutesKorean(overtimeMinutes),
    billedOvertimeFormatted,
    baseFare,
    overtimeFare,
    isOvertimeRateConfirmed: hasOvertimeRate || overtimeMinutes === 0,
    vehicleFareSubtotal,
    hasContractTerms: true,
    contractWarning:
      overtimeMinutes > 0 && !hasOvertimeRate
        ? '초과시간이 발생했으나 고객사 초과요율이 미등록 상태입니다. (관리자 확인 필요)'
        : contractTerms.isTemporaryPreset
        ? '임시 요금 프리셋 적용 중 (실제 계약 단가 등록 시 자동 전환)'
        : undefined,
  };
}

/**
 * Calculate per-dispatch Direct Profit (배차별 직접이익)
 * Formula: 고객사 매출 − 기사 인건비 − 차량 관련 직접비 − 기타 직접비 = 배차별 직접이익
 * Direct Margin (%) = (배차별 직접이익 / 고객사 매출) * 100
 */
export function calculateDispatchDirectProfit(params: {
  clientRevenue: number;
  driverLaborCost: number;
  vehicleDirectCost?: number;
  otherDirectCost?: number;
  allDirectCostsVerified?: boolean;
}): {
  clientRevenue: number;
  driverLaborCost: number;
  vehicleDirectCost: number;
  otherDirectCost: number;
  totalDirectCost: number;
  directProfit: number;
  directMarginPercent: number;
  profitConfirmStatus: ProfitConfirmStatus;
} {
  const {
    clientRevenue,
    driverLaborCost,
    vehicleDirectCost = 0,
    otherDirectCost = 0,
    allDirectCostsVerified = false,
  } = params;

  const totalDirectCost = driverLaborCost + vehicleDirectCost + otherDirectCost;
  const directProfit = clientRevenue - totalDirectCost;
  const directMarginPercent =
    clientRevenue > 0 ? Number(((directProfit / clientRevenue) * 100).toFixed(2)) : 0;

  return {
    clientRevenue,
    driverLaborCost,
    vehicleDirectCost,
    otherDirectCost,
    totalDirectCost,
    directProfit,
    directMarginPercent,
    profitConfirmStatus: allDirectCostsVerified ? 'confirmed' : 'provisional',
  };
}

/**
 * Create an immutable pricing snapshot when a booking is created/dispatched.
 */
export function createBookingPricingSnapshot(params: {
  vehicleModel?: string | null;
  driverName?: string | null;
  serviceMode?: ServiceIncludeMode;
  requestedLanguage?: RequestedDriverLanguage;
  customer?: HqCustomer | null;
}): AppliedPricingSnapshot {
  const {
    vehicleModel,
    driverName,
    serviceMode = 'with_driver',
    requestedLanguage = 'ko',
    customer,
  } = params;

  const resolvedPricing = resolveEffectivePricingTerms({
    vehicleModel,
    serviceMode,
    customerContractTerms: customer?.contractTerms,
  });

  const labor = calculateDriverLaborCost({
    driverName,
    vehicleModel,
    serviceMode,
  });

  return {
    capturedAt: new Date().toISOString(),
    pricingSource: resolvedPricing.pricingSource,
    isTemporaryPreset: resolvedPricing.isTemporaryPreset,
    serviceMode,
    requestedLanguage,
    baseHours: resolvedPricing.baseHours,
    baseVehicleFare: resolvedPricing.baseFare,
    overtimeHourlyRate: resolvedPricing.overtimeHourlyRate,
    driverLaborCost10h: labor.driverLaborCost,
    vatMode: resolvedPricing.vatMode,
  };
}

/**
 * Check for duplicate receipt suspicion:
 * Flags if another receipt has the exact same merchant, amount, and date (or approvalNo)
 */
export function checkDuplicateReceipt(
  target: HqExpenseRecord,
  allExpenses: HqExpenseRecord[]
): { isDuplicate: boolean; reason?: string } {
  const duplicates = allExpenses.filter((e) => {
    if (e.id === target.id) return false;

    if (
      target.ocrDetails?.approvalNo &&
      e.ocrDetails?.approvalNo &&
      target.ocrDetails.approvalNo.trim() === e.ocrDetails.approvalNo.trim()
    ) {
      return true;
    }

    const sameMerchant =
      target.merchant.trim().toLowerCase() === e.merchant.trim().toLowerCase();
    const sameAmount = Math.abs(target.amount - e.amount) === 0;
    const sameDate = target.rawDate === e.rawDate;

    return sameMerchant && sameAmount && sameDate;
  });

  if (duplicates.length > 0) {
    const d = duplicates[0];
    return {
      isDuplicate: true,
      reason: `동일 가맹점('${d.merchant}') 및 동일 금액(₩${d.amount.toLocaleString()}) 영수증(#${d.no})이 이미 등록되어 있습니다.`,
    };
  }

  return { isDuplicate: false };
}

/**
 * Assemble a full EventSettlementReport from Customer, Bookings, Driving Logs, and Expenses.
 */
export function buildEventSettlementReport(params: {
  id: string;
  reportNo: string;
  customer: HqCustomer;
  eventName: string;
  eventDate: string;
  location: string;
  bookings: HqBooking[];
  drivingLogs: HqDrivingLog[];
  expenses: HqExpenseRecord[];
  orderingAgency?: string;
  billingTarget?: 'ordering_agency' | 'end_brand' | 'custom';
  billingTargetName?: string;
  customContractTerms?: CustomerContractTerms;
  vatMode?: VatHandlingMode;
  status?: 'draft' | 'reviewing' | 'approved' | 'invoiced';
  adminNotes?: string;
  vehiclePresets?: VehiclePricingPreset[];
  driverProfiles?: DriverProfilePreset[];
}): EventSettlementReport {
  const {
    id,
    reportNo,
    customer,
    eventName,
    eventDate,
    location,
    bookings,
    drivingLogs,
    expenses,
    orderingAgency,
    billingTarget = orderingAgency ? 'ordering_agency' : 'end_brand',
    billingTargetName = orderingAgency ? `${orderingAgency} 귀하` : `${customer.name} 귀하`,
    customContractTerms,
    vatMode: explicitVatMode,
    status = 'draft',
    adminNotes,
    vehiclePresets = DEFAULT_VEHICLE_PRICING_PRESETS,
    driverProfiles = DEFAULT_DRIVER_PROFILES,
  } = params;

  // Build per-vehicle settlements
  const vehicles: EventVehicleSettlement[] = bookings.map((booking, idx) => {
    const vIndex = booking.groupVehicleIndex || idx + 1;
    const serviceMode: ServiceIncludeMode = booking.serviceMode || 'with_driver';
    const requestedLanguage: RequestedDriverLanguage = booking.requestedLanguage || 'ko';

    // Find matching driving log by driver name or vehicle plate
    const matchingLog = drivingLogs.find(
      (l) =>
        (booking.driverName && l.driverName === booking.driverName) ||
        (booking.vehiclePlate && l.vehiclePlate.includes(booking.vehiclePlate))
    );

    // Filter expenses belonging to this driver or vehicle
    const vehicleExpenses = expenses.filter((e) => {
      const isDriverMatch = booking.driverName && e.driverName === booking.driverName;
      const isPlateMatch = booking.vehiclePlate && e.vehiclePlate.includes(booking.vehiclePlate);
      return isDriverMatch || isPlateMatch;
    });

    // Separate Client-Billable Approved Expenses vs Company Direct Expenses vs Pending
    let approvedExpensesTotal = 0;
    let companyDirectExpensesTotal = 0;
    let pendingExpensesTotal = 0;
    let hasDuplicateWarning = false;

    const auditedExpenses: HqExpenseRecord[] = vehicleExpenses.map((exp) => {
      const dupCheck = checkDuplicateReceipt(exp, expenses);
      if (dupCheck.isDuplicate) {
        hasDuplicateWarning = true;
      }

      // 식비/내부 세차비 등 billableToCustomer === false 인 경우 회사 자체 부담 직접비로 분류
      const isClientBillable = exp.billableToCustomer !== false && exp.category !== 'meal';

      if (exp.status === '승인 완료' && !dupCheck.isDuplicate) {
        if (isClientBillable) {
          approvedExpensesTotal += exp.amount;
        } else {
          companyDirectExpensesTotal += exp.amount;
        }
      } else {
        pendingExpensesTotal += exp.amount;
      }

      return {
        ...exp,
        isDuplicateSuspicion: dupCheck.isDuplicate,
        duplicateReason: dupCheck.reason,
        billableToCustomer: exp.status === '승인 완료' && !dupCheck.isDuplicate && isClientBillable,
      };
    });

    // Resolve Customer Service Times (excluding garage pickup/return)
    const times = resolveServiceTimes(matchingLog, booking);
    const serviceMinutes = calculateDurationMinutes(times.serviceStart, times.serviceEnd);
    const serviceFormatted = formatMinutesKorean(serviceMinutes);

    // Resolve 4-Tier Effective Pricing for this vehicle
    const effectivePricing = resolveEffectivePricingTerms({
      vehicleModel: booking.vehicleModel,
      serviceMode,
      bookingSnapshot: booking.appliedPricingSnapshot,
      eventSpecialTerms: customContractTerms,
      customerContractTerms: customer.contractTerms,
      vehiclePresets,
    });

    const termsForCalc: CustomerContractTerms | null = effectivePricing.hasContractTerms
      ? {
          baseHours: effectivePricing.baseHours,
          baseRate: effectivePricing.baseFare,
          overtimeHourlyRate: effectivePricing.overtimeHourlyRate,
          roundingUnitMinutes: effectivePricing.roundingUnitMinutes,
          roundingMethod: effectivePricing.roundingMethod,
          isTemporaryPreset: effectivePricing.isTemporaryPreset,
          pricingSource: effectivePricing.pricingSource,
        }
      : null;

    const fareCalc = calculateOvertimeAndFare(serviceMinutes, termsForCalc);

    // Calculate Driver Labor Cost (회사 지급 인건비 — 고객사 청구액에 이중 가산 절대 금지)
    const laborCalc = calculateDriverLaborCost({
      driverName: booking.driverName,
      vehicleModel: booking.vehicleModel,
      serviceMode,
      customLaborOverride: booking.appliedPricingSnapshot?.driverLaborCost10h,
      profiles: driverProfiles,
    });

    // Check Language Matching & Surcharge Notice
    const languageMismatchWarning =
      requestedLanguage === 'en' && !laborCalc.isEnglishVerified && serviceMode === 'with_driver'
        ? `영어 가능 기사 요청 건이나 한국어 전용 기사(${booking.driverName})가 배정됨 (관리자 예외 확인)`
        : undefined;

    const englishSurchargeNotice =
      requestedLanguage === 'en'
        ? '영어 가능 기사 요청 — 고객사 추가할증 요율 미정 (임의 할증 없음 · 관리자 확인 필요)'
        : undefined;

    const driverOvertimeLaborWarning =
      fareCalc.overtimeMinutes > 0 && serviceMode === 'with_driver'
        ? `초과 서비스(${fareCalc.overtimeFormatted}) 발생 — 기사 초과수당 요율 미정 (관리자 확인 필요)`
        : undefined;

    // Client Revenue vs Direct Profit Calculation
    const clientTotalRevenue = fareCalc.vehicleFareSubtotal + approvedExpensesTotal;
    const profitAnalysis = calculateDispatchDirectProfit({
      clientRevenue: clientTotalRevenue,
      driverLaborCost: laborCalc.driverLaborCost,
      vehicleDirectCost: companyDirectExpensesTotal,
      otherDirectCost: 0,
      allDirectCostsVerified:
        status === 'approved' || status === 'invoiced' || companyDirectExpensesTotal > 0,
    });

    return {
      vehicleIndex: vIndex,
      vehiclePlate: booking.vehiclePlate || '차량 미배정',
      vehicleModel: stripManufacturerName(booking.vehicleModel),
      vehicleModelRaw: booking.vehicleModel,
      vehicleTier: laborCalc.vehicleTier,
      driverName: serviceMode === 'vehicle_only' ? '차량만 대여 (기사 미포함)' : booking.driverName || '기사 미배정',
      driverPhone: booking.driverPhone,
      driverIsEnglishVerified: laborCalc.isEnglishVerified,
      requestedLanguage,
      languageMismatchWarning,
      englishSurchargeNotice,
      serviceMode,
      pricingSource: effectivePricing.pricingSource,
      isTemporaryPreset: effectivePricing.isTemporaryPreset,
      bookingId: booking.id,
      bookingNo: booking.bookingNo,
      drivingLogId: matchingLog?.id,
      drivingLogStatus: matchingLog?.status,
      garageDepartureTime: times.garageDeparture,
      customerServiceStart: times.serviceStart,
      customerServiceEnd: times.serviceEnd,
      garageArrivalTime: times.garageArrival,
      totalDutyFormatted: matchingLog?.totalDutyHours || '12시간 00분',
      customerServiceMinutes: serviceMinutes,
      customerServiceFormatted: serviceFormatted,
      baseContractHours: fareCalc.baseContractHours,
      overtimeMinutes: fareCalc.overtimeMinutes,
      billedOvertimeHours: fareCalc.billedOvertimeHours,
      overtimeFormatted: fareCalc.overtimeFormatted,
      billedOvertimeFormatted: fareCalc.billedOvertimeFormatted,
      baseFare: fareCalc.baseFare,
      overtimeFare: fareCalc.overtimeFare,
      isOvertimeRateConfirmed: fareCalc.isOvertimeRateConfirmed,
      vehicleFareSubtotal: fareCalc.vehicleFareSubtotal,
      hasContractTerms: fareCalc.hasContractTerms,
      contractWarning: fareCalc.contractWarning || effectivePricing.contractWarning,
      mileageKm: matchingLog?.distanceKm || '기록 확인 중',
      notes: matchingLog?.notes || booking.notes,
      expenses: auditedExpenses,
      approvedExpensesTotal,
      companyDirectExpensesTotal,
      pendingExpensesTotal,
      hasDuplicateWarning,
      clientTotalRevenue,
      driverLaborCost: profitAnalysis.driverLaborCost,
      driverOvertimeLaborWarning,
      vehicleDirectCost: profitAnalysis.vehicleDirectCost,
      otherDirectCost: profitAnalysis.otherDirectCost,
      directProfit: profitAnalysis.directProfit,
      directMarginPercent: profitAnalysis.directMarginPercent,
      profitConfirmStatus: profitAnalysis.profitConfirmStatus,
      dispatchStatus: booking.dispatchStatus,
      lastEta: '14:20',
    };
  });

  // Calculate Report-wide Aggregates
  const totalVehiclesCount = vehicles.length;
  const totalCustomerServiceMinutes = vehicles.reduce((sum, v) => sum + v.customerServiceMinutes, 0);
  const totalOvertimeMinutes = vehicles.reduce((sum, v) => sum + v.overtimeMinutes, 0);

  const totalBaseFare = vehicles.reduce((sum, v) => sum + v.baseFare, 0);
  const totalOvertimeFare = vehicles.reduce((sum, v) => sum + v.overtimeFare, 0);
  const totalVehicleFare = vehicles.reduce((sum, v) => sum + v.vehicleFareSubtotal, 0);
  const totalApprovedExpenses = vehicles.reduce((sum, v) => sum + v.approvedExpensesTotal, 0);
  const totalPendingExpenses = vehicles.reduce((sum, v) => sum + v.pendingExpensesTotal, 0);

  const supplyAmount = totalVehicleFare + totalApprovedExpenses;

  // VAT Handling: Do NOT arbitrarily add VAT unless vatMode === 'excluded'
  const resolvedVatMode: VatHandlingMode =
    explicitVatMode ||
    customContractTerms?.vatMode ||
    customer.contractTerms?.vatMode ||
    'unset';

  const vatAmount = resolvedVatMode === 'excluded' ? Math.round(supplyAmount * 0.1) : 0;
  const grandTotal = supplyAmount + vatAmount;

  // Internal Profitability Totals (본사 전용)
  const totalDriverLaborCost = vehicles.reduce((sum, v) => sum + v.driverLaborCost, 0);
  const totalVehicleDirectCost = vehicles.reduce((sum, v) => sum + v.vehicleDirectCost, 0);
  const totalOtherDirectCost = vehicles.reduce((sum, v) => sum + v.otherDirectCost, 0);
  const totalDirectCost = totalDriverLaborCost + totalVehicleDirectCost + totalOtherDirectCost;
  const totalDirectProfit = supplyAmount - totalDirectCost;
  const averageDirectMarginPercent =
    supplyAmount > 0 ? Number(((totalDirectProfit / supplyAmount) * 100).toFixed(2)) : 0;

  const isAnyTemporary = vehicles.some((v) => v.isTemporaryPreset);
  const isAnyUnregistered = vehicles.some((v) => !v.hasContractTerms);
  const primaryPricingSource: PricingTierSource =
    vehicles[0]?.pricingSource || (customContractTerms ? 'event_special' : 'preset');

  const profitConfirmStatus: ProfitConfirmStatus =
    !isAnyTemporary && !isAnyUnregistered && (status === 'approved' || status === 'invoiced')
      ? 'confirmed'
      : 'provisional';

  return {
    id,
    reportNo,
    status,
    createdAt: new Date().toISOString(),
    customerId: customer.id,
    customerName: customer.name,
    orderingAgency,
    endBrand: customer.name,
    billingTarget,
    billingTargetName,
    eventId: `ev-${id}`,
    eventName,
    eventDate,
    location,
    pricingSource: primaryPricingSource,
    isTemporaryPreset: isAnyTemporary,
    vatMode: resolvedVatMode,
    contractTerms: customContractTerms || customer.contractTerms,
    contractWarning: isAnyUnregistered
      ? '일부 차량 요금 또는 초과요율이 미등록 상태입니다. (관리자 확인 필요)'
      : isAnyTemporary
      ? '현재 임시 요금 프리셋(10시간 기준)이 적용된 예상 정산서입니다.'
      : undefined,
    vehicles,
    totalVehiclesCount,
    totalCustomerServiceMinutes,
    totalServiceHoursFormatted: formatMinutesKorean(totalCustomerServiceMinutes),
    totalOvertimeMinutes,
    totalOvertimeHoursFormatted: formatMinutesKorean(totalOvertimeMinutes),
    totalBaseFare,
    totalOvertimeFare,
    totalVehicleFare,
    totalApprovedExpenses,
    totalPendingExpenses,
    supplyAmount,
    vatAmount,
    grandTotal,
    totalDriverLaborCost,
    totalVehicleDirectCost,
    totalOtherDirectCost,
    totalDirectCost,
    totalDirectProfit,
    averageDirectMarginPercent,
    profitConfirmStatus,
    adminNotes,
  };
}
