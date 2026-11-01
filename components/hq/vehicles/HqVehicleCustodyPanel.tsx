'use client';
import { useRef, useState } from 'react';
import { useVehicleCustody } from '@/hooks/useVehicleCustody';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';

export function HqVehicleCustodyPanel({ vehicleId, onOpenBooking }: { vehicleId?: string; onOpenBooking?: (id: string) => void }) {
  const { data, error, refresh } = useVehicleCustody();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const vehicle = VIP_REAL_VEHICLES.find(row => row.uuid === vehicleId);
  const leases = (data?.custodies || []).filter(row => !vehicleId || row.vehicle_id === vehicleId).sort((a,b) => Number(Boolean(a.returned_at))-Number(Boolean(b.returned_at)) || b.picked_up_at.localeCompare(a.picked_up_at));
  const alerts = (data?.mismatches || []).filter(row => !vehicle || row.result.assignedPlate === vehicle.plate || row.result.actualPlate === vehicle.plate);
  const resolve = async (requestId: string) => {
    if (lock.current) return;
    lock.current = true; setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/vehicle-custody', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, note: notes[requestId] || '' }) });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || '관리자 확인 내용을 저장하지 못했습니다.');
      setMessage(result.message); await refresh(true);
      window.dispatchEvent(new Event('vip_vehicle_custody_updated'));
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장 결과를 확인하지 못했습니다.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <section aria-label="차량 인수·반납 및 불일치 확인" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-slate-900">차량 인수·반납</h3><button type="button" onClick={() => void refresh(true)} className="min-h-11 text-sm font-bold text-[#1E60F3]">새로고침</button></div>
    <p className="text-xs text-slate-500">기사의 실제 차량 확인 기록 · 8초 갱신 · 운행 및 출퇴근 시간과 별도</p>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error} 이전 기록은 최신 상태로 간주하지 마세요.</p>}
    {!data && !error && <p role="status" className="text-sm text-slate-500">인수 기록을 확인하고 있습니다.</p>}
    {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    {!error && alerts.map(row => <article key={row.request_id} className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
      <h4 className="font-bold text-rose-800">차량 불일치 · 관리자 확인 대기</h4>
      <p className="break-words text-sm">{row.driver_name} · 배정 {row.result.assignedPlate} → 실제 선택 {row.result.actualPlate}</p>
      <p className="break-words text-sm text-rose-900">{row.result.reason}</p>
      <p className="text-xs text-slate-600">선택한 차량을 인수 처리하거나 배차를 자동으로 바꾸지 않았습니다.</p>
      {onOpenBooking && <button type="button" onClick={() => onOpenBooking(row.booking_id)} className="min-h-11 rounded-lg bg-white px-3 text-sm font-bold text-[#1E60F3]">배차 확인</button>}
      <label className="block text-xs font-bold text-slate-700">관리자 확인 내용<input value={notes[row.request_id] || ''} maxLength={1000} onChange={event => setNotes(previous => ({ ...previous, [row.request_id]: event.target.value }))} placeholder="기사에게 안내한 내용과 배차 조치 기록" className="mt-1 min-h-11 w-full rounded-lg border border-rose-200 bg-white p-2 text-base" /></label>
      <button type="button" disabled={saving || !notes[row.request_id]?.trim()} onClick={() => void resolve(row.request_id)} className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-40">확인 내용 저장 · 배차 변경은 별도</button>
      {row.result.hasPhoto && <a href={`/api/vehicle-custody/photo?requestId=${row.request_id}`} target="_blank" rel="noreferrer" className="ml-2 inline-block py-3 text-xs text-[#1E60F3]">첨부 계기판 사진 확인</a>}
    </article>)}
    {!error && leases.slice(0, vehicleId ? 3 : 5).map(row => <article key={row.id} className="rounded-xl bg-slate-50 p-3 text-sm">
      <p className="font-bold">{row.vehicle_plate} · {row.returned_at ? '반납 완료' : '인수 중'}</p>
      <p className="mt-1 text-slate-600">{row.driver_name} · 인수 {new Date(row.picked_up_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {row.pickup_odometer.toLocaleString()} km</p>
      {row.returned_at && <p className="mt-1 text-slate-600">반납 {new Date(row.returned_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {row.return_odometer?.toLocaleString()} km</p>}
      {row.pickup_details.photoPath && row.pickup_request_id && <a href={`/api/vehicle-custody/photo?requestId=${row.pickup_request_id}`} target="_blank" rel="noreferrer" className="mr-3 inline-block py-2 text-xs text-[#1E60F3]">인수 계기판 원본</a>}
      {row.return_details?.photoPath && row.return_request_id && <a href={`/api/vehicle-custody/photo?requestId=${row.return_request_id}`} target="_blank" rel="noreferrer" className="inline-block py-2 text-xs text-[#1E60F3]">반납 계기판 원본</a>}
      {row.return_details?.parkingLocation && <p className="mt-1 break-words text-slate-600">주차 위치: {row.return_details.parkingLocation}</p>}
      {row.return_details?.keyLocation && <p className="mt-1 break-words text-slate-600">키 위치: {row.return_details.keyLocation}</p>}
    </article>)}
    {!error && data && !leases.length && !alerts.length && <p className="text-sm text-slate-500">조회된 인수·반납 기록이나 미처리 불일치 요청이 없습니다.</p>}
  </section>;
}
