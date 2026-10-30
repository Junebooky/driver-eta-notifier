/**
 * VIP LIMOUSINE KOREA - HQ Common Driver Types & Mappers
 * 
 * Strict Single Source of Truth:
 * - Driver identifier MUST BE cockpit.drivers.id (UUID).
 * - Drivers and vehicles are distinct resources.
 * - Real DB data only; no fake ratings, dummy photos, or manufactured trip history.
 */

export interface DriverScheduleItem {
  id: string;
  dayIndex: number; // 0 = Mon, 1 = Tue, 2 = Wed, 3 = Thu, 4 = Fri, 5 = Sat, 6 = Sun
  dateStr: string;  // e.g. '2026-10-28'
  startTime: string; // '09:00'
  endTime: string;   // '12:00'
  startHour: number; // 9
  durationHours: number; // 3
  title: string;     // e.g. '09:00 - 12:00'
  route: string;     // '인천공항 T2 ➔ 조선팰리스'
  detail: string;    // 'KE082' or passenger note
  type: 'airport' | 'event' | 'meeting' | 'general';
}

export interface HqDriverSummary {
  id: string; // cockpit.drivers.id (UUID) - PRIMARY IDENTIFIER
  name: string; // cockpit.drivers.driver_name
  phone: string; // cockpit.drivers.phone
  vehicleNo: string; // cockpit.drivers.vehicle_no
  carNumber: string; // cockpit.drivers.car_number
  plate?: string; // alias for carNumber
  vehicleModel: string; // cockpit.drivers.vehicle_model or '차량 미지정'
  englishAvailable: boolean; // cockpit.drivers.english_available
  affiliationType: 'employed' | 'freelance'; // driver_meta.affiliation
  affiliationLabel: string; // '소속' | '프리랜서'
  affiliation?: string; // alias for affiliationLabel
  residence: string; // driver_meta.residence || '미입력'
  careerYears?: number; // driver_meta.career_years
  avatarUrl?: string; // driver_meta.avatar_url || ''
  memo: string; // driver_meta.memo || ''
  birthDate?: string;
  joinedDate?: string;
  rating?: number; // ONLY if real DB rating exists, otherwise omitted
  reviewCount?: number;
  recentTripDate?: string | null; // Calculated from real schedules
  recentTripRoute?: string | null;
  recentTrips?: { date: string; route: string }[];
  flags: string[]; // ['🇰🇷'] + (englishAvailable ? ['🇺🇸'] : [])
  languages: ('ko' | 'en' | string)[];
  languageLabels?: string[];
  isAvailable: boolean;
  schedules: DriverScheduleItem[];
  createdAt: string;
}

/**
 * Maps raw database row from `cockpit.drivers` and associated `cockpit.schedules`
 * into a strongly typed `HqDriverSummary`.
 */
