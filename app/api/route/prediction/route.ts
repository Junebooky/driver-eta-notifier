import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { NextRequest, NextResponse } from 'next/server';

export interface LocationPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface PredictionTimelineItem {
  offsetMinutes: number;
  timeFormatted: string; // e.g. "15:10" (KST)
  durationMinutes: number | null;
  diffMinutes: number; // e.g. -6, 0, +3, +8
  status: 'fast' | 'normal' | 'slow' | 'heavy' | 'unavailable';
  label?: string; // e.g. "10분 후", "30분 후", "1시간 후", "2시간 후"
  isUnavailable?: boolean;
}

export interface PredictionResult {
  baseDurationMinutes: number | null;
  predictedDurationMinutes: number | null;
  predictedDistanceKm: number | null;
  departureTimeIso: string;
  departureTimeFormatted: string;
  arrivalTimeFormatted: string | null;
  trafficSummary: string;
  isMock: boolean;
  isFallback: boolean;
  isUnavailable?: boolean;
  error?: string;
  timeline: PredictionTimelineItem[];
}

interface CacheEntry {
  data: PredictionResult;
  timestamp: number;
}

// In-Memory Cache for Quota Defense (3-minute TTL)
const predictionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000;

/**
 * Format Date to TMAP Prediction ISO 8601 string strictly in Asia/Seoul (KST):
 * YYYY-MM-DDTHH:mm:ss+0900
 *
 * This guarantees correct timezone offset even when server runs in UTC (e.g. Vercel, Docker).
 */
