/**
 * Types for Driver Cockpit 현장 팁 (Location Field Tips)
 */

export type FieldTipCategory =
  | 'parking' // 무료 주차 / 주차 정보
  | 'pickup' // 픽업 위치 / 승하차 거점
  | 'large_vehicle' // 대형차 진입 / 차고 제한 (스프린터 등)
  | 'traffic_warning' // 주정차 유의 / 단속 구역
  | 'other'; // 기타 현장 팁

export type FieldTipBadgeIcon =
  | 'parking_p' // Blue P square
  | 'pin' // Blue location pin
  | 'truck' // Blue delivery truck/van
  | 'ban' // Red ban/no-parking circle
  | 'lightbulb'; // Blue lightbulb

export interface FieldTipDetailRow {
  iconType: 'clock' | 'won' | 'car' | 'file' | 'mapPin' | 'alert' | 'truck' | 'phone';
  label: string; // e.g. "무료 시간", "추가 요금", "적용 구역", "참고 사항"
  value: string; // e.g. "30분 무료"
  bullets?: string[]; // e.g. ["승객 픽업 시 10분까지 무료", "장기 대기 시 장기주차장 이용 권장", "최신 요금은 현장 확인 필요"]
}

export interface FieldTipItem {
  id: string;
  category: FieldTipCategory;
  title: string; // e.g. "무료 주차 30분"
  subtitle: string; // e.g. "기사 제보 · 공식 확인 필요"
  badgeIconType: FieldTipBadgeIcon;
  badgeBgColor?: string; // e.g. "bg-[#1E60F3]" or "bg-red-500" or "bg-blue-50"
  badgeTextColor?: string;
  badgeLetter?: string; // e.g. "P"
  details?: {
    rows: FieldTipDetailRow[];
    verificationNote?: string; // e.g. "기사 제보 · 호텔 공식 확인 필요"
    verifiedDate?: string; // e.g. "2024.10.15"
  };
}

export interface PlaceFieldTips {
  id: string;
  placeName: string; // e.g. "조선팰리스 강남"
  address: string; // e.g. "서울 강남구 테헤란로 231"
  imageUrl?: string;
  lat?: number;
  lng?: number;
  tips: FieldTipItem[];
}
