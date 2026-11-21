import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { NextRequest, NextResponse } from 'next/server';
import {
  TmapPoiItem,
  sanitizeSearchQuery,
  normalizeSearchKeyword,
  isAirportSearchQuery,
  rankAndDedupeTmapPois,
} from '@/lib/places/tmapSearchEngine';

export { normalizeSearchKeyword };
export type { TmapPoiItem };

interface RawTmapPoi {
  id?: string;
  name?: string;
  frontLat?: string;
  frontLon?: string;
  noorLat?: string;
  noorLon?: string;
  upperAddrName?: string;
  middleAddrName?: string;
  lowerAddrName?: string;
  detailAddrName?: string;
  lowerBizName?: string;
  newAddressList?: {
    newAddress?: Array<{
      fullAddressRoad?: string;
    }>;
  };
}

export const preferredRegion = 'icn1';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const apiAuth = await verifyServerAuth(req);
  if (!apiAuth.ok) return NextResponse.json({ ok: false, error: apiAuth.error }, { status: apiAuth.statusCode });
  try {
    const { searchParams } = new URL(req.url);
    const rawKeyword = searchParams.get('keyword')?.trim();

    if (!rawKeyword || rawKeyword.length < 2) {
      return NextResponse.json({ pois: [] });
    }

    // 기준 좌표 (기사 현재 GPS 또는 서울 중심 좌표 기본값: 37.5665, 126.9780)
    const latParam = searchParams.get('lat') || searchParams.get('centerLat');
    const lngParam = searchParams.get('lng') || searchParams.get('centerLon');
    const centerLat = latParam && !isNaN(parseFloat(latParam)) ? parseFloat(latParam) : 37.5665;
    const centerLon = lngParam && !isNaN(parseFloat(lngParam)) ? parseFloat(lngParam) : 126.978;

    const cleanKeyword = sanitizeSearchQuery(rawKeyword);
    const baseKeyword = cleanKeyword.length >= 2 ? cleanKeyword : rawKeyword;

    // 1단계: 검색어 띄어쓰기 형태소 정규화
    const keyword = normalizeSearchKeyword(baseKeyword);
    const normKeyword = keyword.replace(/\s+/g, '').toLowerCase();
    const isAirportQuery = isAirportSearchQuery(normKeyword);

    const apiKey = process.env.TMAP_API_KEY;
    if (!apiKey || apiKey === 'your_tmap_api_key') {
      // Even without TMAP API key, return canonical airport POIs if query is an airport
      const fallbackRanked = isAirportQuery ? rankAndDedupeTmapPois([], rawKeyword) : [];
      return NextResponse.json({
        pois: fallbackRanked,
        message: 'TMAP API key not configured',
      });
    }

    const fetchPage = async (searchKw: string, pageNum: number): Promise<RawTmapPoi[]> => {
      try {
        const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(
          searchKw
        )}&page=${pageNum}&count=30&centerLat=${centerLat}&centerLon=${centerLon}&reqCoordType=WGS84GEO&resCoordType=WGS84GEO`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            appKey: apiKey,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 200) {
          const data = await response.json();
          return data?.searchPoiInfo?.pois?.poi || [];
        }
        return [];
      } catch {
        return [];
      }
    };

    const fetchTasks: Promise<RawTmapPoi[]>[] = [
      fetchPage(keyword, 1),
      fetchPage(keyword, 2),
    ];

    if (isAirportQuery) {
      if (normKeyword.includes('김포') || normKeyword.includes('gmp')) {
        fetchTasks.push(fetchPage('김포국제공항', 1));
      } else if (normKeyword.includes('인천') || normKeyword.includes('icn')) {
        fetchTasks.push(fetchPage('인천국제공항', 1));
      } else if (normKeyword.includes('제주') || normKeyword.includes('cju')) {
        fetchTasks.push(fetchPage('제주국제공항', 1));
      } else if (normKeyword.includes('김해') || normKeyword.includes('pus')) {
        fetchTasks.push(fetchPage('김해국제공항', 1));
      } else {
        fetchTasks.push(fetchPage('인천국제공항', 1));
        fetchTasks.push(fetchPage('김포국제공항', 1));
      }
    } else {
      const hasCommonSuffix = /(?:빌|빌라|아파트|호텔|타워|센터|역|점|빌딩)$/.test(keyword);
      if (keyword.length >= 3 && !hasCommonSuffix) {
        fetchTasks.push(fetchPage(`${keyword}빌`, 1));
      }
    }

    const results = await Promise.all(fetchTasks);
    let rawPois = results.flat();

    if (rawPois.length === 0) {
      const words = keyword.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        const core1 = words.slice(0, 2).join(' ');
        const coreFallback = core1 !== keyword ? core1 : words[0];
        if (coreFallback && coreFallback.length >= 2) {
          const fallbackResults = await Promise.all([
            fetchPage(coreFallback, 1),
            fetchPage(coreFallback, 2),
          ]);
          rawPois = fallbackResults.flat();
        }
      } else if (keyword !== baseKeyword) {
        const fallbackResults = await Promise.all([
          fetchPage(baseKeyword, 1),
          fetchPage(baseKeyword, 2),
        ]);
        rawPois = fallbackResults.flat();
      }
    }

    const mappedPois: TmapPoiItem[] = rawPois.map((item: RawTmapPoi, originalIndex: number) => {
      const roadAddr = item?.newAddressList?.newAddress?.[0]?.fullAddressRoad;
      const jibunAddr = `${item.upperAddrName || ''} ${item.middleAddrName || ''} ${
        item.lowerAddrName || ''
      } ${item.detailAddrName || ''}`.trim();

      const address = roadAddr || jibunAddr || '주소 정보 없음';
      const lat = parseFloat(item.frontLat || item.noorLat || '37.5665');
      const lng = parseFloat(item.frontLon || item.noorLon || '126.9780');
      const name = (item.name || keyword).replace(/\[(.*?)\]/g, ' ($1)').trim();

      return {
        id: item.id || `poi_${Date.now()}_${originalIndex}`,
        name,
        address,
        lat,
        lng,
        originalIndex,
        lowerBizName: item.lowerBizName || '',
      };
    });

    const cleanedPois = rankAndDedupeTmapPois(mappedPois, rawKeyword);

    return NextResponse.json(
      { pois: cleanedPois },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('TMAP POI Search error:', message);
    return NextResponse.json({ pois: [] });
  }
}
