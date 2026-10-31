import { HqDrivingLog, HqDrivingLogStatus } from '@/types/drivingLogHq';
import { getHqExpenses } from '@/utils/expenseHqStorage';

export const HQ_DRIVING_LOGS_STORAGE_KEY = 'cockpit_submitted_driving_logs_v1';
export const HQ_LOGS_UPDATE_EVENT = 'cockpit_driving_log_updated';

// 18 Initial Mock Driving Logs matching Image 1 exactly
export const INITIAL_HQ_DRIVING_LOGS: HqDrivingLog[] = [
  {
    id: 'log-01',
    no: 1,
    submittedAt: '10/24 08:30',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '김민수',
    customerName: '호텔신라',
    vehicleModel: '벤츠 S560',
    vehiclePlate: '01호 3343',
    clockIn: '08:00',
    clockOut: '20:00',
    totalDutyHours: '12시간 12분',
    startKm: '12,430',
    endKm: '12,710',
    distanceKm: '280 km',
    expenseAmount: 212000,
    expenseCount: 3,
    status: '검토 대기',
    stops: [
      { id: 's1', time: '08:00', place: '서울 강남구 출근 / 차고지 출발' },
      { id: 's2', time: '09:10', place: '호텔신라 (서울 중구)', note: '고객 픽업' },
      { id: 's3', time: '11:30', place: '인천국제공항 제1터미널', note: '고객 이동' },
      { id: 's4', time: '15:20', place: '서울 신라호텔', note: '업무 미팅 대기' },
      { id: 's5', time: '18:40', place: '서울 강남구', note: '고객 하차' },
      { id: 's6', time: '20:00', place: '차고지 도착 / 업무 종료' },
    ],
    notes: '인천공항 이동 시 교통 정체로 인해 20분 지연되었습니다.\n고객 요청으로 중간 경유지에서 추가 대기 30분이 발생했습니다.',
    reviewHistory: [
      { id: 'h1', time: '10/24 08:30', message: '김민수 기사가 운행일지를 제출했습니다.', actor: '김민수', actionType: 'submission' },
      { id: 'h2', time: '10/24 10:12', message: '관리자 검토가 시작되었습니다.', actor: '관리자', actionType: 'review_start' },
      { id: 'h3', time: '10/24 10:25', message: '추가 경비내역 확인이 필요하여 보완 요청을 보냈습니다.', actor: '관리자', actionType: 'revision_requested' },
    ],
  },
  {
    id: 'log-02',
    no: 2,
    submittedAt: '10/24 08:15',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '이재훈',
    customerName: '삼성전자',
    vehicleModel: '제네시스 G90',
    vehiclePlate: '125호 8839',
    clockIn: '09:10',
    clockOut: '18:30',
    totalDutyHours: '9시간 20분',
    startKm: '8,210',
    endKm: '8,455',
    distanceKm: '245 km',
    expenseAmount: 156000,
    expenseCount: 2,
    status: '승인 완료',
    stops: [
      { id: 's2-1', time: '09:10', place: '강남 차고지 출발' },
      { id: 's2-2', time: '10:00', place: '삼성전자 서초사옥', note: '임원 픽업' },
      { id: 's2-3', time: '11:45', place: '수원 삼성 디지털시티', note: '회의 이동' },
      { id: 's2-4', time: '16:30', place: '서초사옥 복귀', note: '임원 하차' },
      { id: 's2-5', time: '18:30', place: '차고지 입고 / 업무 종료' },
    ],
    notes: '특이사항 없음. 정상 운행 완료.',
    reviewHistory: [
      { id: 'h2-1', time: '10/24 08:15', message: '이재훈 기사가 운행일지를 제출했습니다.', actor: '이재훈', actionType: 'submission' },
      { id: 'h2-2', time: '10/24 09:00', message: '관리자 승인 완료 처리되었습니다.', actor: '관리자', actionType: 'approved' },
    ],
  },
  {
    id: 'log-03',
    no: 3,
    submittedAt: '10/24 09:12',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '박서연',
    customerName: '현대자동차',
    vehicleModel: '기아 카니발 리무진',
    vehiclePlate: '101호 7681',
    clockIn: '07:50',
    clockOut: '19:20',
    totalDutyHours: '11시간 30분',
    startKm: '15,870',
    endKm: '16,190',
    distanceKm: '320 km',
    expenseAmount: 180000,
    expenseCount: 4,
    status: '검토 중',
    stops: [
      { id: 's3-1', time: '07:50', place: '판교 차고지 출발' },
      { id: 's3-2', time: '08:30', place: '현대차 양재사옥', note: '외빈 픽업' },
      { id: 's3-3', time: '10:30', place: '남양 기술연구소', note: '외빈 시찰' },
      { id: 's3-4', time: '16:00', place: '그랜드하얏트 서울', note: '호텔 배웅' },
      { id: 's3-5', time: '19:20', place: '차고지 복귀' },
    ],
    notes: '우천으로 서해안고속도로 구간 서행 운행하였습니다.',
    reviewHistory: [
      { id: 'h3-1', time: '10/24 09:12', message: '박서연 기사가 운행일지를 제출했습니다.', actor: '박서연', actionType: 'submission' },
      { id: 'h3-2', time: '10/24 10:00', message: '관리자가 검토 중입니다.', actor: '관리자', actionType: 'review_start' },
    ],
  },
  {
    id: 'log-04',
    no: 4,
    submittedAt: '10/24 10:05',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '정태호',
    customerName: 'SK하이닉스',
    vehicleModel: '벤츠 스프린터 519 CDI',
    vehiclePlate: '703서 2658',
    clockIn: '08:30',
    clockOut: '21:10',
    totalDutyHours: '12시간 40분',
    startKm: '25,100',
    endKm: '25,620',
    distanceKm: '520 km',
    expenseAmount: 320000,
    expenseCount: 5,
    status: '승인 완료',
    stops: [
      { id: 's4-1', time: '08:30', place: '차고지 출발' },
      { id: 's4-2', time: '09:20', place: 'SK하이닉스 이천캠퍼스', note: '임원단 6인 탑승' },
      { id: 's4-3', time: '13:00', place: '청주캠퍼스', note: '공장 현장 방문' },
      { id: 's4-4', time: '18:30', place: '서울 워커힐 호텔', note: '석식 행사' },
      { id: 's4-5', time: '21:10', place: '차고지 입고 완료' },
    ],
    notes: '장거리 운행 안전 수칙 준수, 전원 안전벨트 착용 확인.',
    reviewHistory: [
      { id: 'h4-1', time: '10/24 10:05', message: '정태호 기사가 운행일지를 제출했습니다.', actor: '정태호', actionType: 'submission' },
      { id: 'h4-2', time: '10/24 10:40', message: '관리자 승인 완료 처리되었습니다.', actor: '관리자', actionType: 'approved' },
    ],
  },
  {
    id: 'log-05',
    no: 5,
    submittedAt: '10/24 10:22',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '이호준',
    customerName: 'LG전자',
    vehicleModel: '제네시스 G90L',
    vehiclePlate: '208호 2269',
    clockIn: '09:00',
    clockOut: '18:00',
    totalDutyHours: '9시간 0분',
    startKm: '11,330',
    endKm: '11,580',
    distanceKm: '250 km',
    expenseAmount: 145000,
    expenseCount: 2,
    status: '보완 필요',
    stops: [
      { id: 's5-1', time: '09:00', place: '여의도 차고지 출발' },
      { id: 's5-2', time: '09:30', place: 'LG트윈타워', note: '고객 픽업' },
      { id: 's5-3', time: '11:00', place: '마곡 LG사이언스파크', note: 'R&D 미팅' },
      { id: 's5-4', time: '16:00', place: '여의도 복귀', note: '고객 하차' },
      { id: 's5-5', time: '18:00', place: '차고지 입고' },
    ],
    notes: '주유 영수증 사진 해상도가 낮아 재촬영 제출 요청 대기.',
    reviewHistory: [
      { id: 'h5-1', time: '10/24 10:22', message: '이호준 기사가 운행일지를 제출했습니다.', actor: '이호준', actionType: 'submission' },
      { id: 'h5-2', time: '10/24 10:50', message: '주유 영수증 확인이 필요하여 보완 요청되었습니다.', actor: '관리자', actionType: 'revision_requested' },
    ],
  },
  {
    id: 'log-06',
    no: 6,
    submittedAt: '10/24 11:18',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '김도현',
    customerName: '포스코',
    vehicleModel: '기아 카니발 하이리무진',
    vehiclePlate: '193호 5336',
    clockIn: '08:20',
    clockOut: '19:40',
    totalDutyHours: '11시간 20분',
    startKm: '9,440',
    endKm: '9,760',
    distanceKm: '320 km',
    expenseAmount: 168000,
    expenseCount: 3,
    status: '검토 대기',
    stops: [
      { id: 's6-1', time: '08:20', place: '강남 차고지' },
      { id: 's6-2', time: '09:00', place: '포스코센터', note: 'VIP 승차' },
      { id: 's6-3', time: '12:00', place: '송도 포스코 R&D', note: '기술 미팅' },
      { id: 's6-4', time: '17:30', place: '포스코센터 복귀', note: 'VIP 하차' },
      { id: 's6-5', time: '19:40', place: '차고지 종료' },
    ],
    notes: '유류 충전 50L 완료, 세차 완료.',
    reviewHistory: [
      { id: 'h6-1', time: '10/24 11:18', message: '김도현 기사가 운행일지를 제출했습니다.', actor: '김도현', actionType: 'submission' },
    ],
  },
  {
    id: 'log-07',
    no: 7,
    submittedAt: '10/24 12:03',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '최민수',
    customerName: '네이버',
    vehicleModel: '벤츠 S560',
    vehiclePlate: '01호 3343',
    clockIn: '07:40',
    clockOut: '22:10',
    totalDutyHours: '14시간 30분',
    startKm: '18,220',
    endKm: '18,760',
    distanceKm: '540 km',
    expenseAmount: 410000,
    expenseCount: 6,
    status: '승인 완료',
    stops: [
      { id: 's7-1', time: '07:40', place: '성남 차고지' },
      { id: 's7-2', time: '08:30', place: '네이버 1784', note: '고객 픽업' },
      { id: 's7-3', time: '12:30', place: '춘천 네이버 데이터센터 각', note: '현장 실사' },
      { id: 's7-4', time: '19:00', place: '분당 1784 복귀', note: '고객 하차' },
      { id: 's7-5', time: '22:10', place: '차고지 입고' },
    ],
    notes: '초과근무 사전 승인 완료 건.',
    reviewHistory: [
      { id: 'h7-1', time: '10/24 12:03', message: '최민수 기사가 운행일지를 제출했습니다.', actor: '최민수', actionType: 'submission' },
      { id: 'h7-2', time: '10/24 13:00', message: '관리자 승인 완료 처리되었습니다.', actor: '관리자', actionType: 'approved' },
    ],
  },
  {
    id: 'log-08',
    no: 8,
    submittedAt: '10/24 13:41',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '한지민',
    customerName: '카카오',
    vehicleModel: '제네시스 GV80',
    vehiclePlate: '203호 5947',
    clockIn: '09:30',
    clockOut: '18:10',
    totalDutyHours: '8시간 40분',
    startKm: '6,120',
    endKm: '6,340',
    distanceKm: '220 km',
    expenseAmount: 132000,
    expenseCount: 2,
    status: '검토 중',
    stops: [
      { id: 's8-1', time: '09:30', place: '판교 아지트 차고지' },
      { id: 's8-2', time: '10:00', place: '카카오 판교아지트', note: '임원 탑승' },
      { id: 's8-3', time: '11:30', place: '서울 중구 을지로', note: '금융사 제휴 미팅' },
      { id: 's8-4', time: '15:00', place: '강남 테헤란로', note: '파트너사 미팅' },
      { id: 's8-5', time: '18:10', place: '판교아지트 하차 후 차고지' },
    ],
    notes: '정상 운행, 통행료 하이패스 정산 완료.',
    reviewHistory: [
      { id: 'h8-1', time: '10/24 13:41', message: '한지민 기사가 운행일지를 제출했습니다.', actor: '한지민', actionType: 'submission' },
    ],
  },
  {
    id: 'log-09',
    no: 9,
    submittedAt: '10/24 14:23',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '오세훈',
    customerName: '롯데호텔',
    vehicleModel: '벤츠 스프린터 319 CDI',
    vehiclePlate: '700호 1458',
    clockIn: '08:10',
    clockOut: '20:50',
    totalDutyHours: '12시간 40분',
    startKm: '21,050',
    endKm: '21,460',
    distanceKm: '410 km',
    expenseAmount: 298000,
    expenseCount: 4,
    status: '승인 완료',
    stops: [
      { id: 's9-1', time: '08:10', place: '소공동 차고지' },
      { id: 's9-2', time: '08:50', place: '롯데호텔 서울', note: 'VIP 단체 픽업' },
      { id: 's9-3', time: '10:30', place: '인천 영종도 인스파이어', note: '행사 지원' },
      { id: 's9-4', time: '18:00', place: '시그니엘 서울', note: 'VIP 이동' },
      { id: 's9-5', time: '20:50', place: '차고지 복귀' },
    ],
    notes: '생수 및 물티슈 비품 충전 완료.',
    reviewHistory: [
      { id: 'h9-1', time: '10/24 14:23', message: '오세훈 기사가 운행일지를 제출했습니다.', actor: '오세훈', actionType: 'submission' },
      { id: 'h9-2', time: '10/24 15:10', message: '관리자 승인 완료 처리되었습니다.', actor: '관리자', actionType: 'approved' },
    ],
  },
  {
    id: 'log-10',
    no: 10,
    submittedAt: '10/24 15:02',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '김영호',
    customerName: '신세계',
    vehicleModel: '현대 스타리아 리무진',
    vehiclePlate: '125호 7665',
    clockIn: '09:00',
    clockOut: '17:30',
    totalDutyHours: '8시간 30분',
    startKm: '14,880',
    endKm: '15,120',
    distanceKm: '240 km',
    expenseAmount: 126000,
    expenseCount: 2,
    status: '검토 대기',
    stops: [
      { id: 's10-1', time: '09:00', place: '반포 차고지' },
      { id: 's10-2', time: '09:40', place: '신세계백화점 강남점', note: 'VIP 케어' },
      { id: 's10-3', time: '13:00', place: '신세계 본점 명동', note: '쇼핑 동선 이동' },
      { id: 's10-4', time: '16:30', place: '조선팰리스 호텔', note: '배웅 완료' },
      { id: 's10-5', time: '17:30', place: '차고지 입고' },
    ],
    notes: '차량 내부 청소 및 살균 소독 완료.',
    reviewHistory: [
      { id: 'h10-1', time: '10/24 15:02', message: '김영호 기사가 운행일지를 제출했습니다.', actor: '김영호', actionType: 'submission' },
    ],
  },
  {
    id: 'log-11',
    no: 11,
    submittedAt: '10/24 16:18',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '박지훈',
    customerName: 'CJ제일제당',
    vehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
    vehiclePlate: '125호 9982',
    clockIn: '08:00',
    clockOut: '19:10',
    totalDutyHours: '11시간 10분',
    startKm: '16,500',
    endKm: '16,910',
    distanceKm: '410 km',
    expenseAmount: 260000,
    expenseCount: 4,
    status: '보완 필요',
    stops: [
      { id: 's11-1', time: '08:00', place: '동대문 차고지' },
      { id: 's11-2', time: '08:45', place: 'CJ제일제당 본사', note: '바이어 픽업' },
      { id: 's11-3', time: '11:00', place: 'CJ블로썸파크 수원', note: '연구소 시찰' },
      { id: 's11-4', time: '17:00', place: '그랜드워커힐', note: '투숙 안내' },
      { id: 's11-5', time: '19:10', place: '차고지 입고' },
    ],
    notes: '고속도로 통행료 영수증 일부 누락 건으로 재확인 요청.',
    reviewHistory: [
      { id: 'h11-1', time: '10/24 16:18', message: '박지훈 기사가 운행일지를 제출했습니다.', actor: '박지훈', actionType: 'submission' },
      { id: 'h11-2', time: '10/24 16:40', message: '통행료 내역 확인 필요로 보완 요청을 보냈습니다.', actor: '관리자', actionType: 'revision_requested' },
    ],
  },
  {
    id: 'log-12',
    no: 12,
    submittedAt: '10/24 17:05',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '이수현',
    customerName: '한화그룹',
    vehicleModel: '제네시스 G90 리무진',
    vehiclePlate: '102부 4280',
    clockIn: '08:30',
    clockOut: '22:00',
    totalDutyHours: '13시간 30분',
    startKm: '19,330',
    endKm: '19,880',
    distanceKm: '550 km',
    expenseAmount: 385000,
    expenseCount: 5,
    status: '검토 대기',
    stops: [
      { id: 's12-1', time: '08:30', place: '장교동 차고지' },
      { id: 's12-2', time: '09:00', place: '한화빌딩', note: '고객 픽업' },
      { id: 's12-3', time: '12:00', place: '한화 대전사업장', note: '경영 회의' },
      { id: 's12-4', time: '19:30', place: '서울 한남동', note: '고객 귀가' },
      { id: 's12-5', time: '22:00', place: '차고지 도착' },
    ],
    notes: '야간 귀가 시 도로 결빙 주의하여 안전 운전 실시.',
    reviewHistory: [
      { id: 'h12-1', time: '10/24 17:05', message: '이수현 기사가 운행일지를 제출했습니다.', actor: '이수현', actionType: 'submission' },
    ],
  },
  {
    id: 'log-13',
    no: 13,
    submittedAt: '10/24 17:40',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '강태우',
    customerName: '아모레퍼시픽',
    vehicleModel: '현대 스타리아 리무진',
    vehiclePlate: '142호 8407',
    clockIn: '08:00',
    clockOut: '18:40',
    totalDutyHours: '10시간 40분',
    startKm: '22,100',
    endKm: '22,390',
    distanceKm: '290 km',
    expenseAmount: 175000,
    expenseCount: 3,
    status: '검토 대기',
    stops: [
      { id: 's13-1', time: '08:00', place: '용산 차고지' },
      { id: 's13-2', time: '08:40', place: '아모레퍼시픽 본사', note: '해외 임원 탑승' },
      { id: 's13-3', time: '10:30', place: '오산 뷰티파크', note: '공장 투어' },
      { id: 's13-4', time: '16:30', place: '포시즌스 호텔 서울', note: '하차 완료' },
      { id: 's13-5', time: '18:40', place: '차고지 입고' },
    ],
    notes: '정상 운행 완료. 비품 체크 완료.',
    reviewHistory: [
      { id: 'h13-1', time: '10/24 17:40', message: '강태우 기사가 운행일지를 제출했습니다.', actor: '강태우', actionType: 'submission' },
    ],
  },
  {
    id: 'log-14',
    no: 14,
    submittedAt: '10/24 18:15',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '조성민',
    customerName: '두산에너빌리티',
    vehicleModel: '현대 스타리아 리무진',
    vehiclePlate: '125호 9037',
    clockIn: '09:00',
    clockOut: '20:00',
    totalDutyHours: '11시간 0분',
    startKm: '17,450',
    endKm: '17,810',
    distanceKm: '360 km',
    expenseAmount: 210000,
    expenseCount: 3,
    status: '승인 완료',
    stops: [
      { id: 's14-1', time: '09:00', place: '동대문 두산타워' },
      { id: 's14-2', time: '10:00', place: '분당 두산타워', note: '경영진 탑승' },
      { id: 's14-3', time: '14:00', place: '평택 원전 부품 공장', note: '실사 지원' },
      { id: 's14-4', time: '18:30', place: '분당 복귀', note: '하차 완료' },
      { id: 's14-5', time: '20:00', place: '차고지 입고' },
    ],
    notes: '비즈니스 정숙 주행 요청 준수.',
    reviewHistory: [
      { id: 'h14-1', time: '10/24 18:15', message: '조성민 기사가 운행일지를 제출했습니다.', actor: '조성민', actionType: 'submission' },
      { id: 'h14-2', time: '10/24 18:50', message: '관리자 승인 완료 처리되었습니다.', actor: '관리자', actionType: 'approved' },
    ],
  },
  {
    id: 'log-15',
    no: 15,
    submittedAt: '10/24 18:50',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '임재원',
    customerName: '쿠팡',
    vehicleModel: '벤츠 스프린터 519 CDI',
    vehiclePlate: '70호 3864',
    clockIn: '08:30',
    clockOut: '19:30',
    totalDutyHours: '11시간 0분',
    startKm: '31,200',
    endKm: '31,640',
    distanceKm: '440 km',
    expenseAmount: 310000,
    expenseCount: 4,
    status: '검토 대기',
    stops: [
      { id: 's15-1', time: '08:30', place: '잠실 차고지' },
      { id: 's15-2', time: '09:10', place: '쿠팡 잠실타워', note: '글로벌 엔지니어링팀 7인 탑승' },
      { id: 's15-3', time: '11:00', place: '덕평 물류센터', note: '자동화 물류 시찰' },
      { id: 's15-4', time: '17:00', place: '잠실타워 복귀', note: '하차' },
      { id: 's15-5', time: '19:30', place: '차고지 입고' },
    ],
    notes: '외국인 승객 영어 안내 지원.',
    reviewHistory: [
      { id: 'h15-1', time: '10/24 18:50', message: '임재원 기사가 운행일지를 제출했습니다.', actor: '임재원', actionType: 'submission' },
    ],
  },
  {
    id: 'log-16',
    no: 16,
    submittedAt: '10/24 19:10',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '배성훈',
    customerName: '엔씨소프트',
    vehicleModel: '벤츠 스프린터 519 CDI',
    vehiclePlate: '71두 3338',
    clockIn: '09:00',
    clockOut: '18:20',
    totalDutyHours: '9시간 20분',
    startKm: '13,100',
    endKm: '13,330',
    distanceKm: '230 km',
    expenseAmount: 115000,
    expenseCount: 2,
    status: '승인 완료',
    stops: [
      { id: 's16-1', time: '09:00', place: '판교 차고지' },
      { id: 's16-2', time: '09:40', place: '엔씨소프트 R&D센터', note: '고객 픽업' },
      { id: 's16-3', time: '11:30', place: '서울 삼성동 코엑스', note: '지스타 비즈니스 미팅' },
      { id: 's16-4', time: '16:30', place: '판교 R&D센터 복귀', note: '고객 하차' },
      { id: 's16-5', time: '18:20', place: '차고지 복귀' },
    ],
    notes: '정상 운행.',
    reviewHistory: [
      { id: 'h16-1', time: '10/24 19:10', message: '배성훈 기사가 운행일지를 제출했습니다.', actor: '배성훈', actionType: 'submission' },
      { id: 'h16-2', time: '10/24 19:35', message: '관리자 승인 완료 처리되었습니다.', actor: '관리자', actionType: 'approved' },
    ],
  },
  {
    id: 'log-17',
    no: 17,
    submittedAt: '10/24 19:40',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '송민규',
    customerName: '하이브',
    vehicleModel: '벤츠 스프린터 519 CDI',
    vehiclePlate: '73호 2553',
    clockIn: '08:30',
    clockOut: '21:30',
    totalDutyHours: '13시간 0분',
    startKm: '20,400',
    endKm: '20,850',
    distanceKm: '450 km',
    expenseAmount: 290000,
    expenseCount: 4,
    status: '검토 대기',
    stops: [
      { id: 's17-1', time: '08:30', place: '용산 차고지' },
      { id: 's17-2', time: '09:15', place: '하이브 용산사옥', note: 'VIP 탑승' },
      { id: 's17-3', time: '11:00', place: '인천국제공항 T2', note: '해외 프로듀서 픽업' },
      { id: 's17-4', time: '15:00', place: '강남 스튜디오', note: '레코딩 일정' },
      { id: 's17-5', time: '20:30', place: '파크하얏트 서울', note: '투숙 안내' },
      { id: 's17-6', time: '21:30', place: '차고지 도착' },
    ],
    notes: '보안 서약 준수 및 프라이버시 커튼 유지.',
    reviewHistory: [
      { id: 'h17-1', time: '10/24 19:40', message: '송민규 기사가 운행일지를 제출했습니다.', actor: '송민규', actionType: 'submission' },
    ],
  },
  {
    id: 'log-18',
    no: 18,
    submittedAt: '10/24 20:15',
    submittedDate: '2024. 10. 24 (목)',
    drivingDate: '10/24',
    rawDate: '2024-10-24',
    driverName: '권도현',
    customerName: '크래프톤',
    vehicleModel: '현대 스타리아 리무진',
    vehiclePlate: '116허 1514',
    clockIn: '09:20',
    clockOut: '19:00',
    totalDutyHours: '9시간 40분',
    startKm: '10,800',
    endKm: '11,040',
    distanceKm: '240 km',
    expenseAmount: 140000,
    expenseCount: 2,
    status: '검토 대기',
    stops: [
      { id: 's18-1', time: '09:20', place: '역삼 차고지' },
      { id: 's18-2', time: '09:50', place: '크래프톤 역삼 오피스', note: 'VIP 탑승' },
      { id: 's18-3', time: '11:20', place: '판교 크래프톤 타워', note: '이사회 이동' },
      { id: 's18-4', time: '17:00', place: '역삼 오피스 복귀', note: '하차 완료' },
      { id: 's18-5', time: '19:00', place: '차고지 입고' },
    ],
    notes: '정상 운행 완료. 차량 세차 완료.',
    reviewHistory: [
      { id: 'h18-1', time: '10/24 20:15', message: '권도현 기사가 운행일지를 제출했습니다.', actor: '권도현', actionType: 'submission' },
    ],
  },
];

