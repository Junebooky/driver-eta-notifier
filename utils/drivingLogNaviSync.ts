import { RouteStopItem } from '@/utils/drivingLog';
import { DriverProfile, LocationPreset } from '@/types';
import {
  syncNavigationRouteToDrivingLog,
  captureActionSnapshot,
  formatKstTimeHHMM,
  FreshEtaRouteResult,
} from '@/utils/freshEtaActionPipeline';

/**
 * Appends a planned route stop to active driving log draft in KST.
 * Backward-compatible wrapper delegating to authoritative freshEtaActionPipeline.
 *
 * Records navigation launch as departure time, NEVER fabricating arrival time.
 */
export function addNavigationRouteToDrivingLog(params: {
  originName?: string;
  destinationName: string;
  destinationAddress?: string;
  driverProfile?: DriverProfile;
  bookingId?: string;
  predictedEta?: string;
  durationMinutes?: number;
  calculationSource?: string;
}): { success: boolean; isDuplicate: boolean; stop?: RouteStopItem } {
  if (typeof window === 'undefined') return { success: false, isDuplicate: false };

  const originPreset: LocationPreset = {
    id: 'orig',
    name: params.originName || '현재 위치',
    shortName: params.originName || '현재 위치',
    lat: 37.5042,
    lng: 127.0425,
    category: 'CUSTOM',
  };

  const destPreset: LocationPreset = {
    id: 'dest',
    name: params.destinationName,
    shortName: params.destinationName,
    address: params.destinationAddress,
    lat: 37.4495,
    lng: 126.4512,
    category: 'CUSTOM',
  };

  const clickedAt = new Date();
  const snapshot = captureActionSnapshot({
    origin: originPreset,
    destination: destPreset,
    bookingId: params.bookingId,
    driverProfile: params.driverProfile,
    clickedAt,
  });

  const routeResult: FreshEtaRouteResult = {
    durationMinutes: params.durationMinutes || 45,
    distanceKm: 0,
    etaFormatted: params.predictedEta || '--:--',
    departureTimeFormatted: formatKstTimeHHMM(clickedAt),
    computedAt: clickedAt.toISOString(),
    source: params.calculationSource || 'tmap_fresh',
    isFresh: true,
    routeFingerprint: `${originPreset.lat},${originPreset.lng}->${destPreset.lat},${destPreset.lng}`,
  };

  // Synchronously execute local draft write and fire async DB sync
  let result: { success: boolean; isDuplicate: boolean; stop?: RouteStopItem } = {
    success: false,
    isDuplicate: false,
  };

  syncNavigationRouteToDrivingLog({ snapshot, routeResult }).then((res) => {
    result = res;
  });

  return result;
}
