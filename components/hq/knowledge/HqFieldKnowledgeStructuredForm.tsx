'use client';

import React from 'react';
import {CarFront, CircleParking, MapPin, Plus, Trash2, Truck, Users2, AlertTriangle, Info} from 'lucide-react';
import {HqBadge,HqButton,HqCard,HqInput,HqSelect} from '@/components/hq/ui';
import type {FieldKnowledgeGuide} from '@/utils/fieldKnowledgeGuide';
import {FIELD_RESTRICTION_LABELS,FIELD_NOTICE_LABELS} from '@/utils/fieldKnowledgeGuide';
import type {FieldKnowledgeItem} from '@/types/fieldKnowledge';
import {legacyFieldKnowledgeEntries} from '@/utils/fieldKnowledgeGuide';

interface Props{
  guide:FieldKnowledgeGuide;
  onChange:(value:FieldKnowledgeGuide)=>void;
  legacyItem:FieldKnowledgeItem;
}
const labelClass='mb-1.5 block text-[12px] font-medium text-[#60728C]';
const iconClass='size-4 text-[#71839D]';
const sectionHeading='flex items-center gap-2 text-[14px] font-semibold text-[#243750]';
const levels=['','B5','B4','B3','B2','B1','1F','2F','3F','4F','5F','로비','옥외','기타'];
type FloorProps={value:string;onChange:(value:string)=>void;id:string};
function FloorField({value,onChange,id}:FloorProps){
  const [custom,setCustom]=React.useState(Boolean(value&&!levels.includes(value)));
  return <label className="block min-w-0">
    <span className={labelClass}>층·위치 구분</span>
    <HqSelect aria-label={id+' 층 선택'} value={custom||!levels.includes(value)?'기타':value}
      onChange={event=>{
        setCustom(event.target.value==='기타');
        onChange(event.target.value==='기타'?'':event.target.value);
      }}>
      {levels.map(level=><option key={level} value={level}>{level||'미등록'}</option>)}
    </HqSelect>
    {(custom||!levels.includes(value))&&<HqInput className="mt-2" maxLength={40}
      aria-label={id+' 직접 입력'} value={value} placeholder="예: 별관 지하 2층"
      onChange={event=>onChange(event.target.value)}/>}
  </label>;
}
function NumberField({value,onChange,label,max=1440}:{
  value:number|null;onChange:(value:number|null)=>void;label:string;max?:number;
}){
  return <label className="block min-w-0">
    <span className={labelClass}>{label}</span>
    <HqInput type="number" min={0} max={max} step={1} value={value??''}
      placeholder="미확인" onChange={event=>onChange(event.target.value===''?null:Number(event.target.value))}/>
  </label>;
}

