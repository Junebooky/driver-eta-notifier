import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import { calculateHaversineEstimate } from '@/utils/navigation';

interface CacheEntry {
  data: {
    distanceKm: number;
    durationMinutes: number;
    etaFormatted: string;
    trafficSummary: string;
    estimatedTollWon: number | null;
    isMock: boolean;
    isFallback?: boolean;
    isCached: boolean;
    isFresh?: boolean;
    source?: string;
    computedAt?: string;
    routeFingerprint?: string;
  };
  timestamp: number;
}

// Server-side Memory Cache for Quota Defense (3-minute TTL)
const routeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 180 seconds

// In-flight request deduplication map (prevents burst / double-click API quota waste)
const inFlightRequests = new Map<string, Promise<any>>();

function getCacheKey(startLat: number, startLng: number, endLat: number, endLng: number, passList?: string): string {
  // Round coordinates to ~100m precision (0.001 deg) for quota defense
  const sLat = (Math.round(startLat * 1000) / 1000).toFixed(3);
  const sLng = (Math.round(startLng * 1000) / 1000).toFixed(3);
  const eLat = (Math.round(endLat * 1000) / 1000).toFixed(3);
  const eLng = (Math.round(endLng * 1000) / 1000).toFixed(3);
  const pKey = passList ? `_via_${passList}` : '';
  return `${sLat},${sLng}->${eLat},${eLng}${pKey}`;
}

function parsePassListToWaypoints(passList?: string): Array<{ lat: number; lng: number }> {
  if (!passList) return [];
  return passList
    .split('_')
    .map((pointStr) => {
      const [lngStr, latStr] = pointStr.split(',');
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!isNaN(lat) && !isNaN(lng) && lat >= 33.0 && lat <= 39.0 && lng >= 124.0 && lng <= 132.0) {
        return { lat, lng };
      }
      return null;
    })
    .filter(Boolean) as Array<{ lat: number; lng: number }>;
}

export function sanitizeCoord(val: unknown, fallback: number, min: number, max: number): number {
  if (typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max) return val;
  if (typeof val === 'string' && val.trim() !== '' && val !== 'undefined' && val !== 'null') {
    const parsed = parseFloat(val);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) return parsed;
  }
  return fallback;
}

