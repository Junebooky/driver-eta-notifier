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
}
const dotClass={
  complete:'bg-[#5A9D83]',
  partial:'bg-[#DDA453]',
  missing:'bg-[#B7C1CE]',
} as const;

export function HqDriverCardVehicleGroups({driverName,slots,vehicles,onView,onCreate}:Props){
  const groups=groupDriverCardVehicles(slots,vehicles);
  const totals=groups.reduce((sum,group)=>({
    complete:sum.complete+group.complete,
    partial:sum.partial+group.partial,
    missing:sum.missing+group.missing,
  }),{complete:0,partial:0,missing:0});

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
      {totals.missing>0&&<span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={'size-1.5 rounded-full '+dotClass.missing}/>
        미등록 {totals.missing}대
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
            {group.partial+group.missing>0&&
              <HqBadge tone={group.partial>0?'warning':'neutral'}>
                {group.partial+group.missing}대 확인 필요
              </HqBadge>}
          </div>
          <div className="space-y-2.5">
            {Array.from(models.entries()).map(([model,entries])=><div key={model} className="space-y-1.5">
              {models.size>1&&<p className="text-[11px] font-medium text-[#8291A6]">{model}</p>}
              <div className="flex flex-wrap gap-1.5">
                {entries.map(({slot,status,modelLabel})=>{
                  const label=status==='complete'?'PC·모바일 모두 완료':
                    status==='partial'?(slot.pc?'PC만 등록':'모바일만 등록'):'카드 미등록';
                  return <HqButton key={slot.vehicleId} variant="subtle" size="sm"
                    className="max-w-full gap-1.5 rounded-[11px] px-2.5"
                    aria-label={driverName+' '+modelLabel+' '+slot.plate+' '+label+(status==='missing'?' · 카드 만들기':' · 카드 보기')}
                    title={modelLabel+' · '+label}
                    onClick={()=>status==='missing'?onCreate(slot):onView(slot)}>
                    <span className={'size-1.5 shrink-0 rounded-full '+dotClass[status]} aria-hidden="true"/>
                    <span className="whitespace-nowrap text-[12px] font-semibold">{slot.plate}</span>
                  </HqButton>;
                })}
              </div>
            </div>)}
          </div>
        </HqCard>;
      })}
    </div>
    <p className="text-[11px] text-[#8B99AA]">
      등록된 차량번호를 누르면 카드를 볼 수 있고, 미등록 차량은 카드 만들기로 이동해요.
    </p>
  </section>;
}
