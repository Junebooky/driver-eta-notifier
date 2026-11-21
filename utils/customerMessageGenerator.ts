import { CustomerNotificationTrigger, HqBooking } from '@/types/hq';
import { HqCustomer } from '@/types/customerHq';
import { formatKoreanFullDateLabel } from '@/utils/dispatchConflictDetector';
import { stripManufacturerName } from '@/utils/vehicleData';

export interface GeneratedCustomerMessages {
  trigger: CustomerNotificationTrigger;
  triggerLabel: string;
  language: 'ko' | 'en';
  recipientEmail: string;
  recipientPhone: string;
  contactName: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  missingFieldsWarning?: string;
}

export const CUSTOMER_TRIGGER_LABELS: Record<CustomerNotificationTrigger, string> = {
  dispatch_confirmed: '배차 확정 안내',
  driver_changed: '기사·차량 변경 안내',
  arrived_pickup: '픽업지 도착 안내',
};

export function extractPhoneFromString(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(?:01[0-9]|02|0[3-9][0-9])-?[0-9]{3,4}-?[0-9]{4}|\+?[0-9]{1,3}[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4}/);
  return match ? match[0].trim() : null;
}

export function extractEmailFromString(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].trim() : null;
}

/**
 * Builds platform-compatible SMS URI.
 * macOS and iOS Messages require '&body=', while Android and standard RFC 5724 require '?body='.
 */
export function formatSmsAppUrl(phone: string, body: string): string {
  const cleanNumber = phone.replace(/[^0-9+]/g, '');
  const encodedBody = encodeURIComponent(body);

  if (!cleanNumber) {
    return `sms:?body=${encodedBody}`;
  }

  const isApple =
    typeof navigator !== 'undefined' &&
    (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(navigator.userAgent) ||
      (typeof navigator.platform === 'string' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)));

  return isApple
    ? `sms:${cleanNumber}&body=${encodedBody}`
    : `sms:${cleanNumber}?body=${encodedBody}`;
}

