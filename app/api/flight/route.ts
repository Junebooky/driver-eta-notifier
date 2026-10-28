import { NextRequest, NextResponse } from 'next/server';
import { FlightInfo, FlightType } from '@/types';
import {
  resolveTerminal,
  resolveDepartureDoor,
  resolveArrivalGate,
  resolveArrivalCrossValidation,
  cleanExitCode,
  getCurbsideGate,
  computeFlightStatusText,
  getFlightLocationPreset,
  parseFlightDateTime,
  formatFlightTime,
  resolveGimpoArrival,
  resolveGimpoDeparture,
} from '@/utils/flightMapping';

interface FlightCacheEntry {
  flight: FlightInfo;
  candidates: FlightInfo[];
  timestamp: number;
}

// 2-minute in-memory cache to protect daily quota and avoid repeated external calls
const flightCache = new Map<string, FlightCacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 120 seconds

function getKstDate(offsetDays = 0): { yyyymmdd: string; formatted: string } {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value || '';
  const m = parts.find((p) => p.type === 'month')?.value || '';
  const d = parts.find((p) => p.type === 'day')?.value || '';
  return {
    yyyymmdd: `${y}${m}${d}`,
    formatted: `${y}-${m}-${d}`,
  };
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function isStaleFlight(item: any, nowMs: number): boolean {
  const dtStr = item.estimatedDateTime || item.scheduleDateTime;
  const itemDate = parseFlightDateTime(dtStr);
  if (!itemDate) return false;

  const diffFromNow = nowMs - itemDate.getTime();
  const remark = (item.remark || '').trim();
  const isCompletedRemark = ['도착', '출발', '결항', '탑승마감'].some((r) => remark.includes(r));

  if (diffFromNow >= TWO_HOURS_MS && (isCompletedRemark || diffFromNow >= 3.5 * 60 * 60 * 1000)) {
    return true;
  }
  return false;
}

/**
 * Fetch and parse flights from Incheon International Airport (IIAC)
 */
async function fetchIncheonFlights(
  flightId: string,
  type: FlightType,
  today: { yyyymmdd: string; formatted: string },
  tomorrow: { yyyymmdd: string; formatted: string },
  nowMs: number
): Promise<FlightInfo[]> {
  const apiKey = process.env.INCHEON_AIRPORT_API_KEY;
  if (!apiKey) return [];

  const endpoint =
    type === 'departure'
      ? 'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp/getPassengerDeparturesDeOdp'
      : 'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp/getPassengerArrivalsDeOdp';

  const queryUrl = `${endpoint}?serviceKey=${encodeURIComponent(apiKey)}&type=json&flight_id=${encodeURIComponent(
    flightId
  )}&numOfRows=20`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(queryUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];

    const data = await res.json().catch(() => null);
    let items = data?.response?.body?.items;
    if (!Array.isArray(items) || items.length === 0) return [];

    // Also lookahead tomorrow if not present
    const hasTomorrow = items.some(
      (it: any) =>
        (it.scheduleDateTime && it.scheduleDateTime.startsWith(tomorrow.yyyymmdd)) ||
        (it.estimatedDateTime && it.estimatedDateTime.startsWith(tomorrow.yyyymmdd))
    );

    if (!hasTomorrow) {
      try {
        const tomorrowUrl = `${endpoint}?serviceKey=${encodeURIComponent(
          apiKey
        )}&type=json&flight_id=${encodeURIComponent(flightId)}&searchdate=${tomorrow.yyyymmdd}&numOfRows=5`;
        const tomorrowRes = await fetch(tomorrowUrl, { headers: { Accept: 'application/json' } });
        if (tomorrowRes.ok) {
          const tomorrowData = await tomorrowRes.json();
          const tomorrowBatch = tomorrowData?.response?.body?.items;
          if (Array.isArray(tomorrowBatch) && tomorrowBatch.length > 0) {
            items = [...items, ...tomorrowBatch];
          }
        }
      } catch {
        // Lookahead error ignored
      }
    }

    // Strictly filter out past flights before today (KST)
    const upcomingItems = items.filter((it: any) => {
      const dtStr = it.estimatedDateTime || it.scheduleDateTime || '';
      if (dtStr.length >= 8) {
        const itemYmd = dtStr.slice(0, 8);
        if (itemYmd < today.yyyymmdd) return false;
      }
      return true;
    });

    if (upcomingItems.length === 0) return [];

    return upcomingItems.map((bestItem: any) => {
      const isTomorrow = Boolean(
        (bestItem.scheduleDateTime && bestItem.scheduleDateTime.startsWith(tomorrow.yyyymmdd)) ||
        (bestItem.estimatedDateTime && bestItem.estimatedDateTime.startsWith(tomorrow.yyyymmdd))
      );

      const dtStr = bestItem.estimatedDateTime || bestItem.scheduleDateTime || '';
      let flightDate = today.formatted;
      if (dtStr.length >= 8) {
        flightDate = `${dtStr.slice(0, 4)}-${dtStr.slice(4, 6)}-${dtStr.slice(6, 8)}`;
      }

      const airline = bestItem.airline || '항공사';
      const airport = bestItem.airport || (type === 'arrival' ? '출발지' : '도착지');
      const airportCode = bestItem.airportCode || '';
      const terminalId = bestItem.terminalid || '';
      const { terminal, isT2 } = resolveTerminal(terminalId, flightId);

      const scheduleTimeFormatted = formatFlightTime(bestItem.scheduleDateTime);
      const estimatedTimeFormatted = formatFlightTime(bestItem.estimatedDateTime || bestItem.scheduleDateTime);

      const { statusText, diffMinutes } = computeFlightStatusText(
        type,
        bestItem.scheduleDateTime,
        bestItem.estimatedDateTime
      );

      const checkinRange = bestItem.chkinrange || '';
      const { departureLocationText, suggestedDoor } = resolveDepartureDoor(
        terminal,
        isT2,
        flightId,
        checkinRange
      );

      const rawGate = bestItem.gatenumber ? String(bestItem.gatenumber).trim() : '';
      const rawCarousel = bestItem.carousel ? String(bestItem.carousel).trim() : '';
      const rawExitNumber = bestItem.exitnumber ? String(bestItem.exitnumber).trim() : '';

      const isUnassignedTiming = isTomorrow || (!bestItem.remark && !rawGate);
      const carousel = isUnassignedTiming || !rawCarousel || rawCarousel === 'null' ? null : rawCarousel;
      const cleanExit =
        isUnassignedTiming || !rawExitNumber || rawExitNumber === 'null'
          ? null
          : cleanExitCode(rawExitNumber) || null;

      const exitNumber = cleanExit;
      const exit = cleanExit;

      const arrivalResolution = resolveArrivalCrossValidation(terminal, cleanExit, carousel);
      const curbsideGate = cleanExit ? getCurbsideGate(terminal, cleanExit) || null : null;
      const recommendedParking = arrivalResolution.recommendedParking;
      const arrivalLocationText = resolveArrivalGate(terminal, cleanExit, carousel);

      const targetPreset = getFlightLocationPreset(terminal, type, 'ICN', false);

      const flightInfo: FlightInfo = {
        flightId: bestItem.flightId || flightId,
        airline,
        type,
        airport,
        airportCode,
        airportKind: 'ICN',
        airportName: '인천국제공항',
        isDomestic: false,
        scheduleTimeFormatted,
        estimatedTimeFormatted,
        statusText,
        diffMinutes,
        terminal,
        terminalId: isT2 ? 'P03' : 'P01',
        isTomorrow,
        flightDate,
        isMock: false,
        dataSource: 'IIAC 인천공항공사 실시간 API',
        gateNumber: rawGate || null,
        carousel,
        exit,
        exitNumber,
        curbsideGate,
        recommendedParking,
        arrivalLocationText,
        checkinRange,
        suggestedDoor,
        departureLocationText,
        targetPreset,
      };

      return flightInfo;
    });
  } catch (err) {
    console.warn('Incheon Airport fetch error:', err);
    return [];
  }
}

