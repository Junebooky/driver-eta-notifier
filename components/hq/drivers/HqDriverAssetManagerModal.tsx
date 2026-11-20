'use client';

import React, {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,ExternalLink,ImageIcon,Loader2,RefreshCw} from 'lucide-react';
import type {HqDriverSummary} from '@/types/driverHq';
import type {DriverVehicleAssetBundle} from '@/types/driverVehicleAsset';
import {resolveDispatchCardPhotos} from '@/lib/dispatchCards/dispatchCardAssets';
import {useHqFleetRegistry} from '@/hooks/useHqFleetRegistry';
import {HqButton,HqBadge,HqCard} from '@/components/hq/ui';
import {HqModal} from '@/components/hq/ui/HqModal';
import {HqSearchSelect} from '@/components/hq/ui/HqSearchSelect';
import {HqDispatchCardBuilderModal} from './HqDispatchCardBuilderModal';

export interface HqDriverAssetManagerModalProps {
  isOpen:boolean;
  onClose:()=>void;
  drivers:HqDriverSummary[];
  initialDriverId?:string;
  initialVehiclePlate?:string;
  onAssetUpdated?:()=>void;
}

/**
 * One card system only: read registered, generated PC/mobile cards and open
 * the shared builder for updates. Legacy manual card upload is intentionally
 * absent. Existing historic files and immutable dispatch logs are untouched.
 */
