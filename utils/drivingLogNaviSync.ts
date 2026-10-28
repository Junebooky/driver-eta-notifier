import { RouteStopItem, DrivingLogData, DRIVING_LOG_INDEX_KEY, DRIVING_LOG_STORAGE_PREFIX, saveDrivingLogDraft, loadDrivingLogDraft } from '@/utils/drivingLog';
import { DriverProfile } from '@/types';
import { getKstTodayDateStr } from '@/utils/dispatchConflictDetector';

/**
 * Appends a planned route stop to today's active driving log draft in KST.
 * Clearly designates the stop as [예정 경로] (planned route).
 * Records navigation launch as departure time, NEVER fabricating arrival time or odometer.
 */
export function addNavigationRouteToDrivingLog(params: {
  originName?: string;
  destinationName: string;
  destinationAddress?: string;
  driverProfile?: DriverProfile;
}): { success: boolean; isDuplicate: boolean; stop?: RouteStopItem } {
  if (typeof window === 'undefined') return { success: false, isDuplicate: false };

  try {
    // 1. KST date and time formatting
    const todayIso = getKstTodayDateStr();
    const nowKst = new Date();
    const kstTimeParts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(nowKst);
    const hh = kstTimeParts.find((p) => p.type === 'hour')?.value || '09';
    const mm = kstTimeParts.find((p) => p.type === 'minute')?.value || '00';
    const departureTimeStr = `${hh}:${mm}`;

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

    // 2. Duplicate check: check if the last stop is identical (avoid duplicate clicks within same destination)
    const stops = activeLog.stops || [];
    const lastStop = stops.length > 0 ? stops[stops.length - 1] : null;
    if (lastStop && lastStop.place.trim().toLowerCase() === params.destinationName.trim().toLowerCase()) {
      return { success: true, isDuplicate: true, stop: lastStop };
    }

    // 3. Mark as planned route stop without fabricating destination arrival time
    const newStop: RouteStopItem = {
      id: `stop-nav-${Date.now()}`,
      time: '', // 도착시각은 실제 도착 후 기록하도록 비워둠
      place: params.destinationName.trim(),
      address: params.destinationAddress || undefined,
      memo: params.originName
        ? `[예정 경로] ${params.originName} ➔ ${params.destinationName} (출발 ${departureTimeStr})`
        : `[예정 경로] ${params.destinationName} (출발 ${departureTimeStr})`,
    };

    activeLog.stops = [...stops, newStop];
    saveDrivingLogDraft(activeLog);

    return { success: true, isDuplicate: false, stop: newStop };
  } catch (err) {
    console.warn('[DrivingLogNaviSync] Error adding route:', err);
    return { success: false, isDuplicate: false };
  }
}
