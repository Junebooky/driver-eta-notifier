/**
 * Pure Client-Side Driving Log (운행일지) Calculation & Storage Utilities
 *
 * Implements strict calculation, validation, multi-job draft isolation,
 * verified vehicle inspection matching, and demo fixture separation.
 */

import { DriverProfile } from '@/types';

export interface RouteStopItem {
  id: string;
  time: string;       // e.g. "07:00", "08:50", or "" (arrival time NOT fabricated)
  place: string;      // e.g. "차고지", "메리어트 호텔"
  address?: string;   // e.g. "서울 강남구 봉은사로 120"
  memo?: string;      // e.g. "[출발 10:05] ..."
  lat?: number;
  lng?: number;
  // Structured action event metadata (Issue #35)
  departureTime?: string;         // e.g. "10:05" (click time in KST)
  departureTimestamp?: string;    // ISO timestamp
  predictedEta?: string;          // e.g. "10:48"
  predictedDurationMinutes?: number; // e.g. 43
  estimatedAt?: string;           // ISO timestamp
  calculationSource?: string;     // e.g. "tmap_fresh"
  routeFingerprint?: string;
  actionIdempotencyKey?: string;
  isDraftNavigation?: boolean;
}

export interface DrivingLogData {
  reportId: string;
  assignmentId?: string;     // Unique job assignment ID
  date: string;              // "2026년 10월 20일 (화)"
  rawDate: string;           // "2026-10-20"
  // Driver / Vehicle / Customer summary
  driverName: string;        // 수행담당: "윤태준"
  carNumber: string;         // 차량번호: "142호 7811"
  clientName: string;        // 고객명: "인터코스"
  passengerCount: string;    // 담당승객 수: "9명"
  // Duty times
  clockIn: string;           // 출근시간: "06:40"
  clockOut: string;          // 퇴근시간: "21:50"
  totalDutyHours: string;    // 총 근무시간: "15시간 10분"
  // Odometer
  startKm: string;           // 시작 km: "154,725"
  endKm: string;             // 종료 km: "154,861"
  distanceKm: string;        // 오늘 운행: "136 km"
  isOdoManualOverride?: boolean;
  odoSource?: 'inspection_verified' | 'manual' | 'demo';
  // Route timeline
  stops: RouteStopItem[];
  // Special notes
  notes: string;
  savedAt?: string;
  status: 'draft' | 'submitted';
  isDemoFixture?: boolean;   // True when populated with reference sample data
  bookingId?: string;
  submissionId?: string;
  driverId?: string;
  vehicleId?: string;
  organizationId?: string;
}

export const DRIVING_LOG_STORAGE_PREFIX = 'cockpit_driving_log_report_';
export const DRIVING_LOG_INDEX_KEY = 'cockpit_driving_log_index';

/**
 * Strict 24-hour HH:mm time validation
 * Validates 00:00 to 23:59
 */
export const isValidTimeHHMM = (time?: string | null): boolean => {
  if (!time) return false;
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(time.trim());
};

/**
 * Clamp hour (0..23) and minute (0..59)
 */
export const clampTimeComponent = (val: number | string, max: number): string => {
  const num = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
  if (isNaN(num)) return '00';
  const clamped = Math.max(0, Math.min(num, max));
  return String(clamped).padStart(2, '0');
};

/**
 * Format Date into Korean weekday string
 * e.g. "2026년 10월 20일 (화)"
 */
export const formatKoreanDate = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = days[d.getDay()];
  return `${year}년 ${month}월 ${date}일 (${dayName})`;
};

/**
 * Format Date into YYYY-MM-DD
 */
export const formatIsoDate = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Calculate duty duration from clock-in to clock-out with overnight rollover support.
 * Returns { hours, minutes, formatted, totalMinutes, error }
 * e.g. "06:40" to "21:50" -> "15시간 10분"
 */
