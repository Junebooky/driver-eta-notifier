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

    const pois: TmapPoiItem[] = rawPois.map((item: any, originalIndex: number) => {
      const roadAddr = item?.newAddressList?.newAddress?.[0]?.fullAddressRoad;
      const jibunAddr = `${item.upperAddrName || ''} ${item.middleAddrName || ''} ${
        item.lowerAddrName || ''
      } ${item.detailAddrName || ''}`.trim();

      const address = roadAddr || jibunAddr || '주소 정보 없음';
      const lat = parseFloat(item.frontLat || item.noorLat || '37.5665');
      const lng = parseFloat(item.frontLon || item.noorLon || '126.9780');

      return {
        id: item.id || `poi_${Date.now()}_${originalIndex}`,
        name: item.name || keyword,
        address,
        lat,
        lng,
        originalIndex,
      };
    });

    // Re-ranking based on user search relevance:
    // 1st Priority: Exact match (name === keyword without spaces/case)
    // 2nd Priority: Starts with keyword
    // 3rd Priority: Contains keyword (sorted by length difference closest to keyword)
    // 4th Priority: Other items in original TMAP order
    const normKeyword = keyword.replace(/\s+/g, '').toLowerCase();

    pois.sort((a: any, b: any) => {
      const normA = a.name.replace(/\s+/g, '').toLowerCase();
      const normB = b.name.replace(/\s+/g, '').toLowerCase();

      const getTier = (normName: string) => {
        if (normName === normKeyword) return 1;
        if (normName.startsWith(normKeyword)) return 2;
        if (normName.includes(normKeyword)) return 3;
        return 4;
      };

      const tierA = getTier(normA);
      const tierB = getTier(normB);

      if (tierA !== tierB) {
        return tierA - tierB;
      }

      // In Tier 2 and Tier 3, sort by length difference closest to keyword
      if (tierA === 2 || tierA === 3) {
        const diffA = Math.abs(normA.length - normKeyword.length);
        const diffB = Math.abs(normB.length - normKeyword.length);
        if (diffA !== diffB) {
          return diffA - diffB;
        }
      }

      return a.originalIndex - b.originalIndex;
    });

    // Clean up originalIndex before returning
    const cleanedPois: TmapPoiItem[] = pois.map(({ id, name, address, lat, lng }) => ({
      id,
      name,
      address,
      lat,
      lng,
    }));

    return NextResponse.json({ pois: cleanedPois });
  } catch (error: any) {
    console.warn('TMAP POI Search error:', error?.message);
    return NextResponse.json({ pois: [] });
  }
}