async function handleRouteCalculation(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  passList?: string,
  options?: {
    bypassCache?: boolean;
    purpose?: string;
    clientTimestamp?: number;
  }
) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
  const apiKey = process.env.TMAP_API_KEY;

  const bypassCache = Boolean(options?.bypassCache || options?.purpose === 'action');
  const cacheKey = getCacheKey(startLat, startLng, endLat, endLng, passList);
  const nowTimestamp = options?.clientTimestamp && Math.abs(Date.now() - options.clientTimestamp) < 300000
    ? options.clientTimestamp
    : Date.now();
  const parsedWaypoints = parsePassListToWaypoints(passList);

  // 0. Same start & end location handling (< 50m distance without waypoints)
  const isSameLocation = Math.hypot(startLat - endLat, startLng - endLng) < 0.0005 && parsedWaypoints.length === 0;
  if (isSameLocation) {
    const now = new Date(nowTimestamp);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return NextResponse.json({
      distanceKm: 0,
      durationMinutes: 0,
      etaFormatted: `${hours}:${minutes}`,
      trafficSummary: '출발지와 도착지가 동일합니다',
      estimatedTollWon: 0,
      isMock: false,
      isFallback: false,
      isCached: false,
      isFresh: true,
      source: 'same_location',
      computedAt: new Date(nowTimestamp).toISOString(),
      routeFingerprint: cacheKey,
    });
  }

  // 1. Quota Defense: Check 3-minute Cache first (only if NOT bypassed for action)
  if (!bypassCache && routeCache.has(cacheKey)) {
    const cached = routeCache.get(cacheKey)!;
    if (nowTimestamp - cached.timestamp < CACHE_TTL_MS) {
      // Re-calculate fresh ETA clock string for cached duration
      const etaTime = new Date(nowTimestamp + cached.data.durationMinutes * 60 * 1000);
      const hours = String(etaTime.getHours()).padStart(2, '0');
      const minutes = String(etaTime.getMinutes()).padStart(2, '0');

      return NextResponse.json({
        ...cached.data,
        etaFormatted: `${hours}:${minutes}`,
        isCached: true,
        isFresh: false,
        source: 'tmap_cached',
        computedAt: new Date(cached.timestamp).toISOString(),
        routeFingerprint: cacheKey,
      });
    }
  }

  // 2. In-flight request deduplication for action / fresh requests
  if (inFlightRequests.has(cacheKey)) {
    try {
      const inFlightResult = await inFlightRequests.get(cacheKey);
      return NextResponse.json(inFlightResult);
    } catch {
      // If the in-flight failed, proceed to try fresh
    }
  }

  // 3. If Mock Mode explicitly enabled or API key missing
  if (useMock) {
    const fallbackData = calculateHaversineEstimate(startLat, startLng, endLat, endLng, parsedWaypoints);
    return NextResponse.json({
      ...fallbackData,
      trafficSummary: '원활 (모의 데이터)',
      estimatedTollWon: null,
      isMock: true,
      isFallback: false,
      isCached: false,
      isFresh: false,
      source: 'haversine_mock',
      computedAt: new Date(nowTimestamp).toISOString(),
      routeFingerprint: cacheKey,
    });
  }

  if (!apiKey || apiKey === 'your_tmap_api_key') {
    // API key unconfigured: Fallback to Haversine estimate with notice
    const fallbackData = calculateHaversineEstimate(startLat, startLng, endLat, endLng, parsedWaypoints);
    return NextResponse.json({
      ...fallbackData,
      trafficSummary: '직선 추정 (TMAP 키 미설정)',
      estimatedTollWon: null,
      isMock: false,
      isFallback: true,
      fallbackNotice: 'TMAP API 키 미설정으로 직선 거리 기반 추정치가 적용되었습니다.',
      isCached: false,
      isFresh: false,
      source: 'haversine_fallback',
      computedAt: new Date(nowTimestamp).toISOString(),
      routeFingerprint: cacheKey,
    });
  }

  // 4. Server-Side TMAP API Call with In-Flight Deduplication & Haversine Graceful Fallback
  const fetchPromise = (async () => {
    const tmapUrl = `https://apis.openapi.sk.com/tmap/routes?version=1&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000); // 7.0s timeout threshold

    try {
      const requestPayload: {
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        reqCoordType: string;
        resCoordType: string;
        searchOption: number;
        trafficInfo: string;
        carType: number;
        passList?: string;
      } = {
        startX: startLng,
        startY: startLat,
        endX: endLng,
        endY: endLat,
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: 0, // 0: Recommended optimal traffic route
        trafficInfo: 'Y', // Real-time traffic inclusion
        carType: 1, // 1: 승용차 / 소형 (1종 고속도로 통행료 기준)
      };

      if (passList) {
        requestPayload.passList = passList;
      }

      const response = await fetch(tmapUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          appKey: apiKey,
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`TMAP Route API error HTTP ${response.status}, gracefully falling back to Haversine estimate`);
        const fallbackData = calculateHaversineEstimate(startLat, startLng, endLat, endLng, parsedWaypoints);
        return {
          ...fallbackData,
          trafficSummary: '직선 추정 (TMAP 일시 지연)',
          estimatedTollWon: null,
          isMock: false,
          isFallback: true,
          fallbackNotice: 'TMAP 일시 지연으로 직선 거리 기반 추정치가 반영되었습니다.',
          isCached: false,
          isFresh: false,
          source: 'haversine_fallback',
          computedAt: new Date(nowTimestamp).toISOString(),
          routeFingerprint: cacheKey,
        };
      }

      const data = await response.json().catch(() => null);
      const totalTimeSeconds = data?.features?.[0]?.properties?.totalTime;
      const totalDistanceMeters = data?.features?.[0]?.properties?.totalDistance;

      if (typeof totalTimeSeconds !== 'number' || (totalTimeSeconds <= 0 && (totalDistanceMeters || 0) > 100)) {
        console.warn('TMAP Route API response missing valid totalTime, falling back to Haversine estimate:', data);
        const fallbackData = calculateHaversineEstimate(startLat, startLng, endLat, endLng, parsedWaypoints);
        return {
          ...fallbackData,
          trafficSummary: '직선 추정 (TMAP 경로 이상)',
          estimatedTollWon: null,
          isMock: false,
          isFallback: true,
          fallbackNotice: 'TMAP 데이터 이상으로 거점 직선거리 기반 추정치가 반영되었습니다.',
          isCached: false,
          isFresh: false,
          source: 'haversine_fallback',
          computedAt: new Date(nowTimestamp).toISOString(),
          routeFingerprint: cacheKey,
        };
      }

      const durationMinutes = totalTimeSeconds <= 0 ? 0 : Math.max(1, Math.round(totalTimeSeconds / 60));
      const distanceKm = typeof totalDistanceMeters === 'number'
        ? Math.round((totalDistanceMeters / 1000) * 10) / 10
        : 0;

      // Parse TMAP estimated toll fee (totalFare in KRW)
      const rawTotalFare = data?.features?.[0]?.properties?.totalFare;
      const estimatedTollWon =
        typeof rawTotalFare === 'number' && rawTotalFare >= 0 ? rawTotalFare : null;

      const etaTime = new Date(nowTimestamp + durationMinutes * 60 * 1000);
      const hours = String(etaTime.getHours()).padStart(2, '0');
      const minutes = String(etaTime.getMinutes()).padStart(2, '0');
      const etaFormatted = `${hours}:${minutes}`;

      const resultData = {
        distanceKm,
        durationMinutes,
        etaFormatted,
        trafficSummary: '실시간 교통 반영 (TMAP)',
        estimatedTollWon,
        isMock: false,
        isFallback: false,
        isCached: false,
        isFresh: true,
        source: 'tmap_fresh',
        computedAt: new Date(nowTimestamp).toISOString(),
        routeFingerprint: cacheKey,
      };

      // Save to 3-minute Quota Cache
      routeCache.set(cacheKey, { data: resultData, timestamp: nowTimestamp });

      return resultData;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      console.warn('TMAP Route API call failed or timed out, gracefully falling back to Haversine estimate:', error instanceof Error ? error.message : error);
      const fallbackData = calculateHaversineEstimate(startLat, startLng, endLat, endLng, parsedWaypoints);
      return {
        ...fallbackData,
        trafficSummary: '직선 추정 (TMAP 응답 지연)',
        estimatedTollWon: null,
        isMock: false,
        isFallback: true,
        fallbackNotice: 'TMAP 응답 지연으로 거점 직선거리 기반 추정치가 반영되었습니다.',
        isCached: false,
        isFresh: false,
        source: 'haversine_fallback',
        computedAt: new Date(nowTimestamp).toISOString(),
        routeFingerprint: cacheKey,
      };
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    const outcome = await fetchPromise;
    if (outcome && 'error' in outcome && 'status' in outcome && typeof outcome.status === 'number') {
      return NextResponse.json(outcome, { status: outcome.status });
    }
    return NextResponse.json(outcome);
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

// Support GET requests (query params: startX, startY, endX, endY or startLat, startLng, endLat, endLng, passList, bypassCache, purpose, clientTimestamp)
export async function GET(req: NextRequest) {
  const apiAuth = await verifyServerAuth(req);
  if (!apiAuth.ok) return NextResponse.json({ ok: false, error: apiAuth.error }, { status: apiAuth.statusCode });
  try {
    const { searchParams } = new URL(req.url);

    const startLng = sanitizeCoord(searchParams.get('startX') || searchParams.get('startLng'), 127.0425, 124.0, 132.0);
    const startLat = sanitizeCoord(searchParams.get('startY') || searchParams.get('startLat'), 37.5042, 33.0, 39.0);
    const endLng = sanitizeCoord(searchParams.get('endX') || searchParams.get('endLng'), 126.4512, 124.0, 132.0);
    const endLat = sanitizeCoord(searchParams.get('endY') || searchParams.get('endLat'), 37.4495, 33.0, 39.0);
    const passList = searchParams.get('passList') || undefined;

    const bypassCache = searchParams.get('bypassCache') === 'true' || searchParams.get('purpose') === 'action';
    const purpose = searchParams.get('purpose') || (bypassCache ? 'action' : 'preview');
    const clientTimestampStr = searchParams.get('clientTimestamp');
    const clientTimestamp = clientTimestampStr ? parseInt(clientTimestampStr, 10) : undefined;

    return await handleRouteCalculation(startLat, startLng, endLat, endLng, passList, {
      bypassCache,
      purpose,
      clientTimestamp,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Support POST requests (body: { startLat, startLng, endLat, endLng, passList, bypassCache, purpose, clientTimestamp } or { startX, startY, endX, endY, passList, ... })
export async function POST(req: NextRequest) {
  const apiAuth = await verifyServerAuth(req);
  if (!apiAuth.ok) return NextResponse.json({ ok: false, error: apiAuth.error }, { status: apiAuth.statusCode });
  try {
    const body = await req.json().catch(() => ({}));

    const startLng = sanitizeCoord(body.startLng ?? body.startX, 127.0425, 124.0, 132.0);
    const startLat = sanitizeCoord(body.startLat ?? body.startY, 37.5042, 33.0, 39.0);
    const endLng = sanitizeCoord(body.endLng ?? body.endX, 126.4512, 124.0, 132.0);
    const endLat = sanitizeCoord(body.endLat ?? body.endY, 37.4495, 33.0, 39.0);
    const passList = body.passList || undefined;

    const bypassCache = body.bypassCache === true || body.purpose === 'action';
    const purpose = body.purpose || (bypassCache ? 'action' : 'preview');
    const clientTimestamp = typeof body.clientTimestamp === 'number' ? body.clientTimestamp : undefined;

    return await handleRouteCalculation(startLat, startLng, endLat, endLng, passList, {
      bypassCache,
      purpose,
      clientTimestamp,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
