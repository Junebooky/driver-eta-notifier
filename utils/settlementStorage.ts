/**
 * Storage & State Management for Event Settlement Reports, Temporary Pricing Presets,
 * Driver Labor Profiles, and Client/Admin Report Exports.
 */

import {
  CustomerContractTerms,
  DriverProfilePreset,
  EventSettlementReport,
  SettlementReportStatus,
  VatHandlingMode,
  VehiclePricingPreset,
} from '@/types/settlementHq';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import { getHqExpensesSnapshot } from '@/utils/expenseHqStorage';
import {
  buildEventSettlementReport,
  DEFAULT_DRIVER_PROFILES,
  DEFAULT_VEHICLE_PRICING_PRESETS,
} from '@/utils/settlementCalculator';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { HqBooking } from '@/types/hq';

export const SETTLEMENT_REPORTS_STORAGE_KEY = 'cockpit_hq_settlement_reports_v2';
export const VEHICLE_PRESETS_STORAGE_KEY = 'cockpit_hq_vehicle_presets_v2';
export const DRIVER_PROFILES_STORAGE_KEY = 'cockpit_hq_driver_profiles_v2';
export const SETTLEMENT_UPDATE_EVENT = 'cockpit_settlement_updated';

function buildSeedSettlementReports(
  vehiclePresets: VehiclePricingPreset[] = DEFAULT_VEHICLE_PRICING_PRESETS,
  driverProfiles: DriverProfilePreset[] = DEFAULT_DRIVER_PROFILES
): EventSettlementReport[] {
  const chanel = INITIAL_HQ_CUSTOMERS.find((c) => c.id === 'cust-chanel') || INITIAL_HQ_CUSTOMERS[0];
  const bmw = INITIAL_HQ_CUSTOMERS.find((c) => c.id === 'cust-bmw') || INITIAL_HQ_CUSTOMERS[2];
  const ferrari = INITIAL_HQ_CUSTOMERS.find((c) => c.id === 'cust-ferrari') || INITIAL_HQ_CUSTOMERS[4];
  const samsung = INITIAL_HQ_CUSTOMERS.find((c) => c.id === 'cust-samsung') || INITIAL_HQ_CUSTOMERS[6];
  const shinsegae = INITIAL_HQ_CUSTOMERS.find((c) => c.id === 'cust-shinsegae') || INITIAL_HQ_CUSTOMERS[5];

  const allExpenses = getHqExpensesSnapshot();

  // 1. CHANEL Cruise Collection VIP 의전 (복수 차량: Sprinter 519 CDI + Sprinter 319 CDI + S 560)
  // 1호차: 차고지 08:00 -> 고객사 서비스 시작 09:00 ~ 종료 21:50 (12시간 50분, 기본 10시간, 초과 2시간 50분)
  const chanelBookings: HqBooking[] = [
    {
      id: 'b-chanel-1',
      bookingNo: '#261022-001',
      no: 1,
      customerName: 'CHANEL',
      customerId: 'cust-chanel',
      pickupDate: '2026. 10. 22',
      pickupTime: '09:00',
      pickupLocation: '조선팰리스 서울 강남',
      destination: '성수동 크루즈 컬렉션 전시장',
      driverName: '정태훈',
      driverPhone: '010-5542-1928',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '703서 2658',
      dispatchStatus: '운행 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      groupId: 'grp-chanel-cruise',
      groupName: '2026 CHANEL Cruise Collection Preview',
      groupTotalVehicles: 3,
      groupVehicleIndex: 1,
      requestedLanguage: 'ko',
      serviceMode: 'with_driver',
      notes: '글로벌 본사 총괄 디렉터 및 스태프 탑승. 행사 종료 후 만찬장 경유.',
    },
    {
      id: 'b-chanel-2',
      bookingNo: '#261022-002',
      no: 2,
      customerName: 'CHANEL',
      customerId: 'cust-chanel',
      pickupDate: '2026. 10. 22',
      pickupTime: '09:30',
      pickupLocation: '인천공항 T2 CIP 라운지',
      destination: '조선팰리스 서울 강남',
      driverName: '최영식',
      driverPhone: '010-2341-9876',
      vehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
      vehiclePlate: '125호 9982',
      dispatchStatus: '운행 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      groupId: 'grp-chanel-cruise',
      groupName: '2026 CHANEL Cruise Collection Preview',
      groupTotalVehicles: 3,
      groupVehicleIndex: 2,
      requestedLanguage: 'en',
      serviceMode: 'with_driver',
      notes: '해외 VIP 프레스 그룹 영어 의전 수행 완료.',
    },
    {
      id: 'b-chanel-3',
      bookingNo: '#261022-003',
      no: 3,
      customerName: 'CHANEL',
      customerId: 'cust-chanel',
      pickupDate: '2026. 10. 22',
      pickupTime: '09:00',
      pickupLocation: '조선팰리스 서울 강남',
      destination: '성수동 크루즈 컬렉션 전시장',
      driverName: '김민수',
      driverPhone: '010-3829-4821',
      vehicleModel: '벤츠 S560',
      vehiclePlate: '01호 3343',
      dispatchStatus: '운행 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      groupId: 'grp-chanel-cruise',
      groupName: '2026 CHANEL Cruise Collection Preview',
      groupTotalVehicles: 3,
      groupVehicleIndex: 3,
      requestedLanguage: 'en',
      serviceMode: 'with_driver',
      notes: '수석 디자이너 VIP 전담 의전.',
    },
  ];

  const chanelLogs: HqDrivingLog[] = [
    {
      id: 'log-chanel-1',
      no: 101,
      submittedAt: '10/22 22:50',
      submittedDate: '2026. 10. 22 (목)',
      drivingDate: '10/22',
      rawDate: '2026-10-22',
      driverName: '정태훈',
      customerName: 'CHANEL',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '703서 2658',
      clockIn: '08:00',
      clockOut: '22:40',
      totalDutyHours: '14시간 40분',
      garageDepartureTime: '08:00',
      customerServiceStart: '09:00',
      customerServiceEnd: '21:50',
      garageArrivalTime: '22:40',
      startKm: '42,100',
      endKm: '42,310',
      distanceKm: '210 km',
      expenseAmount: 38000,
      expenseCount: 1,
      status: '승인 완료',
      stops: [
        { id: 'cs1', time: '08:00', place: '강남 차고지 차량 픽업 / 출발' },
        { id: 'cs2', time: '09:00', place: '조선팰리스 서울 강남', note: '고객 픽업 (고객사 서비스 시작)' },
        { id: 'cs3', time: '14:00', place: '성수동 크루즈 전시장', note: '행사 대기 및 스태프 이동' },
        { id: 'cs4', time: '21:50', place: '조선팰리스 서울 강남', note: '고객 하차 (고객사 서비스 종료)' },
        { id: 'cs5', time: '22:40', place: '강남 차고지 입고 / 업무 종료' },
      ],
      notes: '차고지 픽업(08:00~09:00) 제외, 실제 고객사 서비스 09:00~21:50 (총 12시간 50분, 초과 2시간 50분) 수행.',
      reviewHistory: [],
    },
    {
      id: 'log-chanel-2',
      no: 102,
      submittedAt: '10/22 20:30',
      submittedDate: '2026. 10. 22 (목)',
      drivingDate: '10/22',
      rawDate: '2026-10-22',
      driverName: '최영식',
      customerName: 'CHANEL',
      vehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
      vehiclePlate: '125호 9982',
      clockIn: '08:30',
      clockOut: '20:20',
      totalDutyHours: '11시간 50분',
      garageDepartureTime: '08:30',
      customerServiceStart: '09:30',
      customerServiceEnd: '19:30',
      garageArrivalTime: '20:20',
      startKm: '18,400',
      endKm: '18,640',
      distanceKm: '240 km',
      expenseAmount: 24000,
      expenseCount: 1,
      status: '승인 완료',
      stops: [
        { id: 'cs2-1', time: '08:30', place: '차고지 출발' },
        { id: 'cs2-2', time: '09:30', place: '인천공항 T2', note: '고객 픽업' },
        { id: 'cs2-3', time: '19:30', place: '조선팰리스 강남', note: '고객 하차' },
        { id: 'cs2-4', time: '20:20', place: '차고지 복귀' },
      ],
      notes: '해외 VIP 프레스 영어 안내 및 정시 운행 완료 (기본 10시간 내 종료).',
      reviewHistory: [],
    },
    {
      id: 'log-chanel-3',
      no: 103,
      submittedAt: '10/22 20:00',
      submittedDate: '2026. 10. 22 (목)',
      drivingDate: '10/22',
      rawDate: '2026-10-22',
      driverName: '김민수',
      customerName: 'CHANEL',
      vehicleModel: '벤츠 S560',
      vehiclePlate: '01호 3343',
      clockIn: '08:00',
      clockOut: '19:50',
      totalDutyHours: '11시간 50분',
      garageDepartureTime: '08:00',
      customerServiceStart: '09:00',
      customerServiceEnd: '19:00',
      garageArrivalTime: '19:50',
      startKm: '12,430',
      endKm: '12,590',
      distanceKm: '160 km',
      expenseAmount: 18600,
      expenseCount: 2,
      status: '승인 완료',
      stops: [],
      notes: 'VIP 전담 영어 의전 정상 종료.',
      reviewHistory: [],
    },
  ];

  const report1 = buildEventSettlementReport({
    id: 'rep-chanel-cruise-2026',
    reportNo: 'SET-261022-001',
    customer: chanel,
    eventName: '2026 CHANEL Cruise Collection Preview 의전',
    eventDate: '2026. 10. 22 (목)',
    location: '조선팰리스 서울 강남 · 성수동 전시장',
    bookings: chanelBookings,
    drivingLogs: chanelLogs,
    expenses: allExpenses.filter((e) => e.customerId === 'cust-chanel' || e.customerName === 'CHANEL'),
    orderingAgency: '제일기획 (Cheil Worldwide)',
    billingTarget: 'ordering_agency',
    billingTargetName: '제일기획 귀하 (최종브랜드: CHANEL)',
    status: 'approved',
    adminNotes: '1호차(Sprinter 519 CDI) 고객사 서비스 시간 12시간 50분(09:00~21:50), 차고지 픽업(08:00) 제외 검증 완료.',
    vehiclePresets,
    driverProfiles,
  });

  // 2. BMW Korea M8 미디어 시승회 (Sprinter 519 CDI 1대 단독 검증: 800,000원 청구 - 한국어 기사 150,000원 = 650,000원 직접이익)
  const bmwBookings: HqBooking[] = [
    {
      id: 'b-bmw-1',
      bookingNo: '#261024-001',
      no: 1,
      customerName: 'BMW Korea',
      customerId: 'cust-bmw',
      pickupDate: '2026. 10. 24',
      pickupTime: '09:00',
      pickupLocation: '서울 웨스틴조선호텔',
      destination: '영종도 BMW 드라이빙 센터',
      driverName: '정태훈',
      driverPhone: '010-5542-1928',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '70호 3864',
      dispatchStatus: '운행 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      requestedLanguage: 'ko',
      serviceMode: 'with_driver',
      notes: 'Sprinter 519 CDI 기사 포함(800,000원) · 한국어 기사 기본 인건비(150,000원) 기준 정산.',
    },
  ];

  const bmwLogs: HqDrivingLog[] = [
    {
      id: 'log-bmw-1',
      no: 104,
      submittedAt: '10/24 19:45',
      submittedDate: '2026. 10. 24 (토)',
      drivingDate: '10/24',
      rawDate: '2026-10-24',
      driverName: '정태훈',
      customerName: 'BMW Korea',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '70호 3864',
      clockIn: '08:00',
      clockOut: '19:40',
      totalDutyHours: '11시간 40분',
      garageDepartureTime: '08:00',
      customerServiceStart: '09:00',
      customerServiceEnd: '19:00',
      garageArrivalTime: '19:40',
      startKm: '31,200',
      endKm: '31,420',
      distanceKm: '220 km',
      expenseAmount: 0,
      expenseCount: 0,
      status: '승인 완료',
      stops: [],
      notes: '기본 10시간(09:00~19:00) 서비스 정시 종료.',
      reviewHistory: [],
    },
  ];

  const report2 = buildEventSettlementReport({
    id: 'rep-bmw-m8-2026',
    reportNo: 'SET-261024-002',
    customer: bmw,
    eventName: 'BMW M8 First Edition VIP Driving Experience',
    eventDate: '2026. 10. 24 (토)',
    location: '영종도 BMW 드라이빙 센터',
    bookings: bmwBookings,
    drivingLogs: bmwLogs,
    expenses: [],
    billingTarget: 'end_brand',
    billingTargetName: 'BMW 코리아 귀하',
    status: 'reviewing',
    adminNotes: 'Sprinter 519 CDI 기사 포함 800,000원 - 한국어 기사 인건비 150,000원 = 650,000원 직접이익 검증 건.',
    vehiclePresets,
    driverProfiles,
  });

  // 3. Ferrari Esperienza Corsa (일반차량 G90L 영어 기사 150,000원 + 스타리아 한국어 기사 100,000원)
  const ferrariBookings: HqBooking[] = [
    {
      id: 'b-ferrari-1',
      bookingNo: '#261020-001',
      no: 1,
      customerName: 'Ferrari',
      customerId: 'cust-ferrari',
      pickupDate: '2026. 10. 20',
      pickupTime: '08:30',
      pickupLocation: '그랜드 하얏트 서울',
      destination: '인제 스피디움 서킷',
      driverName: '박서연',
      driverPhone: '010-7281-9304',
      vehicleModel: '제네시스 G90L',
      vehiclePlate: '208호 2269',
      dispatchStatus: '운행 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      groupId: 'grp-ferrari-2026',
      groupName: 'Ferrari Esperienza Corsa 2026',
      groupTotalVehicles: 2,
      groupVehicleIndex: 1,
      requestedLanguage: 'en',
      serviceMode: 'with_driver',
      notes: '이탈리아 본사 임원 영어 의전 (일반차량 영어 기사 인건비 150,000원 적용).',
    },
    {
      id: 'b-ferrari-2',
      bookingNo: '#261020-002',
      no: 2,
      customerName: 'Ferrari',
      customerId: 'cust-ferrari',
      pickupDate: '2026. 10. 20',
      pickupTime: '08:30',
      pickupLocation: '그랜드 하얏트 서울',
      destination: '인제 스피디움 서킷',
      driverName: '이재훈',
      driverPhone: '010-9182-3746',
      vehicleModel: '현대 스타리아 리무진',
      vehiclePlate: '125호 7665',
      dispatchStatus: '운행 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      groupId: 'grp-ferrari-2026',
      groupName: 'Ferrari Esperienza Corsa 2026',
      groupTotalVehicles: 2,
      groupVehicleIndex: 2,
      requestedLanguage: 'ko',
      serviceMode: 'with_driver',
      notes: '운영진 및 장비 이동 (일반차량 한국어 기사 인건비 100,000원 적용).',
    },
  ];

  const ferrariLogs: HqDrivingLog[] = [
    {
      id: 'log-ferrari-1',
      no: 105,
      submittedAt: '10/20 20:10',
      submittedDate: '2026. 10. 20 (화)',
      drivingDate: '10/20',
      rawDate: '2026-10-20',
      driverName: '박서연',
      customerName: 'Ferrari',
      vehicleModel: '제네시스 G90L',
      vehiclePlate: '208호 2269',
      clockIn: '07:30',
      clockOut: '20:00',
      totalDutyHours: '12시간 30분',
      garageDepartureTime: '07:30',
      customerServiceStart: '08:30',
      customerServiceEnd: '18:30',
      garageArrivalTime: '20:00',
      startKm: '21,000',
      endKm: '21,340',
      distanceKm: '340 km',
      expenseAmount: 85000,
      expenseCount: 1,
      status: '승인 완료',
      stops: [],
      notes: '인제 스피디움 왕복 의전 완료.',
      reviewHistory: [],
    },
    {
      id: 'log-ferrari-2',
      no: 106,
      submittedAt: '10/20 20:15',
      submittedDate: '2026. 10. 20 (화)',
      drivingDate: '10/20',
      rawDate: '2026-10-20',
      driverName: '이재훈',
      customerName: 'Ferrari',
      vehicleModel: '현대 스타리아 리무진',
      vehiclePlate: '125호 7665',
      clockIn: '07:30',
      clockOut: '20:00',
      totalDutyHours: '12시간 30분',
      garageDepartureTime: '07:30',
      customerServiceStart: '08:30',
      customerServiceEnd: '18:30',
      garageArrivalTime: '20:00',
      startKm: '35,100',
      endKm: '35,440',
      distanceKm: '340 km',
      expenseAmount: 0,
      expenseCount: 0,
      status: '승인 완료',
      stops: [],
      notes: '스타리아 리무진 행사 지원 완료.',
      reviewHistory: [],
    },
  ];

  const report3 = buildEventSettlementReport({
    id: 'rep-ferrari-corsa-2026',
    reportNo: 'SET-261020-003',
    customer: ferrari,
    eventName: 'Ferrari Esperienza Corsa 2026 VIP 의전',
    eventDate: '2026. 10. 20 (화)',
    location: '인제 스피디움 서킷',
    bookings: ferrariBookings,
    drivingLogs: ferrariLogs,
    expenses: allExpenses.filter((e) => e.customerId === 'cust-ferrari' || e.customerName === 'Ferrari'),
    orderingAgency: '이노션 (INNOCEAN)',
    billingTarget: 'ordering_agency',
    billingTargetName: '이노션 귀하 (최종브랜드: Ferrari)',
    status: 'invoiced',
    adminNotes: '일반차량(G90L, 스타리아) 기사 인건비 스프린터 대비 50,000원 차감 기준(영어 15만 / 한국어 10만) 적용.',
    vehiclePresets,
    driverProfiles,
  });

  // 4. 삼성전자 글로벌 포럼 (차량만 대여 Sprinter 519 CDI 600,000원 & 기사 인건비 0원 검증)
  const samsungBookings: HqBooking[] = [
    {
      id: 'b-samsung-1',
      bookingNo: '#261025-001',
      no: 1,
      customerName: '삼성전자',
      customerId: 'cust-samsung',
      pickupDate: '2026. 10. 25',
      pickupTime: '08:00',
      pickupLocation: '삼성전자 서초사옥',
      destination: '수원 디지털시티',
      driverName: '-',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '71두 3338',
      dispatchStatus: '운행 완료',
      driverAck: '-',
      customerBrochure: '발송됨',
      requestedLanguage: 'ko',
      serviceMode: 'vehicle_only',
      notes: '차량만 대여(Vehicle Only) — 600,000원 청구, 기사 인건비 자동 부과 안 함(0원).',
    },
  ];

  const report4 = buildEventSettlementReport({
    id: 'rep-samsung-forum-2026',
    reportNo: 'SET-261025-004',
    customer: samsung,
    eventName: '삼성 글로벌 테크 포럼 차량 대여',
    eventDate: '2026. 10. 25 (일)',
    location: '삼성전자 서초사옥 · 수원 디지털시티',
    bookings: samsungBookings,
    drivingLogs: [],
    expenses: [],
    billingTarget: 'end_brand',
    billingTargetName: '삼성전자 귀하',
    status: 'approved',
    adminNotes: '차량만 대여(Sprinter 519 CDI 600,000원) 선택 시 기사 인건비 미부과(0원) 검증 완료.',
    vehiclePresets,
    driverProfiles,
  });

  // 5. 신세계 VIP 인비테이셔널 (요금 미등록 차종 테스트 — 임의 금액 생성 방지 검증)
  const shinsegaeBookings: HqBooking[] = [
    {
      id: 'b-ssg-1',
      bookingNo: '#261026-099',
      no: 1,
      customerName: '신세계그룹',
      customerId: 'cust-shinsegae',
      pickupDate: '2026. 10. 26',
      pickupTime: '10:00',
      pickupLocation: '신세계 본점',
      destination: '트리니티 클럽 CC',
      driverName: '윤태준',
      driverPhone: '010-8842-1920',
      vehicleModel: '특수 방탄 의전차량 (요금 미등록)',
      vehiclePlate: '999호 0001',
      dispatchStatus: '배차 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      requestedLanguage: 'en',
      serviceMode: 'with_driver',
      notes: '요금 미등록 차종 배차 시 임의 금액을 생성하지 않고 관리자 확인 필요 상태로 유지.',
    },
  ];

  const report5 = buildEventSettlementReport({
    id: 'rep-shinsegae-unregistered',
    reportNo: 'SET-261026-005',
    customer: shinsegae,
    eventName: '신세계 VIP 인비테이셔널 특별 의전 (단가 미등록 확인용)',
    eventDate: '2026. 10. 26 (월)',
    location: '신세계 본점 · 트리니티 클럽',
    bookings: shinsegaeBookings,
    drivingLogs: [],
    expenses: [],
    billingTarget: 'end_brand',
    billingTargetName: '신세계그룹 귀하',
    status: 'draft',
    adminNotes: '미등록 차량 배차 건 — 관리자 단가 확정 대기 중.',
    vehiclePresets,
    driverProfiles,
  });

  return [report1, report2, report3, report4, report5];
}

