export type HqDrivingLogStatus = '검토 대기' | '검토 중' | '승인 완료' | '보완 필요' | '반려';

export interface HqDrivingLogStop {
  id: string;
  time: string; // e.g. "08:00"
  place: string; // e.g. "서울 강남구 출근 / 차고지 출발"
  note?: string; // e.g. "고객 픽업", "고객 이동", "업무 미팅 대기", "고객 하차"
  address?: string;
  passenger?: string;
}

export interface HqDrivingLogReviewAudit {
  id: string;
  time: string; // e.g. "10/24 08:30"
  message: string; // e.g. "김민수 기사가 운행일지를 제출했습니다."
  actor: string; // e.g. "김민수" | "관리자"
  actionType: 'submission' | 'review_start' | 'approved' | 'revision_requested' | 'rejected';
}

export interface HqDrivingLog {
  id: string;
  no: number;
  submittedAt: string; // e.g. "10/24 08:30"
  submittedDate: string; // e.g. "2024. 10. 24 (목)"
  drivingDate: string; // e.g. "10/24"
  rawDate: string; // e.g. "2024-10-24"
  driverName: string; // e.g. "김민수"
  customerName: string; // e.g. "호텔신라"
  vehicleModel: string; // e.g. "S클래스 8920"
  vehiclePlate: string; // e.g. "서울 12가 8920"
  clockIn: string; // e.g. "08:00"
  clockOut: string; // e.g. "20:00"
  totalDutyHours: string; // e.g. "12시간 12분"
  startKm: string; // e.g. "12,430"
  endKm: string; // e.g. "12,710"
  distanceKm: string; // e.g. "280 km"
  expenseAmount: number; // e.g. 212000
  expenseCount: number; // e.g. 3
  status: HqDrivingLogStatus;
  stops: HqDrivingLogStop[];
  notes: string;
  reviewHistory: HqDrivingLogReviewAudit[];
  isDriverSubmitted?: boolean;
}
