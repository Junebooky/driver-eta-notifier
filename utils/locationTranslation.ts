import type { LocationPreset, DriverProfile } from '@/types';
import type {
  PlaceTranslationRecord,
  PlaceTranslationRequest,
  GenerateEnglishReportParams,
} from '@/types/reportTranslation';

/**
 * Company-approved English aliases dictionary
 * Priority 1 in Hybrid Translation
 */
export const COMPANY_APPROVED_ALIASES: Record<string, string> = {
  // Preset IDs
  icn_t1: 'Incheon Airport T1',
  icn_t2: 'Incheon Airport T2',
  josun_palace: 'Josun Palace',
  signiel_seoul: 'Signiel Seoul',
  inje_hotel: 'Inje Speedium Hotel',
  inje_paddock: 'Inje Paddock',
  hanam_misa_return: 'Return Point (Hanam)',

  // Airport Names
  '인천공항 t1': 'Incheon Airport T1',
  '인천공항t1': 'Incheon Airport T1',
  '인천국제공항 제1여객터미널': 'Incheon Airport T1',
  '인천국제공항제1여객터미널': 'Incheon Airport T1',
  '인천공항 제1여객터미널': 'Incheon Airport T1',
  '인천공항 1터미널': 'Incheon Airport T1',
  '인천공항1터미널': 'Incheon Airport T1',

  '인천공항 t2': 'Incheon Airport T2',
  '인천공항t2': 'Incheon Airport T2',
  '인천국제공항 제2여객터미널': 'Incheon Airport T2',
  '인천국제공항제2여객터미널': 'Incheon Airport T2',
  '인천공항 제2여객터미널': 'Incheon Airport T2',
  '인천공항 2터미널': 'Incheon Airport T2',
  '인천공항2터미널': 'Incheon Airport T2',

  '김포공항': 'Gimpo Airport',
  '김포국제공항': 'Gimpo Airport',
  '김포공항 국내선': 'Gimpo Airport Domestic',
  '김포공항 국제선': 'Gimpo Airport International',

  // Hotels
  '조선팰리스': 'Josun Palace',
  '조선팰리스 강남': 'Josun Palace',
  '조선팰리스 서울 강남': 'Josun Palace',
  '조선 팰리스 강남': 'Josun Palace',
  '조선 팰리스': 'Josun Palace',
  '메리어트 호텔': 'Marriott Hotel',
  'jw 메리어트': 'JW Marriott',
  'jw 메리어트 호텔': 'JW Marriott Hotel',
  'jw 메리어트 동대문': 'JW Marriott Dongdaemun',
  '메리어트': 'Marriott Hotel',
  '시그니엘 서울': 'Signiel Seoul',
  '시그니엘': 'Signiel Seoul',
  '롯데월드타워': 'Lotte World Tower',
  '포시즌스 호텔': 'Four Seasons Hotel',
  '포시즌스 서울': 'Four Seasons Hotel',
  '포시즌스': 'Four Seasons Hotel',
  '신라호텔': 'The Shilla Seoul',
  '서울신라호텔': 'The Shilla Seoul',
  '그랜드 하얏트 서울': 'Grand Hyatt Seoul',
  '그랜드 하얏트': 'Grand Hyatt Seoul',
  '파크 하얏트 서울': 'Park Hyatt Seoul',
  '파크 하얏트': 'Park Hyatt Seoul',
  '안다즈 서울 강남': 'Andaz Seoul Gangnam',
  '안다즈': 'Andaz Seoul Gangnam',
  '콘래드 서울': 'Conrad Seoul',
  '콘래드 호텔': 'Conrad Seoul',
  '콘래드': 'Conrad Seoul',
  '인터컨티넨탈 코엑스': 'InterContinental COEX',
  '그랜드 인터컨티넨탈 서울 파르나스': 'Grand InterContinental Parnas',
  '인터컨티넨탈 파르나스': 'Grand InterContinental Parnas',
  '웨스틴 조선 서울': 'Westin Chosun Seoul',
  '웨스틴 조선': 'Westin Chosun Seoul',
  '파라스파라 서울': 'Paraspara Seoul',
  '인제스피디움 호텔': 'Inje Speedium Hotel',
  '인제 패독': 'Inje Paddock',
  '인제스피디움 피트/패독': 'Inje Paddock',

  // Stations
  '서울역': 'Seoul Station',
  '서울역 ktx': 'Seoul Station',
  '수서역': 'Suseo Station',
  '수서역 srt': 'Suseo Station',
  '용산역': 'Yongsan Station',
  '광명역': 'Gwangmyeong Station',
  '대전역': 'Daejeon Station',
  '동대구역': 'Dongdaegu Station',
  '부산역': 'Busan Station',
  '광주송정역': 'Gwangjusongjeong Station',

  // Offices & VIP Key Districts
  '판교 오피스': 'Pangyo Office',
  '판교': 'Pangyo Office',
  '판교 테크노밸리': 'Pangyo Techno Valley',
  '카카오 판교아지트': 'Kakao Pangyo Agit',
  '네이버 1784': 'NAVER 1784',
  '코엑스': 'COEX',
  '삼성동 코엑스': 'COEX',
  '강남역': 'Gangnam Station',
  '여의도': 'Yeouido',
  '광화문': 'Gwanghwamun',
  '세종청사': 'Sejong Government Complex',
  '정부세종청사': 'Sejong Government Complex',
  '해운대': 'Haeundae',

  // Presets & Defaults
  '현 위치': 'Current Location',
  '현위치': 'Current Location',
  '차량 반납 (하남/미사)': 'Return Point (Hanam)',
  '차량 반납지 (하남/미사)': 'Return Point (Hanam)',
  '차량 반납': 'Return Point (Hanam)',
};

