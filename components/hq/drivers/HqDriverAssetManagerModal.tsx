'use client';

import React, {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,ExternalLink,ImageIcon,Loader2,RefreshCw,Share2,Download} from 'lucide-react';
import type {HqDriverSummary} from '@/types/driverHq';
import type {DriverVehicleAssetBundle} from '@/types/driverVehicleAsset';
import {resolveDispatchCardPhotos} from '@/lib/dispatchCards/dispatchCardAssets';
import {useHqFleetRegistry} from '@/hooks/useHqFleetRegistry';
import {
  type DriverCardSummary,
  getVehicleCardStatusMeta,
  partitionDispatchCardVehicles,
  pickDefaultDispatchCardVehicle,
} from '@/utils/driverDispatchCardVehicles';
import {HqButton,HqBadge,HqCard} from '@/components/hq/ui';
import {HqModal} from '@/components/hq/ui/HqModal';
import {HqSearchSelect} from '@/components/hq/ui/HqSearchSelect';
import {HqDispatchCardBuilderModal} from './HqDispatchCardBuilderModal';
import {prepareSavedDispatchCardPng,shareDispatchCardPngPair,supportsDispatchCardPairShare} from '@/utils/shareDispatchCardPng';

export interface HqDriverAssetManagerModalProps {
  isOpen:boolean;
  onClose:()=>void;
  drivers:HqDriverSummary[];
  initialDriverId?:string;
  initialVehiclePlate?:string;
  preferRegisteredVehicle?:boolean;
  onAssetUpdated?:()=>void;
}

/**
 * One card system only: read registered, generated PC/mobile cards and open
 * the shared builder for updates. Legacy manual card upload is intentionally
 * absent. Existing historic files and immutable dispatch logs are untouched.
 */