// In-memory caches for useSyncExternalStore
let cachedReports: EventSettlementReport[] | null = null;
let cachedVehiclePresets: VehiclePricingPreset[] | null = null;
let cachedDriverProfiles: DriverProfilePreset[] | null = null;
const serverFallbackReports: EventSettlementReport[] = buildSeedSettlementReports();

function emitSettlementChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SETTLEMENT_UPDATE_EVENT));
  }
}

export function getVehiclePresetsSnapshot(): VehiclePricingPreset[] {
  if (typeof window === 'undefined') return DEFAULT_VEHICLE_PRICING_PRESETS;
  if (cachedVehiclePresets) return cachedVehiclePresets;
  try {
    const raw = localStorage.getItem(VEHICLE_PRESETS_STORAGE_KEY);
    if (raw) {
      cachedVehiclePresets = JSON.parse(raw);
      return cachedVehiclePresets!;
    }
  } catch (err) {
    console.error('Failed to read vehicle presets:', err);
  }
  cachedVehiclePresets = DEFAULT_VEHICLE_PRICING_PRESETS;
  return cachedVehiclePresets;
}

export function saveVehiclePresets(presets: VehiclePricingPreset[]): void {
  cachedVehiclePresets = presets;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(VEHICLE_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch (err) {
      console.error('Failed to save vehicle presets:', err);
    }
  }
  emitSettlementChange();
}

