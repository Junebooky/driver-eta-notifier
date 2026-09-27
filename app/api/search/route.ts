import { NextRequest, NextResponse } from 'next/server';

export interface TmapPoiItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  originalIndex?: number;
  lowerBizName?: string;
}

export const preferredRegion = 'icn1';
export const runtime = 'nodejs';

/**
 * 검색어 띄어쓰기 전처리 정규화 (Query Normalization)
 * 사용자가 '포시즌스호텔', '신라호텔', '그랜드하얏트', '인천공항터미널'처럼 띄어쓰기 없이 입력할 경우,
 * TMAP 형태소 엔진이 인식할 수 있도록 주요 시설 접미사 앞에 자동으로 공백을 삽입합니다.
 */
export function normalizeSearchKeyword(keyword: string): string {
  return keyword
    .replace(/([가-힣a-zA-Z0-9]+)(호텔|리조트|타워|빌딩|공항|역|터미널|컨벤션|스피디움)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
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
    const centerLon = lngParam && !isNaN(parseFloat(lngParam)) ? parseFloat(lngParam) : 126.9780;

    // Sanitize query: strip dong/ho/floor patterns (e.g. 101동, 102호, 3층) for robust building-level retrieval
    // Safe token pattern: only matches numbers followed by 동/호/층 or A-Z동 (prevents stripping '호' from '포시즌스호텔')
    const detailPattern = /(?<=\s|^)(?:[0-9]+동|[0-9]+호|[0-9B]+층|[A-Za-z]동)(?=\s|$)/g;
    const cleanKeyword = rawKeyword
      .replace(detailPattern, '')
      .replace(/[,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const baseKeyword = cleanKeyword.length >= 2 ? cleanKeyword : rawKeyword;
    
    // 1단계: 검색어 띄어쓰기 형태소 정규화
    const keyword = normalizeSearchKeyword(baseKeyword);

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
    let rawPois = results.flat();

    // 2단계 다중 질의 폴백: 정규화된 키워드로 결과가 없을 경우 백그라운드 재질의
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
          lowerBizName: item.lowerBizName || '',
        });
      }
    });

    // Clean up symbol notation: e.g. '구의역[2호선]' ➔ '구의역 (2호선)'
    pois.forEach((p) => {
      p.name = p.name.replace(/\[(.*?)\]/g, ' ($1)').trim();
    });

    // TMAP POI Re-ranking Engine:
    // 1순위 (지하철 대표역): 검색어 역 대표 역사(예: '구의역 (2호선)', '강남역 (신분당선)') 최상단 배치
    // 2순위 (지하철역 출구): '구의역 1번출구', '구의역 2번출구' 등 출구 번호 오름차순 배치
    // 3순위 (일반 POI): 식당, 병원, 상점 등 부속 시설물 (기존 4-Stage 정합성 랭킹 유지)
    const normKeyword = keyword.replace(/\s+/g, '').toLowerCase();
    const baseStationKeyword = normKeyword.endsWith('역') ? normKeyword.slice(0, -1) : normKeyword;
    const stationKeyword = normKeyword.endsWith('역') ? normKeyword : `${normKeyword}역`;
    const tokens = keyword.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());

    const isSubwayStationMain = (p: TmapPoiItem) => {
      const norm = p.name.replace(/\s+/g, '').toLowerCase();
      // 출구 및 출구 부속시설 제외
      if (norm.includes('출구') || p.lowerBizName === '지하철출구번호') return false;

      const isStationPrefix =
        norm.startsWith(stationKeyword) ||
        (normKeyword.length >= 2 && norm.startsWith(baseStationKeyword + '역'));
      if (!isStationPrefix) return false;

      const hasLinePattern =
        /\[.*?선\]/.test(p.name) ||
        /\(.*선\)/.test(p.name) ||
        /\[.*?호선\]/.test(p.name) ||
        /\(.*호선\)/.test(p.name);
      const isExactStation = norm === stationKeyword || norm === normKeyword;
      const isBizSubway = p.lowerBizName === '지하철역';

      return hasLinePattern || isExactStation || isBizSubway;
    };

    const isSubwayExit = (p: TmapPoiItem) => {
      if (p.lowerBizName === '지하철출구번호') return true;
      const norm = p.name.replace(/\s+/g, '').toLowerCase();
      const isStationPrefix =
        norm.startsWith(stationKeyword) ||
        (normKeyword.length >= 2 && norm.startsWith(baseStationKeyword + '역'));
      return isStationPrefix && /(?:역)?\d+번출구$/.test(norm);
    };

    const getExitNumber = (name: string): number => {
      const m = name.match(/(\d+)번\s*출구/);
      return m ? parseInt(m[1], 10) : 9999;
    };

    pois.sort((a, b) => {
      // 1순위: 대표 지하철역
      const isStationA = isSubwayStationMain(a);
      const isStationB = isSubwayStationMain(b);

      if (isStationA && !isStationB) return -1;
      if (!isStationA && isStationB) return 1;
      if (isStationA && isStationB) {
        return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
      }

      // 2순위: 지하철역 출구 (출구 번호 오름차순)
      const isExitA = isSubwayExit(a);
      const isExitB = isSubwayExit(b);

      if (isExitA && !isExitB) return -1;
      if (!isExitA && isExitB) return 1;
      if (isExitA && isExitB) {
        const exitNumA = getExitNumber(a.name);
        const exitNumB = getExitNumber(b.name);
        if (exitNumA !== exitNumB) return exitNumA - exitNumB;
        return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
      }

      // 3순위: 일반 POI (기존 정렬 가중치 유지)
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
      if (tierA === 1) {
        // 1) 본 건물 우선: 부속 시설(주차장, 전기차충전소, 정문, 후문, 부설) 감점
        const isAuxA = /(?:주차장|전기차충전소|정문|후문|부설)/.test(a.name);
        const isAuxB = /(?:주차장|전기차충전소|정문|후문|부설)/.test(b.name);
        if (!isAuxA && isAuxB) return -1;
        if (isAuxA && !isAuxB) return 1;

        // 2) TMAP 1순위 대표 POI (originalIndex === 0) 최우선 보존 (예: '포시즌스' 검색 시 '포시즌스호텔 서울' 1순위)
        if (a.originalIndex === 0 && !isAuxA) return -1;
        if (b.originalIndex === 0 && !isAuxB) return 1;

        // 3) 후보군 거리가 근접할 경우 완전 일치 우선
        const isExactA = normA === normKeyword;
        const isExactB = normB === normKeyword;
        if (isExactA && !isExactB && Math.abs((a.originalIndex ?? 0) - (b.originalIndex ?? 0)) < 5) return -1;
        if (!isExactA && isExactB && Math.abs((a.originalIndex ?? 0) - (b.originalIndex ?? 0)) < 5) return 1;

        // 4) TMAP 원본 랭킹(거리 및 인기도) 유지
        if ((a.originalIndex ?? 0) !== (b.originalIndex ?? 0)) {
          return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
        }

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

    return NextResponse.json(
      { pois: cleanedPois },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error: any) {
    console.warn('TMAP POI Search error:', error?.message);
    return NextResponse.json({ pois: [] });
  }
}
