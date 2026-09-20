import { DriverProfile, LocationPreset, ReportMode } from '@/types';

export interface GenerateReportParams {
  profile: DriverProfile;
  origin?: LocationPreset | string;
  destination: LocationPreset | string;
  etaFormatted?: string;
  distanceKm?: number;
  durationMinutes?: number;
  mode: ReportMode;
}

export function generateReportText({
  profile,
  origin,
  destination,
  etaFormatted = '약 70분 후',
  mode,
}: GenerateReportParams): string {
  const vehicle = profile.vehicleNo || '4호차';
  const driver = profile.driverName || '윤태준';
  
  const destName = typeof destination === 'string' ? destination : destination.shortName;
  const originName = typeof origin === 'string' ? origin : origin ? origin.shortName : '현 위치';

  const cleanEta = etaFormatted.split(' ')[0] || etaFormatted;

  if (mode === 'ARRIVED') {
    return `[${vehicle} ${driver}]\n• 목적지: ${destName}\n• 출발지: ${originName}\n• 상태: 도착 완료`;
  }

  return `[${vehicle} ${driver}]\n• 목적지: ${destName}\n• 출발지: ${originName}\n• ETA: ${cleanEta}`;
}
