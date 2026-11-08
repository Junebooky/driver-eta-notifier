import { FlightInfo, FlightType, LocationPreset, DriverProfile } from '@/types';

/**
 * Parses YYYYMMDDHHmm string to Date object
 */
export function parseFlightDateTime(dtStr?: string | null): Date | null {
  if (!dtStr || typeof dtStr !== 'string') return null;
  const clean = dtStr.replace(/[^0-9]/g, '');
  if (clean.length < 12) return null;
  const y = parseInt(clean.slice(0, 4), 10);
  const m = parseInt(clean.slice(4, 6), 10) - 1;
  const d = parseInt(clean.slice(6, 8), 10);
  const h = parseInt(clean.slice(8, 10), 10);
  const min = parseInt(clean.slice(10, 12), 10);
  // Incheon Airport API provides timestamps in KST (UTC+9)
  // Use Date.UTC with h - 9 to get timezone-independent UTC epoch
  return new Date(Date.UTC(y, m, d, h - 9, min));
}

/**
 * Format Date or YYYYMMDDHHmm to HH:mm
 */
export function formatFlightTime(dtStr?: string | null): string {
  if (!dtStr || typeof dtStr !== 'string') return '--:--';
  const clean = dtStr.replace(/[^0-9]/g, '');
  if (clean.length < 12) return '--:--';
  const hours = clean.slice(8, 10);
  const minutes = clean.slice(10, 12);
  return `${hours}:${minutes}`;
}

/**
 * Resolve the *operating* airline, not just the marketing flight prefix.
 * Codeshares must use the operating airline's terminal; the airport's explicit
 * terminal ID remains authoritative for other airlines.
 */
function isAsianaOperatingFlight(flightId?: string, operatingAirline?: string | null): boolean {
  const airline = (operatingAirline || '').trim();
  if (/아시아나|ASIANA|^OZ(?:\\d|\\s|$)|^AAR(?:\\d|\\s|$)/i.test(airline)) return true;
  if (airline && airline !== '항공사' && airline.toLowerCase() !== 'unknown') return false;
  return /^OZ(?:\\d|\\s)/i.test((flightId || '').trim());
}

/**
 * Asiana moved ALL Incheon departures/arrivals from T1 to T2 at
 * 2026-01-14 00:00 KST (source: flyasiana.com, notice CM202509300002526502).
 * An old/stale P01 or P02 API value must not override this published change.
 * flightDate is the airport flight's KST calendar date (YYYY-MM-DD).
 */
export function resolveTerminal(
  terminalId?: string | null,
  flightId?: string,
  flightDate?: string | null,
  operatingAirline?: string | null
): { terminal: string; isT2: boolean } {
  const prefix = (flightId || '').trim().slice(0, 2).toUpperCase();
  const tId = (terminalId || '').trim().toUpperCase();
  const ymd = (flightDate || '').replace(/[^0-9]/g, '').slice(0, 8);

  if (isAsianaOperatingFlight(flightId, operatingAirline)) {
    // Missing date means a current/live search. Do not revive the obsolete T1 rule.
    const isT2 = !ymd || ymd >= '20260114';
    return { terminal: isT2 ? '제2여객터미널' : '제1여객터미널', isT2 };
  }

  // For codeshares and other carriers, trust the airport's explicit terminal.
  if (tId === 'P03' || tId === 'T2') return { terminal: '제2여객터미널', isT2: true };
  if (tId === 'P01' || tId === 'P02' || tId === 'T1') return { terminal: '제1여객터미널', isT2: false };

  const t2Airlines = ['KE', 'DL', 'AF', 'KL', 'AM', 'GA', 'ME', 'RO', 'SV', 'UX', 'VN', 'MF', 'LJ'];
  if (t2Airlines.includes(prefix)) return { terminal: '제2여객터미널', isT2: true };

  // Unknown airline + missing terminal: preserve existing T1 fallback.
  return { terminal: '제1여객터미널', isT2: false };
}

/**
 * Computes deterministic Flight Status Text based on Schedule vs Estimated times
 * Rules:
 * - On-time: {HH:mm} (정상 착륙) or {HH:mm} (정상 출발)
 * - Delay (>= 10m): {HH:mm} (지연 시간 +N분)
 * - Early (<= -5m): {HH:mm} (조기 도착 -N분) or {HH:mm} (조기 출발 -N분)
 */
