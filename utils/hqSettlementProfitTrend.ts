import type { EventSettlementReport } from '@/types/settlementHq';
import { getKstTodayDateStr, normalizeDateToIso } from './dispatchConflictDetector';

export interface SettlementProfitDay {
  date: string;
  label: string;
  reportCount: number;
  directProfit: number;
}

/** Actual event-date profit totals. No fabricated demo curve or fixed dates. */
export function buildHqSettlementProfitTrend(
  reports: readonly EventSettlementReport[],
  endDate = getKstTodayDateStr(),
): SettlementProfitDay[] {
  const lastDate = normalizeDateToIso(endDate);
  if (!lastDate) return [];
  const end = Date.parse(lastDate + 'T00:00:00Z');
  const series: SettlementProfitDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, label: date.slice(5).replace('-', '/'), reportCount: 0, directProfit: 0 };
  });
  const byDate = new Map(series.map(day => [day.date, day]));
  for (const report of reports) {
    const iso = normalizeDateToIso(report.rawDate || report.eventDate);
    const entry = byDate.get(iso);
    if (!entry) continue;
    entry.reportCount += 1;
    entry.directProfit += report.totalDirectProfit;
  }
  return series;
}