export function getDriverProfilesSnapshot(): DriverProfilePreset[] {
  if (typeof window === 'undefined') return DEFAULT_DRIVER_PROFILES;
  if (cachedDriverProfiles) return cachedDriverProfiles;
  try {
    const raw = localStorage.getItem(DRIVER_PROFILES_STORAGE_KEY);
    if (raw) {
      cachedDriverProfiles = JSON.parse(raw);
      return cachedDriverProfiles!;
    }
  } catch (err) {
    console.error('Failed to read driver profiles:', err);
  }
  cachedDriverProfiles = DEFAULT_DRIVER_PROFILES;
  return cachedDriverProfiles;
}

export function saveDriverProfiles(profiles: DriverProfilePreset[]): void {
  cachedDriverProfiles = profiles;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(DRIVER_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch (err) {
      console.error('Failed to save driver profiles:', err);
    }
  }
  emitSettlementChange();
}

export function getSettlementReportsSnapshot(): EventSettlementReport[] {
  if (typeof window === 'undefined') return serverFallbackReports;
  if (cachedReports) return cachedReports;
  try {
    const raw = localStorage.getItem(SETTLEMENT_REPORTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedReports = parsed;
        return cachedReports!;
      }
    }
  } catch (err) {
    console.error('Failed to read settlement reports:', err);
  }
  cachedReports = buildSeedSettlementReports(
    getVehiclePresetsSnapshot(),
    getDriverProfilesSnapshot()
  );
  return cachedReports;
}