/**
 * Storage key for client-side on-demand cache
 */
const CACHE_STORAGE_KEY = 'vip_place_translation_cache_v1';
const MAX_CACHE_ENTRIES = 500;

// In-memory cache for ultra-fast lookup and SSR safety
const memoryCache = new Map<string, PlaceTranslationRecord>();

// In-flight request deduplication map to prevent parallel duplicate calls
const inFlightRequests = new Map<string, Promise<PlaceTranslationRecord>>();

/**
 * Decode HTML entities commonly returned by translation APIs
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Conservative shortening rules for English place names (Task 3)
 * Avoids long official strings (e.g. Incheon International Airport Terminal 1 -> Incheon Airport T1)
 * while preserving branches, hotel identities, and medical centers to avoid ambiguity.
 */
export function shortenEnglishPlaceName(translated: string): string {
  if (!translated) return '';
  let text = decodeHtmlEntities(translated).trim();

  // Airport abbreviation rules
  text = text
    .replace(/Incheon International Airport\s*\(?Terminal\s*1\)?/gi, 'Incheon Airport T1')
    .replace(/Incheon International Airport\s*\(?Terminal\s*2\)?/gi, 'Incheon Airport T2')
    .replace(/Incheon Airport\s*\(?Terminal\s*1\)?/gi, 'Incheon Airport T1')
    .replace(/Incheon Airport\s*\(?Terminal\s*2\)?/gi, 'Incheon Airport T2')
    .replace(/Incheon International Airport/gi, 'Incheon Airport')
    .replace(/Gimpo International Airport/gi, 'Gimpo Airport')
    .replace(/\bTerminal\s*1\b/gi, 'T1')
    .replace(/\bTerminal\s*2\b/gi, 'T2')
    .replace(/Josun Palace Seoul Gangnam/gi, 'Josun Palace')
    .replace(/Josun Palace Gangnam/gi, 'Josun Palace');

  return text.trim();
}

/**
 * Normalize place name for lookup
 */
