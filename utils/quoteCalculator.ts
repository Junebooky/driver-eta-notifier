import { HqQuoteItem, QuoteCalculationInput } from '@/types/quoteHq';
import { supabaseAdmin } from '@/lib/supabase/server';
import { normalizeDateToIso, normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';
import { DEFAULT_VEHICLE_PRICING_PRESETS, findVehiclePricingPreset } from '@/utils/settlementCalculator';

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

  // 1. Fetch pricing presets from Supabase (or fallback to defaults)
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

  // 2. Fetch customer contract terms if customerId provided
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

  // 3. Resolve base rate & overtime rate per vehicle
  const fallbackPreset = findVehiclePricingPreset(input.vehicleModel, DEFAULT_VEHICLE_PRICING_PRESETS) || DEFAULT_VEHICLE_PRICING_PRESETS[0];
  const matchedPreset =
    presets.find((p) => p.model_name === input.vehicleModel || input.vehicleModel?.includes(p.model_name)) ||
    fallbackPreset;

  let baseRatePerVehicle =
    serviceMode === 'vehicle_only'
      ? (matchedPreset.vehicle_only_fare || matchedPreset.vehicleOnlyFare || 600000)
      : (matchedPreset.base_fare || matchedPreset.baseFare10h || 800000);

  // If customer contract overrides base rate:
  if (customerContract?.baseRatePerVehicle) {
    baseRatePerVehicle = customerContract.baseRatePerVehicle;
  }

  const baseHours = matchedPreset.base_hours || matchedPreset.baseHours || 10;
  const requestedHours = Math.max(1, input.serviceHours || baseHours);
  const overtimeHours = Math.max(0, requestedHours - baseHours);

  // Overtime rate: check customer contract first, then preset
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

  // English chauffeur premium:
  // e.g. Sprinter standard 150k vs English 200k (+50,000원 per vehicle)
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
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
