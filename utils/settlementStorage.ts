/**
 * Storage & State Management for Event Settlement Reports, Temporary Pricing Presets,
 * Driver Labor Profiles, and Client/Admin Report Exports.
 */

import {
  CustomerContractTerms,
  DriverProfilePreset,
  EventSettlementReport,
  RequestedDriverLanguage,
  ServiceIncludeMode,
  SettlementReportStatus,
  VatHandlingMode,
  VehiclePricingPreset,
} from '@/types/settlementHq';
import { HqCustomer } from '@/types/customerHq';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import {
  getHqExpenses,
  getHqExpensesSnapshot,
  saveHqExpenses,
  submitDriverExpensesToHq,
  updateHqExpenseRecord,
  updateHqExpenseStatus,
} from '@/utils/expenseHqStorage';
import {
  getHqDrivingLogs,
  saveHqDrivingLogs,
  submitDriverLogToHq,
  updateHqDrivingLog,
} from '@/utils/drivingLogHqStorage';
import {
  buildEventSettlementReport,
  calculateOvertimeAndFare,
  createBookingPricingSnapshot,
  DEFAULT_DRIVER_PROFILES,
  DEFAULT_VEHICLE_PRICING_PRESETS,
} from '@/utils/settlementCalculator';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { HqBooking } from '@/types/hq';

export const SETTLEMENT_REPORTS_STORAGE_KEY = 'cockpit_hq_settlement_reports_v2';
export const VEHICLE_PRESETS_STORAGE_KEY = 'cockpit_hq_vehicle_presets_v2';
export const DRIVER_PROFILES_STORAGE_KEY = 'cockpit_hq_driver_profiles_v2';
export const HQ_BOOKINGS_STORAGE_KEY = 'cockpit_hq_bookings_v2';
export const HQ_CUSTOMERS_STORAGE_KEY = 'cockpit_hq_customers_v2';
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

// In-memory caches for both Browser useSyncExternalStore and Node E2E integration tests
let cachedReports: EventSettlementReport[] | null = null;
let cachedVehiclePresets: VehiclePricingPreset[] | null = null;
let cachedDriverProfiles: DriverProfilePreset[] | null = null;
let cachedBookings: HqBooking[] = [];
let cachedCustomers: HqCustomer[] = [...INITIAL_HQ_CUSTOMERS];
const serverFallbackReports: EventSettlementReport[] = buildSeedSettlementReports();

function emitSettlementChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SETTLEMENT_UPDATE_EVENT));
  }
}

export function getHqCustomersSnapshot(): HqCustomer[] {
  if (typeof window === 'undefined') return cachedCustomers;
  try {
    const raw = localStorage.getItem(HQ_CUSTOMERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedCustomers = parsed;
        return cachedCustomers;
      }
    }
  } catch (err) {
    console.error('Failed to read HQ customers:', err);
  }
  return cachedCustomers;
}

export function saveHqCustomers(customers: HqCustomer[]): void {
  cachedCustomers = customers;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(HQ_CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
    } catch (err) {
      console.error('Failed to save HQ customers:', err);
    }
  }
  emitSettlementChange();
}

export function upsertHqCustomer(customer: HqCustomer): HqCustomer {
  const existing = getHqCustomersSnapshot();
  const idx = existing.findIndex((c) => c.id === customer.id || c.name === customer.name);
  const next =
    idx >= 0
      ? existing.map((c, i) => (i === idx ? { ...c, ...customer } : c))
      : [customer, ...existing];
  saveHqCustomers(next);
  return customer;
}

export function getHqBookingsSnapshot(): HqBooking[] {
  if (typeof window === 'undefined') return cachedBookings;
  try {
    const raw = localStorage.getItem(HQ_BOOKINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedBookings = parsed;
        return cachedBookings;
      }
    }
  } catch (err) {
    console.error('Failed to read HQ bookings:', err);
  }
  return cachedBookings;
}

export function saveHqBookings(bookings: HqBooking[]): void {
  cachedBookings = bookings;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(HQ_BOOKINGS_STORAGE_KEY, JSON.stringify(bookings));
    } catch (err) {
      console.error('Failed to save HQ bookings:', err);
    }
  }
  emitSettlementChange();
}

