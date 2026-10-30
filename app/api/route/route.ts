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
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
      return null;
    })
    .filter(Boolean) as Array<{ lat: number; lng: number }>;
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
    return NextResponse.json(
      {
        error: 'TMAP API 키가 설정되지 않아 실시간 경로를 조회할 수 없습니다.',
        isUnavailable: true,
        isFresh: false,
        source: 'tmap_key_missing',
      },
      { status: 500 }
    );
  }

  // 4. Server-Side TMAP API Call with In-Flight Deduplication (Key strictly hidden from client)
  const fetchPromise = (async () => {
    const tmapUrl = `https://apis.openapi.sk.com/tmap/routes?version=1&format=json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s timeout threshold

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
        console.warn(`TMAP Route API error HTTP ${response.status}`);
        return {
          status: response.status === 504 ? 504 : 502,
          error: `TMAP 실시간 경로 API 오류 (HTTP ${response.status})`,
          isUnavailable: true,
          isFresh: false,
          source: 'tmap_api_error',
        };
      }

      const data = await response.json().catch(() => null);
      const totalTimeSeconds = data?.features?.[0]?.properties?.totalTime;
      const totalDistanceMeters = data?.features?.[0]?.properties?.totalDistance;

      if (typeof totalTimeSeconds !== 'number' || totalTimeSeconds <= 0) {
        console.warn('TMAP Route API response missing valid totalTime:', data);
        return {
          status: 502,
          error: 'TMAP 경로 소요 시간 데이터가 유효하지 않습니다.',
          isUnavailable: true,
          isFresh: false,
          source: 'tmap_invalid_response',
        };
      }

      const durationMinutes = Math.max(1, Math.round(totalTimeSeconds / 60));
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
      console.warn('TMAP Route API call failed or timed out:', error instanceof Error ? error.message : error);
      return {
        status: 504,
        error: 'TMAP 실시간 경로 요청 시간이 초과되었거나 연결에 실패했습니다.',
        isUnavailable: true,
        isFresh: false,
        source: 'tmap_timeout',
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

    const startLng = parseFloat(searchParams.get('startX') || searchParams.get('startLng') || '127.0425');
    const startLat = parseFloat(searchParams.get('startY') || searchParams.get('startLat') || '37.5042');
    const endLng = parseFloat(searchParams.get('endX') || searchParams.get('endLng') || '126.4512');
    const endLat = parseFloat(searchParams.get('endY') || searchParams.get('endLat') || '37.4495');
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

    const startLng = parseFloat(String(body.startLng ?? body.startX ?? '127.0425'));
    const startLat = parseFloat(String(body.startLat ?? body.startY ?? '37.5042'));
    const endLng = parseFloat(String(body.endLng ?? body.endX ?? '126.4512'));
    const endLat = parseFloat(String(body.endLat ?? body.endY ?? '37.4495'));
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
