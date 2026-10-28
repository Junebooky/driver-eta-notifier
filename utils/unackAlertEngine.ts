import { HqBooking } from '@/types/hq';
import { normalizeDateToIso, normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';

export type EscalationSeverity = 'critical' | 'urgent' | 'warning' | 'watch';

export type EscalationCategory =
  | 'unacked_imminent'
  | 'unacked_delayed'
  | 'reconfirm_pending'
  | 'unassigned_omission'
  | 'customer_notify_pending';

export interface UnackEscalationAlert {
  id: string;
  bookingId: string;
  scheduleId?: string;
  bookingNo: string;
  severity: EscalationSeverity;
  category: EscalationCategory;
  categoryLabel: string;
  title: string;
  detail: string;
  pickupCountdownLabel: string;
  elapsedWaitLabel: string;
  minutesUntilPickup: number | null;
  minutesSincePublished: number | null;
  customerName: string;
  passengerName?: string;
  driverName: string;
  driverPhone?: string;
  vehicleModel: string;
  vehiclePlate?: string;
  pickupDate: string;
  pickupTime: string;
  pickupLocation: string;
  destination: string;
  version: number;
  reminderCount: number;
  lastRemindedAt?: string;
  pendingCustomerTrigger?: 'dispatch_confirmed' | 'driver_changed' | 'arrived_pickup' | null;
  canSendDriverReminder: boolean;
}

/**
 * Converts a KST wall-clock date ('YYYY-MM-DD') and time ('HH:mm') into epoch ms (+09:00).
 */
export function parseKstPickupEpochMs(dateRaw?: string, timeRaw?: string): number | null {
  const isoDate = normalizeDateToIso(dateRaw);
  const hhmm = normalizeTimeHHmm(timeRaw);
  if (!isoDate || !hhmm) return null;
  const parsed = Date.parse(`${isoDate}T${hhmm}:00+09:00`);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatMinutesCountdown(minutes: number | null): string {
  if (minutes === null) return '픽업시간 미정';
  if (minutes < 0) {
    const overdue = Math.abs(minutes);
    if (overdue < 60) return `픽업 ${overdue}분 경과`;
    const hrs = Math.floor(overdue / 60);
    const mins = overdue % 60;
    return mins > 0 ? `픽업 ${hrs}시간 ${mins}분 경과` : `픽업 ${hrs}시간 경과`;
  }
  if (minutes === 0) return '지금 픽업 시각';
  if (minutes < 60) return `픽업 ${minutes}분 전`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs < 24) {
    return mins > 0 ? `픽업 ${hrs}시간 ${mins}분 전` : `픽업 ${hrs}시간 전`;
  }
  const days = Math.floor(hrs / 24);
  return `픽업 ${days}일 전`;
}

export function formatElapsedMinutesLabel(minutes: number | null): string {
  if (minutes === null) return '발송시각 미기록';
  if (minutes < 1) return '방금 발송';
  if (minutes < 60) return `발송 ${minutes}분 경과`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `발송 ${hrs}시간 ${mins}분 경과` : `발송 ${hrs}시간 경과`;
}

const SEVERITY_ORDER: Record<EscalationSeverity, number> = {
  critical: 0,
  urgent: 1,
  warning: 2,
  watch: 3,
};

/**
 * Evaluates all active HQ bookings and builds a prioritized list of:
 * 1) Unacknowledged / stale re-confirm dispatches (escalated strongly as pickup approaches!)
 * 2) Unassigned reservations approaching pickup (prevents forgotten dispatch handoff!)
 * 3) Pending customer notifications (e.g. driver arrived at pickup, awaiting admin send confirmation)
 */
export function evaluateDispatchEscalationAlerts(
  bookings: HqBooking[],
  nowMs: number = Date.now()
): {
  alerts: UnackEscalationAlert[];
  criticalCount: number;
  urgentCount: number;
  unackedTotal: number;
  imminentUnackedCount: number;
  omissionRiskCount: number;
  pendingCustomerMsgCount: number;
} {
  const alerts: UnackEscalationAlert[] = [];

  for (const b of bookings) {
    if (b.dispatchStatus === '취소' || b.dispatchStatus === '운행 완료' || b.operationStatus === 'completed') {
      continue;
    }

    const pickupMs = parseKstPickupEpochMs(b.pickupDate, b.pickupTime);
    const minutesUntilPickup =
      pickupMs !== null ? Math.round((pickupMs - nowMs) / 60000) : null;

    // Ignore historical past-day schedules (> 12 hours overdue) so old seed records do not pollute live operational alerts
    if (minutesUntilPickup !== null && minutesUntilPickup < -720) {
      continue;
    }

    const pubSource = b.publishedAt || b.updatedAt || b.createdAt;
    const pubMs = pubSource ? Date.parse(pubSource) : NaN;
    const minutesSincePublished = !Number.isNaN(pubMs)
      ? Math.max(0, Math.floor((nowMs - pubMs) / 60000))
      : null;

    const pickupCountdownLabel = formatMinutesCountdown(minutesUntilPickup);
    const elapsedWaitLabel = formatElapsedMinutesLabel(minutesSincePublished);
    const version = b.version || 1;
    const reminderCount = b.reminderCount || 0;

    // 1. Unacknowledged or Stale Version Re-confirmation Needed
    if (b.driverAck === '미확인' || b.driverAck === '재확인 필요') {
      const isReconfirm = b.driverAck === '재확인 필요';
      let severity: EscalationSeverity = 'watch';
      let category: EscalationCategory = isReconfirm ? 'reconfirm_pending' : 'unacked_delayed';
      let categoryLabel = isReconfirm ? `변경 재확인 대기 (v${version})` : '기사 미확인';

      if (minutesUntilPickup !== null && minutesUntilPickup <= 60) {
        severity = 'critical';
        category = 'unacked_imminent';
        categoryLabel =
          minutesUntilPickup < 0 ? '초긴급 · 픽업시간 경과 미확인' : '초긴급 · 픽업 임박 미확인';
      } else if (
        (minutesUntilPickup !== null && minutesUntilPickup <= 180) ||
        (minutesSincePublished !== null && minutesSincePublished >= 30) ||
        (isReconfirm && minutesSincePublished !== null && minutesSincePublished >= 15)
      ) {
        severity = 'urgent';
        if (minutesUntilPickup !== null && minutesUntilPickup <= 180) {
          category = 'unacked_imminent';
          categoryLabel = '긴급 · 픽업 3시간 내 미확인';
        } else if (!isReconfirm) {
          categoryLabel = '긴급 · 장시간 미확인';
        }
      } else if (
        isReconfirm ||
        b.isToday ||
        (minutesSincePublished !== null && minutesSincePublished >= 10)
      ) {
        severity = 'warning';
      }

      const driverDisplay =
        b.driverName && b.driverName !== '-' ? `${b.driverName} 기사` : '담당 기사';

      alerts.push({
        id: `esc-ack-${b.id}`,
        bookingId: b.id,
        scheduleId: b.scheduleId || b.id,
        bookingNo: b.bookingNo,
        severity,
        category,
        categoryLabel,
        title: `${driverDisplay} · ${b.customerName} (${b.pickupTime} 픽업)`,
        detail:
          severity === 'critical'
            ? `${pickupCountdownLabel}인데 아직 기사가 배차를 확인하지 않았습니다! 즉시 전화 또는 재알림이 필요합니다.`
            : isReconfirm
            ? `일정·배차 변경(v${version}) 후 기사가 아직 재확인하지 않았습니다 (${elapsedWaitLabel}).`
            : `배차 전송 후 ${elapsedWaitLabel} 동안 기사 확인 대기 중입니다 (${pickupCountdownLabel}).`,
        pickupCountdownLabel,
        elapsedWaitLabel,
        minutesUntilPickup,
        minutesSincePublished,
        customerName: b.customerName,
        passengerName: b.passengerName,
        driverName: b.driverName,
        driverPhone: b.driverPhone,
        vehicleModel: b.vehicleModel,
        vehiclePlate: b.vehiclePlate,
        pickupDate: b.pickupDate,
        pickupTime: b.pickupTime,
        pickupLocation: b.pickupLocation,
        destination: b.destination,
        version,
        reminderCount,
        lastRemindedAt: b.lastRemindedAt,
        canSendDriverReminder: true,
      });
    }

    // 2. Unassigned / Unsent Draft Omission Prevention (사모님 접수 후 대표님 배차 확정 누락 경고)
    if (b.dispatchStatus === '미배정' || b.dispatchStatus === '작성 중') {
      const isWithin2h = minutesUntilPickup !== null && minutesUntilPickup <= 120;
      const isWithin6h = minutesUntilPickup !== null && minutesUntilPickup <= 360;

      if (isWithin2h || isWithin6h || b.isToday || b.isTomorrow) {
        const severity: EscalationSeverity = isWithin2h
          ? 'critical'
          : isWithin6h || b.isToday
          ? 'urgent'
          : 'warning';

        alerts.push({
          id: `esc-unassigned-${b.id}`,
          bookingId: b.id,
          scheduleId: b.scheduleId || b.id,
          bookingNo: b.bookingNo,
          severity,
          category: 'unassigned_omission',
          categoryLabel:
            severity === 'critical' ? '초긴급 · 배차 누락 위험' : '배차 미확정 대기',
          title: `[미배정] ${b.customerName} (${b.pickupDate.slice(5)} ${b.pickupTime})`,
          detail: `${pickupCountdownLabel} — 차량과 기사가 아직 배정되지 않아 어떤 기사에게도 전달되지 않은 상태입니다.`,
          pickupCountdownLabel,
          elapsedWaitLabel,
          minutesUntilPickup,
          minutesSincePublished,
          customerName: b.customerName,
          passengerName: b.passengerName,
          driverName: '미배정',
          vehicleModel: b.vehicleModel,
          vehiclePlate: '미배정',
          pickupDate: b.pickupDate,
          pickupTime: b.pickupTime,
          pickupLocation: b.pickupLocation,
          destination: b.destination,
          version,
          reminderCount: 0,
          canSendDriverReminder: false,
        });
      }
    }

    // 3. Pending Customer Auto-Prepared Notification (배차 확정 / 기사 변경 / 픽업지 도착)
    if (b.pendingCustomerTrigger && b.dispatchStatus === '배차 완료') {
      const triggerLabels: Record<string, string> = {
        dispatch_confirmed: '고객사 배차 확정 안내 준비됨',
        driver_changed: '고객사 기사·차량 변경 안내 준비됨',
        arrived_pickup: '고객사 픽업지 도착 안내 준비됨',
      };
      const isArrival = b.pendingCustomerTrigger === 'arrived_pickup';

      alerts.push({
        id: `esc-custmsg-${b.id}-${b.pendingCustomerTrigger}`,
        bookingId: b.id,
        scheduleId: b.scheduleId || b.id,
        bookingNo: b.bookingNo,
        severity: isArrival ? 'urgent' : 'warning',
        category: 'customer_notify_pending',
        categoryLabel: triggerLabels[b.pendingCustomerTrigger] || '고객 안내 준비됨',
        title: `${b.customerName} · ${b.driverName} 기사 (${b.vehiclePlate || b.vehicleModel})`,
        detail: isArrival
          ? `기사가 픽업지(${b.pickupLocation})에 도착했습니다. 자동 작성된 고객 안내 문자/이메일을 확인 후 발송하세요.`
          : `배차/변경 내역이 반영된 짧은 고객 안내 메시지가 준비되었습니다. 관리자 확인 후 발송할 수 있습니다.`,
        pickupCountdownLabel,
        elapsedWaitLabel,
        minutesUntilPickup,
        minutesSincePublished,
        customerName: b.customerName,
        passengerName: b.passengerName,
        driverName: b.driverName,
        driverPhone: b.driverPhone,
        vehicleModel: b.vehicleModel,
        vehiclePlate: b.vehiclePlate,
        pickupDate: b.pickupDate,
        pickupTime: b.pickupTime,
        pickupLocation: b.pickupLocation,
        destination: b.destination,
        version,
        reminderCount,
        pendingCustomerTrigger: b.pendingCustomerTrigger,
        canSendDriverReminder: false,
      });
    }
  }

  alerts.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const minA = a.minutesUntilPickup ?? 999999;
    const minB = b.minutesUntilPickup ?? 999999;
    return minA - minB;
  });

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const urgentCount = alerts.filter((a) => a.severity === 'urgent').length;
  const unackedTotal = alerts.filter(
    (a) =>
      a.category === 'unacked_imminent' ||
      a.category === 'unacked_delayed' ||
      a.category === 'reconfirm_pending'
  ).length;
  const imminentUnackedCount = alerts.filter((a) => a.category === 'unacked_imminent').length;
  const omissionRiskCount = alerts.filter((a) => a.category === 'unassigned_omission').length;
  const pendingCustomerMsgCount = alerts.filter(
    (a) => a.category === 'customer_notify_pending'
  ).length;

  return {
    alerts,
    criticalCount,
    urgentCount,
    unackedTotal,
    imminentUnackedCount,
    omissionRiskCount,
    pendingCustomerMsgCount,
  };
}