export function computeFlightStatusText(
  type: FlightType,
  scheduleStr?: string | null,
  estimatedStr?: string | null
): { statusText: string; diffMinutes: number; timeFormatted: string } {
  const schedDate = parseFlightDateTime(scheduleStr);
  const estDate = parseFlightDateTime(estimatedStr) || schedDate;

  if (!schedDate || !estDate) {
    const fallbackTime = formatFlightTime(estimatedStr || scheduleStr);
    return {
      statusText: `${fallbackTime} (${type === 'arrival' ? '정상 착륙' : '정상 출발'})`,
      diffMinutes: 0,
      timeFormatted: fallbackTime,
    };
  }

  const timeFormatted = formatFlightTime(estimatedStr || scheduleStr);
  const diffMinutes = Math.round((estDate.getTime() - schedDate.getTime()) / (60 * 1000));

  if (diffMinutes >= 10) {
    return {
      statusText: `${timeFormatted} (지연 시간 +${diffMinutes}분)`,
      diffMinutes,
      timeFormatted,
    };
  }

  if (diffMinutes <= -5) {
    return {
      statusText: `${timeFormatted} (조기 ${type === 'arrival' ? '도착' : '출발'} ${diffMinutes}분)`,
      diffMinutes,
      timeFormatted,
    };
  }

  return {
    statusText: `${timeFormatted} (${type === 'arrival' ? '정상 착륙' : '정상 출발'})`,
    diffMinutes,
    timeFormatted,
  };
}

/**
 * Intelligent Departure Door Mapping (3층 출국장 하차 도어 지식 베이스)
 */
export function resolveDepartureDoor(
  terminal: string,
  isT2: boolean,
  flightId: string,
  checkinRange?: string | null,
  operatingAirline?: string | null
): { departureLocationText: string; suggestedDoor: string } {
  const cleanCounter = (checkinRange || '').trim();
  const asianaT2 = isT2 && isAsianaOperatingFlight(flightId, operatingAirline);

  // If check-in counter is confirmed by airport API
  if (cleanCounter) {
    // Asiana now checks in at T2 G–J counters. Do not invent a drop-off door.
    if (asianaT2) {
      return {
        departureLocationText: `${terminal} 3층 (카운터 ${cleanCounter} / 하차 도어 현장 확인)`,
        suggestedDoor: '현장 확인',
      };
    }
    const firstLetter = cleanCounter.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();

    if (isT2) {
      const doorMap: Record<string, string> = {
        A: '1번 도어 앞',
        B: '2번 도어 앞',
        C: '3번 도어 앞',
        D: '4번 도어 앞',
        E: '5번 도어 앞',
        F: '6번 도어 앞',
        G: '7번 도어 앞',
        H: '8번 도어 앞',
      };
      const door = doorMap[firstLetter] || '중앙 4~5번 도어 앞';
      return {
        departureLocationText: `${terminal} 3층 (카운터 ${cleanCounter} / ${door})`,
        suggestedDoor: door,
      };
    } else {
      // T1 door mapping
      let door = '중앙 7~8번 도어 앞';
      if (['A', 'B'].includes(firstLetter)) door = '1~2번 도어 앞';
      else if (['C', 'D'].includes(firstLetter)) door = '3~4번 도어 앞';
      else if (['E', 'F'].includes(firstLetter)) door = '5~6번 도어 앞';
      else if (['G', 'H'].includes(firstLetter)) door = '7~8번 도어 앞';
      else if (['J', 'K'].includes(firstLetter)) door = '9~10번 도어 앞';
      else if (['L', 'M'].includes(firstLetter)) door = '11~12번 도어 앞';
      else if (['N'].includes(firstLetter)) door = '13~14번 도어 앞';

      return {
        departureLocationText: `${terminal} 3층 (카운터 ${cleanCounter} / ${door})`,
        suggestedDoor: door,
      };
    }
  }

  // Fallback based on airline IATA code
  const prefix = (flightId || '').slice(0, 2).toUpperCase();

  if (prefix === 'KE' || prefix === 'DL') {
    return {
      departureLocationText: `${terminal} 3층 1번 도어 (프리미엄 체크인 카운터 A)`,
      suggestedDoor: '1번 도어',
    };
  }

  if (asianaT2) {
    return {
      departureLocationText: `${terminal} 3층 G~J열 체크인 카운터 (하차 도어 현장 확인)`,
      suggestedDoor: '현장 확인',
    };
  }

  if (prefix === 'OZ' && !isT2) {
    // Pre-2026-01-14 historical T1 guidance only.
    return {
      departureLocationText: `${terminal} 3층 1번 도어 (프리미엄 체크인 존 카운터 A)`,
      suggestedDoor: '1번 도어',
    };
  }

  const skyteam = ['AF', 'KL', 'AM', 'GA', 'VN', 'ME', 'RO', 'SV', 'UX', 'MF'];
  if (skyteam.includes(prefix)) {
    return {
      departureLocationText: `${terminal} 3층 4~5번 도어 권장 (스카이팀 외항사)`,
      suggestedDoor: '4~5번 도어',
    };
  }

  const foreignT1 = ['SQ', 'LH', 'UA', 'NH', 'TK', 'AC', 'CX', 'BA', 'EY', 'QR'];
  if (foreignT1.includes(prefix) || !isT2) {
    return {
      departureLocationText: `${terminal} 3층 11~12번 도어 권장 (외항사 체크인 구역)`,
      suggestedDoor: '11~12번 도어',
    };
  }

  return {
    departureLocationText: `${terminal} 3층 중앙 도어 권장`,
    suggestedDoor: isT2 ? '4~5번 도어' : '7~8번 도어',
  };
}