export function HqDriverAssetManagerModal({
  isOpen,onClose,drivers,initialDriverId,initialVehiclePlate,onAssetUpdated,
}:HqDriverAssetManagerModalProps) {
  const fleet=useHqFleetRegistry(isOpen);
  const [selectedDriverId,setSelectedDriverId]=useState(initialDriverId||'');
  const [selectedVehiclePlate,setSelectedVehiclePlate]=useState(initialVehiclePlate||'');
  const [builderOpen,setBuilderOpen]=useState(false);
  const [bundle,setBundle]=useState<DriverVehicleAssetBundle|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);

  const imageVehicles=useMemo(
    ()=>fleet.vehicles.filter(vehicle=>Boolean(resolveDispatchCardPhotos(vehicle))),
    [fleet.vehicles],
  );
  useEffect(()=>{
    if(!isOpen)return;
    setSelectedDriverId(initialDriverId||drivers[0]?.id||'');
    setSelectedVehiclePlate(initialVehiclePlate||'');
    setBuilderOpen(false);
    setError('');
  // Only reset when opened for a new booking / driver.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isOpen,initialDriverId,initialVehiclePlate]);
  const driver=drivers.find(item=>item.id===selectedDriverId)||null;
  const selectedVehicle=imageVehicles.find(v=>v.plate===selectedVehiclePlate)||null;
  useEffect(()=>{
    if(!isOpen||fleet.loading||fleet.error||selectedVehicle||!imageVehicles.length)return;
    if(!initialVehiclePlate) setSelectedVehiclePlate(imageVehicles[0].plate);
  },[isOpen,fleet.loading,fleet.error,selectedVehicle,imageVehicles,initialVehiclePlate]);
  useEffect(()=>{
    if(!isOpen||builderOpen||!driver||!selectedVehicle){
      setBundle(null);return;
    }
    let cancelled=false;
    setLoading(true);
    setError('');
    const query=new URLSearchParams({
      driverId:driver.id,vehicleId:selectedVehicle.uuid,type:'bundle',
    });
    fetch('/api/hq/drivers/assets?'+query.toString(),{cache:'no-store'})
      .then(async response=>{
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!result.ok)throw new Error(result.error||'배차카드를 확인할 수 없습니다.');
        if(!cancelled)setBundle(result.bundle||null);
      })
      .catch(err=>{if(!cancelled){setBundle(null);setError(err instanceof Error?err.message:'배차카드 조회 오류');}})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[isOpen,builderOpen,driver?.id,selectedVehicle?.uuid,revision]);

  const refresh=()=>{
    setRevision(i=>i+1);
    onAssetUpdated?.();
  };
  return <>
    <HqModal isOpen={isOpen&&!builderOpen} onClose={onClose}
      title="기사 배차카드" subtitle="새 제작기에서 생성한 카드만 사용합니다"
      className="max-w-[920px]"
      footer={<HqButton variant="secondary" onClick={onClose}>닫기</HqButton>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#526680]">기사 선택</label>
            <HqSearchSelect
              label="배차카드 관리 기사"
              value={selectedDriverId}
              onChange={setSelectedDriverId}
              placeholder="기사 선택"
              options={drivers.map(item=>({value:item.id,label:item.name,subtitle:item.phone||'연락처 없음'}))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#526680]">차량 선택</label>
            <HqSearchSelect
              label="배차카드 관리 차량"
              value={selectedVehiclePlate}
              onChange={setSelectedVehiclePlate}
              placeholder="차량번호로 검색"
              options={imageVehicles.map(item=>({value:item.plate,label:item.plate,subtitle:item.model}))}
            />
          </div>
        </div>
        {fleet.error&&<p role="alert" className="text-[12px] text-[#B05B57]">{fleet.error}</p>}
        {error&&<p role="alert" className="text-[12px] text-[#B05B57]">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <HqBadge>{bundle?.isFullyComplete?'PC·모바일 준비 완료':bundle?.isReadyForCustomerDispatch?'일부 카드 준비':'카드 생성·갱신 필요'}</HqBadge>
            {selectedVehicle&&<span className="text-[12px] text-[#73839D]">{selectedVehicle.plate}</span>}
          </div>
          <div className="flex items-center gap-2">
            <HqButton variant="subtle" size="sm" onClick={()=>setRevision(v=>v+1)} disabled={loading}>
              <RefreshCw className="size-4"/> 새로고침
            </HqButton>
            <HqButton variant="primary" size="sm" disabled={!driver||!selectedVehicle||fleet.loading}
              onClick={()=>setBuilderOpen(true)}>
              <ImageIcon className="size-4"/> 배차카드 만들기·수정
            </HqButton>
          </div>
        </div>
        {loading?<div role="status" className="flex min-h-40 items-center justify-center gap-2 text-[12px] text-[#73839D]">
          <Loader2 className="size-4 animate-spin"/> 카드 불러오는 중…
        </div>:<div className="grid gap-3 sm:grid-cols-2">
          {(['pc','mobile'] as const).map(variant=>{
            const asset=variant==='pc'?bundle?.pcInfo:bundle?.mobileInfo;
            return <HqCard key={variant} className="p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-[#243750]">{variant==='pc'?'PC 가로형':'모바일 세로형'}</h3>
                <HqBadge>{asset?'최신 카드':'미생성·갱신 필요'}</HqBadge>
              </div>
              <div className="flex h-[240px] items-center justify-center rounded-[13px] bg-[#F7F9FC] p-3">
                {asset?.signedUrl?<img src={asset.signedUrl}
                  alt={variant==='pc'?'PC 배차카드':'모바일 배차카드'}
                  className="max-h-full max-w-full object-contain"/>:
                  <div className="flex flex-col items-center gap-2 text-center text-[12px] text-[#7C8AA0]">
                    <AlertTriangle className="size-5"/>
                    <span>신규 제작기에서 카드를 만들어 주세요.</span>
                  </div>}
              </div>
              {asset?.signedUrl&&<a href={asset.signedUrl} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex min-h-10 items-center gap-1 text-[12px] font-medium text-[#526680]">
                <ExternalLink className="size-4"/> 원본 보기
              </a>}
            </HqCard>;
          })}
        </div>}
        <p className="text-[11px] leading-relaxed text-[#8391A3]">
          예전 수동 업로드 기능은 제거했어요. 이름·직책·전화번호 또는 사진이 변경되면
          ‘배차카드 만들기·수정’에서 이 기사의 모든 차량 카드에 새 버전을 반영하세요.
        </p>
      </div>
    </HqModal>
    {builderOpen&&driver&&(
      <HqDispatchCardBuilderModal
        isOpen={isOpen&&builderOpen} driver={driver} vehicles={fleet.vehicles}
        initialVehicleId={selectedVehicle?.uuid}
        onClose={()=>setBuilderOpen(false)}
        onAssetUpdated={refresh}
        onProfileUpdated={refresh}
      />
    )}
  </>;
}
