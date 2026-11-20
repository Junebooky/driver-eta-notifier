'use client';

import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {CheckCircle2,ChevronDown,ChevronRight,Loader2,RefreshCw,ShieldAlert} from 'lucide-react';
import type {HqDriverSummary} from '@/types/driverHq';
import type {DispatchCardCoverage,DispatchCardCoverageDriver} from '@/lib/dispatchCards/dispatchCardCoverage';
import {resolveDispatchCardPhotos,dispatchCardVehicleLabel} from '@/lib/dispatchCards/dispatchCardAssets';
import {validateDispatchCardProfile,getEnglishPosition,formatBilingualChauffeurName} from '@/lib/dispatchCards/chauffeurIdentity';
import {resolveDispatchCardEnglishName} from '@/utils/koreanNameRomanization';
import {normalizePortraitPlacement} from '@/lib/dispatchCards/portraitCrop';
import {renderDispatchCard} from '@/lib/dispatchCards/renderDispatchCard';
import {HqDispatchCardBuilderModal} from './HqDispatchCardBuilderModal';

type CoverageResponse={ok?:boolean;coverage?:DispatchCardCoverage;error?:string};

export function HqDispatchCardCoveragePanel({drivers,onAssetUpdated,embedded=false}:{
  drivers:HqDriverSummary[];onAssetUpdated?:()=>void;embedded?:boolean;
}) {
  const [coverage,setCoverage]=useState<DispatchCardCoverage|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [expanded,setExpanded]=useState(false);
  const [activeDriverId,setActiveDriverId]=useState<string|null>(null);
  const [generating,setGenerating]=useState(false);
  const [progress,setProgress]=useState('');
  const [result,setResult]=useState('');
  const cancelRef=useRef(false);

  const refresh=useCallback(async()=>{
    try {
      setLoading(true);
      const response=await fetch('/api/hq/drivers/assets/coverage',{cache:'no-store'});
      const json=await response.json().catch(()=>({})) as CoverageResponse;
      if(!response.ok||!json.ok||!json.coverage)throw new Error(json.error||'카드 매핑 조회 실패');
      setCoverage(json.coverage);
      setError('');
    } catch(err) {
      setError(err instanceof Error?err.message:'카드 매핑 조회 실패');
    } finally {setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    return ()=>{cancelRef.current=true;};
  },[refresh]);

  const selectedDriver=useMemo(() => drivers.find(d=>d.id===activeDriverId)||null,[drivers,activeDriverId]);
  const ready=coverage?.drivers.filter(d=>d.identityReady&&d.missingVariants>0)||[];
  const blocked=coverage?.drivers.filter(d=>!d.identityReady&&d.missingVariants>0)||[];

  /** Desktop or mobile: one active render at a time, safe to retry after closing.
   * Keep stored English names where present; missing names use the fixed card romanization.
   * No candidate selection UI, and existing card assets are never overwritten.
   * Backend skipIfExists protects existing PC/mobile versions even under races.
   */
  const generateAllMissing=async()=>{
    if(!coverage||generating||!ready.length)return;
    const planned=ready.reduce((n,d)=>n+d.missingVariants,0);
    if(!window.confirm('기사 '+ready.length+'명, 미생성 PC·모바일 카드 최대 '+planned+
      '장을 추가할까요?\n기존 카드는 유지하고, 기사 정보 미완성 '+blocked.length+
      '명은 생성하지 않습니다.'))return;
    cancelRef.current=false;setGenerating(true);setError('');setResult('');
    let created=0,skipped=0,failed=0;
    const failures:string[]=[];
    try {
      for(const driver of ready) {
        if(cancelRef.current)break;
        const id=encodeURIComponent(driver.id);
        const [profileResponse,portraitResponse]=await Promise.all([
          fetch('/api/hq/drivers/assets?driverId='+id+'&type=profile',{cache:'no-store'}),
          fetch('/api/hq/drivers/assets/card-profile?driverId='+id,{cache:'no-store'}),
        ]);
        const [profileJson,portraitJson]=await Promise.all([profileResponse.json(),portraitResponse.json()]);
        const rawProfile=portraitJson.profile || {};
        const koreanName=String(rawProfile.koreanName || driver.name).trim();
        const identity=validateDispatchCardProfile({
          ...rawProfile,
          koreanName,
          englishName:resolveDispatchCardEnglishName(koreanName,rawProfile.englishName),
        });
        const imagePath=typeof profileJson.profile?.filePath==='string'?profileJson.profile.filePath:'';
        if(!profileResponse.ok||!portraitResponse.ok||!identity||!imagePath) {
          failed+=driver.missingVariants;
          failures.push(driver.name+': 기사 프로필을 확인할 수 없음');
          continue;
        }
        const photoUrl='/api/hq/drivers/assets/preview?path='+encodeURIComponent(imagePath);
        const placement=normalizePortraitPlacement(portraitJson.placement);
        for(const slot of driver.slots) {
          if(cancelRef.current)break;
          const vehicle=coverage.vehicles.find(v=>v.uuid===slot.vehicleId);
          const assets=vehicle?resolveDispatchCardPhotos(vehicle):null;
          if(!vehicle||!assets)continue;
          for(const variant of ['pc','mobile'] as const) {
            if(cancelRef.current)break;
            if(slot[variant]) {skipped++;continue;}
            setProgress(driver.name+' · '+vehicle.plate+' · '+(variant==='pc'?'PC':'모바일')+
              ' (완료 '+created+'장)');
            try {
              const canvas=await renderDispatchCard({
                name:formatBilingualChauffeurName(identity.koreanName,identity.englishName),
                position:getEnglishPosition(identity.positionCode),
                phone:identity.phone,
                plate:vehicle.plate,
                model:dispatchCardVehicleLabel(vehicle),
                photoUrl,portraitPlacement:placement,photos:assets,orientation:variant,
              });
              const file=await new Promise<Blob>((resolve,reject)=>
                canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('이미지 변환 실패')),'image/webp',0.9));
              const form=new FormData();
              form.set('assetType','info');
              form.set('driverId',driver.id);
              form.set('driverName',identity.koreanName);
              form.set('vehicleId',vehicle.uuid);
              form.set('vehiclePlate',vehicle.plate);
              form.set('vehicleModel',vehicle.model);
              form.set('variant',variant);
              form.set('width',String(canvas.width));
              form.set('height',String(canvas.height));
              form.set('skipIfExists','true');
              form.set('file',file,'dispatch_'+vehicle.plateShort+'_'+variant+'.webp');
              const response=await fetch('/api/hq/drivers/assets/upload',{method:'POST',body:form});
              const json=await response.json().catch(()=>({}));
              if(!response.ok||json.ok!==true)throw new Error(json.error||'저장 실패');
              if(json.skipped)skipped++;else created++;
            } catch(err) {
              failed++;
              if(failures.length<8)failures.push(driver.name+' / '+vehicle.plate+' / '+variant+
                ': '+(err instanceof Error?err.message:'오류'));
            }
          }
        }
      }
      setResult('새로 생성 '+created+'장 · 기존 카드 유지 '+skipped+
        '장 · 실패 '+failed+'장'+(cancelRef.current?' · 중단됨':'')+
        '. 예약·고객에게 자동 발송하지 않았습니다.');
      if(failures.length)setError(failures.join(' / '));
      await refresh();
      if(created>0)onAssetUpdated?.();
    } catch(err) {
      setError(err instanceof Error?err.message:'일괄 생성 중 오류');
      await refresh();
    } finally {setGenerating(false);setProgress('');}
  };

  return <section className={embedded
    ? 'border-t border-[#EDF1F5] bg-white px-5 py-4 sm:px-6'
    : 'rounded-[18px] bg-white p-4 shadow-[0_5px_24px_rgba(24,44,80,0.045)] sm:p-5'}
    aria-label="기사 배차카드 현황·일괄 생성">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-[12px] leading-relaxed text-[#73839D]">
        {loading?'차량·기사 연결 확인 중…':coverage
          ? '사진 준비 차량 '+coverage.vehicles.length+'대 · '+coverage.drivers.length+'명 · PC·모바일 '+coverage.savedVariants+'/'+coverage.requiredVariants+'장 등록 · 미생성/갱신 '+coverage.missingVariants+'장'
          :'차량과 기사 연결 확인'}
      </div>
      <button type="button" onClick={()=>void refresh()} disabled={loading||generating}
        aria-label="배차카드 현황 새로고침"
        className="flex min-h-10 items-center gap-1.5 rounded-xl bg-[#F7F9FC] px-3 text-[12px] font-medium text-[#526680] disabled:opacity-50">
        <RefreshCw className={'size-4 '+(loading?'animate-spin':'')}/> 새로고침
      </button>
    </div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <button type="button" disabled={loading||generating||!ready.length}
        onClick={()=>void generateAllMissing()}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#1E60F3] px-4 text-[13px] font-semibold text-white disabled:bg-[#E9EDF3] disabled:text-[#8190A3]">
        {generating?<Loader2 className="size-4 animate-spin"/>:<CheckCircle2 className="size-4"/>}
        {generating?'누락 카드 생성 중…':'준비된 기사 미생성 카드 일괄 생성'}
      </button>
      <button type="button" onClick={()=>setExpanded(v=>!v)}
        aria-expanded={expanded}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-[#F5F7FA] px-4 text-[13px] font-medium text-[#526680]">
        기사별 현황 {expanded?<ChevronDown className="size-4"/>:<ChevronRight className="size-4"/>}
      </button>
    </div>
    {blocked.length>0&&<p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-[#8B6B4C]">
      <ShieldAlert className="mt-0.5 size-4 shrink-0"/> 기사 {blocked.length}명은 직책·연락처 또는 프로필 확인이 필요해요. 영문 성명은 회사 표준 형식으로 자동 입력됩니다.
    </p>}
    {generating&&<div role="status" className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#F7F9FC] p-3 text-[12px] text-[#526680]">
      <span className="min-w-0 break-words">{progress||'배차카드 일괄 생성 준비 중…'}</span>
      <button type="button" onClick={()=>{cancelRef.current=true;}} className="shrink-0 rounded-lg bg-white px-2.5 py-2 font-medium">중단</button>
    </div>}
    {result&&<p role="status" className="mt-3 text-[12px] text-[#526680]">{result}</p>}
    {error&&<p role="alert" className="mt-3 text-[12px] text-[#B45454]">{error}</p>}
    {expanded&&coverage&&<div className="mt-4 space-y-2">
      {coverage.drivers.map((driver:DispatchCardCoverageDriver)=>{
        const savedPairCount=driver.slots.filter(slot=>slot.pc&&slot.mobile).length;
        return <div key={driver.id} className="rounded-[14px] border border-[#EFF2F6] p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#293D55]">{driver.name}</p>
              <p className="mt-1 text-[11px] text-[#7A8AA1]">
                준비 차량 {driver.slots.length}대 · 완성 {savedPairCount}대 · 저장 {driver.savedVariants}/{driver.slots.length*2}장
              </p>
              {!driver.identityReady&&<p className="mt-1 text-[11px] text-[#A07954]">
                {[
                  !driver.portraitReady?'프로필 사진':null,
                  !driver.englishNameReady?'영문 성명 생성 불가':null,
                  !driver.positionReady?'직책':null,
                  ].filter(Boolean).join(' · ')||'기사 연락처/표기'} 확인 필요
              </p>}
            </div>
            <button type="button" disabled={!drivers.some(item=>item.id===driver.id)||generating}
              onClick={()=>setActiveDriverId(driver.id)}
              className="min-h-10 shrink-0 rounded-[11px] bg-[#F2F5FA] px-3 text-[12px] font-semibold text-[#526680] disabled:opacity-50">
              {driver.identityReady?(driver.missingVariants?'미생성 카드 만들기':'카드 보기'):'정보 확인·카드 만들기'}
            </button>
          </div>
          <details className="mt-2 text-[11px] text-[#73839A]">
            <summary className="cursor-pointer py-1">차량별 연결 확인</summary>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {driver.slots.map(slot=><div key={slot.vehicleId} className="flex items-center justify-between gap-2 rounded-lg bg-[#F8FAFC] px-2.5 py-2">
                <span className="min-w-0 truncate">{slot.plate}</span>
                <span className={'shrink-0 '+(slot.pc&&slot.mobile?'text-[#477761]':'text-[#8A96A7]')}>
                  {slot.pc&&slot.mobile?'PC·모바일 완료':slot.pc||slot.mobile?'1종 등록':'미생성'}
                </span>
              </div>)}
            </div>
          </details>
        </div>;
      })}
    </div>}
    {!loading&&!coverage&&!error&&<div className="py-3 text-[12px] text-[#7A8AA1]">차량 연결 정보를 찾을 수 없어요.</div>}
    {selectedDriver&&coverage&&<HqDispatchCardBuilderModal
      isOpen={!!activeDriverId}
      driver={selectedDriver}
      vehicles={coverage.vehicles}
      onClose={()=>setActiveDriverId(null)}
      onAssetUpdated={()=>{void refresh();onAssetUpdated?.();}}
      onProfileUpdated={()=>{void refresh();onAssetUpdated?.();}}
    />}
  </section>;
}
