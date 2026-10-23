/**
 * Pure Client-Side Driving Log (운행일지) Calculation & Storage Utilities
 */

import { DriverProfile } from '@/types';

export interface RouteStopItem {
  id: string;
  time: string;       // e.g. "07:00", "08:50"
  place: string;      // e.g. "차고지", "메리어트 호텔"
  address?: string;   // e.g. "서울 강남구 봉은사로 120"
  memo?: string;      // e.g. "고객 미팅, 식사, 대기 등"
  lat?: number;
  lng?: number;
}

export interface DrivingLogData {
  reportId: string;
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
  // Route timeline
  stops: RouteStopItem[];
  // Special notes
  notes: string;
  savedAt?: string;
  status?: 'draft' | 'submitted';
}

export const DRIVING_LOG_STORAGE_KEY_PREFIX = 'cockpit_driving_log_';

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
 * Returns { hours, minutes, formatted }
 * e.g. "06:40" to "21:50" -> "15시간 10분"
 */
export const calculateDutyDuration = (
  clockIn?: string | null,
  clockOut?: string | null
): { hours: number; minutes: number; formatted: string; totalMinutes: number } => {
  if (!clockIn || !clockOut) {
    return { hours: 0, minutes: 0, formatted: '0시간 0분', totalMinutes: 0 };
  }

  const [inH, inM] = clockIn.split(':').map((v) => parseInt(v, 10));
  const [outH, outM] = clockOut.split(':').map((v) => parseInt(v, 10));

  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) {
    return { hours: 0, minutes: 0, formatted: '0시간 0분', totalMinutes: 0 };
  }

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
  return { hours, minutes, formatted, totalMinutes: diffMinutes };
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
 * Get initial reference mock stops (matching the reference screenshot)
 */
export const getReferenceDefaultStops = (): RouteStopItem[] => [
  { id: 'stop-1', time: '07:00', place: '차고지', address: '경기 성남시 분당구 판교로' },
  { id: 'stop-2', time: '08:50', place: '메리어트 호텔', address: '서울 강남구 봉은사로 120' },
  { id: 'stop-3', time: '09:50', place: '판교 오피스', address: '경기도 성남시 분당구 판교로 123' },
  { id: 'stop-4', time: '11:25', place: '메리어트 호텔', address: '서울 강남구 봉은사로 120' },
  { id: 'stop-5', time: '13:30', place: '판교 오피스', address: '경기도 성남시 분당구 판교로 123' },
  { id: 'stop-6', time: '17:05', place: '강남 올리브영', address: '서울 강남구 테헤란로 231' },
  { id: 'stop-7', time: '21:30', place: '메리어트 호텔', address: '서울 강남구 봉은사로 120' },
  { id: 'stop-8', time: '22:15', place: '차고지', address: '경기 성남시 분당구 판교로' },
];

/**
 * Reference recent locations (matching the reference screenshot 일정 추가)
 */
export const REFERENCE_RECENT_LOCATIONS = [
  {
    name: '메리어트 호텔',
    address: '서울 강남구 봉은사로 120',
  },
  {
    name: '판교 오피스',
    address: '경기도 성남시 분당구 판교로 123',
  },
  {
    name: '인천공항 T1',
    address: '인천 중구 공항로 272',
  },
  {
    name: '강남 올리브영',
    address: '서울 강남구 테헤란로 231',
  },
];

/**
 * Load driving log draft from localStorage or generate defaults from active driver profile
 */
export const loadDrivingLogDraft = (
  driverProfile: DriverProfile,
  dateIso: string = formatIsoDate()
): DrivingLogData => {
  const storageKey = `${DRIVING_LOG_STORAGE_KEY_PREFIX}${driverProfile.vehicleNo || 'default'}_${dateIso}`;

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load driving log from localStorage:', e);
    }
  }

  // Derive initial values
  const driverName = driverProfile.driverName || '윤태준';
  const carNumber =
    driverProfile.plateNumber ||
    driverProfile.carNumber ||
    (driverProfile.carNumberFront && driverProfile.carNumberBack
      ? `${driverProfile.carNumberFront} ${driverProfile.carNumberBack}`
      : '142호 7811');

  const clientName =
    driverProfile.clientName ||
    (driverProfile.targetChatRoom ? driverProfile.targetChatRoom.replace(/(단톡방|의전|VIP).*/g, '').trim() : '') ||
    '인터코스';

  const passengerCount =
    driverProfile.passengerCount ||
    (driverProfile.passengerName ? driverProfile.passengerName.replace(/[^0-9명]/g, '') : '') ||
    '9명';

  // Check if odometer was recorded in vehicle inspection
  let startKm = '154,725';
  let endKm = '154,861';

  if (typeof window !== 'undefined') {
    try {
      const inspectKey = `cockpit_vehicle_inspection_${driverProfile.vehicleNo?.trim() || 'default'}`;
      const rawInspect = localStorage.getItem(inspectKey);
      if (rawInspect) {
        const parsed = JSON.parse(rawInspect);
        if (parsed.pickupOdo) {
          startKm = formatOdometer(parsed.pickupOdo);
        }
        if (parsed.returnOdo) {
          endKm = formatOdometer(parsed.returnOdo);
        }
      }
    } catch {
      // ignore
    }
  }

  const { formatted: distanceFormatted } = calculateDrivingDistance(startKm, endKm);

  return {
    reportId: `report_${Date.now()}`,
    date: formatKoreanDate(new Date()),
    rawDate: dateIso,
    driverName,
    carNumber,
    clientName,
    passengerCount,
    clockIn: '06:40',
    clockOut: '21:50',
    totalDutyHours: calculateDutyDuration('06:40', '21:50').formatted,
    startKm,
    endKm,
    distanceKm: distanceFormatted,
    stops: getReferenceDefaultStops(),
    notes: '',
    status: 'draft',
  };
};

/**
 * Save driving log draft to localStorage
 */
export const saveDrivingLogDraft = (data: DrivingLogData, vehicleNo: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const storageKey = `${DRIVING_LOG_STORAGE_KEY_PREFIX}${vehicleNo || 'default'}_${data.rawDate}`;
    localStorage.setItem(storageKey, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
    return true;
  } catch (e) {
    console.error('Failed to save driving log draft:', e);
    return false;
  }
};
