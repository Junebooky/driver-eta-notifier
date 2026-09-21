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
  etaFormatted = '14:30',
  mode,
}: GenerateReportParams): string {
  const vehicle = profile.vehicleNo || '4호차';
  const passenger = profile.passengerName?.trim();
  
  const destName = typeof destination === 'string' ? destination : destination.shortName;
  const originName = typeof origin === 'string' ? origin : origin ? origin.shortName : '현 위치';

  // Strict 24h format HH:mm (e.g. 14:35) without "(xx분 소요)" or "오전/오후"
  let cleanEta = etaFormatted;
  const timeMatch = etaFormatted.match(/(\d{1,2}:\d{2})/);
  if (timeMatch) {
    cleanEta = timeMatch[1].padStart(5, '0');
  } else {
    cleanEta = etaFormatted.replace(/\s*\(.*?\)/, '').trim();
  }

  if (mode === 'ARRIVED') {
    return passenger
      ? `[${vehicle}] ${destName} 도착 / ${passenger} 하차 완료`
      : `[${vehicle}] ${destName} 도착 완료`;
  }

  return passenger
    ? `[${vehicle}] ${originName} to ${destName} 출발 / ${passenger} 승차 / ETA ${cleanEta}`
    : `[${vehicle}] ${originName} to ${destName} 출발 / ETA ${cleanEta}`;
}