let memoryDrivingLogs: HqDrivingLog[] = [];

export const saveHqDrivingLogs = (logs: HqDrivingLog[]): void => {
  memoryDrivingLogs = logs;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(HQ_DRIVING_LOGS_STORAGE_KEY, JSON.stringify(logs));
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(HQ_LOGS_UPDATE_EVENT, { detail: { count: logs.length } }));
      }
    } catch (e) {
      console.warn('Failed to save HQ driving logs to localStorage:', e);
    }
  }
};

/**
 * Get all HQ driving logs, merged with user-submitted driver logs and synced with driver expenses
 */
export const getHqDrivingLogs = (): HqDrivingLog[] => {
  if(typeof window==='undefined')return memoryDrivingLogs;
  try{const raw=localStorage.getItem(HQ_DRIVING_LOGS_STORAGE_KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch{return [];}
};

let cachedLogsRaw = '';
let cachedLogsSnapshot: HqDrivingLog[] = [];

export const subscribeHqDrivingLogs = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(HQ_LOGS_UPDATE_EVENT, callback);
  window.addEventListener('cockpit_hq_expense_updated', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(HQ_LOGS_UPDATE_EVENT, callback);
    window.removeEventListener('cockpit_hq_expense_updated', callback);
    window.removeEventListener('storage', callback);
  };
};

export const getHqDrivingLogsSnapshot = (): HqDrivingLog[] => {
  if (typeof window === 'undefined') return memoryDrivingLogs;
  try {
    const raw = localStorage.getItem(HQ_DRIVING_LOGS_STORAGE_KEY) || '';
    if (raw === cachedLogsRaw) return cachedLogsSnapshot;
    const synced = getHqDrivingLogs();
    cachedLogsRaw = localStorage.getItem(HQ_DRIVING_LOGS_STORAGE_KEY) || '';
    cachedLogsSnapshot = synced;
    return cachedLogsSnapshot;
  } catch {
    return memoryDrivingLogs;
  }
};

export const getHqDrivingLogsServerSnapshot = (): HqDrivingLog[] => {
  return memoryDrivingLogs;
};

/**
 * Save driver-submitted log from Cockpit to HQ driving logs list
 * Supports multiple events on the same day by the same driver via distinct bookingId/eventId (Scenario D-4)
 */
export const submitDriverLogToHq = (newLog: Partial<HqDrivingLog>): HqDrivingLog => {
  const currentLogs = getHqDrivingLogs();
  const now = new Date();
  const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateStr = `${now.getFullYear()}. ${String(now.getMonth() + 1).padStart(2, '0')}. ${String(now.getDate()).padStart(2, '0')}`;

  const targetDriver = newLog.driverName || '윤태준';
  const targetPlate = newLog.vehiclePlate || '116허 1514';

  // Automatically lookup driver expenses if not explicitly provided
  let expenseAmount = newLog.expenseAmount || 0;
  let expenseCount = newLog.expenseCount || 0;

  if (expenseAmount === 0) {
    try {
      const expenses = getHqExpenses().filter((e) => {
        if (newLog.bookingId && e.bookingId) {
          return e.bookingId === newLog.bookingId;
        }
        if (newLog.bookingId && !e.bookingId) return false;
        return (
          e.driverName === targetDriver ||
          (Boolean(targetPlate) && e.vehiclePlate === targetPlate)
        );
      });
      if (expenses.length > 0) {
        expenseAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
        expenseCount = expenses.length;
      }
    } catch {
      // ignore
    }
  }

  const fullLog: HqDrivingLog = {
    id: newLog.id || `driver-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    no: 1, // Will re-index below
    submittedAt: newLog.submittedAt || timeStr,
    submittedDate: newLog.submittedDate || dateStr,
    drivingDate:
      newLog.drivingDate ||
      `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`,
    rawDate: newLog.rawDate || now.toISOString().split('T')[0],
    driverName: targetDriver,
    customerName: newLog.customerName || '인터코스',
    customerId: newLog.customerId,
    bookingId: newLog.bookingId,
    eventId: newLog.eventId,
    vehicleModel: newLog.vehicleModel || '현대 스타리아 리무진',
    vehiclePlate: targetPlate,
    clockIn: newLog.clockIn || '06:40',
    clockOut: newLog.clockOut || '21:50',
    garageDepartureTime: newLog.garageDepartureTime,
    customerServiceStart: newLog.customerServiceStart,
    customerServiceEnd: newLog.customerServiceEnd,
    garageArrivalTime: newLog.garageArrivalTime,
    totalDutyHours: newLog.totalDutyHours || '15시간 10분',
    startKm: newLog.startKm || '154,725',
    endKm: newLog.endKm || '154,861',
    distanceKm: newLog.distanceKm || '136 km',
    expenseAmount,
    expenseCount,
    status: newLog.status || '검토 대기',
    stops:
      newLog.stops !== undefined
        ? newLog.stops
        : [
            { id: 'd-1', time: '07:00', place: '차고지' },
            { id: 'd-2', time: '08:50', place: '메리어트 호텔' },
            { id: 'd-3', time: '09:50', place: '판교 오피스' },
            { id: 'd-4', time: '11:25', place: '메리어트 호텔' },
            { id: 'd-5', time: '13:30', place: '판교 오피스' },
            { id: 'd-6', time: '17:05', place: '강남 올리브영' },
            { id: 'd-7', time: '21:30', place: '메리어트 호텔' },
            { id: 'd-8', time: '21:45', place: '차고지' },
          ],
    notes: newLog.notes || '',
    reviewHistory: newLog.reviewHistory || [
      {
        id: `h-init-${Date.now()}`,
        time: timeStr,
        message: `${targetDriver} 기사가 운행일지를 제출했습니다.${expenseAmount > 0 ? ` (경비: ${expenseAmount.toLocaleString()}원)` : ''}`,
        actor: targetDriver,
        actionType: 'submission',
      },
    ],
    isDriverSubmitted: true,
  };

  // Replace only if exact id or exact bookingId matches; allow same driver to have multiple logs for different bookings/events
  const updatedLogs = [
    fullLog,
    ...currentLogs.filter((l) => {
      if (l.id === fullLog.id) return false;
      if (fullLog.bookingId && l.bookingId && l.bookingId === fullLog.bookingId) return false;
      if (!fullLog.bookingId && !l.bookingId && l.driverName === targetDriver && l.rawDate === fullLog.rawDate) {
        return false;
      }
      return true;
    }),
  ].map((item, idx) => ({
    ...item,
    no: idx + 1,
  }));

  saveHqDrivingLogs(updatedLogs);
  return fullLog;
};

/**
 * Update Driving Log fields (e.g., customerServiceStart, customerServiceEnd, stops, vehiclePlate, driverName)
 */
export const updateHqDrivingLog = (
  logId: string,
  patch: Partial<HqDrivingLog>,
  actor: string = '본사 관리자'
): HqDrivingLog | null => {
  const currentLogs = getHqDrivingLogs();
  const index = currentLogs.findIndex((l) => l.id === logId);
  if (index === -1) return null;

  const now = new Date();
  const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const existing = currentLogs[index];
  const updatedLog: HqDrivingLog = {
    ...existing,
    ...patch,
    reviewHistory: [
      {
        id: `audit-edit-${Date.now()}`,
        time: timeStr,
        message: `${actor}가 운행일지 데이터를 수정했습니다.`,
        actor,
        actionType: 'submission',
      },
      ...(existing.reviewHistory || []),
    ],
  };

  const nextLogs = [...currentLogs];
  nextLogs[index] = updatedLog;
  saveHqDrivingLogs(nextLogs);
  return updatedLog;
};

/**
 * Update Driving Log status (Approve, Request Revision, Reject)
 */
export const updateHqDrivingLogStatus = (
  logId: string,
  newStatus: HqDrivingLogStatus,
  reason?: string,
  actor: string = '관리자'
): HqDrivingLog[] => {
  const currentLogs = getHqDrivingLogs();
  const now = new Date();
  const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let actionType: 'approved' | 'revision_requested' | 'rejected' = 'approved';
  let message = `관리자(${actor})가 승인 완료 처리했습니다.`;

  if (newStatus === '보완 필요') {
    actionType = 'revision_requested';
    message = reason ? `보완 요청: ${reason}` : '추가 확인이 필요하여 보완 요청을 보냈습니다.';
  } else if (newStatus === '반려') {
    actionType = 'rejected';
    message = reason ? `반려 사유: ${reason}` : '관리자에 의해 반려 처리되었습니다.';
  } else if (newStatus === '승인 완료') {
    actionType = 'approved';
    message = '검토 후 승인 완료되었습니다.';
  }

  const updatedLogs = currentLogs.map((log) => {
    if (log.id !== logId) return log;

    const newAudit = {
      id: `audit-${Date.now()}`,
      time: timeStr,
      message,
      actor,
      actionType,
    };

    return {
      ...log,
      status: newStatus,
      reviewHistory: [newAudit, ...log.reviewHistory],
    };
  });

  saveHqDrivingLogs(updatedLogs);
  return updatedLogs;
};

/**
 * Export logs to CSV file with UTF-8 BOM for Microsoft Excel compatibility
 */
export const exportDrivingLogsToCsv = (logs: HqDrivingLog[]) => {
  if (typeof window === 'undefined' || logs.length === 0) return;

  const headers = [
    'No.',
    '제출일시',
    '운행일',
    '기사명',
    '고객명',
    '차량모델',
    '차량번호',
    '출근시간',
    '퇴근시간',
    '총근무시간',
    '시작km',
    '종료km',
    '운행합',
    '경비지출(원)',
    '경비건수',
    '상태',
    '운행경로_일정수',
    '운행경로_상세',
    '특이사항',
  ];

  const escapeCsv = (str: string | number | undefined | null) => {
    if (str === undefined || str === null) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = logs.map((log) => {
    const stopsDetail = log.stops
      .map((s) => `${s.time} ${s.place}${s.note ? ` (${s.note})` : ''}`)
      .join(' > ');

    return [
      log.no,
      escapeCsv(log.submittedAt),
      escapeCsv(log.drivingDate),
      escapeCsv(log.driverName),
      escapeCsv(log.customerName),
      escapeCsv(log.vehicleModel),
      escapeCsv(log.vehiclePlate),
      escapeCsv(log.clockIn),
      escapeCsv(log.clockOut),
      escapeCsv(log.totalDutyHours),
      escapeCsv(log.startKm),
      escapeCsv(log.endKm),
      escapeCsv(log.distanceKm),
      log.expenseAmount,
      log.expenseCount,
      escapeCsv(log.status),
      log.stops.length,
      escapeCsv(stopsDetail),
      escapeCsv(log.notes),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  link.setAttribute('download', `VIP_Limousine_운행일지목록_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface FetchHqDrivingLogsResult {
  ok: boolean;
  logs: HqDrivingLog[];
  error?: string;
}

export interface SubmitDriverLogResult {
  ok: boolean;
  log?: HqDrivingLog;
  error?: string;
}

/**
 * Fetch authoritative driving logs directly from Supabase DB via /api/driving-logs
 */
export async function fetchHqDrivingLogsFromDb(): Promise<FetchHqDrivingLogsResult> {
  try {
    const res = await fetch('/api/driving-logs',{cache:'no-store',credentials:'include'});
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && Array.isArray(data.logs)) {
      saveHqDrivingLogs(data.logs);
      return { ok: true, logs: data.logs };
    }
    return { ok: false, logs: [], error: data.error || `서버 응답 오류 (${res.status})` };
  } catch (err: any) {
    return { ok: false, logs: [], error: err.message || '네트워크 오류' };
  }
}

/**
 * Submits driving log to Supabase DB via /api/driving-logs
 */
export async function submitDriverLogToHqDb(newLog: Partial<HqDrivingLog>): Promise<SubmitDriverLogResult> {
  try {
    const res = await fetch('/api/driving-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLog),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.log) {
      saveHqDrivingLogs([data.log,...getHqDrivingLogs().filter(log=>log.id!==data.log.id)]);
      return { ok: true, log: data.log };
    }
    return { ok: false, error: data.error || '운행일지를 서버에 저장하지 못했습니다.' };
  } catch (err: any) {
    return { ok: false, error: err.message || '네트워크 연결 오류' };
  }
}

/**
 * Update driving log status in Supabase DB via /api/driving-logs
 */
export async function updateHqDrivingLogStatusDb(
  logId: string,
  newStatus: HqDrivingLogStatus,
  reason?: string,
  actor: string = '본사 관리자'
): Promise<boolean> {
  try {
    const res = await fetch('/api/driving-logs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: logId, status: newStatus, reviewNotes: reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      updateHqDrivingLogStatus(logId, newStatus, reason, actor);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Update driving log field patch in Supabase DB via /api/driving-logs
 */
export async function updateHqDrivingLogDb(
  logId: string,
  patch: Partial<HqDrivingLog>,
  actor: string = '본사 관리자'
): Promise<boolean> {
  try {
    const res = await fetch('/api/driving-logs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: logId, patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      updateHqDrivingLog(logId, patch, actor);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
