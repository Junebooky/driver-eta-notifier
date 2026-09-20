import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { startLat, startLng, endLat, endLng } = body;

    const useMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';
    const apiKey = process.env.TMAP_API_KEY;

    if (useMock || !apiKey || apiKey === 'your_tmap_api_key') {
      // Calculate realistic mock distance and time based on coordinates if available
      let durationMinutes = 70;
      let distanceKm = 62.4;

      if (startLat && startLng && endLat && endLng) {
        // Haversine rough estimation + traffic multiplier
        const R = 6371; // km
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

        distanceKm = Math.round(straightKm * 1.35 * 10) / 10;
        durationMinutes = Math.max(15, Math.round(distanceKm * 1.25));
      }

      const now = new Date();
      const etaTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
      const hours = etaTime.getHours();
      const minutes = etaTime.getMinutes();
      const formattedHours = hours < 10 ? `0${hours}` : `${hours}`;
      const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
      const etaFormatted = `${formattedHours}:${formattedMinutes} (${durationMinutes}분 소요)`;

      return NextResponse.json({
        distanceKm,
        durationMinutes,
        etaFormatted,
        trafficSummary: '원활 (모의 데이터)',
        isMock: true,
      });
    }

    // Call TMAP Route API (Car Route)
    const tmapUrl = `https://apis.openapi.sk.com/tmap/routes?version=1&format=json`;
    const response = await fetch(tmapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        appKey: apiKey,
      },
      body: JSON.stringify({
        startX: String(startLng),
        startY: String(startLat),
        endX: String(endLng),
        endY: String(endLat),
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: '0', // 0: 추천경로
      }),
    });

    if (!response.ok) {
      throw new Error(`TMAP API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const totalTimeSeconds = data?.features?.[0]?.properties?.totalTime || 4200;
    const totalDistanceMeters = data?.features?.[0]?.properties?.totalDistance || 62000;

    const durationMinutes = Math.round(totalTimeSeconds / 60);
    const distanceKm = Math.round((totalDistanceMeters / 1000) * 10) / 10;

    const now = new Date();
    const etaTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
    const hours = etaTime.getHours();
    const minutes = etaTime.getMinutes();
    const formattedHours = hours < 10 ? `0${hours}` : `${hours}`;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
    const etaFormatted = `${formattedHours}:${formattedMinutes} (${durationMinutes}분 소요)`;

    return NextResponse.json({
      distanceKm,
      durationMinutes,
      etaFormatted,
      trafficSummary: '실시간 교통 반영',
      isMock: false,
    });
  } catch (error: any) {
    console.warn('Route computation error, falling back to mock:', error);
    const durationMinutes = 70;
    const now = new Date();
    const etaTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
    const hours = etaTime.getHours();
    const minutes = etaTime.getMinutes();
    const formattedHours = hours < 10 ? `0${hours}` : `${hours}`;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;

    return NextResponse.json({
      distanceKm: 62.4,
      durationMinutes,
      etaFormatted: `${formattedHours}:${formattedMinutes} (약 70분 소요)`,
      trafficSummary: '기본 경로 계산',
      isMock: true,
    });
  }
}