export interface ArrivalGateResolution {
  exit: string;              // 예: "E출구"
  curbsideGate: string;      // 예: "외부 11~14번 게이트"
  recommendedParking: string; // 예: "P2 단기 지상 (F·G구역)"
}

/**
 * Safely formats exit text without duplicate '출구' suffix or '출구 배정 중출구'
 */
export function formatExitText(exit?: string | null): string {
  if (!exit) return '출구 배정 중';
  const trimmed = exit.trim();
  if (trimmed.includes('배정') || trimmed === '출구') {
    return '출구 배정 중';
  }
  if (trimmed.endsWith('출구')) {
    return trimmed;
  }
  return `${trimmed}출구`;
}

/**
 * Extracts pure exit code (e.g. 'A', 'B', '') without '출구' suffix or assignment keywords
 */
export function cleanExitCode(rawExit?: string | null): string {
  if (!rawExit) return '';
  const trimmed = rawExit.trim();
  if (trimmed.includes('배정')) return '';
  return trimmed.replace(/출구$/, '').trim().toUpperCase();
}

/**
 * Cross-validates arrival exit, curbside gate, and recommended short-term ground parking
 * based on the physical layout of Incheon Airport T1 and T2 baggage carousels.
 */
export function resolveArrivalCrossValidation(
  terminal: string,
  rawExit?: string | null,
  rawBaggage?: string | null
): ArrivalGateResolution {
  const cleanTerminal = (terminal || '').replace(/\s+/g, '');
  const cleanExit = cleanExitCode(rawExit);
  const digits = (rawBaggage || '').replace(/[^0-9]/g, '');
  const beltNum = digits ? parseInt(digits, 10) : NaN;
  const hasBelt = !isNaN(beltNum) && beltNum > 0;

  const isT2 = cleanTerminal.includes('제2') || cleanTerminal.includes('T2');

  // 제2여객터미널 (T2)
  if (isT2) {
    if (cleanExit === 'A') {
      return {
        exit: 'A출구',
        curbsideGate: '외부 1~3번 게이트',
        recommendedParking: 'T2 서편 단기 지상',
      };
    }
    if (cleanExit === 'B') {
      return {
        exit: 'B출구',
        curbsideGate: '외부 4~5번 게이트',
        recommendedParking: 'T2 동편 단기 지상',
      };
    }

    return {
      exit: '출구 배정 중',
      curbsideGate: '',
      recommendedParking: hasBelt
        ? (beltNum <= 10 ? 'T2 서편 단기 지상' : 'T2 동편 단기 지상')
        : 'T2 단기 지상주차장',
    };
  }

  // 제1여객터미널 (T1)
  if (['A', 'B'].includes(cleanExit)) {
    return {
      exit: formatExitText(cleanExit),
      curbsideGate: '외부 1~4번 게이트',
      recommendedParking: 'P1 단기 지상 (A·B구역)',
    };
  }
  if (['C', 'D'].includes(cleanExit)) {
    return {
      exit: formatExitText(cleanExit),
      curbsideGate: '외부 5~10번 게이트',
      recommendedParking: 'P1·P2 단기 지상 (C·D구역)',
    };
  }
  if (['E', 'F'].includes(cleanExit)) {
    return {
      exit: formatExitText(cleanExit),
      curbsideGate: '외부 11~14번 게이트',
      recommendedParking: 'P2 단기 지상 (F·G구역)',
    };
  }

  return {
    exit: '출구 배정 중',
    curbsideGate: '',
    recommendedParking: hasBelt
      ? (beltNum <= 10
        ? 'P1 단기 지상 (A·B구역)'
        : beltNum <= 15
        ? 'P1·P2 단기 지상 (C·D구역)'
        : 'P2 단기 지상 (F·G구역)')
      : 'P1·P2 단기 지상주차장',
  };
}

