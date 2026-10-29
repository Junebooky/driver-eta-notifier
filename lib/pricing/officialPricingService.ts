import { supabaseAdmin } from '@/lib/supabase/server';
import {
  OfficialPriceCard,
  OfficialPriceRule,
  OfficialQuoteCalculationInput,
  OfficialQuoteCalculationResult,
  OfficialQuoteLineItem,
  VehicleProductMapping,
} from '@/types/officialPricingHq';

export const OFFICIAL_TARIFF_VERSION = 'vlk_2026_initial';

/**
 * Standard SKU definitions matching cockpit.official_price_cards
 */
export const STANDARD_VEHICLE_SKU_MAPPINGS: VehicleProductMapping[] = [
  {
    vehicleProductCode: 'sprinter_519_premium',
    vehicleProductLabel: '벤츠 스프린터 리무진 519 최고급형',
    tier: 'sprinter',
    matchKeywords: ['519 최고급', '519 리무진 최고급', '519 프리미엄', '519 9인승', '519 11인승', '519 12인승', '519 CDI 최고급'],
    capacityNote: '2026년형 9·11·12인승',
    quoteRequired: false,
    notes: '519 일반형/비즈니스/셔틀과 엄격히 분리된 최고급 플래그십 상품',
  },
  {
    vehicleProductCode: 'sprinter_519_standard',
    vehicleProductLabel: '벤츠 스프린터 리무진 519 일반형',
    tier: 'sprinter',
    matchKeywords: ['519 일반', '519 스탠다드', '519 기본'],
    capacityNote: '스프린터 519 일반형 리무진',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'sprinter_519_business',
    vehicleProductLabel: '벤츠 스프린터 519 비즈니스',
    tier: 'sprinter',
    matchKeywords: ['519 비즈니스', '519 15인승', '519 16인승'],
    capacityNote: '15·16인승 비즈니스 투어',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'sprinter_519_shuttle',
    vehicleProductLabel: '벤츠 스프린터 519 셔틀',
    tier: 'sprinter',
    matchKeywords: ['519 셔틀'],
    capacityNote: '15·16인승 정기/단기 셔틀 전용',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'sprinter_319_new_6seat',
    vehicleProductLabel: '벤츠 스프린터 319 신차',
    tier: 'sprinter',
    matchKeywords: ['319', '319 신차', '319 6인승', '스프린터 319', '319 CDI'],
    capacityNote: '2026년형 6인승 VIP 독립 시트',
    quoteRequired: false,
    notes: '519 및 구형 319와 분리된 신차 6인승 상품',
  },
  {
    vehicleProductCode: 'genesis_g90_donghaeng',
    vehicleProductLabel: '제네시스 G90 리무진 (동행)',
    tier: 'genesis',
    matchKeywords: ['G90 동행', '동행', 'G90 리무진 동행', 'G90 LWB 동행'],
    capacityNote: '2026년형 신차 최고급형 동행 의전',
    quoteRequired: false,
    notes: '일반 G90과 별개 요율 적용',
  },
  {
    vehicleProductCode: 'genesis_g90_standard',
    vehicleProductLabel: '제네시스 G90 신차 최고급형',
    tier: 'genesis',
    matchKeywords: ['G90', 'G90 신차', 'G90 LWB', '제네시스 G90'],
    capacityNote: '2026년형 신차 최고급형',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'genesis_gv80_new',
    vehicleProductLabel: '제네시스 GV80 신차',
    tier: 'suv',
    matchKeywords: ['GV80', 'GV80 신차', '제네시스 GV80'],
    capacityNote: '2026년형 럭셔리 SUV',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'hyundai_staria_lounge_limo',
    vehicleProductLabel: '현대 스타리아 라운지 리무진 최고급형',
    tier: 'van',
    matchKeywords: ['스타리아', '스타리아 리무진', '스타리아 라운지', '스타리아 7인승', '스타리아 9인승'],
    capacityNote: '7·9인승 최고급형',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'kia_carnival_hi_limo',
    vehicleProductLabel: '기아 카니발 하이리무진 최고급형',
    tier: 'van',
    matchKeywords: ['카니발', '카니발 하이리무진', '카니발 4인승', '카니발 7인승', '올뉴 카니발'],
    capacityNote: '4세대 올뉴 4·7인승',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'benz_s560',
    vehicleProductLabel: '벤츠 S560',
    tier: 'sedan',
    matchKeywords: ['S560', '벤츠 S560', 'S-클래스', 'S-Class', 'S클래스', 'W223'],
    capacityNote: '플래그십 세단 VIP 의전',
    quoteRequired: false,
  },
  {
    vehicleProductCode: 'bus_premium_22',
    vehicleProductLabel: '프리미엄 럭셔리 리무진 버스',
    tier: 'bus',
    matchKeywords: ['22인승', '22인승 버스', '프리미엄 리무진 버스'],
    capacityNote: '22인승',
    quoteRequired: true,
    notes: '가격 상담 전용 (0원 확정 금지)',
  },
  {
    vehicleProductCode: 'bus_limo_28',
    vehicleProductLabel: '리무진 버스',
    tier: 'bus',
    matchKeywords: ['28인승', '28인승 버스', '우등 버스'],
    capacityNote: '28인승',
    quoteRequired: true,
    notes: '가격 상담 전용 (0원 확정 금지)',
  },
  {
    vehicleProductCode: 'bus_45',
    vehicleProductLabel: '버스',
    tier: 'bus',
    matchKeywords: ['45인승', '45인승 버스', '대형 버스'],
    capacityNote: '45인승',
    quoteRequired: true,
    notes: '가격 상담 전용 (0원 확정 금지)',
  },
];

