/**
 * Field Tips (현장 팁) Data Store & Pure Utilities
 * Provides verified VIP Limousine driver field tips for major hotels, airports, and hubs.
 */

import { PlaceFieldTips, FieldTipItem } from '@/types/fieldTip';

export const JOSUN_PALACE_FIELD_TIPS: PlaceFieldTips = {
  id: 'josun_palace_gangnam',
  placeName: '조선팰리스 강남',
  address: '서울 강남구 테헤란로 231',
  imageUrl: '/images/josun_palace_facade.jpg',
  lat: 37.5028,
  lng: 127.0427,
  tips: [
    {
      id: 'jp-tip-parking',
      category: 'parking',
      title: '무료 주차 30분',
      subtitle: '기사 제보 · 공식 확인 필요',
      badgeIconType: 'parking_p',
      badgeLetter: 'P',
      badgeBgColor: 'bg-[#1E60F3]',
      badgeTextColor: 'text-white',
      details: {
        rows: [
          {
            iconType: 'clock',
            label: '무료 시간',
            value: '30분 무료',
          },
          {
            iconType: 'won',
            label: '추가 요금',
            value: '이후 10분당 1,000원',
          },
          {
            iconType: 'car',
            label: '적용 구역',
            value: '1층 단기주차장 (승하차)',
          },
          {
            iconType: 'file',
            label: '참고 사항',
            value: '',
            bullets: [
              '승객 픽업 시 10분까지 무료',
              '장기 대기 시 장기주차장 이용 권장',
              '최신 요금은 현장 확인 필요',
            ],
          },
        ],
        verificationNote: '기사 제보 · 호텔 공식 확인 필요',
        verifiedDate: '2024.10.15',
      },
    },
    {
      id: 'jp-tip-pickup',
      category: 'pickup',
      title: '픽업 위치',
      subtitle: '로비 앞 대기 후 고객 호출',
      badgeIconType: 'pin',
      badgeBgColor: 'bg-blue-50',
      badgeTextColor: 'text-[#1E60F3]',
      details: {
        rows: [
          {
            iconType: 'mapPin',
            label: '대기 구역',
            value: '호텔 정문 메인 로비 회전문 앞 1차선',
          },
          {
            iconType: 'clock',
            label: '권장 시간',
            value: '승차 예정 시간 10분 전 접안',
          },
          {
            iconType: 'phone',
            label: '호출 방식',
            value: '도어맨 수신호 및 고객 전화 연락',
          },
          {
            iconType: 'file',
            label: '참고 사항',
            value: '',
            bullets: [
              '피크 시간(08:00~09:30, 18:00~20:00) 5분 초과 대기 시 지하 1층 또는 대기 주차 구역 이동',
              'VIP 의전 시 도어맨에게 사전 차량 번호 전달 시 신속 유도 지원',
            ],
          },
        ],
        verificationNote: 'VIP 의전팀 실전 주행 가이드',
        verifiedDate: '2024.10.18',
      },
    },
    {
      id: 'jp-tip-truck',
      category: 'large_vehicle',
      title: '대형차 진입',
      subtitle: 'Sprinter 진입 전 높이 제한 확인',
      badgeIconType: 'truck',
      badgeBgColor: 'bg-blue-50',
      badgeTextColor: 'text-[#1E60F3]',
      details: {
        rows: [
          {
            iconType: 'alert',
            label: '제한 높이',
            value: '지하 주차장 2.3m 이하',
          },
          {
            iconType: 'truck',
            label: '스프린터',
            value: '진입 불가 (높이 2.8m) — 지상 정문 회차로 이용',
          },
          {
            iconType: 'car',
            label: '스타리아/카니발',
            value: '지하 1층(2.1m) 정상 진입 가능',
          },
          {
            iconType: 'file',
            label: '참고 사항',
            value: '',
            bullets: [
              '벤츠 스프린터 519 CDI 하이루프 차량은 반드시 지상 정문 승하차 구역 이용',
              '지상 정문 대형차 전용 임시 정차선 2대분 확보되어 있음',
            ],
          },
        ],
        verificationNote: '스프린터 운행팀 현장 실측 완료',
        verifiedDate: '2024.10.12',
      },
    },
    {
      id: 'jp-tip-warning',
      category: 'traffic_warning',
      title: '주정차 유의',
      subtitle: '카메라·단속 구역 여부 현장 확인',
      badgeIconType: 'ban',
      badgeBgColor: 'bg-red-50',
      badgeTextColor: 'text-red-500',
      details: {
        rows: [
          {
            iconType: 'alert',
            label: '단속 카메라',
            value: '테헤란로 전면 대로변 고정식 단속 CCTV 작동 중',
          },
          {
            iconType: 'clock',
            label: '유예 시간',
            value: '5분 초과 시 즉시 과태료 부과',
          },
          {
            iconType: 'mapPin',
            label: '안전 구역',
            value: '호텔 사유지 진입로(차단기 안쪽) 대기 권장',
          },
          {
            iconType: 'file',
            label: '참고 사항',
            value: '',
            bullets: [
              '대로변 비상등 점멸 정차도 단속 대상이므로 진입로 안쪽으로 진입 필수',
              '평일 출퇴근 시간대 구청 단속 차량 순찰 잦음',
            ],
          },
        ],
        verificationNote: '강남구청 주정차단속 구역 공지',
        verifiedDate: '2024.10.05',
      },
    },
  ],
};

