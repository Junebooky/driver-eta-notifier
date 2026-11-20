import type { EmailExcelVehicleSchedule, EmailFlightLeg, HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import type { AnalyzedScheduleAttachment } from '@/services/emailAttachmentIntake';
import { scheduleHeaderDate } from './emailAttachmentCoverage';
import { resolveTerminal } from './flightMapping';

export interface ExcelExtractedFlight {
  flightNumber: string;
  originAirport?: string;
  destinationAirport?: string;
  role?: 'arrival' | 'departure' | 'connection';
}

/** One non-empty appointment cell in a calendar-style Excel grid. */
export interface ExcelCalendarBlock {
  sheetName: string;
  cell: string;
  dateLabel: string;
  time: string;
  clockSource: 'text' | 'grid' | 'unknown';
  title: string;
  originalText: string;
  clientAddress?: string;
  extractedLocation?: string;
  extractedFlight?: ExcelExtractedFlight;
}

export interface DatedExcelCalendarBlock extends ExcelCalendarBlock {
  filename: string;
  sourceSha256: string;
  sourceIndex: number;
  date: string;
}

export interface ExcelCalendarHeaderMatch {
  headerAt: number;
  timeColumn: number;
  datedColumns: Array<{ index: number; label: string }>;
}

const normalText = (text: string) => text.replace(/\s+/g, ' ').trim();
const isDateLabel = (value: string) => {
  const trimmed = value.trim();
  return /^(?:(?:Sun(?:day)?|Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?)\.?,?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(trimmed) ||
    /^\d{1,4}[-/.년]\s*\d{1,2}/.test(trimmed) ||
    /^\d{1,2}\s*월\s*\d{1,2}/.test(trimmed);
};

function asClock(hour: number, minute: number, period?: string): string | undefined {
  if (period) {
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return;
    hour = (hour % 12) + (period.toLowerCase() === 'pm' ? 12 : 0);
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return;
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

/** Prefer explicit appointment time (start of range or exact clock); the grid's time row is the fallback. */
export function excelCalendarClock(value: string): string | undefined {
  const input = value.trim();
  const range = input.match(/\b(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?\s*[~–—-]\s*(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)\b/i);
  if (range) {
    const startH = Number(range[1]);
    const startM = Number(range[2] || 0);
    const startPeriod = range[3]?.toLowerCase();
    const endH = Number(range[4]);
    const endPeriod = range[6].toLowerCase();
    let resolvedPeriod = startPeriod;
    if (!resolvedPeriod) {
      if (endPeriod === 'am') {
        resolvedPeriod = 'am';
      } else {
        resolvedPeriod = startH === 12 || (endH !== 12 && startH <= endH) ? 'pm' : 'am';
      }
    }
    return asClock(startH, startM, resolvedPeriod);
  }
  const m = input.match(/\b(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)\b/i);
  if (m) return asClock(Number(m[1]), Number(m[2] || 0), m[3]);
  // Client prose often writes "meeting at 14:30" without AM/PM.
  const h24 = input.match(/\b(\d{1,2}):(\d{2})\b/);
  if (h24) return asClock(Number(h24[1]), Number(h24[2]));
  const fraction = Number(input);
  if (input && Number.isFinite(fraction) && fraction >= 0 && fraction < 1) {
    const minutes = Math.round(fraction * 1440);
    return asClock(Math.floor(minutes / 60), minutes % 60);
  }
  return undefined;
}

const FLIGHT_CONTEXT_RE = /\b(?:flight|arriving|arrive|depart(?:ing|ure)?|airport|ICN|GMP|HND|NRT|KIX|PVG|SHA|PEK|PKX|TSA|TPE|HKG|SIN|LAX|JFK|SFO|HNL|PUS|CJU)\b|공항|입국|출국|도착|출발|편명/i;
const KOREAN_AIRPORT_CODES = new Set(['ICN', 'GMP', 'PUS', 'CJU', 'TAE', 'CJJ', 'MWX']);
const GMP_INTL_PARTNERS = new Set(['HND', 'NRT', 'KIX', 'SHA', 'PVG', 'PEK', 'PKX', 'TSA', 'TPE', 'HKG']);
const GMP_DOM_PARTNERS = new Set(['CJU', 'PUS', 'USN', 'KWJ', 'RSU', 'MWX', 'YNY']);
const EXCLUDED_FLIGHT_PREFIXES = new Set([
  'AM', 'PM', 'AT', 'IN', 'TO', 'ON', 'BY', 'OR', 'OF', 'NO', 'SO', 'GO', 'UP', 'IF', 'IS', 'IT', 'AS', 'AN', 'WE', 'HE',
  'T1', 'T2', 'T3', 'T4', 'P0', 'P1', 'P2', 'P3', 'B1', 'B2', 'B3', 'F1', 'F2',
]);
const UNKNOWN_VALUE_RE = /^[?？]+$|^(?:unknown|tbd|tba|n\/?a|none|미정|확인\s*필요|추후\s*공지)$/i;

function isQuestionPlaceholder(value: string): boolean {
  const cleaned = value.trim();
  return !cleaned || /[?？]$/.test(cleaned) || /(?:주소|address|adderss|location|장소|venue)\s*[?？]/i.test(cleaned) || UNKNOWN_VALUE_RE.test(cleaned);
}

/** Extract flight code & route airports from natural-language schedule cells like `Arnold is arriving into GMP at 3pm (KE2102 from HND)`. */
export function flightFromOriginal(text: string): ExcelExtractedFlight | undefined {
  if (!text || !FLIGHT_CONTEXT_RE.test(text)) return undefined;
  const codePattern = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s*-?\s*(\d{2,4})\b/g;
  let flightNumber = '';
  for (const match of text.toUpperCase().matchAll(codePattern)) {
    const prefix = match[1];
    const digits = match[2];
    if (EXCLUDED_FLIGHT_PREFIXES.has(prefix)) continue;
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 2);
    if (/^(?:층|호|길|로|F\b)/i.test(after)) continue;
    if (digits.length === 4 && /^(?:19|20)\d\d$/.test(digits) && !/^(?:KE|OZ|NH|JL|SQ|CX|UA|DL|AA|AF|KL|LH|BA|TR|7C|LJ|TW|BX|ZE|RS|YP|CI|BR|CZ|MU|CA|FM|HO|HX|PR|TG|VN|MH|GA|EK|QR|EY|TK)/.test(prefix)) {
      continue;
    }
    flightNumber = prefix + digits;
    break;
  }
  if (!flightNumber) return undefined;

  const pair = text.toUpperCase().match(/\b([A-Z]{3})\s*[-–/→>]\s*([A-Z]{3})\b/);
  let originAirport = pair?.[1] || text.toUpperCase().match(/\bFROM\s+([A-Z]{3})\b/)?.[1];
  let destinationAirport = pair?.[2] || text.toUpperCase().match(/\b(?:INTO|TO)\s+([A-Z]{3})\b/)?.[1];

  const hasDepartureCue = /\b(?:depart(?:ing|ure)?|leave\s+for|flight\s+out)\b|출발|출국/i.test(text);
  const hasArrivalCue = /\b(?:arriving|arrive|arrival)\b|도착|입국/i.test(text);
  const mentionedGmp = /(?:\bGMP\b|gimpo|김포)/i.test(text);
  const mentionedIcn = /(?:\bICN\b|incheon|인천)/i.test(text);

  if (hasDepartureCue && !hasArrivalCue) {
    if (!originAirport && mentionedGmp && destinationAirport !== 'GMP') originAirport = 'GMP';
    else if (!originAirport && mentionedIcn && destinationAirport !== 'ICN') originAirport = 'ICN';
  } else {
    if (!destinationAirport && originAirport !== 'GMP' && mentionedGmp) destinationAirport = 'GMP';
    else if (!destinationAirport && originAirport !== 'ICN' && mentionedIcn) destinationAirport = 'ICN';
    if (!originAirport && destinationAirport !== 'GMP' && /\bfrom\s+(?:gimpo|김포)/i.test(text)) {
      originAirport = 'GMP';
    } else if (!originAirport && destinationAirport !== 'ICN' && /\bfrom\s+(?:incheon|인천)/i.test(text)) {
      originAirport = 'ICN';
    }
  }

  let role: ExcelExtractedFlight['role'];
  if (hasDepartureCue && !hasArrivalCue && (!destinationAirport || !KOREAN_AIRPORT_CODES.has(destinationAirport))) {
    role = 'departure';
  } else if (destinationAirport && KOREAN_AIRPORT_CODES.has(destinationAirport)) {
    role = 'arrival';
  } else if (originAirport && KOREAN_AIRPORT_CODES.has(originAirport)) {
    role = 'departure';
  } else if (hasArrivalCue) {
    role = 'arrival';
  } else if (hasDepartureCue) {
    role = 'departure';
  }

  return {
    flightNumber,
    ...(originAirport ? { originAirport } : {}),
    ...(destinationAirport ? { destinationAirport } : {}),
    ...(role ? { role } : {}),
  };
}

function extractLocationLabelValues(text: string): string[] {
  const rawLines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const cleanedLines = rawLines.map(line => line.replace(/^[*•-]+\s*/, '').trim());
  const labelRe = /^(?:location|venue|place|장소|식당|호텔|미팅\s*장소)\s*[:：]\s*(.*)$/i;
  const inlineRe = /(?:location|venue|place|장소)\s*[:：]\s*(.+)$/i;
  const stopMetaRe = /^(?:accompanied|attendees|participants|address|adderss|주소|note|notes|비고|contact|담당|time|시간)\s*(?:[:：]|by\b)/i;

  let startIndex = cleanedLines.findIndex(line => labelRe.test(line));
  let firstValue = '';
  if (startIndex >= 0) {
    firstValue = cleanedLines[startIndex].replace(labelRe, '$1').trim();
  } else {
    startIndex = cleanedLines.findIndex(line => inlineRe.test(line));
    if (startIndex < 0) return [];
    firstValue = cleanedLines[startIndex].match(inlineRe)?.[1]?.trim() || '';
  }

  const values: string[] = [];
  if (firstValue && !isQuestionPlaceholder(firstValue)) values.push(firstValue);

  for (let i = startIndex + 1; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const clean = cleanedLines[i];
    if (/^[*•-]/.test(raw)) break;
    if (labelRe.test(clean) || stopMetaRe.test(clean)) break;
    if (isQuestionPlaceholder(clean)) continue;
    values.push(clean);
  }
  return values;
}

const KNOWN_KOREA_VENUES: Array<[RegExp, string]> = [
  [/신라호텔|shilla\s*hotel/i, '서울신라호텔'],
  [/조선팰리스|josun\s*palace/i, '조선팰리스 서울 강남'],
  [/포시즌스|four\s*seasons/i, '포시즌스 호텔 서울'],
  [/콘래드|conrad\s*seoul/i, '콘래드 서울'],
  [/그랜드\s*하얏트|grand\s*hyatt/i, '그랜드 하얏트 서울'],
  [/시그니엘|signiel/i, '시그니엘 서울'],
  [/롯데호텔|lotte\s*hotel/i, '롯데호텔 서울'],
  [/파크\s*하얏트|park\s*hyatt/i, '파크 하얏트 서울'],
  [/반얀트리|banyan\s*tree/i, '반얀트리 클럽 앤 스파 서울'],
  [/페어몬트|fairmont/i, '페어몬트 앰배서더 서울'],
  [/jw\s*메리어트|jw\s*marriott/i, 'JW 메리어트 호텔 서울'],
  [/인터컨티넨탈|intercontinental/i, '그랜드 인터컨티넨탈 서울 파르나스'],
  [/웨스틴\s*조선|westin\s*josun/i, '웨스틴 조선 서울'],
  [/코엑스|\bcoex\b/i, '코엑스'],
];

function airportLocationFromText(
  text: string,
  flight?: ExcelExtractedFlight,
  date?: string,
): string | undefined {
  if (/(?:\bGMP\b|gimpo|김포(?:국제)?공항)/i.test(text)) {
    const intl = /국제선|international/i.test(text) ||
      Boolean(flight?.originAirport && GMP_INTL_PARTNERS.has(flight.originAirport)) ||
      Boolean(flight?.destinationAirport && GMP_INTL_PARTNERS.has(flight.destinationAirport));
    const dom = /국내선|domestic/i.test(text) ||
      Boolean(flight?.originAirport && GMP_DOM_PARTNERS.has(flight.originAirport)) ||
      Boolean(flight?.destinationAirport && GMP_DOM_PARTNERS.has(flight.destinationAirport));
    if (intl) return '김포국제공항 국제선';
    if (dom) return '김포국제공항 국내선';
    return '김포국제공항';
  }
  if (/(?:\bICN\b|incheon|인천(?:국제)?공항)/i.test(text)) {
    if (/\b(?:T2|Terminal\s*2)\b|제?\s*2\s*(?:여객)?터미널/i.test(text)) return '인천국제공항 제2여객터미널';
    if (/\b(?:T1|Terminal\s*1)\b|제?\s*1\s*(?:여객)?터미널/i.test(text)) return '인천국제공항 제1여객터미널';
    if (flight?.flightNumber) {
      return `인천국제공항 ${resolveTerminal(undefined, flight.flightNumber, date).terminal}`;
    }
    return '인천국제공항';
  }
  if (/(?:\bPUS\b|gimhae|김해(?:국제)?공항)/i.test(text)) return '김해국제공항';
  if (/(?:\bCJU\b|jeju\s*(?:int(?:ernational)?\.?\s*)?airport|제주(?:국제)?공항)/i.test(text)) return '제주국제공항';
  return undefined;
}

/** Extract clean venue/airport location for TMAP search without rewriting `entry.title`. */
export function locationFromOriginal(
  text: string,
  flight?: ExcelExtractedFlight,
  date?: string,
): string | undefined {
  const labelled = extractLocationLabelValues(text);
  if (labelled.length > 0) {
    const koreanLine = labelled.find(item => /[가-힣]/.test(item));
    return koreanLine || labelled[0];
  }

  const airport = airportLocationFromText(text, flight, date);
  if (airport) return airport;

  const nonQuestionText = text
    .split(/\r?\n/)
    .filter(line => !/[?？]\s*$/.test(line.trim()))
    .join('\n');
  for (const [pattern, canonical] of KNOWN_KOREA_VENUES) {
    if (pattern.test(nonQuestionText)) return canonical;
  }
  return undefined;
}

function addressFromOriginal(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map(line => line.trim().replace(/^\*+\s*/, '')).filter(Boolean);
  // "주소?" is NOT an address. Keep it marked as client unspecified.
  const explicit = lines.findIndex(line => /^(?:address|adderss|주소)\s*[:：]/i.test(line) && !/[?？]$/.test(line));
  if (explicit >= 0) {
    const remaining = lines.slice(explicit).map(line => line.replace(/^(?:address|adderss|주소)\s*[:：]\s*/i, '')).filter(Boolean);
    const joined = remaining.join(' ').trim();
    return joined && !/(?:주소|address|adderss)\s*[?？]/i.test(joined) ? joined : undefined;
  }
  const inlineIdx = lines.findIndex(line => /(?:address|adderss|주소)\s*[:：]\s*(.+)$/i.test(line) && !/[?？]$/.test(line));
  if (inlineIdx >= 0) {
    const match = lines[inlineIdx].match(/(?:address|adderss|주소)\s*[:：]\s*(.+)$/i);
    const captured = match?.[1]?.trim() || '';
    const continuations: string[] = [];
    for (let i = inlineIdx + 1; i < lines.length; i++) {
      const nextLine = lines[i];
      if (/^[*•-]/.test(nextLine) || /^(?:address|adderss|location|주소|장소)\s*[:：]/i.test(nextLine)) break;
      if (/[?？]$/.test(nextLine)) continue;
      continuations.push(nextLine);
    }
    const joined = [captured, ...continuations].filter(Boolean).join(' ').trim();
    return joined && !/(?:주소|address|adderss)\s*[?？]/i.test(joined) ? joined : undefined;
  }
  const street = lines.findIndex(line => /[가-힣0-9]+(?:로|길)\s*\d/.test(line));
  if (street >= 0) return lines.slice(street).join(' ').trim() || undefined;

  const labelled = extractLocationLabelValues(text);
  if (labelled.length > 0) {
    return labelled.join(' · ').trim() || undefined;
  }
  return undefined;
}

const isTimeOnlyLine = (line: string) =>
  /^\(?\s*\d{1,2}(?::\d{2}){0,2}\s*(?:am|pm)?\s*(?:[~–—-]\s*\d{1,2}(?::\d{2}){0,2}\s*(?:am|pm)?)?\s*\)?[,.:]?\s*$/i.test(line);

function extractTitleFromOriginal(originalText: string): string {
  const lines = originalText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return originalText;
  const titleIndex = lines.length > 1 && isTimeOnlyLine(lines[0]) ? 1 : 0;
  let title = lines[titleIndex] || originalText;
  if (
    lines.length > titleIndex + 1 &&
    /(?:with|into|at|to|for|of|from|by|&|-|,)\s*$/i.test(title) &&
    !/^(?:[*•-]|(?:address|adderss|location|주소|장소)\s*[:：]|(?:서울|인천|강남구|종로구|중구|용산구|서초구|송파구|영등포구|마포구))/i.test(lines[titleIndex + 1])
  ) {
    title = `${title} ${lines[titleIndex + 1]}`;
  }
  return title.replace(/\s+(?:address|adderss|주소)\s*[:：].*$/i, '').trim() || title;
}

function extractPrimaryExplicitClock(originalText: string, hasGridTime: boolean): string | undefined {
  const lines = originalText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    if (index > 0 && hasGridTime && /\b(?:return\s+to|back\s+to|depart\s+for)\b|복귀/i.test(line)) {
      continue;
    }
    const clock = excelCalendarClock(line);
    if (clock) return clock;
  }
  return undefined;
}

function excelColumn(index: number) {
  let i = index + 1;
  let answer = '';
  while (i > 0) {
    const rest = (i - 1) % 26;
    answer = String.fromCharCode(65 + rest) + answer;
    i = Math.floor((i - 1) / 26);
  }
  return answer;
}

export function findExcelCalendarHeader(
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): ExcelCalendarHeaderMatch | null {
  const explicitAt = rows.findIndex(row => {
    const first = row.findIndex(value => /^(date|time|날짜|일자|일시|시간)$/i.test(String(value).trim()));
    return first >= 0 && row.filter((v, i) => i !== first && isDateLabel(String(v))).length >= 2;
  });
  if (explicitAt >= 0) {
    const header = rows[explicitAt];
    const timeColumn = header.findIndex(value => /^(date|time|날짜|일자|일시|시간)$/i.test(String(value).trim()));
    const datedColumns = header.map((value, index) => ({ index, label: String(value).trim() }))
      .filter(item => item.index !== timeColumn && isDateLabel(item.label));
    return { headerAt: explicitAt, timeColumn, datedColumns };
  }

  const headerlessAt = rows.findIndex(row => row.filter(v => isDateLabel(String(v))).length >= 2);
  if (headerlessAt < 0) return null;
  const header = rows[headerlessAt];
  const datedColumns = header.map((value, index) => ({ index, label: String(value).trim() }))
    .filter(item => isDateLabel(item.label));
  const datedIndices = new Set(datedColumns.map(item => item.index));
  const firstDatedCol = datedColumns[0]?.index ?? 0;

  let bestCol = -1;
  let bestHits = 0;
  const maxCol = rows.slice(headerlessAt + 1, headerlessAt + 51).reduce((m, r) => Math.max(m, r.length), header.length);
  for (let col = 0; col < maxCol; col++) {
    if (datedIndices.has(col)) continue;
    let hits = 0;
    for (let r = headerlessAt + 1; r < Math.min(rows.length, headerlessAt + 51); r++) {
      if (excelCalendarClock(String(rows[r][col] ?? ''))) hits++;
    }
    if (hits > bestHits || (hits > 0 && hits === bestHits && col < firstDatedCol && bestCol >= firstDatedCol)) {
      bestHits = hits;
      bestCol = col;
    }
  }
  return {
    headerAt: headerlessAt,
    timeColumn: bestHits > 0 ? bestCol : -1,
    datedColumns,
  };
}

/** Pure structural extraction: no Gemini, network, TMAP or invented POIs. */
export function extractExcelCalendarBlocks(
  sheetName: string,
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
  startRow = 0,
  startColumn = 0,
): ExcelCalendarBlock[] {
  const headerMatch = findExcelCalendarHeader(rows);
  if (!headerMatch) return [];
  const { headerAt, timeColumn, datedColumns } = headerMatch;
  const result: ExcelCalendarBlock[] = [];
  for (let row = headerAt + 1; row < rows.length; row++) {
    const gridTime = timeColumn >= 0 ? excelCalendarClock(String(rows[row][timeColumn] ?? '')) : undefined;
    for (const column of datedColumns) {
      const originalText = String(rows[row][column.index] ?? '').trim();
      if (!originalText) continue;
      // One occupied cell = one event; merged cells do not create additional events.
      const title = extractTitleFromOriginal(originalText);
      const explicitTime = extractPrimaryExplicitClock(originalText, Boolean(gridTime));
      const extractedFlight = flightFromOriginal(originalText);
      const extractedLocation = locationFromOriginal(originalText, extractedFlight);
      result.push({
        sheetName,
        cell: excelColumn(startColumn + column.index) + (startRow + row + 1),
        dateLabel: column.label,
        time: explicitTime || gridTime || '',
        clockSource: explicitTime ? 'text' : gridTime ? 'grid' : 'unknown',
        title,
        originalText,
        clientAddress: addressFromOriginal(originalText),
        ...(extractedLocation ? { extractedLocation } : {}),
        ...(extractedFlight ? { extractedFlight } : {}),
      });
    }
  }
  return result;
}

export function datedExcelCalendarBlocks(
  files: AnalyzedScheduleAttachment[],
  referenceYear: number,
): DatedExcelCalendarBlock[] {
  const records: DatedExcelCalendarBlock[] = [];
  for (const [sourceIndex, file] of files.entries()) {
    for (const entry of file.calendarBlocks || []) {
      const date = scheduleHeaderDate(entry.dateLabel, referenceYear);
      if (date) {
        const extractedFlight = entry.extractedFlight || flightFromOriginal(entry.originalText);
        const extractedLocation = locationFromOriginal(entry.originalText, extractedFlight, date) || entry.extractedLocation;
        records.push({
          ...entry,
          ...(extractedFlight ? { extractedFlight } : {}),
          ...(extractedLocation ? { extractedLocation } : {}),
          date,
          filename: file.filename,
          sourceSha256: file.sha256,
          sourceIndex,
        });
      }
    }
  }
  return records;
}

export function extractExcelCalendarFlights(records: ReadonlyArray<DatedExcelCalendarBlock>): EmailFlightLeg[] {
  const collected: EmailFlightLeg[] = [];
  for (const record of records) {
    const flight = record.extractedFlight || flightFromOriginal(record.originalText);
    if (!flight?.flightNumber) continue;
    collected.push({
      flightNumber: flight.flightNumber,
      date: record.date,
      ...(flight.originAirport ? { originAirport: flight.originAirport } : {}),
      ...(flight.destinationAirport ? { destinationAirport: flight.destinationAirport } : {}),
      ...(flight.role === 'arrival' && record.time ? { scheduledArrival: record.time } : {}),
      ...(flight.role === 'departure' && record.time ? { scheduledDeparture: record.time } : {}),
      role: flight.role || 'unknown',
    });
  }
  return [...new Map(collected.map(f => [`${f.date}:${f.flightNumber.toUpperCase()}`, f])).values()];
}

export function mergeDraftFlights(
  existing: ReadonlyArray<EmailFlightLeg> = [],
  incoming: ReadonlyArray<EmailFlightLeg> = [],
): EmailFlightLeg[] {
  const byKey = new Map<string, EmailFlightLeg>();
  for (const leg of incoming) {
    if (!leg.flightNumber?.trim()) continue;
    byKey.set(`${leg.date}:${leg.flightNumber.replace(/[\s-]/g, '').toUpperCase()}`, leg);
  }
  for (const leg of existing) {
    if (!leg.flightNumber?.trim()) continue;
    const key = `${leg.date}:${leg.flightNumber.replace(/[\s-]/g, '').toUpperCase()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, leg);
      continue;
    }
    byKey.set(key, {
      ...prev,
      ...leg,
      originAirport: leg.originAirport || prev.originAirport,
      destinationAirport: leg.destinationAirport || prev.destinationAirport,
      scheduledArrival: leg.scheduledArrival || prev.scheduledArrival,
      scheduledDeparture: leg.scheduledDeparture || prev.scheduledDeparture,
      role: leg.role && leg.role !== 'unknown' ? leg.role : prev.role,
      passengers: leg.passengers?.length ? leg.passengers : prev.passengers,
    });
  }
  return [...byKey.values()];
}

function stableCalendarKey(record: DatedExcelCalendarBlock): string {
  return [record.sourceIndex, record.sourceSha256.slice(0, 16), record.sheetName, record.cell].join(':');
}

function hasCellLocationSupport(rawText: string, candidateLocation: string): boolean {
  const normRaw = normalText(rawText).toLowerCase();
  const normCand = normalText(candidateLocation).toLowerCase();
  if (!normCand) return false;
  if (normRaw.includes(normCand)) return true;
  if (/\bgmp\b|gimpo|김포/i.test(normRaw) && /김포|gimpo|gmp/i.test(normCand)) return true;
  if (/\bicn\b|incheon|인천/i.test(normRaw) && /인천|incheon|icn/i.test(normCand)) return true;
  const tokens = normCand.split(/[\s,()·]+/).filter(token => token.length >= 2);
  return tokens.length > 0 && tokens.every(token => normRaw.includes(token));
}

export function calendarRecordsToWaypoints(
  records: DatedExcelCalendarBlock[],
  modelWaypoints: ReadonlyArray<RouteWaypointItem> = [],
): { waypoints: RouteWaypointItem[]; ordered: DatedExcelCalendarBlock[]; consumed: Set<string> } {
  const ordered = [...records].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time) ||
    a.cell.localeCompare(b.cell));
  const consumed = new Set<string>();
  const calendarCounts = new Map<string, number>();
  for (const r of ordered) {
    const key = r.date + '|' + r.time;
    calendarCounts.set(key, (calendarCounts.get(key) || 0) + 1);
  }

  const fromExcel: RouteWaypointItem[] = ordered.map((entry) => {
    const timeKey = entry.date + '|' + entry.time;
    const candidate = (calendarCounts.get(timeKey) === 1 ? modelWaypoints.find(point =>
      !consumed.has(point.id) && point.date === entry.date && point.time === entry.time
    ) : undefined);
    if (candidate) consumed.add(candidate.id);
    // Never trust an AI-only address that is absent from the original cell.
    const echoedAddress = candidate?.clientAddress &&
      normalText(entry.originalText).toLowerCase().includes(normalText(candidate.clientAddress).toLowerCase())
      ? candidate.clientAddress : undefined;
    const availableAddress = entry.clientAddress || echoedAddress;
    const supportedLocation = Boolean(
      candidate?.location &&
      (availableAddress || entry.extractedLocation || /(?:location|venue|장소)\s*[:：]/i.test(entry.originalText)) &&
      (hasCellLocationSupport(entry.originalText, candidate.location) ||
        (entry.extractedLocation ? hasCellLocationSupport(entry.extractedLocation, candidate.location) : false))
    );
    const resolvedLocation = (() => {
      if (entry.extractedLocation) {
        if (supportedLocation && candidate?.location && /[가-힣]/.test(candidate.location) && !/[가-힣]/.test(entry.extractedLocation)) {
          return candidate.location;
        }
        return entry.extractedLocation;
      }
      if (supportedLocation && candidate?.location) {
        return candidate.location;
      }
      return entry.title;
    })();
    return {
      id: 'excel-' + stableCalendarKey(entry),
      order: 0,
      date: entry.date,
      time: entry.time,
      location: resolvedLocation,
      clientAddress: availableAddress,
      // Explicitly unknown; manual HQ TMAP confirmation is still mandatory.
      isPoiConfirmed: false,
      notes: [
        '원본 Excel ' + entry.filename + ' / ' + entry.sheetName + '!' + entry.cell,
        entry.clockSource === 'grid' ? '시간표 행 기준 · 실제 출발 시각 미확정' : '',
        entry.originalText,
      ].filter(Boolean).join('\n'),
    };
  });

  const sorted = [...fromExcel]
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') ||
      (a.time || '').localeCompare(b.time || '') || a.id.localeCompare(b.id))
    .map((point, index) => ({ ...point, order: index + 1 }));
  return { waypoints: sorted, ordered, consumed };
}

/**
 * A single chronological calendar is a factual ledger, not an AI suggestion.
 * Every source cell must appear in the draft, even when Gemini returns one stop.
 * We retain useful AI POI labels ONLY when matched by unique date+time and
 * explicitly supported by client text; none of them become TMAP-verified.
 */
export function reconcileSingleExcelCalendar(
  draft: HqEmailExtractedDraft,
  records: DatedExcelCalendarBlock[],
): HqEmailExtractedDraft {
  if (!records.length) return draft;
  const grouped = new Set(records.map(item => item.sourceIndex + '/' + item.sheetName));
  if (grouped.size !== 1) {
    return {
      ...draft,
      warnings: [...(draft.warnings || []),
        '여러 차량/시트의 원본 일정은 서로 다른 운행일 수 있어 하나의 경로로 자동 합치지 않았습니다. 원본 일정 대조 후 차량별 경로를 나눠 주세요.'],
    };
  }
  const allModel = draft.waypoints || [];
  const { waypoints: fromExcel, ordered, consumed } = calendarRecordsToWaypoints(records, allModel);

  // Preserve extra explicit model/email stops instead of quietly deleting them,
  // but don't re-add Gemini's duplicate summary of a source cell.
  const extra = allModel.filter(point => {
    if (consumed.has(point.id)) return false;
    if (!point.date) return true;
    if (ordered.some(entry => entry.date === point.date && entry.time === point.time)) return false;
    return !ordered.some(entry => entry.date === point.date &&
      normalText(entry.originalText).toLowerCase().includes(normalText(point.location).toLowerCase()) &&
      point.location.trim().length > 3);
  });
  const waypoints = [...fromExcel, ...extra]
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') ||
      (a.time || '').localeCompare(b.time || '') || a.id.localeCompare(b.id))
    .map((point, index) => ({ ...point, order: index + 1 }));
  const first = waypoints[0], last = waypoints[waypoints.length - 1];
  const mergedFlights = mergeDraftFlights(draft.flights, extractExcelCalendarFlights(records));
  return {
    ...draft,
    waypoints,
    flights: mergedFlights.length ? mergedFlights : draft.flights,
    flightNumber: draft.flightNumber || mergedFlights[0]?.flightNumber || '',
    pickupDate: first?.date || draft.pickupDate,
    pickupTime: first?.time || draft.pickupTime,
    pickupLocation: first?.location || draft.pickupLocation,
    pickupProvidedAddress: first?.clientAddress || draft.pickupProvidedAddress,
    isPickupPoiConfirmed: false,
    dropoffLocation: last?.location || draft.dropoffLocation,
    dropoffProvidedAddress: last?.clientAddress || draft.dropoffProvidedAddress,
    isDropoffPoiConfirmed: false,
  };
}

/** Build structured per-attachment/per-sheet full schedules without merging different vehicles into one route. */
export function buildExcelVehicleSchedules(
  records: DatedExcelCalendarBlock[],
  modelWaypoints: ReadonlyArray<RouteWaypointItem> = [],
): EmailExcelVehicleSchedule[] {
  if (!records.length) return [];
  const byGroup = new Map<string, DatedExcelCalendarBlock[]>();
  const sheetsPerSource = new Map<number, Set<string>>();
  for (const record of records) {
    const key = `${record.sourceIndex}:${record.sourceSha256.slice(0, 12)}:${record.sheetName}`;
    byGroup.set(key, [...(byGroup.get(key) || []), record]);
    const sheetSet = sheetsPerSource.get(record.sourceIndex) || new Set<string>();
    sheetSet.add(record.sheetName);
    sheetsPerSource.set(record.sourceIndex, sheetSet);
  }

  return [...byGroup.entries()].map(([, groupRecords]) => {
    const first = groupRecords[0];
    const multiSheetFile = (sheetsPerSource.get(first.sourceIndex)?.size || 0) > 1;
    const { waypoints } = calendarRecordsToWaypoints(groupRecords, modelWaypoints);
    const dates = [...new Set(waypoints.map(wp => wp.date || '').filter(Boolean))].sort();
    return {
      id: `excel-schedule-${first.sourceIndex}-${first.sourceSha256.slice(0, 8)}-${first.sheetName}`,
      sourceIndex: first.sourceIndex,
      filename: first.filename,
      sheetName: first.sheetName,
      label: multiSheetFile ? `${first.filename} · ${first.sheetName}` : first.filename,
      dates,
      waypoints,
    };
  });
}

export function syncActiveVehicleScheduleWaypoints(
  draft: HqEmailExtractedDraft,
  nextWaypoints: RouteWaypointItem[],
): HqEmailExtractedDraft {
  if (!draft.activeVehicleScheduleId || !draft.excelVehicleSchedules?.length) return draft;
  const dates = [...new Set(nextWaypoints.map(wp => wp.date || '').filter(Boolean))].sort();
  return {
    ...draft,
    excelVehicleSchedules: draft.excelVehicleSchedules.map(schedule =>
      schedule.id === draft.activeVehicleScheduleId
        ? { ...schedule, waypoints: nextWaypoints, dates }
        : schedule
    ),
  };
}

export function applyExcelVehicleScheduleToDraft(
  draft: HqEmailExtractedDraft,
  scheduleId: string,
): HqEmailExtractedDraft {
  if (!draft.excelVehicleSchedules?.length) return draft;
  const synced = draft.activeVehicleScheduleId && draft.waypoints
    ? syncActiveVehicleScheduleWaypoints(draft, draft.waypoints)
    : draft;
  const target = synced.excelVehicleSchedules!.find(schedule => schedule.id === scheduleId);
  if (!target) return draft;

  const waypoints = target.waypoints.map((wp, index) => ({ ...wp, order: index + 1 }));
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  const coveredDates = new Set(waypoints.map(wp => wp.date || '').filter(Boolean));
  const documentAnalysis = synced.documentAnalysis?.map(doc => {
    if (!doc.missingDates?.length) return doc;
    const remainingMissing = doc.missingDates.filter(date => !coveredDates.has(date));
    return {
      ...doc,
      missingDates: remainingMissing.length ? remainingMissing : undefined,
      dateReviewAcknowledged: remainingMissing.length ? doc.dateReviewAcknowledged : false,
    };
  });

  return {
    ...synced,
    activeVehicleScheduleId: target.id,
    waypoints,
    pickupDate: first?.date || synced.pickupDate,
    pickupTime: first?.time || synced.pickupTime,
    pickupLocation: first?.location || synced.pickupLocation,
    pickupAddress: first?.address,
    pickupProvidedAddress: first?.clientAddress,
    pickupLat: first?.lat,
    pickupLng: first?.lng,
    isPickupPoiConfirmed: Boolean(first?.isPoiConfirmed),
    dropoffLocation: last?.location || synced.dropoffLocation,
    dropoffAddress: last?.address,
    dropoffProvidedAddress: last?.clientAddress,
    dropoffLat: last?.lat,
    dropoffLng: last?.lng,
    isDropoffPoiConfirmed: Boolean(last?.isPoiConfirmed),
    documentAnalysis,
  };
}

export interface ParsedExcelWaypointNotes {
  excelSource?: {
    filename: string;
    sheetName: string;
    cell: string;
    isGridClock?: boolean;
    rawText?: string;
  };
  plainNotes?: string;
}

const EXCEL_SOURCE_HEADER_RE = /^원본 Excel\s+(.+?)\s+\/\s+([^!]+)!([A-Za-z]+\d+(?::[A-Za-z]+\d+)?)$/;
const EXCEL_GRID_CLOCK_NOTICE = '시간표 행 기준 · 실제 출발 시각 미확정';

/**
 * Separates structured Excel provenance lines (generated by `calendarRecordsToWaypoints`)
 * from plain operational waypoint notes so UI components can keep rows uncluttered
 * and show raw Excel cell context on demand.
 */
export function parseExcelWaypointNotes(notes?: string): ParsedExcelWaypointNotes {
  const trimmed = notes?.trim();
  if (!trimmed) return {};

  const lines = trimmed.split(/\r?\n/);
  const headerMatch = EXCEL_SOURCE_HEADER_RE.exec(lines[0]?.trim() || '');
  if (!headerMatch) {
    return { plainNotes: trimmed };
  }

  const restLines = lines.slice(1);
  const isGridClock = restLines[0]?.trim() === EXCEL_GRID_CLOCK_NOTICE;
  const rawText = (isGridClock ? restLines.slice(1) : restLines).join('\n').trim() || undefined;

  return {
    excelSource: {
      filename: headerMatch[1].trim(),
      sheetName: headerMatch[2].trim(),
      cell: headerMatch[3].trim(),
      ...(isGridClock ? { isGridClock: true } : {}),
      ...(rawText ? { rawText } : {}),
    },
  };
}