export function HqFieldKnowledgeStructuredForm({guide,onChange,legacyItem}:Props){
  const parking=(next:Partial<FieldKnowledgeGuide['parking']>)=>onChange({...guide,parking:{...guide.parking,...next}});
  const waiting=(next:Partial<FieldKnowledgeGuide['waiting']>)=>onChange({...guide,waiting:{...guide.waiting,...next}});
  const restroom=(next:Partial<FieldKnowledgeGuide['restroom']>)=>onChange({...guide,restroom:{...guide.restroom,...next}});
  const pickup=(next:Partial<FieldKnowledgeGuide['pickup']>)=>onChange({...guide,pickup:{...guide.pickup,...next}});
  const legacy=legacyFieldKnowledgeEntries(legacyItem);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 px-1">
      <HqBadge tone="selected">표준 양식 v1</HqBadge>
      <p className="text-[12px] leading-relaxed text-[#7789A1]">각 항목을 분리해 등록하면 기사 화면에도 같은 순서로 표시돼요. 확인되지 않은 값은 비워 두세요.</p>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <HqCard className="space-y-4 p-4 sm:p-5">
        <h3 className={sectionHeading}><CircleParking className={iconClass}/> 주차·무료회차</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className={labelClass}>주차 정책</span>
            <HqSelect value={guide.parking.policy}
              onChange={event=>parking({policy:event.target.value as FieldKnowledgeGuide['parking']['policy'],
                ...(event.target.value!=='free'&&event.target.value!=='conditional'?{graceMinutes:null}:{})})}>
              <option value="unknown">미확인</option><option value="free">무료</option>
              <option value="conditional">조건부 무료</option><option value="paid">유료</option>
            </HqSelect>
          </label>
          <NumberField value={guide.parking.graceMinutes} label="무료회차 시간 (분)"
            onChange={graceMinutes=>parking({graceMinutes,policy:graceMinutes!==null&&
              !['free','conditional'].includes(guide.parking.policy)?'conditional':guide.parking.policy})}/>
          <label className="block min-w-0 sm:col-span-2">
            <span className={labelClass}>할인·등록 방법</span>
            <HqSelect value={guide.parking.validation}
              onChange={event=>parking({validation:event.target.value as FieldKnowledgeGuide['parking']['validation']})}>
              <option value="unknown">미확인</option><option value="none">별도 등록 불필요</option>
              <option value="hotel">호텔·업장 등록</option><option value="staff">직원 확인</option>
              <option value="customer">고객·담당자 등록</option>
            </HqSelect>
          </label>
        </div>
      </HqCard>

      <HqCard className="space-y-4 p-4 sm:p-5">
        <h3 className={sectionHeading}><CarFront className={iconClass}/> 차량 대기·진입</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FloorField id="차량 대기" value={guide.waiting.level} onChange={level=>waiting({level})}/>
          <label className="block min-w-0">
            <span className={labelClass}>대기 구역·구획</span>
            <HqInput maxLength={100} value={guide.waiting.zone}
              onChange={event=>waiting({zone:event.target.value})} placeholder="예: 로비 뒤 A구역"/>
          </label>
          <label className="block min-w-0">
            <span className={labelClass}>스프린터 진입</span>
            <HqSelect value={guide.waiting.sprinter}
              onChange={event=>waiting({sprinter:event.target.value as FieldKnowledgeGuide['waiting']['sprinter']})}>
              <option value="unknown">미확인</option><option value="yes">가능</option>
              <option value="no">불가</option><option value="confirm">현장 확인 필요</option>
            </HqSelect>
          </label>
          <NumberField label="차고 높이 제한 (cm)" max={600}
            value={guide.waiting.heightLimitCm} onChange={heightLimitCm=>waiting({heightLimitCm})}/>
        </div>
      </HqCard>

      <HqCard className="space-y-4 p-4 sm:p-5">
        <h3 className={sectionHeading}><Users2 className={iconClass}/> 화장실</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FloorField id="화장실" value={guide.restroom.level} onChange={level=>restroom({level})}/>
          <label className="block min-w-0">
            <span className={labelClass}>상세 위치·랜드마크</span>
            <HqInput maxLength={120} value={guide.restroom.landmark}
              onChange={event=>restroom({landmark:event.target.value})}
              placeholder="예: 로비 오른쪽 복도"/>
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <span className={labelClass}>이용 가능 대상</span>
            <HqSelect value={guide.restroom.access}
              onChange={event=>restroom({access:event.target.value as FieldKnowledgeGuide['restroom']['access']})}>
              <option value="unknown">미확인</option><option value="public">일반 이용 가능</option>
              <option value="staff">직원 전용</option><option value="restricted">출입 확인 필요</option>
            </HqSelect>
          </label>
        </div>
      </HqCard>

      <HqCard className="space-y-4 p-4 sm:p-5">
        <h3 className={sectionHeading}><MapPin className={iconClass}/> 승·하차 위치</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FloorField id="승하차" value={guide.pickup.level} onChange={level=>pickup({level})}/>
          <label className="block min-w-0">
            <span className={labelClass}>출입구·게이트</span>
            <HqInput maxLength={100} value={guide.pickup.gate}
              onChange={event=>pickup({gate:event.target.value})}
              placeholder="예: 정문 2번 게이트"/>
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <span className={labelClass}>진입 방법 (최대 180자)</span>
            <HqInput maxLength={180} value={guide.pickup.instruction}
              onChange={event=>pickup({instruction:event.target.value})}
              placeholder="예: 회전교차로 통과 후 우측 진입"/>
          </label>
        </div>
      </HqCard>
    </div>

    <HqCard className="space-y-3 p-4 sm:p-5">
      <h3 className={sectionHeading}><AlertTriangle className={iconClass}/> 주정차·진입 주의사항</h3>
      <p className="text-[11px] text-[#8190A5]">자유입력 대신 해당되는 항목만 선택하세요. 여러 개 선택할 수 있어요.</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(Object.entries(FIELD_RESTRICTION_LABELS) as Array<[FieldKnowledgeGuide['restrictions'][number],string]>)
          .map(([key,label])=><label key={key}
          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[13px] bg-[#F7F9FC] px-3 py-2 text-[12px] text-[#526680]">
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
          <h3 className={sectionHeading}><Info className={iconClass}/> 유형별 추가 안내</h3>
          <p className="mt-1 text-[11px] text-[#8190A5]">특이사항만 유형을 먼저 선택하고 한 줄로 작성하세요 (최대 8개).</p>
        </div>
        <HqButton variant="secondary" size="sm" disabled={guide.notices.length>=8}
          onClick={()=>onChange({...guide,notices:[...guide.notices,{type:'event',detail:''}]})}>
          <Plus className="size-4"/> 안내 추가
        </HqButton>
      </div>
      {guide.notices.map((notice,index)=><div key={index} className="grid gap-2 rounded-[13px] bg-[#F7F9FC] p-3 sm:grid-cols-[155px_minmax(0,1fr)_auto]">
        <HqSelect aria-label={'추가 안내 '+(index+1)+' 유형'} value={notice.type}
          onChange={event=>onChange({...guide,notices:guide.notices.map((item,i)=>i===index?
            {...item,type:event.target.value as typeof notice.type}:item)})}>
          {(Object.entries(FIELD_NOTICE_LABELS) as Array<[typeof notice.type,string]>)
            .map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </HqSelect>
        <HqInput maxLength={240} value={notice.detail} aria-label={'추가 안내 '+(index+1)+' 내용'}
          placeholder="예: 11월 공사 기간에는 후문만 이용 가능"
          onChange={event=>onChange({...guide,notices:guide.notices.map((item,i)=>i===index?
            {...item,detail:event.target.value}:item)})}/>
        <HqButton variant="subtle" size="sm" aria-label={'추가 안내 '+(index+1)+' 삭제'}
          onClick={()=>onChange({...guide,notices:guide.notices.filter((_,i)=>i!==index)})}>
          <Trash2 className="size-4"/>
        </HqButton>
      </div>)}
      {!guide.notices.length&&<p className="py-3 text-center text-[12px] text-[#9AA6B5]">추가 안내가 없습니다.</p>}
    </HqCard>

    {!!legacy.length&&<HqCard className="space-y-3 p-4 sm:p-5" tone="muted">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={sectionHeading}><Truck className={iconClass}/> 이전 방식으로 작성한 정보</h3>
        <HqBadge>원본 보존</HqBadge>
      </div>
      <p className="text-[11px] leading-relaxed text-[#7789A1]">
        이전 서술형 정보는 자동 삭제하지 않아요. 새 표준 항목을 채우면 기사 앱에서는 해당 표준 항목을 우선 표시합니다.
      </p>
      <div className="divide-y divide-[#E8ECF2]">
        {legacy.map(entry=><div key={entry.field} className="grid gap-1 py-2 text-[12px] sm:grid-cols-[155px_minmax(0,1fr)]">
          <span className="text-[#8491A4]">{entry.label}</span>
          <span className="whitespace-pre-wrap break-words text-[#526680]">{entry.value}</span>
        </div>)}
      </div>
    </HqCard>}
  </div>;
}
