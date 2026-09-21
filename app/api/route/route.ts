import { NextRequest, NextResponse } from 'next/server';
import { calculateHaversineEstimate } from '@/utils/navigation';

interface CacheEntry {
  data: {
    distanceKm: number;
    durationMinutes: number;
    etaFormatted: string;
    trafficSummary: string;
    isMock: boolean;
    isFallback?: boolean;
    isCached: boolean;
  };
  timestamp: number;
}

// Server-side Memory Cache for Quota Defense (3-minute TTL)
const routeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 180 seconds

function getCacheKey(startLat: number, startLng: number, endLat: number, endLng: number): string {
  // Round coordinates to ~100m precision (0.001 deg) for quota defense
  const sLat = (Math.round(startLat * 1000) / 1000).toFixed(3);
  const sLng = (Math.round(startLng * 1000) / 1000).toFixed(3);
  const eLat = (Math.round(endLat * 1000) / 1000).toFixed(3);
  const eLng = (Math.round(endLng * 1000) / 1000).toFixed(3);
  return `${sLat},${sLng}->${eLat},${eLng}`;
}

async function handleRouteCalculation(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
  const apiKey = process.env.TMAP_API_KEY;

  const cacheKey = getCacheKey(startLat, startLng, endLat, endLng);
  const nowTimestamp = Date.now();

  // 1. Quota Defense: Check 3-minute Cache first
  if (routeCache.has(cacheKey)) {
    const cached = routeCache.get(cacheKey)!;
    if (nowTimestamp - cached.timestamp < CACHE_TTL_MS) {
      // Re-calculate fresh ETA clock string for cached duration
      const etaTime = new Date(nowTimestamp + cached.data.durationMinutes * 60 * 1000);
      const hours = String(etaTime.getHours()).padStart(2, '0');
      const minutes = String(etaTime.getMinutes()).padStart(2, '0');

      return NextResponse.json({
        ...cached.data,
        etaFormatted: `${hours}:${minutes} (${cached.data.durationMinutes}분 소요)`,
        isCached: true,
      });
    }
  }

  // 2. If Mock Mode explicitly enabled or API key missing
  if (useMock || !apiKey || apiKey === 'your_tmap_api_key') {
    const fallbackData = calculateHaversineEstimate(startLat, startLng, endLat, endLng);
    return NextResponse.json({
      ...fallbackData,
      trafficSummary: '원활 (모의 데이터)',
      isMock: true,
      isFallback: false,
      isCached: false,
    });
  }

  // 3. Server-Side TMAP API Call (Key strictly hidden from client)
  const tmapUrl = `https://apis.openapi.sk.com/tmap/routes?version=1&format=json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s timeout threshold

  try {
    const response = await fetch(tmapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        appKey: apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        startX: String(startLng),
        startY: String(startLat),
        endX: String(endLng),
        endY: String(endLat),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: '0', // 0: 추천경로 (실시간 교통)
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`TMAP API HTTP Error ${response.status}, triggering Haversine Fallback`);
      const fallbackData = calculateHaversineEstimate(startLat, startLng, endLat, endLng);
      return NextResponse.json({ ...fallbackData, isCached: false });
    }

    const data = await response.json();
    const totalTimeSeconds = data?.features?.[0]?.properties?.totalTime || 4200;
    const totalDistanceMeters = data?.features?.[0]?.properties?.totalDistance || 62000;

    const durationMinutes = Math.round(totalTimeSeconds / 60);
    const distanceKm = Math.round((totalDistanceMeters / 1000) * 10) / 10;

    const etaTime = new Date(nowTimestamp + durationMinutes * 60 * 1000);
    const hours = String(etaTime.getHours()).padStart(2, '0');
    const minutes = String(etaTime.getMinutes()).padStart(2, '0');
    const etaFormatted = `${hours}:${minutes} (${durationMinutes}분 소요)`;

    const resultData = {
      distanceKm,
      durationMinutes,
      etaFormatted,
      trafficSummary: '실시간 교통 반영 (TMAP)',
      isMock: false,
      isFallback: false,
      isCached: false,
    };

    // Save to 3-minute Quota Cache
    routeCache.set(cacheKey, { data: resultData, timestamp: nowTimestamp });

    return NextResponse.json(resultData);
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.warn('TMAP Route API call failed or timed out:', error?.message);
    const fallbackData = calculateHaversineEstimate(startLat, startLng, endLat, endLng);
    return NextResponse.json({ ...fallbackData, isCached: false });
  }
}

// Support GET requests (query params: startX, startY, endX, endY or startLat, startLng, endLat, endLng)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const startLng = parseFloat(searchParams.get('startX') || searchParams.get('startLng') || '127.0425');
    const startLat = parseFloat(searchParams.get('startY') || searchParams.get('startLat') || '37.5042');
    const endLng = parseFloat(searchParams.get('endX') || searchParams.get('endLng') || '126.4512');
    const endLat = parseFloat(searchParams.get('endY') || searchParams.get('endLat') || '37.4495');

    return await handleRouteCalculation(startLat, startLng, endLat, endLng);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// Support POST requests (body: { startLat, startLng, endLat, endLng } or { startX, startY, endX, endY })
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const startLng = parseFloat(String(body.startLng ?? body.startX ?? '127.0425'));
    const startLat = parseFloat(String(body.startLat ?? body.startY ?? '37.5042'));
    const endLng = parseFloat(String(body.endLng ?? body.endX ?? '126.4512'));
    const endLat = parseFloat(String(body.endLat ?? body.endY ?? '37.4495'));

    return await handleRouteCalculation(startLat, startLng, endLat, endLng);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
