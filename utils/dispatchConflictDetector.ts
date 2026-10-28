import { HqBooking, DispatchStatus, DriverAckStatus, CustomerBrochureStatus } from '@/types/hq';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { AppliedPricingSnapshot } from '@/types/settlementHq';
import { findVipVehicle } from '@/utils/vehicleData';

/**
 * Returns today's date in Asia/Seoul (KST) as 'YYYY-MM-DD' without UTC drift.
 */
export function getKstTodayDateStr(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('sv-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }
}

/**
 * Returns tomorrow's date in Asia/Seoul (KST) as 'YYYY-MM-DD'.
 */
export function getKstTomorrowDateStr(now: Date = new Date()): string {
  const todayIso = getKstTodayDateStr(now);
  const [y, m, d] = todayIso.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * Normalizes various Korean/dot/slash date representations ('2026. 10. 28', '2026.10.28', '2026/10/28')
 * into strict 'YYYY-MM-DD'. Returns empty string if unparseable.
 */
export function normalizeDateToIso(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const match = trimmed.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }
  return '';
}

/**
 * Formats 'YYYY-MM-DD' into '2026년 10월 28일 (수)'.
 */
export function formatKoreanFullDateLabel(dateStr?: string): string {
  const iso = normalizeDateToIso(dateStr) || getKstTodayDateStr();
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}년 ${m}월 ${d}일 (${days[dt.getUTCDay()]})`;
}

/**
 * Formats 'YYYY-MM-DD' into '2026. 10. 28 (수)' for EventSettlementReport compatibility.
 */
export function formatSettlementDateLabel(dateStr?: string): string {
  const iso = normalizeDateToIso(dateStr) || getKstTodayDateStr();
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')} (${days[dt.getUTCDay()]})`;
}

/**
 * Extracts clean 'HH:MM' from strings like '14:00', '14:00:00', '픽업 09:30', '2026-10-28 14:30'.
 * Never fabricates a fallback time if none exists.
 */
