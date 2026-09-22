export type NaviProvider = 'tmap' | 'kakao' | 'naver';

export interface HomeLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface DriverProfile {
  id?: string;             // e.g. 'driver_4'
  vehicleNo: string;       // e.g. '4호차'
  carNumber?: string;      // e.g. '142호 7811'
  driverName: string;      // e.g. '윤태준'
  phone?: string;          // e.g. '010-6348-8726'
  mobile?: string;         // alias for phone
  passengerName: string;   // e.g. 'SOYFAN 외 1명'
  defaultNavi: NaviProvider; // 'tmap' | 'kakao' | 'naver'
  targetChatRoom?: string; // e.g. 'VIP 의전 단톡방'
  homeLocation?: HomeLocation | null;
}

export interface LocationPreset {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lng: number;
  category: 'AIRPORT' | 'HOTEL' | 'CIRCUIT' | 'RETURN' | 'CUSTOM' | 'HOME' | 'GAS';
  address?: string;
  isGlobal?: boolean;
  driverId?: string | null;
  vehicle_no?: string | null;
  vehicleNo?: string | null;
}

export type ReportMode = 'DEPARTURE' | 'ARRIVED' | 'WAITING' | 'RETURN';

export interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number;
  etaFormatted: string;
  trafficSummary?: string;
  isMock: boolean;
  isFallback?: boolean;
  fallbackNotice?: string;
  isCached?: boolean;
}

export type FuelCode = 'D047' | 'B027' | 'B034';

export interface GasPrices {
  diesel?: number;           // 경유 (D047)
  gasoline?: number;         // 휘발유 (B027)
  premiumGasoline?: number;  // 고급휘발유 (B034)
}

export interface GasStation {
  id: string;
  name: string;
  brandCode: string;
  brandName: string;
  price?: number;            // Primary/lowest display price
  prices: GasPrices;         // All-in-one 3-fuel prices
  fuelCode?: FuelCode;
  fuelName?: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  distanceKm: number;
  durationMinutes: number;
  tmapEtaFormatted: string;
  address?: string;
}

export type FlightType = 'arrival' | 'departure';

export interface FlightInfo {
  flightId: string;              // e.g. 'KE012'
  airline: string;               // e.g. '대한항공'
  type: FlightType;              // 'arrival' | 'departure'
  airport: string;               // e.g. '로스앤젤레스'
  airportCode: string;           // e.g. 'LAX'
  scheduleTimeFormatted: string; // e.g. '04:40'
  estimatedTimeFormatted: string;// e.g. '04:25'
  statusText: string;            // e.g. '04:25 (조기 도착 -15분)' or '12:40 (정상 출발)'
  diffMinutes: number;           // difference in minutes
  terminal: string;              // '제1여객터미널' | '제2여객터미널'
  terminalId: string;            // 'P01' | 'P02' | 'P03'
  isTomorrow?: boolean;          // true if flight is tomorrow (+1 day lookahead)
  flightDate?: string;           // 'YYYY-MM-DD'
  // Arrival specific:
  gateNumber?: string;           // e.g. '249'
  carousel?: string;             // e.g. '5'
  exitNumber?: string;           // e.g. 'A'
  curbsideGate?: string;         // e.g. '외부 11~14번 게이트'
  recommendedParking?: string;   // e.g. 'P2 단기 지상 (F·G구역)'
  arrivalLocationText: string;   // e.g. '제2여객터미널 A출구 (수하물 5번)'
  // Departure specific:
  checkinRange?: string;         // e.g. 'A B C D'
  suggestedDoor: string;         // e.g. '1번 도어'
  departureLocationText: string; // e.g. '제2여객터미널 3층 (1번 도어 앞)'
  // Target location preset for navigation:
  targetPreset: LocationPreset;
}

export type { ScheduleItem } from '@/data/ferrariSchedules';

// ==============================================================================
// Supabase Database Row Types (Enterprise Architecture)
// ==============================================================================
export interface DbPresetRow {
  id: string;
  category: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  order_index: number;
  created_at?: string;
}

export interface DbDriverRow {
  id: string;
  vehicle_no: string;
  car_number: string;
  driver_name: string;
  phone?: string | null;
  default_navi: NaviProvider;
  created_at?: string;
}

export interface DbScheduleRow {
  id: string;
  vehicle_no: string;
  date: string;
  pickup_time: string;
  time_display: string;
  origin: string;
  origin_address?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination: string;
  destination_address?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  passenger_name?: string | null;
  passenger_count?: number;
  passenger_note?: string | null;
  flight_number?: string | null;
  flight_type?: string | null;
  protocol_notes?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}
