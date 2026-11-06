/**
 * Source-evidence guards for AI booking drafts.
 * Never geocode or mark a customer-supplied address as verified here:
 * only an HQ operator choosing a real TMAP POI may confirm coordinates.
 */
import type { EmailFlightLeg, HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function normalizeClock(hour: string, minute: string, meridiem = ''): string {
  let h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || h > 23 || !Number.isInteger(m) || m > 59) return '';
  if (meridiem.toLowerCase() === 'pm' && h < 12) h += 12;
  if (meridiem.toLowerCase() === 'am' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function airlineClock(raw: string): string {
  return raw.length === 3
    ? normalizeClock(raw.slice(0, 1), raw.slice(1))
    : normalizeClock(raw.slice(0, 2), raw.slice(2));
}

function dateForLine(line: string, year: string): string | undefined {
  const header = line.match(/^\s*\*{0,2}\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/i);
  if (header) return year + '-' + MONTHS[header[1].toLowerCase().slice(0, 3)] + '-' + header[2].padStart(2, '0');
  const korean = line.match(/^\s*(?:(\d{4})[년./-]\s*)?(\d{1,2})[월./-]\s*(\d{1,2})일?\s*(?:[–—-]|$)/);
  if (korean) return (korean[1] || year) + '-' + korean[2].padStart(2, '0') + '-' + korean[3].padStart(2, '0');
  return undefined;
}

function datedLines(body: string, pickupDate: string): Array<{ line: string; date: string }> {
  let date = pickupDate;
  const year = /^\d{4}/.test(pickupDate) ? pickupDate.slice(0, 4) : String(new Date().getFullYear());
  return body.split(/\r?\n/).map((line) => {
    const nextDate = dateForLine(line, year);
    if (nextDate) date = nextDate;
    return { line: line.trim(), date };
  });
}

const KOREAN_AIRPORTS = new Set(['ICN', 'GMP', 'PUS', 'CJU', 'TAE', 'CJJ', 'MWX']);

/** Picks up every explicit flight leg, including two arrivals and onward connections. */
export function extractFlightEvidence(body: string, pickupDate: string): EmailFlightLeg[] {
  const found: EmailFlightLeg[] = [];
  for (const { line, date } of datedLines(body, pickupDate)) {
    const flightPattern = /\b([A-Z0-9]{2}\s?\d{2,4})\s+([A-Z]{3})\s*[-–]\s*([A-Z]{3})\s+(\d{3,4})\s*\/\s*(\d{3,4})\b/gi;
    const matches = [...line.matchAll(flightPattern)];
    if (!matches.length) continue;
    const groups = [...line.matchAll(/\(([^()]+)\)/g)];
    const passengers = groups.length ? groups.at(-1)![1].split(/[,/&]/).map((name) => name.trim()).filter(Boolean) : [];
    for (const match of matches) {
      const number = match[1].replace(/\s+/g, '').toUpperCase();
      const origin = match[2].toUpperCase();
      const destination = match[3].toUpperCase();
      found.push({
        flightNumber: number,
        date,
        originAirport: origin,
        destinationAirport: destination,
        scheduledDeparture: airlineClock(match[4]),
        scheduledArrival: airlineClock(match[5]),
        passengers,
        role: KOREAN_AIRPORTS.has(destination) ? 'arrival'
          : KOREAN_AIRPORTS.has(origin) ? 'departure' : 'connection',
      });
    }
  }
  return [...new Map(found.map((item) => [item.date + ':' + item.flightNumber, item])).values()];
}

export type CustomerAddressEvidence = {
  date: string;
  time: string;
  location: string;
  address: string;
};

/** Extracts exact client-given addresses without treating them as verified POIs. */
export function extractCustomerAddressEvidence(body: string, pickupDate: string): CustomerAddressEvidence[] {
  const found: CustomerAddressEvidence[] = [];
  for (const { line, date } of datedLines(body, pickupDate)) {
    const timed = line.match(/^\s*(\d{1,2}):(\d{2})\s*(am|pm)?\s*[–—-]\s*(.+)$/i);
    if (!timed) continue;
    const time = normalizeClock(timed[1], timed[2], timed[3]);
    const rest = timed[4].trim();
    const comma = rest.indexOf(',');
    if (comma < 2) continue;
    const location = rest.slice(0, comma).trim();
    const address = rest.slice(comma + 1).trim();
    if (!/(?:-daero|-ro|-gil|\broad\b|\bstreet\b|\bave\b|대로|로\s*\d|길\s*\d)/i.test(address)) continue;
    found.push({ date, time, location, address });
  }
  return found;
}

/**
 * A conservative transliteration of explicitly given English road addresses.
 * If a road cannot be safely mapped, the original English address remains
 * the search query; there are no guessed street numbers.
 */
export function addressHintToTmapQuery(address: string): string {
  const roads: Array<[RegExp, string]> = [
    [/Seocho-daero\s*74-gil/i, '서초대로74길'],
    [/Gukjegeumyung-ro/i, '국제금융로'],
    [/Yeoui-daero/i, '여의대로'],
    [/Hangang-daero/i, '한강대로'],
    [/Sejong-daero/i, '세종대로'],
  ];
  const districts: Array<[RegExp, string]> = [
    [/Seocho-gu/i, '서초구'],
    [/Yeongdeungpo-gu/i, '영등포구'],
    [/Yongsan-gu/i, '용산구'],
    [/Jongno-gu/i, '종로구'],
  ];
  for (const [pattern, roadName] of roads) {
    const match = pattern.exec(address);
    if (!match) continue;
    const before = address.slice(0, match.index);
    const houseNumber = before.match(/(\d+(?:-\d+)?)\s*,?\s*$/)?.[1];
    const district = districts.find(([pattern]) => pattern.test(address))?.[1];
    if (houseNumber && district) {
      return ['서울', district, roadName, houseNumber].join(' ');
    }
  }
  return address.trim();
}

/** Canonical Korean POI labels; the address hint remains separate and untouched. */
export function canonicalKoreanPlaceName(name: string): string {
  const clean = name.trim();
  const aliases: Array<[RegExp, string]> = [
    [/^Gimpo (?:Int(?:ernational)?\.?\s*)?Airport(?:\s+T1)?$/i, '김포국제공항 국제선'],
    [/^Incheon (?:Int(?:ernational)?\.?\s*)?Airport\s*(?:T1|Terminal\s*1)$/i, '인천국제공항 제1여객터미널'],
    [/^Incheon (?:Int(?:ernational)?\.?\s*)?Airport\s*(?:T2|Terminal\s*2)$/i, '인천국제공항 제2여객터미널'],
    [/^Conrad Seoul$/i, '콘래드 서울'],
    [/^Samsung Fire$/i, '삼성화재'],
    [/^KB Ins(?:urance)?$/i, 'KB손해보험'],
    [/^NH Securities$/i, 'NH투자증권'],
    [/^Hanwha Life$/i, '한화생명'],
    [/^Hyundai Insurance$/i, '현대해상'],
    [/^POBA$/i, '대한지방행정공제회'],
  ];
  return aliases.find(([pattern]) => pattern.test(clean))?.[1] || clean;
}

const withNote = (notes: string | undefined, addition: string): string =>
  notes?.includes(addition) ? notes : [notes, addition].filter(Boolean).join(' · ');

function sameStop(point: RouteWaypointItem, date: string, time: string): boolean {
  return (point.date || date) === date && point.time === time;
}

function applyMovementEvidence(waypoints: RouteWaypointItem[], body: string, pickupDate: string): RouteWaypointItem[] {
  const points = [...waypoints];
  const lines = datedLines(body, pickupDate);
  for (const { line, date } of lines) {
    const standby = line.match(/Standby\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (standby) {
      const clock = normalizeClock(standby[1], standby[2], standby[3]);
      const previous = points.filter((p) => p.date === date && p.time && p.time <= clock).at(-1);
      if (previous) previous.notes = withNote(previous.notes, clock + ' 대기');
    }

    const move = line.match(/^\s*(\d{1,2}):(\d{2})\s*(am|pm)?\s*[–—-]\s*Head\s+(?:back\s+)?to\s+(.+)$/i);
    if (!move) continue;
    const departureTime = normalizeClock(move[1], move[2], move[3]);
    const target = move[4].trim();
    const dayPoints = points.filter((p) => p.date === date);
    const nextAtTime = dayPoints.find((p) => p.time === departureTime);
    const later = dayPoints.find((p) => p.time && p.time > departureTime);
    const previous = [...dayPoints].filter((p) => p.time && p.time < departureTime).at(-1);
    const departureStop = previous || (nextAtTime && dayPoints[dayPoints.indexOf(nextAtTime) - 1]);
    if (departureStop) departureStop.notes = withNote(departureStop.notes, departureTime + ' ' + target + ' 이동 시작');
    // "Head to airport at 16:30" is NOT "arrive at airport at 16:30".
    // Only clear a final arrival time if there is no later explicit appointment.
    if (nextAtTime && !later && nextAtTime === dayPoints.at(-1)) {
      nextAtTime.time = '';
      nextAtTime.notes = withNote(nextAtTime.notes, '도착시간 미제공 · ' + departureTime + ' 출발');
    }
  }
  return points;
}

/** Correct omissions from source evidence, never inventing coordinates or addresses. */
export function enrichBookingDraftWithEmailEvidence(
  draft: HqEmailExtractedDraft,
  body: string,
  aiFlights: EmailFlightLeg[] = [],
): HqEmailExtractedDraft {
  const evidenceFlights = extractFlightEvidence(body, draft.pickupDate);
  const flights = [...new Map(
    [...aiFlights, ...evidenceFlights].map((f) => [f.date + ':' + f.flightNumber.toUpperCase(), f])
  ).values()];
  const addresses = extractCustomerAddressEvidence(body, draft.pickupDate);
  const points = [...(draft.waypoints || [])].map((p) => ({ ...p }));
  const warnings = [...draft.warnings];
  for (const address of addresses) {
    const matches = points.filter((p) => sameStop(p, address.date, address.time));
    if (matches.length === 1) {
      matches[0].clientAddress = address.address;
    } else if (matches.length === 0) {
      // Safe fallback: the line explicitly names the meeting place, date,
      // time and street. Do not silently omit it from a partial AI response.
      points.push({
        id: 'source-address-' + points.length,
        order: points.length + 1,
        date: address.date, time: address.time,
        location: address.location, clientAddress: address.address,
        isPoiConfirmed: false,
      });
      warnings.push(address.date + ' ' + address.time + ' ' + address.location + ': 고객 원문에서 복원한 경유지입니다. 확인해 주세요.');
    } else {
      warnings.push(address.date + ' ' + address.time + ': 같은 시각의 경유지가 여러 개라 고객 주소를 자동 연결하지 않았습니다.');
    }
  }
  const ordered = points.sort((a, b) =>
    (a.date || draft.pickupDate).localeCompare(b.date || draft.pickupDate) ||
    (a.time || '99:99').localeCompare(b.time || '99:99') || a.order - b.order
  ).map((p, i) => ({ ...p, order: i + 1 }));
  const enriched = (ordered.length >= 2 ? applyMovementEvidence(ordered, body, draft.pickupDate) : ordered)
    .map((point) => ({ ...point, location: canonicalKoreanPlaceName(point.location) }));
  const first = enriched[0], last = enriched.at(-1);
  const originalFlightCodes = new Set((body.toUpperCase().match(/\b[A-Z0-9]{2}\d{2,4}\b/g) || []).filter((s) => /[A-Z]/.test(s)));
  for (const code of originalFlightCodes) {
    if (!flights.some((f) => f.flightNumber === code)) {
      warnings.push('항공편 ' + code + '의 세부 경로를 확인하지 못했습니다. 메일 원문을 확인해 주세요.');
    }
  }
  return {
    ...draft, flights,
    flightNumber: flights.find((f) => f.date === draft.pickupDate && f.role !== 'connection')?.flightNumber || draft.flightNumber,
    waypoints: enriched.length >= 2 ? enriched : draft.waypoints,
    pickupLocation: first?.location || draft.pickupLocation,
    pickupTime: first?.time || draft.pickupTime,
    pickupProvidedAddress: first?.clientAddress || draft.pickupProvidedAddress,
    dropoffLocation: last?.location || draft.dropoffLocation,
    dropoffProvidedAddress: last?.clientAddress || draft.dropoffProvidedAddress,
    warnings,
  };
}
