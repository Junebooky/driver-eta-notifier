/**
 * Authoritative Fresh ETA Action Pipeline & Navigation/HQ Synchronization
 *
 * Implements Issue #35:
 * 1. Fresh ETA calculation bypassing 3-minute route cache on button actions.
 * 2. Immutable click-instant snapshot (clickedAt, route, language, mode, bookingId).
 * 3. Mobile user-gesture friendly clipboard & app launch handling.
 * 4. Resilient driving log draft & HQ synchronization (without fabricating arrival time).
 * 5. Navigation execution is NEVER blocked by DB/network failures.
 */

import { LocationPreset, NaviProvider, DriverProfile, ReportMode } from '@/types';
import { RouteStopItem, DrivingLogData, DRIVING_LOG_INDEX_KEY, DRIVING_LOG_STORAGE_PREFIX, loadDrivingLogDraft, saveDrivingLogDraft, formatKoreanDate, formatIsoDate } from '@/utils/drivingLog';
import { generateVipReportText } from '@/utils/kakao';
import { generateEnglishReportText, getReportVehicleNo, lookupApprovedAlias } from '@/utils/locationTranslation';
import { launchNavigationApp } from '@/utils/navigation';
import { submitDriverLogToHq } from '@/utils/drivingLogHqStorage';

export const OUTBOX_STORAGE_KEY = 'cockpit_driving_log_outbox_v1';

export interface NavigationOutboxItem {
  id: string; // idempotencyKey
  bookingId?: string;
  driverId?: string;
  payload: any;
  createdAt: string;
  status: 'local_draft' | 'server_sync_pending' | 'server_synced';
  retryCount: number;
  lastAttemptAt?: string;
  error?: string;
}

export interface FreshEtaSnapshot {
  clickedAt: Date;
  departureTimeFormatted: string; // KST HH:mm
  origin: LocationPreset;
  destination: LocationPreset;
  waypoints: LocationPreset[];
  adminWaypoints: LocationPreset[];
  isAdminRoute: boolean;
  defaultNavi: NaviProvider;
  reportMode: ReportMode;
  language: 'ko' | 'en';
  bookingId?: string;
  driverProfile?: DriverProfile;
  idempotencyKey: string;
}

export interface FreshEtaRouteResult {
  durationMinutes: number;
  distanceKm: number;
  etaFormatted: string; // HH:mm
  departureTimeFormatted: string; // HH:mm
  computedAt: string; // ISO
  source: string; // 'tmap_fresh' | 'tmap_cached' | 'haversine_mock' | 'tmap_fallback'
  isFresh: boolean;
  routeFingerprint: string;
  trafficSummary?: string;
  estimatedTollWon?: number | null;
  error?: string;
  isUnavailable?: boolean;
}

export interface FreshEtaActionResult {
  success: boolean;
  actionType: 'navi_with_log' | 'navi_only' | 'kakao_share' | 'copy_report';
  snapshot: FreshEtaSnapshot;
  routeResult: FreshEtaRouteResult;
  reportText: string;
  logSyncResult?: {
    success: boolean;
    isDuplicate: boolean;
    stop?: RouteStopItem;
    error?: string;
  };
  clipboardSuccess: boolean;
  appLaunchSuccess: boolean;
  requiresGestureFallback: boolean;
  errorMessage?: string;
}

/**
 * Format a Date object to KST 24-hour HH:mm string
 */
