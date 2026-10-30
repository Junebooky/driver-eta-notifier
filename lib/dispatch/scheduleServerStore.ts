import { randomUUID, createHash } from 'node:crypto';
import { validateDispatchInterval } from '@/utils/dispatchInterval';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { DbScheduleRow } from '@/types';
import {
  cleanDriverIdentity,
  cleanVehicleIdentity,
  DEFAULT_CONFLICT_WINDOW_MINUTES,
  normalizeDateToIso,
  normalizeTimeHHmm,
  resolveKnownPlaceCoords,
  timeHHmmToMinutes,
} from '@/utils/dispatchConflictDetector';
import { isDateTimeIntervalOverlapping, DEFAULT_TURNAROUND_BUFFER_MINUTES } from '@/utils/availabilityEngine';
import { findVipVehicle } from '@/utils/vehicleData';
import { FLEET_PRESET_DRIVERS } from '@/utils/constants';

export const VIP_META_PREFIX = '__VIP_META_V1__:';
export const UNASSIGNED_VEHICLE_SENTINEL = '미배정';

export interface HqScheduleMeta {
  bookingNo?: string;
  customerName?: string;
  customerId?: string;
  orderingAgency?: string;
  endBrand?: string;
  eventId?: string;
  eventName?: string;
  billingTarget?: 'ordering_agency' | 'end_brand' | 'custom';
  billingTargetName?: string;
  groupId?: string;
  groupName?: string;
  groupTotalVehicles?: number;
  groupVehicleIndex?: number;
  intakeSource?: 'phone' | 'email' | 'quick_dispatch' | 'manual' | 'seed';
  dispatchStatus: 'unassigned' | 'draft' | 'published' | 'cancelled';
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleId?: string | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  passengerPhone?: string | null;
  customerBrochure?: '미생성' | '미발송' | '발송됨' | '재발송 필요' | '실패';
  requestedLanguage?: 'ko' | 'en' | 'other';
  languageOverrideConfirmed?: boolean;
  serviceMode?: 'with_driver' | 'vehicle_only';
  appliedPricingSnapshot?: Record<string, unknown>;
  version: number;
  placeVerified: boolean;
  publishedAt?: string | null;
  publishedBy?: string | null;
  lastAckVersion: number;
  lastAckAt?: string | null;
  cancelReason?: string | null;
  ackHistory?: Array<{
    version: number;
    driverId: string;
    driverName: string;
    deviceSummary: string;
    acknowledgedAt: string;
  }>;
  reminderCount?: number;
  lastRemindedAt?: string | null;
  lastReminderNote?: string | null;
  reminderHistory?: Array<{
    remindedAt: string;
    remindedBy: string;
    note?: string;
    version: number;
  }>;
  previousDriverName?: string | null;
  previousDriverPhone?: string | null;
  previousVehiclePlate?: string | null;
  previousVehicleModel?: string | null;
  pendingCustomerTrigger?: 'dispatch_confirmed' | 'driver_changed' | 'arrived_pickup' | null;
  pendingCustomerTriggeredAt?: string | null;
  customerNotifications?: Array<{
    id: string;
    trigger: 'dispatch_confirmed' | 'driver_changed' | 'arrived_pickup';
    channel: 'email' | 'sms';
    language: 'ko' | 'en';
    recipient: string;
    subject?: string;
    body: string;
    deliveryMethod: 'smtp' | 'manual_copy' | 'sms_app';
    sentAt: string;
    sentBy: string;
    scheduleVersion?: number;
  }>;
  rawPassengerNote?: string | null;
}

export function encodeScheduleMeta(meta: HqScheduleMeta): string {
  return `${VIP_META_PREFIX}${JSON.stringify(meta)}`;
}

export function decodeScheduleMeta(
  rawPassengerNote?: string | null,
  rowStatus?: string | null,
  rowVehicleNo?: string | null
): HqScheduleMeta {
  if (rawPassengerNote && rawPassengerNote.startsWith(VIP_META_PREFIX)) {
    try {
      const parsed = JSON.parse(rawPassengerNote.slice(VIP_META_PREFIX.length));
      return {
        dispatchStatus: parsed.dispatchStatus || 'published',
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        placeVerified: parsed.placeVerified ?? true,
        lastAckVersion: typeof parsed.lastAckVersion === 'number' ? parsed.lastAckVersion : 0,
        ...parsed,
      };
    } catch {
      // Fall through to legacy decoding
    }
  }

  // Legacy row in cockpit.schedules (e.g., Ferrari seed schedules)
  const isUnassigned = rowStatus === 'unassigned' || rowVehicleNo === UNASSIGNED_VEHICLE_SENTINEL;
  const isDraft = rowStatus === 'draft';
  const isCancelled = rowStatus === 'cancelled';
  const isConfirmedAck = rowStatus === 'confirmed' || rowStatus === 'completed';

  const presetDriver = FLEET_PRESET_DRIVERS.find((d) => d.vehicleNo === rowVehicleNo);
  const matchedVeh = findVipVehicle(rowVehicleNo || '');

  return {
    dispatchStatus: isCancelled
      ? 'cancelled'
      : isUnassigned
      ? 'unassigned'
      : isDraft
      ? 'draft'
      : 'published',
    driverName: presetDriver?.driverName || matchedVeh?.defaultDriver || null,
    driverPhone: presetDriver?.phone || null,
    vehiclePlate: presetDriver?.carNumber || matchedVeh?.plate || (rowVehicleNo !== UNASSIGNED_VEHICLE_SENTINEL ? rowVehicleNo : null),
    vehicleModel: matchedVeh?.model || null,
    version: 1,
    placeVerified: true,
    lastAckVersion: isConfirmedAck ? 1 : 0,
    intakeSource: 'seed',
    rawPassengerNote: rawPassengerNote || null,
  };
}

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00+09:00');
    if (isNaN(d.getTime())) return dateStr;
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = days[d.getDay()];
    return `${month}월 ${day}일 (${dayOfWeek})`;
  } catch {
    return dateStr;
  }
}

/**
 * Hydrates a raw `cockpit.schedules` row into a full `DbScheduleRow` with decoded lifecycle metadata.
 */
export function hydrateRawScheduleRow(raw: Record<string, any>): DbScheduleRow & { _meta: HqScheduleMeta } {
  const decoded = decodeScheduleMeta(raw.passenger_note, raw.status, raw.vehicle_no);
  const jsonbMeta =
    raw.schedule_meta && typeof raw.schedule_meta === 'object' && !Array.isArray(raw.schedule_meta)
      ? (raw.schedule_meta as Partial<HqScheduleMeta>)
      : {};
  const meta: HqScheduleMeta = {
    ...decoded,
    ...jsonbMeta,
  };

  const version = typeof raw.version === 'number' ? raw.version : meta.version;
  const lastAckVersion =
    typeof raw.last_ack_version === 'number' ? raw.last_ack_version : meta.lastAckVersion;
  const dispatchStatus =
    (raw.dispatch_status as HqScheduleMeta['dispatchStatus'] | undefined) || meta.dispatchStatus;

  return {
    id: raw.id,
    vehicle_no: raw.vehicle_no,
    date: raw.date,
    pickup_time: raw.pickup_time,
    end_date: raw.end_date ?? (jsonbMeta as any)?.endDate ?? null,
    end_time: raw.end_time ?? (jsonbMeta as any)?.endTime ?? null,
    time_display: raw.time_display,
    origin: raw.origin,
    origin_address: raw.origin_address,
    origin_lat: raw.origin_lat,
    origin_lng: raw.origin_lng,
    destination: raw.destination,
    destination_address: raw.destination_address,
    destination_lat: raw.destination_lat,
    destination_lng: raw.destination_lng,
    passenger_name: raw.passenger_name,
    passenger_count: raw.passenger_count ?? 1,
    passenger_phone: raw.passenger_phone ?? meta.passengerPhone ?? null,
    passenger_note: meta.rawPassengerNote ?? null,
    flight_number: raw.flight_number,
    flight_type: raw.flight_type,
    protocol_notes: raw.protocol_notes,
    status: raw.status || 'scheduled',
    org_id: raw.org_id,
    driver_id: raw.driver_id ?? meta.driverId ?? null,
    driver_name: raw.driver_name ?? meta.driverName ?? null,
    vehicle_id: raw.vehicle_id ?? meta.vehicleId ?? null,
    dispatch_status: dispatchStatus,
    version,
    place_verified: raw.place_verified ?? meta.placeVerified,
    published_at: raw.published_at ?? meta.publishedAt ?? null,
    published_by: raw.published_by ?? meta.publishedBy ?? null,
    last_ack_version: lastAckVersion,
    last_ack_at: raw.last_ack_at ?? meta.lastAckAt ?? null,
    operation_status: raw.operation_status || 'ready',
    operation_updated_at: raw.operation_updated_at || null,
    operation_history: Array.isArray(raw.operation_history) ? raw.operation_history : [],
    source_quote_no: raw.source_quote_no || null,
    schedule_meta: raw.schedule_meta || null,
    driving_log: raw.driving_log || null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    _meta: {
      ...meta,
      dispatchStatus,
      version,
      lastAckVersion,
    },
  };
}