export function mapDbDriverToHqSummary(
  dbDriver: any,
  allSchedules: any[] = []
): HqDriverSummary {
  const meta = typeof dbDriver.driver_meta === 'object' && dbDriver.driver_meta !== null
    ? dbDriver.driver_meta
    : {};

  const isEnglish = Boolean(dbDriver.english_available);
  const rawAffiliation = meta.affiliation || (
    dbDriver.vehicle_no?.includes('프리') || dbDriver.driver_name?.includes('프리')
      ? 'freelance'
      : 'employed'
  );
  const affiliationType: 'employed' | 'freelance' = rawAffiliation === 'freelance' ? 'freelance' : 'employed';
  const affiliationLabel = affiliationType === 'employed' ? '소속' : '프리랜서';

  // Find real schedules associated with this driver's vehicle_no or driver_id
  const driverSchedules = allSchedules.filter((s: any) => {
    if (s.driver_id && s.driver_id === dbDriver.id) return true;
    if (dbDriver.vehicle_no && s.vehicle_no === dbDriver.vehicle_no) return true;
    return false;
  });

  // Sort schedules descending by date and pickup_time
  driverSchedules.sort((a: any, b: any) => {
    const dateComp = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateComp !== 0) return dateComp;
    return String(b.pickup_time || '').localeCompare(String(a.pickup_time || ''));
  });

  // Calculate most recent trip
  const mostRecent = driverSchedules[0];
  const recentTripDate = mostRecent?.date || null;
  const recentTripRoute = mostRecent
    ? `${mostRecent.origin || '출발지'} ➔ ${mostRecent.destination || '도착지'}`
    : null;

  // Map to DriverScheduleItem
  const mappedSchedules: DriverScheduleItem[] = driverSchedules.map((s: any, idx: number) => {
    const dStr = s.date ? String(s.date).slice(0, 10) : '';
    const dayOfWeek = dStr ? (new Date(dStr + 'T00:00:00+09:00').getDay() + 6) % 7 : 0;
    const startStr = s.pickup_time ? String(s.pickup_time).slice(0, 5) : '09:00';
    const hasEndTime = Boolean(s.end_time);
    const endStr = hasEndTime ? String(s.end_time).slice(0, 5) : '';
    const startHour = parseInt(startStr.split(':')[0], 10) || 9;
    const endHour = hasEndTime ? (parseInt(endStr.split(':')[0], 10) || (startHour + 2)) : (startHour + 2);
    const durationHours = Math.max(1, endHour - startHour);

    const isAirport = /공항|airport|T1|T2|KE|AF|OZ/i.test(`${s.origin} ${s.destination} ${s.flight_number}`);
    const isMeeting = /미팅|회의|호텔/i.test(`${s.passenger_note} ${s.destination}`);

    return {
      id: s.id || `sch-${dbDriver.id}-${idx}`,
      dayIndex: dayOfWeek,
      dateStr: dStr,
      startTime: startStr,
      endTime: endStr || '종료 미확정',
      startHour,
      durationHours,
      title: hasEndTime ? `${startStr} - ${endStr}` : `${startStr} (종료 미확정)`,
      route: `${s.origin || '출발지'} ➔ ${s.destination || '도착지'}`,
      detail: s.flight_number || s.passenger_name || 'VIP 운행',
      type: isAirport ? 'airport' : isMeeting ? 'meeting' : 'general',
    };
  });

  const languages: ('ko' | 'en' | string)[] = ['ko'];
  const flags: string[] = ['🇰🇷'];
  const languageLabels: string[] = ['한국어'];
  if (isEnglish) {
    languages.push('en');
    flags.push('🇺🇸');
    languageLabels.push('영어');
  }

  const recentTrips = driverSchedules.slice(0, 3).map((s: any) => ({
    date: s.date ? String(s.date).slice(5, 10).replace('-', '.') : '',
    route: `${s.origin || '출발'} ➔ ${s.destination || '도착'}`,
  }));

  const birthDate = meta.birth_date || '미등록';
  const joinedDate = dbDriver.created_at
    ? String(dbDriver.created_at).slice(0, 10).replace(/-/g, '. ') + '.'
    : '미등록';

  return {
    id: dbDriver.id, // Real UUID from DB
    name: dbDriver.driver_name || '이름 미입력',
    phone: dbDriver.phone || '연락처 미등록',
    vehicleNo: dbDriver.vehicle_no || '미지정',
    carNumber: dbDriver.car_number || '차량 미등록',
    plate: dbDriver.car_number || '',
    vehicleModel: dbDriver.vehicle_model || '차량 미지정',
    englishAvailable: isEnglish,
    affiliationType,
    affiliationLabel,
    affiliation: affiliationLabel,
    residence: meta.residence || '미입력',
    careerYears: meta.career_years !== undefined ? Number(meta.career_years) : undefined,
    avatarUrl: meta.avatar_url || '',
    memo: meta.memo || '',
    birthDate,
    joinedDate,
    // Strict adherence to real DB integrity: NO fabricated ratings
    rating: meta.rating !== undefined ? Number(meta.rating) : undefined,
    reviewCount: meta.review_count !== undefined ? Number(meta.review_count) : undefined,
    recentTripDate,
    recentTripRoute,
    recentTrips,
    flags,
    languages,
    languageLabels,
    isAvailable: dbDriver.vehicle_status !== 'maintenance' && dbDriver.vehicle_status !== 'unavailable',
    schedules: mappedSchedules,
    createdAt: dbDriver.created_at || new Date().toISOString(),
  };
}
