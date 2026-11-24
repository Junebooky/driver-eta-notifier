import type { VehicleCustody, VehicleCustodyState, CustodyWrite } from '@/types/vehicleCustody';
import { parseKstDateTimeToMs } from '@/utils/dispatchConflictDetector';

export function custodyBlocksInterval(custody: VehicleCustody, query: { startDate: string; startTime: string; endDate?: string; endTime: string; excludeScheduleId?: string }, now = Date.now()) {
  if (custody.returned_at || custody.booking_id === query.excludeScheduleId) return false;
  const planned = Date.parse(custody.expected_return_at);
  const until = !Number.isFinite(planned) || planned <= now ? Infinity : planned + 60 * 60_000;
  const start = parseKstDateTimeToMs(query.startDate, query.startTime);
  const end = parseKstDateTimeToMs(query.endDate || query.startDate, query.endTime);
  return start < until && Date.parse(custody.picked_up_at) < end;
}
export async function fetchVehicleCustody(): Promise<VehicleCustodyState> {
  const response = await fetch('/api/vehicle-custody', { credentials: 'include', cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true || !Array.isArray(data.bookings) || !Array.isArray(data.custodies) || !Array.isArray(data.mismatches))
    throw new Error(data.error || '최신 차량 인수·반납 기록을 불러오지 못했습니다.');
  return data;
}
export async function inspectionPhotoForSubmission(url: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  if (!url.startsWith('blob:') && !url.startsWith('data:image/')) throw new Error('이 기기에서 촬영·선택한 계기판 원본 사진을 다시 첨부해 주세요.');
  const blob = await (await fetch(url)).blob();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 3 * 1024 * 1024)
    throw new Error('계기판 사진은 3MB 이하 JPG·PNG·WebP로 선택해 주세요.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('계기판 사진을 읽지 못했습니다.')); reader.readAsDataURL(blob);
  });
}
export function custodyOdometerForLog(custody: VehicleCustody, bookingId: string | undefined, driverId: string | undefined, date: string) {
  if (!bookingId || !driverId || custody.booking_id !== bookingId || custody.driver_id !== driverId || !custody.returned_at) return null;
  // A multi-day possession interval cannot be treated as one day's mileage.
  const day = (at: string) => new Date(at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  if (day(custody.picked_up_at) !== date || day(custody.returned_at) !== date || custody.return_odometer === null) return null;
  return { startKm: String(custody.pickup_odometer), endKm: String(custody.return_odometer), vehicleId: custody.vehicle_id, carNumber: custody.vehicle_plate, custodyId: custody.id };
}
export type CustodyFormInspection = CustodyWrite['inspection'];
