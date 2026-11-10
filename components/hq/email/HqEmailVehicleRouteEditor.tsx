'use client';

import React, { useState } from 'react';
import { CalendarDays, CarFront, Clock3, MapPin, Pencil, Check, X, Search, ChevronDown } from 'lucide-react';
import type { HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import { vehicleRouteDays, vehicleRouteLabels } from '@/utils/emailVehicleRoutes';
import { HqPlaceSearchInput, type PoiResult } from '@/components/hq/HqPlaceSearchInput';

type Props={
  draft:HqEmailExtractedDraft;
  onUpdateDraft?: (draft:HqEmailExtractedDraft)=>void;
  onLocateSource?: (text:string)=>void;
  compact?:boolean;
};

/** A-style visible route cards. Vehicle labels come from the client, not from
 * physical fleet assignments. All stops start expanded; no native <select>.
 */
export function HqEmailVehicleRouteEditor({draft,onUpdateDraft,onLocateSource,compact=false}:Props) {
  const routes=vehicleRouteDays(draft);
  const labels=vehicleRouteLabels(draft);
  const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});
  const [editing,setEditing]=useState<string|null>(null);
  const updateRoute=(routeId:string,fn:(route:NonNullable<HqEmailExtractedDraft['vehicleRoutes']>[number])=>NonNullable<HqEmailExtractedDraft['vehicleRoutes']>[number])=>{
    onUpdateDraft?.({...draft,vehicleRoutes:draft.vehicleRoutes?.map(route=>route.id===routeId?fn(route):route)});
  };
  const updateStop=(routeId:string,stopId:string,fn:(stop:RouteWaypointItem)=>RouteWaypointItem)=>{
    updateRoute(routeId,route=>({...route,stops:route.stops.map(point=>point.id===stopId?fn(point):point)}));
  };
  if(!routes.length)return null;
  return <div className="space-y-3" aria-label="고객사 요청 차량별 전체 경로">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[#50627C]">
        <CarFront className="h-4 w-4" strokeWidth={1.7} />
        고객사 요청 차량 {labels.length}대
      </div>
      <span className="text-[11px] text-[#8290A1]">운행 일정 {routes.length}건 · 차량별 경로는 따로 저장돼요</span>
    </div>
    {routes.map((route)=>{
      const isClosed=Boolean(collapsed[route.id]);
      const routeKey=route.id;
      return <div key={routeKey} className="overflow-visible rounded-[17px] bg-white shadow-[0_3px_17px_rgba(35,49,78,0.055)]">
        <button type="button" aria-expanded={!isClosed}
          onClick={()=>setCollapsed(v=>({...v,[routeKey]:!v[routeKey]}))}
          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-[17px] bg-[#F7F9FC] px-4 py-3.5 text-left hover:bg-[#F2F5FA]">
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#19283C]">
              <CarFront className="h-4 w-4 text-[#8494AC]" strokeWidth={1.7} />
              {route.vehicleLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium tabular-nums text-[#657893]">
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.6} />
              {route.date}
            </span>
            <span className="text-[11px] text-[#8595AC]">{route.stops.length}곳</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#8795A8] transition-transform ${!isClosed?'rotate-180':''}`} strokeWidth={1.7} />
        </button>
        {!isClosed && <div className={`space-y-2 ${compact?'px-3 py-3':'px-4 py-4'}`}>
          {(route.passengerName || route.requestedVehicleClass) && (
            <p className="break-words px-1 text-[11px] leading-relaxed text-[#718199]">
              {[route.requestedVehicleClass,route.passengerName,route.passengerCount ? `${route.passengerCount}명` : ''].filter(Boolean).join(' · ')}
            </p>
          )}
          {route.stops.map((stop,idx)=>{
            const open=editing===route.id+':'+stop.id;
            return <div key={stop.id} className="flex items-start gap-3 px-1 py-2">
              <div className="flex shrink-0 flex-col items-center self-stretch pt-1">
                <span className={`h-2.5 w-2.5 rounded-full ${idx===0?'bg-[#1E60F3]':'bg-[#B9C5D4]'}`} />
                {idx<route.stops.length-1 && <div className="my-1 min-h-6 w-px flex-1 bg-[#E8EDF3]" />}
              </div>
              <div className="min-w-0 flex-1">
                {open? (
                  <div className="space-y-2.5 rounded-[14px] bg-[#F8FAFD] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-[#63758D]">
                        <Clock3 className="h-3.5 w-3.5" />
                        <input type="text" inputMode="numeric" aria-label={`${route.date} ${route.vehicleLabel} ${idx+1}번째 장소 시간`}
                          placeholder="시간 미지정" value={stop.time||''}
                          onChange={e=>updateStop(route.id,stop.id,p=>({...p,time:e.target.value}))}
                          className="h-10 w-28 rounded-[11px] bg-white px-3 text-[12px] font-semibold tabular-nums text-[#1D2B42] outline-none focus:ring-1 focus:ring-[#1E60F3]/40" />
                      </label>
                      <button type="button" onClick={()=>setEditing(null)}
                        className="ml-auto inline-flex h-9 items-center gap-1 rounded-[10px] bg-[#1E60F3] px-3 text-[11px] font-semibold text-white"><Check className="h-3.5 w-3.5"/>완료</button>
                    </div>
                    <HqPlaceSearchInput value={stop.location} addressHint={stop.clientAddress}
                      onChange={location=>updateStop(route.id,stop.id,p=>({
                        ...p,location,address:undefined,lat:undefined,lng:undefined,isPoiConfirmed:false,
                      }))}
                      onSelectPoi={(poi:PoiResult)=>updateStop(route.id,stop.id,p=>({
                        ...p,location:poi.name,address:poi.address,lat:poi.lat,lng:poi.lng,isPoiConfirmed:true,
                      }))}
                      isConfirmed={Boolean(stop.isPoiConfirmed)}
                      placeholder="TMAP 장소 검색" heightClass="h-11 rounded-[12px]" />
                    {stop.clientAddress && <p className="select-text break-words text-[11px] text-[#6C7F99]">고객사 주소: {stop.clientAddress}</p>}
                  </div>
                ):(
                  <>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="text-[12px] font-semibold tabular-nums text-[#516783]">{stop.time||'시간 미지정'}</span>
                          <span className="select-text break-words text-[13px] font-semibold text-[#19283C]">{stop.location||'장소 미지정'}</span>
                        </div>
                        {stop.clientAddress && <p className="mt-1 select-text break-words text-[11px] text-[#73839B]">{stop.clientAddress}</p>}
                        {stop.notes && !compact && <p className="mt-1 select-text whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#8795AA]">{stop.notes}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {onLocateSource && <button type="button" onClick={()=>onLocateSource(stop.clientAddress||stop.location)}
                          aria-label={`${route.vehicleLabel} ${route.date} ${stop.location} 원문 찾기`}
                          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#7E8FA6] hover:bg-[#F4F7FC]" title="원문에서 찾기"><Search className="h-4 w-4" strokeWidth={1.6}/></button>}
                        <button type="button" onClick={()=>setEditing(route.id+':'+stop.id)}
                          aria-label={`${route.vehicleLabel} ${route.date} ${stop.location} 수정`}
                          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#7E8FA6] hover:bg-[#F4F7FC]" title="장소·시간 수정"><Pencil className="h-4 w-4" strokeWidth={1.6}/></button>
                      </div>
                    </div>
                    {stop.isPoiConfirmed ? <p className="mt-1 text-[11px] text-[#7787A0]">TMAP 주소 확인됨</p>
                      : <p className="mt-1 text-[11px] text-[#8B98A9]">TMAP 주소 미확정</p>}
                  </>
                )}
              </div>
            </div>;
          })}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#F0F3F7] px-1 pt-3">
            <label className="inline-flex items-center gap-2 text-[12px] text-[#6B7D95]">
              <Clock3 className="h-3.5 w-3.5" strokeWidth={1.7}/>
              실제 종료 시간
              <input type="text" inputMode="numeric" value={route.endTime||''}
                onChange={e=>updateRoute(route.id,r=>({...r,endTime:e.target.value}))}
                aria-label={`${route.date} ${route.vehicleLabel} 실제 종료 시간`}
                placeholder="미지정"
                className="h-10 w-24 rounded-[11px] bg-[#F7F9FC] px-3 text-center text-[12px] font-semibold tabular-nums text-[#1D2B42] outline-none focus:ring-1 focus:ring-[#1E60F3]/35" />
            </label>
            {route.sourceFilename && <span className="min-w-0 truncate text-[10px] text-[#9AA6B5]">{route.sourceFilename}</span>}
          </div>
        </div>}
      </div>;
    })}
  </div>;
}
