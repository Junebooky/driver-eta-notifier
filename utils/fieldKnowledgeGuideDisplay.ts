import type {FieldKnowledgeItem} from '@/types/fieldKnowledge';
import {FIELD_RESTRICTION_LABELS,FIELD_NOTICE_LABELS} from './fieldKnowledgeGuide';

type Row={key:string;label:string;value:string};
const fallback=(typed:string,legacy?:string)=>typed||legacy?.trim()||'';

export function fieldKnowledgeGuideRows(item:FieldKnowledgeItem):Row[]{
  const guide=item.guide;
  const p=guide?.parking;
  const parking=p?(p.policy==='free'?'무료':p.policy==='paid'?'유료':
    p.policy==='conditional'?'조건부 무료':''):'';
  const validation=p?(p.validation==='none'?'등록 불필요':p.validation==='hotel'?'호텔·업장 등록':
    p.validation==='staff'?'직원 확인':p.validation==='customer'?'고객·담당자 등록':''):'';
  const parkingInfo=[parking,p?.graceMinutes!==null&&p?.graceMinutes!==undefined?String(p.graceMinutes)+'분':'',
    validation].filter(Boolean).join(' · ');
  const w=guide?.waiting;
  const sprinter=w?(w.sprinter==='yes'?'스프린터 가능':
    w.sprinter==='no'?'스프린터 불가':w.sprinter==='confirm'?'스프린터 현장 확인':''):'';
  const waitingInfo=[w?.level,w?.zone,sprinter,
    w?.heightLimitCm!==null&&w?.heightLimitCm!==undefined?'높이 제한 '+w.heightLimitCm+'cm':''].filter(Boolean).join(' · ');
  const r=guide?.restroom;
  const access=r?(r.access==='public'?'일반 이용':r.access==='staff'?'직원 전용':
    r.access==='restricted'?'출입 확인 필요':''):'';
  const restroomInfo=[r?.level,r?.landmark,access].filter(Boolean).join(' · ');
  const pickup=guide?.pickup;
  const pickupInfo=[pickup?.level,pickup?.gate,pickup?.instruction].filter(Boolean).join(' · ');
  const restrictions=guide?.restrictions.map(key=>FIELD_RESTRICTION_LABELS[key]).join(' · ')||'';
  const result:Row[]=[
    {key:'parking',label:'주차·무료회차',value:fallback(parkingInfo,item.freeParkingNotice)},
    {key:'waiting',label:'차량 대기·진입',value:fallback(waitingInfo,item.vehicleWaitingNotes||item.sprinterWaiting)},
    {key:'restroom',label:'화장실',value:fallback(restroomInfo,item.restroomLocation)},
    {key:'pickup',label:'승·하차',value:fallback(pickupInfo,item.pickupLocationNotes)},
    {key:'restrictions',label:'주정차 주의',value:fallback(restrictions,item.cautionNotes)},
  ];
  const notices=guide?.notices||[];
  notices.forEach((note,index)=>result.push({
    key:'notice-'+index,label:FIELD_NOTICE_LABELS[note.type],value:note.detail,
  }));
  if(item.additionalNotes?.trim())result.push({
    key:'legacy-extra',label:'기존 추가 안내',value:item.additionalNotes.trim(),
  });
  if(item.sprinterWaiting?.trim() && !sprinter)result.push({
    key:'legacy-sprinter',label:'기존 스프린터 정보',value:item.sprinterWaiting.trim(),
  });
  return result.filter(row=>Boolean(row.value));
}
