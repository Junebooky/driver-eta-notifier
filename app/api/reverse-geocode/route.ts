import { NextRequest, NextResponse } from 'next/server';

export const preferredRegion = 'icn1';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!lat || !lng) {
      return NextResponse.json({ error: 'lat and lng parameters are required' }, { status: 400 });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return NextResponse.json({ error: 'Invalid lat or lng' }, { status: 400 });
    }

    const fallbackCoordText = `GPS 수신 (${parsedLat.toFixed(4)}, ${parsedLng.toFixed(4)})`;

    const apiKey = process.env.TMAP_API_KEY;
    if (!apiKey || apiKey === 'your_tmap_api_key') {
      return NextResponse.json({
        address: fallbackCoordText,
        buildingName: '',
        lat: parsedLat,
        lng: parsedLng,
      });
    }

    const url = `https://apis.openapi.sk.com/tmap/geo/reversegeocoding?version=1&lat=${parsedLat}&lon=${parsedLng}&coordType=WGS84GEO&addressType=A02`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          appKey: apiKey,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const addrInfo = data?.addressInfo;
        if (addrInfo) {
          const fullAddress =
            addrInfo.fullAddress ||
            [addrInfo.city_do, addrInfo.gu_gun, addrInfo.roadName, addrInfo.buildingIndex]
              .filter(Boolean)
              .join(' ');
          const buildingName = addrInfo.buildingName || '';

          return NextResponse.json({
            address: fullAddress || fallbackCoordText,
            buildingName,
            city: addrInfo.city_do || '',
            district: addrInfo.gu_gun || '',
            dong: addrInfo.legalDong || addrInfo.adminDong || '',
            lat: parsedLat,
            lng: parsedLng,
          });
        }
      }
    } catch (fetchErr) {
      console.warn('TMAP reverse-geocoding fetch error:', fetchErr);
    }

    return NextResponse.json({
      address: fallbackCoordText,
      buildingName: '',
      lat: parsedLat,
      lng: parsedLng,
    });
  } catch (err) {
    console.warn('Reverse geocode error:', err);
    return NextResponse.json({
      address: '현재 위치 (GPS)',
      buildingName: '',
    });
  }
}
