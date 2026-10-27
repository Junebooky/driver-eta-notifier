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

/**
 * VIP 의전 차량 기사를 위한 대한민국 주요 공항 공식 터미널 및 입·출국장 카노니컬 POI 마스터
 * 기사는 지하철 승강장이 아닌 차량 승객 픽업(입국장) 및 샌딩(출국장)을 필요로 하므로,
 * 공항 검색 시 입국장과 출국장, 여객터미널 본 건물이 최우선적으로 노출되도록 보장합니다.
 */
interface CanonicalAirportPoi {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: 'incheon' | 'gimpo' | 'jeju' | 'gimhae' | 'other';
  isArrival: boolean;
  isDeparture: boolean;
  terminal?: 'T1' | 'T2' | 'domestic' | 'international';
}

const CANONICAL_AIRPORT_POIS: CanonicalAirportPoi[] = [
  // 1. 인천국제공항 제1여객터미널
  {
    id: 'apt-icn-t1-arr',
    name: '인천국제공항 제1여객터미널 입국장',
    address: '인천 중구 공항로 272',
    lat: 37.4492641,
    lng: 126.45434989,
    type: 'incheon',
    isArrival: true,
    isDeparture: false,
    terminal: 'T1',
  },
  {
    id: 'apt-icn-t1-dep',
    name: '인천국제공항 제1여객터미널 출국장',
    address: '인천 중구 공항로 272',
    lat: 37.44909745,
    lng: 126.45432212,
    type: 'incheon',
    isArrival: false,
    isDeparture: true,
    terminal: 'T1',
  },
  {
    id: 'apt-icn-t1-main',
    name: '인천국제공항 제1여객터미널',
    address: '인천 중구 공항로 272',
    lat: 37.44909745,
    lng: 126.45432212,
    type: 'incheon',
    isArrival: false,
    isDeparture: false,
    terminal: 'T1',
  },

  // 2. 인천국제공항 제2여객터미널
  {
    id: 'apt-icn-t2-arr',
    name: '인천국제공항 제2여객터미널 입국장',
    address: '인천 중구 제2터미널대로 446',
    lat: 37.4688448,
    lng: 126.4339901,
    type: 'incheon',
    isArrival: true,
    isDeparture: false,
    terminal: 'T2',
  },
  {
    id: 'apt-icn-t2-dep',
    name: '인천국제공항 제2여객터미널 출국장',
    address: '인천 중구 제2터미널대로 446',
    lat: 37.46878925,
    lng: 126.4341012,
    type: 'incheon',
    isArrival: false,
    isDeparture: true,
    terminal: 'T2',
  },
  {
    id: 'apt-icn-t2-main',
    name: '인천국제공항 제2여객터미널',
    address: '인천 중구 제2터미널대로 446',
    lat: 37.46878925,
    lng: 126.4341012,
    type: 'incheon',
    isArrival: false,
    isDeparture: false,
    terminal: 'T2',
  },
  {
    id: 'apt-icn-main',
    name: '인천국제공항',
    address: '인천 중구 공항로 272',
    lat: 37.4559576,
    lng: 126.44501723,
    type: 'incheon',
    isArrival: false,
    isDeparture: false,
  },

  // 3. 김포국제공항 국내선
  {
    id: 'apt-gmp-dom-arr',
    name: '김포국제공항 국내선 입국장',
    address: '서울 강서구 하늘길 112',
    lat: 37.55939634,
    lng: 126.80353718,
    type: 'gimpo',
    isArrival: true,
    isDeparture: false,
    terminal: 'domestic',
  },
  {
    id: 'apt-gmp-dom-dep',
    name: '김포국제공항 국내선 출국장',
    address: '서울 강서구 하늘길 112',
    lat: 37.55925746,
    lng: 126.8032872,
    type: 'gimpo',
    isArrival: false,
    isDeparture: true,
    terminal: 'domestic',
  },
  {
    id: 'apt-gmp-dom-main',
    name: '김포국제공항 국내선',
    address: '서울 강서구 하늘길 112',
    lat: 37.55925746,
    lng: 126.8032872,
    type: 'gimpo',
    isArrival: false,
    isDeparture: false,
    terminal: 'domestic',
  },

  // 4. 김포국제공항 국제선
  {
    id: 'apt-gmp-int-arr',
    name: '김포국제공항 국제선 입국장',
    address: '서울 강서구 하늘길 38',
    lat: 37.56534006,
    lng: 126.80150942,
    type: 'gimpo',
    isArrival: true,
    isDeparture: false,
    terminal: 'international',
  },
  {
    id: 'apt-gmp-int-dep',
    name: '김포국제공항 국제선 출국장',
    address: '서울 강서구 하늘길 38',
    lat: 37.56545115,
    lng: 126.80131499,
    type: 'gimpo',
    isArrival: false,
    isDeparture: true,
    terminal: 'international',
  },
  {
    id: 'apt-gmp-int-main',
    name: '김포국제공항 국제선',
    address: '서울 강서구 하늘길 38',
    lat: 37.56545115,
    lng: 126.80131499,
    type: 'gimpo',
    isArrival: false,
    isDeparture: false,
    terminal: 'international',
  },
  {
    id: 'apt-gmp-main',
    name: '김포국제공항',
    address: '서울 강서구 하늘길 112',
    lat: 37.56556225,
    lng: 126.80139831,
    type: 'gimpo',
    isArrival: false,
    isDeparture: false,
  },

  // 5. 제주국제공항
  {
    id: 'apt-cju-arr',
    name: '제주국제공항 입국장',
    address: '제주 제주시 공항로 2',
    lat: 33.506621,
    lng: 126.493033,
    type: 'jeju',
    isArrival: true,
    isDeparture: false,
  },
  {
    id: 'apt-cju-dep',
    name: '제주국제공항 출국장',
    address: '제주 제주시 공항로 2',
    lat: 33.506621,
    lng: 126.493033,
    type: 'jeju',
    isArrival: false,
    isDeparture: true,
  },
  {
    id: 'apt-cju-main',
    name: '제주국제공항',
    address: '제주 제주시 공항로 2',
    lat: 33.506621,
    lng: 126.493033,
    type: 'jeju',
    isArrival: false,
    isDeparture: false,
  },

  // 6. 김해국제공항
  {
    id: 'apt-pus-dom-arr',
    name: '김해국제공항 국내선 입국장',
    address: '부산 강서구 공항진입로 108',
    lat: 35.173167,
    lng: 128.946461,
    type: 'gimhae',
    isArrival: true,
    isDeparture: false,
  },
  {
    id: 'apt-pus-dom-dep',
    name: '김해국제공항 국내선 출국장',
    address: '부산 강서구 공항진입로 108',
    lat: 35.173167,
    lng: 128.946461,
    type: 'gimhae',
    isArrival: false,
    isDeparture: true,
  },
  {
    id: 'apt-pus-int-arr',
    name: '김해국제공항 국제선 입국장',
    address: '부산 강서구 공항진입로 108',
    lat: 35.174352,
    lng: 128.948197,
    type: 'gimhae',
    isArrival: true,
    isDeparture: false,
  },
  {
    id: 'apt-pus-int-dep',
    name: '김해국제공항 국제선 출국장',
    address: '부산 강서구 공항진입로 108',
    lat: 35.174352,
    lng: 128.948197,
    type: 'gimhae',
    isArrival: false,
    isDeparture: true,
  },
  {
    id: 'apt-pus-main',
    name: '김해국제공항',
    address: '부산 강서구 공항진입로 108',
    lat: 35.173167,
    lng: 128.946461,
    type: 'gimhae',
    isArrival: false,
    isDeparture: false,
  },
];