export const calculateDutyDuration = (
  clockIn?: string | null,
  clockOut?: string | null
): { hours: number; minutes: number; formatted: string; totalMinutes: number; error: string | null } => {
  if (!clockIn || !clockOut) {
    return { hours: 0, minutes: 0, formatted: '0시간 0분', totalMinutes: 0, error: null };
  }

  if (!isValidTimeHHMM(clockIn) || !isValidTimeHHMM(clockOut)) {
    return { hours: 0, minutes: 0, formatted: '시간 확인 필요', totalMinutes: 0, error: '올바른 시간(HH:mm)을 입력해주세요.' };
  }

  const [inH, inM] = clockIn.split(':').map((v) => parseInt(v, 10));
  const [outH, outM] = clockOut.split(':').map((v) => parseInt(v, 10));

  const startTotalMinutes = inH * 60 + inM;
  let endTotalMinutes = outH * 60 + outM;

  // Overnight rollover
  if (endTotalMinutes < startTotalMinutes) {
    endTotalMinutes += 24 * 60;
  }

  const diffMinutes = endTotalMinutes - startTotalMinutes;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  const formatted = `${hours}시간 ${minutes}분`;
  return { hours, minutes, formatted, totalMinutes: diffMinutes, error: null };
};

/**
 * Check if a stop timestamp falls outside the 출근 ~ 퇴근 window
 */
export const checkStopTimelineConsistency = (
  clockIn?: string | null,
  clockOut?: string | null,
  stopTime?: string | null
): { isConsistent: boolean; warning?: string } => {
  if (!clockIn || !clockOut || !stopTime) {
    return { isConsistent: true };
  }
  if (!isValidTimeHHMM(clockIn) || !isValidTimeHHMM(clockOut) || !isValidTimeHHMM(stopTime)) {
    return { isConsistent: true };
  }

  const [inH, inM] = clockIn.split(':').map((v) => parseInt(v, 10));
  const [outH, outM] = clockOut.split(':').map((v) => parseInt(v, 10));
  const [stopH, stopM] = stopTime.split(':').map((v) => parseInt(v, 10));

  const startMinutes = inH * 60 + inM;
  let endMinutes = outH * 60 + outM;
  let stopMinutes = stopH * 60 + stopM;

  // Handle overnight
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
    if (stopMinutes < startMinutes) {
      stopMinutes += 24 * 60;
    }
  }

  if (stopMinutes < startMinutes) {
    return {
      isConsistent: false,
      warning: `출근시간(${clockIn}) 이전 일정입니다.`,
    };
  }

  if (stopMinutes > endMinutes) {
    return {
      isConsistent: false,
      warning: `퇴근시간(${clockOut}) 이후 일정입니다.`,
    };
  }

  return { isConsistent: true };
};

/**
 * Sanitize numeric string: strips commas, spaces and non-digits
 * e.g. "154,725 km" -> "154725"
 */
export const sanitizeOdometer = (val: string | number | undefined | null): string => {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[^0-9]/g, '');
};

/**
 * Format numeric value with standard 3-digit comma grouping
 * e.g. "154725" -> "154,725"
 */
export const formatOdometer = (val: string | number | undefined | null): string => {
  const clean = sanitizeOdometer(val);
  if (!clean) return '';
  const num = parseInt(clean, 10);
  return isNaN(num) ? '' : num.toLocaleString('ko-KR');
};

/**
 * Calculate today's driving distance
 * e.g. 154,725 to 154,861 -> 136 km
 */
export const calculateDrivingDistance = (
  startVal?: string | number | null,
  endVal?: string | number | null
): { distanceKm: number | null; formatted: string; error: string | null } => {
  const startClean = sanitizeOdometer(startVal);
  const endClean = sanitizeOdometer(endVal);

  if (!startClean || !endClean) {
    return { distanceKm: null, formatted: '- km', error: null };
  }

  const start = parseInt(startClean, 10);
  const end = parseInt(endClean, 10);

  if (isNaN(start) || isNaN(end)) {
    return { distanceKm: null, formatted: '- km', error: '올바른 숫자를 입력해주세요.' };
  }

  if (end < start) {
    return {
      distanceKm: null,
      formatted: '- km',
      error: '종료 거리가 시작 거리보다 작습니다.',
    };
  }

  const distance = end - start;
  return {
    distanceKm: distance,
    formatted: `${distance.toLocaleString('ko-KR')} km`,
    error: null,
  };
};

/**
 * Check if today's vehicle inspection has verified odometer records for this specific vehicle and booking.
 * Strictly avoids grabbing odometer readings from another booking simply because vehicle or date matches.
 */
