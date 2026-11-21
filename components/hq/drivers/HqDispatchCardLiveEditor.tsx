'use client';

import React,{useState} from 'react';
import {Image as ImageIcon,RotateCcw,UserRound} from 'lucide-react';
import {HqBadge,HqButton,HqSegmentedTabs} from '@/components/hq/ui';
import type {CardOrientation,CardPhotoKind,CardPlacement} from '@/lib/dispatchCards/renderDispatchCard';
import {calculatePortraitCrop,DEFAULT_DISPATCH_PORTRAIT_PLACEMENT,PORTRAIT_CROP_LIMITS} from '@/lib/dispatchCards/portraitCrop';
import {calculateVehiclePhotoLiveCrop} from '@/lib/dispatchCards/vehiclePhotoLiveCrop';

export type DispatchCardEditMode='portrait'|'vehicle';
interface Props{
  mode:DispatchCardEditMode;
  onModeChange:(mode:DispatchCardEditMode)=>void;
  portraitPhotoUrl:string;
  portraitPlacement:CardPlacement;
  onPortraitChange:(placement:CardPlacement)=>void;
  portraitDisabled:boolean;
  portraitDirty:boolean;
  vehiclePhotoSrc:string;
  vehiclePlacement:CardPlacement;
  vehicleKind:CardPhotoKind;
  onVehicleKindChange:(kind:CardPhotoKind)=>void;
  onVehicleChange:(key:keyof CardPlacement,value:number)=>void;
  onVehicleReset:()=>void;
  vehicleDisabled:boolean;
  orientation:CardOrientation;
}

function Slider({label,value,min,max,disabled,onChange}:{
  label:string;value:number;min:number;max:number;
  disabled:boolean;onChange:(value:number)=>void;
}){
  return <label className="block min-w-0 space-y-1.5">
    <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#60728C]">
      <span>{label}</span><strong className="font-semibold tabular-nums text-[#243750]">{value}%</strong>
    </span>
    <input type="range" min={min} max={max} step={1} value={value}
      aria-label={label} disabled={disabled}
      onChange={event=>onChange(Number(event.target.value))}
      className="h-5 w-full cursor-pointer accent-[#1E60F3] disabled:cursor-not-allowed disabled:opacity-40"/>
  </label>;
}

/**
 * The ONLY photo-adjustment panel in the modal. The real card preview sits
 * directly below it, and these instant thumbnails track the exact crop math
 * used by the card canvas (portrait and PC/mobile vehicle photo frames).
 */