/**
 * Maps raw model string to 2026 SKU.
 * If ambiguous or unmapped, returns isAmbiguous = true to prevent incorrect rate inference.
 */
export function resolveVehicleProductSku(modelInput: string): {
  code: string | null;
  label: string | null;
  isAmbiguous: boolean;
  notes?: string;
} {
  if (!modelInput || !modelInput.trim()) {
    return { code: null, label: null, isAmbiguous: false, notes: '차량 미지정' };
  }

  const clean = modelInput.trim();
  const lower = clean.toLowerCase();

  // 1. Direct SKU code match
  const directMatch = STANDARD_VEHICLE_SKU_MAPPINGS.find(
    (m) => m.vehicleProductCode.toLowerCase() === lower
  );
  if (directMatch) {
    return {
      code: directMatch.vehicleProductCode,
      label: directMatch.vehicleProductLabel,
      isAmbiguous: false,
    };
  }

  // 2. Specific Sprinter checks (519 vs 319 vs tiers)
  if (lower.includes('319')) {
    const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_319_new_6seat')!;
    return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
  }

  if (lower.includes('519')) {
    if (lower.includes('셔틀') || lower.includes('shuttle')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_519_shuttle')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    if (lower.includes('비즈니스') || lower.includes('business')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_519_business')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    if (lower.includes('일반') || lower.includes('standard')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_519_standard')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    // Default to premium if specified or general 519 limousine
    const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'sprinter_519_premium')!;
    return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
  }

  // 3. G90 Donghaeng vs standard G90
  if (lower.includes('g90') || lower.includes('지90')) {
    if (lower.includes('동행') || lower.includes('donghaeng')) {
      const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'genesis_g90_donghaeng')!;
      return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
    }
    const m = STANDARD_VEHICLE_SKU_MAPPINGS.find((x) => x.vehicleProductCode === 'genesis_g90_standard')!;
    return { code: m.vehicleProductCode, label: m.vehicleProductLabel, isAmbiguous: false };
  }

  // 4. Other vehicles
  for (const m of STANDARD_VEHICLE_SKU_MAPPINGS) {
    if (m.matchKeywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return {
        code: m.vehicleProductCode,
        label: m.vehicleProductLabel,
        isAmbiguous: false,
      };
    }
  }

  // Ambiguous: model exists but cannot be safely matched to a 2026 SKU
  return {
    code: null,
    label: clean,
    isAmbiguous: true,
    notes: '2026 공식 요금표 SKU와 일치하는 상품이 없어 관리자 확인이 필요합니다.',
  };
}

/**
 * Fetch official price cards from database (Server-side service_role only)
 */