export const getVerifiedInspectionOdometer = (
  vehicleNo?: string,
  targetDateIso: string = formatIsoDate(),
  bookingId?: string
): { startKm: string; endKm: string; isVerified: boolean } => {
  if (typeof window === 'undefined' || !vehicleNo) {
    return { startKm: '', endKm: '', isVerified: false };
  }

  try {
    const cleanNo = vehicleNo.match(/(\d+호차)/)?.[1] || vehicleNo.trim();
    // 1. Check booking-specific key first
    let raw: string | null = null;
    if (bookingId) {
      raw = localStorage.getItem(`cockpit_vehicle_inspection_${cleanNo}_${bookingId}`);
    }
    // 2. If no booking-specific key, check general key
    if (!raw) {
      raw = localStorage.getItem(`cockpit_vehicle_inspection_${cleanNo}`);
    }
    if (!raw) return { startKm: '', endKm: '', isVerified: false };

    const parsed = JSON.parse(raw);
    // Strict date and vehicle match
    const inspectDate = parsed.savedAt ? formatIsoDate(new Date(parsed.savedAt)) : '';
    if (inspectDate && inspectDate !== targetDateIso) {
      // Stale inspection record from another date -> do not prefill silently
      return { startKm: '', endKm: '', isVerified: false };
    }

    // Strict booking match: If the inspection is bound to a different booking, do NOT grab it!
    if (bookingId && parsed.bookingId && parsed.bookingId !== bookingId) {
      return { startKm: '', endKm: '', isVerified: false };
    }

    // If caller requests a specific booking, but the inspection is bound to another booking, reject
    if (!bookingId && parsed.bookingId) {
      // Unassigned log shouldn't grab a booking-bound odometer
      return { startKm: '', endKm: '', isVerified: false };
    }

    const startKm = parsed.pickupOdo
      ? formatOdometer(parsed.pickupOdo)
      : parsed.startKm
      ? formatOdometer(parsed.startKm)
      : '';
    const endKm = parsed.returnOdo
      ? formatOdometer(parsed.returnOdo)
      : parsed.endKm
      ? formatOdometer(parsed.endKm)
      : '';

    return {
      startKm,
      endKm,
      isVerified: Boolean(startKm && endKm),
    };
  } catch {
    return { startKm: '', endKm: '', isVerified: false };
  }
};

/**
 * Reference Demo Fixture
 * Matches the user-provided reference screenshots for review & visual QA
 */
export const createReferenceDemoFixture = (driverProfile?: DriverProfile): DrivingLogData => {
  const driverName = driverProfile?.driverName || '윤태준';
  const carNumber =
    driverProfile?.plateNumber ||
    driverProfile?.carNumber ||
    (driverProfile?.carNumberFront && driverProfile?.carNumberBack
      ? `${driverProfile.carNumberFront} ${driverProfile.carNumberBack}`
      : '');

  return {
    reportId: 'demo_reference_fixture',
    assignmentId: 'ASSIGN-20261020-001',
    date: '2026년 10월 20일 (화)',
    rawDate: '2026-10-20',
    driverName,
    carNumber,
    clientName: '인터코스',
    passengerCount: '9명',
    clockIn: '06:40',
    clockOut: '21:50',
    totalDutyHours: '15시간 10분',
    startKm: '154,725',
    endKm: '154,861',
    distanceKm: '136 km',
    stops: [
      { id: 'ref-1', time: '07:00', place: '차고지', address: '경기 성남시 분당구 판교로' },
      { id: 'ref-2', time: '08:50', place: '메리어트 호텔', address: '서울 강남구 봉은사로 120' },
      { id: 'ref-3', time: '09:50', place: '판교 오피스', address: '경기도 성남시 분당구 판교로 123' },
      { id: 'ref-4', time: '11:25', place: '메리어트 호텔', address: '서울 강남구 봉은사로 120' },
      { id: 'ref-5', time: '13:30', place: '판교 오피스', address: '경기도 성남시 분당구 판교로 123' },
      { id: 'ref-6', time: '17:05', place: '강남 올리브영', address: '서울 강남구 테헤란로 231' },
      { id: 'ref-7', time: '21:30', place: '메리어트 호텔', address: '서울 강남구 봉은사로 120' },
      { id: 'ref-8', time: '21:45', place: '차고지', address: '경기 성남시 분당구 판교로' },
    ],
    notes: '',
    status: 'draft',
    isDemoFixture: true,
  };
};

