import type { HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import type { AnalyzedScheduleAttachment } from '@/services/emailAttachmentIntake';
import { scheduleHeaderDate } from './emailAttachmentCoverage';

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
}

export interface DatedExcelCalendarBlock extends ExcelCalendarBlock {
  filename: string;
  sourceSha256: string;
  sourceIndex: number;
  date: string;
}

const normalText = (text: string) => text.replace(/\s+/g, ' ').trim();
const isDateLabel = (value: string) =>
  /^(?:(?:Sun|Mon|Tues?|Wednes|Thurs?|Fri|Satur)day,?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(value) ||
  /^\d{1,4}[-/.년]\s*\d{1,2}/.test(value);

function asClock(hour: number, minute: number, period?: string): string | undefined {
  if (period) {
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return;
    hour = (hour % 12) + (period.toLowerCase() === 'pm' ? 12 : 0);
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return;
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

/** Prefer explicit appointment time; the grid's time row is the fallback. */
export function excelCalendarClock(value: string): string | undefined {
  const input = value.trim();
  const m = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
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

function addressFromOriginal(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map(line => line.trim().replace(/^\*+\s*/, '')).filter(Boolean);
  // "주소?" is NOT an address. Keep it marked as client unspecified.
  const explicit = lines.findIndex(line => /^(?:address|주소)\s*[:：]/i.test(line) && !/[?？]$/.test(line));
  if (explicit >= 0) {
    const remaining = lines.slice(explicit).map(line => line.replace(/^(?:address|주소)\s*[:：]\s*/i, '')).filter(Boolean);
    const joined = remaining.join(' ').trim();
    return joined && !/(?:주소|address)\s*[?？]/i.test(joined) ? joined : undefined;
  }
  const street = lines.findIndex(line => /[가-힣0-9]+(?:로|길)\s*\d/.test(line));
  return street >= 0 ? lines.slice(street).join(' ').trim() || undefined : undefined;
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

/** Pure structural extraction: no Gemini, network, TMAP or invented POIs. */
export function extractExcelCalendarBlocks(
  sheetName: string,
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
  startRow = 0,
  startColumn = 0,
): ExcelCalendarBlock[] {
  const headerAt = rows.findIndex(row => {
    const first = row.findIndex(value => /^(date|날짜|일자)$/i.test(String(value).trim()));
    return first >= 0 && row.filter((v, i) => i !== first && isDateLabel(String(v))).length >= 2;
  });
  if (headerAt < 0) return [];
  const header = rows[headerAt];
  const timeColumn = header.findIndex(value => /^(date|날짜|일자)$/i.test(String(value).trim()));
  const datedColumns = header.map((value, index) => ({ index, label: String(value).trim() }))
    .filter(item => item.index !== timeColumn && isDateLabel(item.label));
  const result: ExcelCalendarBlock[] = [];
  for (let row = headerAt + 1; row < rows.length; row++) {
    const gridTime = excelCalendarClock(String(rows[row][timeColumn] ?? ''));
    for (const column of datedColumns) {
      const originalText = String(rows[row][column.index] ?? '').trim();
      if (!originalText) continue;
      // One occupied cell = one event; merged cells do not create additional events.
      const firstLine = originalText.split(/\r?\n/).map(line => line.trim()).find(Boolean) || originalText;
      const explicitTime = excelCalendarClock(originalText);
      result.push({
        sheetName,
        cell: excelColumn(startColumn + column.index) + (startRow + row + 1),
        dateLabel: column.label,
        time: explicitTime || gridTime || '',
        clockSource: explicitTime ? 'text' : gridTime ? 'grid' : 'unknown',
        title: firstLine,
        originalText,
        clientAddress: addressFromOriginal(originalText),
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
      if (date) records.push({ ...entry, date, filename: file.filename, sourceSha256: file.sha256, sourceIndex });
    }
  }
  return records;
}

function stableCalendarKey(record: DatedExcelCalendarBlock): string {
  return [record.sourceIndex, record.sourceSha256.slice(0, 16), record.sheetName, record.cell].join(':');
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
  const ordered = [...records].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time) ||
    a.cell.localeCompare(b.cell));
  const allModel = draft.waypoints || [];
  const consumed = new Set<string>();
  const calendarCounts = new Map<string, number>();
  for (const r of ordered) {
    const key = r.date + '|' + r.time;
    calendarCounts.set(key, (calendarCounts.get(key) || 0) + 1);
  }

  const fromExcel: RouteWaypointItem[] = ordered.map((entry) => {
    const timeKey = entry.date + '|' + entry.time;
    const candidate = (calendarCounts.get(timeKey) === 1 ? allModel.find(point =>
      !consumed.has(point.id) && point.date === entry.date && point.time === entry.time
    ) : undefined);
    if (candidate) consumed.add(candidate.id);
    // Never trust an AI-only address that is absent from the original cell.
    const echoedAddress = candidate?.clientAddress &&
      normalText(entry.originalText).toLowerCase().includes(normalText(candidate.clientAddress).toLowerCase())
      ? candidate.clientAddress : undefined;
    const availableAddress = entry.clientAddress || echoedAddress;
    const supportedLocation = candidate?.location &&
      (availableAddress || /(?:location|장소)\s*[:：]/i.test(entry.originalText)) &&
      normalText(entry.originalText).toLowerCase().includes(normalText(candidate.location).toLowerCase());
    return {
      id: 'excel-' + stableCalendarKey(entry),
      order: 0,
      date: entry.date,
      time: entry.time,
      location: supportedLocation ? candidate!.location : entry.title,
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
  return {
    ...draft,
    waypoints,
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
