import { supabaseAdmin } from '@/lib/supabase/server';
import type { RouteWaypointItem } from '@/types/emailHq';

export interface ExistingEmailBookingCandidate {
  scheduleId: string;
  version: number;
  bookingNo: string;
  customerName: string;
  pickupDate: string;
  pickupTime: string;
  endTime: string;
  pickupLocation: string;
  destination: string;
  routeWaypoints: RouteWaypointItem[];
  vehiclePlate: string;
  vehicleModel: string;
  vehicleId?: string;
  driverName: string;
  driverId?: string;
  driverPhone?: string;
  passengerName: string;
  passengerCount: number;
  flightNumber: string;
  notes: string;
  dispatchStatus: 'unassigned' | 'draft' | 'published';
  eventId?: string;
  groupId?: string;
  groupVehicleIndex?: number;
  groupTotalVehicles?: number;
  sourceSenderEmail?: string;
  sourceMessageId?: string;
  score: number;
  reasons: string[];
}

export interface MatchingEmailInput {
  companyName?: string;
  clientId?: string | null;
  sender: string;
  subject: string;
  inReplyTo?: string;
  references?: string[];
  attachmentHashes?: string[];
  pickupDate: string;
  passengerName?: string;
}
const normalize = (value: unknown) => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const email = (value: unknown) => String(value || '').trim().toLocaleLowerCase();

const dateDistance = (a: string, b: string): number => {
  const start = Date.parse(a + 'T00:00:00Z'), end = Date.parse(b + 'T00:00:00Z');
  return Number.isFinite(start) && Number.isFinite(end) ? Math.abs(start - end) / 86_400_000 : Infinity;
};

export function matchEmailBookingCandidates(input: MatchingEmailInput, rows: Array<Record<string, any>>): ExistingEmailBookingCandidate[] {
  const sender = email(input.sender);
  return rows.flatMap((row) => {
    const meta = row.schedule_meta && typeof row.schedule_meta === 'object' ? row.schedule_meta as Record<string, any> : {};
    if (row.org_id !== 'vip_limousine_korea' || row.dispatch_status === 'cancelled' || row.status === 'cancelled') return [];
    const clientSame = Boolean(input.clientId && meta.customerId && input.clientId === meta.customerId);
    const companySame = Boolean(normalize(input.companyName) && normalize(meta.customerName) === normalize(input.companyName));
    const senderSame = Boolean(sender && meta.sourceSenderEmail && sender === email(meta.sourceSenderEmail));
    const quoted = normalize(input.subject);
    const bookingSame = Boolean(meta.bookingNo && normalize(meta.bookingNo).length >= 5 &&
      quoted.includes(normalize(meta.bookingNo)));
    const threadSame = Boolean(meta.sourceMessageId && [input.inReplyTo, ...(input.references || [])].some(
      (key) => key && String(key).trim() === meta.sourceMessageId
    ));
    const attachmentSame = Boolean(Array.isArray(meta.sourceAttachmentHashes) && meta.sourceAttachmentHashes.some((hash: string) => input.attachmentHashes?.includes(hash)));
    const distance = dateDistance(input.pickupDate, String(row.date || ''));
    const dateSame = distance === 0;
    const nearby = distance <= 2;
    const passengerSame = Boolean(normalize(input.passengerName) && normalize(input.passengerName) === normalize(row.passenger_name));
    // Require independent evidence. Same sender alone NEVER means the same booking.
    if (!bookingSame && !threadSame && !(attachmentSame && (companySame || senderSame || clientSame)) && !(nearby && (companySame || clientSame || senderSame))) return [];
    const score = (bookingSame ? 80 : 0) + (threadSame ? 80 : 0) + (attachmentSame ? 60 : 0) +
      (clientSame ? 30 : 0) + (companySame ? 25 : 0) + (senderSame ? 20 : 0) +
      (dateSame ? 30 : nearby ? 15 : 0) + (passengerSame ? 10 : 0);
    if (score < 40) return [];
    const reasons = [
      bookingSame ? '예약번호 일치' : '',
      threadSame ? '이메일 대화 일치' : '',
      attachmentSame ? '동일 첨부파일' : '',
      clientSame ? '고객사 ID 일치' : '',
      companySame ? '고객사명 일치' : '',
      senderSame ? '발신자 일치' : '',
      dateSame ? '운행일 일치' : nearby ? '운행일 근접' : '',
      passengerSame ? '승객명 일치' : '',
    ].filter(Boolean);
    return [{
      scheduleId: String(row.id),
      version: Number(row.version || meta.version || 1),
      bookingNo: String(meta.bookingNo || ''),
      customerName: String(meta.customerName || row.passenger_name || ''),
      pickupDate: String(row.date || ''),
      pickupTime: String(row.pickup_time || '').slice(0, 5),
      endTime: String(row.end_time || '').slice(0, 5),
      pickupLocation: String(row.origin || ''),
      destination: String(row.destination || ''),
      routeWaypoints: Array.isArray(meta.routeWaypoints) ? meta.routeWaypoints : [],
      vehiclePlate: String(row.vehicle_plate || meta.vehiclePlate || ''),
      vehicleModel: String(row.vehicle_model || meta.vehicleModel || ''),
      vehicleId: String(row.vehicle_id || meta.vehicleId || '') || undefined,
      driverId: String(row.driver_id || meta.driverId || '') || undefined,
      driverName: String(row.driver_name || meta.driverName || ''),
      driverPhone: String(row.driver_phone || meta.driverPhone || '') || undefined,
      passengerName: String(row.passenger_name || ''),
      passengerCount: Number(row.passenger_count || 1),
      flightNumber: String(row.flight_number || ''),
      notes: String(row.protocol_notes || ''),
      dispatchStatus: (['published','draft','unassigned'].includes(row.dispatch_status) ? row.dispatch_status : 'unassigned') as ExistingEmailBookingCandidate['dispatchStatus'],
      eventId: meta.eventId ? String(meta.eventId) : undefined,
      groupId: meta.groupId ? String(meta.groupId) : undefined,
      groupVehicleIndex: Number(meta.groupVehicleIndex || 1),
      groupTotalVehicles: Number(meta.groupTotalVehicles || 1),
      sourceSenderEmail: meta.sourceSenderEmail ? String(meta.sourceSenderEmail) : undefined,
      sourceMessageId: meta.sourceMessageId ? String(meta.sourceMessageId) : undefined,
      score,
      reasons,
    }];
  }).sort((a, b) => b.score - a.score || a.scheduleId.localeCompare(b.scheduleId)).slice(0, 6);
}

