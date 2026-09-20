import { NextRequest, NextResponse } from 'next/server';

interface CacheEntry {
  data: {
    distanceKm: number;
    durationMinutes: number;
    etaFormatted: string;
    trafficSummary: string;
    isMock: boolean;
    isFallback?: boolean;
    fallbackNotice?: string;
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

function calculateHaversineFallback(startLat: number, startLng: number, endLat: number, endLng: number) {
  const R = 6371; // Earth radius in km
  const dLat = ((endLat - startLat) * Math.PI) / 180;
  const dLng = ((endLng - startLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((startLat * Math.PI) / 180) *
      Math.cos((endLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;

  // Detour factor 1.35x for urban road distance
  const distanceKm = Math.max(1, Math.round(straightKm * 1.35 * 10) / 10);
  const durationMinutes = Math.max(5, Math.round(distanceKm * 1.3));

  const now = new Date();
  const etaTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
  const hours = String(etaTime.getHours()).padStart(2, '0');
  const minutes = String(etaTime.getMinutes()).padStart(2, '0');

  return {
    distanceKm,
    durationMinutes,
    etaFormatted: `${hours}:${minutes} (추정 ${durationMinutes}분 소요)`,
    trafficSummary: '직선거리 기반 추정치',
    isMock: false,
    isFallback: true,
    fallbackNotice: '네트워크 지연으로 추정 시간 표시 중',
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { startLat, startLng, endLat, endLng } = body;

    const useMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
    const apiKey = process.env.TMAP_API_KEY;

    if (!startLat || !startLng || !endLat || !endLng) {
      return NextResponse.json({ error: 'Missing origin or destination coordinates' }, { status: 400 });
    }

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

    // 2. If Mock Mode explicitly enabled
    if (useMock || !apiKey || apiKey === 'your_tmap_api_key') {
      const fallbackData = calculateHaversineFallback(startLat, startLng, endLat, endLng);
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
      const fallbackData = calculateHaversineFallback(startLat, startLng, endLat, endLng);
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
    console.warn('TMAP Route API call failed or timed out:', error?.message);
    const body = await req.json().catch(() => ({}));
    const { startLat = 37.5042, startLng = 127.0425, endLat = 37.4495, endLng = 126.4512 } = body;
    const fallbackData = calculateHaversineFallback(startLat, startLng, endLat, endLng);
    return NextResponse.json({ ...fallbackData, isCached: false });
  }
}
