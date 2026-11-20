'use client';

import {useHqDrivers} from '@/utils/useHqDrivers';
import {HqDriverAssetManagerModal} from '@/components/hq/drivers/HqDriverAssetManagerModal';

/** Lazy manager entrypoint for Quick Dispatch, avoiding a permanent drivers hook
 * in the HQ dashboard. Opens the exact same builder used in 기사관리. */
export function HqBookingCardManagerLauncher({
  driverId,vehiclePlate,onClose,onSaved,
}:{
  driverId:string;vehiclePlate:string;onClose:()=>void;onSaved?:()=>void;
}) {
  const {drivers,isLoading,error,refetch}=useHqDrivers();
  if(isLoading&&!drivers.length)return <div role="status" className="fixed inset-0 z-[95] flex items-center justify-center bg-[#17233B]/20 p-5">
    <span className="rounded-xl bg-white p-4 text-[13px] text-[#526680]">기사 정보 확인 중…</span>
  </div>;
  if(error&&!drivers.length)return <div role="alertdialog" aria-modal="true"
    className="fixed inset-0 z-[95] flex items-center justify-center bg-[#17233B]/20 p-5">
    <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5">
      <p className="text-[13px] text-[#526680]">기사 정보를 불러올 수 없습니다. 관리자 인증과 연결 상태를 확인해 주세요.</p>
      <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-[#F7F9FC] px-4 text-[13px] font-medium">닫기</button>
    </div>
  </div>;
  return <HqDriverAssetManagerModal isOpen onClose={onClose} drivers={drivers}
    initialDriverId={driverId} initialVehiclePlate={vehiclePlate}
    preferRegisteredVehicle={false}
    onAssetUpdated={()=>{void refetch();onSaved?.();}}/>;
}
