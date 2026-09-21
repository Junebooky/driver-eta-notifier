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
  passengerName: string;   // e.g. 'SOFYAN 외 1명'
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
  category: 'AIRPORT' | 'HOTEL' | 'CIRCUIT' | 'RETURN' | 'CUSTOM' | 'HOME';
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