export function formatTmapIsoTime(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  let hour = partMap.hour || '00';
  if (hour === '24') hour = '00';

  const year = partMap.year;
  const month = partMap.month;
  const day = partMap.day;
  const minute = partMap.minute;
  const second = partMap.second;

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+0900`;
}

/**
 * Format Date to 24h KST time: HH:mm
 */
export function formatKstTime(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  let hour = parts.find((p) => p.type === 'hour')?.value || '00';
  if (hour === '24') hour = '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

/**
 * Call TMAP Routes Prediction API for a specific departure time slot
 */
async function fetchTmapPredictionSlot(
  departure: LocationPoint,
  destination: LocationPoint,
  waypoints: LocationPoint[],
  slotDate: Date,
  apiKey: string,
  timeoutMs: number = 4500
): Promise<{ ok: boolean; durationMinutes: number | null; distanceKm: number | null; error?: string }> {
  const tmapPredictionUrl = 'https://apis.openapi.sk.com/tmap/routes/prediction?version=1';
  const formattedIso = formatTmapIsoTime(slotDate);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload: {
      routesInfo: {
        departure: { name: string; lon: string; lat: string };
        destination: { name: string; lon: string; lat: string };
        wayPoints?: { wayPoint: Array<{ lon: string; lat: string }> };
        predictionType: string;
        predictionTime: string;
        searchOption: string;
      };
    } = {
      routesInfo: {
        departure: {
          name: departure.name || '출발지',
          lon: String(departure.lng),
          lat: String(departure.lat),
        },
        destination: {
          name: destination.name || '목적지',
          lon: String(destination.lng),
          lat: String(destination.lat),
        },
        predictionType: 'departure',
        predictionTime: formattedIso,
        searchOption: '00', // 추천 최적길 (실시간/예측 교통 반영)
      },
    };

    if (waypoints && waypoints.length > 0) {
      payload.routesInfo.wayPoints = {
        wayPoint: waypoints.map((w) => ({
          lon: String(w.lng),
          lat: String(w.lat),
        })),
      };
    }

    const response = await fetch(tmapPredictionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        appKey: apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 204) {
      return { ok: false, durationMinutes: null, distanceKm: null, error: 'No route found (204)' };
    }

    if (!response.ok) {
      return { ok: false, durationMinutes: null, distanceKm: null, error: `HTTP ${response.status}` };
    }

    const data = await response.json().catch(() => null);
    const totalTimeSeconds =
      data?.features?.[0]?.properties?.totalTime ||
      data?.routesInfo?.summary?.totalTime;
    const totalDistanceMeters =
      data?.features?.[0]?.properties?.totalDistance ||
      data?.routesInfo?.summary?.totalDistance;

    if (typeof totalTimeSeconds === 'number' && totalTimeSeconds > 0) {
      const durationMinutes = Math.round(totalTimeSeconds / 60);
      const distanceKm =
        typeof totalDistanceMeters === 'number'
          ? Math.round((totalDistanceMeters / 1000) * 10) / 10
          : null;
      return { ok: true, durationMinutes, distanceKm };
    }

    return { ok: false, durationMinutes: null, distanceKm: null, error: 'Missing totalTime' };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? (err.name === 'AbortError' ? 'Timeout' : err.message) : 'Unknown error';
    return { ok: false, durationMinutes: null, distanceKm: null, error: message };
  }
}

export async function POST(req: NextRequest) {
  const apiAuth = await verifyServerAuth(req);
  if (!apiAuth.ok) return NextResponse.json({ ok: false, error: apiAuth.error }, { status: apiAuth.statusCode });
  try {
    const body = await req.json().catch(() => ({}));
    const departure: LocationPoint = body.departure || {
      name: body.startName || '조선팰리스 강남',
      lat: parseFloat(body.startLat || body.startY || '37.5042'),
      lng: parseFloat(body.startLng || body.startX || '127.0425'),
    };

    const destination: LocationPoint = body.destination || {
      name: body.endName || '인천공항 T1',
      lat: parseFloat(body.endLat || body.endY || '37.4495'),
      lng: parseFloat(body.endLng || body.endX || '126.4512'),
    };

    const rawWaypoints: Array<{ name?: string; lat?: number; lng?: number }> = Array.isArray(body.waypoints)
      ? body.waypoints
      : [];
    const waypoints: LocationPoint[] = rawWaypoints
      .filter((w) => w && typeof w.lat === 'number' && typeof w.lng === 'number' && (w.lat !== 0 || w.lng !== 0))
      .map((w) => ({
        name: w.name || '경유지',
        lat: w.lat as number,
        lng: w.lng as number,
      }));

    const rawPredictionTime = body.predictionTime;
    let targetDate: Date;
    if (rawPredictionTime) {
      targetDate = new Date(rawPredictionTime);
      if (isNaN(targetDate.getTime())) {
        targetDate = new Date();
      }
    } else {
      targetDate = new Date();
    }

    const apiKey = process.env.TMAP_API_KEY;
    const useMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
    const isMockMode = useMock || !apiKey || apiKey === 'your_tmap_api_key';

    // Quota Defense Cache Key
    const cacheKey = `${departure.lat.toFixed(3)},${departure.lng.toFixed(3)}->${destination.lat.toFixed(3)},${destination.lng.toFixed(3)}_${formatTmapIsoTime(targetDate)}_${waypoints.length}`;
    const nowMs = Date.now();

    if (!isMockMode && predictionCache.has(cacheKey)) {
      const cached = predictionCache.get(cacheKey)!;
      if (nowMs - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json(cached.data);
      }
    }

    // If Mock Mode explicitly configured or API key missing
    if (isMockMode) {
      if (!useMock) {
        return NextResponse.json(
          {
            baseDurationMinutes: null,
            predictedDurationMinutes: null,
            predictedDistanceKm: null,
            departureTimeIso: targetDate.toISOString(),
            departureTimeFormatted: formatKstTime(targetDate),
            arrivalTimeFormatted: null,
            trafficSummary: 'TMAP API 키 미설정',
            isMock: true,
            isFallback: false,
            isUnavailable: true,
            error: 'TMAP API 키가 설정되지 않아 예측 정보를 조회할 수 없습니다.',
            timeline: [],
          },
          { status: 500 }
        );
      }

      // Explicit mock mode for local offline demo only
      const mockTimeline: PredictionTimelineItem[] = [
        { offsetMinutes: 0, timeFormatted: formatKstTime(targetDate), durationMinutes: 65, diffMinutes: 0, status: 'normal' },
        { offsetMinutes: 10, timeFormatted: formatKstTime(new Date(targetDate.getTime() + 10 * 60000)), durationMinutes: 65, diffMinutes: 0, status: 'normal', label: '10분 후' },
        { offsetMinutes: 30, timeFormatted: formatKstTime(new Date(targetDate.getTime() + 30 * 60000)), durationMinutes: 65, diffMinutes: 0, status: 'normal', label: '30분 후' },
        { offsetMinutes: 60, timeFormatted: formatKstTime(new Date(targetDate.getTime() + 60 * 60000)), durationMinutes: 59, diffMinutes: -6, status: 'fast', label: '1시간 후' },
        { offsetMinutes: 90, timeFormatted: formatKstTime(new Date(targetDate.getTime() + 90 * 60000)), durationMinutes: 57, diffMinutes: -8, status: 'fast', label: '1시간 30분 후' },
        { offsetMinutes: 120, timeFormatted: formatKstTime(new Date(targetDate.getTime() + 120 * 60000)), durationMinutes: 57, diffMinutes: -8, status: 'fast', label: '2시간 후' },
      ];

      const mockArrival = new Date(targetDate.getTime() + 65 * 60 * 1000);
      return NextResponse.json({
        baseDurationMinutes: 65,
        predictedDurationMinutes: 65,
        predictedDistanceKm: 68.8,
        departureTimeIso: targetDate.toISOString(),
        departureTimeFormatted: formatKstTime(targetDate),
        arrivalTimeFormatted: formatKstTime(mockArrival),
        trafficSummary: '모의 예측 데이터 (Mock)',
        isMock: true,
        isFallback: false,
        timeline: mockTimeline,
      });
    }

    // Call TMAP prediction API for every individual time slot:
    // [0 (선택 시각), 10분 후, 30분 후, 60분 후 (1시간), 90분 후 (1시간 30분), 120분 후 (2시간)]
    const offsets = [0, 10, 30, 60, 90, 120];

    const slotPromises = offsets.map(async (offset) => {
      const slotDate = new Date(targetDate.getTime() + offset * 60 * 1000);
      const res = await fetchTmapPredictionSlot(departure, destination, waypoints, slotDate, apiKey, 4500);

      let label: string | undefined = undefined;
      if (offset === 10) label = '10분 후';
      else if (offset === 30) label = '30분 후';
      else if (offset === 60) label = '1시간 후';
      else if (offset === 90) label = '1시간 30분 후';
      else if (offset === 120) label = '2시간 후';

      return {
        offset,
        slotDate,
        label,
        ...res,
      };
    });

    const slotResults = await Promise.all(slotPromises);

    // Baseline slot is offset 0
    const baseSlot = slotResults.find((s) => s.offset === 0);

    // If all slots failed, or base slot failed completely, do NOT fabricate data
    if (!baseSlot || !baseSlot.ok || baseSlot.durationMinutes === null) {
      console.warn('TMAP Prediction API base slot failed:', baseSlot?.error);
      return NextResponse.json(
        {
          baseDurationMinutes: null,
          predictedDurationMinutes: null,
          predictedDistanceKm: null,
          departureTimeIso: targetDate.toISOString(),
          departureTimeFormatted: formatKstTime(targetDate),
          arrivalTimeFormatted: null,
          trafficSummary: 'TMAP 경로 예측 불가',
          isMock: false,
          isFallback: false,
          isUnavailable: true,
          error: 'TMAP 서버로부터 경로 예측 데이터를 받아올 수 없습니다.',
          timeline: [],
        },
        { status: 502 }
      );
    }

    const baseDurationMinutes = baseSlot.durationMinutes;
    const predictedDistanceKm = baseSlot.distanceKm;

    // Build timeline items with genuine durations and data-driven status
    const timeline: PredictionTimelineItem[] = slotResults.map((item) => {
      if (!item.ok || item.durationMinutes === null) {
        return {
          offsetMinutes: item.offset,
          timeFormatted: formatKstTime(item.slotDate),
          durationMinutes: null,
          diffMinutes: 0,
          status: 'unavailable',
          label: item.label,
          isUnavailable: true,
        };
      }

      const diffMinutes = item.durationMinutes - baseDurationMinutes;

      // Status derived purely from verified TMAP difference vs baseline
      let status: 'fast' | 'normal' | 'slow' | 'heavy' = 'normal';
      if (diffMinutes <= -3) {
        status = 'fast'; // traffic easing (green)
      } else if (diffMinutes >= 8) {
        status = 'heavy'; // severe congestion (rose)
      } else if (diffMinutes >= 3) {
        status = 'slow'; // moderate slowdown (amber)
      } else {
        status = 'normal'; // similar time
      }

      return {
        offsetMinutes: item.offset,
        timeFormatted: formatKstTime(item.slotDate),
        durationMinutes: item.durationMinutes,
        diffMinutes,
        status,
        label: item.label,
        isUnavailable: false,
      };
    });

    const arrivalDate = new Date(targetDate.getTime() + baseDurationMinutes * 60 * 1000);
    const arrivalTimeFormatted = formatKstTime(arrivalDate);

    // Determine traffic summary description based on genuine future differences
    const fastestFutureSlot = timeline.find((t) => !t.isUnavailable && t.offsetMinutes > 0 && t.diffMinutes <= -3);
    const slowestFutureSlot = timeline.find((t) => !t.isUnavailable && t.offsetMinutes > 0 && t.diffMinutes >= 5);

    let trafficSummary = 'TMAP 공식 타임머신 예측 반영';
    if (fastestFutureSlot && fastestFutureSlot.durationMinutes) {
      trafficSummary = `${fastestFutureSlot.label} 출발 시 ${Math.abs(fastestFutureSlot.diffMinutes)}분 단축 예측`;
    } else if (slowestFutureSlot && slowestFutureSlot.durationMinutes) {
      trafficSummary = `${slowestFutureSlot.label} 출발 시 ${slowestFutureSlot.diffMinutes}분 정체 증가 예측`;
    }

    const result: PredictionResult = {
      baseDurationMinutes,
      predictedDurationMinutes: baseDurationMinutes,
      predictedDistanceKm: predictedDistanceKm || 0,
      departureTimeIso: targetDate.toISOString(),
      departureTimeFormatted: formatKstTime(targetDate),
      arrivalTimeFormatted,
      trafficSummary,
      isMock: false,
      isFallback: false,
      isUnavailable: false,
      timeline,
    };

    // Save to 3-minute Quota Cache
    predictionCache.set(cacheKey, { data: result, timestamp: nowMs });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Prediction API fatal error:', error);
    const message = error instanceof Error ? error.message : '경로 예측 처리 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        baseDurationMinutes: null,
        predictedDurationMinutes: null,
        predictedDistanceKm: null,
        departureTimeIso: new Date().toISOString(),
        departureTimeFormatted: formatKstTime(new Date()),
        arrivalTimeFormatted: null,
        trafficSummary: 'TMAP 경로 예측 오류',
        isMock: false,
        isFallback: false,
        isUnavailable: true,
        error: message,
        timeline: [],
      },
      { status: 500 }
    );
  }
}
