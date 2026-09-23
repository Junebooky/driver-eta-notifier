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
 * TMAP 통합 POI 검색을 수행하여 장소명으로부터 도로명 주소 및 좌표를 반환합니다.
 * @param keyword 검색 장소명 (예: '안다즈 서울 강남', '시그니엘 서울')
 * @returns ResolvedPlaceLocation 또는 검색 실패 시 null
 */
export async function searchTmapPoi(keyword: string): Promise<ResolvedPlaceLocation | null> {
  const cleanKeyword = (keyword || '').trim();
  if (!cleanKeyword) return null;

  const apiKey = process.env.TMAP_API_KEY || process.env.NEXT_PUBLIC_TMAP_API_KEY;
  if (!apiKey || apiKey === 'your_tmap_api_key') {
    console.warn('[TMAP POI] TMAP API Key is missing or invalid.');
    return null;
  }

  try {
    const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(
      cleanKeyword
    )}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1`;

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
      console.warn(`[TMAP POI] Request failed for "${cleanKeyword}" with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    const poi = data?.searchPoiInfo?.pois?.poi?.[0];

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
      name: poi.name || cleanKeyword,
      roadAddress: finalAddress,
      jibunAddress: jibun || undefined,
      lat,
      lng,
    };
  } catch (error: any) {
    // 안전한 에러 핸들링: 예외를 던지지 않고 null 반환
    console.warn(`[TMAP POI] Error searching POI for "${cleanKeyword}":`, error?.message || error);
    return null;
  }
}