export function formatKstTimeHHMM(d: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hh = parts.find((p) => p.type === 'hour')?.value || '09';
    const mm = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${hh}:${mm}`;
  } catch {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}

/**
 * Calculate target ETA formatted string from baseDate + durationMinutes in KST
 */
export function calculateDynamicEtaFormatted(durationMinutes: number, baseDate: Date = new Date()): string {
  if (durationMinutes <= 0) return '--:--';
  const etaDate = new Date(baseDate.getTime() + durationMinutes * 60 * 1000);
  return formatKstTimeHHMM(etaDate);
}

/**
 * Capture immutable click snapshot at the exact instant the driver triggers an action
 */
export function captureActionSnapshot(params: {
  origin: LocationPreset;
  destination: LocationPreset;
  waypoints?: LocationPreset[];
  adminWaypoints?: LocationPreset[];
  isAdminRoute?: boolean;
  defaultNavi?: NaviProvider;
  reportMode?: ReportMode;
  language?: 'ko' | 'en';
  bookingId?: string;
  driverProfile?: DriverProfile;
  clickedAt?: Date;
}): FreshEtaSnapshot {
  const clickedAt = params.clickedAt || new Date();
  const departureTimeFormatted = formatKstTimeHHMM(clickedAt);
  const destName = (params.destination.shortName || params.destination.name || 'destination').trim().toLowerCase();
  const driverKey = (params.driverProfile?.driverId || params.driverProfile?.driverName || 'driver').trim().toLowerCase();
  const bookingKey = (params.bookingId || 'standalone').trim().toLowerCase();
  const minuteBucket = Math.floor(clickedAt.getTime() / 60000);
  const routeFingerprint = `${params.origin.lat.toFixed(4)},${params.origin.lng.toFixed(4)}->${params.destination.lat.toFixed(4)},${params.destination.lng.toFixed(4)}`;
  const idempotencyKey = `action_${driverKey}_${bookingKey}_${routeFingerprint}_${minuteBucket}`;

  return {
    clickedAt,
    departureTimeFormatted,
    origin: { ...params.origin },
    destination: { ...params.destination },
    waypoints: (params.waypoints || []).map((w) => ({ ...w })),
    adminWaypoints: (params.adminWaypoints || []).map((w) => ({ ...w })),
    isAdminRoute: Boolean(params.isAdminRoute),
    defaultNavi: params.defaultNavi || params.driverProfile?.defaultNavi || 'tmap',
    reportMode: params.reportMode || 'DEPARTURE',
    language: params.language || 'ko',
    bookingId: params.bookingId,
    driverProfile: params.driverProfile,
    idempotencyKey,
  };
}

/**
 * Fetch fresh ETA route from /api/route with explicit cache bypass (purpose=action&bypassCache=true)
 */
export async function fetchFreshEtaRoute(snapshot: FreshEtaSnapshot): Promise<FreshEtaRouteResult> {
  const { origin, destination, waypoints, adminWaypoints, isAdminRoute, clickedAt, departureTimeFormatted } = snapshot;

  const effectiveWaypoints: LocationPreset[] = isAdminRoute
    ? [
        { ...origin, name: origin.shortName || origin.name },
        ...(adminWaypoints || []).map((w) => ({ ...w, name: w.shortName || w.name })),
      ]
    : waypoints;

  const validWaypoints = (effectiveWaypoints || []).filter(
    (w) => w && typeof w.lat === 'number' && typeof w.lng === 'number' && (w.lat !== 0 || w.lng !== 0)
  );

  const passListParam =
    validWaypoints.length > 0
      ? `&passList=${validWaypoints.map((w) => `${w.lng},${w.lat}`).join('_')}`
      : '';

  const startName = encodeURIComponent(origin.shortName || origin.name);
  const endName = encodeURIComponent(destination.shortName || destination.name);
  const url = `/api/route?startX=${origin.lng}&startY=${origin.lat}&endX=${destination.lng}&endY=${destination.lat}&startName=${startName}&endName=${endName}${passListParam}&bypassCache=true&purpose=action&clientTimestamp=${clickedAt.getTime()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(url, {
      signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(3500)
        : controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Route API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawDuration = Number(data.durationMinutes);
    const isValidDuration = Number.isFinite(rawDuration) && rawDuration > 0;
    const durationMinutes = isValidDuration ? rawDuration : 0;
    const distanceKm = Number(data.distanceKm) || 0;
    const etaFormatted = isValidDuration
      ? calculateDynamicEtaFormatted(durationMinutes, clickedAt)
      : '--:--';
    const isFresh = Boolean(isValidDuration && data.isFresh !== false && !data.isCached && !data.isMock);

    return {
      durationMinutes,
      distanceKm,
      etaFormatted,
      departureTimeFormatted,
      computedAt: data.computedAt || new Date().toISOString(),
      source: data.source || (data.isMock ? 'haversine_mock' : 'tmap_fresh'),
      isFresh,
      routeFingerprint: data.routeFingerprint || `${origin.lat},${origin.lng}->${destination.lat},${destination.lng}`,
      trafficSummary: data.trafficSummary || (isValidDuration ? '실시간 교통 반영' : '경로 정보 없음'),
      estimatedTollWon: data.estimatedTollWon ?? null,
      isUnavailable: !isValidDuration,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('[FreshEtaActionPipeline] Route API fetch failed or timed out:', err?.message);

    return {
      durationMinutes: 0,
      distanceKm: 0,
      etaFormatted: '--:--',
      departureTimeFormatted,
      computedAt: clickedAt.toISOString(),
      source: 'tmap_fallback',
      isFresh: false,
      routeFingerprint: `${origin.lat},${origin.lng}->${destination.lat},${destination.lng}`,
      isUnavailable: true,
      error: err?.message || '실시간 경로 조회 실패',
    };
  }
}

/**
 * Regenerate formatted report text in target language & report mode using fresh ETA
 */
export function buildFreshReportText(params: {
  snapshot: FreshEtaSnapshot;
  etaFormatted: string;
  durationMinutes?: number;
  distanceKm?: number;
}): string {
  const { snapshot, etaFormatted } = params;
  const { origin, destination, waypoints, driverProfile, reportMode, language, departureTimeFormatted } = snapshot;

  const hasValidEta = Boolean(etaFormatted && etaFormatted !== '--:--');

  if (language === 'en') {
    const rawVehicle = driverProfile?.carNumber || driverProfile?.plateNumber || (driverProfile?.vehicleNo && driverProfile.vehicleNo !== '차량 미지정' ? driverProfile.vehicleNo : '');
    const vehicleNo = rawVehicle ? getReportVehicleNo(driverProfile) : 'Vehicle Pending';
    const originEn = lookupApprovedAlias({ name: origin.name, shortName: origin.shortName, id: origin.id }) || origin.shortName || origin.name;
    const destEn = lookupApprovedAlias({ name: destination.name, shortName: destination.shortName, id: destination.id }) || destination.shortName || destination.name;
    const waypointsEn = (waypoints || []).map(
      (w) => lookupApprovedAlias({ name: w.name, shortName: w.shortName, id: w.id }) || w.shortName || w.name
    );

    return generateEnglishReportText({
      vehicleNo: vehicleNo || 'Vehicle Pending',
      originEn,
      destinationEn: destEn,
      waypointsEn,
      etaFormatted: hasValidEta ? etaFormatted : 'Pending Confirmation',
      mode: reportMode,
    });
  }

  // Korean Report Template (No hardcoded 윤태준 / 142호 7811 fallback)
  const carNumber = driverProfile?.carNumber || driverProfile?.plateNumber || driverProfile?.vehicleNo || '차량 미지정';
  const driverName = driverProfile?.driverName || '담당 기사';
  const passengerName = driverProfile?.clientName || driverProfile?.passengerName || undefined;

  return generateVipReportText({
    carNumber,
    driverName,
    passengerName,
    destinationName: destination.shortName || destination.name,
    originName: origin.shortName || origin.name,
    waypoints: waypoints.map((w) => w.shortName || w.name),
    distanceKm: params.distanceKm,
    durationMinutes: params.durationMinutes,
    etaFormatted: hasValidEta ? etaFormatted : '도착 미정',
    mode: reportMode,
    departureTimeText: reportMode === 'DEPARTURE' ? departureTimeFormatted : undefined,
  });
}

/**
 * Append navigation route stop to driving log draft and sync to server as draft
 * - Departure time = Click time (KST HH:mm)
 * - Actual arrival time is NEVER fabricated
 * - Multiple bookings on same day separated by driver UUID + booking UUID
 * - Idempotent submission: rapid double-clicks do NOT duplicate stops
 */
export async function syncNavigationRouteToDrivingLog(params: {
  snapshot: FreshEtaSnapshot;
  routeResult: FreshEtaRouteResult;
}): Promise<{ success: boolean; isDuplicate: boolean; stop?: RouteStopItem; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, isDuplicate: false, error: 'No browser environment' };
  }

  const { snapshot, routeResult } = params;
  const { origin, destination, driverProfile, bookingId, departureTimeFormatted, idempotencyKey } = snapshot;

  try {
    const todayIso = formatIsoDate(snapshot.clickedAt);
    const defaultProfile: DriverProfile = driverProfile || {
      driverName: '담당 기사',
      vehicleNo: '차량 미지정',
      carNumber: '차량 미지정',
      phone: '',
      defaultNavi: 'tmap',
    };

    // 1. Find existing draft for this booking or date
    const rawIndex = localStorage.getItem(DRIVING_LOG_INDEX_KEY);
    const indexList: Array<{ reportId: string; date: string; bookingId?: string }> = rawIndex
      ? JSON.parse(rawIndex)
      : [];

    let targetReportId: string | null = null;
    if (bookingId) {
      const match = indexList.find((item) => item.bookingId === bookingId);
      if (match) targetReportId = match.reportId;
    }
    if (!targetReportId) {
      const matchDate = indexList.find((item) => item.date === todayIso && !item.bookingId);
      if (matchDate) targetReportId = matchDate.reportId;
    }

    let activeLog: DrivingLogData | null = null;
    if (targetReportId) {
      const stored = localStorage.getItem(`${DRIVING_LOG_STORAGE_PREFIX}${targetReportId}`);
      if (stored) {
        try {
          activeLog = JSON.parse(stored);
        } catch {
          activeLog = null;
        }
      }
    }

    if (!activeLog) {
      activeLog = loadDrivingLogDraft(defaultProfile, undefined, todayIso, bookingId);
    }

    const stops = activeLog.stops || [];

    // 2. Idempotency Check: Prevent duplicate stop if already added with same idempotency key or destination in 60s
    const existingByIdempotency = stops.find((s) => s.actionIdempotencyKey === idempotencyKey);
    if (existingByIdempotency) {
      return { success: true, isDuplicate: true, stop: existingByIdempotency };
    }

    const lastStop = stops.length > 0 ? stops[stops.length - 1] : null;
    const destName = (destination.shortName || destination.name).trim().toLowerCase();
    if (
      lastStop &&
      lastStop.place.trim().toLowerCase() === destName &&
      lastStop.departureTime === departureTimeFormatted
    ) {
      return { success: true, isDuplicate: true, stop: lastStop };
    }

    // 3. Create fresh Stop item with departure time; Arrival time is NOT estimated or fabricated
    const destDisplay = destination.shortName || destination.name;
    const originDisplay = origin.shortName || origin.name;
    const etaText = routeResult.etaFormatted !== '--:--' ? `, ETA ${routeResult.etaFormatted}` : '';
    const durText = routeResult.durationMinutes > 0 ? ` (예측 소요 ${routeResult.durationMinutes}분${etaText})` : '';

    const newStop: RouteStopItem = {
      id: `stop-nav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: '', // 도착 시각은 실제 도착 후 기록하도록 명시적으로 비워둠 (가짜 도착 생성 금지)
      place: destDisplay,
      address: destination.address,
      memo: `[출발 ${departureTimeFormatted}] ${originDisplay} ➔ ${destDisplay}${durText}`,
      lat: destination.lat,
      lng: destination.lng,
      departureTime: departureTimeFormatted,
      departureTimestamp: snapshot.clickedAt.toISOString(),
      predictedEta: routeResult.etaFormatted !== '--:--' ? routeResult.etaFormatted : undefined,
      predictedDurationMinutes: routeResult.durationMinutes > 0 ? routeResult.durationMinutes : undefined,
      estimatedAt: routeResult.computedAt,
      calculationSource: routeResult.source,
      routeFingerprint: routeResult.routeFingerprint,
      actionIdempotencyKey: idempotencyKey,
      isDraftNavigation: true,
    };

    activeLog.stops = [...stops, newStop];
    activeLog.bookingId = bookingId || activeLog.bookingId;
    activeLog.status = 'draft';

    // 4. Save local draft
    saveDrivingLogDraft(activeLog);

    // 5. Append to Outbox for resilient offline retry
    try {
      const rawOutbox = localStorage.getItem(OUTBOX_STORAGE_KEY);
      const outboxList: NavigationOutboxItem[] = rawOutbox ? JSON.parse(rawOutbox) : [];
      const existingIdx = outboxList.findIndex((item) => item.id === idempotencyKey);
      const outboxItem: NavigationOutboxItem = {
        id: idempotencyKey,
        bookingId: activeLog.bookingId,
        driverId: activeLog.driverId,
        payload: {
          id: activeLog.reportId.startsWith('report_') && activeLog.reportId.length === 43 ? activeLog.reportId.slice(7) : undefined,
          bookingId: activeLog.bookingId,
          driverId: activeLog.driverId,
          driverName: activeLog.driverName,
          vehiclePlate: activeLog.carNumber,
          vehicleModel: '법인 차량',
          customerName: activeLog.clientName || '고객사',
          drivingDate: activeLog.rawDate,
          clockIn: activeLog.clockIn || null,
          clockOut: activeLog.clockOut || null,
          startKm: activeLog.startKm,
          endKm: activeLog.endKm,
          stops: activeLog.stops,
          notes: activeLog.notes,
          status: 'draft',
        },
        createdAt: new Date().toISOString(),
        status: 'server_sync_pending',
        retryCount: 0,
      };

      if (existingIdx >= 0) {
        outboxList[existingIdx] = outboxItem;
      } else {
        outboxList.push(outboxItem);
      }
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(outboxList.slice(-20)));
    } catch (e) {
      console.warn('[FreshEtaActionPipeline] Failed to write outbox entry:', e);
    }

    // Register auto-sync listeners on online / visibilitychange
    registerOutboxAutoSync();

    // 6. Asynchronous sync to Supabase /api/driving-logs (Non-blocking: Failure NEVER blocks navi)
    fetch('/api/driving-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: activeLog.bookingId,
        driverId: activeLog.driverId,
        driverName: activeLog.driverName,
        vehiclePlate: activeLog.carNumber,
        vehicleModel: '법인 차량',
        customerName: activeLog.clientName || '고객사',
        drivingDate: activeLog.rawDate,
        clockIn: activeLog.clockIn || null,
        clockOut: activeLog.clockOut || null,
        startKm: activeLog.startKm,
        endKm: activeLog.endKm,
        stops: activeLog.stops,
        notes: activeLog.notes,
        status: 'draft',
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data?.ok && data?.log) {
            // Also notify HQ storage snapshot so HQ view updates
            submitDriverLogToHq(data.log);
            // On successful sync, purge from outbox queue
            markOutboxItemSynced(idempotencyKey);
          }
        }
      })
      .catch((netErr) => {
        console.warn('[FreshEtaActionPipeline] Async DB draft sync deferred:', netErr?.message);
      });

    return { success: true, isDuplicate: false, stop: newStop };
  } catch (err: any) {
    console.warn('[FreshEtaActionPipeline] Local driving log sync error:', err?.message);
    return { success: false, isDuplicate: false, error: err?.message || '운행일지 기록 실패' };
  }
}

/**
 * Mark an outbox item as synced and remove it from the outbox storage
 */
export function markOutboxItemSynced(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const rawOutbox = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!rawOutbox) return;
    const outboxList: NavigationOutboxItem[] = JSON.parse(rawOutbox);
    const filtered = outboxList.filter((item) => item.id !== id);
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('[FreshEtaActionPipeline] Failed to update outbox after sync:', e);
  }
}

/**
 * Flush all pending outbox entries to /api/driving-logs
 * Executed on app reconnect, page visibility change, or background worker
 */
export async function flushNavigationOutboxQueue(): Promise<{
  total: number;
  synced: number;
  failed: number;
}> {
  if (typeof window === 'undefined') {
    return { total: 0, synced: 0, failed: 0 };
  }

  try {
    const rawOutbox = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!rawOutbox) return { total: 0, synced: 0, failed: 0 };

    const outboxList: NavigationOutboxItem[] = JSON.parse(rawOutbox);
    if (!Array.isArray(outboxList) || outboxList.length === 0) {
      return { total: 0, synced: 0, failed: 0 };
    }

    const remaining: NavigationOutboxItem[] = [];
    let synced = 0;
    let failed = 0;

    for (const item of outboxList) {
      if (item.status === 'server_synced') {
        synced++;
        continue;
      }

      try {
        const res = await fetch('/api/driving-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data?.ok) {
            synced++;
            if (data.log) {
              submitDriverLogToHq(data.log);
            }
            continue; // Successfully synced, removed from remaining
          }
        }

        if (res.status >= 400 && res.status < 500) {
          // Client validation rejection, discard
          failed++;
          continue;
        }

        failed++;
        remaining.push({
          ...item,
          status: 'server_sync_pending',
          retryCount: (item.retryCount || 0) + 1,
          lastAttemptAt: new Date().toISOString(),
          error: `HTTP ${res.status}`,
        });
      } catch (err: any) {
        failed++;
        remaining.push({
          ...item,
          status: 'server_sync_pending',
          retryCount: (item.retryCount || 0) + 1,
          lastAttemptAt: new Date().toISOString(),
          error: err?.message || 'Network error',
        });
      }
    }

    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(remaining));
    return { total: outboxList.length, synced, failed };
  } catch (err) {
    console.warn('[FreshEtaActionPipeline] Error flushing outbox queue:', err);
    return { total: 0, synced: 0, failed: 0 };
  }
}

let hasRegisteredOutboxListeners = false;
export function registerOutboxAutoSync(): void {
  if (typeof window === 'undefined' || hasRegisteredOutboxListeners) return;
  hasRegisteredOutboxListeners = true;

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => {
      flushNavigationOutboxQueue().catch(() => {});
    });
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        flushNavigationOutboxQueue().catch(() => {});
      }
    });
  }
}

/**
 * Helper to perform synchronous clipboard copy (Safari/Chrome user-gesture safe)
 */
export async function copyTextSafely(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

/**
 * Execute Full Fresh ETA Action Pipeline
 * Orchestrates Cache Bypass ➔ Dynamic Format ➔ Navigation / Kakao / Copy Execution
 */
export async function executeFreshEtaAction(params: {
  actionType: 'navi_with_log' | 'navi_only' | 'kakao_share' | 'copy_report';
  origin: LocationPreset;
  destination: LocationPreset;
  waypoints?: LocationPreset[];
  adminWaypoints?: LocationPreset[];
  isAdminRoute?: boolean;
  defaultNavi?: NaviProvider;
  reportMode?: ReportMode;
  language?: 'ko' | 'en';
  bookingId?: string;
  driverProfile?: DriverProfile;
  clickedAt?: Date;
  precomputedRouteResult?: FreshEtaRouteResult;
}): Promise<FreshEtaActionResult> {
  // 1. Capture snapshot at instant of click
  const snapshot = captureActionSnapshot(params);

  // 2. Fetch fresh ETA from API bypassing cache, or reuse precomputed result
  const routeResult = params.precomputedRouteResult || await fetchFreshEtaRoute(snapshot);

  // 3. Re-generate report text in target language & mode with fresh ETA
  const reportText = buildFreshReportText({
    snapshot,
    etaFormatted: routeResult.etaFormatted,
    durationMinutes: routeResult.durationMinutes,
    distanceKm: routeResult.distanceKm,
  });

  let logSyncResult: { success: boolean; isDuplicate: boolean; stop?: RouteStopItem; error?: string } | undefined;
  let clipboardSuccess = false;
  let appLaunchSuccess = false;
  let requiresGestureFallback = false;

  // 4. Handle Action Types
  if (params.actionType === 'navi_with_log') {
    // Record to driving log draft
    logSyncResult = await syncNavigationRouteToDrivingLog({ snapshot, routeResult });

    // Launch Navigation (Non-blocking: MUST NOT be blocked by DB error)
    try {
      const activeWaypoints: LocationPreset[] = snapshot.isAdminRoute
        ? [
            { ...snapshot.origin, name: snapshot.origin.shortName || snapshot.origin.name },
            ...(snapshot.adminWaypoints || []).map((w) => ({ ...w, name: w.shortName || w.name })),
          ]
        : snapshot.waypoints;

      const naviWaypoints = activeWaypoints.slice(0, 5).map((w) => ({
        name: w.shortName || w.name,
        lat: w.lat,
        lng: w.lng,
        address: w.address,
      }));

      await launchNavigationApp(
        snapshot.defaultNavi,
        {
          name: snapshot.destination.shortName || snapshot.destination.name,
          lat: snapshot.destination.lat,
          lng: snapshot.destination.lng,
        },
        undefined, // Driver Smartphone GPS origin
        naviWaypoints
      );
      appLaunchSuccess = true;
    } catch (naviErr: any) {
      console.warn('[FreshEtaActionPipeline] Navigation launch error:', naviErr?.message);
    }
  } else if (params.actionType === 'navi_only') {
    // Launch Navigation directly without logging
    try {
      const activeWaypoints: LocationPreset[] = snapshot.isAdminRoute
        ? [
            { ...snapshot.origin, name: snapshot.origin.shortName || snapshot.origin.name },
            ...(snapshot.adminWaypoints || []).map((w) => ({ ...w, name: w.shortName || w.name })),
          ]
        : snapshot.waypoints;

      const naviWaypoints = activeWaypoints.slice(0, 5).map((w) => ({
        name: w.shortName || w.name,
        lat: w.lat,
        lng: w.lng,
        address: w.address,
      }));

      await launchNavigationApp(
        snapshot.defaultNavi,
        {
          name: snapshot.destination.shortName || snapshot.destination.name,
          lat: snapshot.destination.lat,
          lng: snapshot.destination.lng,
        },
        undefined,
        naviWaypoints
      );
      appLaunchSuccess = true;
    } catch (naviErr: any) {
      console.warn('[FreshEtaActionPipeline] Navigation launch error:', naviErr?.message);
    }
  } else if (params.actionType === 'kakao_share') {
    // Copy fresh text and trigger kakaotalk://
    clipboardSuccess = await copyTextSafely(reportText);
    try {
      if (typeof window !== 'undefined') {
        window.location.href = 'kakaotalk://';
        appLaunchSuccess = true;
      }
    } catch {
      appLaunchSuccess = false;
    }

    // If clipboard copy failed (due to async gesture expiry in Safari/Chrome), flag fallback
    if (!clipboardSuccess) {
      requiresGestureFallback = true;
    }
  } else if (params.actionType === 'copy_report') {
    clipboardSuccess = await copyTextSafely(reportText);
    if (!clipboardSuccess) {
      requiresGestureFallback = true;
    }
  }

  return {
    success: true,
    actionType: params.actionType,
    snapshot,
    routeResult,
    reportText,
    logSyncResult,
    clipboardSuccess,
    appLaunchSuccess,
    requiresGestureFallback,
  };
}