/**
 * Converts a raw or hydrated DB row into `ScheduleItem` (used by both Driver Cockpit & HQ).
 */
export function mapHydratedRowToScheduleItem(rawRow: Record<string, any>): ScheduleItem {
  const row = '_meta' in rawRow ? (rawRow as DbScheduleRow & { _meta: HqScheduleMeta }) : hydrateRawScheduleRow(rawRow);
  const meta = row._meta;

  const isAirportDest =
    (row.destination && (row.destination.includes('공항') || row.destination.toLowerCase().includes('airport'))) ||
    (row.destination_address && (row.destination_address.includes('공항') || row.destination_address.toLowerCase().includes('airport')));

  const hasDepartureNotes = Boolean(row.protocol_notes && /DEPARTURE|출국|샌딩|센딩/i.test(row.protocol_notes));
  const isDeparture = row.flight_type === 'departure' || isAirportDest || hasDepartureNotes;

  let resolvedTimeDisplay = row.time_display;
  if (isDeparture && resolvedTimeDisplay && resolvedTimeDisplay.includes('착륙')) {
    resolvedTimeDisplay = resolvedTimeDisplay.replace('착륙', '픽업');
  }

  const version = row.version || 1;
  const lastAckVersion = row.last_ack_version || 0;
  const isAcknowledged = lastAckVersion >= version;

  const itemStatus: ScheduleItem['status'] =
    row.dispatch_status === 'cancelled' || row.status === 'cancelled'
      ? 'cancelled'
      : row.status === 'completed'
      ? 'completed'
      : row.dispatch_status === 'unassigned' || row.dispatch_status === 'draft'
      ? 'pending'
      : 'confirmed';

  return {
    id: row.id,
    vehicle_no: row.vehicle_no,
    date: row.date,
    dateLabel: formatDateLabel(row.date),
    pickup_time: row.pickup_time ? row.pickup_time.slice(0, 5) : '',
    dropoff_time: null,
    time_display: resolvedTimeDisplay,
    flightType: isDeparture ? 'departure' : 'arrival',
    origin_name: row.origin,
    origin_address: row.origin_address || '',
    origin_lat: row.origin_lat || 37.5042,
    origin_lng: row.origin_lng || 127.0425,
    origin_preset_id: `preset-${(row.origin || 'origin').replace(/\s+/g, '-').toLowerCase()}`,
    destination_name: row.destination,
    destination_address: row.destination_address || '',
    destination_lat: row.destination_lat || 37.4495,
    destination_lng: row.destination_lng || 126.4512,
    destination_preset_id: `preset-${(row.destination || 'dest').replace(/\s+/g, '-').toLowerCase()}`,
    status: itemStatus,
    passenger: row.passenger_name || meta.customerName || '고객 미지정',
    passenger_phone: row.passenger_phone || undefined,
    passenger_count: row.passenger_count || 1,
    flight: row.flight_number || undefined,
    notes: row.protocol_notes || undefined,
    org_id: row.org_id,
    driver_id: row.driver_id || undefined,
    driver_name: row.driver_name || undefined,
    driver_phone: meta.driverPhone || undefined,
    vehicle_id: row.vehicle_id || undefined,
    vehicle_model: meta.vehicleModel || undefined,
    vehicle_plate: meta.vehiclePlate || undefined,
    dispatch_status: row.dispatch_status || 'published',
    version,
    place_verified: row.place_verified ?? true,
    published_at: row.published_at || undefined,
    published_by: row.published_by || undefined,
    last_ack_version: lastAckVersion,
    last_ack_at: row.last_ack_at || undefined,
    isAcknowledged,
    booking_no: meta.bookingNo,
    customer_name: meta.customerName,
    customer_id: meta.customerId,
    ordering_agency: meta.orderingAgency,
    end_brand: meta.endBrand,
    event_id: meta.eventId,
    event_name: meta.eventName,
    billing_target: meta.billingTarget,
    billing_target_name: meta.billingTargetName,
    group_id: meta.groupId,
    group_name: meta.groupName,
    group_total_vehicles: meta.groupTotalVehicles,
    group_vehicle_index: meta.groupVehicleIndex,
    intake_source: meta.intakeSource,
    customer_brochure: meta.customerBrochure,
    requested_language: meta.requestedLanguage,
    language_override_confirmed: meta.languageOverrideConfirmed,
    service_mode: meta.serviceMode,
    applied_pricing_snapshot: meta.appliedPricingSnapshot,
    cancel_reason: meta.cancelReason || undefined,
    reminder_count: meta.reminderCount || 0,
    last_reminded_at: meta.lastRemindedAt || undefined,
    last_reminder_note: meta.lastReminderNote || undefined,
    previous_driver_name: meta.previousDriverName || undefined,
    previous_driver_phone: meta.previousDriverPhone || undefined,
    previous_vehicle_plate: meta.previousVehiclePlate || undefined,
    previous_vehicle_model: meta.previousVehicleModel || undefined,
    pending_customer_trigger: meta.pendingCustomerTrigger ?? null,
    pending_customer_triggered_at: meta.pendingCustomerTriggeredAt || undefined,
    customer_notifications: meta.customerNotifications || [],
    hipass_tolls: Array.isArray(row.driving_log?.hipass_tolls)
      ? row.driving_log.hipass_tolls
      : undefined,
    operation_status: row.operation_status || 'ready',
    operation_updated_at: row.operation_updated_at || undefined,
    operation_history: row.operation_history || [],
    source_quote_no: row.source_quote_no || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Ensures the foreign key `cockpit.schedules.vehicle_no -> cockpit.drivers.vehicle_no` exists
 * before writing any schedule row!
 */
export async function ensureDriverVehicleKeyExists(params: {
  vehicleNo: string;
  carNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
}): Promise<string> {
  const cleanKey = (params.vehicleNo || UNASSIGNED_VEHICLE_SENTINEL).trim() || UNASSIGNED_VEHICLE_SENTINEL;
  const carNumber =
    (params.carNumber && params.carNumber.trim()) ||
    (cleanKey === UNASSIGNED_VEHICLE_SENTINEL ? UNASSIGNED_VEHICLE_SENTINEL : cleanKey);
  const driverName =
    cleanDriverIdentity(params.driverName) ||
    (cleanKey === UNASSIGNED_VEHICLE_SENTINEL ? '배차 대기' : '담당 기사');

  const payload: Record<string, any> = {
    vehicle_no: cleanKey,
    car_number: carNumber,
    driver_name: driverName,
    default_navi: 'tmap',
  };
  if (params.driverPhone) {
    payload.phone = params.driverPhone;
  }

  // 1. Check if vehicle_no already exists in cockpit.drivers to preserve driver profile
  const { data: existing } = await supabaseAdmin
    .from('drivers')
    .select('vehicle_no, driver_name')
    .eq('vehicle_no', cleanKey)
    .maybeSingle();

  if (existing) {
    // Preserve existing verified driver profile, never overwrite via dispatch
    return cleanKey;
  }

  // 2. Only insert if record does not exist
  const { error } = await supabaseAdmin
    .from('drivers')
    .insert(payload);

  if (error) {
    console.warn(`[ScheduleStore] Notice inserting cockpit.drivers for '${cleanKey}':`, error.message);
  }
  return cleanKey;
}

/**
 * Queries schedules from Supabase `cockpit.schedules` and applies role + driver/vehicle boundary rules.
 * - Driver View (`role !== 'hq'`): strictly returns `'published'` schedules (plus `'cancelled'` only if `includeCancelled` is true and previously published to that driver). Never leaks `'unassigned'` or `'draft'`!
 * - HQ View (`role === 'hq'` or `status === 'all'`): returns all schedules across all statuses.
 */
export async function queryServerSchedules(params: {
  vehicleNo?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  plate?: string | null;
  date?: string | null;
  role?: string | null;
  statusParam?: string | null;
  includeCancelledForDriver?: boolean;
}): Promise<{ schedules: ScheduleItem[]; hydratedRows: Array<DbScheduleRow & { _meta: HqScheduleMeta }>; error?: string }> {
  let query = supabaseAdmin.from('schedules').select('*');
  if (params.date) {
    const isoDate = normalizeDateToIso(params.date);
    if (isoDate) query = query.eq('date', isoDate);
  }

  const { data, error } = await query
    .order('date', { ascending: true })
    .order('pickup_time', { ascending: true });

  if (error) {
    console.warn('[ScheduleStore] Supabase query error:', error.message);
    return { schedules: [], hydratedRows: [], error: error.message };
  }

  const allHydrated = (data || []).filter((r: Record<string, any>) => !r.org_id || r.org_id === 'vip_limousine_korea').map((r: Record<string, any>) => hydrateRawScheduleRow(r));
  const isHqView = params.role === 'hq' || params.statusParam === 'all';

  const reqDriverId = params.driverId?.trim() || '';
  const reqDriverName = cleanDriverIdentity(params.driverName);
  const reqPlate = cleanVehicleIdentity(params.plate);
  const reqVehicleNo = params.vehicleNo && params.vehicleNo !== 'all' ? params.vehicleNo.trim() : '';
  const reqVehicleNoClean = cleanVehicleIdentity(reqVehicleNo);

  const filtered = allHydrated.filter((row) => {
    const ds = row.dispatch_status || 'published';

    // 1. Authorization & Role boundary
    if (!isHqView) {
      if (params.includeCancelledForDriver && ds === 'cancelled') {
        // Allow cancelled schedules that were previously assigned to this driver/vehicle so driver sees cancellation alert
        if (row.vehicle_no === UNASSIGNED_VEHICLE_SENTINEL) return false;
      } else if (ds !== 'published') {
        return false;
      }
      if (row.vehicle_no === UNASSIGNED_VEHICLE_SENTINEL) return false;
    } else if (params.statusParam && params.statusParam !== 'all') {
      if (ds !== params.statusParam) return false;
    }

    // Drivers are scoped by immutable UUID; name/plate/vehicle tabs cannot widen access.
    if (!isHqView) return Boolean(reqDriverId && row.driver_id === reqDriverId);

    // 2. HQ filtering by explicit identity
    if (!reqDriverId && !reqDriverName && !reqPlate && !reqVehicleNo) {
      return true;
    }

    const rowDriverId = row.driver_id || '';
    const rowDriverName = cleanDriverIdentity(row.driver_name);
    const rowPlate = cleanVehicleIdentity(row._meta.vehiclePlate);
    const rowVehNo = cleanVehicleIdentity(row.vehicle_no);

    if (reqDriverId && rowDriverId && reqDriverId === rowDriverId) return true;

    // If querying a specific vehicle tab (e.g. '4호차' or '703서 2658')
    if (reqVehicleNo) {
      if (row.vehicle_no === reqVehicleNo) return true;
      if (reqVehicleNoClean && (rowVehNo === reqVehicleNoClean || rowPlate === reqVehicleNoClean)) {
        return true;
      }
      // If querying a Fleet Hocha tab (e.g. '4호차') without a conflicting driver filter,
      // also include dispatches assigned to that Hocha's dedicated preset driver (e.g. '윤태준' on '116허 1514')
      const hochaPreset = FLEET_PRESET_DRIVERS.find((d) => d.vehicleNo === reqVehicleNo);
      if (hochaPreset && !reqDriverName) {
        const presetDrvClean = cleanDriverIdentity(hochaPreset.driverName);
        const presetPlateClean = cleanVehicleIdentity(hochaPreset.carNumber);
        if (presetDrvClean && rowDriverName === presetDrvClean) return true;
        if (presetPlateClean && (rowPlate === presetPlateClean || rowVehNo === presetPlateClean)) {
          return true;
        }
      }
    }

    if (reqPlate && (rowPlate === reqPlate || rowVehNo === reqPlate)) {
      return true;
    }

    // Match by driver name when explicitly supplied and no conflicting vehicle tab filter
    if (reqDriverName && rowDriverName === reqDriverName) {
      if (!reqVehicleNo) return true;
      // Also match if driver's profile vehicle is e.g. '4호차' and HQ dispatched to their plate '116허 1514'
      const hochaMatch = reqVehicleNo.match(/^(\d+)호차$/);
      if (hochaMatch) {
        const presetDrv = FLEET_PRESET_DRIVERS.find((d) => d.vehicleNo === reqVehicleNo);
        if (presetDrv && cleanDriverIdentity(presetDrv.driverName) === reqDriverName) {
          return true;
        }
      }
    }

    return false;
  });

  return {
    schedules: filtered.map((r) => mapHydratedRowToScheduleItem(r)),
    hydratedRows: filtered,
  };
}

export interface DispatchUpsertInput {
  scheduleId?: string;
  bookingNo?: string;
  customerName?: string;
  customerId?: string;
  orderingAgency?: string;
  endBrand?: string;
  eventId?: string;
  eventName?: string;
  billingTarget?: 'ordering_agency' | 'end_brand' | 'custom';
  billingTargetName?: string;
  groupId?: string;
  groupName?: string;
  groupTotalVehicles?: number;
  groupVehicleIndex?: number;
  intakeSource?: 'phone' | 'email' | 'quick_dispatch' | 'manual' | 'seed';
  vehicleNo?: string;
  vehicleId?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  date: string;
  endDate?: string;
  pickupTime: string;
  endTime?: string;
  timeDisplay?: string;
  origin: string;
  originAddress?: string;
  originLat?: number;
  originLng?: number;
  destination: string;
  destinationAddress?: string;
  destinationLat?: number;
  destinationLng?: number;
  passengerName?: string;
  passengerPhone?: string;
  passengerCount?: number;
  flightNumber?: string;
  notes?: string;
  dispatchStatus?: 'unassigned' | 'draft' | 'published' | 'cancelled';
  placeVerified?: boolean;
  allowUnverified?: boolean;
  allowConflictOverride?: boolean;
  publishedBy?: string;
  customerBrochure?: '미생성' | '미발송' | '발송됨' | '재발송 필요' | '실패';
  requestedLanguage?: 'ko' | 'en' | 'other';
  languageOverrideConfirmed?: boolean;
  serviceMode?: 'with_driver' | 'vehicle_only';
  appliedPricingSnapshot?: Record<string, unknown>;
}

export interface ServerConflictDetail {
  type: 'driver' | 'vehicle' | 'time';
  target: string;
  conflictingScheduleId?: string;
  conflictingCustomer?: string;
  conflictingTime?: string;
  conflictingRoute?: string;
  message: string;
}

/**
 * Checks existing active schedules in Supabase for driver or vehicle overlap.
 * Uses interval-based collision detection [start_at, end_at + buffer) supporting
 * multi-day rentals, cross-midnight trips, and turn-around buffers.
 */
export async function checkServerDispatchConflicts(
  candidates: DispatchUpsertInput[],
  injectedExistingRows?: Array<DbScheduleRow & { _meta: HqScheduleMeta }>
): Promise<ServerConflictDetail[]> {
  const publishedCandidates = candidates.filter(
    (c) => (c.dispatchStatus || 'published') === 'published'
  );
  if (publishedCandidates.length === 0) return [];

  // Determine global time span covering all candidates to query relevant active DB schedules
  const startDates = publishedCandidates.map((c) => normalizeDateToIso(c.date)).filter(Boolean).sort();
  const endDates = publishedCandidates.map((c) => normalizeDateToIso(c.endDate || c.date)).filter(Boolean).sort().reverse();
  if (startDates.length === 0) return [];

  const minStartIso = startDates[0];
  const maxEndIso = endDates[0];

  // Helper to shift ISO date by N days
  const shiftIsoDate = (iso: string, days: number): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };

  // Expand query window by 1 day on both sides to catch cross-midnight turnaround buffer collisions (e.g. 23:30 -> 00:10 next day)
  const expandedMinStartIso = shiftIsoDate(minStartIso, -1);
  const expandedMaxEndIso = shiftIsoDate(maxEndIso, 1);

  let rawRows: any[] = [];
  if (injectedExistingRows) {
    rawRows = injectedExistingRows;
  } else {
    // Fetch active schedules that could possibly overlap with [expandedMinStartIso, expandedMaxEndIso]
    const { data, error } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .neq('dispatch_status', 'cancelled')
      .neq('status', 'cancelled');

    if (error && typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
      console.error('[checkServerDispatchConflicts] Fail-closed: DB error querying schedules:', error);
      throw new Error(`배차 충돌 검사 실패 (DB 조회 오류: ${error.message})`);
    }
    rawRows = data || [];
  }

  const existingRows = rawRows
    .map((r: Record<string, any>) =>
      '_meta' in r ? (r as DbScheduleRow & { _meta: HqScheduleMeta }) : hydrateRawScheduleRow(r)
    )
    .filter((ex) => {
      const exStart = normalizeDateToIso(ex.date);
      const exEnd = normalizeDateToIso(ex.end_date) || exStart;
      return exEnd >= expandedMinStartIso && exStart <= expandedMaxEndIso;
    });

  const conflicts: ServerConflictDetail[] = [];

  // 1. Check candidates against existing DB schedules
  for (const cand of publishedCandidates) {
    const candStartDate = normalizeDateToIso(cand.date);
    const candEndDate = normalizeDateToIso(cand.endDate || cand.date);
    const candStartMin = timeHHmmToMinutes(cand.pickupTime);
    if (!candStartDate || candStartMin === null) continue;

    // Strict validation: Confirmed published dispatch MUST have an explicit endTime
    if (!cand.endTime || !cand.endTime.trim()) {
      conflicts.push({
        type: 'time',
        target: cand.vehiclePlate || cand.vehicleNo || cand.driverName || '신규 배차',
        message: '확정 배차에는 종료 시간(endTime)이 필수입니다. 종료 시간을 입력해 주세요.',
      });
      continue;
    }

    const candEndMin = timeHHmmToMinutes(cand.endTime);
    if (candEndMin === null) {
      conflicts.push({
        type: 'time',
        target: cand.vehiclePlate || cand.vehicleNo || cand.driverName || '신규 배차',
        message: '유효한 종료 시간(HH:mm) 형식을 입력해 주세요.',
      });
      continue;
    }

    const candDriver = cleanDriverIdentity(cand.driverName);
    const candPlate = cleanVehicleIdentity(cand.vehiclePlate || cand.vehicleNo);
    const isCandVehicleOnly =
      cand.serviceMode === 'vehicle_only' ||
      cand.driverName === '기사 미배정' ||
      cand.driverName === '자차 운행';

    for (const ex of existingRows) {
      if (cand.scheduleId && ex.id === cand.scheduleId) continue;
      if (ex.dispatch_status !== 'published') continue;

      const exStartDate = normalizeDateToIso(ex.date);
      const exEndDate = normalizeDateToIso(ex.end_date) || exStartDate;
      const exStartMin = timeHHmmToMinutes(ex.pickup_time);
      if (exStartMin === null) continue;

      const hasRealEndTime = Boolean(ex.end_time);
      const exEndMin = hasRealEndTime
        ? (timeHHmmToMinutes(ex.end_time) ?? 1140)
        : (23 * 60 + 59); // Conservative coverage if end time was not specified

      const isOverlap = isDateTimeIntervalOverlapping(
        { startDate: candStartDate, startTime: candStartMin, endDate: candEndDate, endTime: candEndMin },
        { startDate: exStartDate, startTime: exStartMin, endDate: exEndDate, endTime: exEndMin },
        DEFAULT_TURNAROUND_BUFFER_MINUTES
      );

      if (!isOverlap) continue;

      const exDriver = cleanDriverIdentity(ex.driver_name);
      const exPlate = cleanVehicleIdentity(ex._meta?.vehiclePlate || ex.vehicle_no);
      const isExVehicleOnly =
        ex._meta?.serviceMode === 'vehicle_only' ||
        ex.driver_name === '기사 미배정' ||
        ex.driver_name === '자차 운행';

      const exTimeLabel = `${exStartDate} ${ex.pickup_time.slice(0, 5)} ~ ${exEndDate} ${hasRealEndTime ? ex.end_time!.slice(0, 5) : '종료 미확정 (확인 필요)'}`;

      // Driver Conflict: Strict UUID matching when both exist, avoiding same-name false positives
      let isDriverConflict = false;
      if (!isCandVehicleOnly && !isExVehicleOnly) {
        if (cand.driverId && ex.driver_id) {
          isDriverConflict = cand.driverId === ex.driver_id;
        } else if (candDriver && exDriver) {
          isDriverConflict = candDriver === exDriver;
        }
      }

      if (isDriverConflict) {
        conflicts.push({
          type: 'driver',
          target: cand.driverName || candDriver,
          conflictingScheduleId: ex.id,
          conflictingCustomer: ex._meta.customerName || ex.passenger_name || '기존 고객',
          conflictingTime: ex.pickup_time.slice(0, 5),
          conflictingRoute: `${ex.origin} → ${ex.destination}`,
          message: hasRealEndTime
            ? `${candDriver} 기사는 ${exTimeLabel} (${ex._meta.customerName || ex.passenger_name}: ${ex.origin}→${ex.destination}) 배차와 일정이 겹칩니다.`
            : `[일정 충돌 주의] ${candDriver} 기사의 기존 배차(${exTimeLabel}) 종료 시간이 미확정 상태입니다. 중복 배차 방지를 위해 종료 시간을 먼저 확인해 주세요.`,
        });
      }

      // Vehicle Conflict: Strict UUID matching when both exist
      let isVehicleConflict = false;
      if (cand.vehicleId && ex.vehicle_id) {
        isVehicleConflict = cand.vehicleId === ex.vehicle_id;
      } else if (candPlate && exPlate) {
        isVehicleConflict = candPlate === exPlate;
      }

      if (isVehicleConflict) {
        const vehLabel = cand.vehiclePlate || cand.vehicleNo || candPlate;
        conflicts.push({
          type: 'vehicle',
          target: vehLabel,
          conflictingScheduleId: ex.id,
          conflictingCustomer: ex._meta.customerName || ex.passenger_name || '기존 고객',
          conflictingTime: ex.pickup_time.slice(0, 5),
          conflictingRoute: `${ex.origin} → ${ex.destination}`,
          message: hasRealEndTime
            ? `${vehLabel} 차량은 ${exTimeLabel} (${ex._meta.customerName || ex.passenger_name}: ${ex.origin}→${ex.destination}) 배차와 일정이 겹칩니다.`
            : `[일정 충돌 주의] ${vehLabel} 차량의 기존 배차(${exTimeLabel}) 종료 시간이 미확정 상태입니다. 중복 배차 방지를 위해 종료 시간을 먼저 확인해 주세요.`,
        });
      }
    }
  }

  // 2. Check intra-batch conflicts (e.g. assigning same driver or vehicle twice in a multi-vehicle event)
  for (let i = 0; i < publishedCandidates.length; i++) {
    for (let j = i + 1; j < publishedCandidates.length; j++) {
      const a = publishedCandidates[i];
      const b = publishedCandidates[j];

      const startMinA = timeHHmmToMinutes(a.pickupTime);
      const startMinB = timeHHmmToMinutes(b.pickupTime);
      if (startMinA === null || startMinB === null) continue;

      if (!a.endTime || !b.endTime) continue;
      const endMinA = timeHHmmToMinutes(a.endTime);
      const endMinB = timeHHmmToMinutes(b.endTime);
      if (endMinA === null || endMinB === null) continue;

      const isBatchOverlap = isDateTimeIntervalOverlapping(
        { startDate: a.date, startTime: startMinA, endDate: a.endDate, endTime: endMinA },
        { startDate: b.date, startTime: startMinB, endDate: b.endDate, endTime: endMinB },
        DEFAULT_TURNAROUND_BUFFER_MINUTES
      );

      if (!isBatchOverlap) continue;

      const isAVehicleOnly =
        a.serviceMode === 'vehicle_only' || a.driverName === '기사 미배정' || a.driverName === '자차 운행';
      const isBVehicleOnly =
        b.serviceMode === 'vehicle_only' || b.driverName === '기사 미배정' || b.driverName === '자차 운행';

      const drvA = cleanDriverIdentity(a.driverName);
      const drvB = cleanDriverIdentity(b.driverName);
      let matchDriver = false;
      if (a.driverId && b.driverId) {
        matchDriver = a.driverId === b.driverId;
      } else if (drvA && drvB) {
        matchDriver = drvA === drvB;
      }

      if (!isAVehicleOnly && !isBVehicleOnly && matchDriver) {
        conflicts.push({
          type: 'driver',
          target: a.driverName || drvA,
          conflictingScheduleId: 'intra-batch',
          conflictingCustomer: b.customerName || '동일 행사 타 호차',
          conflictingTime: normalizeTimeHHmm(b.pickupTime),
          conflictingRoute: `${b.origin} → ${b.destination}`,
          message: `복수 차량 배차 내 ${i + 1}호차와 ${j + 1}호차에 동일 기사(${a.driverName || drvA})가 중복 선택되었습니다.`,
        });
      }

      const pltA = cleanVehicleIdentity(a.vehiclePlate || a.vehicleNo);
      const pltB = cleanVehicleIdentity(b.vehiclePlate || b.vehicleNo);
      let matchVehicle = false;
      if (a.vehicleId && b.vehicleId) {
        matchVehicle = a.vehicleId === b.vehicleId;
      } else if (pltA && pltB) {
        matchVehicle = pltA === pltB;
      }

      if (matchVehicle) {
        const label = a.vehiclePlate || a.vehicleNo || pltA;
        conflicts.push({
          type: 'vehicle',
          target: label,
          conflictingScheduleId: 'intra-batch',
          conflictingCustomer: b.customerName || '동일 행사 타 호차',
          conflictingTime: normalizeTimeHHmm(b.pickupTime),
          conflictingRoute: `${b.origin} → ${b.destination}`,
          message: `복수 차량 배차 내 ${i + 1}호차와 ${j + 1}호차에 동일 차량(${label})이 중복 선택되었습니다.`,
        });
      }
    }
  }

  return conflicts;
}

function isTestRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env.NODE_ENV === 'test' || Boolean(process.env.npm_lifecycle_event?.includes('test')))
  );
}

