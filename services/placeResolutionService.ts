import { supabaseAdmin } from '@/lib/supabase/server';
import { DbOrgPlaceRow } from '@/types';

export interface PlaceCandidate {
  name: string;
  road_address: string;
  lat: number;
  lng: number;
  lowerBizName?: string;
  isVerified?: boolean;
}

export interface PlaceResolutionResult {
  status: 'verified' | 'needs_confirmation' | 'unresolved';
  source: 'memory' | 'tmap_candidates' | 'none';
  query: string;
  place?: {
    name: string;
    road_address: string;
    lat: number;
    lng: number;
    entry_gate_notes?: string;
    aliases?: string[];
  };
  candidates?: PlaceCandidate[];
  message?: string;
}

// Built-in seed memory fallback (ensures instant zero-network resolution for known protocol destinations)
export const DEFAULT_VERIFIED_PLACES: Omit<DbOrgPlaceRow, 'id' | 'org_id' | 'created_at' | 'updated_at'>[] = [
  {
    name: '조선팰리스 서울 강남',
    aliases: ['조선팰리스', '조선 팰리스', 'Josun Palace', '역삼 조선팰리스', '센터필드 조선팰리스'],
    road_address: '서울 강남구 테헤란로 231 센터필드 웨스트타워',
    lat: 37.5042,
    lng: 127.0425,
    entry_gate_notes: '지하 1층 드롭오프 존 진입 후 의전 발렛 구역 정차',
    verified_by: 'SYSTEM_SEED',
  },
  {
    name: '서울신라호텔',
    aliases: ['신라호텔', '서울 신라', 'Shilla Hotel', '장충동 신라호텔'],
    road_address: '서울 중구 동호로 249',
    lat: 37.5562,
    lng: 127.0051,
    entry_gate_notes: '영빈관 입구 통과 후 메인 로비 정문 드롭오프 존',
    verified_by: 'SYSTEM_SEED',
  },
  {
    name: '인천국제공항 제2여객터미널',
    aliases: ['인천공항 T2', '인천공항 2터미널', '인천국제공항 T2', 'ICN T2'],
    road_address: '인천 중구 제2터미널대로 446',
    lat: 37.4688,
    lng: 126.4335,
    entry_gate_notes: '3층 출국장 3번 게이트 앞 의전 정차 구역',
    verified_by: 'SYSTEM_SEED',
  },
  {
    name: '인천국제공항 제1여객터미널',
    aliases: ['인천공항 T1', '인천공항 1터미널', '인천국제공항 T1', 'ICN T1'],
    road_address: '인천 중구 공항로 272',
    lat: 37.4495,
    lng: 126.4507,
    entry_gate_notes: '3층 출국장 7번 게이트 앞 의전 정차 구역',
    verified_by: 'SYSTEM_SEED',
  },
  {
    name: '심텍 본사 (오창)',
    aliases: ['심텍', '심텍 본사', '심텍오창', 'Simmtech HQ', '심텍 오창공장'],
    road_address: '충북 청주시 청원구 오창읍 양청3길 39',
    lat: 36.7118,
    lng: 127.4243,
    entry_gate_notes: '정문 경비실에서 의전 차량 사전 등록 확인 후 VIP 주차구역 안내 수령',
    verified_by: 'SYSTEM_SEED',
  },
];

/**
 * Normalize place string for resilient lookup
 */
