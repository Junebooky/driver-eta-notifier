import { NextRequest, NextResponse } from 'next/server';

export interface TmapPoiItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword')?.trim();

    if (!keyword || keyword.length < 1) {
      return NextResponse.json({ pois: [] });
    }

    const apiKey = process.env.TMAP_API_KEY;
    if (!apiKey || apiKey === 'your_tmap_api_key') {
      return NextResponse.json({
        pois: [],
        message: 'TMAP API key not configured',
      });
    }

    const tmapUrl = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(
      keyword
    )}&count=10&reqCoordType=WGS84GEO&resCoordType=WGS84GEO`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(tmapUrl, {
      method: 'GET',
      headers: {
        appKey: apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`TMAP POI Search HTTP ${response.status}`);
      return NextResponse.json({ pois: [] });
    }

    const data = await response.json();
    const rawPois = data?.searchPoiInfo?.pois?.poi || [];

    const pois: TmapPoiItem[] = rawPois.map((item: any) => {
      const roadAddr = item?.newAddressList?.newAddress?.[0]?.fullAddressRoad;
      const jibunAddr = `${item.upperAddrName || ''} ${item.middleAddrName || ''} ${
        item.lowerAddrName || ''
      } ${item.detailAddrName || ''}`.trim();

      const address = roadAddr || jibunAddr || '주소 정보 없음';
      const lat = parseFloat(item.frontLat || item.noorLat || '37.5665');
      const lng = parseFloat(item.frontLon || item.noorLon || '126.9780');

      return {
        id: item.id || `poi_${Date.now()}_${Math.random()}`,
        name: item.name || keyword,
        address,
        lat,
        lng,
      };
    });

    return NextResponse.json({ pois });
  } catch (error: any) {
    console.warn('TMAP POI Search error:', error?.message);
    return NextResponse.json({ pois: [] });
  }
}
