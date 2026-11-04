import { readActiveCustodies } from './operationsStore';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { CockpitAuthSession } from '@/lib/auth/serverAuth';
import { hydrateRawScheduleRow } from '@/lib/dispatch/scheduleServerStore';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';
import { isReportingUuid } from '@/utils/receiptSubmission';
import { getKstTodayDateStr, shiftIsoDate } from '@/utils/dispatchConflictDetector';
import type { CustodyInspection, VehicleCustody, VehicleCustodyState, CustodyMismatch } from '@/types/vehicleCustody';

export class CustodyError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function readCustodyState(session: CockpitAuthSession): Promise<VehicleCustodyState> {
  const driver = session.role === 'driver';
  if (driver && !isReportingUuid(session.driverId)) throw new CustodyError('확인된 기사 계정이 필요합니다.', 403);
  let leases = supabaseAdmin.from('vehicle_custodies').select('*').eq('organization_id', session.org);
  let alerts = supabaseAdmin.from('vehicle_custody_requests').select('request_id,booking_id,driver_id,driver_name,created_at,resolved_at,result')
    .eq('organization_id', session.org).eq('result->>outcome', 'mismatch').is('resolved_at', null);
  if (driver) { leases = leases.eq('driver_id', session.driverId!); alerts = alerts.eq('driver_id', session.driverId!); }
  const [recent, mismatches, active] = await Promise.all([
    leases.order('picked_up_at', { ascending: false }).limit(100),
    alerts.order('created_at', { ascending: false }).limit(1001),
    driver ? Promise.resolve(null) : readActiveCustodies(),
  ]);
  if (recent.error || mismatches.error || !Array.isArray(recent.data) || !Array.isArray(mismatches.data) || mismatches.data.length > 1000)
    throw new CustodyError('최신 인수·반납 기록과 확인 요청을 불러오지 못했습니다.', 503);
  let bookings: VehicleCustodyState['bookings'] = [];
  if (driver) {
    const today = getKstTodayDateStr(), tomorrow = shiftIsoDate(today, 1);
    const { data, error } = await supabaseAdmin.from('schedules').select('*').eq('driver_id', session.driverId!)
      .or(`end_date.gte.${today},date.gte.${today}`).lte('date', tomorrow).order('date', { ascending: false }).limit(1001);
    if (error || !Array.isArray(data) || data.length > 1000) throw new CustodyError('배정 일정을 불러오지 못했습니다. 관리자에게 확인해 주세요.', 503);
    bookings = data.filter(row => (!row.org_id || row.org_id === session.org)).map(hydrateRawScheduleRow)
      .filter(row => row.dispatch_status === 'published' && row.status !== 'completed' && row.status !== 'cancelled' && row._meta.serviceMode !== 'vehicle_only' && row.date <= tomorrow && (row.end_date || row.date) >= today)
      .map(row => ({ id: row.id, version: row.version || 1, vehicle_id: row.vehicle_id || null,
        vehicle_plate: row._meta.vehiclePlate || '', date: row.date, pickup_time: row.pickup_time,
        end_date: row.end_date || null, end_time: row.end_time || null, origin: row.origin, destination: row.destination }));
    // Top-level plate is authoritative when the metadata predates the latest dispatch write.
    for (const booking of bookings) {
      const raw = data.find(row => row.id === booking.id);
      booking.vehicle_plate = raw?.vehicle_plate || booking.vehicle_plate || raw?.vehicle_no || '';
    }
  }
  const all = new Map<string, VehicleCustody>();
  for (const item of [...recent.data as VehicleCustody[], ...(active || [])]) all.set(item.id, item);
  return { bookings, custodies: [...all.values()], mismatches: mismatches.data as CustodyMismatch[] };
}

