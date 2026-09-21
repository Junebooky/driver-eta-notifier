import { NextRequest, NextResponse } from 'next/server';
import { toKatec, toWgs84 } from '@/utils/coordinate';
import { GasStation, GasPrices } from '@/types';
import { calculateHaversineEstimate } from '@/utils/navigation';

interface GasCacheEntry {
  stations: GasStation[];
  timestamp: number;
}

// 1. Quota Safeguard: In-Memory Cache (15 minutes = 900,000ms TTL)
const gasCache = new Map<string, GasCacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 900 seconds

const BRAND_NAME_MAP: Record<string, string> = {
  SKE: 'SK에너지',
  GSC: 'GS칼텍스',
  HDO: 'HD현대오일뱅크',
  SOL: 'S-OIL',
  RTO: '알뜰주유소',
  NHO: 'NH-OIL',
  ETC: '자가/기타',
};

// Generates rounded cache key (~500m resolution) to prevent repeated calls
function getCacheKey(lat: number, lng: number): string {
  const roundedLat = (Math.round(lat * 200) / 200).toFixed(3);
  const roundedLng = (Math.round(lng * 200) / 200).toFixed(3);
  return `${roundedLat},${roundedLng}`;
}

// Real-time TMAP Route Calculation for actual drive duration and distance
async function calculateTmapDriveInfo(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<{ durationMinutes: number; distanceKm: number }> {
  const apiKey = process.env.TMAP_API_KEY;

  if (!apiKey || apiKey === 'your_tmap_api_key') {
    const est = calculateHaversineEstimate(startLat, startLng, endLat, endLng);
    return { durationMinutes: est.durationMinutes, distanceKm: est.distanceKm };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('https://apis.openapi.sk.com/tmap/routes?version=1&format=json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        appKey: apiKey,
      },
      body: JSON.stringify({
        startX: startLng,
        startY: startLat,
        endX: endLng,
        endY: endLat,
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: 0, // Optimal real-time route
        trafficInfo: 'Y',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const props = data?.features?.[0]?.properties;
      if (props) {
        const durationMinutes = Math.max(1, Math.round(props.totalTime / 60));
        const distanceKm = Math.round((props.totalDistance / 1000) * 10) / 10;
        return { durationMinutes, distanceKm };
      }
    }
  } catch (err) {
    console.warn('TMAP Route API call error for gas station:', err);
  }

  // Fallback to Haversine
  const est = calculateHaversineEstimate(startLat, startLng, endLat, endLng);
  return { durationMinutes: est.durationMinutes, distanceKm: est.distanceKm };
}

// [태스크 2] 최후의 안전장치: TMAP 카테고리 POI 주변 주유소 하이브리드 폴백
async function fetchTmapAroundGasStations(lat: number, lng: number): Promise<GasStation[]> {
  const apiKey = process.env.TMAP_API_KEY;
  if (!apiKey || apiKey === 'your_tmap_api_key') return [];

  try {
    const url = `https://apis.openapi.sk.com/tmap/pois/search/around?version=1&centerLat=${lat}&centerLon=${lng}&categories=${encodeURIComponent(
      '주유소'
    )}&count=6&reqCoordType=WGS84GEO&resCoordType=WGS84GEO`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      headers: { appKey: apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok || res.status === 204) return [];
    const text = await res.text();
    if (!text || !text.trim()) return [];
    const data = JSON.parse(text);
    const poiList = data?.searchPoiInfo?.pois?.poi;
    if (!Array.isArray(poiList) || poiList.length === 0) return [];

    const now = new Date();

    const stations: GasStation[] = await Promise.all(
      poiList.slice(0, 5).map(async (poi: any) => {
        const sLat = parseFloat(poi.noorLat || poi.frontLat || String(lat));
        const sLng = parseFloat(poi.noorLon || poi.frontLon || String(lng));
        const name = poi.name || '주유소';
        const address =
          poi.newAddressList?.newAddress?.[0]?.fullAddressRoad ||
          `${poi.upperAddrName || ''} ${poi.middleAddrName || ''} ${poi.lowerAddrName || ''}`.trim();

        // Brand inference from name
        let brandCode = 'ETC';
        let brandName = '주유소';
        if (/SK|에스케이/i.test(name)) {
          brandCode = 'SKE';
          brandName = 'SK에너지';
        } else if (/GS|지에스/i.test(name)) {
          brandCode = 'GSC';
          brandName = 'GS칼텍스';
        } else if (/S-?OIL|에쓰오일|에스오일/i.test(name)) {
          brandCode = 'SOL';
          brandName = 'S-OIL';
        } else if (/현대|오일뱅크/i.test(name)) {
          brandCode = 'HDO';
          brandName = 'HD현대오일뱅크';
        } else if (/알뜰|EX/i.test(name)) {
          brandCode = 'RTO';
          brandName = '알뜰주유소';
        }

        const driveInfo = await calculateTmapDriveInfo(lat, lng, sLat, sLng);
        const etaDate = new Date(now.getTime() + driveInfo.durationMinutes * 60 * 1000);
        const tmapEtaFormatted = `${String(etaDate.getHours()).padStart(2, '0')}:${String(
          etaDate.getMinutes()
        ).padStart(2, '0')}`;

        return {
          id: poi.id || `tmap_poi_${Math.random()}`,
          name,
          brandCode,
          brandName,
          prices: {}, // Prices '-' fallback
          lat: sLat,
          lng: sLng,
          distanceMeters: Math.round(driveInfo.distanceKm * 1000),
          distanceKm: driveInfo.distanceKm,
          durationMinutes: driveInfo.durationMinutes,
          tmapEtaFormatted,
          address,
        };
      })
    );

    return stations;
  } catch (err) {
    console.warn('TMAP POI gas stations search fallback failed:', err);
    return [];
  }
}

// Dynamic Mock Fallback anchored around the USER'S CURRENT COORDINATES (Never hardcoded to Seoul)
function getFallbackStations(lat: number, lng: number): GasStation[] {
  const mockDeltas = [
    { name: 'SK에너지 주유소', brandCode: 'SKE', brandName: 'SK에너지', dLat: 0.007, dLng: 0.005 },
    { name: 'GS칼텍스 주유소', brandCode: 'GSC', brandName: 'GS칼텍스', dLat: -0.006, dLng: 0.006 },
    { name: 'HD현대오일뱅크 주유소', brandCode: 'HDO', brandName: 'HD현대오일뱅크', dLat: 0.005, dLng: -0.007 },
    { name: 'S-OIL 주유소', brandCode: 'SOL', brandName: 'S-OIL', dLat: -0.008, dLng: -0.005 },
  ];

  const now = new Date();

  return mockDeltas.map((m, idx) => {
    const sLat = lat + m.dLat;
    const sLng = lng + m.dLng;
    const est = calculateHaversineEstimate(lat, lng, sLat, sLng);
    const etaDate = new Date(now.getTime() + est.durationMinutes * 60 * 1000);
    const etaFormatted = `${String(etaDate.getHours()).padStart(2, '0')}:${String(
      etaDate.getMinutes()
    ).padStart(2, '0')}`;

    return {
      id: `fallback_${idx}`,
      name: m.name,
      brandCode: m.brandCode,
      brandName: m.brandName,
      prices: {},
      lat: sLat,
      lng: sLng,
      distanceMeters: Math.round(est.distanceKm * 1000),
      distanceKm: est.distanceKm,
      durationMinutes: est.durationMinutes + idx,
      tmapEtaFormatted: etaFormatted,
      address: '인접 주유소',
    };
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // [태스크 1 & 2] Parse dynamic coordinates from client request without hardcoded Seoul fallback
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');

  if (!latStr || !lngStr || isNaN(parseFloat(latStr)) || isNaN(parseFloat(lngStr))) {
    return NextResponse.json(
      { error: 'lat and lng parameters are required and must be valid numbers' },
      { status: 400 }
    );
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  const cacheKey = getCacheKey(lat, lng);
  const now = Date.now();

  // 1. Quota Safeguard: Check in-memory 15-min cache
  if (gasCache.has(cacheKey)) {
    const cached = gasCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL_MS) {
      // Re-calculate updated ETA clock strings
      const freshNow = new Date();
      const updatedStations = cached.stations.map((st) => {
        const etaDate = new Date(freshNow.getTime() + st.durationMinutes * 60 * 1000);
        return {
          ...st,
          tmapEtaFormatted: `${String(etaDate.getHours()).padStart(2, '0')}:${String(
            etaDate.getMinutes()
          ).padStart(2, '0')}`,
        };
      });

      return NextResponse.json({
        gasStations: updatedStations,
        cached: true,
      });
    }
  }

  // 2. Coordinate Transformation: Dynamic WGS84 -> KATEC
  const [katecX, katecY] = toKatec(lng, lat);
  const opinetKey = process.env.OPINET_API_KEY || 'F260921054';

  const fuels = [
    { code: 'D047', field: 'diesel' as const },
    { code: 'B027', field: 'gasoline' as const },
    { code: 'B034', field: 'premiumGasoline' as const },
  ];

  try {
    // [태스크 2] Multi-tier radius auto-expansion: 3000m (3km) -> 5000m (5km) -> 10000m (10km)
    const RADIUS_STEPS = [3000, 5000, 10000];
    const stationMap = new Map<
      string,
      {
        id: string;
        name: string;
        brandCode: string;
        brandName: string;
        prices: GasPrices;
        x: number;
        y: number;
        distanceMeters: number;
      }
    >();

    for (const radiusM of RADIUS_STEPS) {
      const results = await Promise.all(
        fuels.map(async ({ code, field }) => {
          const url = `http://www.opinet.co.kr/api/aroundAll.do?code=${opinetKey}&x=${Math.round(
            katecX
          )}&y=${Math.round(katecY)}&radius=${radiusM}&prodcd=${code}&sort=1&out=json`;

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500);

            const res = await fetch(url, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!res.ok) return { field, list: [] };
            const data = await res.json();
            return { field, list: Array.isArray(data?.RESULT?.OIL) ? data.RESULT.OIL : [] };
          } catch {
            return { field, list: [] };
          }
        })
      );

      results.forEach(({ field, list }) => {
        list.forEach((oil: any) => {
          const id = oil.UNI_ID || `oil_${Math.random()}`;
          const price = Number(oil.PRICE) || 0;

          if (!stationMap.has(id)) {
            const brandCode = (oil.POLL_DIV_CD || 'ETC').trim().toUpperCase();
            const brandName = BRAND_NAME_MAP[brandCode] || '주유소';
            const x = Number(oil.GIS_X_COOR ?? oil.GIS_X_COORD);
            const y = Number(oil.GIS_Y_COOR ?? oil.GIS_Y_COORD);
            const distanceMeters = Number(oil.DISTANCE) || 0;

            stationMap.set(id, {
              id,
              name: oil.OS_NM || '알 수 없는 주유소',
              brandCode,
              brandName,
              prices: {},
              x,
              y,
              distanceMeters,
            });
          }

          const entry = stationMap.get(id)!;
          if (price > 0) {
            entry.prices[field] = price;
          }
        });
      });

      // If at least one station is found, break immediately to avoid unnecessary network calls
      if (stationMap.size > 0) {
        break;
      }
    }

    const mergedList = Array.from(stationMap.values());

    // [태스크 2] 최후의 안전장치: 오피넷 10km 검색에도 0건일 경우 TMAP 카테고리 POI 폴백 격발
    if (mergedList.length === 0) {
      console.warn('Opinet multi-radius returned 0 stations, triggering TMAP Category POI fallback...');
      const tmapPoiFallback = await fetchTmapAroundGasStations(lat, lng);
      if (tmapPoiFallback.length > 0) {
        gasCache.set(cacheKey, {
          stations: tmapPoiFallback,
          timestamp: Date.now(),
        });
        return NextResponse.json({
          gasStations: tmapPoiFallback,
          cached: false,
          isFallback: true,
        });
      }

      // If TMAP POI also returns 0, dynamically generate nearby mock stations around user coords
      const fallback = getFallbackStations(lat, lng);
      return NextResponse.json({
        gasStations: fallback,
        cached: false,
        isFallback: true,
      });
    }

    // Convert KATEC -> WGS84
    const validStations: GasStation[] = mergedList.slice(0, 10).map((st) => {
      const [wgsLng, wgsLat] = toWgs84(st.x, st.y);
      return {
        id: st.id,
        name: st.name,
        brandCode: st.brandCode,
        brandName: st.brandName,
        price: st.prices.diesel || st.prices.gasoline || 0,
        prices: st.prices,
        lat: wgsLat,
        lng: wgsLng,
        distanceMeters: st.distanceMeters,
        distanceKm: Math.round((st.distanceMeters / 1000) * 10) / 10,
        durationMinutes: 5,
        tmapEtaFormatted: '',
        address: '',
      };
    });

    // 5. Merge TMAP real-time route calculations for top 6 stations
    const topStations = validStations.slice(0, 6);
    const dateNow = new Date();

    const enrichedStations: GasStation[] = await Promise.all(
      topStations.map(async (st) => {
        const driveInfo = await calculateTmapDriveInfo(lat, lng, st.lat, st.lng);
        const etaDate = new Date(dateNow.getTime() + driveInfo.durationMinutes * 60 * 1000);
        const tmapEtaFormatted = `${String(etaDate.getHours()).padStart(2, '0')}:${String(
          etaDate.getMinutes()
        ).padStart(2, '0')}`;

        return {
          ...st,
          distanceKm: driveInfo.distanceKm,
          durationMinutes: driveInfo.durationMinutes,
          tmapEtaFormatted,
        };
      })
    );

    // Save to in-memory cache for 15 minutes
    gasCache.set(cacheKey, {
      stations: enrichedStations,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      gasStations: enrichedStations,
      cached: false,
    });
  } catch (error) {
    console.error('Failed to fetch from Opinet API, checking TMAP POI fallback:', error);
    const tmapPoiFallback = await fetchTmapAroundGasStations(lat, lng);
    if (tmapPoiFallback.length > 0) {
      gasCache.set(cacheKey, {
        stations: tmapPoiFallback,
        timestamp: Date.now(),
      });
      return NextResponse.json({
        gasStations: tmapPoiFallback,
        cached: false,
        isFallback: true,
      });
    }

    const fallback = getFallbackStations(lat, lng);
    gasCache.set(cacheKey, {
      stations: fallback,
      timestamp: Date.now() - (CACHE_TTL_MS - 3 * 60 * 1000),
    });

    return NextResponse.json({
      gasStations: fallback,
      cached: false,
      isFallback: true,
    });
  }
}