/**
 * Intelligent Arrival Gate Mapping (입국장 게이트 매핑)
 */
export function resolveArrivalGate(
  terminal: string,
  exitNumber?: string | null,
  carousel?: string | null
): string {
  const cleanExit = cleanExitCode(exitNumber);
  const cleanCarousel = (carousel || '').replace(/[^0-9]/g, '').trim();
  const hasExit = Boolean(cleanExit);
  const hasCarousel = Boolean(cleanCarousel);

  if (hasExit && hasCarousel) {
    return `${terminal} 1층 (${cleanExit}출구 / 수하물 ${cleanCarousel}번)`;
  }
  if (hasExit) {
    return `${terminal} 1층 (${cleanExit}출구 / 수하물 배정 중)`;
  }
  if (hasCarousel) {
    return `${terminal} 1층 (출구 배정 중 / 수하물 ${cleanCarousel}번)`;
  }
  return `${terminal} 1층 (출구 배정 중 / 수하물 배정 중)`;
}

/**
 * Maps arrival exit (A~F) to 1st floor curbside pickup gate
 */
export function getCurbsideGate(terminal: string, exit?: string | null): string {
  if (!exit) return '';
  const cleanExit = cleanExitCode(exit);
  if (!cleanExit) return '';
  return resolveArrivalCrossValidation(terminal, cleanExit).curbsideGate;
}

/**
 * Resolves Gimpo Airport arrival gate, exit, and recommended parking
 */
export function resolveGimpoArrival(
  terminal: string,
  gateNumber?: string | null,
  isDomestic = true
): {
  arrivalLocationText: string;
  curbsideGate: string;
  recommendedParking: string;
} {
  const gateText = gateNumber && gateNumber.trim() ? `${gateNumber.trim()}번 게이트` : '확인 필요';
  const termName = isDomestic ? '김포공항 국내선' : '김포공항 국제선';
  const arrivalLocationText = `${termName} 1층 입국장 (도착 게이트 ${gateText})`;
  const curbsideGate = isDomestic
    ? '외부 1층 국내선 순환버스·승차장 방면'
    : '외부 1층 국제선 버스·승차장 방면';
  const recommendedParking = isDomestic
    ? '국내선 제1·제2 지상/지하 주차장'
    : '국제선 지하/지상 주차장';

  return { arrivalLocationText, curbsideGate, recommendedParking };
}

/**
 * Resolves Gimpo Airport departure location and suggested drop door
 */
export function resolveGimpoDeparture(
  terminal: string,
  checkinRange?: string | null,
  isDomestic = true
): {
  departureLocationText: string;
  suggestedDoor: string;
} {
  const termName = isDomestic ? '김포공항 국내선' : '김포공항 국제선';
  const counterText = checkinRange && checkinRange.trim() ? ` (체크인 ${checkinRange.trim()})` : '';
  const suggestedDoor = isDomestic ? '국내선 2층 출발 2~3번 도어 앞' : '국제선 2층 출발 1~2번 도어 앞';
  const departureLocationText = `${termName} 2층 출발층${counterText} / ${suggestedDoor}`;

  return { departureLocationText, suggestedDoor };
}

/**
 * Constructs precision LocationPreset for navigation destination (supports ICN & GMP)
 */
