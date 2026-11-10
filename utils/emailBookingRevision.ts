import type { HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import type { ExistingEmailBookingCandidate } from '@/services/emailBookingMatchService';

const norm = (text: unknown) => String(text || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const same = (a: unknown, b: unknown) => norm(a) === norm(b);

export interface EmailRevisionDiff {
  label: string;
  previous: string;
  proposed: string;
}

export function emailRevisionDiff(draft: HqEmailExtractedDraft, original: ExistingEmailBookingCandidate): EmailRevisionDiff[] {
  const props: EmailRevisionDiff[] = [
    { label: '운행일', previous: original.pickupDate, proposed: draft.pickupDate || original.pickupDate },
    { label: '픽업 시간', previous: original.pickupTime, proposed: draft.pickupTime || original.pickupTime },
    { label: '출발지', previous: original.pickupLocation, proposed: draft.pickupLocation || original.pickupLocation },
    { label: '목적지', previous: original.destination, proposed: draft.dropoffLocation || original.destination },
    { label: '승객', previous: original.passengerName, proposed: draft.passengerName || original.passengerName },
    { label: '인원', previous: String(original.passengerCount), proposed: String(draft.passengerCount || original.passengerCount) },
  ];
  const oldRoute = (original.routeWaypoints || []).map(p => `${p.date || original.pickupDate} ${p.time} ${p.location}`).join(' → ');
  const newRoute = (draft.waypoints || []).map(p => `${p.date || draft.pickupDate} ${p.time} ${p.location}`).join(' → ');
  if (newRoute && newRoute !== oldRoute) props.push({
    label: '경유 경로', previous: oldRoute || '출발지 → 목적지', proposed: newRoute,
  });
  return props.filter(p => p.previous !== p.proposed);
}

/** Never turn a partial revision into an accidental deletion of unmentioned stops. */
export function prepareEmailRevisionDraft(draft: HqEmailExtractedDraft, previous: ExistingEmailBookingCandidate): HqEmailExtractedDraft {
  const original = previous.routeWaypoints.length >= 2
    ? previous.routeWaypoints
    : [
        { id:'old-origin', order:1, date:previous.pickupDate, time:previous.pickupTime, location:previous.pickupLocation },
        { id:'old-final', order:2, date:previous.pickupDate, time:previous.endTime, location:previous.destination },
      ];
  const provided = draft.waypoints || [];
  const fullReplacement = draft.revisionScope === 'full' && provided.length >= 2;
  const exactStops = provided.length === original.length &&
    provided.every((p, i) => same(p.location, original[i].location));
  const partialNotes: string[] = [];
  let route: RouteWaypointItem[];
  if (fullReplacement || exactStops) {
    route = provided.map((p, i) => {
      const old = original[i];
      return old && same(p.location, old.location) && old.isPoiConfirmed && Number.isFinite(old.lat) && Number.isFinite(old.lng)
        ? { ...p, address: old.address, lat: old.lat, lng: old.lng, isPoiConfirmed: true }
        : { ...p, isPoiConfirmed: false, lat: undefined, lng: undefined, address: undefined };
    });
  } else {
    route = original.map(p => ({ ...p }));
    if (provided.length) {
      for (const update of provided) {
        const hits = route.map((p,i) => same(p.location, update.location) ? i : -1).filter(i=>i>=0);
        if (hits.length === 1) route[hits[0]] = { ...route[hits[0]], time: update.time || route[hits[0]].time };
        else partialNotes.push('일부 경유지가 새로 추가되었거나 중복 장소가 있어 자동 병합하지 않았습니다. 경로를 직접 확인해 주세요.');
      }
    }
  }
  const newDate = draft.pickupDate || previous.pickupDate;
  const originalDates = new Set(route.map(p=>p.date || previous.pickupDate));
  if (newDate !== previous.pickupDate && originalDates.size === 1) {
    route = route.map(p => ({ ...p, date: newDate }));
  } else if (newDate !== previous.pickupDate && originalDates.size > 1) {
    partialNotes.push('다일 일정의 날짜가 변경되었습니다. 날짜별 경유지를 직접 확인해 주세요.');
  }
  if (draft.pickupTime) route[0] = { ...route[0], time: draft.pickupTime };
  if (draft.pickupLocation && !same(draft.pickupLocation, route[0].location)) {
    route[0] = { ...route[0], location: draft.pickupLocation, lat: undefined, lng: undefined, address: undefined, isPoiConfirmed: false };
  }
  const last = route.length - 1;
  if (draft.dropoffLocation && !same(draft.dropoffLocation, route[last].location)) {
    route[last] = { ...route[last], location: draft.dropoffLocation, lat: undefined, lng: undefined, address: undefined, isPoiConfirmed: false };
  }
  if (!fullReplacement && !exactStops && provided.length) partialNotes.push('원본의 누락된 경유지는 보존했습니다. 변경 요청과 대조한 뒤 승인해 주세요.');
  const start = route[0], end = route[last];
  return {
    ...draft,
    companyName: draft.companyName || previous.customerName,
    passengerName: draft.passengerName || previous.passengerName,
    passengerCount: draft.passengerCount || previous.passengerCount,
    pickupDate: newDate,
    pickupTime: start.time || previous.pickupTime,
    pickupLocation: start.location,
    pickupLat: start.lat,
    pickupLng: start.lng,
    pickupAddress: start.address,
    isPickupPoiConfirmed: Boolean(start.isPoiConfirmed),
    dropoffLocation: end.location,
    dropoffLat: end.lat,
    dropoffLng: end.lng,
    dropoffAddress: end.address,
    isDropoffPoiConfirmed: Boolean(end.isPoiConfirmed),
    waypoints: route,
    dayEndTimes: { ...(draft.dayEndTimes || {}), [newDate]: end.time || previous.endTime },
    flightNumber: draft.flightNumber || previous.flightNumber,
    specialRequests: draft.specialRequests || previous.notes,
    revisionMatchedScheduleId: previous.scheduleId,
    revisionMatchedVersion: previous.version,
    warnings: [...(draft.warnings || []), ...new Set(partialNotes)],
  };
}
