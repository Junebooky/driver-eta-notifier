'use client';

import React from 'react';
import {HqBadge,HqButton,HqCard} from '@/components/hq/ui';
import type {DispatchCardCoverageSlot} from '@/lib/dispatchCards/dispatchCardCoverage';
import type {VipRealVehicle} from '@/utils/vehicleData';
import {groupDriverCardVehicles} from '@/utils/driverDispatchCardVehicles';

interface Props{
  driverName:string;
  slots:readonly DispatchCardCoverageSlot[];
  vehicles:readonly VipRealVehicle[];
  onView:(slot:DispatchCardCoverageSlot)=>void;
  onCreate:(slot:DispatchCardCoverageSlot)=>void;
  highlightedVehicleIds?:readonly string[];
  highlightLabel?:string;
}
const dotClass={
  complete:'bg-[#5A9D83]',
  partial:'bg-[#DDA453]',
  missing:'bg-[#B7C1CE]',
  photos_missing:'bg-[#B7C1CE]',
} as const;

export function HqDriverCardVehicleGroups({
  driverName,
  slots,
  vehicles,
  onView,
  onCreate,
  highlightedVehicleIds = [],
  highlightLabel = '',
}:Props){
  const groups=groupDriverCardVehicles(slots,vehicles);
  const highlightedSet=React.useMemo(()=>new Set(highlightedVehicleIds),[highlightedVehicleIds]);
  const hasHighlights=highlightedSet.size>0;
  const totals=groups.reduce((sum,group)=>({
    complete:sum.complete+group.complete,
    partial:sum.partial+group.partial,
    missing:sum.missing+group.missing,
    photos_missing:sum.photos_missing+group.photos_missing,
  }),{complete:0,partial:0,missing:0,photos_missing:0});

  if(!slots.length)return <p className="py-4 text-[12px] text-[#8291A5]">
    사진 준비가 완료된 차량이 없습니다.
  </p>;

  return <section aria-label={driverName+' 배차카드 차종별 현황'} className="space-y-3">
    {/* Explain PC and mobile only once. The plate is the primary scan target. */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#73849B]">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={'size-1.5 rounded-full '+dotClass.complete}/>
        완료 {totals.complete}대 <span className="text-[#A1ADBD]">(PC·모바일 모두)</span>
      </span>
      {totals.partial>0&&<span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={'size-1.5 rounded-full '+dotClass.partial}/>
        일부 등록 {totals.partial}대
      </span>}
      {totals.missing+totals.photos_missing>0&&<span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={'size-1.5 rounded-full '+dotClass.missing}/>
        미등록 {totals.missing+totals.photos_missing}대
      </span>}
      {totals.photos_missing>0&&<span className="inline-flex items-center gap-1.5 text-[#8B97A8]">
        · 이미지 미준비 {totals.photos_missing}대
      </span>}
    </div>

    <div className="grid grid-cols-1 items-start gap-2.5 xl:grid-cols-2">
      {groups.map(group=>{
        const models=new Map<string,typeof group.entries>();
        for(const entry of group.entries){
          const previous=models.get(entry.modelLabel)||[];
          models.set(entry.modelLabel,[...previous,entry]);
        }
        return <HqCard key={group.key} tone="muted" className="min-w-0 space-y-3 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-[12px] font-semibold text-[#243750]">{group.label}</h4>
              <span className="text-[11px] tabular-nums text-[#8997A9]">{group.entries.length}대</span>
            </div>
            {group.partial+group.missing+group.photos_missing>0&&
              <HqBadge tone={group.partial>0?'warning':'neutral'}>
                {group.partial+group.missing+group.photos_missing}대 확인 필요
              </HqBadge>}
          </div>
          <div className="space-y-2.5">
            {Array.from(models.entries()).map(([model,entries])=><div key={model} className="space-y-1.5">
              {models.size>1&&<p className="text-[11px] font-medium text-[#8291A6]">{model}</p>}
              <div className={hasHighlights ? 'flex flex-wrap gap-x-2 gap-y-4 pt-6' : 'flex flex-wrap gap-1.5'}>
                {entries.map(({slot,status,modelLabel})=>{
                  const label=status==='complete'?'PC·모바일 모두 완료':
                    status==='partial'?(slot.pc?'PC만 등록':'모바일만 등록'):
                    status==='photos_missing'?'차량 이미지 미준비':'카드 미등록';
                  const isHighlighted=highlightedSet.has(slot.vehicleId);
                  const bubbleTarget=highlightLabel || slot.plate.match(/\d{4}$/)?.[0] || slot.plate;
                  const bubbleBadge=isHighlighted ? (
                    <span
                      role="status"
                      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2"
                    >
                      <span className="relative block whitespace-nowrap rounded-full bg-[#1E60F3] px-2.5 py-1 text-[11px] font-bold leading-none text-white shadow-[0_6px_16px_rgba(30,96,243,0.3)]">
                        {bubbleTarget} 여깄어요!
                        <span aria-hidden="true" className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-[#1E60F3]" />
                      </span>
                    </span>
                  ) : null;
                  if(status==='photos_missing'){
                    return <span key={slot.vehicleId} className={isHighlighted ? 'relative inline-flex hq-card-plate-float' : 'inline-flex'}>
                      {bubbleBadge}
                      <span
                        aria-label={driverName+' '+modelLabel+' '+slot.plate+' '+label}
                        title={modelLabel+' · '+label+' · 차량 이미지가 준비되면 생성할 수 있어요.'}
                        className={'inline-flex min-h-9 items-center gap-1.5 rounded-[11px] px-2.5 text-[12px] font-medium ' +
                          (isHighlighted ? 'bg-[#EEF3FF] text-[#1E60F3] ring-2 ring-[#1E60F3] shadow-[0_6px_16px_rgba(30,96,243,0.18)] font-semibold' : 'bg-[#F3F5F8] text-[#8D9AAA]')}>
                        <span aria-hidden="true" className={'size-1.5 shrink-0 rounded-full '+dotClass[status]}/>
                        {slot.plate}
                      </span>
                    </span>;
                  }
                  return <span key={slot.vehicleId} className={isHighlighted ? 'relative inline-flex hq-card-plate-float' : 'inline-flex'}>
                    {bubbleBadge}
                    <HqButton variant="subtle" size="sm"
                      className={'max-w-full gap-1.5 rounded-[11px] px-2.5 ' +
                        (isHighlighted ? '!bg-[#EEF3FF] !text-[#1E60F3] ring-2 ring-[#1E60F3] shadow-[0_6px_16px_rgba(30,96,243,0.18)]' : '')}
                      aria-label={driverName+' '+modelLabel+' '+slot.plate+' '+label+(status==='missing'?' · 카드 만들기':' · 카드 보기')}
                      title={modelLabel+' · '+label}
                      onClick={()=>status==='missing'?onCreate(slot):onView(slot)}>
                      <span className={'size-1.5 shrink-0 rounded-full '+dotClass[status]} aria-hidden="true"/>
                      <span className="whitespace-nowrap text-[12px] font-semibold">{slot.plate}</span>
                    </HqButton>
                  </span>;
                })}
              </div>
            </div>)}
          </div>
        </HqCard>;
      })}
    </div>
    <p className="text-[11px] text-[#8B99AA]">
      등록된 카드는 보기, 미생성 카드는 제작으로 이동해요. 이미지 미준비 차량은 원본 사진 등록 후 생성할 수 있어요.
    </p>
  </section>;
}