/**
 * Gimpo Airport Known Test Fixtures (Used when KAC API Key is unregistered or pending approval)
 */
interface GimpoFixtureMeta {
  airline: string;
  airport: string;
  airportCode: string;
  isDomestic: boolean;
  gateNumber?: string;
  checkinRange?: string;
  stdOffsetHours: number;
  etdOffsetHours: number;
  delayMins?: number;
}

const GIMPO_KNOWN_FIXTURES: Record<string, GimpoFixtureMeta> = {
  // Domestic
  KE1234: { airline: '대한항공', airport: '제주', airportCode: 'CJU', isDomestic: true, gateNumber: '14', checkinRange: '국내선 A구역', stdOffsetHours: 1, etdOffsetHours: 1, delayMins: 0 },
  KE1235: { airline: '대한항공', airport: '제주', airportCode: 'CJU', isDomestic: true, gateNumber: '15', checkinRange: '국내선 A구역', stdOffsetHours: 3, etdOffsetHours: 3, delayMins: 0 },
  OZ8913: { airline: '아시아나항공', airport: '제주', airportCode: 'CJU', isDomestic: true, gateNumber: '11', checkinRange: '국내선 B구역', stdOffsetHours: 2, etdOffsetHours: 2.25, delayMins: 15 },
  OZ8914: { airline: '아시아나항공', airport: '제주', airportCode: 'CJU', isDomestic: true, gateNumber: '12', checkinRange: '국내선 B구역', stdOffsetHours: 4, etdOffsetHours: 4, delayMins: 0 },
  '7C101': { airline: '제주항공', airport: '부산(김해)', airportCode: 'PUS', isDomestic: true, gateNumber: '9', checkinRange: '국내선 C구역', stdOffsetHours: 1.5, etdOffsetHours: 1.5, delayMins: 0 },
  '7C102': { airline: '제주항공', airport: '부산(김해)', airportCode: 'PUS', isDomestic: true, gateNumber: '10', checkinRange: '국내선 C구역', stdOffsetHours: 5, etdOffsetHours: 5, delayMins: 0 },
  TW9801: { airline: '티웨이항공', airport: '대구', airportCode: 'TAE', isDomestic: true, gateNumber: '7', checkinRange: '국내선 D구역', stdOffsetHours: 2.5, etdOffsetHours: 2.5, delayMins: 0 },
  LJ301: { airline: '진에어', airport: '제주', airportCode: 'CJU', isDomestic: true, gateNumber: '8', checkinRange: '국내선 E구역', stdOffsetHours: 0.5, etdOffsetHours: 0.5, delayMins: 0 },
  BX8811: { airline: '에어부산', airport: '부산(김해)', airportCode: 'PUS', isDomestic: true, gateNumber: '6', checkinRange: '국내선 F구역', stdOffsetHours: 1.8, etdOffsetHours: 1.8, delayMins: 0 },
  // International
  NH862: { airline: '전일본공수(ANA)', airport: '도쿄(하네다)', airportCode: 'HND', isDomestic: false, gateNumber: '36', checkinRange: '국제선 2층 D열', stdOffsetHours: 2, etdOffsetHours: 2, delayMins: 0 },
  NH861: { airline: '전일본공수(ANA)', airport: '도쿄(하네다)', airportCode: 'HND', isDomestic: false, gateNumber: '37', checkinRange: '국제선 2층 D열', stdOffsetHours: 4, etdOffsetHours: 4, delayMins: 0 },
  JL092: { airline: '일본항공(JAL)', airport: '도쿄(하네다)', airportCode: 'HND', isDomestic: false, gateNumber: '38', checkinRange: '국제선 2층 C열', stdOffsetHours: 2.5, etdOffsetHours: 2.5, delayMins: 0 },
  JL091: { airline: '일본항공(JAL)', airport: '도쿄(하네다)', airportCode: 'HND', isDomestic: false, gateNumber: '39', checkinRange: '국제선 2층 C열', stdOffsetHours: 5.5, etdOffsetHours: 5.5, delayMins: 0 },
  OZ1025: { airline: '아시아나항공', airport: '오사카(간사이)', airportCode: 'KIX', isDomestic: false, gateNumber: '35', checkinRange: '국제선 2층 B열', stdOffsetHours: 3, etdOffsetHours: 3.5, delayMins: 30 },
  TW9201: { airline: '티웨이항공', airport: '타이베이(쑹산)', airportCode: 'TSA', isDomestic: false, gateNumber: '34', checkinRange: '국제선 2층 E열', stdOffsetHours: 3.2, etdOffsetHours: 3.2, delayMins: 0 },
  KE2101: { airline: '대한항공', airport: '도쿄(하네다)', airportCode: 'HND', isDomestic: false, gateNumber: '36', checkinRange: '국제선 2층 A열', stdOffsetHours: 1.2, etdOffsetHours: 1.2, delayMins: 0 },
};

