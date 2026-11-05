/**
 * Unified TMAP Place Search Engine (Server + Client)
 * Single source of truth for query sanitization, keyword normalization,
 * canonical VIP airport terminal injection, and executive chauffeur POI ranking.
 */

export const TMAP_SEARCH_ENGINE_VERSION = '20261105-v3';

export interface TmapPoiItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  originalIndex?: number;
  lowerBizName?: string;
}

/**
 * Sanitize query: strip dong/ho/floor patterns (e.g. 101동, 102호, 3층) for robust building-level retrieval
 */
export function sanitizeSearchQuery(query: string): string {
  const detailPattern = /(?<=\s|^)(?:[0-9]+동|[0-9]+호|[0-9B]+층|[A-Za-z]동)(?=\s|$)/g;
  const cleanQuery = query
    .replace(detailPattern, '')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanQuery || query.trim();
}

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

export interface CanonicalAirportPoi {
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

export const CANONICAL_AIRPORT_POIS: CanonicalAirportPoi[] = [
  // 1. 인천국제공항 여객터미널 본관 (최우선 노출)
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

  // 2. 인천국제공항 제1·제2여객터미널 입·출국장
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
    id: 'apt-icn-main',
    name: '인천국제공항',
    address: '인천 중구 공항로 272',
    lat: 37.4559576,
    lng: 126.44501723,
    type: 'incheon',
    isArrival: false,
    isDeparture: false,
  },

  // 3. 김포국제공항 국내선·국제선 본관 (최우선 노출)
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