function text(value: unknown, max: number, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) throw new CustodyError('점검 내용의 형식과 길이를 확인해 주세요.');
  return value.trim();
}
export function normalizeCustodyWrite(body: Record<string, unknown>) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CustodyError('점검 요청 형식을 확인해 주세요.');
  if (body.action !== 'pickup' && body.action !== 'return') throw new CustodyError('인수 또는 반납을 선택해 주세요.');
  const vehicle = VIP_REAL_VEHICLES.find(row => row.uuid === body.vehicleId);
  if (!vehicle || body.confirmed !== true) throw new CustodyError('실제 차량번호와 계기판을 확인해 주세요.');
  if (body.action === 'pickup' && (!isReportingUuid(body.bookingId) || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1))
    throw new CustodyError('최신 배정 일정과 버전을 확인해 주세요.');
  if (body.action === 'return' && !isReportingUuid(body.custodyId)) throw new CustodyError('서버의 인수 기록을 먼저 확인해 주세요.');
  const input = body.inspection as Record<string, unknown> | undefined;
  if (!input || !Number.isSafeInteger(input.odometer) || Number(input.odometer) < 0 || Number(input.odometer) > 9999999 ||
      (input.dte !== undefined && (!Number.isSafeInteger(input.dte) || Number(input.dte) < 0 || Number(input.dte) > 10000)))
    throw new CustodyError('계기판 주행거리와 주행가능거리를 확인해 주세요.');
  if (input.parts !== undefined && (!Array.isArray(input.parts) || input.parts.length > 30 || input.parts.some(part => typeof part !== 'string' || part.length > 100)))
    throw new CustodyError('손상 부위 입력을 확인해 주세요.');
  const inspection: CustodyInspection = { odometer: Number(input.odometer), damage: text(input.damage, 2000, '무'), parts: (input.parts || []) as string[] };
  if (input.dte !== undefined) inspection.dte = Number(input.dte);
  if (body.action === 'return') { inspection.parkingLocation = text(input.parkingLocation, 500); inspection.keyLocation = text(input.keyLocation, 500); }
  if (body.photo !== undefined && (typeof body.photo !== 'string' || body.photo.length > 4_200_000)) throw new CustodyError('계기판 사진은 3MB 이하 JPG·PNG·WebP로 선택해 주세요.');
  return { action: body.action, bookingId: body.action === 'pickup' ? body.bookingId as string : undefined,
    expectedVersion: body.action === 'pickup' ? body.expectedVersion as number : undefined,
    custodyId: body.action === 'return' ? body.custodyId as string : undefined,
    vehicleId: vehicle.uuid, vehiclePlate: vehicle.plate, confirmed: true, reason: text(body.reason, 1000), inspection };
}

export async function storeCustodyPhoto(photo: string, session: CockpitAuthSession): Promise<string> {
  const match = photo.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new CustodyError('계기판 사진을 다시 선택해 주세요.');
  const bytes = Buffer.from(match[2], 'base64');
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  if (!bytes.length || bytes.length > 3 * 1024 * 1024 || !(match[1] === 'image/png' ? isPng : match[1] === 'image/jpeg' ? isJpeg : isWebp))
    throw new CustodyError('계기판 사진은 3MB 이하의 올바른 JPG·PNG·WebP 파일이어야 합니다.');
  const path = `${session.org}/custody/${session.driverId}/${createHash('sha256').update(bytes).digest('hex')}.${match[1].split('/')[1]}`;
  const bucket = supabaseAdmin.storage.from('cockpit-assets');
  const { error } = await bucket.upload(path, bytes, { contentType: match[1], upsert: false });
  if (error) {
    if (String(error.statusCode) !== '409') throw new CustodyError('계기판 원본 사진을 서버에 저장하지 못했습니다.', 503);
    const existing = await bucket.download(path);
    if (existing.error || !existing.data || !Buffer.from(await existing.data.arrayBuffer()).equals(bytes))
      throw new CustodyError('보관된 계기판 사진의 저장 결과를 확인하지 못했습니다.', 503);
  }
  return path;
}
export function custodyFailure(error: { code?: string; message?: string }): CustodyError {
  if (error.code === '42501') return new CustodyError('본인의 차량 인수·반납 기록만 처리할 수 있습니다.', 403);
  if (error.message?.includes('OUTSIDE_SHIFT_WINDOW')) return new CustodyError('인수 가능 시간은 픽업 6시간 전부터 예정 종료 6시간 후까지입니다. 일정 시간을 관리자에게 확인해 주세요.');
  if (error.code === '22023' || error.code === '22P02') return new CustodyError('계기판·차량번호·변경 사유를 확인해 주세요. 반납 거리는 인수 거리보다 작을 수 없습니다.');
  if (['40001', '23P01', '23505'].includes(error.code || '')) return new CustodyError('배차가 변경되었거나 차량·기사가 이미 인수 중입니다. 최신 기록을 확인하고 관리자에게 문의해 주세요.', 409);
  return new CustodyError('인수·반납을 저장하지 못했습니다. 서버 연결과 마이그레이션을 확인한 뒤 같은 요청으로 재확인해 주세요.', 503);
}
