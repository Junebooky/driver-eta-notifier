import { HqQuoteItem, QuoteCalculationInput } from '@/types/quoteHq';
import { supabaseAdmin } from '@/lib/supabase/server';
import { normalizeDateToIso, normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';
import { DEFAULT_VEHICLE_PRICING_PRESETS, findVehiclePricingPreset } from '@/utils/settlementCalculator';
import {
  calculateOfficialTariffQuote,
} from '@/lib/pricing/officialPricingService';
import {
  resolveVehicleProductSku,
  OFFICIAL_TARIFF_VERSION,
} from '@/lib/pricing/officialPricingSkus';
import { OfficialServiceCategory } from '@/types/officialPricingHq';

export function generateQuoteNumber(dateStr: string, index: number = 1): string {
  const iso = normalizeDateToIso(dateStr) || new Date().toISOString().slice(0, 10);
  const compact = iso.replace(/-/g, '').slice(2); // '261028'
  return `QT-${compact}-${String(index).padStart(3, '0')}`;
}

export async function calculateQuote(input: QuoteCalculationInput): Promise<HqQuoteItem> {
  const date = normalizeDateToIso(input.date) || new Date().toISOString().slice(0, 10);
  const startTime = normalizeTimeHHmm(input.serviceStartTime) || '09:00';
  const endTime = normalizeTimeHHmm(input.serviceEndTime) || '19:00';
  const vehicleCount = Math.max(1, input.vehicleCount || 1);
  const driverLanguage = input.driverLanguage || 'ko';
  const serviceMode = input.serviceMode || 'with_driver';

  // 1. Fetch customer contract terms if customerId provided
  let customerContract: any = null;
  if (input.customerId) {
    try {
      const { data } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('id', input.customerId)
        .maybeSingle();
      if (data && data.pricing_preset) {
        customerContract = data.pricing_preset;
      }
    } catch (err) {
      console.warn('[QuoteCalculator] Notice loading customer pricing_preset:', err);
    }
  }

  // 2. Check if 2026 Official Tariff should be applied
  // Applied if explicitly requested via tariffVersion, or if vehicleProductCode is given, or if serviceCategory is given
  const isOfficialRequested =
    input.tariffVersion === OFFICIAL_TARIFF_VERSION ||
    Boolean(input.vehicleProductCode) ||
    Boolean(input.serviceCategory);

  if (isOfficialRequested) {
    try {
      let resolvedSku = input.vehicleProductCode;
      if (!resolvedSku) {
        const skuRes = resolveVehicleProductSku(input.vehicleModel);
        if (skuRes.isAmbiguous) {
          throw new Error(
            skuRes.notes ||
              `[${input.vehicleModel}] 모델은 세부 트림(최고급/일반/셔틀/하이리무진 등) 확인이 필요합니다. 관리자 수동 선택을 진행해 주세요.`
          );
        }
        if (skuRes.code) {
          resolvedSku = skuRes.code;
        } else {
          throw new Error(
            `[${input.vehicleModel}] 차종에 해당하는 2026 공식 상품 SKU를 찾을 수 없습니다. 공식 요금표에서 상품을 지정해 주세요.`
          );
        }
      }

      // If we have a valid 2026 SKU code, calculate using 2026 official calculation
      if (resolvedSku) {
        // Infer or determine service category
        let serviceCategory: OfficialServiceCategory = input.serviceCategory || 'daily_metro';
        if (!input.serviceCategory) {
          const combinedLoc = `${input.origin || ''} ${input.destination || ''}`;
          const isAirport = /인천|김포|ICN|GMP|공항|airport/i.test(combinedLoc);
          const isShortHours = (input.serviceHours || 10) <= 4;

          if (isAirport && isShortHours) {
            serviceCategory = /김포|GMP/i.test(combinedLoc) ? 'airport_gimpo' : 'airport_incheon';
          } else if (/강원|충청|경상|전라|부산|대구|광주|대전|울산|제주/i.test(combinedLoc)) {
            serviceCategory = 'daily_regional';
          } else {
            serviceCategory = 'daily_metro';
          }
        }

        const officialResult = await calculateOfficialTariffQuote({
          tariffVersion: OFFICIAL_TARIFF_VERSION,
          serviceCategory,
          vehicleProductCode: resolvedSku,
          vehicleCount,
          serviceHours: input.serviceHours,
          nightHours: input.nightHours,
          excessKm: input.excessKm,
          englishOption: input.englishOption || (driverLanguage === 'en' ? 'fluent_upgrade' : 'basic_included'),
          airportMeetAndGreet: input.airportMeetAndGreet,
          customBaseRateOverride: customerContract?.baseRatePerVehicle,
        });

        const nowIso = new Date().toISOString();
        const quoteNo = generateQuoteNumber(date, Math.floor(Math.random() * 800) + 100);

        return {
          quoteNo,
          customerId: input.customerId,
          customerName: input.customerName,
          contactPerson: input.contactPerson,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          date,
          serviceStartTime: startTime,
          serviceEndTime: endTime,
          serviceHours: officialResult.serviceHours,
          origin: input.origin,
          destination: input.destination,
          vehicleModel: officialResult.vehicleProductLabel,
          vehicleProductCode: officialResult.vehicleProductCode,
          vehicleCategory: resolvedSku.includes('sprinter')
            ? 'sprinter'
            : resolvedSku.includes('genesis')
            ? 'genesis'
            : resolvedSku.includes('bus')
            ? 'bus'
            : 'van',
          vehicleCount,
          driverLanguage,
          serviceMode,
          serviceCategory,
          baseRatePerVehicle: officialResult.baseRatePerVehicle,
          baseFareTotal: officialResult.baseFareTotal,
          overtimeHours: Math.max(0, officialResult.serviceHours - officialResult.baseHours),
          overtimeHourlyRate: 0, // variable by night/day
          isOvertimeRateConfirmed: true,
          overtimeFareTotal: officialResult.standardOvertimeTotal + officialResult.nightOvertimeTotal,
          englishSurchargePerVehicle:
            officialResult.fluentEnglishUpgradeTotal > 0
              ? Math.round(officialResult.fluentEnglishUpgradeTotal / vehicleCount)
              : 0,
          englishSurchargeTotal: officialResult.fluentEnglishUpgradeTotal,
          excessDistanceTotal: officialResult.excessDistanceTotal,
          nightOvertimeTotal: officialResult.nightOvertimeTotal,
          supplyPriceTotal: officialResult.supplyPriceTotal,
          vatAmount: officialResult.vatAmount,
          estimatedGrandTotal: officialResult.estimatedGrandTotal,
          quoteRequired: officialResult.quoteRequired,
          tariffVersion: officialResult.tariffVersion,
          pricingSource: 'official_2026',
          appliedPricingSnapshot: officialResult as any,
          notes: input.notes,
          status: 'draft',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      }
    } catch (err: any) {
      // P0 Review Requirement 4: Strictly forbid silent fallback to legacy pricing when official tariff is requested!
      console.error('[QuoteCalculator] 2026 official pricing calculation error:', err);
      throw new Error(`2026 공식 요금 산출 실패: ${err?.message || err}`);
    }
  }

  // 3. Legacy Calculation (Preserved for non-2026 or fallback requests)
  let presets: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('pricing_presets')
      .select('*')
      .eq('is_active', true);
    if (data && data.length > 0) presets = data;
  } catch (err) {
    console.warn('[QuoteCalculator] Notice loading pricing_presets:', err);
  }

  const fallbackPreset = findVehiclePricingPreset(input.vehicleModel, DEFAULT_VEHICLE_PRICING_PRESETS) || DEFAULT_VEHICLE_PRICING_PRESETS[0];
  const normModel = (input.vehicleModel || '').toUpperCase().replace(/\s+/g, '');
  const matchedFromSupabase = presets.find((p) => {
    if (p.model_name === input.vehicleModel) return true;
    const pNorm = (p.model_name || '').toUpperCase().replace(/\s+/g, '');
    if (normModel.includes('319') && p.id === 'preset-sprinter-319') return true;
    if (normModel.includes('519') && p.id === 'preset-sprinter-519') return true;
    if ((normModel.includes('VCLASS') || normModel.includes('V-CLASS')) && p.id === 'preset-v-class') return true;
    if ((normModel.includes('SCLASS') || normModel.includes('S-CLASS') || normModel.includes('S560')) && p.id === 'preset-s-class') return true;
    if (normModel.includes('G90') && p.id === 'preset-genesis-g90') return true;
    return normModel.includes(pNorm) || pNorm.includes(normModel);
  });
  const matchedPreset = matchedFromSupabase || fallbackPreset;

  let baseRatePerVehicle =
    serviceMode === 'vehicle_only'
      ? (matchedPreset.vehicle_only_fare ?? matchedPreset.vehicleOnlyFare ?? matchedPreset.vehicleOnlyRate ?? 600000)
      : (matchedPreset.base_fare ?? matchedPreset.baseFare10h ?? matchedPreset.withDriverRate ?? 800000);

  if (customerContract?.baseRatePerVehicle) {
    baseRatePerVehicle = customerContract.baseRatePerVehicle;
  }

  const baseHours = matchedPreset.base_hours || matchedPreset.baseHours || 10;
  const requestedHours = Math.max(1, input.serviceHours || baseHours);
  const overtimeHours = Math.max(0, requestedHours - baseHours);

  let hourlyOvertimeRate = 0;
  let isOvertimeRateConfirmed = false;

  if (customerContract?.hourlyOvertimeRate) {
    hourlyOvertimeRate = customerContract.hourlyOvertimeRate;
    isOvertimeRateConfirmed = true;
  } else if (matchedPreset.overtime_rate_per_hour || matchedPreset.overtimeHourlyRate) {
    hourlyOvertimeRate = matchedPreset.overtime_rate_per_hour || matchedPreset.overtimeHourlyRate || 0;
    isOvertimeRateConfirmed = hourlyOvertimeRate > 0;
  }

  const overtimeFarePerVehicle = isOvertimeRateConfirmed ? overtimeHours * hourlyOvertimeRate : 0;
  const overtimeFareTotal = overtimeFarePerVehicle * vehicleCount;

  let englishSurchargePerVehicle = 0;
  if (serviceMode === 'with_driver' && driverLanguage === 'en') {
    const koRate = matchedPreset.driver_labor_korean || 150000;
    const enRate = matchedPreset.driver_labor_english || 200000;
    englishSurchargePerVehicle = Math.max(0, enRate - koRate);
  }
  const englishSurchargeTotal = englishSurchargePerVehicle * vehicleCount;

  const baseFareTotal = baseRatePerVehicle * vehicleCount;
  const supplyPriceTotal = baseFareTotal + overtimeFareTotal + englishSurchargeTotal;
  const vatAmount = Math.round(supplyPriceTotal * 0.1);
  const estimatedGrandTotal = supplyPriceTotal + vatAmount;

  const nowIso = new Date().toISOString();
  const quoteNo = generateQuoteNumber(date, Math.floor(Math.random() * 800) + 100);

  return {
    quoteNo,
    customerId: input.customerId,
    customerName: input.customerName,
    contactPerson: input.contactPerson,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail,
    date,
    serviceStartTime: startTime,
    serviceEndTime: endTime,
    serviceHours: requestedHours,
    origin: input.origin,
    destination: input.destination,
    vehicleModel: matchedPreset.model_name || matchedPreset.vehicleModel || input.vehicleModel,
    vehicleCategory: matchedPreset.category || 'sprinter',
    vehicleCount,
    driverLanguage,
    serviceMode,
    baseRatePerVehicle,
    baseFareTotal,
    overtimeHours,
    overtimeHourlyRate: hourlyOvertimeRate,
    isOvertimeRateConfirmed,
    overtimeFareTotal,
    englishSurchargePerVehicle,
    englishSurchargeTotal,
    supplyPriceTotal,
    vatAmount,
    estimatedGrandTotal,
    notes: input.notes,
    status: 'draft',
    pricingSource: customerContract ? 'customer_contract' : 'preset',
    tariffVersion: 'legacy',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