export const inMemoryTestStore = new Map<string, any>();

/**
 * Inserts or updates a schedule/reservation in `cockpit.schedules` with full HQ-Driver metadata.
 */
async function prepareServerDispatchSchedule(
  input: DispatchUpsertInput
): Promise<{ row?: Record<string, any>; expectedUpdatedAt?: string; error?: string; statusCode?: number }> {
  const intervalError = validateDispatchInterval({ ...input, dispatchStatus: input.dispatchStatus || 'published' });
  if (intervalError) return { error: intervalError, statusCode: 400 };
  const isoDate = normalizeDateToIso(input.date);
  const hhmm = normalizeTimeHHmm(input.pickupTime);

  if (!isoDate || !hhmm || !input.origin?.trim() || !input.destination?.trim()) {
    return {
      error: '운행 일자, 픽업 시간, 출발지, 목적지는 필수 입력 항목입니다.',
      statusCode: 400,
    };
  }

  const cleanDrv = cleanDriverIdentity(input.driverName);
  const cleanPlt = cleanVehicleIdentity(input.vehiclePlate);
  const requestedStatus = input.dispatchStatus || 'published';

  // Determine effective dispatch status
  let effectiveDispatchStatus: HqScheduleMeta['dispatchStatus'] = requestedStatus;
  if (requestedStatus === 'published') {
    const needsDriver = input.serviceMode !== 'vehicle_only';
    if ((needsDriver && (!cleanDrv || !input.driverId)) || (!cleanPlt && !input.vehicleNo)) {
      return {
        error: '배차 확정을 위해 차량과 담당 기사를 선택해주세요. 아직 배정 전이라면 [미배정 예약 등록]을 이용하세요.',
        statusCode: 400,
      };
    }
  }

  // Resolve coordinates
  const originResolved =
    typeof input.originLat === 'number' && typeof input.originLng === 'number'
      ? {
          lat: input.originLat,
          lng: input.originLng,
          address: input.originAddress || '',
          verified: input.placeVerified ?? true,
        }
      : resolveKnownPlaceCoords(input.origin, input.originAddress);

  const destResolved =
    typeof input.destinationLat === 'number' && typeof input.destinationLng === 'number'
      ? {
          lat: input.destinationLat,
          lng: input.destinationLng,
          address: input.destinationAddress || '',
          verified: input.placeVerified ?? true,
        }
      : resolveKnownPlaceCoords(input.destination, input.destinationAddress);

  const resolvedPlaceVerified =
    input.placeVerified !== undefined
      ? Boolean(input.placeVerified)
      : originResolved.verified && destResolved.verified;

  // Preserve Unresolved Place Guard if caller explicitly requires verified places without allowUnverified
  if (
    effectiveDispatchStatus === 'published' &&
    input.placeVerified === false &&
    !input.allowUnverified
  ) {
    return {
      error: '미확인 장소가 포함되어 있어 배차를 발송할 수 없습니다. 주소 및 핀을 확정해주세요.',
      statusCode: 400,
    };
  }

  // Determine canonical `vehicle_no` for FK `cockpit.drivers(vehicle_no)`
  const matchedVeh = findVipVehicle(input.vehiclePlate || input.vehicleNo || '');
  if (requestedStatus === 'published' && (!matchedVeh || cleanVehicleIdentity(matchedVeh.plate) !== cleanVehicleIdentity(input.vehiclePlate || input.vehicleNo) || (input.vehicleId && input.vehicleId !== matchedVeh.uuid))) {
    return { error: '확정 배차의 차량 UUID와 정확한 전체 번호판을 확인해 주세요.', statusCode: 400 };
  }
  const resolvedPlate =
    (input.vehiclePlate && input.vehiclePlate !== '미배정' ? input.vehiclePlate.trim() : '') ||
    matchedVeh?.plate ||
    '';

  const resolvedModel =
    (input.vehicleModel && input.vehicleModel !== '-' ? input.vehicleModel.trim() : '') ||
    matchedVeh?.model ||
    '';

  let targetVehicleNo = UNASSIGNED_VEHICLE_SENTINEL;
  if (effectiveDispatchStatus === 'published' || resolvedPlate || (input.vehicleNo && input.vehicleNo !== UNASSIGNED_VEHICLE_SENTINEL)) {
    targetVehicleNo =
      (input.vehicleNo && input.vehicleNo !== UNASSIGNED_VEHICLE_SENTINEL ? input.vehicleNo.trim() : '') ||
      resolvedPlate ||
      UNASSIGNED_VEHICLE_SENTINEL;
  }

  // Check if updating an existing row
  let existingHydrated: (DbScheduleRow & { _meta: HqScheduleMeta }) | null = null;
  if (input.scheduleId) {
    const { data: exRaw, error: readError } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .eq('id', input.scheduleId)
      .maybeSingle();
    if (readError) return { error: '기존 배차 조회에 실패했습니다.', statusCode: 503 };
    if (!exRaw) return { error: '해당 배차를 찾을 수 없습니다.', statusCode: 404 };
    existingHydrated = hydrateRawScheduleRow(exRaw);
  }

  const nowIso = new Date().toISOString();
  const formattedPickupTime = `${hhmm}:00`;
  const resolvedTimeDisplay = input.timeDisplay || `픽업 ${hhmm}`;

  let nextVersion = 1;
  let lastAckVersion = 0;
  let lastAckAt: string | null = null;
  let ackHistory = existingHydrated?._meta.ackHistory || [];
  let previousDriverName: string | null = existingHydrated?._meta.previousDriverName ?? null;
  let previousDriverPhone: string | null = existingHydrated?._meta.previousDriverPhone ?? null;
  let previousVehiclePlate: string | null = existingHydrated?._meta.previousVehiclePlate ?? null;
  let previousVehicleModel: string | null = existingHydrated?._meta.previousVehicleModel ?? null;
  let pendingCustomerTrigger: HqScheduleMeta['pendingCustomerTrigger'] =
    existingHydrated?._meta.pendingCustomerTrigger ?? null;
  let pendingCustomerTriggeredAt: string | null =
    existingHydrated?._meta.pendingCustomerTriggeredAt ?? null;
  let reminderCount = existingHydrated?._meta.reminderCount || 0;
  let lastRemindedAt: string | null = existingHydrated?._meta.lastRemindedAt ?? null;
  let lastReminderNote: string | null = existingHydrated?._meta.lastReminderNote ?? null;

  if (existingHydrated) {
    const prevMeta = existingHydrated._meta;
    const wasPublished = prevMeta.dispatchStatus === 'published';
    const prevDriverClean = cleanDriverIdentity(prevMeta.driverName || existingHydrated.driver_name);
    const driverChanged = prevMeta.driverId !== input.driverId || prevDriverClean !== cleanDrv;
    const plateChanged = cleanVehicleIdentity(prevMeta.vehiclePlate) !== cleanVehicleIdentity(resolvedPlate);
    const itineraryChanged =
      existingHydrated.date !== isoDate ||
      existingHydrated.end_date !== (input.endDate || isoDate) ||
      normalizeTimeHHmm(existingHydrated.end_time) !== normalizeTimeHHmm(input.endTime) ||
      normalizeTimeHHmm(existingHydrated.pickup_time) !== hhmm ||
      existingHydrated.origin !== input.origin.trim() ||
      existingHydrated.destination !== input.destination.trim() ||
      (existingHydrated.passenger_name || '') !== (input.passengerName || input.customerName || '');

    if (driverChanged) {
      // New driver must acknowledge fresh from 0
      nextVersion = wasPublished ? (prevMeta.version || 1) + 1 : 1;
      lastAckVersion = 0;
      lastAckAt = null;
      reminderCount = 0;
      lastRemindedAt = null;
      lastReminderNote = null;
      if (wasPublished && prevDriverClean) {
        previousDriverName = prevDriverClean;
        previousDriverPhone = prevMeta.driverPhone || null;
        previousVehiclePlate = prevMeta.vehiclePlate || null;
        previousVehicleModel = prevMeta.vehicleModel || null;
      }
    } else if (wasPublished && (plateChanged || itineraryChanged || effectiveDispatchStatus === 'published')) {
      nextVersion = (prevMeta.version || 1) + (plateChanged || itineraryChanged ? 1 : 0);
      lastAckVersion = prevMeta.lastAckVersion || 0;
      lastAckAt = prevMeta.lastAckAt || null;
      if (plateChanged || itineraryChanged) {
        reminderCount = 0;
        lastRemindedAt = null;
        lastReminderNote = null;
      }
      if (plateChanged && prevMeta.vehiclePlate) {
        previousDriverName = prevDriverClean || previousDriverName;
        previousDriverPhone = prevMeta.driverPhone || previousDriverPhone;
        previousVehiclePlate = prevMeta.vehiclePlate;
        previousVehicleModel = prevMeta.vehicleModel || null;
      }
    } else {
      nextVersion = prevMeta.version || 1;
      lastAckVersion = prevMeta.lastAckVersion || 0;
      lastAckAt = prevMeta.lastAckAt || null;
    }

    // Auto-prepare customer notification draft (never auto-sends; awaits admin confirmation)
    if (effectiveDispatchStatus === 'published') {
      if (!wasPublished) {
        pendingCustomerTrigger = 'dispatch_confirmed';
        pendingCustomerTriggeredAt = nowIso;
      } else if (driverChanged || plateChanged) {
        pendingCustomerTrigger = 'driver_changed';
        pendingCustomerTriggeredAt = nowIso;
      }
    }
  } else if (effectiveDispatchStatus === 'published') {
    pendingCustomerTrigger = 'dispatch_confirmed';
    pendingCustomerTriggeredAt = nowIso;
  }

  const bookingNo =
    input.bookingNo ||
    existingHydrated?._meta.bookingNo ||
    `#${isoDate.replace(/-/g, '').slice(2)}-${String(Math.floor(100 + Math.random() * 900))}`;

  const nextMeta: HqScheduleMeta = {
    ...(existingHydrated?._meta || {}),
    bookingNo,
    customerName: input.customerName?.trim() || existingHydrated?._meta.customerName || input.passengerName?.trim() || 'VIP 고객',
    customerId: input.customerId || existingHydrated?._meta.customerId,
    orderingAgency: input.orderingAgency ?? existingHydrated?._meta.orderingAgency,
    endBrand: input.endBrand ?? existingHydrated?._meta.endBrand,
    eventId: input.eventId || existingHydrated?._meta.eventId,
    eventName: input.eventName || existingHydrated?._meta.eventName,
    billingTarget: input.billingTarget || existingHydrated?._meta.billingTarget,
    billingTargetName: input.billingTargetName || existingHydrated?._meta.billingTargetName,
    groupId: input.groupId ?? existingHydrated?._meta.groupId,
    groupName: input.groupName ?? existingHydrated?._meta.groupName,
    groupTotalVehicles: input.groupTotalVehicles ?? existingHydrated?._meta.groupTotalVehicles,
    groupVehicleIndex: input.groupVehicleIndex ?? existingHydrated?._meta.groupVehicleIndex,
    intakeSource: input.intakeSource || existingHydrated?._meta.intakeSource || 'quick_dispatch',
    dispatchStatus: effectiveDispatchStatus,
    driverId: input.driverId ?? existingHydrated?._meta.driverId ?? null,
    driverName:
      input.serviceMode === 'vehicle_only'
        ? '차량만 대여'
        : cleanDrv || null,
    driverPhone: input.driverPhone ?? existingHydrated?._meta.driverPhone ?? null,
    vehicleId: input.vehicleId || matchedVeh?.uuid || existingHydrated?._meta.vehicleId || null,
    vehicleModel: resolvedModel || null,
    vehiclePlate: resolvedPlate || null,
    passengerPhone: input.passengerPhone ?? existingHydrated?._meta.passengerPhone ?? null,
    customerBrochure: input.customerBrochure || existingHydrated?._meta.customerBrochure || '미발송',
    requestedLanguage: input.requestedLanguage || existingHydrated?._meta.requestedLanguage || 'ko',
    languageOverrideConfirmed:
      input.languageOverrideConfirmed ?? existingHydrated?._meta.languageOverrideConfirmed ?? false,
    serviceMode: input.serviceMode || existingHydrated?._meta.serviceMode || 'with_driver',
    appliedPricingSnapshot:
      input.appliedPricingSnapshot || existingHydrated?._meta.appliedPricingSnapshot,
    version: nextVersion,
    placeVerified: resolvedPlaceVerified,
    publishedAt:
      effectiveDispatchStatus === 'published'
        ? nowIso
        : existingHydrated?._meta.publishedAt ?? null,
    publishedBy:
      effectiveDispatchStatus === 'published'
        ? input.publishedBy || '대표님/관리자'
        : existingHydrated?._meta.publishedBy ?? null,
    lastAckVersion,
    lastAckAt,
    ackHistory,
    reminderCount,
    lastRemindedAt,
    lastReminderNote,
    previousDriverName,
    previousDriverPhone,
    previousVehiclePlate,
    previousVehicleModel,
    pendingCustomerTrigger,
    pendingCustomerTriggeredAt,
  };

  const dbStatus =
    effectiveDispatchStatus === 'cancelled'
      ? 'cancelled'
      : effectiveDispatchStatus === 'unassigned'
      ? 'unassigned'
      : effectiveDispatchStatus === 'draft'
      ? 'draft'
      : lastAckVersion >= nextVersion
      ? 'confirmed'
      : 'scheduled';

  const dbPayload: Record<string, any> = {
    id: input.scheduleId || randomUUID(),
    org_id: 'vip_limousine_korea',
    driver_id: input.serviceMode === 'vehicle_only' ? null : nextMeta.driverId,
    vehicle_id: nextMeta.vehicleId,
    vehicle_no: targetVehicleNo,
    date: isoDate,
    end_date: input.endDate ? (normalizeDateToIso(input.endDate) || isoDate) : isoDate,
    pickup_time: formattedPickupTime,
    end_time: input.endTime ? (normalizeTimeHHmm(input.endTime) ? `${normalizeTimeHHmm(input.endTime)}:00` : null) : null,
    time_display: resolvedTimeDisplay,
    origin: input.origin.trim(),
    origin_address: originResolved.address || null,
    origin_lat: originResolved.lat,
    origin_lng: originResolved.lng,
    destination: input.destination.trim(),
    destination_address: destResolved.address || null,
    destination_lat: destResolved.lat,
    destination_lng: destResolved.lng,
    passenger_name:
      input.passengerName?.trim() ||
      input.customerName?.trim() ||
      existingHydrated?.passenger_name ||
      'VIP 승객',
    passenger_count: input.passengerCount || existingHydrated?.passenger_count || 1,
    passenger_note: encodeScheduleMeta(nextMeta),
    schedule_meta: nextMeta,
    flight_number: input.flightNumber?.trim() || null,
    protocol_notes: input.notes?.trim() || null,
    driver_name: cleanDrv || input.driverName || null,
    driver_phone: input.driverPhone || null,
    vehicle_plate: resolvedPlate || null,
    vehicle_model: resolvedModel || null,
    dispatch_status: effectiveDispatchStatus,
    version: nextVersion,
    last_ack_version: lastAckVersion,
    last_ack_at: lastAckAt,
    status: dbStatus,
    updated_at: nowIso,
  };

  return { row: dbPayload, expectedUpdatedAt: existingHydrated?.updated_at || undefined };
}