export function getSettlementReportsServerSnapshot(): EventSettlementReport[] {
  return serverFallbackReports;
}

export function saveSettlementReports(reports: EventSettlementReport[]): void {
  cachedReports = reports;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SETTLEMENT_REPORTS_STORAGE_KEY, JSON.stringify(reports));
    } catch (err) {
      console.error('Failed to save settlement reports:', err);
    }
  }
  emitSettlementChange();
}

export function updateSettlementReportStatus(
  reportId: string,
  newStatus: SettlementReportStatus,
  adminNotes?: string
): EventSettlementReport | null {
  const reports = getSettlementReportsSnapshot();
  let updatedItem: EventSettlementReport | null = null;

  const next = reports.map((r) => {
    if (r.id !== reportId) return r;
    updatedItem = {
      ...r,
      status: newStatus,
      adminNotes: adminNotes !== undefined ? adminNotes : r.adminNotes,
      approvedBy:
        newStatus === 'approved' || newStatus === 'invoiced' ? '본사 정산 관리자' : r.approvedBy,
      approvedAt:
        newStatus === 'approved' || newStatus === 'invoiced'
          ? new Date().toLocaleString('ko-KR')
          : r.approvedAt,
      profitConfirmStatus:
        newStatus === 'approved' || newStatus === 'invoiced' ? 'confirmed' : r.profitConfirmStatus,
    };
    return updatedItem;
  });

  saveSettlementReports(next);
  return updatedItem;
}

