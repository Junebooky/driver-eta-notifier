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

/** Only explicit persisted event/group identities or an actual multi-day booking
 * can connect adjacent dates. Same customer text alone is never sufficient.
 */
export function hqBookingSeriesKey(booking: Pick<HqBooking,
  'id' | 'eventId' | 'groupId' | 'customerId' | 'customerName' | 'vehicleId' | 'vehiclePlate' | 'vehicleNoKey'
>): string {
  const event = booking.eventId?.trim() || booking.groupId?.trim();
  if (!event) return 'booking:' + booking.id;
  const customer = booking.customerId?.trim() || booking.customerName.trim();
  // A multi-vehicle event gets one continuity indicator per actual vehicle.
  // Missing vehicle assignments cannot be conflated with a real assignment.
  const vehicle = booking.vehicleId?.trim() || booking.vehiclePlate?.trim() || booking.vehicleNoKey?.trim();
  return event && vehicle
    ? 'event:' + JSON.stringify([event, customer, vehicle])
    : 'booking:' + booking.id;
}

export function getHqCalendarContinuity(
  bookings: HqBooking[],
  date: string,
): { previous: boolean; next: boolean; days: number; colorBooking: HqBooking } | null {
  const today = bookings.filter(item => isHqBookingScheduledOn(item, date));
  if (!today.length) return null;
  const neighbor = (step: number): string => {
    const next = new Date(date + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + step);
    return next.toISOString().slice(0, 10);
  };
  for (const candidate of today) {
    const key = hqBookingSeriesKey(candidate);
    const includes = (day: string) => bookings.some(other =>
      hqBookingSeriesKey(other) === key && isHqBookingScheduledOn(other, day)
    );
    const previous = includes(neighbor(-1));
    const next = includes(neighbor(1));
    if (!previous && !next) continue;
    let days = 1;
    // Read only a bounded 60-day contiguous series, not unrelated distant events.
    for (const direction of [-1, 1]) {
      for (let distance = 1; distance < 61; distance++) {
        if (!includes(neighbor(distance * direction))) break;
        days++;
      }
    }
    return { previous, next, days, colorBooking: candidate };
  }
  return null;
}
