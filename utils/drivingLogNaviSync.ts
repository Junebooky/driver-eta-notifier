import {
  RouteStopItem,
  loadDrivingLogDraft,
  saveDrivingLogDraft,
  formatIsoDate,
} from '@/utils/drivingLog';
import { DriverProfile } from '@/types';
import { formatKstTimeHHMM } from '@/utils/freshEtaActionPipeline';

/**
 * Legacy synchronous wrapper for older callers/tests.
 * Writes to local driving log draft without fabricated 45m fallbacks,
 * without fake coordinates, and without fake tmap_fresh calculationSource.
 */
export function addNavigationRouteToDrivingLog(params: {
  originName?: string;
  originLat?: number;
  originLng?: number;
  destinationName: string;
  destinationAddress?: string;
  destinationLat?: number;
  destinationLng?: number;
  driverProfile?: DriverProfile;
  bookingId?: string;
  predictedEta?: string;
  durationMinutes?: number;
  calculationSource?: string;
}): { success: boolean; isDuplicate: boolean; stop?: RouteStopItem } {
  if (typeof window === 'undefined') return { success: false, isDuplicate: false };

  const clickedAt = new Date();
  const departureTimeFormatted = formatKstTimeHHMM(clickedAt);
  const todayIso = formatIsoDate(clickedAt);

  const defaultProfile: DriverProfile = params.driverProfile || {
    driverName: '담당 기사',
    vehicleNo: '차량 미지정',
    carNumber: '차량 미지정',
    phone: '',
    defaultNavi: 'tmap',
  };

  const activeLog = loadDrivingLogDraft(defaultProfile, undefined, todayIso, params.bookingId);

  const stops = activeLog.stops || [];
  const destName = params.destinationName.trim().toLowerCase();
  const lastStop = stops.length > 0 ? stops[stops.length - 1] : null;

  if (
    lastStop &&
    lastStop.place.trim().toLowerCase() === destName &&
    lastStop.departureTime === departureTimeFormatted
  ) {
    return { success: true, isDuplicate: true, stop: lastStop };
  }

  const originDisplay = params.originName || '현 위치';
  const duration = Number(params.durationMinutes);
  const hasValidDuration = Number.isFinite(duration) && duration > 0;
  const etaText = params.predictedEta && params.predictedEta !== '--:--' ? `, ETA ${params.predictedEta}` : '';
  const durText = hasValidDuration ? ` (예측 소요 ${duration}분${etaText})` : '';

  const newStop: RouteStopItem = {
    id: `stop-nav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: '',
    place: params.destinationName,
    address: params.destinationAddress,
    memo: `[출발 ${departureTimeFormatted}] ${originDisplay} ➔ ${params.destinationName}${durText}`,
    lat: params.destinationLat,
    lng: params.destinationLng,
    departureTime: departureTimeFormatted,
    departureTimestamp: clickedAt.toISOString(),
    predictedEta: params.predictedEta && params.predictedEta !== '--:--' ? params.predictedEta : undefined,
    predictedDurationMinutes: hasValidDuration ? duration : undefined,
    calculationSource: params.calculationSource || 'driver_action',
    isDraftNavigation: true,
  };

  activeLog.stops = [...stops, newStop];
  activeLog.bookingId = params.bookingId || activeLog.bookingId;
  activeLog.status = 'draft';

  saveDrivingLogDraft(activeLog);

  return { success: true, isDuplicate: false, stop: newStop };
}