/** All creation/update callers use the same database transaction. No direct insert fallback. */
export async function upsertServerDispatchSchedule(input: DispatchUpsertInput): Promise<{
  schedule?: ScheduleItem; error?: string; statusCode?: number;
}> {
  const result = await atomicUpsertServerDispatchBatch([input]);
  return { schedule: result.schedules?.[0], error: result.error, statusCode: result.statusCode };
}

/**
 * Records Driver Acknowledgment (or Re-acknowledgment on v2+) in `cockpit.schedules`.
 */
export async function acknowledgeServerSchedule(params: {
  scheduleId: string;
  version?: number;
  driverId?: string;
  driverName?: string;
  deviceSummary?: string;
}): Promise<{ schedule?: ScheduleItem; acknowledgedAt?: string; version?: number; error?: string; statusCode?: number }> {
  const { data: raw, error: fetchErr } = await supabaseAdmin
    .from('schedules')
    .select('*')
    .eq('id', params.scheduleId)
    .maybeSingle();

  if (fetchErr || !raw) {
    return { error: '해당 배차 일정을 찾을 수 없습니다.', statusCode: 404 };
  }

  const hydrated = hydrateRawScheduleRow(raw);

  // Guard 1: Block acknowledging cancelled schedules
  if (hydrated.dispatch_status === 'cancelled' || hydrated.status === 'cancelled') {
    return { error: '취소된 배차는 확인할 수 없습니다.', statusCode: 400 };
  }

  // Guard 2: Block acknowledging outdated or future versions (Must match exact current version)
  const currentVersion = hydrated.version || 1;
  if (typeof params.version === 'number' && params.version !== currentVersion) {
    return {
      error: `현재 버전(v${currentVersion})과 일치하지 않습니다. (요청 버전: v${params.version}) 최신 배차 정보를 확인해주세요.`,
      statusCode: 409,
    };
  }

  // Guard 3: Block acknowledging by a different driver
  const assignedDriver = cleanDriverIdentity(hydrated.driver_name || hydrated._meta.driverName);
  const reqDriver = cleanDriverIdentity(params.driverName);
  if (assignedDriver && reqDriver && assignedDriver !== reqDriver) {
    return {
      error: `해당 배차의 담당 기사(${hydrated.driver_name})만 확인할 수 있습니다.`,
      statusCode: 403,
    };
  }

  const nowIso = new Date().toISOString();
  const ackVersion = typeof params.version === 'number' && params.version > 0 ? params.version : currentVersion;

  const prevHistory = hydrated._meta.ackHistory || [];
  const nextMeta: HqScheduleMeta = {
    ...hydrated._meta,
    lastAckVersion: ackVersion,
    lastAckAt: nowIso,
    reminderCount: 0,
    lastRemindedAt: null,
    lastReminderNote: null,
    ackHistory: [
      ...prevHistory,
      {
        version: ackVersion,
        driverId: params.driverId || hydrated.driver_id || 'driver_mobile',
        driverName: params.driverName || hydrated.driver_name || '담당 기사',
        deviceSummary: params.deviceSummary || 'Driver Cockpit Mobile',
        acknowledgedAt: nowIso,
      },
    ],
  };

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('schedules')
    .update({
      passenger_note: encodeScheduleMeta(nextMeta),
      schedule_meta: nextMeta,
      last_ack_version: ackVersion,
      last_ack_at: nowIso,
      status: hydrated._meta.dispatchStatus === 'cancelled' ? 'cancelled' : 'confirmed',
      updated_at: nowIso,
    })
    .eq('id', params.scheduleId)
    .select('*')
    .single();

  if (updateErr) {
    return { error: updateErr.message, statusCode: 400 };
  }

  return {
    schedule: mapHydratedRowToScheduleItem(updated),
    acknowledgedAt: nowIso,
    version: ackVersion,
  };
}