export function HqDispatchCardLiveEditor({
  mode,onModeChange,portraitPhotoUrl,portraitPlacement,onPortraitChange,
  portraitDisabled,portraitDirty,vehiclePhotoSrc,vehiclePlacement,vehicleKind,
  onVehicleKindChange,onVehicleChange,onVehicleReset,vehicleDisabled,orientation,
}:Props){
  const [portraitSize,setPortraitSize]=useState({src:'',w:800,h:800});
  const [vehicleSize,setVehicleSize]=useState({src:'',w:1600,h:900});
  const portraitFrame={x:0,y:0,w:112,h:140};
  const p=portraitSize.src===portraitPhotoUrl?portraitSize:{...portraitSize,w:800,h:800};
  const portraitCrop=calculatePortraitCrop(p.w,p.h,portraitFrame,portraitPlacement);
  const v=vehicleSize.src===vehiclePhotoSrc?vehicleSize:{...vehicleSize,w:1600,h:900};
  const vehicleCrop=calculateVehiclePhotoLiveCrop(v.w,v.h,orientation,vehicleKind,vehiclePlacement);

  return <section aria-label="배차카드 이미지 실시간 편집"
    className="space-y-3 rounded-[16px] bg-[#F7F9FC] p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold text-[#243750]">이미지 편집</h4>
        <p className="mt-0.5 text-[11px] text-[#8190A5]">바로 아래 완성 카드와 비교하며 구도를 조정하세요.</p>
      </div>
      {mode==='portrait'&&portraitDirty&&<HqBadge tone="warning">저장 전 변경</HqBadge>}
    </div>
    <HqSegmentedTabs aria-label="배차카드 이미지 편집 대상"
      className="w-full" value={mode}
      onValueChange={value=>onModeChange(value as DispatchCardEditMode)}
      tabs={[
        {id:'portrait',label:'기사 사진 구도'},
        {id:'vehicle',label:'차량 이미지 위치'},
      ]}/>
    {mode==='portrait'?<div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3 sm:gap-4">
      <div>
        <div className="relative h-[140px] w-[112px] overflow-hidden rounded-[12px] bg-white"
          aria-label="기사 사진 실시간 확대·위치 미리보기">
          {portraitPhotoUrl?<img key={portraitPhotoUrl} src={portraitPhotoUrl}
            alt="기사 사진 조정 결과" draggable={false}
            onLoad={event=>setPortraitSize({
              src:portraitPhotoUrl,
              w:event.currentTarget.naturalWidth,h:event.currentTarget.naturalHeight,
            })}
            style={{position:'absolute',left:portraitCrop.x,top:portraitCrop.y,
              width:portraitCrop.w,height:portraitCrop.h,maxWidth:'none',maxHeight:'none'}}/>
          :<div className="flex size-full items-center justify-center">
            <img src="/images/icons/drivers/icon_driver.png" alt="등록된 기사 사진 없음"
              className="size-12 object-contain" draggable={false}/>
          </div>}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[#8795A7]">인물 구도</p>
      </div>
      <div className="min-w-0 space-y-2.5">
        {([
          ['zoom','얼굴 확대',PORTRAIT_CROP_LIMITS.zoom.min,PORTRAIT_CROP_LIMITS.zoom.max],
          ['x','좌우 위치',PORTRAIT_CROP_LIMITS.x.min,PORTRAIT_CROP_LIMITS.x.max],
          ['y','상하 위치',PORTRAIT_CROP_LIMITS.y.min,PORTRAIT_CROP_LIMITS.y.max],
        ] as const).map(([key,label,min,max])=>
          <Slider key={key} label={label} value={portraitPlacement[key]}
            min={min} max={max} disabled={portraitDisabled}
            onChange={value=>onPortraitChange({...portraitPlacement,[key]:value})}/>)}
        <HqButton variant="ghost" size="sm" disabled={portraitDisabled}
          onClick={()=>onPortraitChange({...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT})}>
          <RotateCcw className="size-3.5"/> 기본 구도 복원
        </HqButton>
      </div>
    </div>:<div className="space-y-3">
      <HqSegmentedTabs aria-label="조정할 차량 이미지" value={vehicleKind}
        onValueChange={value=>onVehicleKindChange(value as CardPhotoKind)}
        tabs={[{id:'exterior',label:'외관'},{id:'interiorOne',label:'실내 1'},{id:'interiorTwo',label:'실내 2'}]}/>
      <div className="grid grid-cols-[minmax(0,168px)_minmax(0,1fr)] items-center gap-3">
        <div>
          <div className="relative overflow-hidden rounded-[11px] bg-[#2D3645]"
            style={{width:vehicleCrop.frame.w,height:vehicleCrop.frame.h}}
            aria-label="차량 이미지 실시간 크기·위치 미리보기">
            {vehiclePhotoSrc?<img key={vehiclePhotoSrc} src={vehiclePhotoSrc}
              alt="선택 차량 사진 조정 결과" draggable={false}
              onLoad={event=>setVehicleSize({
                src:vehiclePhotoSrc,
                w:event.currentTarget.naturalWidth,h:event.currentTarget.naturalHeight,
              })}
              style={{position:'absolute',left:vehicleCrop.image.x,top:vehicleCrop.image.y,
                width:vehicleCrop.image.w,height:vehicleCrop.image.h,maxWidth:'none',maxHeight:'none'}}/>
              :<div className="flex size-full items-center justify-center"><ImageIcon className="size-6 text-[#AAB3C1]"/></div>}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-[#8795A7]">
            {vehicleKind==='exterior'?'외관':vehicleKind==='interiorOne'?'실내 1':'실내 2'} 구도
          </p>
        </div>
        <div className="min-w-0 space-y-2.5">
          {([
            ['zoom','크기',80,150],
            ['x','좌우 위치',-20,20],
            ['y','상하 위치',-20,20],
          ] as const).map(([key,label,min,max])=>
            <Slider key={key} label={label} value={vehiclePlacement[key]}
              min={min} max={max} disabled={vehicleDisabled}
              onChange={value=>onVehicleChange(key,value)}/>)}
          <HqButton variant="ghost" size="sm" disabled={vehicleDisabled}
            onClick={onVehicleReset}>
            <RotateCcw className="size-3.5"/> 선택 이미지 초기화
          </HqButton>
        </div>
      </div>
    </div>}
    <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-[#8492A4]">
      {mode==='portrait'?<UserRound className="size-3.5 shrink-0"/>:<ImageIcon className="size-3.5 shrink-0"/>}
      {mode==='portrait'
        ?'기사 사진 구도는 모든 차량의 PC·모바일 카드에 공통 적용됩니다.'
        :'외관·실내 이미지의 위치는 현재 선택 차량에 적용되며, 카드 저장 시 반영됩니다.'}
    </p>
  </section>;
}
