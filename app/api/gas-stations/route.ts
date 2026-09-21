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

// Fallback Mock Stations near Gangnam/Teheran-ro if Opinet network fails or quota exceeded
function getFallbackStations(lat: number, lng: number): GasStation[] {
  const mockList = [
    {
      id: 'fallback_1',
      name: 'GS칼텍스 역삼주유소',
      brandCode: 'GSC',
      brandName: 'GS칼텍스',
      prices: { diesel: 1520, gasoline: 1670, premiumGasoline: 1920 },
      dLat: 0.005,
      dLng: 0.004,
      address: '서울 강남구 테헤란로 152',
    },
    {
      id: 'fallback_2',
      name: '현대오일뱅크 직영 삼일주유소',
      brandCode: 'HDO',
      brandName: 'HD현대오일뱅크',
      prices: { diesel: 1540, gasoline: 1690, premiumGasoline: 1940 },
      dLat: -0.006,
      dLng: 0.003,
      address: '서울 강남구 역삼로 204',
    },
    {
      id: 'fallback_3',
      name: 'SK에너지 테헤란로주유소',
      brandCode: 'SKE',
      brandName: 'SK에너지',
      prices: { diesel: 1555, gasoline: 1710, premiumGasoline: 1980 },
      dLat: 0.007,
      dLng: -0.005,
      address: '서울 강남구 테헤란로 218',
    },
    {
      id: 'fallback_4',
      name: 'S-OIL 대치제일주유소',
      brandCode: 'SOL',
      brandName: 'S-OIL',
      prices: { diesel: 1530, gasoline: 1680, premiumGasoline: 1930 },
      dLat: -0.008,
      dLng: 0.007,
      address: '서울 강남구 삼성로 312',
    },
  ];

  const now = new Date();

  return mockList.map((m, idx) => {
    const sLat = lat + m.dLat;
    const sLng = lng + m.dLng;
    const est = calculateHaversineEstimate(lat, lng, sLat, sLng);
    const etaDate = new Date(now.getTime() + est.durationMinutes * 60 * 1000);
    const etaFormatted = `${String(etaDate.getHours()).padStart(2, '0')}:${String(
      etaDate.getMinutes()
    ).padStart(2, '0')}`;

    return {
      id: m.id,
      name: m.name,
      brandCode: m.brandCode,
      brandName: m.brandName,
      price: m.prices.diesel,
      prices: m.prices,
      fuelCode: 'D047',
      fuelName: '경유',
      lat: sLat,
      lng: sLng,
      distanceMeters: Math.round(est.distanceKm * 1000),
      distanceKm: est.distanceKm,
      durationMinutes: est.durationMinutes + idx,
      tmapEtaFormatted: etaFormatted,
      address: m.address,
    };
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Parse query parameters
  const lat = parseFloat(searchParams.get('lat') || '37.5000');
  const lng = parseFloat(searchParams.get('lng') || '127.0350');
  const radius = parseInt(searchParams.get('radius') || '3000', 10);

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

  // 2. Coordinate Transformation: WGS84 -> KATEC
  const [katecX, katecY] = toKatec(lng, lat);
  const opinetKey = process.env.OPINET_API_KEY || 'F260921054';

  const fuels = [
    { code: 'D047', field: 'diesel' as const },
    { code: 'B027', field: 'gasoline' as const },
    { code: 'B034', field: 'premiumGasoline' as const },
  ];

  try {
    // 3. Parallel fetch of all 3 fuel types from Opinet API
    const results = await Promise.all(
      fuels.map(async ({ code, field }) => {
        const url = `http://www.opinet.co.kr/api/aroundAll.do?code=${opinetKey}&x=${Math.round(
          katecX
        )}&y=${Math.round(katecY)}&radius=${radius}&prodcd=${code}&sort=1&out=json`;

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

    // 4. Merge 3-fuel prices into unified station map
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

    const mergedList = Array.from(stationMap.values());

    if (mergedList.length === 0) {
      console.warn('Opinet returned 0 stations, using fallback.');
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
        fuelCode: 'D047',
        fuelName: '경유',
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
    console.error('Failed to fetch from Opinet API, returning fallback:', error);
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
