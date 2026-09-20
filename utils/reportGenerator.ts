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
  distanceKm,
  durationMinutes,
  mode,
}: GenerateReportParams): string {
  const vehicle = profile.vehicleNo || '4호차';
  const passenger = profile.passengerName || 'SOFYAN 외 1명';
  
  const destName = typeof destination === 'string' ? destination : destination.shortName;
  const originName = typeof origin === 'string' ? origin : origin ? origin.shortName : '현 위치';

  const cleanEta = etaFormatted.split(' ')[0] || etaFormatted;
  const metricsTag = distanceKm && durationMinutes ? ` / ${distanceKm}km(약 ${durationMinutes}분)` : '';

  switch (mode) {
    case 'DEPARTURE':
      return `[출발/이동] ${vehicle} ${originName} to ${destName} 출발 / ${passenger} 승차${metricsTag} / ETA ${cleanEta}`;
    
    case 'ARRIVED':
      return `[도착/하차] ${vehicle} ${destName} 도착 / ${passenger} 하차 완료`;
    
    case 'WAITING':
      return `[현장 대기] ${vehicle} ${destName} 도착 / 로비 대기 중`;
    
    case 'RETURN':
      return `[차량 반납] ${vehicle} 차량 반납 완료 특이사항 없음`;

    default:
      return `[업무보고] ${vehicle} ${destName} 이동 중`;
  }
}