export function getFlightLocationPreset(
  terminal: string,
  type: FlightType,
  airportKind?: 'ICN' | 'GMP',
  isDomestic = false
): LocationPreset {
  const isGmp = airportKind === 'GMP' || terminal.includes('김포') || terminal.includes('국내선') || isDomestic;

  // Gimpo Airport Presets
  if (isGmp) {
    const isDom = isDomestic || terminal.includes('국내');
    if (isDom) {
      if (type === 'departure') {
        return {
          id: 'custom_flight_gmp_dom_dep',
          name: '김포국제공항 국내선 2층 출국장 (하차)',
          shortName: '김포공항 국내선 출국',
          lat: 37.5587,
          lng: 126.8031,
          category: 'AIRPORT',
          address: '서울 강서구 하늘길 112 (국내선 2층 출국장)',
        };
      }
      return {
        id: 'custom_flight_gmp_dom_arr',
        name: '김포국제공항 국내선 1층 입국장 (영접)',
        shortName: '김포공항 국내선 입국',
        lat: 37.5594,
        lng: 126.8035,
        category: 'AIRPORT',
        address: '서울 강서구 하늘길 112 (국내선 1층 입국장)',
      };
    } else {
      // Gimpo International
      if (type === 'departure') {
        return {
          id: 'custom_flight_gmp_int_dep',
          name: '김포국제공항 국제선 2층 출국장 (하차)',
          shortName: '김포공항 국제선 출국',
          lat: 37.5645,
          lng: 126.7972,
          category: 'AIRPORT',
          address: '서울 강서구 하늘길 38 (국제선 2층 출국장)',
        };
      }
      return {
        id: 'custom_flight_gmp_int_arr',
        name: '김포국제공항 국제선 1층 입국장 (영접)',
        shortName: '김포공항 국제선 입국',
        lat: 37.5641,
        lng: 126.7978,
        category: 'AIRPORT',
        address: '서울 강서구 하늘길 38 (국제선 1층 입국장)',
      };
    }
  }

  // Incheon Airport Presets
  const isT2 = terminal.includes('2');

  if (isT2) {
    if (type === 'departure') {
      return {
        id: 'custom_flight_icn_t2_dep',
        name: '인천국제공항 제2여객터미널 3층 출국장',
        shortName: '인천공항 T2 출국',
        lat: 37.4691,
        lng: 126.4344,
        category: 'AIRPORT',
        address: '인천 중구 제2소화물통로 255 (3층 출국장)',
      };
    }
    return {
      id: 'custom_flight_icn_t2_arr',
      name: '인천국제공항 제2여객터미널 1층 입국장',
      shortName: '인천공항 T2 입국',
      lat: 37.4691,
      lng: 126.4344,
      category: 'AIRPORT',
      address: '인천 중구 제2소화물통로 255 (1층 입국장)',
    };
  }

  // T1
  if (type === 'departure') {
    return {
      id: 'custom_flight_icn_t1_dep',
      name: '인천국제공항 제1여객터미널 3층 출국장',
      shortName: '인천공항 T1 출국',
      lat: 37.4495,
      lng: 126.4512,
      category: 'AIRPORT',
      address: '인천 중구 공항로 272 (3층 출국장)',
    };
  }
  return {
    id: 'custom_flight_icn_t1_arr',
    name: '인천국제공항 제1여객터미널 1층 입국장',
    shortName: '인천공항 T1 입국',
    lat: 37.4495,
    lng: 126.4512,
    category: 'AIRPORT',
    address: '인천 중구 공항로 272 (1층 입국장)',
  };
}

/**
 * Standard Multi-line KakaoTalk Report Generator for Flights
 */
export function formatFlightReport(profile: DriverProfile, flight: FlightInfo): string {
  const v = (profile.vehicleNo || '').trim().replace(/호차\s*$/, '').trim();
  let vehicleDisplay = '의전차량';
  if (v) {
    vehicleDisplay = /^\d+$/.test(v) || !v.includes('호차') ? `${v}호차` : v;
  }
  const dName = (profile.driverName || '').trim();
  const header = dName && !vehicleDisplay.includes(dName) ? `[${vehicleDisplay} ${dName}]` : `[${vehicleDisplay}]`;

  const passengerName = profile.passengerName?.trim();
  const lines: string[] = [header];

  // 담당승객 자동 바인딩 (있을 때만 노출, 없을 시 자연스럽게 생략)
  if (passengerName) {
    lines.push(`• 담당승객: ${passengerName}`);
  }

  const airportCode = flight.airportKind === 'GMP' ? 'GMP' : 'ICN';
  const airportKorean = flight.airportKind === 'GMP' ? '김포공항' : '인천공항';

  if (flight.type === 'arrival') {
    lines.push(`• 항공편명: ${flight.flightId} (${flight.airport} ➔ ${airportCode})`);
    lines.push(`• 예상착륙: ${flight.statusText}`);
    lines.push(`• 입국게이트: ${flight.arrivalLocationText}`);
  } else {
    lines.push(`• 샌딩대상: ${flight.flightId} (${airportCode} ➔ ${flight.airport})`);
    lines.push(`• 예상출발: ${flight.statusText}`);
    lines.push(`• 하차위치: ${flight.departureLocationText}`);
  }

  return lines.join('\n');
}

