import {
  AppliedPricingSnapshot,
  RequestedDriverLanguage,
  ServiceIncludeMode,
} from './settlementHq';

export type DispatchStatus = '미배정' | '배차 완료' | '운행 중' | '운행 완료' | '취소' | '작성 중' | '재확인 필요';
export type DriverAckStatus = '미확인' | '확인완료' | '재확인 필요' | '-';
export type CustomerBrochureStatus = '미생성' | '미발송' | '준비완료' | '발송됨' | '재발송 필요' | '실패';

export type CustomerNotificationTrigger = 'dispatch_confirmed' | 'driver_changed' | 'arrived_pickup';

export interface CustomerNotificationRecord {
  id: string;
  trigger: CustomerNotificationTrigger;
  channel: 'email' | 'sms';
  language: 'ko' | 'en';
  recipient: string;
  subject?: string;
  body: string;
  deliveryMethod: 'smtp' | 'manual_copy' | 'sms_app';
  sentAt: string;
  sentBy: string;
  scheduleVersion?: number;
}

export interface HqBooking {
  id: string;
  bookingNo: string;
  no: number;
  customerName: string;
  pickupTime: string;
  pickupDate: string;
  endDate?: string;
  endTime?: string;
  pickupLocation: string;
  destination: string;
  driverName: string;
  driverId?: string;
  driverPhone?: string;
  driverIsEnglishVerified?: boolean;
  vehicleModel: string;
  vehiclePlate?: string;
  vehicleId?: string;
  dispatchStatus: DispatchStatus;
  driverAck: DriverAckStatus;
  driverAckTime?: string;
  customerBrochure: CustomerBrochureStatus;
  passengerCount?: number;
  passengerName?: string;
  passengerPhone?: string;
  notes?: string;
  isToday?: boolean;
  isTomorrow?: boolean;
  isDispatchTarget?: boolean;
  groupId?: string;
  groupName?: string;
  groupTotalVehicles?: number;
  groupVehicleIndex?: number;
  customerId?: string;
  orderingAgency?: string;
  endBrand?: string;
  eventId?: string;
  eventName?: string;
  billingTarget?: 'ordering_agency' | 'end_brand' | 'custom';
  billingTargetName?: string;
  settlementReportId?: string;
  // Language & Pricing Snapshot (Historical Immutability)
  requestedLanguage?: RequestedDriverLanguage;
  languageOverrideConfirmed?: boolean;
  serviceMode?: ServiceIncludeMode;
  appliedPricingSnapshot?: AppliedPricingSnapshot;
  // Shared Server Schedule & Lifecycle Sync (HQ <-> Driver Cockpit)
  scheduleId?: string;
  vehicleNoKey?: string;
  intakeSource?: 'phone' | 'email' | 'quick_dispatch' | 'manual' | 'seed';
  flightNumber?: string;
  version?: number;
  lastAckVersion?: number;
  lastAckAt?: string;
  publishedAt?: string;
  publishedBy?: string;
  placeVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
  cancelReason?: string;
  hasConflict?: boolean;
  conflictMessages?: string[];
  // Operation Status & Escalation / Customer Notification Tracking
  operationStatus?: 'ready' | 'arrived_pickup' | 'boarded' | 'in_transit' | 'completed';
  operationUpdatedAt?: string;
  reminderCount?: number;
  lastRemindedAt?: string;
  previousDriverName?: string;
  previousDriverPhone?: string;
  previousVehiclePlate?: string;
  previousVehicleModel?: string;
  pendingCustomerTrigger?: CustomerNotificationTrigger | null;
  pendingCustomerTriggeredAt?: string;
  customerNotifications?: CustomerNotificationRecord[];
}


export interface HqKpiMetric {
  id: string;
  title: string;
  count: number;
  subtext: string;
  trendText?: string;
  trendColor?: 'red' | 'blue' | 'slate';
  iconType: 'calendar' | 'users' | 'document' | 'send' | 'refresh' | 'clipboard' | 'receipt' | 'mail' | 'group';
  urgencyLevel?: 'normal' | 'urgent' | 'warning';
}

export interface HqUnconfirmedDispatchItem {
  id: string;
  scheduleId?: string;
  pickupTime: string;
  customerName: string;
  driverName: string;
  driverPhone?: string;
  vehicleModel: string;
  destination: string;
  waitingTime: string;
  pickupCountdownLabel?: string;
  severity?: 'critical' | 'urgent' | 'warning' | 'watch';
  reminderCount?: number;
  isUrgent?: boolean;
}

export interface HqUnsentDraftItem {
  id: string;
  createdAt: string;
  customerName: string;
  pickupTime: string;
  destination: string;
  status: string;
}

export interface HqDriverAllocationSlice {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface HqDriverAllocationStats {
  totalDrivers: number;
  active: HqDriverAllocationSlice;
  standby: HqDriverAllocationSlice;
  offDuty: HqDriverAllocationSlice;
  unassigned: HqDriverAllocationSlice;
}

export interface HqDrivingLogItem {
  id: string;
  submittedAt: string;
  driverName: string;
  vehicleModel: string;
  dutyTime: string; // e.g. "08:00 - 20:00"
  mileageKm: number;
  status: '검토 대기' | '검토 중' | '승인 완료' | '보완 필요';
  stopsCount?: number;
}

export interface HqExpenseItem {
  id: string;
  submittedAt: string;
  driverName: string;
  category: '주유비' | '통행료' | '주차비' | '식비' | '기타';
  amount: number;
  status: '검수 대기' | '승인 완료' | '금액 확인' | '반려';
  hasReceiptImage?: boolean;
  notes?: string;
}

export interface HqVehicleClassStatus {
  id: string;
  className: string;
  totalCount: number;
  activeCount: number;
  availableCount: number;
  imageUrl?: string;
}

export interface HqAlertItem {
  id: string;
  time: string;
  category: '발송 미확인' | '고객 요청 변경' | '재발송 필요' | '기사 알림 실패';
  customerName: string;
  bookingNo: string;
  message: string;
  status: '미확인' | '확인 필요' | '처리 완료';
  actionLabel: string;
}
