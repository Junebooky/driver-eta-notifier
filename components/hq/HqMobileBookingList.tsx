'use client';
import type { HqBooking } from '@/types/hq';

export function HqMobileBookingList({
  bookings,
  onView,
  onAssign,
}: {
  bookings: HqBooking[];
  onView: (booking: HqBooking) => void;
  onAssign: (booking: HqBooking) => void;
}) {
  return (
    <div aria-label="모바일 배차 일정" className="space-y-3 lg:hidden pt-1">
      {bookings.length === 0 && (
        <p className="rounded-2xl bg-slate-50 border border-slate-200/80 p-6 text-center text-sm font-medium text-slate-500">
          선택한 조건의 일정이 없습니다.
        </p>
      )}
      {bookings.map((row) => (
        <article
          key={row.id}
          className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] hover:shadow-[0_10px_28px_rgba(30,96,243,0.10)] hover:border-blue-200/80 transition-all duration-200"
        >
          <button
            type="button"
            onClick={() => onView(row)}
            className="w-full p-4 text-left cursor-pointer"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <strong className="font-extrabold text-[#1E60F3] tracking-tight">
                {row.pickupDate} · {row.pickupTime}
              </strong>
              <span
                className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${
                  row.dispatchStatus === '배차 완료'
                    ? 'bg-[#EBF3FF] text-[#1E60F3]'
                    : row.dispatchStatus === '미배정'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-700'
                }`}
              >
                {row.dispatchStatus}
              </span>
            </div>
            <h3 className="mt-2.5 break-words text-base font-extrabold text-slate-900 tracking-tight">
              {row.customerName}
            </h3>
            {row.groupTotalVehicles && row.groupTotalVehicles > 1 && (
              <p className="mt-1 text-xs font-medium text-slate-500">
                {row.groupVehicleIndex || 1}호차 / 총 {row.groupTotalVehicles}대
              </p>
            )}
            <p className="mt-2.5 break-words text-sm font-medium text-slate-600 leading-snug">
              {row.pickupLocation} → {row.destination}
            </p>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50/80 border border-slate-100 p-3 text-xs text-slate-500">
              <p className="break-words">
                차량
                <strong className="block pt-1 text-sm font-extrabold text-slate-800">
                  {row.vehiclePlate || '미배정'}
                </strong>
              </p>
              <p className="break-words">
                기사
                <strong className="block pt-1 text-sm font-extrabold text-slate-800">
                  {row.driverName || '미배정'}
                </strong>
              </p>
            </div>
            <p
              className={`mt-3 text-xs font-extrabold ${
                row.driverAck === '확인완료' ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              기사 확인 · {row.driverAck}
            </p>
            {row.hasConflict && (
              <p className="mt-2 text-xs font-bold text-rose-600">
                일정 충돌 확인이 필요합니다.
              </p>
            )}
          </button>
          {!['취소', '운행 완료'].includes(row.dispatchStatus) && (
            <div className="border-t border-slate-100 px-4 py-3 bg-white">
              <button
                type="button"
                onClick={() => onAssign(row)}
                className="min-h-11 w-full rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-[0.99] px-4 py-2.5 text-sm font-extrabold text-white shadow-xs transition-all cursor-pointer"
              >
                {['미배정', '작성 중'].includes(row.dispatchStatus)
                  ? '차량·기사 배정'
                  : '배정 확인·변경'}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