const AIRPORT_KO_TO_EN_MAP: Record<string, string> = {
  '싱가포르': 'Singapore',
  '로스앤젤레스': 'Los Angeles',
  '뉴욕': 'New York',
  '뉴욕/JFK': 'New York (JFK)',
  '뉴어크': 'Newark',
  '샌프란시스코': 'San Francisco',
  '시애틀': 'Seattle',
  '애틀랜타': 'Atlanta',
  '워싱턴': 'Washington D.C.',
  '시카고': 'Chicago',
  '댈러스': 'Dallas',
  '보스턴': 'Boston',
  '라스베이거스': 'Las Vegas',
  '호놀룰루': 'Honolulu',
  '밴쿠버': 'Vancouver',
  '토론토': 'Toronto',
  '런던': 'London',
  '런던/히드로': 'London (LHR)',
  '파리': 'Paris',
  '프랑크푸르트': 'Frankfurt',
  '뮌헨': 'Munich',
  '로마': 'Rome',
  '밀라노': 'Milan',
  '암스테르담': 'Amsterdam',
  '마드리드': 'Madrid',
  '바르셀로나': 'Barcelona',
  '취리히': 'Zurich',
  '비엔나': 'Vienna',
  '프라하': 'Prague',
  '이스탄불': 'Istanbul',
  '두바이': 'Dubai',
  '도하': 'Doha',
  '아부다비': 'Abu Dhabi',
  '도쿄': 'Tokyo',
  '도쿄/나리타': 'Tokyo (NRT)',
  '도쿄/하네다': 'Tokyo (HND)',
  '나리타': 'Tokyo (NRT)',
  '하네다': 'Tokyo (HND)',
  '오사카': 'Osaka',
  '오사카/간사이': 'Osaka (KIX)',
  '후쿠오카': 'Fukuoka',
  '삿포로': 'Sapporo',
  '나고야': 'Nagoya',
  '오키나와': 'Okinawa',
  '홍콩': 'Hong Kong',
  '마카오': 'Macau',
  '타이베이': 'Taipei',
  '상하이': 'Shanghai',
  '상하이/푸동': 'Shanghai (PVG)',
  '상하이/홍차오': 'Shanghai (SHA)',
  '베이징': 'Beijing',
  '광저우': 'Guangzhou',
  '선전': 'Shenzhen',
  '칭다오': 'Qingdao',
  '방콕': 'Bangkok',
  '방콕/수완나품': 'Bangkok (BKK)',
  '푸껫': 'Phuket',
  '치앙마이': 'Chiang Mai',
  '하노이': 'Hanoi',
  '호찌민': 'Ho Chi Minh',
  '다낭': 'Da Nang',
  '나트랑': 'Nha Trang',
  '푸꾸옥': 'Phu Quoc',
  '마닐라': 'Manila',
  '세부': 'Cebu',
  '발리': 'Bali',
  '자카르타': 'Jakarta',
  '쿠알라룸푸르': 'Kuala Lumpur',
  '시드니': 'Sydney',
  '멜버른': 'Melbourne',
  '브리즈번': 'Brisbane',
  '오클랜드': 'Auckland',
  '괌': 'Guam',
  '사이판': 'Saipan',
  '제주': 'Jeju',
  '부산': 'Busan',
  '김해': 'Busan (PUS)',
  '대구': 'Daegu',
  '광주': 'Gwangju',
  '여수': 'Yeosu',
  '울산': 'Ulsan',
  '포항': 'Pohang',
};

