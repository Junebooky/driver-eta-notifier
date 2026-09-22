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
  driverName: string;      // e.g. '윤태준'
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