export function normalizePlaceName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[()[\]{}<>,·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if the address looks like a private home/apartment unit
 * Task 5: "Never store private home addresses in a shared global dictionary."
 */
export function isPrivateAddress(text?: string): boolean {
  if (!text) return false;
  const privatePatterns = [
    /\d+동\s*\d+호/,
    /\d+호/,
    /아파트\s*\d+동/,
    /빌라\s*\d+호/,
    /\d+층\s*\d+호/,
    /단지\s*\d+동/,
  ];
  return privatePatterns.some((p) => p.test(text));
}

/**
 * Generate a cache key using place_id or normalized name + optional address
 */
export function getPlaceCacheKey(place: PlaceTranslationRequest): string {
  if (place.id && COMPANY_APPROVED_ALIASES[place.id]) {
    return `id:${place.id}`;
  }
  const primaryName = normalizePlaceName(place.shortName || place.name);
  if (place.id) {
    return `id:${place.id}:${primaryName}`;
  }
  return primaryName;
}

/**
 * Check company-approved aliases
 */
export function lookupApprovedAlias(place: PlaceTranslationRequest): string | null {
  // 1. By ID
  if (place.id && COMPANY_APPROVED_ALIASES[place.id]) {
    return COMPANY_APPROVED_ALIASES[place.id];
  }

  // 2. By shortName
  if (place.shortName) {
    const normShort = normalizePlaceName(place.shortName);
    if (COMPANY_APPROVED_ALIASES[normShort]) {
      return COMPANY_APPROVED_ALIASES[normShort];
    }
  }

  // 3. By name
  if (place.name) {
    const normName = normalizePlaceName(place.name);
    if (COMPANY_APPROVED_ALIASES[normName]) {
      return COMPANY_APPROVED_ALIASES[normName];
    }
  }

  return null;
}

/**
 * Load on-demand translation cache from localStorage (SSR-safe)
 */
function loadLocalCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const entries: PlaceTranslationRecord[] = JSON.parse(raw);
    if (Array.isArray(entries)) {
      entries.forEach((e) => {
        const key = e.place_id || normalizePlaceName(e.name_ko);
        memoryCache.set(key, e);
      });
    }
  } catch (err) {
    console.warn('[TranslationCache] Failed to load from localStorage:', err);
  }
}

/**
 * Save an on-demand translation record to cache
 */
export function saveTranslationToCache(record: PlaceTranslationRecord): void {
  // Check private address guardrail
  if (isPrivateAddress(record.name_ko)) {
    return;
  }

  const key = record.place_id || normalizePlaceName(record.name_ko);
  memoryCache.set(key, record);

  if (typeof window !== 'undefined') {
    try {
      const records = Array.from(memoryCache.values()).slice(-MAX_CACHE_ENTRIES);
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.warn('[TranslationCache] Failed to persist to localStorage:', err);
    }
  }
}

/**
 * Initialize client-side cache once
 */
if (typeof window !== 'undefined') {
  loadLocalCache();
}

/**
 * Reusable function to resolve short English place name
 * Priority order:
 * 1. Company-approved English alias
 * 2. Existing saved or cached English name
 * 3. Google Cloud Translation API (via server-side endpoint)
 * 4. Original place name if translation fails
 */
