'use client';

import React from 'react';
import {CarFront, CircleParking, MapPin, Plus, Trash2, Truck, Users2, AlertTriangle, Info} from 'lucide-react';
import {HqBadge,HqButton,HqCard,HqFieldHint,HqFieldLabel,HqInput,HqSectionTitle,HqTextarea} from '@/components/hq/ui';
import {HqSearchSelect} from '@/components/hq/ui/HqSearchSelect';
import {
  emptyRestroomLocation,
  FIELD_FLOOR_PRESET_OPTIONS,
  FIELD_PARKING_VALIDATION_LABELS,
  FIELD_RESTRICTION_LABELS,
  FIELD_NOTICE_LABELS,
  type FieldKnowledgeGuide,
  type FieldKnowledgeParkingValidation,
  type FieldKnowledgeRestroomLocation,
} from '@/utils/fieldKnowledgeGuide';
import type {FieldKnowledgeItem} from '@/types/fieldKnowledge';
import {legacyFieldKnowledgeEntries} from '@/utils/fieldKnowledgeGuide';

interface Props{
  guide:FieldKnowledgeGuide;
  onChange:(value:FieldKnowledgeGuide)=>void;
  legacyItem:FieldKnowledgeItem;
}
const iconClass='size-4 text-[#71839D]';
const floorPresetValues=new Set<string>(FIELD_FLOOR_PRESET_OPTIONS.filter(item=>item.value!=='기타').map(item=>item.value));
const floorOptions=FIELD_FLOOR_PRESET_OPTIONS.map(item=>({value:item.value,label:item.label}));
const parkingPolicyOptions=[
  {value:'unknown',label:'미확인'},
  {value:'free',label:'무료'},
  {value:'conditional',label:'조건부 무료'},
  {value:'paid',label:'유료'},
];
const parkingValidationOptions=(Object.entries(FIELD_PARKING_VALIDATION_LABELS) as Array<[FieldKnowledgeParkingValidation,string]>)
  .map(([value,label])=>({value,label}));
const sprinterOptions=[
  {value:'unknown',label:'미확인'},
  {value:'yes',label:'가능'},
  {value:'no',label:'불가'},
  {value:'confirm',label:'현장 확인 필요'},
];
const restroomAccessOptions=[
  {value:'unknown',label:'미확인'},
  {value:'public',label:'일반 이용 가능'},
  {value:'staff',label:'직원·기사 전용'},
  {value:'restricted',label:'출입 확인 필요'},
];
const noticeTypeOptions=(Object.entries(FIELD_NOTICE_LABELS) as Array<[FieldKnowledgeGuide['notices'][number]['type'],string]>)
  .map(([value,label])=>({value,label}));
type FloorProps={value:string;onChange:(value:string)=>void;id:string};
function FloorField({value,onChange,id}:FloorProps){
  const isCustomValue=Boolean(value&&!floorPresetValues.has(value));
  const [custom,setCustom]=React.useState(isCustomValue);
  React.useEffect(()=>{
    if(isCustomValue)setCustom(true);
  },[isCustomValue]);
  return <div className="block min-w-0">
    <HqFieldLabel>층·위치 구분</HqFieldLabel>
    <HqSearchSelect
      label={id+' 층 선택'}
      placeholder="미등록"
      searchable={false}
      value={custom||isCustomValue?'기타':value}
      onChange={nextValue=>{
        if(nextValue==='기타'){
          setCustom(true);
          if(floorPresetValues.has(value))onChange('');
        }else{
          setCustom(false);
          onChange(nextValue);
        }
      }}
      options={floorOptions}
    />
    {(custom||isCustomValue)&&<HqInput className="mt-2" maxLength={40}
      aria-label={id+' 직접 입력'} value={value} placeholder="예: L층, LL층, 별관 B2"
      onChange={event=>onChange(event.target.value)}/>}
  </div>;
}
function NumberField({value,onChange,label,max=1440}:{
  value:number|null;onChange:(value:number|null)=>void;label:string;max?:number;
}){
  return <label className="block min-w-0">
    <HqFieldLabel>{label}</HqFieldLabel>
    <HqInput type="number" min={0} max={max} step={1} value={value??''}
      placeholder="미확인" onChange={event=>onChange(event.target.value===''?null:Number(event.target.value))}/>
  </label>;
}