export async function getOfficialPriceCards(
  tariffVersion = OFFICIAL_TARIFF_VERSION
): Promise<OfficialPriceCard[]> {
  const { data, error } = await supabaseAdmin
    .from('official_price_cards')
    .select('*')
    .eq('tariff_version', tariffVersion)
    .order('vehicle_product_code', { ascending: true });

  if (error) {
    console.error('[OfficialPricingService] Error fetching price cards:', error);
    throw new Error(`공식 요금표 조회 실패: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    tariffYear: row.tariff_year,
    tariffVersion: row.tariff_version,
    vehicleProductCode: row.vehicle_product_code,
    vehicleProductLabel: row.vehicle_product_label,
    capacityNote: row.capacity_note,
    dailyBaseHours: row.daily_base_hours || 9,
    airportBaseHours: row.airport_base_hours || 3,
    dailyMetroKrw: row.daily_metro_krw,
    dailyRegionalKrw: row.daily_regional_krw,
    airportGimpoKrw: row.airport_gimpo_krw,
    airportIncheonKrw: row.airport_incheon_krw,
    quoteRequired: Boolean(row.quote_required),
    vatExcluded: Boolean(row.vat_excluded),
    publicationStatus: row.publication_status,
    sourceLabel: row.source_label,
    notes: row.notes,
  }));
}

/**
 * Fetch official price rules from database (Server-side service_role only)
 */
export async function getOfficialPriceRules(
  tariffVersion = OFFICIAL_TARIFF_VERSION
): Promise<OfficialPriceRule[]> {
  const { data, error } = await supabaseAdmin
    .from('official_price_rules')
    .select('*')
    .eq('tariff_version', tariffVersion)
    .order('service_type', { ascending: true });

  if (error) {
    console.error('[OfficialPricingService] Error fetching price rules:', error);
    throw new Error(`공식 추가 규정 조회 실패: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    tariffVersion: row.tariff_version,
    serviceType: row.service_type,
    ruleCode: row.rule_code,
    ruleData: typeof row.rule_data === 'object' && row.rule_data !== null ? row.rule_data : {},
    needsConfirmation: Boolean(row.needs_confirmation),
    notes: row.notes,
    publicationStatus: row.publication_status,
  }));
}

/**
 * Pure, authoritative quote calculation based on 2026 Company Official Tariff
 */