export function normalizePlaceQuery(query: string): string {
  return query
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Match a raw query against verified place memory
 */
export function matchPlaceInMemory(
  query: string,
  placesList: (DbOrgPlaceRow | typeof DEFAULT_VERIFIED_PLACES[number])[]
): DbOrgPlaceRow | typeof DEFAULT_VERIFIED_PLACES[number] | null {
  const cleanQ = normalizePlaceQuery(query);
  if (!cleanQ) return null;

  for (const place of placesList) {
    const cleanName = normalizePlaceQuery(place.name);
    if (cleanName === cleanQ) return place;

    if (place.aliases && Array.isArray(place.aliases)) {
      for (const alias of place.aliases) {
        const cleanAlias = normalizePlaceQuery(alias);
        if (cleanAlias === cleanQ) return place;
        // Substring check for compound queries like "조선팰리스 호텔" vs "조선팰리스"
        if (cleanQ.includes(cleanAlias) || cleanAlias.includes(cleanQ)) {
          if (cleanAlias.length >= 3) return place;
        }
      }
    }
  }

  return null;
}

/**
 * Query TMAP POI candidate search
 */
export async function searchTmapCandidates(keyword: string): Promise<PlaceCandidate[]> {
  try {
    const apiKey = process.env.TMAP_API_KEY;
    if (!apiKey || apiKey === 'your_tmap_api_key') {
      console.warn('[PlaceResolution] TMAP_API_KEY not configured for POI search');
      return [];
    }

    const encodedKeyword = encodeURIComponent(keyword.trim());
    const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodedKeyword}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=5`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        appKey: apiKey,
      },
    });

    if (!res.ok) {
      console.warn(`[PlaceResolution] TMAP POI search returned status ${res.status}`);
      return [];
    }

    const data = await res.json();
    const pois = data?.searchPoiInfo?.pois?.poi;
    if (!Array.isArray(pois)) return [];

    return pois.map((poi: {
      name?: string;
      upperAddrName?: string;
      middleAddrName?: string;
      lowerAddrName?: string;
      detailAddrName?: string;
      roadName?: string;
      firstBuildNo?: string;
      noorLat?: string;
      noorLon?: string;
      lowerBizName?: string;
    }) => {
      const roadAddress = poi.roadName
        ? `${poi.upperAddrName || ''} ${poi.middleAddrName || ''} ${poi.roadName} ${poi.firstBuildNo || ''}`.trim()
        : `${poi.upperAddrName || ''} ${poi.middleAddrName || ''} ${poi.lowerAddrName || ''} ${poi.detailAddrName || ''}`.trim();

      return {
        name: poi.name || keyword,
        road_address: roadAddress,
        lat: parseFloat(poi.noorLat || '0'),
        lng: parseFloat(poi.noorLon || '0'),
        lowerBizName: poi.lowerBizName,
        isVerified: false,
      };
    });
  } catch (err) {
    console.error('[PlaceResolution] Failed to search TMAP POI candidates:', err);
    return [];
  }
}

/**
 * End-to-end place resolution
 * Step 1: Check Org Place Memory
 * Step 2: If not in memory, query TMAP POI candidate search
 * Step 3: Return result with explicit verification state
 */
export async function resolvePlaceQuery(query: string, orgId?: string): Promise<PlaceResolutionResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      status: 'unresolved',
      source: 'none',
      query,
      message: '장소 검색어가 비어 있습니다.',
    };
  }

  // 1. Check Supabase org_places
  let dbPlaces: DbOrgPlaceRow[] = [];
  try {
    let q = supabaseAdmin.from('org_places').select('*');
    if (orgId) {
      q = q.eq('org_id', orgId);
    }
    const { data, error } = await q;
    if (!error && Array.isArray(data)) {
      dbPlaces = data;
    }
  } catch (err) {
    console.warn('[PlaceResolution] Notice querying org_places from Supabase:', err);
  }

  const combinedMemory = [...dbPlaces, ...DEFAULT_VERIFIED_PLACES];
  const memoryMatch = matchPlaceInMemory(trimmed, combinedMemory);

  if (memoryMatch) {
    return {
      status: 'verified',
      source: 'memory',
      query: trimmed,
      place: {
        name: memoryMatch.name,
        road_address: memoryMatch.road_address,
        lat: memoryMatch.lat,
        lng: memoryMatch.lng,
        entry_gate_notes: memoryMatch.entry_gate_notes || undefined,
        aliases: memoryMatch.aliases || [],
      },
    };
  }

  // 2. Not in memory: Query TMAP Candidates
  const candidates = await searchTmapCandidates(trimmed);

  if (candidates.length > 0) {
    return {
      status: 'needs_confirmation',
      source: 'tmap_candidates',
      query: trimmed,
      candidates,
      message: `검증된 장소 메모리에 없습니다. TMAP 검색 결과 ${candidates.length}건 중 정확한 위치와 핀을 확정해 주세요.`,
    };
  }

  // 3. Unresolved
  return {
    status: 'unresolved',
    source: 'none',
    query: trimmed,
    message: '일치하는 장소를 찾을 수 없습니다. 도로명 주소 또는 건물을 직접 입력해 주세요.',
  };
}

/**
 * Save confirmed place into Org Place Memory
 */
export async function saveConfirmedPlace(data: {
  org_id?: string;
  name: string;
  aliases?: string[];
  road_address: string;
  lat: number;
  lng: number;
  entry_gate_notes?: string;
  verified_by?: string;
}): Promise<{ ok: boolean; place?: DbOrgPlaceRow; error?: string }> {
  try {
    const org_id = data.org_id || '00000000-0000-0000-0000-000000000001';
    const nowIso = new Date().toISOString();

    const payload = {
      org_id,
      name: data.name,
      aliases: data.aliases || [data.name],
      road_address: data.road_address,
      lat: data.lat,
      lng: data.lng,
      entry_gate_notes: data.entry_gate_notes || null,
      verified_by: data.verified_by || 'HQ_MANAGER',
      verified_at: nowIso,
      updated_at: nowIso,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from('org_places')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.warn('[PlaceResolution] Notice inserting org_place:', error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true, place: inserted };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: message };
  }
}
