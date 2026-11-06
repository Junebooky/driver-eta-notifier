import type { HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import type { ExistingEmailBookingCandidate } from '@/services/emailBookingMatchService';
import { buildEmailDispatchPlan, emailDispatchDays } from './emailDispatchPlan';
import { findVipVehicle } from './vehicleData';

export type EmailBatchDecisions = Record<string, string>;
export type EmailBatchAssignment = { vehiclePlate?: string; driver?: EmailBatchSlot['driver'] };
export type EmailBatchAssignments = Record<string, EmailBatchAssignment>;

export const emailBatchKey = (date: string, zeroBasedVehicleIndex: number) => `${date}:${zeroBasedVehicleIndex}`;
const clean = (value?: string) => (value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const compact = (value?: string) => (value || '').trim().replace(/\s+/g, ' ');

export interface EmailBatchSlot {
  vehicleModel: string;
  vehiclePlate?: string;
  driver: { id: string; name: string; phone?: string; languages?: string[]; englishAvailable?: boolean } | null;
}

export interface EmailBatchReviewRow {
  key: string;
  date: string;
  index: number;
  startTime: string;
  endTime: string;
  start: string;
  destination: string;
  stops: RouteWaypointItem[];
  selection: string;
  previous?: ExistingEmailBookingCandidate;
  action: 'new' | 'update' | 'unchanged' | 'pending';
  changes: Array<{ label: string; previous: string; next: string }>;
}

/** Draft rows are day × vehicle slots; no identity is inferred from an index alone. */
export function emailBatchRows(
  draft: HqEmailExtractedDraft,
  slots: EmailBatchSlot[],
  candidates: ExistingEmailBookingCandidate[],
  decisions: EmailBatchDecisions,
  assignments: EmailBatchAssignments = {},
): EmailBatchReviewRow[] {
  return emailDispatchDays(draft).flatMap(day =>
    slots.map((slot, index) => {
      const key = emailBatchKey(day.date, index);
      const selection = decisions[key] || '';
      const previous = candidates.find(item => item.scheduleId === selection);
      const changes: EmailBatchReviewRow['changes'] = [];
      if (previous) {
        const push = (label: string, oldVal: string, newVal: string) => {
          if (compact(oldVal) !== compact(newVal)) changes.push({ label, previous: oldVal, next: newVal });
        };
        push('운행일', previous.pickupDate, day.date);
        push('픽업', previous.pickupTime, day.start.time || '');
        push('종료', previous.endTime, day.endTime || '');
        push('출발지', previous.pickupLocation, day.start.location);
        push('목적지', previous.destination, day.end.location);
        // Compare all stops in order, including duplicate location visits.
        const original = previous.routeWaypoints.length >= 2 ? previous.routeWaypoints :
          [{ location: previous.pickupLocation, time: previous.pickupTime },
           { location: previous.destination, time: previous.endTime }];
        const serialize = (route: Array<{ location: string; time?: string }>) =>
          route.map(p => `${p.time || '--:--'} ${p.location}`).join(' → ');
        push('전체 경유지', serialize(original), serialize(day.points));
        const count = draft.passengerCount || previous.passengerCount;
        if (previous.passengerCount !== count) push('탑승 인원', String(previous.passengerCount), String(count));
        if (draft.passengerName) push('탑승객', previous.passengerName, draft.passengerName);
        if (draft.flightNumber) push('편명', previous.flightNumber, draft.flightNumber);
        const assignment = assignments[key];
        if (assignment?.vehiclePlate) push('배정 차량', previous.vehiclePlate, assignment.vehiclePlate);
        if (assignment?.driver !== undefined) push('담당 기사', previous.driverName, assignment.driver?.name || '미배정');
      }
      return {
        key, date: day.date, index, selection, previous,
        startTime: day.start.time || '', endTime: day.endTime || '',
        start: day.start.location, destination: day.end.location, stops: day.points,
        action: !selection ? 'pending' as const : selection === 'new' ? 'new' as const :
          changes.length ? 'update' as const : 'unchanged' as const,
        changes,
      };
    }),
  );
}

export function emailBatchNeedsReview(
  draft: HqEmailExtractedDraft,
  slotCount: number,
  candidateCount: number,
): boolean {
  let dayCount = 0;
  try { dayCount = emailDispatchDays(draft).length; } catch { return draft.tripType === 'modification'; }
  return (dayCount > 1 || slotCount > 1) && (draft.tripType === 'modification' || candidateCount > 0);
}

/**
 * Build one safe multi-day review itinerary from explicit manager choices.
 * Partial emails keep every unmentioned old stop; ambiguous locations fail
 * closed rather than silently deleting routes or reusing unverified POI data.
 */
export function prepareEmailBatchRevisionDraft(
  draft: HqEmailExtractedDraft,
  slots: EmailBatchSlot[],
  candidates: ExistingEmailBookingCandidate[],
  decisions: EmailBatchDecisions,
): HqEmailExtractedDraft {
  const days = emailDispatchDays(draft);
  const notes: string[] = [];
  const grouped = new Map(days.map(day => [day.date, day.points.map(p => ({ ...p }))]));
  const endTimes = { ...(draft.dayEndTimes || {}) };
  let firstMatched: ExistingEmailBookingCandidate | undefined;

  for (const day of days) {
    const originals = slots
      .map((_, index) => candidates.find(item => item.scheduleId === decisions[emailBatchKey(day.date, index)]))
      .filter((item): item is ExistingEmailBookingCandidate => Boolean(item));
    if (!originals.length) continue;
    firstMatched ||= originals[0];
    const oldRoutes = originals.map(old => old.routeWaypoints.length >= 2
      ? old.routeWaypoints
      : [{ id: 'old-origin', order: 1, date: old.pickupDate, time: old.pickupTime, location: old.pickupLocation },
         { id: 'old-arrival', order: 2, date: old.pickupDate, time: old.endTime, location: old.destination }]);
    const routeSignature = (points: RouteWaypointItem[]) => points.map(p => clean(p.location)).join('|');
    if (oldRoutes.some(route => routeSignature(route) !== routeSignature(oldRoutes[0]))) {
      throw new Error(`${day.date}: 차량별 이전 경로가 서로 다릅니다. 이 일정은 각 차량별로 검토해 주세요.`);
    }
    const original = oldRoutes[0];
    const received = grouped.get(day.date) || [];
    let merged: RouteWaypointItem[];
    if (draft.revisionScope === 'full') {
      if (received.length < 2) throw new Error(`${day.date}: 전체 교체본에 출발지와 목적지가 모두 필요합니다.`);
      merged = received.map((p, index) => {
        const old = original[index];
        const sameStop = old && clean(old.location) === clean(p.location) &&
          old.isPoiConfirmed && Number.isFinite(old.lat) && Number.isFinite(old.lng);
        return sameStop
          ? { ...p, lat: old.lat, lng: old.lng, address: old.address, isPoiConfirmed: true }
          : { ...p, lat: undefined, lng: undefined, address: undefined, isPoiConfirmed: false };
      });
    } else {
      merged = original.map(p => ({ ...p, date: day.date }));
      const used = new Set<number>();
      for (const update of received) {
        const indexes = merged.map((p, i) => clean(p.location) === clean(update.location) ? i : -1)
          .filter(i => i >= 0 && !used.has(i));
        if (!indexes.length) {
          throw new Error(`${day.date}: "${update.location}" 경유지는 기존 경로에서 특정되지 않습니다. 원본을 보존했으니 관리자 검토 후 직접 추가·수정해 주세요.`);
        }
        // One stop in a partial update may be ambiguous if the same hotel is visited twice.
        if (indexes.length > 1 && received.length < merged.length) {
          throw new Error(`${day.date}: "${update.location}" 장소가 두 번 방문됩니다. 변경 대상 시간/순서를 직접 확인해 주세요.`);
        }
        const i = indexes[0];
        used.add(i);
        merged[i] = { ...merged[i], time: update.time || merged[i].time };
      }
      notes.push(`${day.date}: 부분 수정본에서 언급하지 않은 경유지를 보존했습니다.`);
    }
    const completed = merged.map((point, index) => ({ ...point, date: day.date, order: index + 1 }));
    grouped.set(day.date, completed);
    if (!endTimes[day.date]) {
      endTimes[day.date] = completed[completed.length - 1].time || originals[0].endTime;
    }
  }
  const waypoints = [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b))
    .flatMap(([, points]) => points.map((point, index) => ({ ...point, order: index + 1 })));
  const start = waypoints[0], end = waypoints[waypoints.length - 1];
  return {
    ...draft, waypoints, dayEndTimes: endTimes,
    passengerCount: draft.passengerCount || firstMatched?.passengerCount || 0,
    passengerName: draft.passengerName || firstMatched?.passengerName || '',
    companyName: draft.companyName || firstMatched?.customerName,
    pickupDate: start?.date || draft.pickupDate,
    pickupTime: start?.time || draft.pickupTime,
    pickupLocation: start?.location || draft.pickupLocation,
    pickupLat: start?.lat, pickupLng: start?.lng, pickupAddress: start?.address,
    isPickupPoiConfirmed: Boolean(start?.isPoiConfirmed),
    dropoffLocation: end?.location || draft.dropoffLocation,
    dropoffLat: end?.lat, dropoffLng: end?.lng, dropoffAddress: end?.address,
    isDropoffPoiConfirmed: Boolean(end?.isPoiConfirmed),
    warnings: [...(draft.warnings || []), ...notes],
  };
}

export interface EmailBatchApproval {
  items: Array<Record<string, unknown>>;
  changes: { new: number; updated: number; unchanged: number; cancelled: number };
}

/** One request, one atomic DB transaction. An omitted source row is NEVER cancelled by inference. */
export function buildEmailBatchRevisionApproval(
  draft: HqEmailExtractedDraft,
  slots: EmailBatchSlot[],
  candidates: ExistingEmailBookingCandidate[],
  decisions: EmailBatchDecisions,
  cancelledIds: string[],
  cancelReasons: Record<string, string>,
  assignments: EmailBatchAssignments,
  status: 'published' | 'unassigned',
): EmailBatchApproval {
  if (!slots.length) throw new Error('비교할 차량 슬롯이 없습니다.');
  if (draft.tripType === 'cancellation') throw new Error('전체 취소 요청은 별도로 확인해 주세요.');
  if (draft.tripType === 'group' && draft.groupTrips?.length)
    throw new Error('승객별 개별 출발 경로가 있는 예약은 차량별 TMAP 경로를 먼저 확정해 주세요.');
  const rows = emailBatchRows(draft, slots, candidates, decisions, assignments);
  if (!rows.length || rows.length > 80) throw new Error('일괄 배차는 1~80건까지 검토할 수 있습니다.');
  const selected = new Set<string>();
  const items: Array<Record<string, unknown>> = [];
  const counts = { new: 0, updated: 0, unchanged: 0, cancelled: 0 };
  const groupEventIds = new Set<string>();
  const selectedEventIds = [...new Set(rows.map(row => row.previous?.eventId).filter((v): v is string => Boolean(v)))];
  const sharedEventId = selectedEventIds.length === 1 ? selectedEventIds[0] : undefined;
  const knownGroupsByDay = new Map<string, string>();
  for (const row of rows) {
    if (row.previous?.groupId && row.previous.pickupDate === row.date &&
      !knownGroupsByDay.has(row.date)) knownGroupsByDay.set(row.date, row.previous.groupId);
  }

  for (const row of rows) {
    if (!row.selection) throw new Error(`${row.date} ${row.index + 1}호차: 기존 예약 또는 신규 예약을 선택해 주세요.`);
    const existing = row.previous;
    if (row.selection !== 'new' && !existing)
      throw new Error(`${row.date} ${row.index + 1}호차: 이전 예약 후보가 변경됐습니다. 다시 분석해 주세요.`);
    if (existing) {
      if (selected.has(existing.scheduleId)) throw new Error('동일한 기존 예약이 두 개의 수정 일정에 중복 연결됐습니다.');
      selected.add(existing.scheduleId);
      if (existing.eventId) groupEventIds.add(existing.eventId);
      if (existing.dispatchStatus === 'published' && status !== 'published')
        throw new Error('확정된 기존 예약을 미배정으로 바꿀 수 없습니다.');
    }
    const override = assignments[row.key] || {};
    const plate = override.vehiclePlate ?? existing?.vehiclePlate ?? slots[row.index].vehiclePlate ?? '';
    const driver = override.driver !== undefined
      ? override.driver
      : existing?.driverId
        ? { id: existing.driverId, name: existing.driverName, phone: existing.driverPhone, languages: ['ko'] }
        : slots[row.index].driver;
    // A reassigned driver comes from the verified HQ driver picker, never from guessed names.
    // Do not submit a synthetic driver identity for an override the UI hasn't verified.
    if (status === 'published' && (!plate || !driver?.id)) {
      throw new Error(`${row.date} ${row.index + 1}호차: 정확한 차량과 기사를 선택해 주세요.`);
    }
    const dailyDraft: HqEmailExtractedDraft = {
      ...draft, pickupDate: row.date, pickupTime: row.startTime,
      pickupLocation: row.start, dropoffLocation: row.destination,
      waypoints: row.stops, dayEndTimes: { [row.date]: row.endTime },
    };
    const daySlot = {
      vehicleModel: findVipVehicle(plate)?.model || existing?.vehicleModel || slots[row.index].vehicleModel,
      vehiclePlate: plate || undefined, driver,
    };
    const base = buildEmailDispatchPlan(dailyDraft, [daySlot], status)[0];
    // Driver/vehicle may vary independently on different days. Keep each old
    // schedule's immutable event ID, original booking number and version.
    const item: Record<string, unknown> = {
      ...base, scheduleId: existing?.scheduleId, expectedVersion: existing?.version,
      bookingNo: existing?.bookingNo || undefined,
      eventId: existing?.eventId || sharedEventId || base.eventId,
      groupId: existing?.groupId || knownGroupsByDay.get(row.date) || base.groupId,
      groupVehicleIndex: existing?.groupVehicleIndex || row.index + 1,
      groupTotalVehicles: slots.length,
      vehicleId: findVipVehicle(plate)?.uuid,
      vehiclePlate: status === 'published' ? plate : undefined,
      driverId: status === 'published' ? driver?.id : undefined,
      driverName: status === 'published' ? driver?.name : undefined,
      driverPhone: status === 'published' ? driver?.phone : undefined,
    };
    const changedAssignment = Boolean(existing && (plate !== existing.vehiclePlate || driver?.id !== existing.driverId));
    counts[existing ? (row.changes.length || changedAssignment ? 'updated' : 'unchanged') : 'new']++;
    items.push(item);
  }

  const uniqueCancelled = [...new Set(cancelledIds)];
  for (const id of uniqueCancelled) {
    const previous = candidates.find(item => item.scheduleId === id);
    if (!previous || selected.has(id)) throw new Error('같은 예약을 수정과 취소로 동시에 처리할 수 없습니다.');
    if (!previous.eventId || !groupEventIds.has(previous.eventId))
      throw new Error('취소할 예약이 선택한 기존 행사와 같은 예약 묶음인지 확인할 수 없습니다.');
    const reason = compact(cancelReasons[id]);
    if (reason.length < 2 || reason.length > 240) throw new Error('각 취소 일정에 2~240자의 사유를 입력해 주세요.');
    // The cancellation row must keep all old data. It is an explicit state
    // transition; no missing Excel rows cause automatic cancellation.
    items.push({
      scheduleId: previous.scheduleId,
      expectedVersion: previous.version,
      bookingNo: previous.bookingNo || undefined,
      date: previous.pickupDate, endDate: previous.pickupDate,
      pickupTime: previous.pickupTime, endTime: previous.endTime,
      origin: previous.pickupLocation, destination: previous.destination,
      // Omit routeWaypoints: the server keeps the original itinerary even when
      // legacy records contain missing/old-format waypoint dates.
      customerName: previous.customerName,
      passengerName: previous.passengerName, passengerCount: previous.passengerCount,
      vehiclePlate: previous.vehiclePlate, vehicleModel: previous.vehicleModel,
      vehicleId: previous.vehicleId,
      driverId: previous.driverId, driverName: previous.driverName, driverPhone: previous.driverPhone,
      eventId: previous.eventId, groupId: previous.groupId,
      groupVehicleIndex: previous.groupVehicleIndex,
      groupTotalVehicles: previous.groupTotalVehicles,
      dispatchStatus: 'cancelled', cancelReason: reason,
      intakeSource: 'email',
    });
    counts.cancelled++;
  }
  if (items.length > 100) throw new Error('한 번에 승인할 변경 및 취소 건수는 최대 100건입니다.');
  return { items, changes: counts };
}
