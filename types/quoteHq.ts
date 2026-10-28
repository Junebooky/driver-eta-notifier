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
  serviceHours: number; // 10
  origin: string;
  destination: string;
  vehicleModel: string;
  vehicleCategory: string;
  vehicleCount: number;
  driverLanguage: 'ko' | 'en';
  serviceMode: 'with_driver' | 'vehicle_only';
  baseRatePerVehicle: number;
  baseFareTotal: number;
  overtimeHours: number;
  overtimeHourlyRate: number;
  isOvertimeRateConfirmed: boolean;
  overtimeFareTotal: number;
  englishSurchargePerVehicle: number;
  englishSurchargeTotal: number;
  supplyPriceTotal: number; // 공급가액
  vatAmount: number; // 부가세 10%
  estimatedGrandTotal: number; // 총 합계
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
  notes?: string;
}

