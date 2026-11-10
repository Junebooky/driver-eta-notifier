export interface HqQuoteItem {
  quoteNo: string; // e.g. 'QT-261028-001'
  customerId?: string;
  customerName: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  date: string; // 'YYYY-MM-DD'
  serviceStartTime: string; // '09:00'
  serviceEndTime: string; // '19:00'
  serviceHours: number; // 9 or 10
  origin: string;
  destination: string;
  vehicleModel: string;
  vehicleProductCode?: string; // 2026 official SKU (e.g. 'sprinter_519_premium')
  vehicleCategory: string;
  vehicleCount: number;
  driverLanguage: 'ko' | 'en';
  serviceMode: 'with_driver' | 'vehicle_only';
  serviceCategory?: string; // 'daily_metro' | 'daily_regional' | 'airport_gimpo' | 'airport_incheon'
  
  // Rate amounts (null if quote_required)
  baseRatePerVehicle: number | null;
  baseFareTotal: number | null;
  overtimeHours: number;
  overtimeHourlyRate: number;
  isOvertimeRateConfirmed: boolean;
  overtimeFareTotal: number;
  englishSurchargePerVehicle: number;
  englishSurchargeTotal: number;
  excessDistanceTotal?: number;
  nightOvertimeTotal?: number;

  supplyPriceTotal: number | null; // 공급가액
  vatAmount: number | null; // 부가세 10%
  estimatedGrandTotal: number | null; // 총 합계
  quoteRequired?: boolean; // true for 22/28/45-seater buses

  // Snapshot Immutability (P0)
  tariffVersion?: string; // 'vlk_2026_initial'
  pricingSource?: 'official_2026' | 'customer_contract' | 'preset' | 'booking_override';
  appliedPricingSnapshot?: Record<string, any>;

  notes?: string;
  status: 'draft' | 'sent' | 'confirmed' | 'converted' | 'cancelled';
  convertedBookingId?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteCalculationInput {
  customerId?: string;
  customerName: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  date: string;
  serviceStartTime?: string;
  serviceEndTime?: string;
  serviceHours?: number;
  origin: string;
  destination: string;
  vehicleModel: string;
  vehicleCount?: number;
  driverLanguage?: 'ko' | 'en';
  serviceMode?: 'with_driver' | 'vehicle_only';
  
  // 2026 Official Tariff extensions
  tariffVersion?: string;
  vehicleProductCode?: string;
  serviceCategory?: 'daily_metro' | 'daily_regional' | 'airport_gimpo' | 'airport_incheon';
  nightHours?: number;
  excessKm?: number;
  englishOption?: 'basic_included' | 'fluent_upgrade';
  airportMeetAndGreet?: boolean;

  notes?: string;
}