export function getVehiclePresetsSnapshot(): VehiclePricingPreset[] {
  if (cachedVehiclePresets) return cachedVehiclePresets;
  if (typeof window === 'undefined') return DEFAULT_VEHICLE_PRICING_PRESETS;
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
  if (cachedDriverProfiles) return cachedDriverProfiles;
  if (typeof window === 'undefined') return DEFAULT_DRIVER_PROFILES;
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
  if (cachedReports) return cachedReports;
  if (typeof window === 'undefined') {
    cachedReports = buildSeedSettlementReports(
      getVehiclePresetsSnapshot(),
      getDriverProfilesSnapshot()
    );
    return cachedReports;
  }
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

/**
 * Create or update an EventSettlementReport (invoice draft) from a group of bookings,
 * automatically linking matching driving logs and expenses.
 */
export function upsertEventSettlementFromBookings(params: {
  reportId: string;
  reportNo?: string;
  eventId?: string;
  customer: HqCustomer;
  eventName: string;
  eventDate: string;
  location: string;
  bookings: HqBooking[];
  orderingAgency?: string;
  billingTarget?: 'ordering_agency' | 'end_brand' | 'custom';
  billingTargetName?: string;
  customContractTerms?: CustomerContractTerms;
  vatMode?: VatHandlingMode;
  status?: SettlementReportStatus;
  adminNotes?: string;
  isDemoScenario?: boolean;
  demoScenarioCode?: string;
  areAllDirectCostsConfirmed?: boolean;
}): EventSettlementReport {
  const existingBookings = getHqBookingsSnapshot();
  const bookingIds = new Set(params.bookings.map((b) => b.id));
  const mergedBookings = [
    ...params.bookings,
    ...existingBookings.filter((b) => !bookingIds.has(b.id)),
  ];
  saveHqBookings(mergedBookings);

  const existingReports = getSettlementReportsSnapshot();
  const prevReport = existingReports.find((r) => r.id === params.reportId);

  const built = buildEventSettlementReport({
    id: params.reportId,
    reportNo: params.reportNo || prevReport?.reportNo || `SET-${Date.now().toString().slice(-6)}`,
    eventId: params.eventId || prevReport?.eventId || `ev-${params.reportId}`,
    customer: params.customer,
    eventName: params.eventName,
    eventDate: params.eventDate,
    location: params.location,
    bookings: params.bookings,
    drivingLogs: getHqDrivingLogs(),
    expenses: getHqExpenses(),
    orderingAgency: params.orderingAgency ?? prevReport?.orderingAgency,
    billingTarget: params.billingTarget ?? prevReport?.billingTarget,
    billingTargetName: params.billingTargetName ?? prevReport?.billingTargetName,
    customContractTerms: params.customContractTerms ?? prevReport?.contractTerms,
    vatMode: params.vatMode ?? prevReport?.vatMode,
    status: params.status ?? prevReport?.status ?? 'draft',
    adminNotes: params.adminNotes ?? prevReport?.adminNotes,
    vehiclePresets: getVehiclePresetsSnapshot(),
    driverProfiles: getDriverProfilesSnapshot(),
    isDemoScenario: params.isDemoScenario ?? prevReport?.isDemoScenario,
    demoScenarioCode: params.demoScenarioCode ?? prevReport?.demoScenarioCode,
    areAllDirectCostsConfirmed:
      params.areAllDirectCostsConfirmed ?? prevReport?.areAllDirectCostsConfirmed ?? false,
  });

  const idx = existingReports.findIndex((r) => r.id === params.reportId);
  const nextReports =
    idx >= 0
      ? existingReports.map((r, i) => (i === idx ? built : r))
      : [built, ...existingReports];

  saveSettlementReports(nextReports);
  return built;
}

/**
 * Re-sync a specific settlement report (or all active dynamic reports) when driving logs,
 * expenses, or bookings are updated.
 */
export function syncSettlementReportById(reportId: string): EventSettlementReport | null {
  const reports = getSettlementReportsSnapshot();
  const target = reports.find((r) => r.id === reportId);
  if (!target) return null;

  const customers = getHqCustomersSnapshot();
  const customer: HqCustomer =
    customers.find((c) => c.id === target.customerId || c.name === target.customerName) || {
      id: target.customerId,
      name: target.customerName,
      tier: 'VIP',
      isFavorite: false,
      primaryContactName: '전담 매니저',
      contactCountExtra: 0,
      recentSnippet: target.eventName,
      mainPhone: '010-0000-0000',
      mainEmail: 'vip@viplimo.co.kr',
      department: '의전총괄팀',
      preferences: [],
      notes: [],
      recentRequests: [],
      contacts: [],
      eventsHistory: [],
      tripsHistory: [],
      communications: [],
      contractTerms: target.contractTerms,
    };

  const allBookings = getHqBookingsSnapshot();
  const vehicleBookingIds = new Set(target.vehicles.map((v) => v.bookingId));
  let matchedBookings = allBookings.filter(
    (b) => vehicleBookingIds.has(b.id) || (b.eventId && b.eventId === target.eventId)
  );

  if (matchedBookings.length === 0) {
    // Reconstruct bookings from report vehicles if not in dynamic booking store
    matchedBookings = target.vehicles.map((v, idx) => ({
      id: v.bookingId || `b-sync-${idx + 1}`,
      bookingNo: v.bookingNo || `#SYNC-${idx + 1}`,
      no: idx + 1,
      customerName: target.customerName,
      customerId: target.customerId,
      eventId: target.eventId,
      pickupDate: target.eventDate.slice(0, 12).replace(/\.\s*/g, '-').replace(/[^0-9-]/g, ''),
      pickupTime: v.customerServiceStart !== '미입력' ? v.customerServiceStart : '09:00',
      pickupLocation: target.location,
      destination: target.location,
      driverName: v.serviceMode === 'vehicle_only' ? '-' : v.driverName,
      driverPhone: v.driverPhone,
      vehicleModel: v.vehicleModelRaw || v.vehicleModel,
      vehiclePlate: v.vehiclePlate,
      dispatchStatus: (v.dispatchStatus as HqBooking['dispatchStatus']) || '운행 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      groupVehicleIndex: v.vehicleIndex,
      requestedLanguage: v.requestedLanguage,
      serviceMode: v.serviceMode,
      notes: v.notes,
    }));
  }

  return upsertEventSettlementFromBookings({
    reportId: target.id,
    reportNo: target.reportNo,
    eventId: target.eventId,
    customer,
    eventName: target.eventName,
    eventDate: target.eventDate,
    location: target.location,
    bookings: matchedBookings,
    orderingAgency: target.orderingAgency,
    billingTarget: target.billingTarget,
    billingTargetName: target.billingTargetName,
    customContractTerms: target.contractTerms,
    vatMode: target.vatMode,
    status: target.status,
    adminNotes: target.adminNotes,
    isDemoScenario: target.isDemoScenario,
    demoScenarioCode: target.demoScenarioCode,
    areAllDirectCostsConfirmed: target.areAllDirectCostsConfirmed,
  });
}

/**
 * Reassign vehicle or driver on a booking and automatically recalculate its settlement report (Scenario C-3)
 */
export function reassignBookingVehicleOrDriver(params: {
  reportId: string;
  bookingId: string;
  newVehicleModel?: string;
  newVehiclePlate?: string;
  newDriverName?: string;
  newDriverPhone?: string;
  newServiceMode?: ServiceIncludeMode;
  newRequestedLanguage?: RequestedDriverLanguage;
}): EventSettlementReport | null {
  const bookings = getHqBookingsSnapshot();
  const reports = getSettlementReportsSnapshot();
  const report = reports.find((r) => r.id === params.reportId);
  if (!report) return null;

  const customers = getHqCustomersSnapshot();
  const customer = customers.find((c) => c.id === report.customerId);

  const updatedBookings = bookings.map((b) => {
    if (b.id !== params.bookingId) return b;
    const nextModel = params.newVehicleModel ?? b.vehicleModel;
    const nextDriver = params.newDriverName ?? b.driverName;
    const nextMode = params.newServiceMode ?? b.serviceMode ?? 'with_driver';
    const nextLang = params.newRequestedLanguage ?? b.requestedLanguage ?? 'ko';

    const updatedSnapshot = createBookingPricingSnapshot({
      vehicleModel: nextModel,
      driverName: nextDriver,
      serviceMode: nextMode,
      requestedLanguage: nextLang,
      customer,
      vehiclePresets: getVehiclePresetsSnapshot(),
      driverProfiles: getDriverProfilesSnapshot(),
    });

    return {
      ...b,
      vehicleModel: nextModel,
      vehiclePlate: params.newVehiclePlate ?? b.vehiclePlate,
      driverName: nextDriver,
      driverPhone: params.newDriverPhone ?? b.driverPhone,
      serviceMode: nextMode,
      requestedLanguage: nextLang,
      appliedPricingSnapshot: updatedSnapshot,
    };
  });

  saveHqBookings(updatedBookings);

  // Also update any matching driving log's vehicle/driver so the log stays linked
  const logs = getHqDrivingLogs();
  const targetLog = logs.find((l) => l.bookingId === params.bookingId);
  if (targetLog) {
    updateHqDrivingLog(targetLog.id, {
      vehicleModel: params.newVehicleModel ?? targetLog.vehicleModel,
      vehiclePlate: params.newVehiclePlate ?? targetLog.vehiclePlate,
      driverName: params.newDriverName ?? targetLog.driverName,
    });
  }

  // If the report had per-vehicle base rates locked in contractTerms, clear the reassigned vehicle's index so its new model rate applies
  if (report.contractTerms?.vehicleBaseRatesByIndex) {
    const vehicleRow = report.vehicles.find((v) => v.bookingId === params.bookingId);
    if (vehicleRow) {
      const nextByIndex = { ...report.contractTerms.vehicleBaseRatesByIndex };
      delete nextByIndex[vehicleRow.vehicleIndex];
      const nextReports = reports.map((r) =>
        r.id === report.id
          ? {
              ...r,
              contractTerms: {
                ...r.contractTerms!,
                vehicleBaseRatesByIndex: nextByIndex,
              },
            }
          : r
      );
      saveSettlementReports(nextReports);
    }
  }

  return syncSettlementReportById(params.reportId);
}

export function updateSettlementReportStatus(
  reportId: string,
  newStatus: SettlementReportStatus,
  adminNotes?: string,
  areAllDirectCostsConfirmed?: boolean
): EventSettlementReport | null {
  const reports = getSettlementReportsSnapshot();
  let updatedItem: EventSettlementReport | null = null;

  const next = reports.map((r) => {
    if (r.id !== reportId) return r;
    const directConfirmed =
      areAllDirectCostsConfirmed !== undefined
        ? areAllDirectCostsConfirmed
        : Boolean(r.areAllDirectCostsConfirmed);

    const allVehiclesVerified = r.vehicles.every(
      (v) =>
        v.isServiceTimeVerified &&
        v.hasContractTerms &&
        !v.isTemporaryPreset &&
        v.isOvertimeRateConfirmed &&
        v.pendingExpensesTotal === 0 &&
        !v.hasDuplicateWarning &&
        !v.driverOvertimeLaborWarning
    );

    const canConfirmProfit =
      (newStatus === 'approved' || newStatus === 'invoiced') &&
      allVehiclesVerified &&
      !r.hasUnverifiedItems &&
      directConfirmed;

    updatedItem = {
      ...r,
      status: newStatus,
      adminNotes: adminNotes !== undefined ? adminNotes : r.adminNotes,
      areAllDirectCostsConfirmed: directConfirmed,
      approvedBy:
        newStatus === 'approved' || newStatus === 'invoiced' ? '본사 정산 관리자' : r.approvedBy,
      approvedAt:
        newStatus === 'approved' || newStatus === 'invoiced'
          ? new Date().toLocaleString('ko-KR')
          : r.approvedAt,
      profitConfirmStatus: canConfirmProfit ? 'confirmed' : 'provisional',
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

  // Multi-vehicle base rate preservation:
  // If the event has multiple vehicles with different base fares, do NOT overwrite all vehicles with a single flat baseRate
  // unless vehicleBaseRatesByIndex is explicitly provided or the event has only 1 vehicle.
  const distinctBaseFares = new Set(target.vehicles.map((v) => v.baseFare).filter((f) => f > 0));
  const isHeterogeneousMultiVehicle = target.vehicles.length > 1 && distinctBaseFares.size > 1;

  const preservedByIndex: Record<number, number> = {
    ...(target.contractTerms?.vehicleBaseRatesByIndex || {}),
    ...(terms.vehicleBaseRatesByIndex || {}),
  };

  if (isHeterogeneousMultiVehicle && !terms.vehicleBaseRatesByIndex) {
    target.vehicles.forEach((v) => {
      if (v.baseFare > 0 && preservedByIndex[v.vehicleIndex] === undefined) {
        preservedByIndex[v.vehicleIndex] = v.baseFare;
      }
    });
  }

  const normalizedTerms: CustomerContractTerms = {
    ...terms,
    vehicleBaseRatesByIndex:
      Object.keys(preservedByIndex).length > 0 ? preservedByIndex : undefined,
  };

  // Recalculate vehicles with the updated event/customer contract terms
  const updatedVehicles = target.vehicles.map((v) => {
    const baseHours = normalizedTerms.baseHours || 10;

    // Determine effective base fare for this specific vehicle without flattening multi-vehicle events
    let effectiveBaseFare = normalizedTerms.baseRate;
    if (normalizedTerms.vehicleBaseRatesByIndex?.[v.vehicleIndex] !== undefined) {
      effectiveBaseFare = normalizedTerms.vehicleBaseRatesByIndex[v.vehicleIndex];
    } else if (
      v.serviceMode === 'vehicle_only' &&
      normalizedTerms.vehicleOnlyRate !== undefined &&
      normalizedTerms.vehicleOnlyRate > 0
    ) {
      effectiveBaseFare = normalizedTerms.vehicleOnlyRate;
    } else if (effectiveBaseFare <= 0 && v.baseFare > 0) {
      effectiveBaseFare = v.baseFare;
    }

    const fareCalc = calculateOvertimeAndFare(
      v.isServiceTimeVerified ? v.customerServiceMinutes : 0,
      {
        ...normalizedTerms,
        baseHours,
        baseRate: effectiveBaseFare,
      }
    );

    const clientTotalRevenue = fareCalc.vehicleFareSubtotal + v.approvedExpensesTotal;
    const totalDirectCost = v.driverLaborCost + v.vehicleDirectCost + v.otherDirectCost;
    const directProfit = clientTotalRevenue - totalDirectCost;
    const directMarginPercent =
      clientTotalRevenue > 0 ? Number(((directProfit / clientTotalRevenue) * 100).toFixed(2)) : 0;

    const driverOvertimeLaborWarning =
      fareCalc.overtimeMinutes > 0 && v.serviceMode === 'with_driver'
        ? `초과 서비스(${fareCalc.overtimeFormatted}) 발생 — 기사 초과수당 요율 미정 (관리자 확인 필요)`
        : undefined;

    return {
      ...v,
      pricingSource: normalizedTerms.pricingSource || 'customer_contract',
      isTemporaryPreset: Boolean(normalizedTerms.isTemporaryPreset),
      baseContractHours: baseHours,
      overtimeMinutes: fareCalc.overtimeMinutes,
      billedOvertimeHours: fareCalc.billedOvertimeHours,
      overtimeFormatted: v.isServiceTimeVerified ? fareCalc.overtimeFormatted : '확인 필요',
      billedOvertimeFormatted: v.isServiceTimeVerified
        ? fareCalc.billedOvertimeFormatted
        : '서비스 시간 확인 필요',
      baseFare: fareCalc.baseFare,
      overtimeFare: fareCalc.overtimeFare,
      isOvertimeRateConfirmed: v.isServiceTimeVerified && fareCalc.isOvertimeRateConfirmed,
      vehicleFareSubtotal: fareCalc.vehicleFareSubtotal,
      hasContractTerms: fareCalc.hasContractTerms,
      contractWarning:
        [v.serviceTimeWarning, fareCalc.contractWarning].filter(Boolean).join(' · ') || undefined,
      driverOvertimeLaborWarning,
      clientTotalRevenue,
      directProfit,
      directMarginPercent,
    };
  });

  const totalBaseFare = updatedVehicles.reduce((s, v) => s + v.baseFare, 0);
  const totalOvertimeFare = updatedVehicles.reduce((s, v) => s + v.overtimeFare, 0);
  const totalVehicleFare = updatedVehicles.reduce((s, v) => s + v.vehicleFareSubtotal, 0);
  const supplyAmount = totalVehicleFare + target.totalApprovedExpenses;
  const effectiveVatMode = vatMode || normalizedTerms.vatMode || target.vatMode;
  const vatAmount = effectiveVatMode === 'excluded' ? Math.round(supplyAmount * 0.1) : 0;
  const grandTotal = supplyAmount + vatAmount;
  const totalDirectProfit = supplyAmount - target.totalDirectCost;
  const averageDirectMarginPercent =
    supplyAmount > 0 ? Number(((totalDirectProfit / supplyAmount) * 100).toFixed(2)) : 0;

  const isAnyTemporary = updatedVehicles.some((v) => v.isTemporaryPreset);
  const isAnyUnregistered = updatedVehicles.some((v) => !v.hasContractTerms);
  const isAnyServiceTimeUnverified = updatedVehicles.some((v) => !v.isServiceTimeVerified);
  const isAnyOvertimeUnconfirmed = updatedVehicles.some((v) => !v.isOvertimeRateConfirmed);
  const hasUnverifiedItems =
    isAnyTemporary ||
    isAnyUnregistered ||
    isAnyServiceTimeUnverified ||
    isAnyOvertimeUnconfirmed ||
    target.totalPendingExpenses > 0;

  const updatedReport: EventSettlementReport = {
    ...target,
    pricingSource: normalizedTerms.pricingSource || 'customer_contract',
    isTemporaryPreset: isAnyTemporary,
    vatMode: effectiveVatMode,
    contractTerms: normalizedTerms,
    hasUnverifiedItems,
    contractWarning: isAnyTemporary ? '임시 요금 프리셋 적용 중' : undefined,
    vehicles: updatedVehicles,
    totalBaseFare,
    totalOvertimeFare,
    totalVehicleFare,
    supplyAmount,
    vatAmount,
    grandTotal,
    totalDirectProfit,
    averageDirectMarginPercent,
    profitConfirmStatus:
      !hasUnverifiedItems &&
      Boolean(target.areAllDirectCostsConfirmed) &&
      (target.status === 'approved' || target.status === 'invoiced')
        ? 'confirmed'
        : 'provisional',
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

/**
 * Reset all DEMO/TEST scenario data without touching real/seed records
 */
export function resetDemoPipelineData(): void {
  const reports = getSettlementReportsSnapshot().filter((r) => !r.isDemoScenario);
  saveSettlementReports(
    reports.length > 0
      ? reports
      : buildSeedSettlementReports(getVehiclePresetsSnapshot(), getDriverProfilesSnapshot())
  );

  const bookings = getHqBookingsSnapshot().filter((b) => !b.id.startsWith('b-demo-'));
  saveHqBookings(bookings);

  const logs = getHqDrivingLogs().filter((l) => !l.id.startsWith('log-demo-'));
  saveHqDrivingLogs(logs);

  const expenses = getHqExpenses().filter((e) => !e.id.startsWith('exp-demo-'));
  saveHqExpenses(expenses);

  const customers = getHqCustomersSnapshot().filter((c) => !c.id.startsWith('cust-demo-'));
  saveHqCustomers(customers);
}

/**
 * Execute End-to-End Pipeline Verification Scenarios A, B, C, and D
 * (Customers -> Event/Bookings -> Driving Logs -> Service/Overtime Calc -> Expense Submission/Review -> Invoice Draft -> Admin Approval -> Export)
 */
export function runDemoPipelineScenario(scenario: 'A' | 'B' | 'C' | 'D' | 'ALL'): {
  executedScenarios: string[];
  reports: EventSettlementReport[];
  summaryLog: string[];
} {
  const summaryLog: string[] = [];
  const executedScenarios: string[] = [];

  if (scenario === 'A' || scenario === 'C' || scenario === 'ALL') {
    executedScenarios.push('A');
    const customerA: HqCustomer = upsertHqCustomer({
      id: 'cust-demo-a',
      name: '[DEMO/TEST] 오르비타 바이오 코리아',
      tier: 'VIP',
      isFavorite: false,
      primaryContactName: '강현우 팀장',
      contactCountExtra: 0,
      recentSnippet: '[DEMO/TEST] 단일 차량 기본 의전',
      mainPhone: '010-7701-1001',
      mainEmail: 'hw.kang@orbita-demo.kr',
      department: '의전총괄팀',
      preferences: ['Sprinter 519 CDI'],
      notes: [],
      recentRequests: [],
      contacts: [],
      eventsHistory: [],
      tripsHistory: [],
      communications: [],
    });

    const snapshotA = createBookingPricingSnapshot({
      vehicleModel: '벤츠 스프린터 519 CDI',
      driverName: '정태훈',
      serviceMode: 'with_driver',
      requestedLanguage: 'ko',
      customer: customerA,
    });

    const bookingA: HqBooking = {
      id: 'b-demo-a-1',
      bookingNo: '#DEMO-A-001',
      no: 901,
      customerName: customerA.name,
      customerId: customerA.id,
      eventId: 'ev-demo-a',
      pickupDate: '2026-10-27',
      pickupTime: '09:00',
      pickupLocation: '그랜드 인터컨티넨탈 서울 파르나스',
      destination: '송도 바이오 클러스터 R&D 센터',
      driverName: '정태훈',
      driverPhone: '010-5542-1928',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '703서 2658',
      dispatchStatus: '운행 완료',
      driverAck: '확인완료',
      customerBrochure: '발송됨',
      groupVehicleIndex: 1,
      requestedLanguage: 'ko',
      serviceMode: 'with_driver',
      appliedPricingSnapshot: snapshotA,
      notes: '[DEMO 시나리오 A] 단일 차량 기본 10시간 의전 (차고지 픽업 제외 검증)',
    };

    // Submit Driving Log: Garage 08:00 -> Service Start 09:00 -> Service End 19:00 -> Garage Return 20:00
    const logA = submitDriverLogToHq({
      id: 'log-demo-a-1',
      bookingId: bookingA.id,
      eventId: 'ev-demo-a',
      customerId: customerA.id,
      customerName: customerA.name,
      rawDate: '2026-10-27',
      drivingDate: '10/27',
      driverName: '정태훈',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '703서 2658',
      clockIn: '08:00',
      clockOut: '20:00',
      garageDepartureTime: '08:00',
      customerServiceStart: '09:00',
      customerServiceEnd: '19:00',
      garageArrivalTime: '20:00',
      totalDutyHours: '12시간 00분',
      distanceKm: '148 km',
      status: '승인 완료',
      stops: [
        { id: 'sa-1', time: '08:00', place: '차고지 출발' },
        { id: 'sa-2', time: '09:00', place: '인터컨티넨탈 파르나스', note: '고객 픽업 (서비스 시작)' },
        { id: 'sa-3', time: '19:00', place: '인터컨티넨탈 파르나스', note: '고객 하차 (서비스 종료)' },
        { id: 'sa-4', time: '20:00', place: '차고지 복귀' },
      ],
      notes: '차고지 이동(08:00~09:00, 19:00~20:00) 제외, 순수 고객 서비스 10시간(09:00~19:00)',
    });

    // Remove any previous demo A expenses before re-adding
    saveHqExpenses(getHqExpenses().filter((e) => !e.id.startsWith('exp-demo-a-')));

    // Submit 2 expenses: 15,000 parking (billable) + 12,000 meal (company direct)
    submitDriverExpensesToHq(
      [
        {
          id: 'exp-demo-a-parking',
          category: 'parking',
          merchant: '파르나스타워 지하주차장',
          amount: 15000,
          date: '2026-10-27',
          time: '15:30',
          paymentMethod: 'company_card',
          memo: '[DEMO-A] 고객사 청구용 주차비 영수증',
          createdAt: '2026-10-27T15:30:00Z',
          updatedAt: '2026-10-27T15:30:00Z',
        },
      ],
      '정태훈',
      '703서 2658',
      '벤츠 스프린터 519 CDI',
      {
        customerId: customerA.id,
        customerName: customerA.name,
        bookingId: bookingA.id,
        eventId: 'ev-demo-a',
        drivingLogId: logA.id,
        billableToCustomer: true,
        approvalNo: 'AP-DEMO-A-1001',
      }
    );

    submitDriverExpensesToHq(
      [
        {
          id: 'exp-demo-a-meal',
          category: 'meal',
          merchant: '송도 한옥마을 식당',
          amount: 12000,
          date: '2026-10-27',
          time: '12:40',
          paymentMethod: 'company_card',
          memo: '[DEMO-A] 기사 중식대 (회사 부담 직접비)',
          createdAt: '2026-10-27T12:40:00Z',
          updatedAt: '2026-10-27T12:40:00Z',
        },
      ],
      '정태훈',
      '703서 2658',
      '벤츠 스프린터 519 CDI',
      {
        customerId: customerA.id,
        customerName: customerA.name,
        bookingId: bookingA.id,
        eventId: 'ev-demo-a',
        drivingLogId: logA.id,
        billableToCustomer: false,
        approvalNo: 'AP-DEMO-A-1002',
      }
    );

    // Approve both receipts
    updateHqExpenseStatus('exp-demo-a-parking', '승인 완료', '고객사 실비 청구 승인');
    updateHqExpenseStatus('exp-demo-a-meal', '승인 완료', '회사 부담 식대 승인');

    const reportA = upsertEventSettlementFromBookings({
      reportId: 'rep-demo-scenario-a',
      reportNo: 'DEMO-A-261027',
      eventId: 'ev-demo-a',
      customer: customerA,
      eventName: '[DEMO/TEST] 시나리오 A — 단일 차량 기본 의전 (Sprinter 519 CDI)',
      eventDate: '2026. 10. 27 (화)',
      location: '그랜드 인터컨티넨탈 파르나스 · 송도 R&D 센터',
      bookings: [bookingA],
      status: 'reviewing',
      isDemoScenario: true,
      demoScenarioCode: 'A',
      adminNotes:
        '시나리오 A: 차고지 출발(08:00) 제외 서비스 10시간(09:00~19:00), 청구 815,000원(기본 80만+주차 1.5만), 인건비 15만, 직접비 2.7만(보전원가 1.5만+식대 1.2만), 직접이익 638,000원.',
    });

    summaryLog.push(
      `[시나리오 A 완료] 고객사 청구합계 ₩${reportA.supplyAmount.toLocaleString()} / 기사인건비 ₩${reportA.totalDriverLaborCost.toLocaleString()} / 차량직접비 ₩${reportA.totalVehicleDirectCost.toLocaleString()} / 배차직접이익 ₩${reportA.totalDirectProfit.toLocaleString()}`
    );
  }

  if (scenario === 'B' || scenario === 'C' || scenario === 'ALL') {
    executedScenarios.push('B');
    const customerB: HqCustomer = upsertHqCustomer({
      id: 'cust-demo-b',
      name: '[DEMO/TEST] 메종 드 파리 코리아',
      tier: 'VIP',
      isFavorite: false,
      primaryContactName: '박지훈 프로듀서',
      contactCountExtra: 0,
      recentSnippet: '[DEMO/TEST] 복수 차량 3대 갈라 디너 의전',
      mainPhone: '010-8821-2002',
      mainEmail: 'jh.park@maison-demo.kr',
      department: '글로벌 이벤트팀',
      preferences: ['Sprinter 519 CDI', 'Sprinter 319 CDI', 'S 560'],
      notes: [],
      recentRequests: [],
      contacts: [],
      eventsHistory: [],
      tripsHistory: [],
      communications: [],
    });

    const bookingsB: HqBooking[] = [
      {
        id: 'b-demo-b-1',
        bookingNo: '#DEMO-B-001',
        no: 902,
        customerName: customerB.name,
        customerId: customerB.id,
        eventId: 'ev-demo-b',
        groupId: 'grp-demo-b',
        groupName: '[DEMO/TEST] 메종 드 파리 갈라 디너',
        groupTotalVehicles: 3,
        groupVehicleIndex: 1,
        pickupDate: '2026-10-28',
        pickupTime: '09:00',
        pickupLocation: '서울 신라호텔',
        destination: '성수동 특별 전시장',
        driverName: '정태훈',
        driverPhone: '010-5542-1928',
        vehicleModel: '벤츠 스프린터 519 CDI',
        vehiclePlate: '703서 2658',
        dispatchStatus: '운행 완료',
        driverAck: '확인완료',
        customerBrochure: '발송됨',
        requestedLanguage: 'ko',
        serviceMode: 'with_driver',
        notes: '1호차: Sprinter 519 CDI (800,000원) / 한국어 기사 (150,000원) / 12시간 20분 운행',
      },
      {
        id: 'b-demo-b-2',
        bookingNo: '#DEMO-B-002',
        no: 903,
        customerName: customerB.name,
        customerId: customerB.id,
        eventId: 'ev-demo-b',
        groupId: 'grp-demo-b',
        groupName: '[DEMO/TEST] 메종 드 파리 갈라 디너',
        groupTotalVehicles: 3,
        groupVehicleIndex: 2,
        pickupDate: '2026-10-28',
        pickupTime: '09:30',
        pickupLocation: '인천공항 T2 CIP 라운지',
        destination: '서울 신라호텔',
        driverName: '최영식',
        driverPhone: '010-2341-9876',
        vehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
        vehiclePlate: '125호 9982',
        dispatchStatus: '운행 완료',
        driverAck: '확인완료',
        customerBrochure: '발송됨',
        requestedLanguage: 'en',
        serviceMode: 'with_driver',
        notes: '2호차: Sprinter 319 CDI (1,000,000원) / 영어 가능 기사 (200,000원) / 10시간 정시 운행',
      },
      {
        id: 'b-demo-b-3',
        bookingNo: '#DEMO-B-003',
        no: 904,
        customerName: customerB.name,
        customerId: customerB.id,
        eventId: 'ev-demo-b',
        groupId: 'grp-demo-b',
        groupName: '[DEMO/TEST] 메종 드 파리 갈라 디너',
        groupTotalVehicles: 3,
        groupVehicleIndex: 3,
        pickupDate: '2026-10-28',
        pickupTime: '09:00',
        pickupLocation: '서울 신라호텔',
        destination: '한남동 VIP 라운지',
        driverName: '김민수',
        driverPhone: '010-3829-4821',
        vehicleModel: '벤츠 S560',
        vehiclePlate: '01호 3343',
        dispatchStatus: '운행 완료',
        driverAck: '확인완료',
        customerBrochure: '발송됨',
        requestedLanguage: 'en',
        serviceMode: 'with_driver',
        notes: '3호차: S 560 (650,000원) / 일반차량 영어 가능 기사 (150,000원) / 11시간 운행',
      },
    ];

    submitDriverLogToHq({
      id: 'log-demo-b-1',
      bookingId: 'b-demo-b-1',
      eventId: 'ev-demo-b',
      customerId: customerB.id,
      customerName: customerB.name,
      rawDate: '2026-10-28',
      drivingDate: '10/28',
      driverName: '정태훈',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '703서 2658',
      clockIn: '07:50',
      clockOut: '22:10',
      garageDepartureTime: '07:50',
      customerServiceStart: '09:00',
      customerServiceEnd: '21:20',
      garageArrivalTime: '22:10',
      totalDutyHours: '14시간 20분',
      distanceKm: '185 km',
      status: '승인 완료',
      stops: [],
      notes: '1호차 서비스 09:00~21:20 (12시간 20분, 초과 2시간 20분)',
    });

    submitDriverLogToHq({
      id: 'log-demo-b-2',
      bookingId: 'b-demo-b-2',
      eventId: 'ev-demo-b',
      customerId: customerB.id,
      customerName: customerB.name,
      rawDate: '2026-10-28',
      drivingDate: '10/28',
      driverName: '최영식',
      vehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
      vehiclePlate: '125호 9982',
      clockIn: '08:10',
      clockOut: '20:20',
      garageDepartureTime: '08:10',
      customerServiceStart: '09:30',
      customerServiceEnd: '19:30',
      garageArrivalTime: '20:20',
      totalDutyHours: '12시간 10분',
      distanceKm: '210 km',
      status: '승인 완료',
      stops: [],
      notes: '2호차 서비스 09:30~19:30 (10시간 00분, 초과 0분)',
    });

    submitDriverLogToHq({
      id: 'log-demo-b-3',
      bookingId: 'b-demo-b-3',
      eventId: 'ev-demo-b',
      customerId: customerB.id,
      customerName: customerB.name,
      rawDate: '2026-10-28',
      drivingDate: '10/28',
      driverName: '김민수',
      vehicleModel: '벤츠 S560',
      vehiclePlate: '01호 3343',
      clockIn: '08:00',
      clockOut: '20:50',
      garageDepartureTime: '08:00',
      customerServiceStart: '09:00',
      customerServiceEnd: '20:00',
      garageArrivalTime: '20:50',
      totalDutyHours: '12시간 50분',
      distanceKm: '130 km',
      status: '승인 완료',
      stops: [],
      notes: '3호차 서비스 09:00~20:00 (11시간 00분, 초과 1시간)',
    });

    saveHqExpenses(getHqExpenses().filter((e) => !e.id.startsWith('exp-demo-b-')));

    // Exp B1: 1호차 톨비 18,000원 (승인 완료)
    submitDriverExpensesToHq(
      [
        {
          id: 'exp-demo-b-1-toll',
          category: 'toll',
          merchant: '수도권제1순환고속도로 톨게이트',
          amount: 18000,
          date: '2026-10-28',
          time: '14:10',
          paymentMethod: 'company_card',
          memo: '[DEMO-B] 1호차 고속도로 통행료 (승인 완료)',
          createdAt: '2026-10-28T14:10:00Z',
          updatedAt: '2026-10-28T14:10:00Z',
        },
      ],
      '정태훈',
      '703서 2658',
      '벤츠 스프린터 519 CDI',
      {
        customerId: customerB.id,
        customerName: customerB.name,
        bookingId: 'b-demo-b-1',
        eventId: 'ev-demo-b',
        drivingLogId: 'log-demo-b-1',
        billableToCustomer: true,
        approvalNo: 'AP-DEMO-B-2001',
      }
    );
    updateHqExpenseStatus('exp-demo-b-1-toll', '승인 완료', '고객사 청구 승인');

    // Exp B2: 2호차 공항 주차비 24,000원 (승인 완료)
    submitDriverExpensesToHq(
      [
        {
          id: 'exp-demo-b-2-parking',
          category: 'parking',
          merchant: '인천국제공항 T2 단기주차장',
          amount: 24000,
          date: '2026-10-28',
          time: '11:20',
          paymentMethod: 'company_card',
          memo: '[DEMO-B] 2호차 공항 픽업 주차비 (승인 완료)',
          createdAt: '2026-10-28T11:20:00Z',
          updatedAt: '2026-10-28T11:20:00Z',
        },
      ],
      '최영식',
      '125호 9982',
      '벤츠 스프린터 투어러 (319 CDI)',
      {
        customerId: customerB.id,
        customerName: customerB.name,
        bookingId: 'b-demo-b-2',
        eventId: 'ev-demo-b',
        drivingLogId: 'log-demo-b-2',
        billableToCustomer: true,
        approvalNo: 'AP-DEMO-B-2002',
      }
    );
    updateHqExpenseStatus('exp-demo-b-2-parking', '승인 완료', '고객사 청구 승인');

    // Exp B3: 3호차 발렛 주차비 30,000원 (검수 대기 -> 미반영 검증)
    submitDriverExpensesToHq(
      [
        {
          id: 'exp-demo-b-3-pending',
          category: 'parking',
          merchant: '한남동 라운지 발렛파킹',
          amount: 30000,
          date: '2026-10-28',
          time: '18:00',
          paymentMethod: 'company_card',
          memo: '[DEMO-B] 3호차 발렛비 (검수 대기 - 청구 미반영 검증)',
          createdAt: '2026-10-28T18:00:00Z',
          updatedAt: '2026-10-28T18:00:00Z',
        },
      ],
      '김민수',
      '01호 3343',
      '벤츠 S560',
      {
        customerId: customerB.id,
        customerName: customerB.name,
        bookingId: 'b-demo-b-3',
        eventId: 'ev-demo-b',
        drivingLogId: 'log-demo-b-3',
        billableToCustomer: true,
        approvalNo: 'AP-DEMO-B-2003',
      }
    );

    // Exp B4: 1호차 반려 영수증 9,500원 (반려 -> 청구 및 원가 제외 검증)
    submitDriverExpensesToHq(
      [
        {
          id: 'exp-demo-b-4-rejected',
          category: 'other',
          merchant: '성수동 카페 개인음료',
          amount: 9500,
          date: '2026-10-28',
          time: '16:00',
          paymentMethod: 'driver_personal',
          memo: '[DEMO-B] 사적 지출 반려 처리 건',
          createdAt: '2026-10-28T16:00:00Z',
          updatedAt: '2026-10-28T16:00:00Z',
        },
      ],
      '정태훈',
      '703서 2658',
      '벤츠 스프린터 519 CDI',
      {
        customerId: customerB.id,
        customerName: customerB.name,
        bookingId: 'b-demo-b-1',
        eventId: 'ev-demo-b',
        drivingLogId: 'log-demo-b-1',
        billableToCustomer: false,
        approvalNo: 'AP-DEMO-B-2004',
      }
    );
    updateHqExpenseStatus('exp-demo-b-4-rejected', '반려', '업무 무관 개인 음료 반려');

    const reportB = upsertEventSettlementFromBookings({
      reportId: 'rep-demo-scenario-b',
      reportNo: 'DEMO-B-261028',
      eventId: 'ev-demo-b',
      customer: customerB,
      eventName: '[DEMO/TEST] 시나리오 B — 복수 차량(3대) + 초과시간 + 대행사 발주',
      eventDate: '2026. 10. 28 (수)',
      location: '서울 신라호텔 · 성수동 전시장 · 한남동 라운지',
      bookings: bookingsB,
      orderingAgency: '제일기획 (Cheil Worldwide)',
      billingTarget: 'ordering_agency',
      billingTargetName: '제일기획 귀하 (최종브랜드: 메종 드 파리)',
      customContractTerms: {
        baseHours: 10,
        baseRate: 0, // Per-vehicle model rates preserved in vehicleBaseRatesByIndex below
        vehicleBaseRatesByIndex: {
          1: 800000,
          2: 1000000,
          3: 650000,
        },
        overtimeHourlyRate: 80000,
        roundingUnitMinutes: 30,
        roundingMethod: 'ceil',
        vatMode: 'unset',
        isTemporaryPreset: false,
        pricingSource: 'event_special',
      },
      status: 'reviewing',
      isDemoScenario: true,
      demoScenarioCode: 'B',
      adminNotes:
        '시나리오 B: 3대 투입(519 CDI 80만 + 319 CDI 100만 + S560 65만 = 기본 245만), 초과요금 28만(1호차 2.5h=20만 + 3호차 1h=8만), 승인경비 4.2만, 청구합계 2,772,000원, 기사인건비 합계 500,000원.',
    });

    summaryLog.push(
      `[시나리오 B 완료] 3대 기본요금 ₩${reportB.totalBaseFare.toLocaleString()} / 초과요금 ₩${reportB.totalOvertimeFare.toLocaleString()} / 승인실비 ₩${reportB.totalApprovedExpenses.toLocaleString()} / 총청구액 ₩${reportB.supplyAmount.toLocaleString()} / 기사인건비 ₩${reportB.totalDriverLaborCost.toLocaleString()}`
    );
  }

  if (scenario === 'C' || scenario === 'ALL') {
    executedScenarios.push('C');
    // C-1: Update 1호차 service end time in Scenario B from 21:20 to 22:00 -> automatic recalculation
    updateHqDrivingLog('log-demo-b-1', {
      customerServiceEnd: '22:00',
      notes: '[시나리오 C-1 수정] 서비스 종료시간 21:20 → 22:00 수정 (총 13시간, 초과 3시간 자동 재계산)',
    });
    const syncedB = syncSettlementReportById('rep-demo-scenario-b');

    // C-2: Update Scenario A parking receipt from 15,000 to 20,000 -> automatic recalculation
    updateHqExpenseRecord('exp-demo-a-parking', {
      amount: 20000,
      memo: '[시나리오 C-2 수정] 주차비 금액 15,000원 → 20,000원 수정 후 정산 자동 반영',
    });
    const syncedA = syncSettlementReportById('rep-demo-scenario-a');

    summaryLog.push(
      `[시나리오 C 완료] C-1 종료시간 수정 후 시나리오 B 초과요금 ₩${syncedB?.totalOvertimeFare.toLocaleString()}(총청구 ₩${syncedB?.supplyAmount.toLocaleString()}) / C-2 영수증 금액 수정 후 시나리오 A 청구합계 ₩${syncedA?.supplyAmount.toLocaleString()}`
    );
  }

  if (scenario === 'D' || scenario === 'ALL') {
    executedScenarios.push('D');
    const customerD: HqCustomer = upsertHqCustomer({
      id: 'cust-demo-d',
      name: '[DEMO/TEST] 노바테크 로보틱스 (예외검증 D)',
      tier: '주요',
      isFavorite: false,
      primaryContactName: '최유진 책임매니저',
      contactCountExtra: 0,
      recentSnippet: '[DEMO/TEST] 예외 및 경계 조건 검증 시나리오 D',
      mainPhone: '010-3391-4004',
      mainEmail: 'yj.choi@novatech-demo.kr',
      department: '총무의전팀',
      preferences: ['Sprinter 519 CDI'],
      notes: [],
      recentRequests: [],
      contacts: [],
      eventsHistory: [],
      tripsHistory: [],
      communications: [],
    });

    // D-1 (종료시간 누락), D-2 (초과요율 미등록), D-3 (영어 요청 + 한국어 기사 예외 배정), D-6 (차량만 대여 600,000원 & 인건비 0원)
    const bookingsD: HqBooking[] = [
      {
        id: 'b-demo-d-1',
        bookingNo: '#DEMO-D-001',
        no: 911,
        customerName: customerD.name,
        customerId: customerD.id,
        eventId: 'ev-demo-d',
        groupVehicleIndex: 1,
        pickupDate: '2026-10-28',
        pickupTime: '09:00',
        pickupLocation: '판교 노바테크 본사',
        destination: '인천공항 T2',
        driverName: '정태훈',
        driverPhone: '010-5542-1928',
        vehicleModel: '벤츠 스프린터 519 CDI',
        vehiclePlate: '703서 2658',
        dispatchStatus: '운행 중',
        driverAck: '확인완료',
        customerBrochure: '발송됨',
        requestedLanguage: 'en', // D-3: 영어 요청이나 한국어 전용 기사(정태훈) 배정
        serviceMode: 'with_driver',
        notes: '[시나리오 D-1 & D-3] 운행일지 종료시간 누락(임의 추정 금지) + 영어 요청/한국어 기사 예외배정 경고',
      },
      {
        id: 'b-demo-d-2',
        bookingNo: '#DEMO-D-002',
        no: 912,
        customerName: customerD.name,
        customerId: customerD.id,
        eventId: 'ev-demo-d',
        groupVehicleIndex: 2,
        pickupDate: '2026-10-28',
        pickupTime: '09:00',
        pickupLocation: '판교 노바테크 본사',
        destination: '코엑스 컨벤션센터',
        driverName: '최영식',
        driverPhone: '010-2341-9876',
        vehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
        vehiclePlate: '125호 9982',
        dispatchStatus: '운행 완료',
        driverAck: '확인완료',
        customerBrochure: '발송됨',
        requestedLanguage: 'en',
        serviceMode: 'with_driver',
        notes: '[시나리오 D-2] 12시간 운행(2시간 초과)했으나 초과요율 미등록 시 임의 초과요금 0원 처리 검증',
      },
      {
        id: 'b-demo-d-3',
        bookingNo: '#DEMO-D-003',
        no: 913,
        customerName: customerD.name,
        customerId: customerD.id,
        eventId: 'ev-demo-d',
        groupVehicleIndex: 3,
        pickupDate: '2026-10-28',
        pickupTime: '09:00',
        pickupLocation: '판교 노바테크 본사',
        destination: '수원 컨벤션센터',
        driverName: '-',
        vehicleModel: '벤츠 스프린터 519 CDI',
        vehiclePlate: '71두 3338',
        dispatchStatus: '운행 완료',
        driverAck: '-',
        customerBrochure: '발송됨',
        requestedLanguage: 'ko',
        serviceMode: 'vehicle_only', // D-6: 차량만 대여 (600,000원, 인건비 0원)
        notes: '[시나리오 D-6] 차량만 대여(600,000원) 선택 시 기사 인건비 0원 검증',
      },
    ];

    // Log for D-1: service end time missing!
    submitDriverLogToHq({
      id: 'log-demo-d-1',
      bookingId: 'b-demo-d-1',
      eventId: 'ev-demo-d',
      customerId: customerD.id,
      customerName: customerD.name,
      rawDate: '2026-10-28',
      drivingDate: '10/28',
      driverName: '정태훈',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '703서 2658',
      clockIn: '08:00',
      clockOut: '',
      garageDepartureTime: '08:00',
      customerServiceStart: '09:00',
      customerServiceEnd: undefined, // Missing!
      stops: [{ id: 'sd1-1', time: '09:00', place: '판교 본사 픽업' }],
      notes: '종료시간 미입력 상태 — 서비스 시간 확인 필요 표시 검증',
    });

    // Log for D-2: 12 hours service (09:00~21:00), 2 hours overtime, but no overtime rate registered
    submitDriverLogToHq({
      id: 'log-demo-d-2',
      bookingId: 'b-demo-d-2',
      eventId: 'ev-demo-d',
      customerId: customerD.id,
      customerName: customerD.name,
      rawDate: '2026-10-28',
      drivingDate: '10/28',
      driverName: '최영식',
      vehicleModel: '벤츠 스프린터 투어러 (319 CDI)',
      vehiclePlate: '125호 9982',
      clockIn: '08:00',
      clockOut: '21:50',
      garageDepartureTime: '08:00',
      customerServiceStart: '09:00',
      customerServiceEnd: '21:00',
      garageArrivalTime: '21:50',
      stops: [],
      notes: '12시간 서비스 수행 (초과 2시간 발생, 초과요율 미등록)',
    });

    // Log for D-6: Vehicle only 10h
    submitDriverLogToHq({
      id: 'log-demo-d-3',
      bookingId: 'b-demo-d-3',
      eventId: 'ev-demo-d',
      customerId: customerD.id,
      customerName: customerD.name,
      rawDate: '2026-10-28',
      drivingDate: '10/28',
      driverName: '차량만 대여',
      vehicleModel: '벤츠 스프린터 519 CDI',
      vehiclePlate: '71두 3338',
      clockIn: '09:00',
      clockOut: '19:00',
      customerServiceStart: '09:00',
      customerServiceEnd: '19:00',
      stops: [],
      notes: '차량만 대여 10시간 (09:00~19:00)',
    });

    const reportD = upsertEventSettlementFromBookings({
      reportId: 'rep-demo-scenario-d',
      reportNo: 'DEMO-D-261028',
      eventId: 'ev-demo-d',
      customer: customerD,
      eventName: '[DEMO/TEST] 시나리오 D — 예외·경계 조건 종합 검증 (종료시간 누락·초과요율 미등록·차량만 대여)',
      eventDate: '2026. 10. 28 (수)',
      location: '판교 노바테크 · 코엑스 · 수원 컨벤션',
      bookings: bookingsD,
      status: 'draft',
      isDemoScenario: true,
      demoScenarioCode: 'D',
      adminNotes:
        '시나리오 D: 1호차 종료시간 누락(서비스 시간 확인 필요) + 영어불일치 경고, 2호차 2시간 초과(초과요율 미등록으로 임의 가산 없음), 3호차 차량만 대여(60만원, 기사 인건비 0원).',
    });

    summaryLog.push(
      `[시나리오 D 완료] 1호차 시간검증=${reportD.vehicles[0]?.isServiceTimeVerified ? '완료' : '확인필요'} / 2호차 미등록초과요금=₩${reportD.vehicles[1]?.overtimeFare} / 3호차 차량만대여 인건비=₩${reportD.vehicles[2]?.driverLaborCost}`
    );
  }

  return {
    executedScenarios,
    reports: getSettlementReportsSnapshot(),
    summaryLog,
  };
}


