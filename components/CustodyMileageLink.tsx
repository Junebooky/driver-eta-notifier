'use client';
import { useVehicleCustody } from '@/hooks/useVehicleCustody';
import { custodyOdometerForLog } from '@/utils/vehicleCustody';

export function CustodyMileageLink({ driverId, bookingId, date, onApply }: {
  driverId?: string; bookingId?: string; date: string;
  onApply: (value: NonNullable<ReturnType<typeof custodyOdometerForLog>>) => void;
}) {
  const { data, error } = useVehicleCustody(Boolean(driverId && bookingId));
  const candidates = data?.custodies.filter(row => row.booking_id === bookingId && row.driver_id === driverId && row.returned_at)
    .sort((a,b) => b.picked_up_at.localeCompare(a.picked_up_at)) || [];
  const mileage = candidates.map(row => custodyOdometerForLog(row, bookingId, driverId, date)).find(Boolean);
  if (!driverId || !bookingId) return null;
  if (error) return <p className="text-xs text-amber-800">인수·반납 기록 조회 실패 · 주행거리는 직접 확인해 입력해 주세요.</p>;
  if (!mileage) return <p className="text-xs text-slate-500">같은 일정·날짜에 반납까지 확인된 기록이 있으면 계기판 값을 불러올 수 있습니다.</p>;
  return <div className="rounded-xl bg-blue-50 p-3 text-sm">
    <p className="font-bold text-[#1E60F3]">서버 인수·반납 계기판 · {mileage.carNumber}</p>
    <p className="mt-1 text-slate-600">{Number(mileage.startKm).toLocaleString()} → {Number(mileage.endKm).toLocaleString()} km</p>
    <button type="button" onClick={() => onApply(mileage)} className="mt-2 min-h-11 rounded-lg bg-white px-3 font-bold text-[#1E60F3]">이 계기판 값을 운행일지에 적용</button>
  </div>;
}
