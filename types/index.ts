export type NaviProvider = 'tmap' | 'kakao' | 'naver';

export interface DriverProfile {
  vehicleNo: string;       // e.g. '4호차'
  driverName: string;      // e.g. '윤태준'
  passengerName: string;   // e.g. 'SOFYAN 외 1명'
  defaultNavi: NaviProvider; // 'tmap' | 'kakao' | 'naver'
}

export interface LocationPreset {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lng: number;
  category: 'AIRPORT' | 'HOTEL' | 'CIRCUIT' | 'RETURN' | 'CUSTOM';
  address?: string;
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
