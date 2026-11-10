import { supabaseAdmin } from '@/lib/supabase/server';
import {
  OfficialPriceCard,
  OfficialPriceRule,
  OfficialQuoteCalculationInput,
  OfficialQuoteCalculationResult,
  OfficialQuoteLineItem,
  VehicleProductMapping,
  OfficialPublicationStatus,
} from '@/types/officialPricingHq';
import {
  OFFICIAL_TARIFF_VERSION,
  STANDARD_VEHICLE_SKU_MAPPINGS,
  resolveVehicleProductSku,
} from './officialPricingSkus';

export {
  OFFICIAL_TARIFF_VERSION,
  STANDARD_VEHICLE_SKU_MAPPINGS,
  resolveVehicleProductSku,
};

/**
 * Fetches all official price cards for the given tariff version from Supabase.
 * Strictly queries `cockpit.official_price_cards` using service_role credentials.
 */
export async function getOfficialPriceCards(
  tariffVersion: string = OFFICIAL_TARIFF_VERSION
): Promise<OfficialPriceCard[]> {
  const { data, error } = await supabaseAdmin
    .from('official_price_cards')
    .select('*')
    .eq('tariff_version', tariffVersion);

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
    vatExcluded: Boolean(row.vat_excluded ?? true),
    publicationStatus: (row.publication_status as OfficialPublicationStatus) || 'draft',
    sourceLabel: row.source_label,
    notes: row.notes,
  }));
}

/**
 * Fetches all official price rules for the given tariff version from Supabase.
 */
