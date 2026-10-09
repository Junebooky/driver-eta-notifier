import { DriverProfile, LocationPreset, ReportMode } from '@/types';

export interface GenerateReportParams {
  profile: DriverProfile;
  origin?: LocationPreset | string;
  destination: LocationPreset | string;
  waypoints?: (LocationPreset | string)[];
  etaFormatted?: string;
  distanceKm?: number;
  durationMinutes?: number;
  mode: ReportMode;
  departureTimeText?: string;
}

export function formatReportHeader(vehicleNo?: string, driverName?: string): string {
  let v = vehicleNo?.trim() || '';
  v = v.replace(/^호차\s+/, '').trim();
  if (v === '호차') v = '';
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
  waypoints,
  etaFormatted = '03:08',
  mode,
  departureTimeText,
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

  const wpList = (waypoints || [])
    .map((w) => (typeof w === 'string' ? w : w.shortName))
    .filter(Boolean);

  const routePath = [originName, ...wpList, destName].join(' → ');

  const lines = [
    header,
    hasPassenger ? `• 담당승객: ${passengerName}` : null,
    departureTimeText
      ? `• 출발 예정: ${originName} (${departureTimeText})`
      : `• 이동: ${routePath}`,
    departureTimeText ? `• 목적지: ${destName}` : null,
    departureTimeText
      ? `• 예상 도착(ETA): ${cleanEta}`
      : `• ETA: ${cleanEta}`,
  ].filter(Boolean);
  return lines.join('\n');
}