function formatKstTimeOnly(isoStr?: string): string {
  if (!isoStr) return '';
  try {
    const dt = new Date(isoStr);
    if (Number.isNaN(dt.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(dt);
    const h = parts.find((p) => p.type === 'hour')?.value || '00';
    const m = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${h}:${m}`;
  } catch {
    return '';
  }
}

/**
 * Generates concise, accurate customer Email & SMS messages for:
 * 1) dispatch_confirmed (배차 확정)
 * 2) driver_changed (기사·차량 변경)
 * 3) arrived_pickup (픽업지 도착)
 *
 * Distinct from the Chauffeur Profile Card brochure. Never fabricates missing info;
 * flags missing driver/vehicle details so the manager reviews before sending.
 */
export function generateCustomerNotificationDraft(params: {
  booking: HqBooking;
  trigger: CustomerNotificationTrigger;
  language?: 'ko' | 'en';
  customerRecord?: HqCustomer | null;
  arrivedTimeOverride?: string;
}): GeneratedCustomerMessages {
  const { booking, trigger, customerRecord } = params;
  const lang = params.language || (booking.requestedLanguage === 'en' ? 'en' : 'ko');

  const customerName = booking.customerName || '고객사';
  const passenger =
    booking.passengerName && booking.passengerName !== customerName
      ? booking.passengerName
      : '';
  const dateKo = formatKoreanFullDateLabel(booking.pickupDate);
  const pickupTime = booking.pickupTime || '미정';
  const origin = booking.pickupLocation || '픽업지';
  const destination = booking.destination || '목적지';

  const driverName =
    booking.driverName && booking.driverName !== '-' && booking.driverName !== '미배정'
      ? booking.driverName.replace(/\s*기사$/, '').trim()
      : '';
  const driverPhone = booking.driverPhone || '';
  const vehicleModelClean =
    booking.vehicleModel && booking.vehicleModel !== '-'
      ? stripManufacturerName(booking.vehicleModel)
      : '';
  const vehiclePlate =
    booking.vehiclePlate && booking.vehiclePlate !== '미배정' ? booking.vehiclePlate : '';

  const prevDriver = booking.previousDriverName || '';
  const prevPlate = booking.previousVehiclePlate || '';

  const primaryContact = customerRecord?.contacts?.find((c) => c.isPrimary) || customerRecord?.contacts?.[0];
  const recipientEmail =
    customerRecord?.mainEmail ||
    primaryContact?.email ||
    extractEmailFromString(booking.notes) ||
    extractEmailFromString(booking.passengerName) ||
    '';
  const recipientPhone =
    booking.passengerPhone ||
    extractPhoneFromString(booking.passengerName) ||
    extractPhoneFromString(booking.notes) ||
    customerRecord?.mainPhone ||
    primaryContact?.phone ||
    '';
  const contactName =
    primaryContact?.name || customerRecord?.primaryContactName || passenger || `${customerName} 담당자`;

  const missingWarnings: string[] = [];
  if (!driverName && booking.serviceMode !== 'vehicle_only') missingWarnings.push('배정 기사명');
  if (!vehiclePlate) missingWarnings.push('차량번호');
  if (!driverPhone && booking.serviceMode !== 'vehicle_only') missingWarnings.push('기사 연락처');

  const arrivedClock =
    params.arrivedTimeOverride || formatKstTimeOnly(booking.operationUpdatedAt) || '';

  const groupTagKo =
    booking.groupTotalVehicles && booking.groupTotalVehicles > 1
      ? ` (${booking.groupVehicleIndex || 1}호차/${booking.groupTotalVehicles}대)`
      : '';
  const groupTagEn =
    booking.groupTotalVehicles && booking.groupTotalVehicles > 1
      ? ` (Car #${booking.groupVehicleIndex || 1}/${booking.groupTotalVehicles})`
      : '';

  const vehicleSummaryKo = [vehicleModelClean, vehiclePlate].filter(Boolean).join(' · ') || '확인 중';
  const driverSummaryKo =
    booking.serviceMode === 'vehicle_only'
      ? '차량 단독 대여'
      : [driverName ? `${driverName} 기사` : '미정', driverPhone ? `(${driverPhone})` : '']
          .filter(Boolean)
          .join(' ');

  if (lang === 'en') {
    const vehicleSummaryEn = [vehicleModelClean, vehiclePlate].filter(Boolean).join(' | ') || 'TBD';
    const driverSummaryEn =
      booking.serviceMode === 'vehicle_only'
        ? 'Vehicle Only'
        : [driverName || 'TBD', driverPhone ? `(${driverPhone})` : ''].filter(Boolean).join(' ');

    if (trigger === 'arrived_pickup') {
      const arrivedLine = arrivedClock ? `Arrived at ${arrivedClock}` : 'Standing by on site';
      const emailSubject = `[VIP Limousine Korea] Chauffeur Arrived at Pickup${groupTagEn} — ${customerName}`;
      const smsBody = [
        `[VIP Limousine] Chauffeur Arrived${groupTagEn}`,
        `• Location: ${origin} (${arrivedLine})`,
        passenger ? `• Passenger: ${passenger}` : null,
        `• Vehicle: ${vehicleSummaryEn}`,
        `• Chauffeur: ${driverSummaryEn}`,
        `Your chauffeur is standing by for boarding.`,
      ]
        .filter(Boolean)
        .join('\n');

      const emailBody = [
        `Dear ${contactName},`,
        ``,
        `Your assigned VIP Limousine Korea chauffeur has arrived at the pickup location and is standing by.`,
        ``,
        `[Pickup Arrival Notice${groupTagEn}]`,
        `• Status: ${arrivedLine}`,
        `• Pickup Location: ${origin}`,
        `• Destination: ${destination}`,
        passenger ? `• Passenger: ${passenger}` : null,
        `• Vehicle: ${vehicleSummaryEn}`,
        `• Chauffeur: ${driverSummaryEn}`,
        ``,
        `Please feel free to contact your chauffeur directly or reply to HQ if you need assistance.`,
        ``,
        `Best regards,`,
        `VIP Limousine Korea Operations Desk`,
      ]
        .filter((l) => l !== null)
        .join('\n');

      return {
        trigger,
        triggerLabel: CUSTOMER_TRIGGER_LABELS[trigger],
        language: 'en',
        recipientEmail,
        recipientPhone,
        contactName,
        emailSubject,
        emailBody,
        smsBody,
        missingFieldsWarning:
          missingWarnings.length > 0 ? `누락 확인 필요: ${missingWarnings.join(', ')}` : undefined,
      };
    }

    if (trigger === 'driver_changed') {
      const prevDesc =
        prevDriver || prevPlate
          ? ` (Previously: ${[prevDriver, prevPlate].filter(Boolean).join(' / ')})`
          : '';
      const emailSubject = `[VIP Limousine Korea] Updated Chauffeur/Vehicle Assignment${groupTagEn} — ${booking.pickupDate}`;
      const smsBody = [
        `[VIP Limousine] Updated Assignment${groupTagEn}`,
        `• Schedule: ${booking.pickupDate} ${pickupTime}`,
        `• Route: ${origin} → ${destination}`,
        `• Updated Vehicle: ${vehicleSummaryEn}`,
        `• Updated Chauffeur: ${driverSummaryEn}${prevDesc}`,
      ].join('\n');

      const emailBody = [
        `Dear ${contactName},`,
        ``,
        `Please be informed of an updated chauffeur/vehicle assignment for your upcoming reservation.`,
        ``,
        `[Updated Dispatch Details${groupTagEn}]`,
        `• Date & Time: ${booking.pickupDate} ${pickupTime}`,
        `• Route: ${origin} → ${destination}`,
        passenger ? `• Passenger: ${passenger}` : null,
        prevDriver || prevPlate
          ? `• Previous Assignment: ${[prevDriver, prevPlate].filter(Boolean).join(' / ')}`
          : null,
        `• Updated Vehicle: ${vehicleSummaryEn}`,
        `• Updated Chauffeur: ${driverSummaryEn}`,
        ``,
        `All service schedules and VIP protocol arrangements remain unchanged.`,
        ``,
        `Best regards,`,
        `VIP Limousine Korea Operations Desk`,
      ]
        .filter((l) => l !== null)
        .join('\n');

      return {
        trigger,
        triggerLabel: CUSTOMER_TRIGGER_LABELS[trigger],
        language: 'en',
        recipientEmail,
        recipientPhone,
        contactName,
        emailSubject,
        emailBody,
        smsBody,
        missingFieldsWarning:
          missingWarnings.length > 0 ? `누락 확인 필요: ${missingWarnings.join(', ')}` : undefined,
      };
    }

    // dispatch_confirmed (English)
    const emailSubject = `[VIP Limousine Korea] Dispatch Confirmation${groupTagEn} — ${booking.pickupDate} (${customerName})`;
    const smsBody = [
      `[VIP Limousine] Dispatch Confirmed${groupTagEn}`,
      `• Pickup: ${booking.pickupDate} ${pickupTime} @ ${origin}`,
      `• Drop-off: ${destination}`,
      passenger ? `• Passenger: ${passenger}` : null,
      booking.flightNumber ? `• Flight: ${booking.flightNumber}` : null,
      `• Vehicle: ${vehicleSummaryEn}`,
      `• Chauffeur: ${driverSummaryEn}`,
    ]
      .filter(Boolean)
      .join('\n');

    const emailBody = [
      `Dear ${contactName},`,
      ``,
      `Your VIP chauffeur service dispatch has been confirmed as below.`,
      ``,
      `[Confirmed Schedule & Chauffeur${groupTagEn}]`,
      `• Booking Ref: ${booking.bookingNo}`,
      `• Pickup Date & Time: ${booking.pickupDate} ${pickupTime}`,
      `• Route: ${origin} → ${destination}`,
      passenger ? `• Passenger: ${passenger}` : null,
      booking.flightNumber ? `• Flight: ${booking.flightNumber}` : null,
      `• Assigned Vehicle: ${vehicleSummaryEn}`,
      `• Assigned Chauffeur: ${driverSummaryEn}`,
      ``,
      `Your chauffeur will arrive at least 20 minutes prior to pickup.`,
      ``,
      `Best regards,`,
      `VIP Limousine Korea Operations Desk`,
    ]
      .filter((l) => l !== null)
      .join('\n');

    return {
      trigger,
      triggerLabel: CUSTOMER_TRIGGER_LABELS[trigger],
      language: 'en',
      recipientEmail,
      recipientPhone,
      contactName,
      emailSubject,
      emailBody,
      smsBody,
      missingFieldsWarning:
        missingWarnings.length > 0 ? `누락 확인 필요: ${missingWarnings.join(', ')}` : undefined,
    };
  }

  // Korean ('ko') Templates — concise, operational, distinct from profile brochure
  if (trigger === 'arrived_pickup') {
    const arrivedText = arrivedClock ? `${arrivedClock} 현장 도착 대기 중` : '현장 도착 대기 중';
    const emailSubject = `[VIP 리무진 코리아] 픽업지 도착 및 대기 안내${groupTagKo} (${customerName})`;
    const smsBody = [
      `[VIP리무진] 픽업지 도착 안내${groupTagKo}`,
      `• 픽업장소: ${origin} (${arrivedText})`,
      passenger ? `• 탑승객: ${passenger}` : null,
      `• 대기차량: ${vehicleSummaryKo}`,
      `• 담당기사: ${driverSummaryKo}`,
      `편안히 탑승하실 수 있도록 현장에서 대기 중입니다.`,
    ]
      .filter(Boolean)
      .join('\n');

    const emailBody = [
      `안녕하세요, VIP 리무진 코리아 관제실입니다.`,
      `요청하신 의전 차량이 픽업 장소에 도착하여 탑승 대기 중임을 안내드립니다.`,
      ``,
      `[픽업지 도착 현황${groupTagKo}]`,
      `• 현재 상태: ${arrivedText}`,
      `• 픽업 장소: ${origin} (예정 픽업 ${pickupTime})`,
      `• 이동 목적지: ${destination}`,
      passenger ? `• 담당 승객: ${passenger}` : null,
      `• 대기 차량: ${vehicleSummaryKo}`,
      `• 담당 기사: ${driverSummaryKo}`,
      ``,
      `탑승 위치 확인이 필요하시면 담당 기사 또는 본사 관제실로 연락 부탁드립니다.`,
      `감사합니다.`,
    ]
      .filter((l) => l !== null)
      .join('\n');

    return {
      trigger,
      triggerLabel: CUSTOMER_TRIGGER_LABELS[trigger],
      language: 'ko',
      recipientEmail,
      recipientPhone,
      contactName,
      emailSubject,
      emailBody,
      smsBody,
      missingFieldsWarning:
        missingWarnings.length > 0 ? `누락 확인 필요: ${missingWarnings.join(', ')}` : undefined,
    };
  }

  if (trigger === 'driver_changed') {
    const prevSummary =
      prevDriver || prevPlate
        ? `${[prevDriver ? `${prevDriver} 기사` : '', prevPlate].filter(Boolean).join(' · ')} ➔ `
        : '';

    const emailSubject = `[VIP 리무진 코리아] 배정 기사·차량 변경 안내${groupTagKo} (${dateKo} ${customerName})`;
    const smsBody = [
      `[VIP리무진] 배차 변경 안내${groupTagKo}`,
      `• 일시: ${booking.pickupDate.slice(5)} ${pickupTime}`,
      `• 경로: ${origin} → ${destination}`,
      prevSummary ? `• 변경전: ${prevSummary.replace(/ ➔ $/, '')}` : null,
      `• 변경차량: ${vehicleSummaryKo}`,
      `• 변경기사: ${driverSummaryKo}`,
      `운행 일정은 변동 없이 동일하게 진행됩니다.`,
    ]
      .filter(Boolean)
      .join('\n');

    const emailBody = [
      `안녕하세요, VIP 리무진 코리아 관제실입니다.`,
      `${dateKo} 예정된 의전 일정의 배정 차량·기사 정보가 아래와 같이 변경되어 안내드립니다.`,
      ``,
      `[변경된 배차 정보${groupTagKo}]`,
      `• 운행 일시: ${dateKo} ${pickupTime}`,
      `• 이동 구간: ${origin} → ${destination}`,
      passenger ? `• 담당 승객: ${passenger}` : null,
      prevDriver || prevPlate
        ? `• 기존 배정: ${[prevDriver ? `${prevDriver} 기사` : '', prevPlate].filter(Boolean).join(' / ')}`
        : null,
      `• 변경 차량: ${vehicleSummaryKo}`,
      `• 변경 기사: ${driverSummaryKo}`,
      ``,
      `기존 요청하신 픽업 시각과 의전 사항은 동일하게 인수인계 완료되었습니다.`,
      `감사합니다.`,
    ]
      .filter((l) => l !== null)
      .join('\n');

    return {
      trigger,
      triggerLabel: CUSTOMER_TRIGGER_LABELS[trigger],
      language: 'ko',
      recipientEmail,
      recipientPhone,
      contactName,
      emailSubject,
      emailBody,
      smsBody,
      missingFieldsWarning:
        missingWarnings.length > 0 ? `누락 확인 필요: ${missingWarnings.join(', ')}` : undefined,
    };
  }

  // Default: 'dispatch_confirmed' (배차 확정 안내)
  const emailSubject = `[VIP 리무진 코리아] 의전 차량 배차 확정 안내${groupTagKo} (${dateKo} ${customerName})`;
  const smsBody = [
    `[VIP리무진] 배차 확정 안내${groupTagKo}`,
    `• 일시: ${booking.pickupDate.slice(5)} ${pickupTime}`,
    `• 구간: ${origin} → ${destination}`,
    passenger ? `• 승객: ${passenger}` : null,
    booking.flightNumber ? `• 항공편: ${booking.flightNumber}` : null,
    `• 배정차량: ${vehicleSummaryKo}`,
    `• 담당기사: ${driverSummaryKo}`,
  ]
    .filter(Boolean)
    .join('\n');

  const emailBody = [
    `안녕하세요, VIP 리무진 코리아 관제실입니다.`,
    `요청하신 VIP 의전 차량 배차가 아래와 같이 확정되었습니다.`,
    ``,
    `[확정 배차 요약${groupTagKo}]`,
    `• 예약 번호: ${booking.bookingNo}`,
    `• 픽업 일시: ${dateKo} ${pickupTime}`,
    `• 이동 경로: ${origin} → ${destination}`,
    passenger ? `• 담당 승객: ${passenger}` : null,
    booking.flightNumber ? `• 항공편명: ${booking.flightNumber}` : null,
    `• 배정 차량: ${vehicleSummaryKo}`,
    `• 담당 기사: ${driverSummaryKo}`,
    ``,
    `담당 기사가 픽업 예정 시각 20분 전 현장에 도착하여 대기할 예정입니다.`,
    `일정 변동이 있으시면 회신 또는 관제실로 연락 부탁드립니다. 감사합니다.`,
  ]
    .filter((l) => l !== null)
    .join('\n');

  return {
    trigger,
    triggerLabel: CUSTOMER_TRIGGER_LABELS[trigger],
    language: 'ko',
    recipientEmail,
    recipientPhone,
    contactName,
    emailSubject,
    emailBody,
    smsBody,
    missingFieldsWarning:
      missingWarnings.length > 0 ? `누락 확인 필요: ${missingWarnings.join(', ')}` : undefined,
  };
}