export async function getOfficialPriceRules(
  tariffVersion: string = OFFICIAL_TARIFF_VERSION
): Promise<OfficialPriceRule[]> {
  const { data, error } = await supabaseAdmin
    .from('official_price_rules')
    .select('*')
    .eq('tariff_version', tariffVersion);

  if (error) {
    console.error('[OfficialPricingService] Error fetching price rules:', error);
    throw new Error(`공식 요금 규칙 조회 실패: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    tariffVersion: row.tariff_version,
    serviceType: row.service_type,
    ruleCode: row.rule_code,
    ruleData: row.rule_data || {},
    needsConfirmation: Boolean(row.needs_confirmation),
    notes: row.notes,
    publicationStatus: row.publication_status || 'draft',
  }));
}

/**
 * Strict Core Calculation Engine for 2026 Official Tariff.
 * Zero confidential numbers hardcoded in code; everything read strictly from private DB.
 * Implements Item #1: Identifies draft vs approved publication status.
 * Implements Item #4: Never silently falls back if official calculation fails.
 * Implements Item #6: DB rules are the sole source of truth for extra fees.
 */
export async function calculateOfficialTariffQuote(
  input: OfficialQuoteCalculationInput
): Promise<OfficialQuoteCalculationResult> {
  const tariffVersion = input.tariffVersion || OFFICIAL_TARIFF_VERSION;
  const vehicleCount = Math.max(1, input.vehicleCount || 1);

  // 1. Fetch live cards & rules from private DB
  const [cards, rules] = await Promise.all([
    getOfficialPriceCards(tariffVersion),
    getOfficialPriceRules(tariffVersion),
  ]);

  if (!cards || cards.length === 0) {
    throw new Error(`유효한 2026 공식 요금표(${tariffVersion})를 데이터베이스에서 찾을 수 없습니다.`);
  }

  // 2. Resolve target card matching SKU
  const targetCard = cards.find(
    (c) => c.vehicleProductCode.toLowerCase() === input.vehicleProductCode.toLowerCase()
  );

  if (!targetCard) {
    throw new Error(`선택하신 상품 코드(${input.vehicleProductCode})에 해당하는 공식 요금 카드가 존재하지 않습니다.`);
  }

  const publicationStatus = (targetCard.publicationStatus as OfficialPublicationStatus) || 'draft';
  const isDraftPreview = publicationStatus !== 'approved';

  const isDaily = input.serviceCategory === 'daily_metro' || input.serviceCategory === 'daily_regional';
  const baseHours = isDaily ? targetCard.dailyBaseHours || 9 : targetCard.airportBaseHours || 3;
  const serviceHours = Math.max(baseHours, input.serviceHours || baseHours);

  const categoryLabels: Record<string, string> = {
    daily_metro: '일반 의전 (수도권 9시간)',
    daily_regional: '일반 의전 (지방/광역 9시간)',
    airport_gimpo: '공항 편도 (김포공항 3시간)',
    airport_incheon: '공항 편도 (인천공항 3시간)',
  };

  const lineItems: OfficialQuoteLineItem[] = [];
  const confirmationRequiredRules: { ruleCode: string; description: string }[] = [];

  // 3. Bus / Quote Required check
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
      publicationStatus,
      isDraftPreview,
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

  // 4. Base rate resolution per category
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

  // Overwrite base rate only if customer contract explicitly defined an override
  if (input.customBaseRateOverride !== undefined && input.customBaseRateOverride > 0) {
    baseRatePerVehicle = input.customBaseRateOverride;
  }

  if (baseRatePerVehicle === 0 && !targetCard.quoteRequired) {
    throw new Error(`[공식 요금 오류] ${targetCard.vehicleProductLabel}의 ${input.serviceCategory} 기본 요율이 DB에 정의되지 않았습니다.`);
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

  // 5. Overtime calculation (Strictly from private DB rules, zero hardcoded numbers)
  const overtimeRule = rules.find((r) => r.ruleCode === 'overtime_rates');
  const overtimeData = overtimeRule?.ruleData || {};
  const isSpecialTier =
    targetCard.vehicleProductCode.includes('sprinter') ||
    targetCard.vehicleProductCode === 'benz_s560' ||
    targetCard.vehicleProductCode === 'genesis_g90_donghaeng';

  const totalOvertimeHours = Math.max(0, serviceHours - baseHours);
  const nightHours = Math.min(totalOvertimeHours, Math.max(0, input.nightHours || 0));
  const standardOvertimeHours = Math.max(0, totalOvertimeHours - nightHours);

  let standardHourlyRate = 0;
  let nightHourlyRate = 0;

  if (standardOvertimeHours > 0) {
    standardHourlyRate = isSpecialTier
      ? Number(overtimeData.standard_hourly_krw?.sprinter || 0)
      : Number(overtimeData.standard_hourly_krw?.other_vehicles || 0);

    if (standardHourlyRate === 0) {
      throw new Error(`[DB 공식 요금 규칙 오류] 초과시간 요율 규정이 DB(cockpit.official_price_rules)에 설정되어 있지 않습니다.`);
    }
  }

  if (nightHours > 0) {
    nightHourlyRate = isSpecialTier
      ? Number(overtimeData.night_hourly_krw?.sprinter || 0)
      : Number(overtimeData.night_hourly_krw?.other_vehicles || 0);

    if (nightHourlyRate === 0) {
      throw new Error(`[DB 공식 요금 규칙 오류] 심야 초과시간 요율 규정이 DB(cockpit.official_price_rules)에 설정되어 있지 않습니다.`);
    }
  }

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

  // 6. Excess distance (Daily only: strictly from DB rule)
  let excessDistanceTotal = 0;
  if (isDaily && input.excessKm && input.excessKm > 0) {
    const distRule = rules.find((r) => r.ruleCode === 'daily_distance');
    const perKmRate = Number(distRule?.ruleData?.excess_km_charge_krw || 0);
    if (perKmRate === 0) {
      throw new Error(`[DB 공식 요금 규칙 오류] 거리 초과 요율 규정이 DB(cockpit.official_price_rules)에 설정되어 있지 않습니다.`);
    }
    excessDistanceTotal = input.excessKm * perKmRate * vehicleCount;

    lineItems.push({
      code: 'excess_distance',
      label: `일일 기준 주행거리(125km) 초과 (${input.excessKm}km × ${vehicleCount}대)`,
      quantity: input.excessKm * vehicleCount,
      unitPrice: perKmRate,
      totalPrice: excessDistanceTotal,
    });
  }

  // 7. English option
  // Basic English is ALREADY included in base rate (0 KRW).
  // Fluent upgrade strictly read from DB rule.
  let fluentEnglishUpgradeTotal = 0;
  if (input.englishOption === 'fluent_upgrade') {
    const englishRule = rules.find((r) => r.ruleCode === 'daily_fluent_english');
    const surchargePerDay = Number(englishRule?.ruleData?.surcharge_krw || 0);
    if (surchargePerDay === 0) {
      throw new Error(`[DB 공식 요금 규칙 오류] 영어 능통 기사 할증 규정이 DB(cockpit.official_price_rules)에 설정되어 있지 않습니다.`);
    }
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

  // 8. Needs confirmation alerts
  if (!isDaily && input.airportMeetAndGreet) {
    confirmationRequiredRules.push({
      ruleCode: 'airport_expenses',
      description: '공항 피켓 영접 서비스는 별도 요금 대상이나 단가가 미확정되어 관리자 확인이 필요합니다.',
    });
  }

  // 9. Supply Price and VAT (strictly 10%)
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
    publicationStatus,
    isDraftPreview,
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
