/**
 * VIP LIMOUSINE KOREA - Field Knowledge (현장 지식) Types
 */

export type FieldKnowledgeCategory =
  | '전체'
  | '공항'
  | '호텔'
  | '식당'
  | '쇼핑'
  | '교통'
  | '긴급'
  | '기타';

export interface FieldKnowledgeItem {
  id: string;
  title: string; // 장소명 (e.g. '조선팰리스 강남', '인천공항 T2')
  subtitle?: string; // 서브 카피 (e.g. '차량 진입 안내', '미팅포인트 안내')
  category: '공항' | '호텔' | '식당' | '쇼핑' | '교통' | '긴급' | '기타';
  categoryBadge?: string;
  description: string; // 한 줄 설명 (e.g. '품격과 여유가 흐르는 도심 속 럭셔리 호텔')
  imageUrl: string; // 대표 이미지 URL
  photos?: string[]; // 사진 갤러리 이미지 URLs
  address: string; // 주소
  phone?: string; // 대표전화
  website?: string; // 공식 웹사이트
  freeParkingNotice?: string; // 무료회차 안내
  sprinterWaiting?: string; // 벤츠 스프린터 대기 가능 구역
  restroomLocation?: string; // 기사/승객 화장실 위치
  pickupLocationNotes?: string; // 픽업/하차 상세 위치
  vehicleWaitingNotes?: string; // 차량 대기 구역 및 주차 팁
  cautionNotes?: string; // 주정차 주의사항 및 단속 정보
  additionalNotes?: string; // 추가 정보 (공사, 행사, 발렛 등)
  updatedAt: string;
  updatedBy?: string;
}
