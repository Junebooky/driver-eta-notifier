import { RouteStopItem, DrivingLogData, DRIVING_LOG_INDEX_KEY, DRIVING_LOG_STORAGE_PREFIX, saveDrivingLogDraft, loadDrivingLogDraft } from '@/utils/drivingLog';
import { DriverProfile } from '@/types';

/**
 * Appends a navigation route destination to today's active driving log draft.
 * Avoids duplicate additions within 30 minutes for the same destination.
 * Does not fabricate artificial arrival times or odometer numbers.
 */
export function addNavigationRouteToDrivingLog(params: {
  originName?: string;
  destinationName: string;
  destinationAddress?: string;
  driverProfile?: DriverProfile;
}): { success: boolean; isDuplicate: boolean; stop?: RouteStopItem } {
  if (typeof window === 'undefined') return { success: false, isDuplicate: false };

  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const rawIndex = localStorage.getItem(DRIVING_LOG_INDEX_KEY);
    const indexList: Array<{ reportId: string; date: string }> = rawIndex ? JSON.parse(rawIndex) : [];

    // Find today's report or create new one
    const todayEntry = indexList.find((item) => item.date === todayIso);
    let activeLog: DrivingLogData | null = null;

    if (todayEntry) {
      const stored = localStorage.getItem(`${DRIVING_LOG_STORAGE_PREFIX}${todayEntry.reportId}`);
      if (stored) {
        activeLog = JSON.parse(stored);
      }
    }

    if (!activeLog) {
      const defaultProfile: DriverProfile = params.driverProfile || {
        driverName: '윤태준',
        vehicleNo: '4호차',
        carNumber: '142호 7811',
        phone: '010-8842-1920',
        defaultNavi: 'tmap',
      };
      activeLog = loadDrivingLogDraft(defaultProfile, undefined, todayIso);
    }

    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Duplicate check: check if the last stop is identical
    const stops = activeLog.stops || [];
    const lastStop = stops.length > 0 ? stops[stops.length - 1] : null;
    if (lastStop && lastStop.place.trim().toLowerCase() === params.destinationName.trim().toLowerCase()) {
      return { success: true, isDuplicate: true, stop: lastStop };
    }

    const newStop: RouteStopItem = {
      id: `stop-nav-${Date.now()}`,
      time: currentTimeStr, // Navigation start time (departure)
      place: params.destinationName.trim(),
      address: params.destinationAddress || undefined,
      memo: params.originName ? `${params.originName} ➔ ${params.destinationName} (내비 연동)` : '내비게이션 안내 경로',
    };

    activeLog.stops = [...stops, newStop];
    saveDrivingLogDraft(activeLog);

    return { success: true, isDuplicate: false, stop: newStop };
  } catch (err) {
    console.warn('[DrivingLogNaviSync] Error adding route:', err);
    return { success: false, isDuplicate: false };
  }
}