export const INCHEON_T1_FIELD_TIPS: PlaceFieldTips = {
  id: 'incheon_airport_t1',
  placeName: '인천공항 T1',
  address: '인천 중구 공항로 272',
  imageUrl: '/images/incheon_airport_t1.jpg',
  lat: 37.4602,
  lng: 126.4407,
  tips: [
    {
      id: 'icn-tip-parking',
      category: 'parking',
      title: '단기주차장 15분 무료',
      subtitle: '지하/지상 단기주차장 회차 기준',
      badgeIconType: 'parking_p',
      badgeLetter: 'P',
      badgeBgColor: 'bg-[#1E60F3]',
      badgeTextColor: 'text-white',
      details: {
        rows: [
          {
            iconType: 'clock',
            label: '회차 시간',
            value: '15분 이내 출차 시 무료',
          },
          {
            iconType: 'won',
            label: '기본 요금',
            value: '최초 30분 1,200원 / 추가 15분당 600원',
          },
          {
            iconType: 'car',
            label: '추천 구역',
            value: '지상 H구역 (스프린터 및 대형 리무진 최적)',
          },
          {
            iconType: 'file',
            label: '참고 사항',
            value: '',
            bullets: [
              '15분 초과 시 입차 시간부터 전체 과금 적용',
              '항공기 지연 시 장기주차장(일 9,000원) 임시 이동 추천',
            ],
          },
        ],
        verificationNote: '인천국제공항공사 공식 주차 요금',
        verifiedDate: '2024.10.20',
      },
    },
    {
      id: 'icn-tip-pickup',
      category: 'pickup',
      title: '입국장 픽업 위치',
      subtitle: '1층 3번/12번 게이트 전면 횡단보도',
      badgeIconType: 'pin',
      badgeBgColor: 'bg-blue-50',
      badgeTextColor: 'text-[#1E60F3]',
      details: {
        rows: [
          {
            iconType: 'mapPin',
            label: '접안 위치',
            value: '1층 입국장 12번 게이트 바깥 3차선 승차 전용선',
          },
          {
            iconType: 'clock',
            label: '접안 타이밍',
            value: '고객 수하물 수취 완료 및 게이트 통과 연락 후 진입',
          },
          {
            iconType: 'phone',
            label: '안내 팁',
            value: '단톡방 승차 위치 사진 및 차량번호 사전 공유',
          },
          {
            iconType: 'file',
            label: '참고 사항',
            value: '',
            bullets: [
              '입국장 전면 도로는 5분 이상 정차 시 공항경찰 및 안내요원 즉시 이동 조치',
              '고객 미출현 시 H구역 주차장에서 대기하다 연락받고 3분 내 접안',
            ],
          },
        ],
        verificationNote: 'VIP LIMOUSINE KOREA 입국 의전 매뉴얼',
        verifiedDate: '2024.10.22',
      },
    },
    {
      id: 'icn-tip-truck',
      category: 'large_vehicle',
      title: '스프린터 대형차 동선',
      subtitle: '지하주차장 진입 절대 불가 (지상 전용)',
      badgeIconType: 'truck',
      badgeBgColor: 'bg-blue-50',
      badgeTextColor: 'text-[#1E60F3]',
      details: {
        rows: [
          {
            iconType: 'alert',
            label: '지하 높이',
            value: '지하 단기주차장 진입제한 2.1m (스프린터 파손 위험)',
          },
          {
            iconType: 'truck',
            label: '지상 동선',
            value: '단기주차장 진입 시 맨 우측 지상 전용 톨게이트 이용',
          },
          {
            iconType: 'file',
            label: '참고 사항',
            value: '',
            bullets: [
              '스프린터 519/319 차량은 단기주차장 지상 대형버스/리무진 전용 구역 주차',
              '승객 하차는 3층 출국장 도로 전면 대형 전용 차선 이용 가능',
            ],
          },
        ],
        verificationNote: '공항 시설관리팀 규정 확인',
        verifiedDate: '2024.10.10',
      },
    },
    {
      id: 'icn-tip-warning',
      category: 'traffic_warning',
      title: '3층 출국장 승차 금지',
      subtitle: '3층 출국장은 하차 전용 (승차 시 과태료)',
      badgeIconType: 'ban',
      badgeBgColor: 'bg-red-50',
      badgeTextColor: 'text-red-500',
      details: {
        rows: [
          {
            iconType: 'alert',
            label: '단속 규정',
            value: '3층 출국장 도로는 [하차 전용] — 고객 승차 불가',
          },
          {
            iconType: 'clock',
            label: '정차 한도',
            value: '승객 짐 하차 즉시 5분 내 출차 원칙',
          },
          {
            iconType: 'file',
            label: '참고 사항',
            value: '',
            bullets: [
              '승객 입국 픽업 시 절대로 3층 출국장으로 부르지 마시고 1층 입국장으로 유도',
              '3층에서 승객 승차 적발 시 교통안전 단속반 과태료 부과 대상',
            ],
          },
        ],
        verificationNote: '인천국제공항 경찰단 특별단속 공지',
        verifiedDate: '2024.10.01',
      },
    },
  ],
};