/**
 * Fetch flights from Korea Airports Corporation (KAC) for Gimpo Airport (GMP)
 * or provide authenticated fixture fallback when API key is pending
 */
async function fetchGimpoFlights(
  flightId: string,
  type: FlightType,
  today: { yyyymmdd: string; formatted: string },
  tomorrow: { yyyymmdd: string; formatted: string },
  nowMs: number
): Promise<FlightInfo[]> {
  // P0 Compliance: Strictly use KAC_FLIGHT_API_KEY. Never fallback to Incheon Airport key.
  const kacApiKey = process.env.KAC_FLIGHT_API_KEY;

  if (kacApiKey && kacApiKey.trim().length > 0) {
    try {
      const ioCode = type === 'arrival' ? 'I' : 'O';
      const cleanFln = flightId.replace(/[^A-Za-z0-9]/g, '');
      const defaultEndpoint = 'http://openapi.airport.co.kr/service/rest/FlightStatusList/getFlightStatusList';
      const configuredEndpoint = process.env.KAC_FLIGHT_API_ENDPOINT;

      const endpoints = configuredEndpoint && configuredEndpoint !== defaultEndpoint
        ? [configuredEndpoint, defaultEndpoint]
        : [defaultEndpoint];

      for (const endpoint of endpoints) {
        try {
          const kacUrl = `${endpoint}?serviceKey=${encodeURIComponent(
            kacApiKey.trim()
          )}&schAirCode=GMP&schFln=${encodeURIComponent(cleanFln)}&schIOType=${ioCode}&_type=json&type=json`;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          const res = await fetch(kacUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (res.ok) {
            const json = await res.json().catch(() => null);
            const header = json?.response?.header || json?.header;
            // Check if KAC returned valid normal service
            if (header?.resultCode === '00' || header?.resultCode === 0 || header?.resultCode === '200') {
              const rawItems = json?.response?.body?.items?.item || json?.body?.items || json?.items;
              const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

              if (items.length > 0) {
                return items.map((it: any) => {
                  const isDomestic = it.line === '국내' || it.schLineType === 'D';
                  const terminal = isDomestic ? '김포공항 국내선' : '김포공항 국제선';
                  const terminalId = isDomestic ? 'GMP_DOM' : 'GMP_INT';
                  const airline = it.airlineKorean || it.airlineEnglish || '항공사';
                  const airport = it.arrivedKor || it.boardingKor || it.airport || (isDomestic ? '국내 공항' : '국제 공항');
                  const airportCode = it.arrivedEng || it.boardingEng || '';

                  const schedRaw = it.std ? String(it.std).replace(/[^0-9]/g, '') : '';
                  const estRaw = it.etd ? String(it.etd).replace(/[^0-9]/g, '') : schedRaw;

                  const schedFormatted = schedRaw.length === 4 ? `${schedRaw.slice(0, 2)}:${schedRaw.slice(2, 4)}` : formatFlightTime(schedRaw);
                  const estFormatted = estRaw.length === 4 ? `${estRaw.slice(0, 2)}:${estRaw.slice(2, 4)}` : formatFlightTime(estRaw);

                  let diffMinutes = 0;
                  if (schedRaw.length === 4 && estRaw.length === 4) {
                    const sh = parseInt(schedRaw.slice(0, 2), 10);
                    const sm = parseInt(schedRaw.slice(2, 4), 10);
                    const eh = parseInt(estRaw.slice(0, 2), 10);
                    const em = parseInt(estRaw.slice(2, 4), 10);
                    diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
                  }

                  const remark = it.rmkKor ? String(it.rmkKor).trim() : '';
                  const statusDesc = remark || (diffMinutes > 10 ? `지연(+${diffMinutes}분)` : (type === 'arrival' ? '정상 도착' : '정상 출발'));
                  const statusText = `${estFormatted} (${statusDesc})`;

                  const rawGate = it.gate && String(it.gate).trim() !== '' ? String(it.gate).trim() : null;
                  const { arrivalLocationText, curbsideGate, recommendedParking } = resolveGimpoArrival(
                    terminal,
                    rawGate,
                    isDomestic
                  );
                  const { departureLocationText, suggestedDoor } = resolveGimpoDeparture(
                    terminal,
                    it.checkinRange || null,
                    isDomestic
                  );

                  return {
                    flightId,
                    airline,
                    type,
                    airport,
                    airportCode,
                    airportKind: 'GMP',
                    airportName: '김포국제공항',
                    isDomestic,
                    scheduleTimeFormatted: schedFormatted,
                    estimatedTimeFormatted: estFormatted,
                    statusText,
                    diffMinutes,
                    terminal,
                    terminalId,
                    isTomorrow: false,
                    flightDate: today.formatted,
                    isMock: false,
                    dataSource: 'KAC 한국공항공사 실시간 API',
                    gateNumber: rawGate,
                    carousel: null,
                    exit: null,
                    exitNumber: null,
                    curbsideGate,
                    recommendedParking,
                    arrivalLocationText,
                    checkinRange: it.checkinRange || undefined,
                    suggestedDoor,
                    departureLocationText,
                    targetPreset: getFlightLocationPreset(terminal, type, 'GMP', isDomestic),
                  };
                });
              }
            }
          }
        } catch {
          // Continue to next endpoint
        }
      }
    } catch {
      // Ignore network timeout
    }
  }

  // P0 Compliance: Strictly forbid fabricating fake flights in production environments.
  // Test fixture is allowed ONLY during unit tests (NODE_ENV === 'test') or local dev with DEV_AUTH_ENABLED=true.
  const isLocalDevOrTest =
    process.env.NODE_ENV === 'test' ||
    (process.env.DEV_AUTH_ENABLED === 'true' && process.env.VERCEL !== '1');

  if (!isLocalDevOrTest) {
    // In production or preview: If live KAC data is unavailable or key pending, do not generate fake mock flights!
    return [];
  }

  // 2. High-fidelity Gimpo test fixture matching for local developer testing
  const cleanId = flightId.replace(/\s+/g, '').toUpperCase();
  const matchedFixture = GIMPO_KNOWN_FIXTURES[cleanId];

  // Also match prefix pattern for common domestic carriers (e.g. 7C..., LJ..., BX...) or international Haneda/Kansai
  const isGimpoCandidate =
    Boolean(matchedFixture) ||
    cleanId.startsWith('7C') ||
    cleanId.startsWith('LJ') ||
    cleanId.startsWith('BX') ||
    cleanId.startsWith('TW') ||
    cleanId.startsWith('NH') ||
    cleanId.startsWith('JL') ||
    cleanId.startsWith('GMP');

  if (!isGimpoCandidate) return [];

  const meta: GimpoFixtureMeta = matchedFixture || {
    airline: cleanId.startsWith('7C')
      ? '제주항공'
      : cleanId.startsWith('LJ')
      ? '진에어'
      : cleanId.startsWith('BX')
      ? '에어부산'
      : cleanId.startsWith('TW')
      ? '티웨이항공'
      : cleanId.startsWith('NH')
      ? '전일본공수(ANA)'
      : cleanId.startsWith('JL')
      ? '일본항공(JAL)'
      : '국내항공사',
    airport: cleanId.startsWith('NH') || cleanId.startsWith('JL') ? '도쿄(하네다)' : '제주',
    airportCode: cleanId.startsWith('NH') || cleanId.startsWith('JL') ? 'HND' : 'CJU',
    isDomestic: !(cleanId.startsWith('NH') || cleanId.startsWith('JL')),
    gateNumber: '11',
    checkinRange: '국내선 카운터',
    stdOffsetHours: 1.5,
    etdOffsetHours: 1.5,
    delayMins: 0,
  };

  // Generate dynamic times based on current clock for realistic testing
  const now = new Date(nowMs);
  const schedTime = new Date(now.getTime() + meta.stdOffsetHours * 60 * 60 * 1000);
  const estTime = new Date(schedTime.getTime() + (meta.delayMins || 0) * 60 * 1000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const schedFormatted = `${pad(schedTime.getHours())}:${pad(schedTime.getMinutes())}`;
  const estFormatted = `${pad(estTime.getHours())}:${pad(estTime.getMinutes())}`;

  const diffMinutes = meta.delayMins || 0;
  const statusText =
    diffMinutes >= 10
      ? `${estFormatted} (지연 시간 +${diffMinutes}분)`
      : `${estFormatted} (${type === 'arrival' ? '정상 도착' : '정상 출발'})`;

  const terminal = meta.isDomestic ? '김포공항 국내선' : '김포공항 국제선';
  const terminalId = meta.isDomestic ? 'GMP_DOM' : 'GMP_INT';

  const { arrivalLocationText, curbsideGate, recommendedParking } = resolveGimpoArrival(
    terminal,
    meta.gateNumber,
    meta.isDomestic
  );
  const { departureLocationText, suggestedDoor } = resolveGimpoDeparture(
    terminal,
    meta.checkinRange,
    meta.isDomestic
  );

  const fixtureFlight: FlightInfo = {
    flightId: cleanId,
    airline: meta.airline,
    type,
    airport: meta.airport,
    airportCode: meta.airportCode,
    airportKind: 'GMP',
    airportName: '김포국제공항',
    isDomestic: meta.isDomestic,
    scheduleTimeFormatted: schedFormatted,
    estimatedTimeFormatted: estFormatted,
    statusText,
    diffMinutes,
    terminal,
    terminalId,
    isTomorrow: false,
    flightDate: today.formatted,
    isMock: true,
    dataSource: 'GMP 테스트 픽스처 (KAC 공식 API 키 미발급/승인 대기)',
    fixtureNotice: '[TEST/FIXTURE] 공공데이터포털 KAC API 키 등록 전 검증용 테스트 데이터입니다.',
    gateNumber: meta.gateNumber || '확인 필요',
    carousel: null,
    exit: null,
    exitNumber: null,
    curbsideGate,
    recommendedParking,
    arrivalLocationText,
    checkinRange: meta.checkinRange,
    suggestedDoor,
    departureLocationText,
    targetPreset: getFlightLocationPreset(terminal, type, 'GMP', meta.isDomestic),
  };

  return [fixtureFlight];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const rawType = searchParams.get('type')?.toLowerCase();
  const type: FlightType = rawType === 'departure' ? 'departure' : 'arrival';

  const rawFlightId = searchParams.get('flightId') || searchParams.get('flight_id') || '';
  const flightId = rawFlightId.replace(/\s+/g, '').toUpperCase();

  if (!flightId || flightId.length < 3) {
    return NextResponse.json(
      { success: false, message: '정확한 항공편명을 입력해 주세요. (예: KE012, OZ8913, 7C101)' },
      { status: 400 }
    );
  }

  const today = getKstDate(0);
  const tomorrow = getKstDate(1);
  const searchDate = searchParams.get('searchdate') || today.yyyymmdd;
  const cacheKey = `${type}:${flightId}:${searchDate}`;
  const nowMs = Date.now();

  // 1. Check in-memory 2-minute cache
  if (flightCache.has(cacheKey)) {
    const cached = flightCache.get(cacheKey)!;
    if (nowMs - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        flight: cached.flight,
        candidates: cached.candidates,
        cached: true,
      });
    }
  }

  // 2. Parallel Auto-Detect Query: Incheon Airport (IIAC) + Gimpo Airport (KAC)
  try {
    const [incheonResult, gimpoResult] = await Promise.allSettled([
      fetchIncheonFlights(flightId, type, today, tomorrow, nowMs),
      fetchGimpoFlights(flightId, type, today, tomorrow, nowMs),
    ]);

    const incheonFlights = incheonResult.status === 'fulfilled' ? incheonResult.value : [];
    const gimpoFlights = gimpoResult.status === 'fulfilled' ? gimpoResult.value : [];

    const allCandidates = [...incheonFlights, ...gimpoFlights];

    // Strictly filter out past flights before today (KST)
    const validCandidates = allCandidates.filter((f) => {
      if (f.flightDate && f.flightDate < today.formatted) {
        return false;
      }
      return true;
    });

    if (validCandidates.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: `입력하신 편명 [${flightId}]의 오늘 이후 ${
            type === 'arrival' ? '입국(도착)' : '출국(출발)'
          } 운항 정보를 인천공항 및 김포공항에서 찾을 수 없습니다. 편명 또는 탭(입국/출국) 설정을 확인해 주세요.`,
        },
        { status: 404 }
      );
    }

    // Deduplicate and sort chronologically (today first, then upcoming dates)
    const seenKeys = new Set<string>();
    const uniqueCandidates = validCandidates.filter((c) => {
      const key = `${c.flightId}_${c.airportKind}_${c.terminalId}_${c.flightDate}_${c.scheduleTimeFormatted}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    uniqueCandidates.sort((a, b) => {
      const dateA = a.flightDate || '';
      const dateB = b.flightDate || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.scheduleTimeFormatted || '';
      const timeB = b.scheduleTimeFormatted || '';
      return timeA.localeCompare(timeB);
    });

    // 3. Select best primary flight:
    // Prefer today's active flights closest to now
    let bestFlight = uniqueCandidates[0];
    const todayActive = uniqueCandidates.filter((f) => f.flightDate === today.formatted);

    if (todayActive.length > 0) {
      bestFlight = todayActive[0];
    } else {
      bestFlight = uniqueCandidates[0];
    }

    // Cache result
    flightCache.set(cacheKey, {
      flight: bestFlight,
      candidates: uniqueCandidates,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      flight: bestFlight,
      candidates: uniqueCandidates,
      cached: false,
    });
  } catch (error: any) {
    console.error('Failed to query flights across ICN and GMP:', error);
    return NextResponse.json(
      { success: false, message: '공항공사 서버와의 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }
}