export function updateSettlementReportContractTerms(
  reportId: string,
  terms: CustomerContractTerms,
  vatMode?: VatHandlingMode
): EventSettlementReport | null {
  const reports = getSettlementReportsSnapshot();
  const target = reports.find((r) => r.id === reportId);
  if (!target) return null;

  // Recalculate vehicles with the updated event/customer contract terms
  const updatedVehicles = target.vehicles.map((v) => {
    const baseHours = terms.baseHours || 10;
    const baseMinutes = baseHours * 60;
    const overtimeMinutes = Math.max(0, v.customerServiceMinutes - baseMinutes);

    const unit = terms.roundingUnitMinutes || 30;
    let billedOvertimeHours = 0;
    if (overtimeMinutes > 0) {
      if (terms.roundingMethod === 'exact') {
        billedOvertimeHours = overtimeMinutes / 60;
      } else if (terms.roundingMethod === 'floor') {
        billedOvertimeHours = (Math.floor(overtimeMinutes / unit) * unit) / 60;
      } else if (terms.roundingMethod === 'round') {
        billedOvertimeHours = (Math.round(overtimeMinutes / unit) * unit) / 60;
      } else {
        billedOvertimeHours = (Math.ceil(overtimeMinutes / unit) * unit) / 60;
      }
    }

    const baseFare =
      v.serviceMode === 'vehicle_only' && terms.vehicleOnlyRate !== undefined
        ? terms.vehicleOnlyRate
        : terms.baseRate;

    const hasOvertimeRate =
      typeof terms.overtimeHourlyRate === 'number' && terms.overtimeHourlyRate > 0;
    const overtimeFare =
      overtimeMinutes > 0 && hasOvertimeRate
        ? Math.round(billedOvertimeHours * (terms.overtimeHourlyRate || 0))
        : 0;

    const vehicleFareSubtotal = baseFare + overtimeFare;
    const clientTotalRevenue = vehicleFareSubtotal + v.approvedExpensesTotal;
    const totalDirectCost = v.driverLaborCost + v.vehicleDirectCost + v.otherDirectCost;
    const directProfit = clientTotalRevenue - totalDirectCost;
    const directMarginPercent =
      clientTotalRevenue > 0 ? Number(((directProfit / clientTotalRevenue) * 100).toFixed(2)) : 0;

    return {
      ...v,
      pricingSource: terms.pricingSource || 'customer_contract',
      isTemporaryPreset: Boolean(terms.isTemporaryPreset),
      baseContractHours: baseHours,
      overtimeMinutes,
      billedOvertimeHours,
      billedOvertimeFormatted:
        overtimeMinutes > 0
          ? hasOvertimeRate
            ? `${billedOvertimeHours.toFixed(1).replace(/\.0$/, '')}시간 (${unit}분 단위)`
            : '초과요율 미등록 (관리자 확인 필요)'
          : '0시간',
      baseFare,
      overtimeFare,
      isOvertimeRateConfirmed: hasOvertimeRate || overtimeMinutes === 0,
      vehicleFareSubtotal,
      hasContractTerms: baseFare > 0,
      contractWarning: undefined,
      clientTotalRevenue,
      directProfit,
      directMarginPercent,
    };
  });

  const totalBaseFare = updatedVehicles.reduce((s, v) => s + v.baseFare, 0);
  const totalOvertimeFare = updatedVehicles.reduce((s, v) => s + v.overtimeFare, 0);
  const totalVehicleFare = updatedVehicles.reduce((s, v) => s + v.vehicleFareSubtotal, 0);
  const supplyAmount = totalVehicleFare + target.totalApprovedExpenses;
  const effectiveVatMode = vatMode || terms.vatMode || target.vatMode;
  const vatAmount = effectiveVatMode === 'excluded' ? Math.round(supplyAmount * 0.1) : 0;
  const grandTotal = supplyAmount + vatAmount;
  const totalDirectProfit = supplyAmount - target.totalDirectCost;
  const averageDirectMarginPercent =
    supplyAmount > 0 ? Number(((totalDirectProfit / supplyAmount) * 100).toFixed(2)) : 0;

  const updatedReport: EventSettlementReport = {
    ...target,
    pricingSource: terms.pricingSource || 'customer_contract',
    isTemporaryPreset: Boolean(terms.isTemporaryPreset),
    vatMode: effectiveVatMode,
    contractTerms: terms,
    contractWarning: terms.isTemporaryPreset
      ? '임시 요금 프리셋 적용 중'
      : undefined,
    vehicles: updatedVehicles,
    totalBaseFare,
    totalOvertimeFare,
    totalVehicleFare,
    supplyAmount,
    vatAmount,
    grandTotal,
    totalDirectProfit,
    averageDirectMarginPercent,
  };

  const next = reports.map((r) => (r.id === reportId ? updatedReport : r));
  saveSettlementReports(next);
  return updatedReport;
}

