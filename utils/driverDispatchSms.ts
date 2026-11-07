import type { HqBooking } from '@/types/hq';

/** Opens the user's own SMS composer; does not claim that a message was sent.
 * No arbitrary recipient, demo phone number, or passenger phone is accepted. */
export function driverDispatchSmsHref(booking: Pick<HqBooking,'driverPhone'|'pickupDate'|'pickupTime'|'pickupLocation'|'destination'|'vehiclePlate'>): string | null {
 const phone=(booking.driverPhone||'').replace(/\D/g,'');
 if(!/^01[016789]\d{7,8}$/.test(phone) || /^0+$/.test(phone.slice(3)))return null;
 const message=[
  '[VIP LIMOUSINE KOREA] 배차 안내',
  `일시: ${booking.pickupDate} ${booking.pickupTime}`,
  `출발: ${booking.pickupLocation}`,
  `도착: ${booking.destination}`,
  `차량: ${booking.vehiclePlate || '확인 필요'}`,
  '기사 Cockpit에서 배차 내용을 확인해 주세요.',
 ].join('\n');
 return `sms:${phone}?body=${encodeURIComponent(message)}`;
}