/**
 * Cancels a schedule in `cockpit.schedules`, bumping version and recording cancellation reason.
 */
export async function cancelServerSchedule(params: {
  scheduleId: string;
  reason?: string;
  cancelledBy?: string;
}): Promise<{ schedule?: ScheduleItem; version?: number; cancelledAt?: string; error?: string; statusCode?: number }> {
  const { data: raw, error: fetchErr } = await supabaseAdmin
    .from('schedules')
    .select('*')
    .eq('id', params.scheduleId)
    .maybeSingle();

  if (fetchErr || !raw) {
    return { error: '해당 배차 일정을 찾을 수 없습니다.', statusCode: 404 };
  }

  const hydrated = hydrateRawScheduleRow(raw);
  const nowIso = new Date().toISOString();
  const nextVersion = (hydrated.version || 1) + 1;
  const reason = params.reason?.trim() || '고객 요청 취소';
  const cancelledBy = params.cancelledBy || '본사 관리자';

  const nextMeta: HqScheduleMeta = {
    ...hydrated._meta,
    dispatchStatus: 'cancelled',
    version: nextVersion,
    cancelReason: reason,
    pendingCustomerTrigger: null,
  };

  const cancelNote = `[배차 취소 사유: ${reason} (${cancelledBy})]`;
  const mergedNotes = hydrated.protocol_notes
    ? `${cancelNote} ${hydrated.protocol_notes}`
    : cancelNote;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('schedules')
    .update({
      passenger_note: encodeScheduleMeta(nextMeta),
      schedule_meta: nextMeta,
      dispatch_status: 'cancelled',
      version: nextVersion,
      status: 'cancelled',
      protocol_notes: mergedNotes,
      updated_at: nowIso,
    })
    .eq('id', params.scheduleId)
    .select('*')
    .single();

  if (updateErr) {
    return { error: updateErr.message, statusCode: 500 };
  }

  return {
    schedule: mapHydratedRowToScheduleItem(updated),
    version: nextVersion,
    cancelledAt: nowIso,
  };
}