export function subscribeSettlementReports(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(SETTLEMENT_UPDATE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(SETTLEMENT_UPDATE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/**
 * Generate Client-Facing Settlement CSV (고객사 전달용 Excel/CSV)
 * CRITICAL SECURITY RULE:
 * - 절대 기사 내부 인건비(driverLaborCost), 회사 마진, 직접이익(directProfit), 수익률(directMarginPercent)을 포함하지 않는다!
 * - 오직 고객사 청구금액과 서비스 실적(차량, 기사명, 고객사 서비스 시작/종료, 초과시간, 차량요금, 승인된 실비 영수증)만 포함한다.
 */
export function exportClientSettlementCsv(report: EventSettlementReport): string {
  const lines: string[] = [];
  lines.push('=== VIP LIMOUSINE KOREA 고객사 운행 정산 및 청구 명세서 ===');
  lines.push(`리포트 번호,${report.reportNo}`);
  lines.push(`행사명,${report.eventName}`);
  lines.push(`발주 고객사,${report.orderingAgency || report.customerName}`);
  lines.push(`최종 브랜드,${report.endBrand}`);
  lines.push(`실제 청구 대상,${report.billingTargetName}`);
  lines.push(`행사 일자,${report.eventDate}`);
  lines.push(`정산 상태,${report.status === 'approved' || report.status === 'invoiced' ? '검토·승인 완료' : '검토 중 (초안)'}`);
  lines.push('');
  lines.push('[1. 차량별 고객사 서비스 시간 및 운행 요금 명세]');
  lines.push('호차,차량모델(제조사제외),차량번호,담당기사,서비스구분,고객서비스시작,고객서비스종료,총서비스시간,기본계약시간,초과시간,기본요금(원),초과요금(원),차량청구소계(원),비고');

  report.vehicles.forEach((v) => {
    lines.push(
      [
        `${v.vehicleIndex}호차`,
        `"${v.vehicleModel}"`,
        `"${v.vehiclePlate}"`,
        `"${v.driverName}"`,
        v.serviceMode === 'vehicle_only' ? '차량만 대여' : '기사 포함',
        v.customerServiceStart,
        v.customerServiceEnd,
        `"${v.customerServiceFormatted}"`,
        `${v.baseContractHours}시간`,
        `"${v.overtimeFormatted}"`,
        v.baseFare,
        v.overtimeFare,
        v.vehicleFareSubtotal,
        `"${(v.notes || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
  });

  lines.push('');
  lines.push('[2. 관리자 승인 완료 실비 경비 내역]');
  lines.push('호차,일자,구분,가맹점,금액(원),승인상태');
  report.vehicles.forEach((v) => {
    v.expenses
      .filter((e) => e.status === '승인 완료' && e.billableToCustomer !== false)
      .forEach((e) => {
        lines.push(
          [
            `${v.vehicleIndex}호차`,
            e.submittedDate,
            e.categoryLabel,
            `"${e.merchant}"`,
            e.amount,
            e.status,
          ].join(',')
        );
      });
  });

  lines.push('');
  lines.push('[3. 최종 청구 금액 요약]');
  lines.push(`차량 기본요금 합계,${report.totalBaseFare}`);
  lines.push(`초과시간 요금 합계,${report.totalOvertimeFare}`);
  lines.push(`승인 실비경비 합계,${report.totalApprovedExpenses}`);
  lines.push(`공급가액 합계,${report.supplyAmount}`);
  lines.push(
    `부가세(VAT),${
      report.vatMode === 'excluded'
        ? report.vatAmount
        : report.vatMode === 'included'
        ? '공급가액에 포함'
        : '별도 확인 (미포함)'
    }`
  );
  lines.push(`최종 청구 합계,${report.grandTotal}`);

  return lines.join('\n');
}

/**
 * Generate Internal Admin Profitability CSV (본사 관리자 전용 수익성 분석 Excel/CSV)
 * Includes full driver labor costs, direct costs, and direct profit margins.
 */
export function exportAdminProfitabilityCsv(report: EventSettlementReport): string {
  const lines: string[] = [];
  lines.push('=== [본사 내부용 - 대외비] 배차별 매출·기사 인건비·직접이익 분석 보고서 ===');
  lines.push(`리포트 번호,${report.reportNo},행사명,"${report.eventName}"`);
  lines.push(`고객사,"${report.customerName}",적용단가유형,${report.isTemporaryPreset ? '임시 요금 프리셋(예상)' : '확정 계약 단가'}`);
  lines.push('주의사항,"본 표의 배차별 직접이익은 차량유지비/보험료/본사간접비 차감 전 금액이며 최종 영업이익이나 순이익이 아닙니다."');
  lines.push('');
  lines.push('호차,차량모델,차량번호,기사명,언어자격,고객사매출(원),기사인건비(원),차량직접비(원),기타직접비(원),배차별직접이익(원),직접이익률(%),수익확정여부');

  report.vehicles.forEach((v) => {
    lines.push(
      [
        `${v.vehicleIndex}호차`,
        `"${v.vehicleModel}"`,
        `"${v.vehiclePlate}"`,
        `"${v.driverName}"`,
        v.driverIsEnglishVerified ? '영어가능(검증)' : '한국어',
        v.clientTotalRevenue,
        v.driverLaborCost,
        v.vehicleDirectCost,
        v.otherDirectCost,
        v.directProfit,
        `${v.directMarginPercent}%`,
        v.profitConfirmStatus === 'confirmed' ? '확정 직접이익' : '잠정 수익(예상)',
      ].join(',')
    );
  });

  lines.push('');
  lines.push(
    `합계,,,,-,${report.supplyAmount},${report.totalDriverLaborCost},${report.totalVehicleDirectCost},${report.totalOtherDirectCost},${report.totalDirectProfit},${report.averageDirectMarginPercent}%,${
      report.profitConfirmStatus === 'confirmed' ? '확정' : '잠정(예상)'
    }`
  );

  return lines.join('\n');
}
