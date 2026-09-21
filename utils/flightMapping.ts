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
 * Resolves Terminal name from Incheon Airport terminal ID or flight prefix
 */
export function resolveTerminal(terminalId?: string | null, flightId?: string): { terminal: string; isT2: boolean } {
  const prefix = (flightId || '').slice(0, 2).toUpperCase();
  const tId = (terminalId || '').toUpperCase();

  // Rule 1: Asiana Airlines (OZ) or P01/P02 is strictly Terminal 1
  // (Incheon Airport API mistakenly returns P03 for Asiana flights like OZ741)
  if (prefix === 'OZ' || tId === 'P01' || tId === 'P02') {
    return { terminal: '제1여객터미널', isT2: false };
  }

  // Rule 2: T2 airlines or explicitly P03
  const t2Airlines = ['KE', 'DL', 'AF', 'KL', 'AM', 'GA', 'ME', 'RO', 'SV', 'UX', 'VN', 'MF', 'LJ'];
  if (t2Airlines.includes(prefix) || tId === 'P03') {
    return { terminal: '제2여객터미널', isT2: true };
  }

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
  checkinRange?: string | null
): { departureLocationText: string; suggestedDoor: string } {
  const cleanCounter = (checkinRange || '').trim();

  // If check-in counter is confirmed by airport API
  if (cleanCounter) {
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

  if (prefix === 'OZ') {
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

/**
 * Intelligent Arrival Gate Mapping (입국장 게이트 매핑)
 */
export function resolveArrivalGate(
  terminal: string,
  exitNumber?: string | null,
  carousel?: string | null
): string {
  const cleanExit = (exitNumber || '').trim();
  const cleanCarousel = (carousel || '').trim();
  const exitFormatted = cleanExit ? (cleanExit.endsWith('출구') ? cleanExit : `${cleanExit}출구`) : '';

  if (exitFormatted && cleanCarousel) {
    return `${terminal} 1층 (${exitFormatted} / 수하물 ${cleanCarousel}번)`;
  }
  if (exitFormatted) {
    return `${terminal} 1층 (${exitFormatted} / 수하물 수취대 배정 중)`;
  }
  return `${terminal} 1층 (입국 게이트 배정 중 / 현장 전광판 확인)`;
}

/**
 * Maps arrival exit (A~F) to 1st floor curbside pickup gate
 */
export function getCurbsideGate(terminal: string, exit: string): string {
  const cleanTerminal = terminal.replace(/\s+/g, '');
  const cleanExit = exit.trim().replace(/출구$/, '').trim().toUpperCase();

  // 제2여객터미널 (T2)
  if (cleanTerminal.includes('제2') || cleanTerminal.includes('T2')) {
    if (cleanExit === 'A') return '외부 1~3번 게이트';
    if (cleanExit === 'B') return '외부 4~5번 게이트';
    return '외부 게이트 확인 필요';
  }

  // 제1여객터미널 (T1)
  if (cleanTerminal.includes('제1') || cleanTerminal.includes('T1')) {
    if (['A', 'B'].includes(cleanExit)) return '외부 1~4번 게이트';
    if (['C', 'D'].includes(cleanExit)) return '외부 5~10번 게이트';
    if (['E', 'F'].includes(cleanExit)) return '외부 11~14번 게이트';
    return '외부 게이트 확인 필요';
  }

  return '외부 게이트 확인 필요';
}

/**
 * Constructs precision LocationPreset for navigation destination
 */
export function getFlightLocationPreset(terminal: string, type: FlightType): LocationPreset {
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
  let v = (profile.vehicleNo || '').trim().replace(/호차\s*$/, '').trim();
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

  if (flight.type === 'arrival') {
    lines.push(`• 항공편명: ${flight.flightId} (${flight.airport} ➔ ICN)`);
    lines.push(`• 예상착륙: ${flight.statusText}`);
    lines.push(`• 입국게이트: ${flight.arrivalLocationText}`);
    const curbside = flight.curbsideGate || (flight.exitNumber ? getCurbsideGate(flight.terminal, flight.exitNumber) : '');
    if (curbside && curbside !== '외부 게이트 확인 필요') {
      lines.push(`• 영접위치: ${curbside}`);
    }
  } else {
    lines.push(`• 샌딩대상: ${flight.flightId} (ICN ➔ ${flight.airport})`);
    lines.push(`• 예상출발: ${flight.statusText}`);
    lines.push(`• 하차위치: ${flight.departureLocationText}`);
  }

  return lines.join('\n');
}
