'use client';

import {useEffect,useState} from 'react';
import {ArrowRight, CalendarDays, CarFront, FileText, Heart, Mail, MessageSquare, Phone, Plus, Users, Pencil} from 'lucide-react';
import type {HqCustomer,CustomerContact} from '@/types/customerHq';
import {HqBadge,HqButton,HqCard} from '@/components/hq/ui';
import {formatKRW} from '@/utils/expense';
import {contactPhones,contactEmails} from '@/lib/customers/contactChannels';

interface Props {
  customer:HqCustomer; expenseCount:number; expenseTotal:number;
  onAddContact:()=>void; onEditContactMemo:(contact:CustomerContact)=>void;
  onEditContact:(contact:CustomerContact)=>void;
  onEditCompanyNotes:()=>void; onEditPreferences:()=>void;
  onComposeEmail:(email:string)=>void;
  onNavigate:(tab:'operations'|'billing'|'conversations')=>void;
}

export function HqCustomerOverview({
  customer,expenseCount,expenseTotal,onAddContact,onEditContactMemo,onEditContact,
  onEditCompanyNotes,onEditPreferences,onComposeEmail,onNavigate,
}:Props){
  const [showAll,setShowAll]=useState(false);
  useEffect(()=>setShowAll(false),[customer.id]);
  const contacts=showAll?customer.contacts:customer.contacts.slice(0,3);
  const lastTrip=customer.recentTrip||customer.tripsHistory[0];
  const nextEvent=customer.nextEvent||customer.eventsHistory.find(e=>e.status==='upcoming');

  return <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
    {/* First row: people and notes are the most frequently used operational facts. */}
    <HqCard className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#243750]">
          <Users className="size-4 text-[#7A8BA2]"/>담당자 ({customer.contacts.length})
        </h3>
        <HqButton variant="subtle" size="sm" onClick={onAddContact}><Plus className="size-3.5"/> 추가</HqButton>
      </div>
      <div className="space-y-2.5">
        {contacts.length?contacts.map(person=><div key={person.id}
          className="rounded-[13px] bg-[#F7F9FC] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-semibold text-[#243750]">{person.name}</span>
                {person.isPrimary&&<HqBadge>대표</HqBadge>}
              </div>
              <p className="mt-0.5 text-[11px] text-[#7889A1]">
                {[person.role,person.department].filter(Boolean).join(' · ')||'담당자'}
              </p>
            </div>
            <HqButton variant="secondary" size="sm" className="shrink-0"
              aria-label={person.name+' 정보 수정'} onClick={()=>onEditContact(person)}>
              <Pencil className="size-3.5"/> 수정
            </HqButton>
          </div>
          <div className="mt-2 space-y-1.5">
            {contactPhones(person).map((phone,index)=><a key={phone+index}
              href={'tel:'+phone} aria-label={person.name+' 전화 '+phone}
              className="flex min-w-0 items-center gap-2 break-all text-[11px] text-[#526680] hover:underline">
              <Phone className="size-3.5 shrink-0 text-[#8190A5]"/>
              <span>{phone}</span>
              {index===0&&contactPhones(person).length>1&&<span className="text-[#8D99AA]">기본</span>}
            </a>)}
            {contactEmails(person).map((email,index)=><button type="button"
              key={email+index} onClick={()=>onComposeEmail(email)}
              aria-label={person.name+' 이메일 '+email}
              className="flex min-w-0 cursor-pointer items-center gap-2 break-all text-left text-[11px] text-[#526680] hover:underline">
              <Mail className="size-3.5 shrink-0 text-[#8190A5]"/>
              <span className="min-w-0 break-all">{email}</span>
              {index===0&&contactEmails(person).length>1&&<span className="text-[#8D99AA]">기본</span>}
            </button>)}
            {!contactPhones(person).length&&!contactEmails(person).length&&
              <p className="text-[11px] text-[#99A5B4]">연락처 미등록 · 수정에서 추가 가능</p>}
          </div>
          {person.memo&&<p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#53657F]">
            {person.memo}
          </p>}
          <HqButton variant="subtle" size="sm" className="mt-2"
            onClick={()=>onEditContactMemo(person)}>
            <FileText className="size-3.5"/>{person.memo?'개인 메모 수정':'개인 메모 추가'}
          </HqButton>
        </div>):<p className="py-5 text-center text-[12px] text-[#8997AA]">담당자가 없습니다.</p>}
      </div>
      {customer.contacts.length>3&&<HqButton variant="subtle" size="sm" className="mt-3"
        aria-expanded={showAll} onClick={()=>setShowAll(v=>!v)}>
        {showAll?'접기':'담당자 '+customer.contacts.length+'명 모두 보기'}
      </HqButton>}
    </HqCard>

    <HqCard className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#243750]">
          <FileText className="size-4 text-[#7A8BA2]"/>고객사 메모
        </h3>
        <HqButton variant="subtle" size="sm" onClick={onEditCompanyNotes}>수정</HqButton>
      </div>
      {customer.notes.length?<div className="space-y-2">
        {customer.notes.map((note,i)=><p key={i} className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[#53657F]">{note}</p>)}
      </div>:<p className="py-4 text-center text-[12px] text-[#8997AA]">등록된 고객사 공통 메모가 없습니다.</p>}
      <div className="mt-5 border-t border-[#EDF1F5] pt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-[13px] font-semibold text-[#243750]">
            <Heart className="size-4 text-[#7A8BA2]"/>주요 선호사항
          </h4>
          <HqButton variant="subtle" size="sm" onClick={onEditPreferences}>수정</HqButton>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {customer.preferences.length?customer.preferences.map(pref=><HqBadge key={pref}>{pref}</HqBadge>):
            <span className="text-[12px] text-[#8997AA]">등록된 선호사항이 없습니다.</span>}
        </div>
      </div>
    </HqCard>

    {/* Second row onward: recent operational activity. */}
    <HqCard className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#243750]">
          <MessageSquare className="size-4 text-[#7A8BA2]"/>최근 요청 사항
        </h3>
        <HqButton variant="subtle" size="sm" onClick={()=>onNavigate('conversations')}>전체 보기 <ArrowRight className="size-3.5"/></HqButton>
      </div>
      {customer.recentRequests.length?<div className="space-y-2.5">
        {customer.recentRequests.slice(0,3).map(req=><div key={req.id} className="flex items-start justify-between gap-2 text-[12px]">
          <span className="min-w-0 break-words text-[#53657F]">{req.content}</span>
          <span className="shrink-0 text-[11px] text-[#8B98AA]">{req.date}</span>
        </div>)}
      </div>:<p className="py-5 text-center text-[12px] text-[#8997AA]">등록된 요청사항이 없습니다.</p>}
    </HqCard>

    <HqCard className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#243750]">
          <CarFront className="size-4 text-[#7A8BA2]"/>최근 운행
        </h3>
        <HqButton variant="subtle" size="sm" onClick={()=>onNavigate('operations')}>전체 보기 <ArrowRight className="size-3.5"/></HqButton>
      </div>
      {lastTrip?<div className="space-y-1.5 text-[12px]">
        <p className="font-semibold text-[#243750]">{lastTrip.date}</p>
        <p className="break-words text-[#53657F]">{lastTrip.route}</p>
        <p className="text-[11px] text-[#8593A5]">{lastTrip.vehicleDetails}</p>
      </div>:<p className="py-5 text-center text-[12px] text-[#8997AA]">최근 운행 이력이 없습니다.</p>}
    </HqCard>

    <HqCard className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#243750]">
          <CalendarDays className="size-4 text-[#7A8BA2]"/>다음 행사
        </h3>
        <HqButton variant="subtle" size="sm" onClick={()=>onNavigate('operations')}>전체 보기 <ArrowRight className="size-3.5"/></HqButton>
      </div>
      {nextEvent?<div className="space-y-1.5 text-[12px]">
        <p className="font-semibold text-[#243750]">{nextEvent.title||nextEvent.date}</p>
        <p className="text-[#53657F]">{nextEvent.date} · {nextEvent.location}</p>
        <p className="text-[11px] text-[#8593A5]">{nextEvent.vehiclesRequired} · {nextEvent.passengerCount}명 · {nextEvent.timeRange}</p>
      </div>:<p className="py-5 text-center text-[12px] text-[#8997AA]">예정된 다음 행사가 없습니다.</p>}
    </HqCard>

    <HqCard className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#243750]">
          <FileText className="size-4 text-[#7A8BA2]"/>배차 경비 요약
        </h3>
        <HqButton variant="subtle" size="sm" onClick={()=>onNavigate('billing')}>상세 보기 <ArrowRight className="size-3.5"/></HqButton>
      </div>
      <p className="text-[21px] font-semibold tracking-tight text-[#243750]">{formatKRW(expenseTotal)}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#8593A5]">고객사와 연결된 제출 경비 {expenseCount}건 합계입니다. 실제 고객 청구 금액과 다를 수 있어요.</p>
    </HqCard>
  </div>;
}