/** No AI call: read a bounded candidate window from this organisation only. */
export async function findEmailBookingCandidates(input: MatchingEmailInput): Promise<ExistingEmailBookingCandidate[]> {
  let candidates: ExistingEmailBookingCandidate[] = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.pickupDate)) {
    const center = Date.parse(input.pickupDate + 'T00:00:00Z');
    const start = new Date(center - 2 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(center + 2 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin.from('schedules')
      .select('id,org_id,date,pickup_time,end_time,origin,destination,passenger_name,passenger_count,vehicle_plate,vehicle_model,vehicle_id,driver_id,driver_name,driver_phone,flight_number,protocol_notes,dispatch_status,status,version,schedule_meta')
      .eq('org_id', 'vip_limousine_korea').gte('date', start).lte('date', end)
      .order('date', { ascending: true }).limit(300);
    if (error || !data) throw new Error('기존 예약 조회에 실패했습니다. 중복 생성 방지를 위해 다시 시도해 주세요.');
    if (data.length === 300) throw new Error('기존 예약 후보가 너무 많습니다. 날짜를 지정한 뒤 다시 확인해 주세요.');
    candidates = matchEmailBookingCandidates(input, data as Array<Record<string, any>>);
  }
  if (candidates.length) return candidates;

  // A rescheduled trip can move more than two days. Only search wider when
  // an exact RFC822 thread ID or a stored booking number is available.
  const thread = [input.inReplyTo, ...(input.references || [])].find(value => typeof value === 'string' && /^<[^<>\\r\\n]{3,240}>$/.test(value));
  const bookingNumber = input.subject.match(/#[0-9]{6}-[0-9]{3}/)?.[0];
  if (!thread && !bookingNumber) return [];
  const additional: Array<Record<string, any>> = [];
  const base = () => supabaseAdmin.from('schedules')
    .select('id,org_id,date,pickup_time,end_time,origin,destination,passenger_name,passenger_count,vehicle_plate,vehicle_model,vehicle_id,driver_id,driver_name,driver_phone,flight_number,protocol_notes,dispatch_status,status,version,schedule_meta')
    .eq('org_id', 'vip_limousine_korea').limit(30);
  if (thread) {
    const query = await base().contains('schedule_meta', { sourceMessageId: thread });
    if (query.error) throw new Error('이메일 대화의 기존 예약을 조회할 수 없습니다.');
    additional.push(...(query.data || []) as Array<Record<string, any>>);
  }
  if (bookingNumber) {
    const query = await base().contains('schedule_meta', { bookingNo: bookingNumber });
    if (query.error) throw new Error('예약번호의 기존 예약을 조회할 수 없습니다.');
    additional.push(...(query.data || []) as Array<Record<string, any>>);
  }
  return matchEmailBookingCandidates(input, additional);
}