const PREDEFINED_LOCATIONS: Record<string, PlaceFieldTips> = {
  '조선팰리스': JOSUN_PALACE_FIELD_TIPS,
  '조선팰리스 강남': JOSUN_PALACE_FIELD_TIPS,
  '인천공항': INCHEON_T1_FIELD_TIPS,
  '인천공항 T1': INCHEON_T1_FIELD_TIPS,
  '인천국제공항': INCHEON_T1_FIELD_TIPS,
};

const LOCAL_STORAGE_CUSTOM_TIPS_KEY = 'cockpit_field_tips_custom';

/**
 * Get field tips for a location name
 */
export function getFieldTipsForPlace(placeName: string = '', address: string = ''): PlaceFieldTips {
  const cleanName = placeName.trim();
  const lowerName = cleanName.toLowerCase();

  // 1. Direct or partial matching with predefined locations
  for (const [key, placeData] of Object.entries(PREDEFINED_LOCATIONS)) {
    if (cleanName.includes(key) || key.includes(cleanName) || lowerName.includes(key.toLowerCase())) {
      const stored = getCustomTipsFromStorage(placeData.id);
      return {
        ...placeData,
        tips: [...placeData.tips, ...stored],
      };
    }
  }

  // 2. Default fallback place tips with generic VIP driver tips
  const fallbackId = `place_${cleanName || 'custom'}`;
  const stored = getCustomTipsFromStorage(fallbackId);

  return {
    id: fallbackId,
    placeName: cleanName || '조선팰리스 강남',
    address: address || '서울 강남구 테헤란로 231',
    imageUrl: '/images/josun_palace_facade.jpg',
    tips: [
      ...JOSUN_PALACE_FIELD_TIPS.tips,
      ...stored,
    ],
  };
}

/**
 * Get total field tips count for a location
 */
export function getFieldTipsCount(placeName: string = ''): number {
  const data = getFieldTipsForPlace(placeName);
  return data.tips.length || 3;
}

/**
 * Save custom field tip submitted by driver to localStorage
 */
export function saveCustomFieldTip(placeId: string, tip: FieldTipItem): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_TIPS_KEY);
    const map: Record<string, FieldTipItem[]> = raw ? JSON.parse(raw) : {};
    const existing = map[placeId] || [];
    map[placeId] = [tip, ...existing];
    localStorage.setItem(LOCAL_STORAGE_CUSTOM_TIPS_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to save custom field tip:', err);
  }
}

function getCustomTipsFromStorage(placeId: string): FieldTipItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_TIPS_KEY);
    if (!raw) return [];
    const map: Record<string, FieldTipItem[]> = JSON.parse(raw);
    return map[placeId] || [];
  } catch {
    return [];
  }
}