export async function getShortEnglishPlaceName(
  place: LocationPreset | string | PlaceTranslationRequest
): Promise<PlaceTranslationRecord> {
  const req: PlaceTranslationRequest =
    typeof place === 'string'
      ? { name: place, shortName: place }
      : {
        id: (place as LocationPreset).id,
        name: (place as LocationPreset).name || '',
        shortName: (place as LocationPreset).shortName || (place as LocationPreset).name || '',
        address: (place as LocationPreset).address,
        lat: (place as LocationPreset).lat,
        lng: (place as LocationPreset).lng,
      };

  const displayName = req.shortName || req.name || '현 위치';
  const now = new Date().toISOString();

  // -------------------------------------------------------------
  // Priority 1: Company-approved English aliases
  // -------------------------------------------------------------
  const approved = lookupApprovedAlias(req);
  if (approved) {
    return {
      place_id: req.id,
      name_ko: displayName,
      name_en_short: approved,
      translation_source: 'approved',
      last_verified_at: now,
      is_uncertain: false,
    };
  }

  // -------------------------------------------------------------
  // Priority 2: Existing saved or cached English names
  // -------------------------------------------------------------
  const cacheKey = getPlaceCacheKey(req);
  const cached = memoryCache.get(cacheKey) || memoryCache.get(normalizePlaceName(displayName));
  if (cached) {
    return {
      ...cached,
      translation_source: 'cache',
      last_verified_at: now,
    };
  }

  // Deduplicate in-flight network requests for identical location
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  // -------------------------------------------------------------
  // Priority 3: Google Cloud Translation API fallback via server
  // -------------------------------------------------------------
  const fetchPromise = (async (): Promise<PlaceTranslationRecord> => {
    try {
      const res = await fetch('/api/report/translate-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      if (data && data.name_en_short) {
        const record: PlaceTranslationRecord = {
          place_id: req.id,
          name_ko: displayName,
          name_en_short: data.name_en_short,
          translation_source: data.translation_source || 'google',
          last_verified_at: data.last_verified_at || now,
          is_uncertain: Boolean(data.is_uncertain),
        };
        saveTranslationToCache(record);
        return record;
      }
      throw new Error('Invalid translation response');
    } catch (err) {
      console.warn('[Translation] Fallback triggered for place:', displayName, err);
      // Priority 4: Original place name if translation fails
      return {
        place_id: req.id,
        name_ko: displayName,
        name_en_short: displayName,
        translation_source: 'fallback',
        last_verified_at: now,
        is_uncertain: true,
      };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Convert ETA to 12-hour format with AM/PM (e.g. 7:34 PM, 11:20 AM)
 * Requirement: "ETA uses 12-hour English time with AM/PM."
 */
export function formatEta12Hour(etaFormatted?: string): string {
  if (!etaFormatted) {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 === 0 ? 12 : hours % 12;
    return `${hours}:${minutes} ${period}`;
  }

  // 1. If it already contains AM or PM, preserve the existing period!
  const amPmMatch = etaFormatted.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (amPmMatch) {
    let hours = parseInt(amPmMatch[1], 10);
    const minutes = amPmMatch[2];
    const period = amPmMatch[3].toUpperCase();
    hours = hours % 12 === 0 ? 12 : hours % 12;
    return `${hours}:${minutes} ${period}`;
  }

  // 2. Parse 24h format HH:mm
  const timeMatch = etaFormatted.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2];
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 === 0 ? 12 : hours % 12;
    return `${hours}:${minutes} ${period}`;
  }

  return etaFormatted.replace(/\s*\(.*?\)/, '').trim();
}

/**
 * Format Vehicle No. for English report
 * Requirement: "Vehicle numbers remain unchanged, including Korean characters."
 */
export function getReportVehicleNo(profile?: DriverProfile): string {
  if (!profile) return '116허 1514';
  const raw = profile.carNumber || profile.plateNumber || profile.vehicleNo || '116허 1514';
  let cleaned = raw.trim().replace(/^호차\s+/, '').trim();
  if (cleaned === '호차' || !cleaned) {
    cleaned = '116허 1514';
  }
  return cleaned;
}

/**
 * Fixed English Report Templates
 *
 * Departure (출발)
 * • Vehicle No.: 116허 1514
 * • Route: Josun Palace → Incheon Airport T1
 * • ETA: 7:34 PM
 *
 * Arrival (도착)
 * • Vehicle No.: 116허 1514
 * • Destination: Incheon Airport T1
 * • Status: Arrived
 */
export function generateEnglishReportText({
  vehicleNo = '116허 1514',
  originEn,
  destinationEn,
  waypointsEn = [],
  etaFormatted = '7:34 PM',
  mode,
}: GenerateEnglishReportParams): string {
  const cleanVehicleNo = vehicleNo.replace(/^호차\s+/, '').trim() || '116허 1514';

  if (mode === 'ARRIVED') {
    return [
      `• Vehicle No.: ${cleanVehicleNo}`,
      `• Destination: ${destinationEn}`,
      `• Status: Arrived`,
    ].join('\n');
  }

  // DEPARTURE template
  const routePoints = [originEn, ...waypointsEn, destinationEn].filter(Boolean);
  const routePath = routePoints.join(' → ');
  const cleanEta = formatEta12Hour(etaFormatted);

  return [
    `• Vehicle No.: ${cleanVehicleNo}`,
    `• Route: ${routePath}`,
    `• ETA: ${cleanEta}`,
  ].join('\n');
}
