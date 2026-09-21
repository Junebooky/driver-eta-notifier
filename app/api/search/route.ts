import { NextRequest, NextResponse } from 'next/server';

export interface TmapPoiItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  originalIndex?: number;
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

    const fetchPage = async (searchKw: string, pageNum: number): Promise<any[]> => {
      try {
        const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(
          searchKw
        )}&page=${pageNum}&count=30&reqCoordType=WGS84GEO&resCoordType=WGS84GEO`;

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
      } catch (err) {
        return [];
      }
    };

    // Parallel fetch: Page 1 + Page 2 (Up to 60 candidates)
    // Plus suffix expansion if user entered compound noun like '대원베스트'
    const fetchTasks: Promise<any[]>[] = [
      fetchPage(keyword, 1),
      fetchPage(keyword, 2),
    ];

    const hasCommonSuffix = /(?:빌|빌라|아파트|호텔|타워|센터|역|점|빌딩)$/.test(keyword);
    if (keyword.length >= 3 && !hasCommonSuffix) {
      fetchTasks.push(fetchPage(`${keyword}빌`, 1));
    }

    const results = await Promise.all(fetchTasks);
    const rawPois = results.flat();

    // Deduplicate and map raw POIs
    const seenMap = new Set<string>();
    const pois: TmapPoiItem[] = [];

    rawPois.forEach((item: any, originalIndex: number) => {
      const roadAddr = item?.newAddressList?.newAddress?.[0]?.fullAddressRoad;
      const jibunAddr = `${item.upperAddrName || ''} ${item.middleAddrName || ''} ${
        item.lowerAddrName || ''
      } ${item.detailAddrName || ''}`.trim();

      const address = roadAddr || jibunAddr || '주소 정보 없음';
      const lat = parseFloat(item.frontLat || item.noorLat || '37.5665');
      const lng = parseFloat(item.frontLon || item.noorLon || '126.9780');
      const name = item.name || keyword;

      const dedupeKey = `${name}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
      if (!seenMap.has(dedupeKey)) {
        seenMap.add(dedupeKey);
        pois.push({
          id: item.id || `poi_${Date.now()}_${originalIndex}`,
          name,
          address,
          lat,
          lng,
          originalIndex,
        });
      }
    });

    // 4-Stage Normalized Ranking Algorithm:
    // Rank 1 (최우선): 공백 제거 후 검색어로 시작하는 장소명 (name.replace(/\s+/g, '').startsWith(query))
    //                 예: '대원베스트' 검색 시 '대원베스트빌'이 최상위(Rank 1)에 즉시 승격
    // Rank 2: 검색어를 내부에 포함하는 장소명 (name.includes(query))
    // Rank 3: 검색어 토큰 또는 주소에 검색어가 포함된 경우
    // Rank 4: TMAP 기본 원본 가중치 순서
    const normKeyword = keyword.replace(/\s+/g, '').toLowerCase();
    const tokens = keyword.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());

    pois.sort((a, b) => {
      const normA = a.name.replace(/\s+/g, '').toLowerCase();
      const normB = b.name.replace(/\s+/g, '').toLowerCase();
      const addrA = a.address.replace(/\s+/g, '').toLowerCase();
      const addrB = b.address.replace(/\s+/g, '').toLowerCase();

      const getTier = (normName: string, normAddr: string) => {
        // Rank 1: Exact match OR starts with search term
        if (normName === normKeyword || normName.startsWith(normKeyword)) {
          return 1;
        }
        // Rank 2: Contains the full search term
        if (normName.includes(normKeyword)) {
          return 2;
        }
        // Rank 3: Matches tokens or address matches
        if (tokens.every((t) => normName.includes(t)) || normAddr.includes(normKeyword)) {
          return 3;
        }
        // Rank 4: Other items
        return 4;
      };

      const tierA = getTier(normA, addrA);
      const tierB = getTier(normB, addrB);

      if (tierA !== tierB) {
        return tierA - tierB;
      }

      // Inside Rank 1:
      // Exact match comes first; then shortest length difference from keyword
      if (tierA === 1) {
        const isExactA = normA === normKeyword;
        const isExactB = normB === normKeyword;
        if (isExactA && !isExactB) return -1;
        if (!isExactA && isExactB) return 1;

        const diffA = Math.abs(normA.length - normKeyword.length);
        const diffB = Math.abs(normB.length - normKeyword.length);
        if (diffA !== diffB) return diffA - diffB;
      }

      // Inside Rank 2:
      // Shortest length difference from keyword
      if (tierA === 2) {
        const diffA = Math.abs(normA.length - normKeyword.length);
        const diffB = Math.abs(normB.length - normKeyword.length);
        if (diffA !== diffB) return diffA - diffB;
      }

      // Default fallback: Preserve original candidate ranking
      return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
    });

    const cleanedPois = pois.map(({ id, name, address, lat, lng }) => ({
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