export function normalizeTimeHHmm(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw.replace(/\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}/g, '').trim();
  const match = cleaned.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hh = parseInt(match[1], 10);
  const mm = parseInt(match[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function timeHHmmToMinutes(raw?: string | null): number | null {
  const hhmm = normalizeTimeHHmm(raw);
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export function formatShortAckTime(isoStr?: string | null): string | undefined {
  if (!isoStr) return undefined;
  try {
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime())) return undefined;
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(dt);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
  } catch {
    return undefined;
  }
}

export function cleanDriverIdentity(name?: string | null): string {
  if (!name) return '';
  const cleaned = name.replace(/\s*기사(님)?$/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '미배정' || cleaned === '배차 대기' || cleaned === '차량만 대여') {
    return '';
  }
  return cleaned;
}

export function cleanVehicleIdentity(plateOrNo?: string | null): string {
  if (!plateOrNo) return '';
  const cleaned = plateOrNo.replace(/\s+/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '미배정' || cleaned === '배정완료' || cleaned === '차량미지정') {
    return '';
  }
  return cleaned;
}

/**
 * Known VIP venue coordinates dictionary for instant verified pin resolution.
 */
interface KnownPlaceEntry {
  keywords: string[];
  address: string;
  lat: number;
  lng: number;
}

const KNOWN_VIP_PLACES: KnownPlaceEntry[] = [
  { keywords: ['인천공항 t2', '인천국제공항 제2', '제2여객터미널', 't2'], address: '인천 중구 제2터미널대로 272', lat: 37.4691, lng: 126.4344 },
  { keywords: ['인천공항', '인천국제공항', '제1여객터미널', 't1'], address: '인천 중구 공항로 272', lat: 37.4495, lng: 126.4512 },
  { keywords: ['김포공항', '김포국제공항'], address: '서울 강서구 하늘길 112', lat: 37.5586, lng: 126.7945 },
  { keywords: ['조선팰리스', '조선 팰리스'], address: '서울 강남구 테헤란로 231', lat: 37.5026, lng: 127.0416 },
  { keywords: ['신라호텔', '서울신라호텔'], address: '서울 중구 동호로 249', lat: 37.5559, lng: 127.0052 },
  { keywords: ['시그니엘', '롯데월드타워'], address: '서울 송파구 올림픽로 300', lat: 37.5126, lng: 127.1025 },
  { keywords: ['파르나스', '인터컨티넨탈'], address: '서울 강남구 테헤란로 521', lat: 37.5085, lng: 127.0608 },
  { keywords: ['코엑스', 'coex', '삼성동'], address: '서울 강남구 영동대로 513', lat: 37.5116, lng: 127.0595 },
  { keywords: ['포시즌스', '광화문'], address: '서울 종로구 새문안로 97', lat: 37.5707, lng: 126.9754 },
  { keywords: ['콘래드', '여의도', 'ifc'], address: '서울 영등포구 국제금융로 10', lat: 37.5251, lng: 126.9265 },
  { keywords: ['서울역'], address: '서울 용산구 한강대로 405', lat: 37.5547, lng: 126.9707 },
  { keywords: ['판교'], address: '경기 성남시 분당구 판교역로 160', lat: 37.3948, lng: 127.1112 },
  { keywords: ['송도'], address: '인천 연수구 센트럴로 123', lat: 37.3895, lng: 126.6458 },
  { keywords: ['인제스피디움', '인제 스피디움'], address: '강원 인제군 기린면 상하답로 130', lat: 38.0051, lng: 128.2917 },
  { keywords: ['한남동', '이태원', '그랜드하얏트'], address: '서울 용산구 소월로 322', lat: 37.5392, lng: 126.9972 },
  { keywords: ['성수동', '성수'], address: '서울 성동구 연무장길 50', lat: 37.5446, lng: 127.0560 },
  { keywords: ['청담동', '압구정', '강남'], address: '서울 강남구 압구정로 407', lat: 37.5273, lng: 127.0432 },
  { keywords: ['안다즈'], address: '서울 강남구 논현로 854', lat: 37.5254, lng: 127.0287 },
  { keywords: ['반얀트리'], address: '서울 중구 장충단로 60', lat: 37.5503, lng: 127.0004 },
  { keywords: ['워커힐'], address: '서울 광진구 워커힐로 177', lat: 37.5553, lng: 127.1107 },
  { keywords: ['오창', '심텍'], address: '충북 청주시 청원구 오창읍 산업단지로 73', lat: 36.7128, lng: 127.4314 },
];

export function resolveKnownPlaceCoords(placeName?: string | null, explicitAddress?: string | null): {
  lat: number;
  lng: number;
  address: string;
  verified: boolean;
} {
  const q = `${placeName || ''} ${explicitAddress || ''}`.toLowerCase().trim();
  for (const entry of KNOWN_VIP_PLACES) {
    if (entry.keywords.some((kw) => q.includes(kw))) {
      return {
        lat: entry.lat,
        lng: entry.lng,
        address: explicitAddress?.trim() || entry.address,
        verified: true,
      };
    }
  }
  return {
    lat: 37.5042,
    lng: 127.0425,
    address: explicitAddress?.trim() || '',
    verified: Boolean(explicitAddress && explicitAddress.trim().length >= 5),
  };
}

/**
 * Driver & Vehicle Schedule Conflict Detection
 * Default minimum turnaround window between two separate VIP trips on the same date is 180 minutes (3 hours).
 */
export interface DispatchConflictItem {
  type: 'driver' | 'vehicle';
  targetName: string;
  conflictingBookingId: string;
  conflictingBookingNo: string;
  conflictingCustomerName: string;
  conflictingPickupTime: string;
  conflictingRoute: string;
  timeDiffMinutes: number;
  isIntraGroup?: boolean;
  message: string;
}

export const DEFAULT_CONFLICT_WINDOW_MINUTES = 180;

export function isBookingActiveForConflict(booking: {
  dispatchStatus?: string;
}): boolean {
  if (!booking.dispatchStatus) return true;
  return (
    booking.dispatchStatus !== '취소' &&
    booking.dispatchStatus !== '미배정' &&
    booking.dispatchStatus !== '작성 중'
  );
}

export function detectDispatchConflicts(
  candidate: {
    id?: string;
    scheduleId?: string;
    pickupDate: string;
    pickupTime: string;
    driverName?: string | null;
    vehiclePlate?: string | null;
    vehicleNoKey?: string | null;
  },
  existingBookings: HqBooking[],
  windowMinutes: number = DEFAULT_CONFLICT_WINDOW_MINUTES
): DispatchConflictItem[] {
  const candDate = normalizeDateToIso(candidate.pickupDate);
  const candMinutes = timeHHmmToMinutes(candidate.pickupTime);
  const candDriver = cleanDriverIdentity(candidate.driverName);
  const candPlate = cleanVehicleIdentity(candidate.vehiclePlate);
  const candVehNo = cleanVehicleIdentity(candidate.vehicleNoKey);

  if (!candDate || candMinutes === null) return [];
  if (!candDriver && !candPlate && !candVehNo) return [];

  const conflicts: DispatchConflictItem[] = [];

  for (const existing of existingBookings) {
    if (candidate.id && existing.id === candidate.id) continue;
    if (candidate.scheduleId && existing.scheduleId && existing.scheduleId === candidate.scheduleId) continue;
    if (candidate.scheduleId && existing.id === candidate.scheduleId) continue;
    if (!isBookingActiveForConflict(existing)) continue;

    const exDate = normalizeDateToIso(existing.pickupDate);
    if (exDate !== candDate) continue;

    const exMinutes = timeHHmmToMinutes(existing.pickupTime);
    if (exMinutes === null) continue;

    const diff = Math.abs(candMinutes - exMinutes);
    if (diff >= windowMinutes) continue;

    const exDriver = cleanDriverIdentity(existing.driverName);
    const exPlate = cleanVehicleIdentity(existing.vehiclePlate);
    const exVehNo = cleanVehicleIdentity(existing.vehicleNoKey);

    if (candDriver && exDriver && candDriver === exDriver) {
      conflicts.push({
        type: 'driver',
        targetName: candDriver,
        conflictingBookingId: existing.id,
        conflictingBookingNo: existing.bookingNo,
        conflictingCustomerName: existing.customerName,
        conflictingPickupTime: existing.pickupTime,
        conflictingRoute: `${existing.pickupLocation} → ${existing.destination}`,
        timeDiffMinutes: diff,
        message: `[기사 중복] ${candDriver} 기사는 ${candDate} ${existing.pickupTime} (${existing.customerName}: ${existing.pickupLocation}→${existing.destination}) 일정과 ${diff === 0 ? '동일 시각' : `${diff}분 간격`}으로 충돌합니다.`,
      });
    }

    const samePlate = candPlate && exPlate && candPlate === exPlate;
    const sameVehNo = !samePlate && candVehNo && exVehNo && candVehNo === exVehNo;
    if (samePlate || sameVehNo) {
      const label = existing.vehiclePlate || existing.vehicleNoKey || candidate.vehiclePlate || '';
      conflicts.push({
        type: 'vehicle',
        targetName: label,
        conflictingBookingId: existing.id,
        conflictingBookingNo: existing.bookingNo,
        conflictingCustomerName: existing.customerName,
        conflictingPickupTime: existing.pickupTime,
        conflictingRoute: `${existing.pickupLocation} → ${existing.destination}`,
        timeDiffMinutes: diff,
        message: `[차량 중복] ${label} 차량은 ${candDate} ${existing.pickupTime} (${existing.customerName}: ${existing.pickupLocation}→${existing.destination}) 일정과 ${diff === 0 ? '동일 시각' : `${diff}분 간격`}으로 충돌합니다.`,
      });
    }
  }

  return conflicts;
}

/**
 * Annotates an entire list of HqBookings with `hasConflict` and `conflictMessages`
 * so HQ Table, Mobile Cards, and KPI Tiles highlight every active conflict.
 */
export function annotateBookingsWithConflicts(bookings: HqBooking[]): HqBooking[] {
  return bookings.map((b) => {
    if (!isBookingActiveForConflict(b)) {
      return { ...b, hasConflict: false, conflictMessages: [] };
    }
    const conflicts = detectDispatchConflicts(
      {
        id: b.id,
        scheduleId: b.scheduleId,
        pickupDate: b.pickupDate,
        pickupTime: b.pickupTime,
        driverName: b.driverName,
        vehiclePlate: b.vehiclePlate,
        vehicleNoKey: b.vehicleNoKey,
      },
      bookings
    );
    return {
      ...b,
      hasConflict: conflicts.length > 0,
      conflictMessages: conflicts.map((c) => c.message),
    };
  });
}

/**
 * Converts a server `ScheduleItem` (from `/api/schedules?role=hq`) into a rich `HqBooking`
 * for unified display and editing across PC & Mobile HQ views.
 */
export function mapScheduleItemToHqBooking(
  item: ScheduleItem,
  index: number,
  todayIso: string = getKstTodayDateStr(),
  tomorrowIso: string = getKstTomorrowDateStr()
): HqBooking {
  const dateIso = normalizeDateToIso(item.date) || item.date;
  const ver = item.version || 1;
  const ackVer = item.last_ack_version || 0;
  const isAcked = ackVer >= ver && ver >= 1;
  const isStaleReconfirm = item.dispatch_status === 'published' && ackVer > 0 && ackVer < ver;

  let dispatchStatus: DispatchStatus = '배차 완료';
  let driverAck: DriverAckStatus = '미확인';

  if (item.dispatch_status === 'cancelled' || item.status === 'cancelled') {
    dispatchStatus = '취소';
    driverAck = '-';
  } else if (item.dispatch_status === 'unassigned') {
    dispatchStatus = '미배정';
    driverAck = '-';
  } else if (item.dispatch_status === 'draft') {
    dispatchStatus = '작성 중';
    driverAck = '-';
  } else if (item.status === 'completed') {
    dispatchStatus = '운행 완료';
    driverAck = isAcked ? '확인완료' : '미확인';
  } else if (isStaleReconfirm) {
    dispatchStatus = '재확인 필요';
    driverAck = '재확인 필요';
  } else {
    // published
    const hasDriverAssigned =
      item.service_mode === 'vehicle_only' ||
      Boolean(cleanDriverIdentity(item.driver_name)) ||
      (Boolean(item.vehicle_no) && item.vehicle_no !== '미배정');
    if (!hasDriverAssigned) {
      dispatchStatus = '미배정';
      driverAck = '-';
    } else {
      dispatchStatus = '배차 완료';
      driverAck = isAcked ? '확인완료' : '미확인';
    }
  }

  const matchedVeh =
    findVipVehicle(item.vehicle_plate || '') || findVipVehicle(item.vehicle_no || '');
  const resolvedPlate =
    item.vehicle_plate ||
    matchedVeh?.plate ||
    (item.vehicle_no && item.vehicle_no !== '미배정' ? item.vehicle_no : '미배정');
  const resolvedModel =
    item.vehicle_model ||
    matchedVeh?.model ||
    (resolvedPlate !== '미배정' ? item.vehicle_no || '-' : '-');

  const resolvedDriverName =
    item.service_mode === 'vehicle_only'
      ? '차량만 대여'
      : cleanDriverIdentity(item.driver_name) || '-';

  const customerName =
    item.customer_name ||
    (item.notes && item.notes.includes('CLUB CHALLENGE') ? 'Ferrari Korea' : item.passenger || 'VIP 고객');

  const bookingNo =
    item.booking_no ||
    `#${dateIso.replace(/-/g, '').slice(2)}-${String(index + 1).padStart(3, '0')}`;

  return {
    id: item.id,
    scheduleId: item.id,
    vehicleNoKey: item.vehicle_no,
    bookingNo,
    no: index + 1,
    customerName,
    customerId: item.customer_id,
    orderingAgency: item.ordering_agency,
    endBrand: item.end_brand,
    eventId: item.event_id,
    eventName: item.event_name,
    billingTarget: item.billing_target,
    billingTargetName: item.billing_target_name,
    pickupDate: dateIso,
    pickupTime: normalizeTimeHHmm(item.pickup_time) || normalizeTimeHHmm(item.time_display),
    pickupLocation: item.origin_name,
    destination: item.destination_name,
    driverName: resolvedDriverName,
    driverPhone: item.driver_phone,
    vehicleModel: resolvedModel,
    vehiclePlate: resolvedPlate,
    dispatchStatus,
    driverAck,
    driverAckTime: formatShortAckTime(item.last_ack_at),
    customerBrochure: (item.customer_brochure as CustomerBrochureStatus) || '미발송',
    passengerName: item.passenger,
    passengerPhone: item.passenger_phone,
    passengerCount: item.passenger_count || 1,
    flightNumber: item.flight,
    notes: item.notes,
    isToday: dateIso === todayIso,
    isTomorrow: dateIso === tomorrowIso,
    isDispatchTarget:
      dispatchStatus === '미배정' ||
      dispatchStatus === '작성 중' ||
      dispatchStatus === '재확인 필요' ||
      driverAck === '미확인',
    groupId: item.group_id,
    groupName: item.group_name,
    groupTotalVehicles: item.group_total_vehicles,
    groupVehicleIndex: item.group_vehicle_index,
    intakeSource: item.intake_source || 'seed',
    requestedLanguage: item.requested_language,
    languageOverrideConfirmed: item.language_override_confirmed,
    serviceMode: item.service_mode,
    appliedPricingSnapshot: item.applied_pricing_snapshot as AppliedPricingSnapshot | undefined,
    version: ver,
    lastAckVersion: ackVer,
    lastAckAt: item.last_ack_at,
    publishedAt: item.published_at,
    publishedBy: item.published_by,
    placeVerified: item.place_verified,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    cancelReason: item.cancel_reason,
  };
}