/**
 * English Multi-line KakaoTalk Report Generator for Flights
 */
export function formatFlightReportEnglish(
  profile: DriverProfile,
  flight: FlightInfo,
  translatedAirport?: string
): string {
  const rawPlate =
    profile.carNumber || profile.plateNumber || profile.vehicleNo || '116허 1514';
  const cleanVehicleNo = rawPlate.trim().replace(/^호차\s+/, '').trim() || '116허 1514';

  const lines: string[] = [`• Vehicle No.: ${cleanVehicleNo}`];

  const passengerName = profile.passengerName?.trim();
  if (passengerName) {
    lines.push(`• Passenger: ${passengerName}`);
  }

  const airportCode = flight.airportKind === 'GMP' ? 'GMP' : 'ICN';
  const rawAirport = (flight.airport || '').trim();
  const airportEn =
    translatedAirport ||
    AIRPORT_KO_TO_EN_MAP[rawAirport] ||
    (flight.airportCode && flight.airportCode !== 'DEP' && flight.airportCode !== 'ARR'
      ? flight.airportCode
      : rawAirport);

  const timeFormatted = flight.estimatedTimeFormatted || flight.scheduleTimeFormatted || '--:--';
  let statusEn = '';
  if (flight.diffMinutes >= 10) {
    statusEn = `${timeFormatted} (Delayed +${flight.diffMinutes}m)`;
  } else if (flight.diffMinutes <= -5) {
    statusEn = `${timeFormatted} (Early ${flight.diffMinutes}m)`;
  } else {
    statusEn = `${timeFormatted} (${flight.type === 'arrival' ? 'On-time Landing' : 'On-time Departure'})`;
  }

  const isGmp = flight.airportKind === 'GMP' || flight.terminal.includes('김포') || flight.terminal.includes('국내');
  const isT2 = flight.terminal.includes('2') || flight.terminalId === 'P03';
  const asianaT2 = isT2 && isAsianaOperatingFlight(flight.flightId, flight.airline);
  const terminalEn = isGmp
    ? flight.isDomestic || flight.terminal.includes('국내')
      ? 'Gimpo Domestic'
      : 'Gimpo Int’l'
    : isT2
      ? 'Terminal 2'
      : 'Terminal 1';

  if (flight.type === 'arrival') {
    const cleanExit = cleanExitCode(flight.exitNumber || flight.exit);
    const cleanCarousel = (flight.carousel || '').replace(/[^0-9]/g, '').trim();
    let arrivalGateEn = '';
    if (isGmp) {
      const gateNum = (flight.gateNumber || '').trim();
      arrivalGateEn = `${terminalEn} 1F (${gateNum ? `Gate ${gateNum}` : 'Gate TBD'})`;
    } else {
      const exitPart = cleanExit ? `Exit ${cleanExit}` : 'Exit TBD';
      const bagPart = cleanCarousel ? `Baggage #${cleanCarousel}` : 'Baggage TBD';
      arrivalGateEn = `${terminalEn} 1F (${exitPart} / ${bagPart})`;
    }

    lines.push(`• Flight: ${flight.flightId} (${airportEn} ➔ ${airportCode})`);
    lines.push(`• Est. Landing: ${statusEn}`);
    lines.push(`• Arrival Gate: ${arrivalGateEn}`);
  } else {
    const cleanCounter = (flight.checkinRange || '').trim();
    const doorMatch = (flight.suggestedDoor || flight.departureLocationText || '').match(/(\d+(?:~\d+)?)\s*번\s*도어/);
    const doorEn = doorMatch ? `Door ${doorMatch[1]}` : asianaT2 ? 'Door TBD' : isT2 ? 'Door 4~5' : 'Door 7~8';
    const floorEn = isGmp ? '2F' : '3F';
    const effectiveCounter = cleanCounter || (asianaT2 ? 'G–J' : '');
    const depLocEn = effectiveCounter
      ? `${terminalEn} ${floorEn} (Counter ${effectiveCounter} / ${doorEn})`
      : `${terminalEn} ${floorEn} (${doorEn})`;

    lines.push(`• Flight: ${flight.flightId} (${airportCode} ➔ ${airportEn})`);
    lines.push(`• Est. Departure: ${statusEn}`);
    lines.push(`• Drop-off: ${depLocEn}`);
  }

  return lines.join('\n');
}