/**
 * Sends / records an HQ unacknowledged dispatch reminder to the assigned driver in `cockpit.schedules`.
 */
export async function remindServerSchedule(params: {
  scheduleId: string;
  remindedBy?: string;
  note?: string;
}): Promise<{
  schedule?: ScheduleItem;
  reminderCount?: number;
  remindedAt?: string;
  error?: string;
  statusCode?: number;
}> {
  const { data: raw, error: fetchErr } = await supabaseAdmin
    .from('schedules')
    .select('*')
    .eq('id', params.scheduleId)
    .maybeSingle();

  if (fetchErr || !raw) {
    return { error: '해당 배차 일정을 찾을 수 없습니다.', statusCode: 404 };
  }

  const hydrated = hydrateRawScheduleRow(raw);

  if (hydrated.dispatch_status === 'cancelled' || hydrated.status === 'cancelled') {
    return { error: '취소된 배차에는 확인 요청 알림을 보낼 수 없습니다.', statusCode: 400 };
  }

  if (hydrated.dispatch_status !== 'published') {
    return { error: '아직 배차 확정되지 않은 예약(미배정)입니다. 먼저 기사와 차량을 배정해주세요.', statusCode: 400 };
  }

  const currentVersion = hydrated.version || 1;
  const lastAckVer = hydrated.last_ack_version || 0;
  if (lastAckVer >= currentVersion) {
    return { error: '담당 기사가 이미 최신 배차를 확인 완료했습니다.', statusCode: 409 };
  }

  const nowIso = new Date().toISOString();
  const nextCount = (hydrated._meta.reminderCount || 0) + 1;
  const remindedBy = params.remindedBy || '본사 관제';
  const prevReminderHistory = hydrated._meta.reminderHistory || [];

  const nextMeta: HqScheduleMeta = {
    ...hydrated._meta,
    reminderCount: nextCount,
    lastRemindedAt: nowIso,
    lastReminderNote: params.note || null,
    reminderHistory: [
      ...prevReminderHistory,
      {
        remindedAt: nowIso,
        remindedBy,
        note: params.note,
        version: currentVersion,
      },
    ],
  };

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('schedules')
    .update({
      passenger_note: encodeScheduleMeta(nextMeta),
      schedule_meta: nextMeta,
      updated_at: nowIso,
    })
    .eq('id', params.scheduleId)
    .select('*')
    .single();

  if (updateErr) {
    return { error: updateErr.message, statusCode: 500 };
  }

  return {
    schedule: mapHydratedRowToScheduleItem(updated),
    reminderCount: nextCount,
    remindedAt: nowIso,
  };
}

