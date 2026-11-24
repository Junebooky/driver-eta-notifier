import type { HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';

/**
 * POI addresses are never inferred from the email. They are filled only when an
 * operator selects a TMAP result. Names alone are not confirmed locations.
 */
export type VerifiedEmailPoi = { name: string; address: string; lat: number; lng: number };
export type EmailRouteStop = {
  id: string;
  date: string;
  time: string;
  location: string;
  address?: string;
  clientAddress?: string;
  lat?: number;
  lng?: number;
  isPoiConfirmed: boolean;
};

export const isVerifiedEmailRouteStop = (stop: EmailRouteStop): boolean =>
  stop.isPoiConfirmed &&
  Number.isFinite(stop.lat) && Number.isFinite(stop.lng) &&
  Math.abs(stop.lat!) <= 90 && Math.abs(stop.lng!) <= 180;

export function getEmailRouteStops(draft: HqEmailExtractedDraft): EmailRouteStop[] {
  if (draft.waypoints && draft.waypoints.length >= 2) {
    return [...draft.waypoints].sort((a, b) => a.order - b.order).map((point) => ({
      id: point.id,
      date: point.date || draft.pickupDate,
      time: point.time || '',
      location: point.location,
      address: point.address,
      clientAddress: point.clientAddress,
      lat: point.lat,
      lng: point.lng,
      isPoiConfirmed: Boolean(point.isPoiConfirmed),
    }));
  }
  return [
    { id: 'pickup', date: draft.pickupDate, time: draft.pickupTime,
      location: draft.pickupLocation, address: draft.pickupAddress, clientAddress: draft.pickupProvidedAddress,
      lat: draft.pickupLat, lng: draft.pickupLng,
      isPoiConfirmed: Boolean(draft.isPickupPoiConfirmed) },
    { id: 'dropoff', date: draft.pickupDate,
      time: draft.dayEndTimes?.[draft.pickupDate] || '',
      location: draft.dropoffLocation, address: draft.dropoffAddress, clientAddress: draft.dropoffProvidedAddress,
      lat: draft.dropoffLat, lng: draft.dropoffLng,
      isPoiConfirmed: Boolean(draft.isDropoffPoiConfirmed) },
  ];
}

export function getUnconfirmedEmailRouteStops(draft: HqEmailExtractedDraft): EmailRouteStop[] {
  return getEmailRouteStops(draft).filter((point) => !isVerifiedEmailRouteStop(point));
}

export function changeEmailRouteStopName(
  draft: HqEmailExtractedDraft,
  stopId: string,
  location: string,
): HqEmailExtractedDraft {
  return updateRouteStop(draft, stopId, { location, address: undefined, lat: undefined, lng: undefined, isPoiConfirmed: false });
}

export function confirmEmailRouteStop(
  draft: HqEmailExtractedDraft,
  stopId: string,
  poi: VerifiedEmailPoi,
): HqEmailExtractedDraft {
  if (!Number.isFinite(poi.lat) || !Number.isFinite(poi.lng) ||
      Math.abs(poi.lat) > 90 || Math.abs(poi.lng) > 180 ||
      !poi.name.trim() || !poi.address.trim()) {
    throw new Error('TMAP 장소명, 주소 및 좌표를 확인해 주세요.');
  }
  return updateRouteStop(draft, stopId, {
    location: poi.name,
    address: poi.address,
    lat: poi.lat,
    lng: poi.lng,
    isPoiConfirmed: true,
  });
}

function updateRouteStop(
  draft: HqEmailExtractedDraft,
  stopId: string,
  change: Pick<RouteWaypointItem, 'location' | 'address' | 'lat' | 'lng' | 'isPoiConfirmed'>,
): HqEmailExtractedDraft {
  const waypoints = draft.waypoints;
  if (waypoints && waypoints.length >= 2) {
    const sorted = [...waypoints].sort((a, b) => a.order - b.order);
    const firstId = sorted[0].id;
    const lastId = sorted[sorted.length - 1].id;
    if (!waypoints.some((point) => point.id === stopId)) return draft;
    return {
      ...draft,
      waypoints: waypoints.map((point) => point.id === stopId ? { ...point, ...change } : point),
      ...(stopId === firstId ? {
        pickupLocation: change.location, pickupAddress: change.address,
        pickupLat: change.lat, pickupLng: change.lng,
        isPickupPoiConfirmed: change.isPoiConfirmed,
      } : {}),
      ...(stopId === lastId ? {
        dropoffLocation: change.location, dropoffAddress: change.address,
        dropoffLat: change.lat, dropoffLng: change.lng,
        isDropoffPoiConfirmed: change.isPoiConfirmed,
      } : {}),
    };
  }
  if (stopId === 'pickup') return {
    ...draft, pickupLocation: change.location, pickupAddress: change.address,
    pickupLat: change.lat, pickupLng: change.lng, isPickupPoiConfirmed: change.isPoiConfirmed,
  };
  if (stopId === 'dropoff') return {
    ...draft, dropoffLocation: change.location, dropoffAddress: change.address,
    dropoffLat: change.lat, dropoffLng: change.lng, isDropoffPoiConfirmed: change.isPoiConfirmed,
  };
  return draft;
}
