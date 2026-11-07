import type { HqBooking } from '@/types/hq';
import { getKstTodayDateStr, normalizeDateToIso } from '@/utils/dispatchConflictDetector';

export interface HqCalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
}

const safeMonth = (value: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    return getKstTodayDateStr().slice(0, 7);
  }
  return value;
};

export function shiftHqCalendarMonth(monthKey: string, delta: number): string {
  const [year, month] = safeMonth(monthKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Full week rows, Sunday first. UTC-only arithmetic avoids KST midnight and DST drift. */
export function getHqCalendarDays(monthKey: string): HqCalendarDay[] {
  const safe = safeMonth(monthKey);
  const [year, month] = safe.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstGrid = Date.UTC(year, month - 1, 1 - first.getUTCDay());
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const count = Math.ceil((first.getUTCDay() + totalDays) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(firstGrid + index * 86_400_000);
    const iso = day.toISOString().slice(0, 10);
    return { iso, day: day.getUTCDate(), inMonth: iso.slice(0, 7) === safe };
  });
}

/**
 * Include each day occupied by a multi-day reservation. Email dispatch already
 * creates separate daily schedule rows; those still appear once per day.
 */
export function isHqBookingScheduledOn(b: Pick<HqBooking, 'pickupDate' | 'endDate'>, date: string): boolean {
  const start = normalizeDateToIso(b.pickupDate);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const endRaw = normalizeDateToIso(b.endDate);
  const end = endRaw >= start ? endRaw : start;
  return start <= date && date <= end;
}

export function sortHqCalendarBookings<T extends Pick<HqBooking, 'pickupTime' | 'customerName' | 'id'>>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.pickupTime || '').localeCompare(b.pickupTime || '') ||
    a.customerName.localeCompare(b.customerName, 'ko') ||
    a.id.localeCompare(b.id)
  );
}