/**
 * Records an admin-confirmed customer notification (Email / SMS) or dismisses a pending trigger in `cockpit.schedules`.
 */
export async function recordServerCustomerNotification(params: {
  scheduleId: string;
  trigger: 'dispatch_confirmed' | 'driver_changed' | 'arrived_pickup';
  channel: 'email' | 'sms';
  language: 'ko' | 'en';
  recipient: string;
  subject?: string;
  body: string;
  deliveryMethod: 'smtp' | 'manual_copy' | 'sms_app';
  sentBy?: string;
}): Promise<{
  schedule?: ScheduleItem;
  record?: NonNullable<HqScheduleMeta['customerNotifications']>[number];
  error?: string;
  statusCode?: number;
}> {
  const { data: raw, error: fetchErr } = await supabaseAdmin
    .from('schedules')
    .select('*')
    .eq('id', params.scheduleId)
    .maybeSingle();

  if (fetchErr || !raw) {
    return { error: '해당 배차 일정을 찾을 수 없습니다.', statusCode: 404 };
  }

  const hydrated = hydrateRawScheduleRow(raw);
  const nowIso = new Date().toISOString();

  const record = {
    id: `cnotif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    trigger: params.trigger,
    channel: params.channel,
    language: params.language,
    recipient: params.recipient.trim(),
    subject: params.subject?.trim(),
    body: params.body,
    deliveryMethod: params.deliveryMethod,
    sentAt: nowIso,
    sentBy: params.sentBy || '본사 관리자',
    scheduleVersion: hydrated.version || 1,
  };

  const prevList = hydrated._meta.customerNotifications || [];
  const shouldClearPending =
    hydrated._meta.pendingCustomerTrigger === params.trigger || !hydrated._meta.pendingCustomerTrigger;

  const nextMeta: HqScheduleMeta = {
    ...hydrated._meta,
    pendingCustomerTrigger: shouldClearPending ? null : hydrated._meta.pendingCustomerTrigger,
    customerNotifications: [record, ...prevList].slice(0, 30),
  };

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('schedules')
    .update({
      passenger_note: encodeScheduleMeta(nextMeta),
      schedule_meta: nextMeta,
      updated_at: nowIso,
    })
    .eq('id', params.scheduleId)
    .select('*')
    .single();

  if (updateErr) {
    return { error: updateErr.message, statusCode: 500 };
  }

  return {
    schedule: mapHydratedRowToScheduleItem(updated),
    record,
  };
}

/**
 * Clears `pendingCustomerTrigger` when HQ admin explicitly dismisses the pending customer notification draft.
 */
export async function dismissPendingCustomerNotification(params: {
  scheduleId: string;
}): Promise<{ schedule?: ScheduleItem; error?: string; statusCode?: number }> {
  const { data: raw, error: fetchErr } = await supabaseAdmin
    .from('schedules')
    .select('*')
    .eq('id', params.scheduleId)
    .maybeSingle();

  if (fetchErr || !raw) {
    return { error: '해당 배차 일정을 찾을 수 없습니다.', statusCode: 404 };
  }

  const hydrated = hydrateRawScheduleRow(raw);
  const nowIso = new Date().toISOString();

  const nextMeta: HqScheduleMeta = {
    ...hydrated._meta,
    pendingCustomerTrigger: null,
  };

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('schedules')
    .update({
      passenger_note: encodeScheduleMeta(nextMeta),
      schedule_meta: nextMeta,
      updated_at: nowIso,
    })
    .eq('id', params.scheduleId)
    .select('*')
    .single();

  if (updateErr) {
    return { error: updateErr.message, statusCode: 500 };
  }

  return {
    schedule: mapHydratedRowToScheduleItem(updated),
  };
}

/**
 * One Postgres RPC commits the entire batch, checks conflicts under a DB lock,
 * and rolls back on any error. Missing schema/RPC never falls back to process memory.
 */
export async function atomicUpsertServerDispatchBatch(
  candidates: DispatchUpsertInput[],
  _legacyInjectedRows?: Array<DbScheduleRow & { _meta: HqScheduleMeta }>,
  requestId: string = randomUUID(),
): Promise<{
  ok: boolean; schedules?: ScheduleItem[]; conflicts?: ServerConflictDetail[];
  error?: string; statusCode?: number;
}> {
  if (!candidates.length || candidates.length > 100) {
    return { ok: false, error: '배차는 한 번에 1~100건까지 저장할 수 있습니다.', statusCode: 400 };
  }
  const prepared = [];
  for (const candidate of candidates) {
    const result = await prepareServerDispatchSchedule(candidate);
    if (result.error || !result.row) return { ok: false, error: result.error, statusCode: result.statusCode || 400 };
    prepared.push({ row: result.row, expected_updated_at: result.expectedUpdatedAt || null, is_update: Boolean(candidate.scheduleId) });
  }
  const { data, error } = await supabaseAdmin.rpc('commit_dispatch_batch', {
    p_items: prepared, p_request_id: requestId, p_org: 'vip_limousine_korea',
    p_fingerprint: createHash('sha256').update(JSON.stringify(candidates)).digest('hex'),
  });
  if (error) {
    const conflict = ['23P01', '40001', '23505'].includes(error.code);
    const invalid = ['22007', '22008', '22023', '23514', '22P02'].includes(error.code);
    return {
      ok: false,
      error: conflict ? '선택한 기사·차량의 일정이 겹치거나 예약이 변경되었습니다. 새로고침 후 확인해 주세요.'
        : invalid ? '배차 날짜·시간·차량·기사 정보를 확인해 주세요.'
        : '안전한 배차 저장을 사용할 수 없습니다. DB 연결 및 배차 마이그레이션 적용 상태를 확인해 주세요.',
      statusCode: conflict ? 409 : invalid ? 400 : 503,
    };
  }
  if (!Array.isArray(data) || data.length !== candidates.length) {
    return { ok: false, error: 'DB 저장 결과를 확인할 수 없습니다.', statusCode: 503 };
  }
  return { ok: true, schedules: data.map(mapHydratedRowToScheduleItem) };
}
