import { getKstTodayDateStr, normalizeDateToIso } from './dispatchConflictDetector';

export type HqDateRangeMode = 'all' | 'today' | 'week' | 'month' | 'custom';
export interface HqDateRange {
  mode: HqDateRangeMode;
  from?: string;
  to?: string;
}

export const ALL_HQ_DATES: HqDateRange = { mode: 'all' };

export function resolveHqDateBounds(
  range: HqDateRange,
  today: string = getKstTodayDateStr(),
): { from: string; to: string } | null {
  const isoToday = normalizeDateToIso(today);
  if (!isoToday || range.mode === 'all') return null;
  if (range.mode === 'today') return { from: isoToday, to: isoToday };
  if (range.mode === 'month') return { from: `${isoToday.slice(0, 7)}-01`, to: isoToday.slice(0, 7) + '-' +
    String(new Date(Date.UTC(Number(isoToday.slice(0, 4)), Number(isoToday.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0') };
  if (range.mode === 'week') {
    const date = new Date(`${isoToday}T00:00:00Z`);
    const dow = (date.getUTCDay() + 6) % 7; // Monday through Sunday, in KST calendar.
    const start = new Date(date.getTime() - dow * 86400000);
    return { from: start.toISOString().slice(0, 10), to: new Date(start.getTime() + 6 * 86400000).toISOString().slice(0, 10) };
  }
  const from = normalizeDateToIso(range.from);
  const to = normalizeDateToIso(range.to);
  return from && to && from <= to ? { from, to } : null;
}

export function matchesHqDateRange(date: string | undefined, range: HqDateRange, today?: string): boolean {
  if (range.mode === 'all') return true;
  const bounds = resolveHqDateBounds(range, today);
  const iso = normalizeDateToIso(date);
  return Boolean(bounds && iso && bounds.from <= iso && iso <= bounds.to);
}

export function formatHqDateRangeLabel(range: HqDateRange, today?: string): string {
  switch (range.mode) {
    case 'all': return '전체 기간';
    case 'today': return '오늘';
    case 'week': return '이번 주';
    case 'month': return '이번 달';
    case 'custom': {
      const bounds = resolveHqDateBounds(range, today);
      return bounds ? `${bounds.from.replace(/-/g, '.')} ~ ${bounds.to.replace(/-/g, '.')}` : '기간 선택';
    }
  }
}
