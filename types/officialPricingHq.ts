/**
 * VIP LIMOUSINE KOREA - Official 2026 VIP Tariff Types
 * 
 * Strict Single Source of Truth for Official 2026 Pricing:
 * - Backed by `cockpit.official_price_cards` and `cockpit.official_price_rules`.
 * - Zero hardcoding of confidential rates in client code.
 * - Dynamic SKU-based resolution.
 */

export type OfficialTariffVersion = 'vlk_2026_initial' | 'legacy';

export type OfficialServiceCategory =
  | 'daily_metro'       // 일반 의전 9시간 (수도권)
  | 'daily_regional'    // 일반 의전 9시간 (지방)
  | 'airport_gimpo'     // 공항 편도 3시간 (김포)
  | 'airport_incheon';  // 공항 편도 3시간 (인천)

export interface OfficialPriceCard {
  id: string;
  tariffYear: number;
  tariffVersion: string;
  vehicleProductCode: string;
  vehicleProductLabel: string;
  capacityNote: string | null;
  dailyBaseHours: number;      // 9 hours
  airportBaseHours: number;    // 3 hours
  dailyMetroKrw: number | null;
  dailyRegionalKrw: number | null;
  airportGimpoKrw: number | null;
  airportIncheonKrw: number | null;
  quoteRequired: boolean;      // true for 22/28/45-seater buses
  vatExcluded: boolean;        // true (all official rates VAT exclusive)
  publicationStatus: 'draft' | 'published' | 'archived';
  sourceLabel: string;
  notes: string | null;
}

export interface OfficialPriceRule {
  id: string;
  tariffVersion: string;
  serviceType: 'all' | 'daily' | 'airport';
  ruleCode: string;
  ruleData: Record<string, any>;
  needsConfirmation: boolean;
  notes: string | null;
  publicationStatus: string;
}

export interface VehicleProductMapping {
  vehicleProductCode: string;
  vehicleProductLabel: string;
  tier: 'sprinter' | 'genesis' | 'sedan' | 'suv' | 'van' | 'bus';
  matchKeywords: string[];
  capacityNote: string;
  quoteRequired: boolean;
  notes?: string;
}

export interface OfficialQuoteCalculationInput {
  tariffVersion?: OfficialTariffVersion;
  serviceCategory: OfficialServiceCategory;
  vehicleProductCode: string;
  vehicleCount?: number;
  serviceHours?: number;           // Defaults to base hours (9 or 3)
  nightHours?: number;             // Hours operating between 22:00 - 06:00
  excessKm?: number;               // Daily km exceeding 125km
  englishOption?: 'basic_included' | 'fluent_upgrade';
  airportMeetAndGreet?: boolean;   // Signage / picket service (needs confirmation)
  customBaseRateOverride?: number; // Optional customer contract negotiated rate
  customerName?: string;
  contactPerson?: string;
  contactPhone?: string;
  date?: string;
  serviceStartTime?: string;
  serviceEndTime?: string;
  origin?: string;
  destination?: string;
  notes?: string;
}

export interface OfficialQuoteLineItem {
  code: string;
  label: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  isConfirmationRequired?: boolean;
  note?: string;
}

export interface OfficialQuoteCalculationResult {
  tariffVersion: string;
  publicationStatus: 'draft' | 'published';
  pricingSource: 'official_2026';
  serviceCategory: OfficialServiceCategory;
  serviceCategoryLabel: string;
  vehicleProductCode: string;
  vehicleProductLabel: string;
  capacityNote: string;
  baseHours: number;
  serviceHours: number;
  vehicleCount: number;
  quoteRequired: boolean;
  
  // Pricing amounts (null if quote_required)
  baseRatePerVehicle: number | null;
  baseFareTotal: number | null;
  standardOvertimeTotal: number;
  nightOvertimeTotal: number;
  excessDistanceTotal: number;
  fluentEnglishUpgradeTotal: number;
  
  supplyPriceTotal: number | null; // 공급가액 (VAT 별도)
  vatAmount: number | null;         // 부가세 10%
  estimatedGrandTotal: number | null; // 총 합계

  // Transparency breakdowns and compliance checks
  lineItems: OfficialQuoteLineItem[];
  confirmationRequiredRules: {
    ruleCode: string;
    description: string;
  }[];

  snapshotTimestamp: string;
}