export async function calculateOfficialTariffQuote(
  input: OfficialQuoteCalculationInput,
  preloadedCards?: OfficialPriceCard[],
  preloadedRules?: OfficialPriceRule[]
): Promise<OfficialQuoteCalculationResult> {
  const tariffVersion = input.tariffVersion || OFFICIAL_TARIFF_VERSION;
  const cards = preloadedCards || (await getOfficialPriceCards(tariffVersion));
  const rules = preloadedRules || (await getOfficialPriceRules(tariffVersion));

  const targetCard = cards.find(
    (c) => c.vehicleProductCode === input.vehicleProductCode
  );

  if (!targetCard) {
    throw new Error(`해당 차종 SKU(${input.vehicleProductCode})에 대한 2026 공식 요금표를 찾을 수 없습니다.`);
  }

  const isDaily = input.serviceCategory === 'daily_metro' || input.serviceCategory === 'daily_regional';
  const baseHours = isDaily ? targetCard.dailyBaseHours : targetCard.airportBaseHours;
  const vehicleCount = Math.max(1, input.vehicleCount || 1);
  const serviceHours = Math.max(1, input.serviceHours || baseHours);

  const categoryLabels: Record<string, string> = {
    daily_metro: '일반 의전 9시간 (수도권)',
    daily_regional: '일반 의전 9시간 (지방)',
    airport_gimpo: '공항 편도 3시간 (김포공항)',
    airport_incheon: '공항 편도 3시간 (인천공항)',
  };

  const lineItems: OfficialQuoteLineItem[] = [];
  const confirmationRequiredRules: { ruleCode: string; description: string }[] = [];

  // 1. Bus / Quote Required check
  if (targetCard.quoteRequired) {
    confirmationRequiredRules.push({
      ruleCode: 'bus_price',
      description: '버스(22/28/45인승)는 전용 가격 상담 상품입니다. 0원 자동 배차 및 견적 확정이 금지되어 있으며 관리자 협의가 필요합니다.',
    });

    lineItems.push({
      code: 'quote_required',
      label: `${targetCard.vehicleProductLabel} (${targetCard.capacityNote || '대형'})`,
      quantity: vehicleCount,
      unitPrice: null,
      totalPrice: null,
      isConfirmationRequired: true,
      note: '가격 상담 전용 (견적 필수)',
    });

    return {
      tariffVersion,
      publicationStatus: 'draft',
      pricingSource: 'official_2026',
      serviceCategory: input.serviceCategory,
      serviceCategoryLabel: categoryLabels[input.serviceCategory] || '공식 의전',
      vehicleProductCode: targetCard.vehicleProductCode,
      vehicleProductLabel: targetCard.vehicleProductLabel,
      capacityNote: targetCard.capacityNote || '',
      baseHours,
      serviceHours,
      vehicleCount,
      quoteRequired: true,
      baseRatePerVehicle: null,
      baseFareTotal: null,
      standardOvertimeTotal: 0,
      nightOvertimeTotal: 0,
      excessDistanceTotal: 0,
      fluentEnglishUpgradeTotal: 0,
      supplyPriceTotal: null,
      vatAmount: null,
      estimatedGrandTotal: null,
      lineItems,
      confirmationRequiredRules,
      snapshotTimestamp: new Date().toISOString(),
    };
  }

  // 2. Base rate resolution per category
  let baseRatePerVehicle = 0;
  if (input.serviceCategory === 'daily_metro') {
    baseRatePerVehicle = targetCard.dailyMetroKrw || 0;
  } else if (input.serviceCategory === 'daily_regional') {
    // Note: Regional price is already in dailyRegionalKrw; never double-charge regional surcharge!
    baseRatePerVehicle = targetCard.dailyRegionalKrw || 0;
  } else if (input.serviceCategory === 'airport_gimpo') {
    baseRatePerVehicle = targetCard.airportGimpoKrw || 0;
  } else if (input.serviceCategory === 'airport_incheon') {
    baseRatePerVehicle = targetCard.airportIncheonKrw || 0;
  }

  // Overwrite base rate only if customer contract explicitly defined a lower or agreed price
  if (input.customBaseRateOverride !== undefined && input.customBaseRateOverride > 0) {
    baseRatePerVehicle = input.customBaseRateOverride;
  }

  const baseFareTotal = baseRatePerVehicle * vehicleCount;
  lineItems.push({
    code: 'base_fare',
    label: `${targetCard.vehicleProductLabel} 기본 ${baseHours}시간 (${categoryLabels[input.serviceCategory]})`,
    quantity: vehicleCount,
    unitPrice: baseRatePerVehicle,
    totalPrice: baseFareTotal,
    note: isDaily ? '기본 9시간, 기본 영어 소통 기사 포함' : '편도 3시간, 유류비·통행료 포함',
  });

  // 3. Overtime calculation
  const overtimeRule = rules.find((r) => r.ruleCode === 'overtime_rates');
  const overtimeData = overtimeRule?.ruleData || {};
  const isSpecialTier =
    targetCard.vehicleProductCode.includes('sprinter') ||
    targetCard.vehicleProductCode === 'benz_s560' ||
    targetCard.vehicleProductCode === 'genesis_g90_donghaeng';

  const standardHourlyRate = isSpecialTier
    ? (overtimeData.standard_hourly_krw?.sprinter || 70000)
    : (overtimeData.standard_hourly_krw?.other_vehicles || 50000);

  const nightHourlyRate = isSpecialTier
    ? (overtimeData.night_hourly_krw?.sprinter || 100000)
    : (overtimeData.night_hourly_krw?.other_vehicles || 80000);

  const totalOvertimeHours = Math.max(0, serviceHours - baseHours);
  const nightHours = Math.min(totalOvertimeHours, Math.max(0, input.nightHours || 0));
  const standardOvertimeHours = Math.max(0, totalOvertimeHours - nightHours);

  const standardOvertimeTotal = standardOvertimeHours * standardHourlyRate * vehicleCount;
  const nightOvertimeTotal = nightHours * nightHourlyRate * vehicleCount;

  if (standardOvertimeHours > 0) {
    lineItems.push({
      code: 'overtime_standard',
      label: `일반 초과시간 (${standardOvertimeHours}시간 × ${vehicleCount}대)`,
      quantity: standardOvertimeHours * vehicleCount,
      unitPrice: standardHourlyRate,
      totalPrice: standardOvertimeTotal,
    });
  }

  if (nightHours > 0) {
    lineItems.push({
      code: 'overtime_night',
      label: `심야 초과시간 (22:00~06:00, ${nightHours}시간 × ${vehicleCount}대)`,
      quantity: nightHours * vehicleCount,
      unitPrice: nightHourlyRate,
      totalPrice: nightOvertimeTotal,
    });
  }

  // 4. Excess distance (Daily only: 125km included, 500 KRW/km thereafter)
  let excessDistanceTotal = 0;
  if (isDaily && input.excessKm && input.excessKm > 0) {
    const distRule = rules.find((r) => r.ruleCode === 'daily_distance');
    const perKmRate = distRule?.ruleData?.excess_km_charge_krw || 500;
    excessDistanceTotal = input.excessKm * perKmRate * vehicleCount;

    lineItems.push({
      code: 'excess_distance',
      label: `일일 기준 주행거리(125km) 초과 (${input.excessKm}km × ${vehicleCount}대)`,
      quantity: input.excessKm * vehicleCount,
      unitPrice: perKmRate,
      totalPrice: excessDistanceTotal,
    });
  }

  // 5. English option
  // Basic English is ALREADY included in base rate.
  // Fluent upgrade (+100,000 KRW/day) only when requested.
  let fluentEnglishUpgradeTotal = 0;
  if (input.englishOption === 'fluent_upgrade') {
    const englishRule = rules.find((r) => r.ruleCode === 'daily_fluent_english');
    const surchargePerDay = englishRule?.ruleData?.surcharge_krw || 100000;
    fluentEnglishUpgradeTotal = surchargePerDay * vehicleCount;

    lineItems.push({
      code: 'fluent_english_upgrade',
      label: `프리토킹 영어 기사 업그레이드 (${vehicleCount}대)`,
      quantity: vehicleCount,
      unitPrice: surchargePerDay,
      totalPrice: fluentEnglishUpgradeTotal,
      note: '기본 영어 기사는 기본요금에 포함되어 있으며 프리토킹 전문 기사 전담 옵션입니다.',
    });
  }

  // 6. Needs confirmation alerts
  if (!isDaily && input.airportMeetAndGreet) {
    confirmationRequiredRules.push({
      ruleCode: 'airport_expenses',
      description: '공항 피켓 영접 서비스는 별도 요금 대상이나 단가가 미확정되어 관리자 확인이 필요합니다.',
    });
  }

  if (input.serviceCategory === 'daily_regional') {
    // Note for transparency: regional rate is already included in base rate.
    // confirmation rule logged to ensure no accidental double charge.
    confirmationRequiredRules.push({
      ruleCode: 'daily_region',
      description: '지방 운행 요금은 기본 차종 단가(지방 기준)에 이미 산정되어 있어 추가 지역 할증이 중복 청구되지 않았습니다.',
    });
  }

  // 7. VAT and Totals
  const supplyPriceTotal =
    baseFareTotal +
    standardOvertimeTotal +
    nightOvertimeTotal +
    excessDistanceTotal +
    fluentEnglishUpgradeTotal;

  const vatAmount = Math.round(supplyPriceTotal * 0.1);
  const estimatedGrandTotal = supplyPriceTotal + vatAmount;

  return {
    tariffVersion,
    publicationStatus: 'draft',
    pricingSource: 'official_2026',
    serviceCategory: input.serviceCategory,
    serviceCategoryLabel: categoryLabels[input.serviceCategory] || '공식 의전',
    vehicleProductCode: targetCard.vehicleProductCode,
    vehicleProductLabel: targetCard.vehicleProductLabel,
    capacityNote: targetCard.capacityNote || '',
    baseHours,
    serviceHours,
    vehicleCount,
    quoteRequired: false,
    baseRatePerVehicle,
    baseFareTotal,
    standardOvertimeTotal,
    nightOvertimeTotal,
    excessDistanceTotal,
    fluentEnglishUpgradeTotal,
    supplyPriceTotal,
    vatAmount,
    estimatedGrandTotal,
    lineItems,
    confirmationRequiredRules,
    snapshotTimestamp: new Date().toISOString(),
  };
}