/**
 * Load or initialize a real Driving Log draft
 * Sourced purely from verified inputs; does NOT inject fake schedules or fictitious customer data
 */
export const loadDrivingLogDraft = (
  driverProfile: DriverProfile,
  reportId?: string,
  dateIso: string = formatIsoDate(),
  bookingId?: string
): DrivingLogData => {
  const driverId=driverProfile.driverId || driverProfile.id || 'unlinked';
  const scopedReportId=reportId || `report_${driverId}_${bookingId || 'daily'}_${dateIso}`;
  if(typeof window!=='undefined'){
    try{
      const raw=localStorage.getItem(`${DRIVING_LOG_STORAGE_PREFIX}${scopedReportId}`);
      if(raw){const stored=JSON.parse(raw);if(stored.driverId===driverId && (stored.bookingId || null)===(bookingId || null) && stored.rawDate===dateIso)return stored;}
    }catch{console.warn('운행일지 초안을 불러오지 못했습니다.');}
  }

  // Derive verified driver and vehicle identity
  const driverName = driverProfile.driverName || '담당 기사';
  const carNumber =
    driverProfile.plateNumber ||
    driverProfile.carNumber ||
    (driverProfile.carNumberFront && driverProfile.carNumberBack
      ? `${driverProfile.carNumberFront} ${driverProfile.carNumberBack}`
      : '');

  // Client name & passenger count from verified profile fields or empty
  const clientName = driverProfile.clientName || '';
  const passengerCount = driverProfile.passengerCount || '';

  // Check verified vehicle inspection odometer for today (booking-aware)
  const verifiedOdo = getVerifiedInspectionOdometer(driverProfile.vehicleNo, dateIso, bookingId);
  const startKm = verifiedOdo.startKm || '';
  const endKm = verifiedOdo.endKm || '';
  const { formatted: distanceFormatted } = calculateDrivingDistance(startKm, endKm);

  return {
    reportId: scopedReportId,
    submissionId: crypto.randomUUID(),
    assignmentId: `ASSIGN-${dateIso.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
    date: formatKoreanDate(new Date(`${dateIso}T12:00:00+09:00`)),
    rawDate: dateIso,
    driverName,
    carNumber,
    clientName,
    passengerCount,
    clockIn: '',
    clockOut: '',
    totalDutyHours: '0시간 0분',
    startKm,
    endKm,
    distanceKm: distanceFormatted,
    odoSource: verifiedOdo.isVerified ? 'inspection_verified' : undefined,
    stops: [], // Fresh real report starts empty
    notes: '',
    status: 'draft',
    isDemoFixture: false,
    bookingId,
    driverId,
    vehicleId: driverProfile.vehicleNo,
  };
};

/**
 * Save driving log draft to localStorage with unique report ID
 */
export const saveDrivingLogDraft = (data: DrivingLogData): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const payload: DrivingLogData = {
      ...data,
      status: data.status,
      savedAt: new Date().toISOString(),
    };

    // Save report payload
    localStorage.setItem(`${DRIVING_LOG_STORAGE_PREFIX}${data.reportId}`, JSON.stringify(payload));

    // Update index of drafts
    const rawIndex = localStorage.getItem(DRIVING_LOG_INDEX_KEY);
    const index: Array<{ reportId: string; date: string; clientName: string; bookingId?: string; driverId?: string; updatedAt: string }> =
      rawIndex ? JSON.parse(rawIndex) : [];

    const existingIdx = index.findIndex((item) => item.reportId === data.reportId);
    const indexEntry = {
      reportId: data.reportId,
      date: data.rawDate,
      clientName: data.clientName || '미지정',
      bookingId: data.bookingId,
      driverId: data.driverId,
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      index[existingIdx] = indexEntry;
    } else {
      index.unshift(indexEntry);
    }

    localStorage.setItem(DRIVING_LOG_INDEX_KEY, JSON.stringify(index.slice(0, 30)));
    return true;
  } catch (e) {
    console.error('Failed to save driving log draft:', e);
    return false;
  }
};
