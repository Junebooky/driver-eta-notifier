'use client';

import {CalendarDays,CarFront,Mail,MessageSquare} from 'lucide-react';
import type {HqCustomer} from '@/types/customerHq';
import {HqBadge,HqButton,HqCard} from '@/components/hq/ui';

export function HqCustomerActivityPanels({
  customer,tab,onComposeEmail,
}:{
  customer:HqCustomer;
  tab:'operations'|'conversations';
  onComposeEmail:(email:string)=>void;
}){
  if(tab==='operations')return <div className="grid min-w-0 grid-cols-1 gap-4">
    <HqCard className="p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-[#243750]">
        <CarFront className="size-4 text-[#7A8BA2]"/>운행 이력
      </h3>
      {customer.tripsHistory.length?<div className="divide-y divide-[#F0F3F7]">
        {customer.tripsHistory.map(trip=><div key={trip.id}
          className="flex flex-wrap items-start justify-between gap-3 py-3 text-[12px]">
          <div className="min-w-0 space-y-1">
            <p className="break-words font-semibold text-[#243750]">{trip.route}</p>
            <p className="text-[11px] text-[#8492A5]">{trip.date} · {trip.driverName||'기사 미기재'} · {trip.vehicleModel||trip.vehicleDetails}</p>
          </div>
          <HqBadge>운행 기록</HqBadge>
        </div>)}
      </div>:<p className="py-6 text-center text-[12px] text-[#8492A5]">등록된 운행 이력이 없습니다.</p>}
    </HqCard>
    <HqCard className="p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-[#243750]">
        <CalendarDays className="size-4 text-[#7A8BA2]"/>행사 기록
      </h3>
      {customer.eventsHistory.length?<div className="divide-y divide-[#F0F3F7]">
        {customer.eventsHistory.map(event=><div key={event.id} className="space-y-2 py-3 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-words font-semibold text-[#243750]">{event.title}</p>
            {event.status&&<HqBadge>{event.status==='completed'?'완료':event.status==='ongoing'?'진행 중':'예정'}</HqBadge>}
          </div>
          <p className="text-[#53657F]">{event.date} · {event.location}</p>
          <p className="text-[11px] text-[#8492A5]">차량 {event.vehiclesRequired} · {event.passengerCount}명 · {event.timeRange}</p>
        </div>)}
      </div>:<p className="py-6 text-center text-[12px] text-[#8492A5]">등록된 행사 이력이 없습니다.</p>}
    </HqCard>
  </div>;

  return <div className="grid min-w-0 grid-cols-1 gap-4">
    <HqCard className="p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-[#243750]">
        <MessageSquare className="size-4 text-[#7A8BA2]"/>요청사항
      </h3>
      {customer.recentRequests.length?<div className="divide-y divide-[#F0F3F7]">
        {customer.recentRequests.map(request=><div key={request.id}
          className="flex flex-wrap items-start justify-between gap-3 py-3 text-[12px]">
          <div className="min-w-0 space-y-1">
            <p className="break-words font-medium text-[#243750]">{request.content}</p>
            <p className="text-[11px] text-[#8492A5]">{request.date}</p>
          </div>
          <HqBadge tone={request.status==='pending'?'warning':'neutral'}>
            {request.status==='resolved'?'반영 완료':request.status==='pending'?'확인 필요':'접수 확인'}
          </HqBadge>
        </div>)}
      </div>:<p className="py-6 text-center text-[12px] text-[#8492A5]">등록된 요청사항이 없습니다.</p>}
    </HqCard>
    <HqCard className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-[#243750]">
          <Mail className="size-4 text-[#7A8BA2]"/>소통 기록
        </h3>
        {customer.mainEmail&&<HqButton variant="secondary" size="sm" onClick={()=>onComposeEmail(customer.mainEmail)}>
          <Mail className="size-4"/>새 메일 작성
        </HqButton>}
      </div>
      {customer.communications.length?<div className="divide-y divide-[#F0F3F7]">
        {customer.communications.map(comm=><div key={comm.id} className="space-y-1 py-3 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[#243750]">[{comm.channel.toUpperCase()}] {comm.sender}</p>
            <span className="text-[11px] text-[#8492A5]">{comm.date}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-[#53657F]">{comm.summary}</p>
        </div>)}
      </div>:<p className="py-6 text-center text-[12px] text-[#8492A5]">기록된 소통 내역이 없습니다.</p>}
    </HqCard>
  </div>;
}
