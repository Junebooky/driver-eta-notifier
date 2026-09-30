import { LocationPreset } from '@/types';

export interface ScheduleItem {
  id: string;
  vehicle_no?: string;
  date: string;
  dateLabel: string;
  pickup_time: string;
  dropoff_time: string | null;
  time_display: string;
  origin_name: string;
  origin_address: string;
  destination_name: string;
  destination_address: string;
  status: 'confirmed' | 'pending' | 'completed';
  passenger: string;
  flight?: string;
  flightType?: 'arrival' | 'departure';
  notes?: string;
  // SSOT preset mapping for zero-cost geocoding and instant navigation
  origin_preset_id: string;
  origin_lat: number;
  origin_lng: number;
  destination_preset_id: string;
  destination_lat: number;
  destination_lng: number;
  waypoints?: LocationPreset[];
  adminWaypoints?: LocationPreset[];
  isAdminRoute?: boolean;
}

/**
 * 스케줄 목록의 실제 운행 날짜 및 시간순(Chronological) 강제 오름차순 정렬 유틸리티
 */
export function sortSchedulesChronologically<T extends { date?: string; pickup_date?: string; pickup_time?: string; time_display?: string }>(schedules: T[]): T[] {
  return [...schedules].sort((a, b) => {
    const dateA = a.pickup_date || a.date || '';
    const dateB = b.pickup_date || b.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);

    const getTime = (item: T) => {
      const match = (item.pickup_time || item.time_display || '').match(/(\d{1,2}):(\d{2})/);
      if (!match) return '99:99';
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    };

    return getTime(a).localeCompare(getTime(b));
  });
}

/**
 * 윤태준 드라이버 (4호차, 142호 7811) 실제 4일치 페라리 VIP 의전 배차 데이터
 * (시뮬레이션 배제, 원본 기재 착륙/픽업 시각 기준)
 * 
 * SSOT 프리셋 정합성:
 * - '인천공항 T1': 37.4495, 126.4512 (인천 중구 공항로 272)
 * - '조선팰리스 강남': 37.5042, 127.0425 (서울 강남구 테헤란로 231)
 * - '인제 스피디움 호텔': 38.0051, 128.2917 (강원 인제군 기린면 상하답로 130)
 * - '인제 스피디움 트랙': 38.0065, 128.2930 (강원 인제군 기린면 상하답로 130)
 */
