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
  etaFormatted = '03:08',
  mode,
}: GenerateReportParams): string {
  const carNumber = profile.vehicleNo || '4호차';
  const driverName = profile.driverName || '윤태준';
  const passengerName = profile.passengerName?.trim() || 'SOFYAN 외 1명';
  
  const destName = typeof destination === 'string' ? destination : destination.shortName;
  const originName = typeof origin === 'string' ? origin : origin ? origin.shortName : '현 위치';

  // Strict 24h format HH:mm (e.g. 03:08, 14:35) without "(xx분 소요)" or "오전/오후"
  let cleanEta = etaFormatted;
  const timeMatch = etaFormatted.match(/(\d{1,2}:\d{2})/);
  if (timeMatch) {
    cleanEta = timeMatch[1].padStart(5, '0');
  } else {
    cleanEta = etaFormatted.replace(/\s*\(.*?\)/, '').trim();
  }

  const header = `[${carNumber} ${driverName}]`;

  if (mode === 'ARRIVED') {
    const lines = [
      header,
      passengerName ? `• 담당승객: ${passengerName}` : null,
      `• 도착지: ${destName}`,
      `• 상태: 도착 완료`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  const lines = [
    header,
    passengerName ? `• 담당승객: ${passengerName}` : null,
    `• 출발지: ${originName}`,
    `• 목적지: ${destName}`,
    `• ETA: ${cleanEta}`,
  ].filter(Boolean);
  return lines.join('\n');
}