export function HqDriverAssetManagerModal({
  isOpen,onClose,drivers,initialDriverId,initialVehiclePlate,preferRegisteredVehicle=true,onAssetUpdated,
}:HqDriverAssetManagerModalProps) {
  const fleet=useHqFleetRegistry(isOpen);
  const [selectedDriverId,setSelectedDriverId]=useState(initialDriverId||'');
  const [selectedVehiclePlate,setSelectedVehiclePlate]=useState('');
  const [builderOpen,setBuilderOpen]=useState(false);
  const [bundle,setBundle]=useState<DriverVehicleAssetBundle|null>(null);
  const [vehicleSummary,setVehicleSummary]=useState<DriverCardSummary>({});
  const [summaryResolvedDriverId,setSummaryResolvedDriverId]=useState<string|null>(null);
  const [summaryLoading,setSummaryLoading]=useState(false);
  const [hasUserPickedVehicle,setHasUserPickedVehicle]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  type Variant='pc'|'mobile';
  const [prepared,setPrepared]=useState<Record<Variant,{file:File;path:string}|null>>({pc:null,mobile:null});
  const [preparing,setPreparing]=useState<Record<Variant,boolean>>({pc:false,mobile:false});
  const [sharing,setSharing]=useState(false);
  const [shareFeedback,setShareFeedback]=useState('');

  // Convert from the authenticated same-origin proxy in advance, so sharing
  // can start directly inside the user's click event (mobile gesture-safe).
  useEffect(()=>{
    let cancelled=false;
    setPrepared({pc:null,mobile:null});
    setPreparing({pc:false,mobile:false});
    setShareFeedback('');
    if(!isOpen||!bundle||!selectedVehiclePlate||bundle.driverId!==selectedDriverId||
       bundle.vehiclePlate!==selectedVehiclePlate)return;
    for(const variant of ['pc','mobile'] as const){
      const asset=variant==='pc'?bundle.pcInfo:bundle.mobileInfo;
      if(!asset?.filePath)continue;
      setPreparing(previous=>({...previous,[variant]:true}));
      const path=asset.filePath;
      const fileName='VIP_'+bundle.driverName+'_'+bundle.vehiclePlate+'_'+variant;
      void prepareSavedDispatchCardPng(path,fileName)
        .then(file=>{if(!cancelled)setPrepared(previous=>({...previous,[variant]:{file,path}}));})
        .catch(()=>{if(!cancelled)setShareFeedback('배차카드 PNG 준비에 실패했습니다. 새로고침 후 다시 시도해 주세요.');})
        .finally(()=>{if(!cancelled)setPreparing(previous=>({...previous,[variant]:false}));});
    }
    return ()=>{cancelled=true;};
  },[isOpen,bundle,selectedDriverId,selectedVehiclePlate]);

  const handleShareBoth=async()=>{
    const pc=prepared.pc,mobile=prepared.mobile;
    if(!pc||!mobile||!bundle?.pcInfo?.filePath||!bundle?.mobileInfo?.filePath||
      !bundle.pcInfo.signedUrl||!bundle.mobileInfo.signedUrl||
      pc.path!==bundle.pcInfo.filePath||mobile.path!==bundle.mobileInfo.filePath||
      bundle.driverId!==selectedDriverId||bundle.vehiclePlate!==selectedVehiclePlate||
      sharing||preparing.pc||preparing.mobile)return;
    setSharing(true);setShareFeedback('');
    try{
      // Two real PNG attachments in one native share. Unsupported browsers
      // download one ZIP containing both full-resolution PNG files instead.
      const outcome=await shareDispatchCardPngPair(
        [pc.file,mobile.file],
        'VIP_'+bundle.driverName+'_'+bundle.vehiclePlate+'_PC_Mobile',
      );
      if(outcome==='downloaded')setShareFeedback(
        'PC·모바일 PNG 두 장을 ZIP으로 저장했어요. 메신저에 첨부해 주세요.',
      );
    }catch(e){
      setShareFeedback(e instanceof Error?e.message:'두 배차카드를 공유하지 못했습니다.');
    }finally{setSharing(false);}
  };

  // All registered physical fleet vehicles, including photo-unready vehicles.
  const imageVehicles=fleet.vehicles;
  useEffect(()=>{
    if(!isOpen)return;
    setSelectedDriverId(initialDriverId||drivers[0]?.id||'');
    setSelectedVehiclePlate('');
    setVehicleSummary({});
    setSummaryResolvedDriverId(null);
    setHasUserPickedVehicle(false);
    setBuilderOpen(false);
    setError('');
  // Only reset when opened for a new booking / driver.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isOpen,initialDriverId,initialVehiclePlate]);
  const driver=drivers.find(item=>item.id===selectedDriverId)||null;
  const selectedVehicle=imageVehicles.find(v=>v.plate===selectedVehiclePlate)||null;
  const selectedVehiclePhotoReady=Boolean(selectedVehicle&&resolveDispatchCardPhotos(selectedVehicle));
  const partitionedVehicles=useMemo(
    ()=>partitionDispatchCardVehicles(imageVehicles,vehicleSummary),
    [imageVehicles,vehicleSummary],
  );
  const vehicleSelectOptions=useMemo(()=>[
    ...partitionedVehicles.registered.map(item=>({
      value:item.plate,
      label:item.plate,
      subtitle:item.model,
      group:'등록된 차량',
      status:!resolveDispatchCardPhotos(item)?'차량 이미지 미준비':getVehicleCardStatusMeta(vehicleSummary[item.uuid]).optionStatus,
    })),
    ...partitionedVehicles.unregistered.map(item=>({
      value:item.plate,
      label:item.plate,
      subtitle:item.model,
      group:'미등록 차량',
      status:!resolveDispatchCardPhotos(item)?'차량 이미지 미준비':getVehicleCardStatusMeta(vehicleSummary[item.uuid]).optionStatus,
    })),
  ],[partitionedVehicles,vehicleSummary]);

  const handleSelectDriver=(nextDriverId:string)=>{
    setSelectedDriverId(nextDriverId);
    setSelectedVehiclePlate('');
    setBundle(null);
    setVehicleSummary({});
    setSummaryResolvedDriverId(null);
    setHasUserPickedVehicle(false);
  };
  const handleSelectVehicle=(nextPlate:string)=>{
    setSelectedVehiclePlate(nextPlate);
    setHasUserPickedVehicle(true);
  };

  useEffect(()=>{
    if(!isOpen||builderOpen||!driver){
      setSummaryLoading(false);
      return;
    }
    let cancelled=false;
    setSummaryLoading(true);
    const query=new URLSearchParams({
      driverId:driver.id,type:'summary',
    });
    fetch('/api/hq/drivers/assets?'+query.toString(),{cache:'no-store'})
      .then(async response=>{
        const result=await response.json().catch(()=>({}));
        if(!cancelled&&response.ok&&result.ok){
          setVehicleSummary(result.vehicleAssetSummary||{});
        }
      })
      .catch(()=>{})
      .finally(()=>{
        if(!cancelled){
          setSummaryLoading(false);
          setSummaryResolvedDriverId(driver.id);
        }
      });
    return ()=>{cancelled=true;};
  },[isOpen,builderOpen,driver?.id,revision]);

  useEffect(()=>{
    if(!isOpen||fleet.loading||fleet.error||!driver||summaryResolvedDriverId!==driver.id||hasUserPickedVehicle||selectedVehicle||!imageVehicles.length)return;
    const initialDriver=initialDriverId||drivers[0]?.id||'';
    const nextVehicle=pickDefaultDispatchCardVehicle({
      vehicles:imageVehicles,
      summary:vehicleSummary,
      initialVehiclePlate:driver.id===initialDriver?initialVehiclePlate:undefined,
      preferRegistered:preferRegisteredVehicle,
    });
    if(nextVehicle&&nextVehicle.plate!==selectedVehiclePlate){
      setSelectedVehiclePlate(nextVehicle.plate);
    }
  },[isOpen,fleet.loading,fleet.error,driver,summaryResolvedDriverId,hasUserPickedVehicle,selectedVehicle,imageVehicles,vehicleSummary,initialDriverId,drivers,initialVehiclePlate,preferRegisteredVehicle,selectedVehiclePlate]);

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
        if(!cancelled){
          setBundle(result.bundle||null);
          if(result.vehicleAssetSummary)setVehicleSummary(result.vehicleAssetSummary);
        }
      })
      .catch(err=>{if(!cancelled){setBundle(null);setError(err instanceof Error?err.message:'배차카드 조회 오류');}})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[isOpen,builderOpen,driver?.id,selectedVehicle?.uuid,revision]);

  const refresh=()=>{
    setRevision(i=>i+1);
    onAssetUpdated?.();
  };
  const selectedSummary=selectedVehicle?vehicleSummary[selectedVehicle.uuid]:undefined;
  const pcReady=Boolean(bundle?.pcInfo?.signedUrl&&bundle.pcInfo.filePath);
  const mobileReady=Boolean(bundle?.mobileInfo?.signedUrl&&bundle.mobileInfo.filePath);
  const bothCardsReady=pcReady&&mobileReady;
  const bothFilesPrepared=Boolean(
    bothCardsReady&&bundle?.driverId===selectedDriverId&&
    bundle?.vehiclePlate===selectedVehiclePlate&&
    prepared.pc?.path===bundle?.pcInfo?.filePath&&
    prepared.mobile?.path===bundle?.mobileInfo?.filePath&&
    prepared.pc?.file&&prepared.mobile?.file,
  );
  const shareFiles=bothFilesPrepared
    ?[prepared.pc!.file,prepared.mobile!.file] as [File,File]:null;
  const canNativeShare=shareFiles?supportsDispatchCardPairShare(shareFiles):false;

  return <>
    <HqModal isOpen={isOpen&&!builderOpen} onClose={onClose}
      title="기사 배차카드" subtitle="기사와 차량을 선택해 최신 배차카드를 확인하고 수정해요."
      className="max-w-[920px]"
      footer={<HqButton variant="secondary" onClick={onClose}>닫기</HqButton>}>
      <div className="space-y-4">
        <div className="grid gap-3 rounded-[16px] bg-[#F7F9FC]/70 p-3 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-[#EDF1F6]">
          <div className="sm:pr-3.5">
            <label className="mb-1.5 block text-[12px] font-medium text-[#526680]">기사</label>
            <HqSearchSelect
              label="배차카드 관리 기사"
              value={selectedDriverId}
              onChange={handleSelectDriver}
              placeholder="기사 선택"
              options={drivers.map(item=>({value:item.id,label:item.name,subtitle:item.phone||'연락처 없음'}))}
            />
          </div>
          <div className="sm:pl-3.5">
            <label className="mb-1.5 block text-[12px] font-medium text-[#526680]">차량</label>
            <HqSearchSelect
              label="배차카드 관리 차량"
              value={selectedVehiclePlate}
              onChange={handleSelectVehicle}
              placeholder={fleet.loading||summaryLoading?'차량 불러오는 중…':'차량 선택'}
              options={vehicleSelectOptions}
            />
          </div>
        </div>
        {fleet.error&&<p role="alert" className="text-[12px] text-[#B05B57]">{fleet.error}</p>}
        {error&&<p role="alert" className="text-[12px] text-[#B05B57]">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <HqButton variant="subtle" size="sm"
            onClick={()=>setRevision(v=>v+1)} disabled={loading||summaryLoading}>
            <RefreshCw className="size-4"/> 새로고침
          </HqButton>
          <HqButton variant="primary" size="sm"
            disabled={!driver||!selectedVehicle||!selectedVehiclePhotoReady||fleet.loading}
            onClick={()=>setBuilderOpen(true)}>
            <ImageIcon className="size-4"/> 카드 만들기·수정
          </HqButton>
        </div>
        {selectedVehicle&&!selectedVehiclePhotoReady&&<p role="status" className="text-[11px] text-[#A17C55]">
          이 차량은 배차카드용 외관·실내 이미지가 아직 준비되지 않았어요. 차량 이미지를 등록한 뒤 카드를 만들 수 있습니다.
        </p>}
        {shareFeedback&&<p role="status" className="text-[11px] text-[#60728C]">{shareFeedback}</p>}
        {(loading||summaryLoading&&!selectedVehicle)?<div role="status" className="flex min-h-40 items-center justify-center gap-2 text-[12px] text-[#73839D]">
          <Loader2 className="size-4 animate-spin"/> 카드 불러오는 중…
        </div>:<div className="grid gap-3 sm:grid-cols-2">
          {(['pc','mobile'] as const).map(variant=>{
            const asset=variant==='pc'?bundle?.pcInfo:bundle?.mobileInfo;
            const isStale=variant==='pc'?selectedSummary?.stalePc:selectedSummary?.staleMobile;
            return <HqCard key={variant} className="p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-[#243750]">{variant==='pc'?'PC 가로형':'모바일 세로형'}</h3>
                {asset?.signedUrl?(
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <HqBadge tone="selected">최신</HqBadge>
                    <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
                    <a href={asset.signedUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[#526680] transition-colors hover:text-[#1E60F3]">
                      원본 보기
                      <ExternalLink className="size-3.5"/>
                    </a>
                  </div>
                ):(
                  <HqBadge tone="neutral">{isStale?'갱신 필요':'미등록'}</HqBadge>
                )}
              </div>
              <div className="flex h-[240px] items-center justify-center rounded-[13px] bg-[#F7F9FC] p-3">
                {asset?.signedUrl?<img src={asset.signedUrl}
                  alt={variant==='pc'?'PC 배차카드':'모바일 배차카드'}
                  className="max-h-full max-w-full object-contain"/>:
                  <div className="flex flex-col items-center gap-2 text-center text-[12px] text-[#7C8AA0]">
                    <AlertTriangle className="size-5"/>
                    <span>{isStale?'기사 정보가 바뀌어 최신 버전으로 업데이트가 필요해요.':'카드 만들기·수정에서 배차카드를 만들어 주세요.'}</span>
                  </div>}
              </div>
            </HqCard>;
          })}
        </div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <HqButton variant="secondary" size="md"
            disabled={!bothFilesPrepared||preparing.pc||preparing.mobile||sharing||loading}
            aria-label="PC·모바일 배차카드 PNG 두 장 한 번에 공유"
            onClick={()=>{void handleShareBoth();}}>
            {sharing||preparing.pc||preparing.mobile?<Loader2 className="size-4 animate-spin"/>:
              canNativeShare?<Share2 className="size-4"/>:<Download className="size-4"/>}
            {sharing?'파일 공유 중…':preparing.pc||preparing.mobile?'PNG 2장 준비 중…':
              !bothCardsReady?'두 카드 생성 후 공유':
              canNativeShare?'PC·모바일 함께 공유':'PC·모바일 ZIP 저장'}
          </HqButton>
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-[#8795A8]">
          기사 정보·사진 변경 시, 배차카드를 다시 갱신해 주세요.
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