export const CONFIRMED_FERRARI_SCHEDULES: ScheduleItem[] = [
  // Day 1 (9월 17일 목요일): 인천공항 T1 입국 영접 및 조선팰리스 체크인
  {
    id: "sch-day1-01",
    date: "2026-09-17",
    dateLabel: "9월 17일 (목)",
    pickup_time: "09:50",
    dropoff_time: null,                       // 배차표 원본에 종료시각이 없으므로 null
    time_display: "09:50 착륙",          // 원본 LANDING TIME 기준 단일 표기
    origin_name: "인천공항 T1",
    origin_address: "인천 중구 공항로 272",
    origin_preset_id: "3c7e416a-1111-4111-a111-111111111111",
    origin_lat: 37.4495,
    origin_lng: 126.4512,
    destination_name: "조선팰리스 강남",
    destination_address: "서울 강남구 테헤란로 231",
    destination_preset_id: "3c7e416a-3333-4333-a333-333333333333",
    destination_lat: 37.5042,
    destination_lng: 127.0425,
    status: "confirmed",
    passenger: "DENZEL SOFYAN 외 1명 (TARA SOFYAN)",
    flight: "SQ 612",
    notes: "CLUB CHALLENGE VIP 영접 • T1 입국장 피켓 대기"
  },

  // Day 2 (9월 18일 금요일): 조선팰리스 강남 픽업 → 인제 스피디움 호텔 이동 (관리자 지정동선 대열 주행)
  {
    id: "sch-day2-01",
    date: "2026-09-18",
    dateLabel: "9월 18일 (금)",
    pickup_time: "09:00",
    dropoff_time: null,                       // 배차표 원본에 종료시각이 없으므로 null
    time_display: "09:00 픽업",                // 원본 PICK UP TIME 9:00 AM 기준
    origin_name: "조선팰리스 강남",
    origin_address: "서울 강남구 테헤란로 231",
    origin_preset_id: "3c7e416a-3333-4333-a333-333333333333",
    origin_lat: 37.5042,
    origin_lng: 127.0425,
    destination_name: "인제 스피디움 호텔",
    destination_address: "강원 인제군 기린면 상하답로 130",
    destination_preset_id: "3c7e416a-5555-4555-a555-555555555555",
    destination_lat: 38.0051,
    destination_lng: 128.2917,
    status: "confirmed",
    passenger: "DENZEL SOFYAN 외 1명 (TARA SOFYAN)",
    notes: "CLUB CHALLENGE 서킷 행사 이동 • 가평·내린천휴게소 경유 대열 이동",
    isAdminRoute: true,
    adminWaypoints: [
      {
        id: "admin-wp-gapyeong",
        name: "가평휴게소(춘천방향)",
        shortName: "가평휴게소",
        address: "경기 가평군 설악면 미원리 100",
        lat: 37.7025,
        lng: 127.5385,
        category: "CUSTOM",
      },
      {
        id: "admin-wp-naerincheon",
        name: "내린천휴게소(양양방향)",
        shortName: "내린천휴게소",
        address: "강원 인제군 상남면 서울양양고속도로 117",
        lat: 37.9405,
        lng: 128.2831,
        category: "CUSTOM",
      },
    ]
  },

  // Day 3 (9월 19일 토요일): 인제 서킷 트랙 종료 후 서울 조선팰리스 복귀
  {
    id: "sch-day3-01",
    date: "2026-09-19",
    dateLabel: "9월 19일 (토)",
    pickup_time: "14:30",
    dropoff_time: null,                       // 배차표 원본에 종료시각이 없으므로 null
    time_display: "14:30 픽업",                // 원본 PICK UP TIME 2:30 오후 기준
    origin_name: "인제 스피디움 트랙",
    origin_address: "강원 인제군 기린면 상하답로 130",
    origin_preset_id: "3c7e416a-6666-4666-a666-666666666666",
    origin_lat: 38.0065,
    origin_lng: 128.2930,
    destination_name: "조선팰리스 강남",
    destination_address: "서울 강남구 테헤란로 231",
    destination_preset_id: "3c7e416a-3333-4333-a333-333333333333",
    destination_lat: 37.5042,
    destination_lng: 127.0425,
    status: "confirmed",
    passenger: "DENZEL SOFYAN 외 1명 (TARA SOFYAN)",
    notes: "CLUB CHALLENGE 트랙 세션 종료 후 강남 복귀"
  },

  // Day 4 (9월 20일 일요일): 조선팰리스 강남 픽업 → 인천공항 T1 출국 샌딩
  {
    id: "sch-day4-01",
    date: "2026-09-20",
    dateLabel: "9월 20일 (일)",
    pickup_time: "13:00",
    dropoff_time: null,                       // 차량 종료시각이 아니므로 null
    time_display: "13:00 픽업",                // 원본 AIRPORT PICK UP TIME 1:00 오후 기준
    origin_name: "조선팰리스 강남",
    origin_address: "서울 강남구 테헤란로 231",
    origin_preset_id: "3c7e416a-3333-4333-a333-333333333333",
    origin_lat: 37.5042,
    origin_lng: 127.0425,
    destination_name: "인천공항 T1",
    destination_address: "인천 중구 공항로 272",
    destination_preset_id: "3c7e416a-1111-4111-a111-111111111111",
    destination_lat: 37.4495,
    destination_lng: 126.4512,
    status: "confirmed",
    passenger: "KAI THIO (1명)",
    flight: "SQ 601 (16:45 출국)",
    flightType: "departure",
    notes: "CLUB CHALLENGE C/D 출국 샌딩"
  }
];

/**
 * Helper to convert ScheduleItem origin/destination to LocationPreset
 */
export function scheduleToPresets(item: ScheduleItem): {
  originPreset: LocationPreset;
  destinationPreset: LocationPreset;
  adminWaypoints?: LocationPreset[];
  isAdminRoute?: boolean;
} {
  const originPreset: LocationPreset = {
    id: item.origin_preset_id,
    name: item.origin_name,
    shortName: item.origin_name,
    address: item.origin_address,
    lat: item.origin_lat,
    lng: item.origin_lng,
    category: item.origin_name.includes('공항') ? 'AIRPORT' : item.origin_name.includes('호텔') ? 'HOTEL' : item.origin_name.includes('트랙') ? 'CIRCUIT' : 'CUSTOM',
  };

  const destinationPreset: LocationPreset = {
    id: item.destination_preset_id,
    name: item.destination_name,
    shortName: item.destination_name,
    address: item.destination_address,
    lat: item.destination_lat,
    lng: item.destination_lng,
    category: item.destination_name.includes('공항') ? 'AIRPORT' : item.destination_name.includes('호텔') ? 'HOTEL' : item.destination_name.includes('트랙') ? 'CIRCUIT' : 'CUSTOM',
  };

  return {
    originPreset,
    destinationPreset,
    adminWaypoints: item.adminWaypoints || item.waypoints || [],
    isAdminRoute: Boolean(item.isAdminRoute || (item.adminWaypoints && item.adminWaypoints.length > 0)),
  };
}
