/**
 * TMAP POI Search & Geocoding Service (services/tmapService.ts)
 * 
 * 배차표 파싱 및 스케줄 관리 시 미등록 거점의 도로명 주소 및 내비게이션 좌표를
 * TMAP 통합 POI 검색 API를 통해 자동 보정하는 서비스 모듈입니다.
 */

export interface ResolvedPlaceLocation {
  name: string;
  roadAddress: string;     // 도로명 주소 (예: "서울특별시 강남구 논현로 854")
  jibunAddress?: string;    // 지번 주소 백업
  lat: number;              // WGS84 위도 (noorLat 또는 frontLat)
  lng: number;              // WGS84 경도 (noorLon 또는 frontLon)
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

/**
 * TMAP 통합 POI 검색을 수행하여 장소명으로부터 도로명 주소 및 좌표를 반환합니다.
 * @param keyword 검색 장소명 (예: '안다즈 서울 강남', '시그니엘 서울', '포시즌스호텔')
 * @param centerLat 기준 중심 위도 (기본값: 서울 시청 37.5665)
 * @param centerLon 기준 중심 경도 (기본값: 서울 시청 126.9780)
 * @returns ResolvedPlaceLocation 또는 검색 실패 시 null
 */
export async function searchTmapPoi(
  keyword: string,
  centerLat: number = 37.5665,
  centerLon: number = 126.9780
): Promise<ResolvedPlaceLocation | null> {
  const cleanKeyword = (keyword || '').trim();
  if (!cleanKeyword) return null;

  const apiKey = process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY;
  if (!apiKey || apiKey === 'your_tmap_api_key') {
    console.warn('[TMAP POI] TMAP API Key is missing or invalid.');
    return null;
  }

  // 1단계: 검색어 띄어쓰기 형태소 정규화
  const normalizedKeyword = normalizeSearchKeyword(cleanKeyword);

  const fetchSinglePoi = async (searchKw: string): Promise<any | null> => {
    try {
      const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(
        searchKw
      )}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1&centerLat=${centerLat}&centerLon=${centerLon}`;

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

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data?.searchPoiInfo?.pois?.poi?.[0] || null;
    } catch (err) {
      return null;
    }
  };

  try {
    let poi = await fetchSinglePoi(normalizedKeyword);

    // 2단계 다중 질의 폴백: 결과 부재 시 원본 검색어 및 핵심 키워드(앞 1~2단어)로 백그라운드 재질의
    if (!poi && normalizedKeyword !== cleanKeyword) {
      poi = await fetchSinglePoi(cleanKeyword);
    }

    if (!poi) {
      const words = normalizedKeyword.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        const fallbackTarget = words.slice(0, 2).join(' ');
        if (fallbackTarget && fallbackTarget !== normalizedKeyword) {
          poi = await fetchSinglePoi(fallbackTarget);
        }
      }
      if (!poi && words.length >= 1 && words[0].length >= 2 && words[0] !== normalizedKeyword) {
        poi = await fetchSinglePoi(words[0]);
      }
    }

    if (!poi) {
      return null;
    }

    // 1. 도로명 주소 우선 추출
    const roadAddr = poi.newAddressList?.newAddress?.[0]?.fullAddressRoad;

    // 2. 지번 주소 추출
    const jibun = [
      poi.upperAddrName,
      poi.middleAddrName,
      poi.lowerAddrName,
      poi.detailAddrName,
    ].filter(Boolean).join(' ').trim();

    const finalAddress = (roadAddr || jibun || '').trim();

    // 3. 좌표 파싱 (출입구 좌표 frontLat 우선, 없으면 중심점 noorLat)
    const rawLat = poi.frontLat || poi.noorLat;
    const rawLng = poi.frontLon || poi.noorLon;
    const lat = parseFloat(rawLat);
    const lng = parseFloat(rawLng);

    if (isNaN(lat) || isNaN(lng)) {
      return null;
    }

    return {
      name: poi.name || normalizedKeyword,
      roadAddress: finalAddress,
      jibunAddress: jibun || undefined,
      lat,
      lng,
    };
  } catch (error: any) {
    console.warn(`[TMAP POI] Error searching POI for "${cleanKeyword}":`, error?.message || error);
    return null;
  }
}