  // 4. 김포국제공항 국내선·국제선 입·출국장
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

export function isAirportSearchQuery(normKeyword: string): boolean {
  return (
    (normKeyword.includes('공항') && !normKeyword.includes('공항동')) ||
    normKeyword.includes('airport') ||
    normKeyword.includes('icn') ||
    normKeyword.includes('gmp') ||
    normKeyword.includes('cju') ||
    normKeyword.includes('입국장') ||
    normKeyword.includes('출국장')
  );
}

export function getMatchingCanonicalAirportPois(normQuery: string): TmapPoiItem[] {
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

/**
 * Deterministic TMAP POI Ranking & Canonical Airport Prioritization
 * Used identically on both Server and Client so all search inputs share the exact same ranking engine.
 */
export function rankAndDedupeTmapPois(
  inputPois: TmapPoiItem[],
  rawKeyword: string
): TmapPoiItem[] {
  const cleanKeyword = sanitizeSearchQuery(rawKeyword);
  const baseKeyword = cleanKeyword.length >= 2 ? cleanKeyword : rawKeyword.trim();
  const keyword = normalizeSearchKeyword(baseKeyword);
  const normKeyword = keyword.replace(/\s+/g, '').toLowerCase();
  const isAirportQuery = isAirportSearchQuery(normKeyword);

  const seenMap = new Set<string>();
  const pois: TmapPoiItem[] = [];

  if (isAirportQuery) {
    const canonicals = getMatchingCanonicalAirportPois(normKeyword);
    canonicals.forEach((c) => {
      const dedupeKey = `${c.name.replace(/\s+/g, '')}_${c.lat.toFixed(3)}_${c.lng.toFixed(3)}`;
      if (!seenMap.has(dedupeKey)) {
        seenMap.add(dedupeKey);
        pois.push({ ...c });
      }
    });
  }

  inputPois.forEach((item, idx) => {
    let name = (item.name || keyword).replace(/\[(.*?)\]/g, ' ($1)').trim();
    name = name
      .replace(/김포국제공항국내선/g, '김포국제공항 국내선')
      .replace(/김포국제공항국제선/g, '김포국제공항 국제선')
      .replace(/국내선출국장/g, '국내선 출국장')
      .replace(/국내선입국장/g, '국내선 입국장')
      .replace(/국제선출국장/g, '국제선 출국장')
      .replace(/국제선입국장/g, '국제선 입국장')
      .replace(/\s+/g, ' ')
      .trim();

    const lat = typeof item.lat === 'number' && !isNaN(item.lat) ? item.lat : 37.5665;
    const lng = typeof item.lng === 'number' && !isNaN(item.lng) ? item.lng : 126.978;
    const dedupeKey = `${name.replace(/\s+/g, '')}_${lat.toFixed(3)}_${lng.toFixed(3)}`;

    if (!seenMap.has(dedupeKey)) {
      seenMap.add(dedupeKey);
      pois.push({
        id: item.id || `poi_${idx}`,
        name,
        address: item.address || '주소 정보 없음',
        lat,
        lng,
        originalIndex: typeof item.originalIndex === 'number' ? item.originalIndex : idx,
        lowerBizName: item.lowerBizName || '',
      });
    }
  });

  const baseStationKeyword = normKeyword.endsWith('역') ? normKeyword.slice(0, -1) : normKeyword;
  const stationKeyword = normKeyword.endsWith('역') ? normKeyword : `${normKeyword}역`;
  const tokens = keyword.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());

  const wantsArrival = normKeyword.includes('입국') || normKeyword.includes('arrival') || normKeyword.includes('도착');
  const wantsDeparture = normKeyword.includes('출국') || normKeyword.includes('departure') || normKeyword.includes('출발');
  const wantsT1 = /t1|1터미널|제1|1터/i.test(normKeyword);
  const wantsT2 = /t2|2터미널|제2|2터/i.test(normKeyword);
  const wantsDomestic = normKeyword.includes('국내') || normKeyword.includes('domestic');
  const wantsInternational = normKeyword.includes('국제선') || normKeyword.includes('international');

  const getAirportTierAndScore = (p: TmapPoiItem): { tier: number; score: number } => {
    const norm = p.name.replace(/\s+/g, '').toLowerCase();

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

    const isRoadInfra =
      /(?:ic|tg|교차로|진출|진입)$/i.test(norm) ||
      norm.includes('인터체인지') ||
      norm.includes('톨게이트');
    if (isRoadInfra) {
      return { tier: 4, score: 800 };
    }

    const isParking = /(?:주차|주차장|주차타워|주차빌딩|발렛|발레|valet|parking)/i.test(norm);
    if (isParking) {
      return { tier: 3, score: 300 };
    }

    const isAuxiliary =
      /(?:호텔|호스텔|리조트|마트|몰|아울렛|시네마|병원|스위트|게스트하우스|세관|화물|물류|공사|소방대|경찰대|주유소|충전소|정비소|골프|은행|환전|우체국|청사)/i.test(
        norm
      );
    if (isAuxiliary) {
      return { tier: 3, score: 500 };
    }

    const isArrival = norm.includes('입국장') || (norm.includes('도착') && !norm.includes('주차'));
    const isDeparture = norm.includes('출국장') || (norm.includes('출발') && !norm.includes('주차'));

    const matchesTerminal1 = wantsT1 && (norm.includes('제1') || norm.includes('1터미널') || norm.includes('t1'));
    const matchesTerminal2 = wantsT2 && (norm.includes('제2') || norm.includes('2터미널') || norm.includes('t2'));
    const matchesDomestic = wantsDomestic && norm.includes('국내');
    const matchesInternational = wantsInternational && norm.includes('국제선');

    const isSpecificMainTerminal =
      norm === '인천국제공항제1여객터미널' ||
      norm === '인천국제공항제2여객터미널' ||
      norm === '김포국제공항국내선' ||
      norm === '김포국제공항국제선' ||
      /(?:국제|여객)?공항(?:제[12]여객터미널|국내선|국제선)$/.test(norm);

    const isRootAirport =
      norm === '인천국제공항' ||
      norm === '인천공항' ||
      norm === '김포국제공항' ||
      norm === '김포공항' ||
      norm === '제주국제공항' ||
      norm === '제주공항' ||
      norm === '김해국제공항' ||
      norm === '김해공항';

    // 1순위(Tier 1): 제1여객터미널, 제2여객터미널 / 국내선, 국제선 본관 최우선 노출
    if (isSpecificMainTerminal && !wantsArrival && !wantsDeparture) {
      let score = -100;
      if (matchesTerminal1 || matchesTerminal2 || matchesDomestic || matchesInternational) {
        score -= 50;
      }
      if (!wantsT2 && !wantsInternational && (norm.includes('제1') || norm.includes('국내선'))) {
        score -= 20;
      }
      return { tier: 1, score };
    }

    if (isArrival || isDeparture) {
      let score = 0;
      if (wantsArrival && isArrival) score -= 100;
      if (wantsDeparture && isDeparture) score -= 100;

      if (matchesTerminal1 || matchesTerminal2 || matchesDomestic || matchesInternational) {
        score -= 50;
      }

      if (!wantsT2 && !wantsInternational && (norm.includes('제1') || norm.includes('1터미널') || norm.includes('t1') || norm.includes('국내선'))) {
        score -= 20;
      }

      if (wantsArrival || (!wantsDeparture && isArrival)) {
        score -= 10;
      }

      return { tier: wantsArrival || wantsDeparture ? 1 : 2, score };
    }

    if (isSpecificMainTerminal || isRootAirport) {
      let score = 100;
      if (matchesTerminal1 || matchesTerminal2 || matchesDomestic || matchesInternational) {
        score -= 50;
      }
      if (!wantsT2 && !wantsInternational && (norm.includes('제1') || norm.includes('국내선'))) {
        score -= 20;
      }
      return { tier: 2, score };
    }

    const isGateOrDropoff = /(?:gate|게이트|승차존|승강장|인도장)/i.test(norm);
    if (isGateOrDropoff) {
      return { tier: 2, score: 180 };
    }

    return { tier: 3, score: 400 };
  };

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

    const isStationA = isSubwayStationMain(a);
    const isStationB = isSubwayStationMain(b);

    if (isStationA && !isStationB) return -1;
    if (!isStationA && isStationB) return 1;
    if (isStationA && isStationB) {
      return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
    }

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

    const userWantsAtm = /atm|현금|은행|cd기/i.test(normKeyword);
    const userWantsBus = /버스|정류장|정류소/i.test(normKeyword);
    const userWantsParking = /주차|발렛/i.test(normKeyword);

    const scorePoi = (p: TmapPoiItem, originalIndex: number): number => {
      const norm = p.name.replace(/\s+/g, '').toLowerCase();
      const biz = (p.lowerBizName || '').toLowerCase();

      const isAtm = !userWantsAtm && (/atm|현금인출기|365|cd기/i.test(norm) || biz === 'atm');
      const isBus = !userWantsBus && (/버스정류장|정류소|정류장/i.test(norm) || biz.includes('정류'));
      const isParking = !userWantsParking && (/주차장|gate|출차|입차/i.test(norm) || biz.includes('주차'));

      if (isAtm) return 9000 + originalIndex;
      if (isBus) return 8000 + originalIndex;
      if (isParking) return 5000 + originalIndex;

      let score = 0;

      if (norm === normKeyword) {
        score -= 500;
      } else if (tokens[0] && norm.startsWith(tokens[0])) {
        score -= 300;
      }

      const allTokensMatch =
        tokens.length > 0 &&
        tokens.every(
          (t) => norm.includes(t) || (p.address && p.address.toLowerCase().includes(t))
        );
      if (allTokensMatch) {
        score -= 200;
      }

      if (
        /호텔|숙박|리조트|컨벤션|빌딩|터미널|호스피탈리티/.test(biz) ||
        /(?:호텔|리조트|본관|타워)$/.test(norm)
      ) {
        score -= 100;
      }

      score += originalIndex * 10;

      return score;
    };

    const scoreA = scorePoi(a, a.originalIndex ?? 0);
    const scoreB = scorePoi(b, b.originalIndex ?? 0);

    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }

    return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
  });

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

  return finalPois.map(({ id, name, address, lat, lng }) => ({
    id,
    name,
    address,
    lat,
    lng,
  }));
}

// Unified Client-side In-Memory Cache across all modals and tabs
const unifiedClientSearchCache = new Map<string, TmapPoiItem[]>();

export function clearTmapClientSearchCache(): void {
  unifiedClientSearchCache.clear();
}

export function getCachedTmapPoisClient(
  rawQuery: string,
  lat: number = 37.5665,
  lng: number = 126.978
): TmapPoiItem[] | null {
  const cleanQuery = sanitizeSearchQuery(rawQuery);
  if (cleanQuery.length < 2) return null;
  const cacheKey = `${TMAP_SEARCH_ENGINE_VERSION}:${cleanQuery}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  return unifiedClientSearchCache.get(cacheKey) || null;
}

/**
 * Unified Client-side TMAP POI Search Function
 * Used by HqPlaceSearchInput, LocationSearchModal, CustomPresetModal, AddScheduleModal, RoadviewModal
 */
export async function searchTmapPoisClient(
  rawQuery: string,
  options?: {
    lat?: number;
    lng?: number;
    signal?: AbortSignal;
  }
): Promise<TmapPoiItem[]> {
  const cleanQuery = sanitizeSearchQuery(rawQuery);
  if (cleanQuery.length < 2) {
    return [];
  }

  const lat = options?.lat ?? 37.5665;
  const lng = options?.lng ?? 126.978;
  const cacheKey = `${TMAP_SEARCH_ENGINE_VERSION}:${cleanQuery}:${lat.toFixed(4)}:${lng.toFixed(4)}`;

  if (unifiedClientSearchCache.has(cacheKey)) {
    return unifiedClientSearchCache.get(cacheKey)!;
  }

  const res = await fetch(
    `/api/search?keyword=${encodeURIComponent(cleanQuery)}&lat=${lat}&lng=${lng}&v=${TMAP_SEARCH_ENGINE_VERSION}`,
    {
      cache: 'no-store',
      signal: options?.signal,
    }
  );

  if (!res.ok) {
    throw new Error('TMAP 검색 서버 응답 실패');
  }

  const data = await res.json();
  const rawList = Array.isArray(data) ? data : data.pois || data.places || [];
  const mapped: TmapPoiItem[] = rawList
    .map((poi: any, idx: number) => ({
      id: String(poi.id || `poi_${idx}`),
      name: poi.name || poi.title || '',
      address: poi.address || poi.roadAddress || poi.fullAddress || '',
      lat: typeof poi.lat === 'number' ? poi.lat : parseFloat(poi.lat || poi.noorLat || poi.frontLat),
      lng: typeof poi.lng === 'number' ? poi.lng : parseFloat(poi.lng || poi.noorLon || poi.frontLon),
      originalIndex: idx,
      lowerBizName: poi.lowerBizName || '',
    }))
    .filter((p: TmapPoiItem) => p.name && !isNaN(p.lat) && !isNaN(p.lng));

  // Enforce deterministic ranking & canonical airport priority on the client as well
  const ranked = rankAndDedupeTmapPois(mapped, cleanQuery);
  unifiedClientSearchCache.set(cacheKey, ranked);
  return ranked;
}
