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
    const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
  }
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return normalizeDateToIso(`${compact[1]}-${compact[2]}-${compact[3]}`);
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

/**
 * Shifts an ISO YYYY-MM-DD date by N days in UTC.
 */
export function shiftIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses a KST date and time into Unix epoch milliseconds.
 * Fully timezone-aware (Asia/Seoul, UTC+9) and handles midnight rollover & month transitions cleanly.
 * Automatically rolls over when minutes >= 1440 or hh >= 24, preventing Invalid Date / NaN bugs.
 */
export function parseKstDateTimeToMs(dateStr: string, timeStrOrMin: string | number): number {
  const isoDate = normalizeDateToIso(dateStr);
  if (!isoDate) return NaN;
  let hh = 0;
  let mm = 0;
  let addDays = 0;

  if (typeof timeStrOrMin === 'number') {
    if (!Number.isFinite(timeStrOrMin) || !Number.isInteger(timeStrOrMin) || timeStrOrMin < 0) return NaN;
    if (timeStrOrMin >= 1440) {
      addDays = Math.floor(timeStrOrMin / 1440);
      const rem = timeStrOrMin % 1440;
      hh = Math.floor(rem / 60);
      mm = rem % 60;
    } else {
      hh = Math.floor(timeStrOrMin / 60);
      mm = timeStrOrMin % 60;
    }
  } else {
    const hhmm = normalizeTimeHHmm(timeStrOrMin);
    if (!hhmm) return NaN;
    if (hhmm) {
      const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
      hh = h || 0;
      mm = m || 0;
    }
  }

  if (hh >= 24) {
    addDays += Math.floor(hh / 24);
    hh = hh % 24;
  }

  const finalIsoDate = addDays > 0 ? shiftIsoDate(isoDate, addDays) : isoDate;
  const timePadded = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`;
  return new Date(`${finalIsoDate}T${timePadded}`).getTime();
}

/**
 * Checks if two date-time intervals overlap (with turnaround buffer and overnight support).
 * Uses exact Unix epoch milliseconds to prevent timezone drift, month boundary errors, and leap year bugs.
 */
export function isDateTimeOverlapping(
  startA: { date: string; minutes: number },
  endA: { date: string; minutes: number },
  startB: { date: string; minutes: number },
  endB: { date: string; minutes: number },
  bufferMinutes: number = 60
): boolean {
  const aStart = parseKstDateTimeToMs(startA.date, startA.minutes);
  const aEnd = parseKstDateTimeToMs(endA.date, endA.minutes);
  const bStart = parseKstDateTimeToMs(startB.date, startB.minutes);
  const bEnd = parseKstDateTimeToMs(endB.date, endB.minutes);

  if (isNaN(aStart) || isNaN(aEnd) || isNaN(bStart) || isNaN(bEnd)) return false;

  const bufMs = bufferMinutes * 60 * 1000;
  return bStart < aEnd + bufMs && aStart < bEnd + bufMs;
}

/**
 * Range-based interval overlap checker taking explicit start and end dates/times.
 */
export function isDateTimeIntervalOverlapping(
  tripA: { startDate: string; startTime: string | number; endDate?: string; endTime: string | number },
  tripB: { startDate: string; startTime: string | number; endDate?: string; endTime: string | number },
  bufferMinutes: number = 60
): boolean {
  const aStart = parseKstDateTimeToMs(tripA.startDate, tripA.startTime);
  const aEndEffective =
    tripA.endTime === '' || tripA.endTime === undefined || tripA.endTime === null
      ? '23:59'
      : tripA.endTime;
  const aEnd = parseKstDateTimeToMs(tripA.endDate || tripA.startDate, aEndEffective);

  const bStart = parseKstDateTimeToMs(tripB.startDate, tripB.startTime);
  const bEndEffective =
    tripB.endTime === '' || tripB.endTime === undefined || tripB.endTime === null
      ? '23:59'
      : tripB.endTime;
  const bEnd = parseKstDateTimeToMs(tripB.endDate || tripB.startDate, bEndEffective);

  if (isNaN(aStart) || isNaN(aEnd) || isNaN(bStart) || isNaN(bEnd)) return false;

  const bufMs = bufferMinutes * 60 * 1000;
  return bStart < aEnd + bufMs && aStart < bEnd + bufMs;
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

export const DEFAULT_CONFLICT_WINDOW_MINUTES = 60; // 60 minutes default VIP turnaround buffer

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

export interface DispatchConflictCandidate {
  id?: string;
  scheduleId?: string;
  pickupDate: string;
  pickupTime: string;
  endDate?: string;
  endTime?: string;
  driverName?: string | null;
  driverId?: string;
  vehiclePlate?: string | null;
  vehicleNoKey?: string | null;
  vehicleId?: string;
  serviceMode?: string;
}

export function detectDispatchConflicts(
  candidate: DispatchConflictCandidate,
  existingBookings: HqBooking[],
  windowMinutes: number = DEFAULT_CONFLICT_WINDOW_MINUTES
): DispatchConflictItem[] {
  const candDate = normalizeDateToIso(candidate.pickupDate);
  const candTime = normalizeTimeHHmm(candidate.pickupTime);
  const candDriver = cleanDriverIdentity(candidate.driverName);
  const candPlate = cleanVehicleIdentity(candidate.vehiclePlate);
  const candVehNo = cleanVehicleIdentity(candidate.vehicleNoKey);
  const isCandVehicleOnly =
    candidate.serviceMode === 'vehicle_only' ||
    candDriver === '기사 미배정' ||
    candDriver === '자차 운행' ||
    candDriver === '차량만 대여';

  if (!candDate || !candTime) return [];
  if (!candDriver && !candPlate && !candVehNo && !candidate.driverId && !candidate.vehicleId) return [];

  const candInterval = {
    startDate: candDate,
    startTime: candTime,
    endDate: candidate.endDate ? normalizeDateToIso(candidate.endDate) : undefined,
    endTime: candidate.endTime ? normalizeTimeHHmm(candidate.endTime) : '',
  };

  const conflicts: DispatchConflictItem[] = [];

  for (const existing of existingBookings) {
    if (candidate.id && existing.id === candidate.id) continue;
    if (candidate.scheduleId && existing.scheduleId && existing.scheduleId === candidate.scheduleId) continue;
    if (candidate.scheduleId && existing.id === candidate.scheduleId) continue;
    if (candidate.id && existing.scheduleId && existing.scheduleId === candidate.id) continue;
    if (!isBookingActiveForConflict(existing)) continue;

    const exStartDate = normalizeDateToIso(existing.pickupDate);
    const exStartTime = normalizeTimeHHmm(existing.pickupTime);
    if (!exStartDate || !exStartTime) continue;

    const exEndDate = normalizeDateToIso(existing.endDate) || exStartDate;
    const exEndTime = existing.endTime ? normalizeTimeHHmm(existing.endTime) : '';
    const hasRealEndTime = Boolean(exEndTime);

    const exInterval = {
      startDate: exStartDate,
      startTime: exStartTime,
      endDate: exEndDate,
      endTime: exEndTime,
    };

    const isOverlap = isDateTimeIntervalOverlapping(candInterval, exInterval, windowMinutes);
    if (!isOverlap) continue;

    const candMs = parseKstDateTimeToMs(candDate, candTime);
    const exMs = parseKstDateTimeToMs(exStartDate, exStartTime);
    const diff = isNaN(candMs) || isNaN(exMs) ? 0 : Math.round(Math.abs(candMs - exMs) / (60 * 1000));

    const exDriver = cleanDriverIdentity(existing.driverName);
    const exPlate = cleanVehicleIdentity(existing.vehiclePlate);
    const exVehNo = cleanVehicleIdentity(existing.vehicleNoKey);
    const isExVehicleOnly =
      existing.serviceMode === 'vehicle_only' ||
      exDriver === '기사 미배정' ||
      exDriver === '자차 운행' ||
      exDriver === '차량만 대여';

    const exTimeLabel = `${exStartDate} ${exStartTime} ~ ${exEndDate} ${hasRealEndTime ? exEndTime : '종료 미확정'}`;

    // 1. Driver Conflict Check (Skipped if either candidate or existing is vehicle_only)
    const matchDriverId = Boolean(candidate.driverId && existing.driverId && candidate.driverId === existing.driverId);
    const matchDriverName = Boolean(candDriver && exDriver && candDriver === exDriver);
    const isDriverConflict = !isCandVehicleOnly && !isExVehicleOnly && (matchDriverId || matchDriverName);

    if (isDriverConflict) {
      const drvLabel = candDriver || existing.driverName || '해당 기사';
      conflicts.push({
        type: 'driver',
        targetName: drvLabel,
        conflictingBookingId: existing.id,
        conflictingBookingNo: existing.bookingNo,
        conflictingCustomerName: existing.customerName,
        conflictingPickupTime: existing.pickupTime,
        conflictingRoute: `${existing.pickupLocation} → ${existing.destination}`,
        timeDiffMinutes: diff,
        message: hasRealEndTime
          ? `[기사 중복] ${drvLabel} 기사는 ${exTimeLabel} (${existing.customerName}: ${existing.pickupLocation}→${existing.destination}) 일정과 배차 시간이 겹칩니다.`
          : `[일정 충돌 주의] ${drvLabel} 기사의 기존 배차(${exTimeLabel}) 종료 시간이 미확정 상태입니다. 중복 배차 방지를 위해 종료 시간을 먼저 확인해 주세요.`,
      });
    }

    // 2. Vehicle Conflict Check
    const matchVehicleId = Boolean(candidate.vehicleId && existing.vehicleId && candidate.vehicleId === existing.vehicleId);
    const samePlate = Boolean(candPlate && exPlate && candPlate === exPlate);
    const sameVehNo = Boolean(!samePlate && candVehNo && exVehNo && candVehNo === exVehNo);
    const isVehicleConflict = matchVehicleId || samePlate || sameVehNo;

    if (isVehicleConflict) {
      const vehLabel = existing.vehiclePlate || existing.vehicleNoKey || candidate.vehiclePlate || candidate.vehicleNoKey || '해당 차량';
      conflicts.push({
        type: 'vehicle',
        targetName: vehLabel,
        conflictingBookingId: existing.id,
        conflictingBookingNo: existing.bookingNo,
        conflictingCustomerName: existing.customerName,
        conflictingPickupTime: existing.pickupTime,
        conflictingRoute: `${existing.pickupLocation} → ${existing.destination}`,
        timeDiffMinutes: diff,
        message: hasRealEndTime
          ? `[차량 중복] ${vehLabel} 차량은 ${exTimeLabel} (${existing.customerName}: ${existing.pickupLocation}→${existing.destination}) 일정과 배차 시간이 겹칩니다.`
          : `[일정 충돌 주의] ${vehLabel} 차량의 기존 배차(${exTimeLabel}) 종료 시간이 미확정 상태입니다. 중복 배차 방지를 위해 종료 시간을 먼저 확인해 주세요.`,
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
        endDate: b.endDate,
        endTime: b.endTime,
        driverName: b.driverName,
        driverId: b.driverId,
        vehiclePlate: b.vehiclePlate,
        vehicleNoKey: b.vehicleNoKey,
        vehicleId: b.vehicleId,
        serviceMode: b.serviceMode,
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
    endDate: normalizeDateToIso(item.end_date) || dateIso,
    endTime: normalizeTimeHHmm(item.end_time) || '',
    pickupLocation: item.origin_name,
    destination: item.destination_name,
    driverName: resolvedDriverName,
    driverId: item.driver_id,
    driverPhone: item.driver_phone,
    vehicleModel: resolvedModel,
    vehiclePlate: resolvedPlate,
    vehicleId: item.vehicle_id,
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
    operationStatus: item.operation_status || 'ready',
    operationUpdatedAt: item.operation_updated_at,
    reminderCount: item.reminder_count || 0,
    lastRemindedAt: item.last_reminded_at,
    previousDriverName: item.previous_driver_name,
    previousDriverPhone: item.previous_driver_phone,
    previousVehiclePlate: item.previous_vehicle_plate,
    previousVehicleModel: item.previous_vehicle_model,
    pendingCustomerTrigger: item.pending_customer_trigger ?? null,
    pendingCustomerTriggeredAt: item.pending_customer_triggered_at,
    customerNotifications: item.customer_notifications || [],
  };
}
