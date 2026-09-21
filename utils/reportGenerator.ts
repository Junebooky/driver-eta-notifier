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

export function formatReportHeader(vehicleNo?: string, driverName?: string): string {
  const v = vehicleNo?.trim() || '';
  const d = driverName?.trim() || '';

  if (v && d) {
    return `[${v} ${d}]`;
  }
  if (v) {
    return `[${v}]`;
  }
  if (d) {
    return `[${d}]`;
  }
  return '[의전 드라이버]';
}

export function generateReportText({
  profile,
  origin,
  destination,
  etaFormatted = '03:08',
  mode,
}: GenerateReportParams): string {
  const passengerName = profile.passengerName?.trim();
  const hasPassenger = Boolean(passengerName);
  
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

  const header = formatReportHeader(profile.vehicleNo, profile.driverName);

  if (mode === 'ARRIVED') {
    const lines = [
      header,
      hasPassenger ? `• 담당승객: ${passengerName}` : null,
      `• 도착지: ${destName}`,
      `• 상태: 도착 완료`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  const lines = [
    header,
    hasPassenger ? `• 담당승객: ${passengerName}` : null,
    `• 출발지: ${originName}`,
    `• 목적지: ${destName}`,
    `• ETA: ${cleanEta}`,
  ].filter(Boolean);
  return lines.join('\n');
}
