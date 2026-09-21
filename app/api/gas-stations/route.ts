import { NextRequest, NextResponse } from 'next/server';
import { toKatec, toWgs84 } from '@/utils/coordinate';
import { FuelCode, GasStation } from '@/types';
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

const FUEL_NAME_MAP: Record<FuelCode, string> = {
  D047: '경유',
  B027: '휘발유',
  B034: '고급휘발유',
};

// Generates rounded cache key (~500m resolution) to prevent repeated calls
function getCacheKey(lat: number, lng: number, prodcd: string): string {
  const roundedLat = (Math.round(lat * 200) / 200).toFixed(3);
  const roundedLng = (Math.round(lng * 200) / 200).toFixed(3);
  return `${roundedLat},${roundedLng}_${prodcd}`;
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
function getFallbackStations(lat: number, lng: number, fuelCode: FuelCode): GasStation[] {
  const fuelName = FUEL_NAME_MAP[fuelCode] || '경유';
  const basePrice = fuelCode === 'D047' ? 1540 : fuelCode === 'B027' ? 1690 : 1940;

  const mockList = [
    {
      id: 'fallback_1',
      name: 'GS칼텍스 역삼주유소',
      brandCode: 'GSC',
      brandName: 'GS칼텍스',
      price: basePrice - 20,
      dLat: 0.005,
      dLng: 0.004,
      address: '서울 강남구 테헤란로 152',
    },
    {
      id: 'fallback_2',
      name: '현대오일뱅크 직영 삼일주유소',
      brandCode: 'HDO',
      brandName: 'HD현대오일뱅크',
      price: basePrice,
      dLat: -0.006,
      dLng: 0.003,
      address: '서울 강남구 역삼로 204',
    },
    {
      id: 'fallback_3',
      name: 'SK에너지 테헤란로주유소',
      brandCode: 'SKE',
      brandName: 'SK에너지',
      price: basePrice + 15,
      dLat: 0.007,
      dLng: -0.005,
      address: '서울 강남구 테헤란로 218',
    },
    {
      id: 'fallback_4',
      name: 'S-OIL 대치제일주유소',
      brandCode: 'SOL',
      brandName: 'S-OIL',
      price: basePrice - 10,
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
      price: m.price,
      fuelCode,
      fuelName,
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
  const fuelCode = (searchParams.get('prodcd') || 'D047') as FuelCode;
  const radius = parseInt(searchParams.get('radius') || '3000', 10);

  // Validate fuelCode
  const validFuelCodes: FuelCode[] = ['D047', 'B027', 'B034'];
  const sanitizedFuelCode = validFuelCodes.includes(fuelCode) ? fuelCode : 'D047';

  const cacheKey = getCacheKey(lat, lng, sanitizedFuelCode);
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
        fuelCode: sanitizedFuelCode,
      });
    }
  }

  // 2. Coordinate Transformation: WGS84 -> KATEC
  const [katecX, katecY] = toKatec(lng, lat);
  const opinetKey = process.env.OPINET_API_KEY || 'F260921054';

  const opinetUrl = `http://www.opinet.co.kr/api/aroundAll.do?code=${opinetKey}&x=${Math.round(
    katecX
  )}&y=${Math.round(katecY)}&radius=${radius}&prodcd=${sanitizedFuelCode}&sort=1&out=json`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(opinetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Opinet API responded with HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawOilList = data?.RESULT?.OIL;

    if (!Array.isArray(rawOilList) || rawOilList.length === 0) {
      console.warn('Opinet returned empty or non-array OIL list, using fallback.');
      const fallback = getFallbackStations(lat, lng, sanitizedFuelCode);
      return NextResponse.json({
        gasStations: fallback,
        cached: false,
        isFallback: true,
        fuelCode: sanitizedFuelCode,
      });
    }

    // 3. Parse Opinet raw data and convert KATEC -> WGS84
    const validStations = rawOilList.slice(0, 8).map((oil: any) => {
      const x = Number(oil.GIS_X_COOR ?? oil.GIS_X_COORD);
      const y = Number(oil.GIS_Y_COOR ?? oil.GIS_Y_COORD);
      const [wgsLng, wgsLat] = toWgs84(x, y);

      const brandCode = (oil.POLL_DIV_CD || 'ETC').trim().toUpperCase();
      const brandName = BRAND_NAME_MAP[brandCode] || '주유소';
      const price = Number(oil.PRICE) || 0;
      const distanceMeters = Number(oil.DISTANCE) || 0;

      return {
        id: oil.UNI_ID || `oil_${Math.random()}`,
        name: oil.OS_NM || '알 수 없는 주유소',
        brandCode,
        brandName,
        price,
        fuelCode: sanitizedFuelCode,
        fuelName: FUEL_NAME_MAP[sanitizedFuelCode] || '경유',
        lat: wgsLat,
        lng: wgsLng,
        distanceMeters,
        distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
        durationMinutes: 5,
        tmapEtaFormatted: '',
        address: '',
      };
    });

    // 4. Merge TMAP real-time route calculations for top 5 stations
    const topStations = validStations.slice(0, 5);
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
      fuelCode: sanitizedFuelCode,
    });
  } catch (error) {
    console.error('Failed to fetch from Opinet API, returning fallback:', error);
    const fallback = getFallbackStations(lat, lng, sanitizedFuelCode);

    // Also cache fallback briefly (3 minutes) to shield quota
    gasCache.set(cacheKey, {
      stations: fallback,
      timestamp: Date.now() - (CACHE_TTL_MS - 3 * 60 * 1000),
    });

    return NextResponse.json({
      gasStations: fallback,
      cached: false,
      isFallback: true,
      fuelCode: sanitizedFuelCode,
    });
  }
}