function getMatchingCanonicalAirportPois(normQuery: string): TmapPoiItem[] {
  const isGimpo = normQuery.includes('김포') || normQuery.includes('gmp');
  const isIncheon = normQuery.includes('인천') || normQuery.includes('icn');
  const isJeju = normQuery.includes('제주') || normQuery.includes('cju');
  const isGimhae = normQuery.includes('김해') || normQuery.includes('pus');
  const isGenericAirport =
    !isGimpo &&
    !isIncheon &&
    !isJeju &&
    !isGimhae &&
    (normQuery.includes('공항') ||
      normQuery.includes('airport') ||
      normQuery.includes('입국') ||
      normQuery.includes('출국'));

  return CANONICAL_AIRPORT_POIS.filter((p) => {
    if (isGimpo && p.type === 'gimpo') return true;
    if (isIncheon && p.type === 'incheon') return true;
    if (isJeju && p.type === 'jeju') return true;
    if (isGimhae && p.type === 'gimhae') return true;
    if (isGenericAirport && (p.type === 'incheon' || p.type === 'gimpo')) return true;
    return false;
  }).map((p, idx) => ({
    id: p.id,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    originalIndex: idx - 100, // Highest baseline priority
    lowerBizName: '공항',
  }));
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
    const detailPattern = /(?<=\s|^)(?:[0-9]+동|[0-9]+호|[0-9B]+층|[A-Za-z]동)(?=\s|$)/g;
    const cleanKeyword = rawKeyword
      .replace(detailPattern, '')
      .replace(/[,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const baseKeyword = cleanKeyword.length >= 2 ? cleanKeyword : rawKeyword;

    // 1단계: 검색어 띄어쓰기 형태소 정규화
    const keyword = normalizeSearchKeyword(baseKeyword);
    const normKeyword = keyword.replace(/\s+/g, '').toLowerCase();

    // 공항 관련 질의 감지 (기사용 자동차 전용 우선순위 적용 대상)
    const isAirportQuery =
      (normKeyword.includes('공항') && !normKeyword.includes('공항동')) ||
      normKeyword.includes('airport') ||
      normKeyword.includes('icn') ||
      normKeyword.includes('gmp') ||
      normKeyword.includes('cju') ||
      normKeyword.includes('입국장') ||
      normKeyword.includes('출국장');

    const apiKey = process.env.TMAP_API_KEY;
    if (!apiKey || apiKey === 'your_tmap_api_key') {
      return NextResponse.json({
        pois: [],
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

    // Parallel fetch: Page 1 + Page 2 (Up to 60 candidates)
    // 공항 검색어의 경우 TMAP의 '국제공항' 공식 인덱스를 병렬 조회하여 최적의 POI를 확보합니다.
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

    // 공항 검색의 경우 100% 신뢰할 수 있는 공식 터미널 입·출국장 카노니컬 POI를 선두에 주입
    if (isAirportQuery) {
      const canonicals = getMatchingCanonicalAirportPois(normKeyword);
      canonicals.forEach((c) => {
        const dedupeKey = `${c.name.replace(/\s+/g, '')}_${c.lat.toFixed(3)}_${c.lng.toFixed(3)}`;
        if (!seenMap.has(dedupeKey)) {
          seenMap.add(dedupeKey);
          pois.push(c);
        }
      });
    }

    rawPois.forEach((item: RawTmapPoi, originalIndex: number) => {
      const roadAddr = item?.newAddressList?.newAddress?.[0]?.fullAddressRoad;
      const jibunAddr = `${item.upperAddrName || ''} ${item.middleAddrName || ''} ${
        item.lowerAddrName || ''
      } ${item.detailAddrName || ''}`.trim();

      const address = roadAddr || jibunAddr || '주소 정보 없음';
      const lat = parseFloat(item.frontLat || item.noorLat || '37.5665');
      const lng = parseFloat(item.frontLon || item.noorLon || '126.9780');

      let name = (item.name || keyword).replace(/\[(.*?)\]/g, ' ($1)').trim();
      // 공항명 및 터미널 명칭 공백 표준화 (예: '김포국제공항국내선 출국장' ➔ '김포국제공항 국내선 출국장')
      name = name
        .replace(/김포국제공항국내선/g, '김포국제공항 국내선')
        .replace(/김포국제공항국제선/g, '김포국제공항 국제선')
        .replace(/국내선출국장/g, '국내선 출국장')
        .replace(/국내선입국장/g, '국내선 입국장')
        .replace(/국제선출국장/g, '국제선 출국장')
        .replace(/국제선입국장/g, '국제선 입국장')
        .replace(/\s+/g, ' ')
        .trim();

      const dedupeKey = `${name.replace(/\s+/g, '')}_${lat.toFixed(3)}_${lng.toFixed(3)}`;
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

    // ==========================================
    // TMAP POI Re-ranking Engine
    // ==========================================
    const baseStationKeyword = normKeyword.endsWith('역') ? normKeyword.slice(0, -1) : normKeyword;
    const stationKeyword = normKeyword.endsWith('역') ? normKeyword : `${normKeyword}역`;
    const tokens = keyword.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());

    // 사용자 의도 분석 (입국장, 출국장, T1, T2, 국내선, 국제선)
    const wantsArrival = normKeyword.includes('입국') || normKeyword.includes('arrival') || normKeyword.includes('도착');
    const wantsDeparture = normKeyword.includes('출국') || normKeyword.includes('departure') || normKeyword.includes('출발');
    const wantsT1 = /t1|1터미널|제1|1터/i.test(normKeyword);
    const wantsT2 = /t2|2터미널|제2|2터/i.test(normKeyword);
    const wantsDomestic = normKeyword.includes('국내') || normKeyword.includes('domestic');
    const wantsInternational = normKeyword.includes('국제') || normKeyword.includes('international');

    // 공항 전용 랭킹 판정 함수 (의전 기사 차량 특화: 입·출국장 최우선, 지하철역 최하단 배치)
    const getAirportTierAndScore = (p: TmapPoiItem): { tier: number; score: number } => {
      const norm = p.name.replace(/\s+/g, '').toLowerCase();

      // 1) 지하철역 및 지하철 출구: 기사는 차량으로 운행하므로 지하철 시설물은 최하위로 강등
      const isSubway =
        norm.includes('역(') ||
        norm.includes('역[') ||
        norm.includes('지하철') ||
        norm.includes('출구번호') ||
        p.lowerBizName === '지하철역' ||
        p.lowerBizName === '지하철출구번호' ||
        /(?:역)?\d+번출구$/.test(norm) ||
        (norm.includes('역') &&
          (norm.includes('호선') ||
            norm.includes('공항철도') ||
            norm.includes('골드라인') ||
            norm.includes('서해선')));

      if (isSubway) {
        return { tier: 5, score: 999 };
      }

      // 2) 고속도로 IC / TG / 진입로: 최하위권 배치
      const isRoadInfra =
        /(?:ic|tg|교차로|진출|진입)$/i.test(norm) ||
        norm.includes('인터체인지') ||
        norm.includes('톨게이트');
      if (isRoadInfra) {
        return { tier: 4, score: 800 };
      }

      // 3) 주차장 관련 시설: 기사에게는 입/출국장 다음으로 필요할 수 있으나 여객터미널/입출국장보다 아래에 배치
      const isParking = /(?:주차|주차장|주차타워|주차빌딩|발렛|발레|valet|parking)/i.test(norm);
      if (isParking) {
        return { tier: 3, score: 300 };
      }

      // 4) 공항 인근 상업/부대 시설 (호텔, 은행, 우체국, 식당, 카페, 세관, 화물, 창고 등)
      const isAuxiliary =
        /(?:호텔|호스텔|리조트|마트|몰|아울렛|시네마|병원|스위트|게스트하우스|세관|화물|물류|공사|소방대|경찰대|주유소|충전소|정비소|골프|은행|환전|우체국|청사)/i.test(
          norm
        );
      if (isAuxiliary) {
        return { tier: 3, score: 500 };
      }

      // 5) Tier 1: 여객터미널 입국장(도착) 및 출국장(출발) — 기사가 승객을 맞이하거나 배웅하는 핵심 구역
      const isArrival = norm.includes('입국장') || (norm.includes('도착') && !norm.includes('주차'));
      const isDeparture = norm.includes('출국장') || (norm.includes('출발') && !norm.includes('주차'));

      const matchesTerminal1 = wantsT1 && (norm.includes('제1') || norm.includes('1터미널') || norm.includes('t1'));
      const matchesTerminal2 = wantsT2 && (norm.includes('제2') || norm.includes('2터미널') || norm.includes('t2'));
      const matchesDomestic = wantsDomestic && norm.includes('국내');
      const matchesInternational = wantsInternational && norm.includes('국제');

      if (isArrival || isDeparture) {
        let score = 0;
        // 사용자 검색어가 입국/출국을 명시한 경우 해당 장소 가산점
        if (wantsArrival && isArrival) score -= 100;
        if (wantsDeparture && isDeparture) score -= 100;

        // T1 / T2 또는 국내선 / 국제선 명시 시 해당 장소 가산점
        if (matchesTerminal1 || matchesTerminal2 || matchesDomestic || matchesInternational) {
          score -= 50;
        }

        // 별도 터미널 미지정 시 T1(제1터미널) 또는 국내선을 기본 선두에 배치
        if (!wantsT2 && (norm.includes('제1') || norm.includes('1터미널') || norm.includes('t1') || norm.includes('국내선'))) {
          score -= 20;
        }

        // 픽업(입국장) 및 샌딩(출국장) 기본 정렬: 입국장을 출국장보다 한 끗 앞서 배치
        if (wantsArrival || (!wantsDeparture && isArrival)) {
          score -= 10;
        }

        return { tier: 1, score };
      }

      // 6) Tier 2: 여객터미널 본관 및 공항 대표 명칭 (순수 터미널 및 공항 대표 POI)
      const isMainTerminal =
        norm === '인천국제공항제1여객터미널' ||
        norm === '인천국제공항제2여객터미널' ||
        norm === '인천국제공항' ||
        norm === '인천공항' ||
        norm === '김포국제공항국내선' ||
        norm === '김포국제공항국제선' ||
        norm === '김포국제공항' ||
        norm === '김포공항' ||
        norm === '제주국제공항' ||
        norm === '제주공항' ||
        norm === '김해국제공항' ||
        norm === '김해공항' ||
        /(?:국제|여객)?공항(?:제[12]여객터미널|여객터미널|국내선|국제선)$/.test(norm);

      if (isMainTerminal) {
        let score = 100;
        if (matchesTerminal1 || matchesTerminal2 || matchesDomestic || matchesInternational) {
          score -= 50;
        }
        if (!wantsT2 && (norm.includes('제1') || norm.includes('국내선'))) {
          score -= 20;
        }
        return { tier: 2, score };
      }

      // 7) Tier 2.5: 승차존, 게이트, 택시승강장 등 직접 차량 승하차 시설
      const isGateOrDropoff = /(?:gate|게이트|승차존|승강장|인도장)/i.test(norm);
      if (isGateOrDropoff) {
        return { tier: 2, score: 180 };
      }

      // 8) 기타 공항 일반 POI
      return { tier: 3, score: 400 };
    };

    // 일반 지하철 역사 및 출구 판정 함수 (비공항 질의 전용)
    const isSubwayStationMain = (p: TmapPoiItem) => {
      const norm = p.name.replace(/\s+/g, '').toLowerCase();
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
      // [Case A: 공항 검색인 경우]
      if (isAirportQuery) {
        const itemA = getAirportTierAndScore(a);
        const itemB = getAirportTierAndScore(b);

        if (itemA.tier !== itemB.tier) {
          return itemA.tier - itemB.tier;
        }

        if (itemA.score !== itemB.score) {
          return itemA.score - itemB.score;
        }

        return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
      }

      // [Case B: 일반 POI 및 지하철역 검색인 경우 기존 랭킹 유지]
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

      // 3순위: 일반 POI
      const normA = a.name.replace(/\s+/g, '').toLowerCase();
      const normB = b.name.replace(/\s+/g, '').toLowerCase();
      const addrA = a.address.replace(/\s+/g, '').toLowerCase();
      const addrB = b.address.replace(/\s+/g, '').toLowerCase();

      const getTier = (normName: string, normAddr: string) => {
        if (normName === normKeyword || normName.startsWith(normKeyword)) {
          return 1;
        }
        if (normName.includes(normKeyword)) {
          return 2;
        }
        if (tokens.every((t) => normName.includes(t)) || normAddr.includes(normKeyword)) {
          return 3;
        }
        return 4;
      };

      const tierA = getTier(normA, addrA);
      const tierB = getTier(normB, addrB);

      if (tierA !== tierB) {
        return tierA - tierB;
      }

      if (tierA === 1) {
        const isAuxA = /(?:주차장|전기차충전소|정문|후문|부설)/.test(a.name);
        const isAuxB = /(?:주차장|전기차충전소|정문|후문|부설)/.test(b.name);
        if (!isAuxA && isAuxB) return -1;
        if (isAuxA && !isAuxB) return 1;

        if (a.originalIndex === 0 && !isAuxA) return -1;
        if (b.originalIndex === 0 && !isAuxB) return 1;

        const isExactA = normA === normKeyword;
        const isExactB = normB === normKeyword;
        if (isExactA && !isExactB && Math.abs((a.originalIndex ?? 0) - (b.originalIndex ?? 0)) < 5) return -1;
        if (!isExactA && isExactB && Math.abs((a.originalIndex ?? 0) - (b.originalIndex ?? 0)) < 5) return 1;

        if ((a.originalIndex ?? 0) !== (b.originalIndex ?? 0)) {
          return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
        }

        const diffA = Math.abs(normA.length - normKeyword.length);
        const diffB = Math.abs(normB.length - normKeyword.length);
        if (diffA !== diffB) return diffA - diffB;
      }

      if (tierA === 2) {
        const diffA = Math.abs(normA.length - normKeyword.length);
        const diffB = Math.abs(normB.length - normKeyword.length);
        if (diffA !== diffB) return diffA - diffB;
      }

      return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
    });

    // 공항 검색의 경우 정렬 후 중복 명칭(예: TMAP의 좌표만 미세하게 다른 동일 입·출국장)을 단일화합니다.
    let finalPois = pois;
    if (isAirportQuery) {
      const seenAirportNames = new Set<string>();
      finalPois = pois.filter((p) => {
        const normName = p.name.replace(/\s+/g, '').toLowerCase();
        if (seenAirportNames.has(normName)) {
          return false;
        }
        seenAirportNames.add(normName);
        return true;
      });
    }

    const cleanedPois = finalPois.map(({ id, name, address, lat, lng }) => ({
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('TMAP POI Search error:', message);
    return NextResponse.json({ pois: [] });
  }
}