export function HqFieldKnowledgeStructuredForm({guide,onChange,legacyItem}:Props){
  const parking=(next:Partial<FieldKnowledgeGuide['parking']>)=>onChange({...guide,parking:{...guide.parking,...next}});
  const waiting=(next:Partial<FieldKnowledgeGuide['waiting']>)=>onChange({...guide,waiting:{...guide.waiting,...next}});
  const restroomItems: FieldKnowledgeRestroomLocation[] = React.useMemo(()=>{
    if(Array.isArray(guide.restrooms)&&guide.restrooms.length>0)return guide.restrooms;
    return [guide.restroom||emptyRestroomLocation()];
  },[guide.restroom,guide.restrooms]);
  const setRestroomItems=(nextList:FieldKnowledgeRestroomLocation[])=>{
    const safeList=nextList.length>0?nextList:[emptyRestroomLocation()];
    onChange({...guide,restroom:safeList[0],restrooms:safeList});
  };
  const updateRestroomAt=(idx:number,patch:Partial<FieldKnowledgeRestroomLocation>)=>{
    setRestroomItems(restroomItems.map((entry,i)=>i===idx?{...entry,...patch}:entry));
  };
  const pickup=(next:Partial<FieldKnowledgeGuide['pickup']>)=>onChange({...guide,pickup:{...guide.pickup,...next}});
  const legacy=legacyFieldKnowledgeEntries(legacyItem);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 px-1">
      <HqBadge tone="selected">표준 양식 v1</HqBadge>
      <HqFieldHint>각 항목을 분리해 등록하면 기사 화면에도 같은 순서로 표시돼요. L·LL층 등 건물 표기도 그대로 선택·입력할 수 있습니다.</HqFieldHint>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <HqCard className="space-y-4 p-4 sm:p-5">
        <HqSectionTitle><CircleParking className={iconClass}/> 주차·무료회차</HqSectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="block min-w-0">
            <HqFieldLabel>주차 정책</HqFieldLabel>
            <HqSearchSelect
              label="주차 정책"
              placeholder="미확인"
              searchable={false}
              value={guide.parking.policy}
              onChange={nextPolicy=>parking({policy:nextPolicy as FieldKnowledgeGuide['parking']['policy'],
                ...(nextPolicy!=='free'&&nextPolicy!=='conditional'?{graceMinutes:null}:{})})}
              options={parkingPolicyOptions}
            />
          </div>
          <NumberField value={guide.parking.graceMinutes} label="무료회차 시간 (분)"
            onChange={graceMinutes=>parking({graceMinutes,policy:graceMinutes!==null&&
              !['free','conditional'].includes(guide.parking.policy)?'conditional':guide.parking.policy})}/>
          <div className="block min-w-0 sm:col-span-2">
            <HqFieldLabel>할인·등록 방법</HqFieldLabel>
            <HqSearchSelect
              label="할인·등록 방법"
              placeholder="미확인"
              searchable={false}
              value={guide.parking.validation}
              onChange={nextValidation=>parking({validation:nextValidation as FieldKnowledgeParkingValidation})}
              options={parkingValidationOptions}
            />
          </div>
          <label className="block min-w-0 sm:col-span-2">
            <HqFieldLabel>주차 조건 · 전달 방법</HqFieldLabel>
            <HqInput maxLength={240} value={guide.parking.conditionDetail||''}
              onChange={event=>parking({conditionDetail:event.target.value})}
              placeholder="예: 호텔 체크인 시 도어에 말씀 또는 컨시어지에 행사명 전달"/>
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <HqFieldLabel>주차 팁 · 현장 요령 (발렛/팁 등)</HqFieldLabel>
            <HqTextarea rows={2} maxLength={300} value={guide.parking.tips||''}
              className="min-h-[76px]"
              onChange={event=>parking({tips:event.target.value})}
              placeholder="예: 웨스틴 파르나스 등은 도어·컨시어지 사전 안내 및 현장 팁/주차 확인 필요"/>
          </label>
        </div>
      </HqCard>

      <HqCard className="space-y-4 p-4 sm:p-5">
        <HqSectionTitle><CarFront className={iconClass}/> 차량 대기·진입</HqSectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <FloorField id="차량 대기" value={guide.waiting.level} onChange={level=>waiting({level})}/>
          <label className="block min-w-0">
            <HqFieldLabel>대기 구역·구획</HqFieldLabel>
            <HqInput maxLength={100} value={guide.waiting.zone}
              onChange={event=>waiting({zone:event.target.value})} placeholder="예: 로비 뒤 A구역"/>
          </label>
          <div className="block min-w-0">
            <HqFieldLabel>스프린터 진입</HqFieldLabel>
            <HqSearchSelect
              label="스프린터 진입"
              placeholder="미확인"
              searchable={false}
              value={guide.waiting.sprinter}
              onChange={nextSprinter=>waiting({sprinter:nextSprinter as FieldKnowledgeGuide['waiting']['sprinter']})}
              options={sprinterOptions}
            />
          </div>
          <NumberField label="차고 높이 제한 (cm)" max={600}
            value={guide.waiting.heightLimitCm} onChange={heightLimitCm=>waiting({heightLimitCm})}/>
        </div>
      </HqCard>

      <HqCard className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <HqSectionTitle><Users2 className={iconClass}/> 화장실 ({restroomItems.length}곳)</HqSectionTitle>
          <HqButton variant="secondary" size="sm" disabled={restroomItems.length>=6}
            onClick={()=>setRestroomItems([...restroomItems,emptyRestroomLocation()])}>
            <Plus className="size-4"/> 위치 추가
          </HqButton>
        </div>
        <div className="space-y-3">
          {restroomItems.map((entry,idx)=><div key={idx} className={restroomItems.length>1?'rounded-[14px] bg-[#F7F9FC] p-3 space-y-3':'space-y-3'}>
            {restroomItems.length>1&&(
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[#4D607C]">화장실 위치 {idx+1}</span>
                <HqButton variant="danger" size="sm" aria-label={'화장실 위치 '+(idx+1)+' 삭제'}
                  onClick={()=>setRestroomItems(restroomItems.filter((_,i)=>i!==idx))}>
                  <Trash2 className="size-3.5"/>
                </HqButton>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FloorField id={'화장실 '+(idx+1)} value={entry.level} onChange={level=>updateRestroomAt(idx,{level})}/>
              <label className="block min-w-0">
                <HqFieldLabel>상세 위치·랜드마크</HqFieldLabel>
                <HqInput maxLength={120} value={entry.landmark}
                  onChange={event=>updateRestroomAt(idx,{landmark:event.target.value})}
                  placeholder="예: L층 로비 오른쪽 복도"/>
              </label>
              <div className="block min-w-0 sm:col-span-2">
                <HqFieldLabel>이용 가능 대상</HqFieldLabel>
                <HqSearchSelect
                  label={'화장실 '+(idx+1)+' 이용 가능 대상'}
                  placeholder="미확인"
                  searchable={false}
                  value={entry.access}
                  onChange={nextAccess=>updateRestroomAt(idx,{access:nextAccess as FieldKnowledgeRestroomLocation['access']})}
                  options={restroomAccessOptions}
                />
              </div>
            </div>
          </div>)}
        </div>
      </HqCard>

      <HqCard className="space-y-4 p-4 sm:p-5">
        <HqSectionTitle><MapPin className={iconClass}/> 승·하차 위치</HqSectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <FloorField id="승하차" value={guide.pickup.level} onChange={level=>pickup({level})}/>
          <label className="block min-w-0">
            <HqFieldLabel>출입구·게이트</HqFieldLabel>
            <HqInput maxLength={100} value={guide.pickup.gate}
              onChange={event=>pickup({gate:event.target.value})}
              placeholder="예: 정문 2번 게이트"/>
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <HqFieldLabel>진입 방법 (최대 180자)</HqFieldLabel>
            <HqInput maxLength={180} value={guide.pickup.instruction}
              onChange={event=>pickup({instruction:event.target.value})}
              placeholder="예: 회전교차로 통과 후 우측 진입"/>
          </label>
        </div>
      </HqCard>
    </div>

    <HqCard className="space-y-3 p-4 sm:p-5">
      <HqSectionTitle><AlertTriangle className={iconClass}/> 주정차·진입 주의사항</HqSectionTitle>
      <HqFieldHint>자유입력 대신 해당되는 항목만 선택하세요. 여러 개 선택할 수 있어요.</HqFieldHint>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(Object.entries(FIELD_RESTRICTION_LABELS) as Array<[FieldKnowledgeGuide['restrictions'][number],string]>)
          .map(([key,label])=><label key={key}
          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[13px] bg-[#F7F9FC] px-3 py-2 text-[14px] md:text-[12px] text-[#526680]">
          <input type="checkbox" checked={guide.restrictions.includes(key)}
            onChange={event=>onChange({...guide,restrictions:event.target.checked
              ?[...guide.restrictions,key]:guide.restrictions.filter(value=>value!==key)})}
            className="size-4 accent-[#1E60F3]"/>
          {label}
        </label>)}
      </div>
    </HqCard>

    <HqCard className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <HqSectionTitle><Info className={iconClass}/> 유형별 추가 안내</HqSectionTitle>
          <HqFieldHint className="mt-1">특이사항만 유형을 먼저 선택하고 한 줄로 작성하세요 (최대 8개).</HqFieldHint>
        </div>
        <HqButton variant="secondary" size="sm" disabled={guide.notices.length>=8}
          onClick={()=>onChange({...guide,notices:[...guide.notices,{type:'event',detail:''}]})}>
          <Plus className="size-4"/> 안내 추가
        </HqButton>
      </div>
      {guide.notices.map((notice,index)=><div key={index} className="grid gap-2 rounded-[13px] bg-[#F7F9FC] p-3 sm:grid-cols-[155px_minmax(0,1fr)_auto]">
        <HqSearchSelect
          label={'추가 안내 '+(index+1)+' 유형'}
          placeholder="유형 선택"
          searchable={false}
          value={notice.type}
          onChange={nextType=>onChange({...guide,notices:guide.notices.map((item,i)=>i===index?
            {...item,type:nextType as typeof notice.type}:item)})}
          options={noticeTypeOptions}
        />
        <HqInput maxLength={240} value={notice.detail} aria-label={'추가 안내 '+(index+1)+' 내용'}
          placeholder="예: 11월 공사 기간에는 후문만 이용 가능"
          onChange={event=>onChange({...guide,notices:guide.notices.map((item,i)=>i===index?
            {...item,detail:event.target.value}:item)})}/>
        <HqButton variant="danger" size="sm" aria-label={'추가 안내 '+(index+1)+' 삭제'}
          onClick={()=>onChange({...guide,notices:guide.notices.filter((_,i)=>i!==index)})}>
          <Trash2 className="size-4"/>
        </HqButton>
      </div>)}
      {!guide.notices.length&&<p className="py-3 text-center text-[13px] md:text-[12px] text-[#9AA6B5]">추가 안내가 없습니다.</p>}
    </HqCard>

    {!!legacy.length&&<HqCard className="space-y-3 p-4 sm:p-5" tone="muted">
      <div className="flex flex-wrap items-center gap-2">
        <HqSectionTitle><Truck className={iconClass}/> 이전 방식으로 작성한 정보</HqSectionTitle>
        <HqBadge>원본 보존</HqBadge>
      </div>
      <HqFieldHint>
        이전 서술형 정보는 자동 삭제하지 않아요. 새 표준 항목을 채우면 기사 앱에서는 해당 표준 항목을 우선 표시합니다.
      </HqFieldHint>
      <div className="divide-y divide-[#E8ECF2]">
        {legacy.map(entry=><div key={entry.field} className="grid gap-1 py-2 text-[13px] md:text-[12px] sm:grid-cols-[155px_minmax(0,1fr)]">
          <span className="text-[#8491A4]">{entry.label}</span>
          <span className="whitespace-pre-wrap break-words text-[#526680]">{entry.value}</span>
        </div>)}
      </div>
    </HqCard>}
  </div>;
}
