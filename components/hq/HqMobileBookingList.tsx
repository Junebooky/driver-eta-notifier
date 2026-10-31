'use client';
import type { HqBooking } from '@/types/hq';

export function HqMobileBookingList({ bookings, onView, onAssign }: {
  bookings: HqBooking[]; onView: (booking: HqBooking) => void; onAssign: (booking: HqBooking) => void;
}) {
  return <div aria-label="모바일 배차 일정" className="space-y-3 lg:hidden">
    {bookings.length===0 && <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">선택한 조건의 일정이 없습니다.</p>}
    {bookings.map(row => <article key={row.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={()=>onView(row)} className="w-full p-4 text-left">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><strong className="text-[#1E60F3]">{row.pickupDate} · {row.pickupTime}</strong><span className="rounded-lg bg-slate-100 px-2 py-1 font-bold">{row.dispatchStatus}</span></div>
        <h3 className="mt-3 break-words font-bold text-slate-900">{row.customerName}</h3>
        {row.groupTotalVehicles && row.groupTotalVehicles>1 && <p className="mt-1 text-xs text-slate-500">{row.groupVehicleIndex || 1}호차 / 총 {row.groupTotalVehicles}대</p>}
        <p className="mt-3 break-words text-sm text-slate-600">{row.pickupLocation} → {row.destination}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><p className="break-words">차량 <strong className="block pt-1 text-sm text-slate-800">{row.vehiclePlate || '미배정'}</strong></p><p className="break-words">기사 <strong className="block pt-1 text-sm text-slate-800">{row.driverName || '미배정'}</strong></p></div>
        <p className={`mt-3 text-xs font-bold ${row.driverAck==='확인완료'?'text-emerald-700':'text-amber-700'}`}>기사 확인 · {row.driverAck}</p>
        {row.hasConflict && <p className="mt-2 text-xs font-bold text-rose-700">일정 충돌 확인이 필요합니다.</p>}
      </button>
      {!['취소','운행 완료'].includes(row.dispatchStatus) && <div className="border-t border-slate-100 p-3"><button type="button" onClick={()=>onAssign(row)} className="min-h-12 w-full rounded-xl bg-[#1E60F3] px-4 py-3 text-sm font-bold text-white">{['미배정','작성 중'].includes(row.dispatchStatus)?'차량·기사 배정':'배정 확인·변경'}</button></div>}
    </article>)}
  </div>;
}
