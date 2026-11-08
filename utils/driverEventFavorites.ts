import type { ScheduleItem } from '@/data/ferrariSchedules';

/** An immutable, server-derived snapshot. It is NOT a user-editable preset. */
export interface DriverEventStop {
  id: string;
  name: string;
  address: string;
  time?: string;
  lat?: number;
  lng?: number;
  isPoiConfirmed: boolean;
  notes?: string;
}
export interface DriverEventRoute {
  scheduleId: string;
  date: string;
  pickupTime: string;
  vehiclePlate?: string;
  stops: DriverEventStop[];
  ready: boolean;
  /** A missing historical itinerary cannot safely be rebuilt from two endpoints. */
  fullItinerary: boolean;
}
export interface DriverEventDay {
  date: string;
  routes: DriverEventRoute[];
}
export interface DriverEventFavorite {
  id: string;
  name: string;
  customerName: string;
  days: DriverEventDay[];
}

const validCoordinate = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' && typeof lng === 'number' &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
  !(lat === 0 && lng === 0);

function itineraryFor(schedule: ScheduleItem): { stops: DriverEventStop[]; fullItinerary: boolean } {
  if (schedule.routeWaypoints && schedule.routeWaypoints.length >= 2) {
    return {
      fullItinerary: true,
      stops: [...schedule.routeWaypoints]
        .sort((a, b) => a.order - b.order)
        .map((stop, index) => ({
          id: stop.id || `${schedule.id}-stop-${index}`,
          name: String(stop.location || '').trim(),
          address: String(stop.address || stop.clientAddress || '').trim(),
          time: stop.time || undefined,
          lat: stop.lat,
          lng: stop.lng,
          isPoiConfirmed: stop.isPoiConfirmed === true &&
            validCoordinate(stop.lat, stop.lng) && Boolean(stop.location?.trim()),
          notes: stop.notes || undefined,
        })),
    };
  }

  // Legacy email booking: show the known endpoints but never falsely claim
  // that the original intermediate stops were saved or that coordinates were verified.
  return {
    fullItinerary: false,
    stops: [
      { id: schedule.id + '-origin', name: schedule.origin_name, address: schedule.origin_address || '',
        time: schedule.pickup_time, isPoiConfirmed: false },
      { id: schedule.id + '-destination', name: schedule.destination_name,
        address: schedule.destination_address || '', isPoiConfirmed: false },
    ],
  };
}

/**
 * The server must first filter schedules by the authenticated driver's UUID.
 * Defense in depth here prevents grouping an unrelated, cancelled, unassigned,
 * vehicle-only or draft schedule, even when passed mixed fixtures.
 */
export function buildDriverEventFavorites(
  schedules: ScheduleItem[],
  authenticatedDriverId: string,
): DriverEventFavorite[] {
  if (!authenticatedDriverId?.trim()) return [];
  const groups = new Map<string, DriverEventFavorite>();
  const unique = new Set<string>();

  for (const item of schedules) {
    if (!item?.id || unique.has(item.id)) continue;
    unique.add(item.id);
    if (item.driver_id !== authenticatedDriverId ||
        item.dispatch_status !== 'published' ||
        item.status === 'cancelled' ||
        item.service_mode === 'vehicle_only' ||
        item.intake_source !== 'email' ||
        !item.vehicle_id ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) continue;

    const eventId = (item.event_id || '').trim();
    // Email dispatches share event_id across dates. Never group unrelated
    // same-name bookings together just because their display names match.
    const key = eventId ? 'event:' + eventId : 'schedule:' + item.id;
    const eventName = (item.event_name || item.group_name || '').trim();
    const customerName = (item.customer_name || '').trim();
    const name = eventName || (customerName ? customerName + ' 일정' : '행사명 미지정');
    const existing = groups.get(key);
    const group: DriverEventFavorite = existing || {
      id: key, name, customerName, days: [],
    };

    const itinerary = itineraryFor(item);
    const route: DriverEventRoute = {
      scheduleId: item.id,
      date: item.date,
      pickupTime: item.pickup_time || '',
      vehiclePlate: item.vehicle_plate || item.vehicle_no,
      stops: itinerary.stops,
      fullItinerary: itinerary.fullItinerary,
      ready: itinerary.fullItinerary &&
        itinerary.stops.length >= 2 &&
        itinerary.stops.every(stop => stop.isPoiConfirmed),
    };
    const day = group.days.find(entry => entry.date === item.date);
    if (day) day.routes.push(route);
    else group.days.push({ date: item.date, routes: [route] });
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(group => ({
      ...group,
      days: group.days.sort((a, b) => a.date.localeCompare(b.date))
        .map(day => ({
          ...day,
          routes: day.routes.sort((a, b) =>
            a.pickupTime.localeCompare(b.pickupTime) || a.scheduleId.localeCompare(b.scheduleId)),
        })),
    }))
    .sort((a, b) =>
      a.days[0].date.localeCompare(b.days[0].date) || a.name.localeCompare(b.name));
}
