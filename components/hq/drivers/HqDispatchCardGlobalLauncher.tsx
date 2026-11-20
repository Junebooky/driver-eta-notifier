'use client';

import {useCallback,useEffect,useState} from 'react';
import {Loader2} from 'lucide-react';
import {useHqDrivers} from '@/utils/useHqDrivers';
import type {HqDriverSummary} from '@/types/driverHq';
import type {DispatchCardCoverage} from '@/lib/dispatchCards/dispatchCardCoverage';
import {HqButton} from '@/components/hq/ui';
import {HqModal} from '@/components/hq/ui/HqModal';
import {HqDispatchCardQuickFindModal} from './HqDispatchCardQuickFindModal';
import {HqDriverAssetManagerModal} from './HqDriverAssetManagerModal';
import {HqDispatchCardBuilderModal} from './HqDispatchCardBuilderModal';

/**
 * One lazy entrypoint for HQ-wide plate-first lookup.
 * The same quick finder and card builder already used in the driver roster are
 * reused here. Nothing is fetched until the user opens this launcher.
 */
export function HqDispatchCardGlobalLauncher({onClose}:{onClose:()=>void}){
  const {drivers,isLoading,error:driversError,refetch}=useHqDrivers();
  const [coverage,setCoverage]=useState<DispatchCardCoverage|null>(null);
  const [coverageLoading,setCoverageLoading]=useState(true);
  const [coverageError,setCoverageError]=useState('');
  const [previewTarget,setPreviewTarget]=useState<{driverId:string;plate:string}|null>(null);
  const [builderTarget,setBuilderTarget]=useState<{driver:HqDriverSummary;vehicleId:string}|null>(null);

  const refreshCoverage=useCallback(async()=>{
    setCoverageLoading(true);
    try{
      const response=await fetch('/api/hq/drivers/assets/coverage',{cache:'no-store'});
      const data=(await response.json().catch(()=>({}))) as {ok?:boolean;coverage?:DispatchCardCoverage;error?:string};
      if(!response.ok||!data.ok||!data.coverage)throw Error(data.error||'배차카드 목록을 확인하지 못했습니다.');
      setCoverage(data.coverage);
      setCoverageError('');
    }catch(error){
      setCoverageError(error instanceof Error?error.message:'배차카드 목록을 불러오지 못했습니다.');
    }finally{setCoverageLoading(false);}
  },[]);

  useEffect(()=>{void refreshCoverage();},[refreshCoverage]);
  const refreshAfterSave=()=>{
    void refreshCoverage();
    void refetch();
  };

  // Only one modal is visible at a time; keep the search available when a
  // preview/editor is closed, so HQ staff can send several cards quickly.
  if(previewTarget)return <HqDriverAssetManagerModal
    isOpen drivers={drivers}
    initialDriverId={previewTarget.driverId}
    initialVehiclePlate={previewTarget.plate}
    preferRegisteredVehicle={false}
    onClose={()=>setPreviewTarget(null)}
    onAssetUpdated={refreshAfterSave}/>;

  if(builderTarget&&coverage)return <HqDispatchCardBuilderModal
    isOpen driver={builderTarget.driver} vehicles={coverage.vehicles}
    initialVehicleId={builderTarget.vehicleId}
    onClose={()=>setBuilderTarget(null)}
    onAssetUpdated={refreshAfterSave} onProfileUpdated={refreshAfterSave}/>;

  if((isLoading&&!drivers.length)||(coverageLoading&&!coverage)||!coverage||driversError&&!drivers.length){
    return <HqModal isOpen title="배차카드 빠른 검색"
      subtitle="차량번호를 검색해 기사 인포카드를 바로 공유하세요."
      onClose={onClose} className="max-w-[520px]">
      {(isLoading&&!drivers.length)||(coverageLoading&&!coverage)?
        <div role="status" className="flex items-center justify-center gap-2 py-12 text-[13px] text-[#73839D]">
          <Loader2 className="size-4 animate-spin" aria-hidden="true"/> 배차카드 목록을 불러오는 중…
        </div>:
        <div className="space-y-4 py-6">
          <p role="alert" className="text-[13px] text-[#63758E]">{coverageError||driversError||'배차카드 목록이 없습니다.'}</p>
          <div className="flex justify-end gap-2">
            <HqButton variant="subtle" onClick={onClose}>닫기</HqButton>
            <HqButton variant="primary" onClick={()=>{void refreshCoverage();void refetch();}}>다시 시도</HqButton>
          </div>
        </div>}
    </HqModal>;
  }

  return <HqDispatchCardQuickFindModal
    isOpen coverage={coverage} drivers={drivers}
    onClose={onClose}
    onView={(driverId,plate)=>setPreviewTarget({driverId,plate})}
    onCreate={(driver,vehicleId)=>setBuilderTarget({driver,vehicleId})}/>;
}
