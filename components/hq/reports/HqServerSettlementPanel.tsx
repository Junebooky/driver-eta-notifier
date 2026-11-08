'use client';

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {CheckCircle2, ChevronDown, FileText, RefreshCw, ShieldCheck} from 'lucide-react';
import type {LedgerDocument, LedgerAction, SettlementContract, SettlementTotals} from '@/lib/settlement/serverLedger';
import {HqSearchSelect} from '@/components/hq/ui/HqSearchSelect';
import {HqBookingLogLinkPanel} from '@/components/hq/reports/HqBookingLogLinkPanel';

type ScheduleChoice = {
  id:string;date:string;customerName:string;eventName:string;
  vehicleModel:string;vehiclePlate:string;driverName:string;
};
const emptyForm = {reference:'',laborReference:'',baseRate:'',overtimeHourlyRate:'0',
  driverLaborCost:'',baseHours:'10',roundingMinutes:'30',vatMode:'unset'};
const displayAmount = (n:unknown) => typeof n==='number' ? n.toLocaleString('ko-KR')+'원' : '미확정';
const stageLabel:Record<string,string> = {
  draft:'초안',reviewing:'요율 검토',approved:'서버 승인',issued:'발행 완료',
};

/** Operational server ledger is intentionally separate from legacy browser-only reports. */
export function HqServerSettlementPanel(){
  const [expanded,setExpanded]=useState(true);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');
  const [choices,setChoices]=useState<ScheduleChoice[]>([]);
  const [docs,setDocs]=useState<LedgerDocument[]>([]);
  const [selected,setSelected]=useState('');
  const [form,setForm]=useState(emptyForm);
  const [confirmed,setConfirmed]=useState(false);

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch('/api/hq/settlements',{cache:'no-store'});
      const data=await response.json().catch(()=>({})) as {
        ok?:boolean;error?:string;documents?:LedgerDocument[];schedules?:ScheduleChoice[];
      };
      if(!response.ok || !data.ok || !Array.isArray(data.documents) || !Array.isArray(data.schedules))
        throw new Error(data.error||'서버 정산 목록을 불러올 수 없습니다.');
      setDocs(data.documents);setChoices(data.schedules);
      setSelected(prev=>data.schedules!.some(s=>s.id===prev)?prev:(data.schedules![0]?.id||''));
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'서버 연결 실패');setDocs([]);setChoices([]);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const doc=useMemo(()=>docs.find(d=>d.schedule_id===selected)||null,[docs,selected]);
  const schedule=useMemo(()=>choices.find(s=>s.id===selected),[choices,selected]);
  useEffect(()=>{
    const c=doc?.contract_snapshot as Partial<SettlementContract>|undefined;
    if(c && typeof c.baseRate==='number'){
      setForm({
        reference:c.reference||'',laborReference:c.laborReference||'',
        baseRate:String(c.baseRate),overtimeHourlyRate:String(c.overtimeHourlyRate??0),
        driverLaborCost:String(c.driverLaborCost??0),baseHours:String(c.baseHours||10),
        roundingMinutes:String(c.roundingMinutes||30),vatMode:c.vatMode||'unset',
      });
    }else setForm(emptyForm);
    setConfirmed(false);setInfo('');
  },[selected,doc?.id,doc?.version]);

  const action=async(kind:LedgerAction)=>{
    if(!selected||busy)return;
    setBusy(true);setError('');setInfo('');
    try{
      const contract=kind==='price'?{
        reference:form.reference,laborReference:form.laborReference,
        baseRate:Number(form.baseRate),overtimeHourlyRate:Number(form.overtimeHourlyRate),
        driverLaborCost:Number(form.driverLaborCost),baseHours:Number(form.baseHours),
        roundingMinutes:Number(form.roundingMinutes),vatMode:form.vatMode,
      }:undefined;
      const response=await fetch('/api/hq/settlements',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:kind,scheduleId:selected,expectedVersion:doc?.version||0,contract}),
      });
      const data=await response.json().catch(()=>({})) as {ok?:boolean;error?:string};
      if(!response.ok||!data.ok)throw new Error(data.error||'정산 저장에 실패했습니다.');
      setConfirmed(false);
      setInfo(kind==='prepare'?'서버 원본을 조회해 정산 초안을 생성했습니다.':
        kind==='price'?'계약·인건비 증빙과 계산 결과를 서버 검토본에 저장했습니다.':
        kind==='approve'?'관리자 승인 이력이 서버에 고정되었습니다.':'서버 발행 이력이 저장되었습니다.');
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'정산 저장 실패');}
    finally{setBusy(false);}
  };
  const download=async()=>{
    if(!doc||busy)return;
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/hq/settlements?download='+encodeURIComponent(doc.id),{cache:'no-store'});
      if(!response.ok){
        const data=await response.json().catch(()=>({})) as {error?:string};
        throw new Error(data.error||'발행 정산서 확인에 실패했습니다.');
      }
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      try{
        const a=document.createElement('a');a.href=url;a.download='서버발행_정산서_'+doc.id+'.csv';a.click();
      }finally{URL.revokeObjectURL(url);}
    }catch(e){setError(e instanceof Error?e.message:'다운로드 실패');}
    finally{setBusy(false);}
  };
  const setField=(name:keyof typeof form,value:string)=>setForm(previous=>({...previous,[name]:value}));
  const field=(name:keyof typeof form,label:string,type:'text'|'number'='text')=>(
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-[#53647B]" key={name}>
      {label}
      <input aria-label={label} type={type} min={type==='number'?0:undefined}
        value={form[name]} onChange={e=>setField(name,e.target.value)}
        className="min-h-10 w-full rounded-xl bg-[#F7F9FC] px-3 text-[13px] font-medium text-[#253552] outline-none focus:ring-2 focus:ring-[#1E60F3]/25" />
    </label>
  );
  const totals=doc?.totals_snapshot as Partial<SettlementTotals>|undefined;

  return (
    <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_8px_28px_rgba(35,49,78,0.055)] sm:px-5 print:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#F5F7FB]">
            <ShieldCheck className="size-5 text-[#1E60F3]" />
          </span>
          <div>
            <h3 className="text-[15px] font-bold text-[#17233B]">서버 정산 원장</h3>
            <p className="mt-1 text-[12px] leading-5 text-[#78879B]">
              실제 예약·승인 운행일지·검수 경비로만 계산 · 요율/인건비 증빙 후 관리자 승인
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={()=>void refresh()} disabled={busy||loading}
            className="rounded-xl p-2 text-[#78879B] hover:bg-[#F5F7FB] disabled:opacity-40"
            aria-label="서버 정산 새로고침"><RefreshCw className="size-4"/></button>
          <button type="button" onClick={()=>setExpanded(x=>!x)}
            className="rounded-xl p-2 text-[#78879B] hover:bg-[#F5F7FB]"
            aria-expanded={expanded} aria-label="서버 정산 접기 및 펼치기">
            <ChevronDown className={'size-4 transition-transform '+(expanded?'rotate-180':'')}/>
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 space-y-4">
          <HqBookingLogLinkPanel onLinked={refresh}/>
          {loading && <p role="status" className="text-[12px] text-[#8290A4]">서버 정산 자료를 불러오는 중입니다.</p>}
          {error && <p role="alert" className="rounded-xl bg-[#FFF7F5] p-3 text-[12px] text-[#A25F58]">{error}</p>}
          {info && <p role="status" className="rounded-xl bg-[#F6F8FC] p-3 text-[12px] text-[#52647A]">{info}</p>}
          {!loading && !error && choices.length===0 && (
            <p className="text-[12px] text-[#8290A4]">서버에 등록된 실제 예약이 없습니다. 배차를 먼저 등록해 주세요.</p>
          )}
          {choices.length>0 && (
            <>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-[#75849A]">서버에 등록된 예약 선택</p>
                <HqSearchSelect label="정산할 실제 예약" size="sm" value={selected}
                  onChange={setSelected} placeholder="예약 선택"
                  options={choices.map(item=>({
                    value:item.id,
                    label:[item.date,item.customerName,item.vehiclePlate||'차량 미배정'].join(' · '),
                    subtitle:item.driverName||'기사 미배정',
                    status:docs.some(d=>d.schedule_id===item.id)?'정산 기록 있음':undefined,
                  }))}/>
              </div>
              {schedule && <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8290A4]">
                <span>{schedule.eventName||'행사명 미등록'}</span><span>·</span>
                <span>{schedule.vehicleModel||'차종 미등록'}</span>
                {doc && <span className="rounded-lg bg-[#F3F6FA] px-2 py-1 font-semibold text-[#52647A]">
                  {stageLabel[doc.status]||doc.status} · v{doc.version}
                </span>}
              </div>}
              {(!doc||doc.status==='draft'||doc.status==='reviewing') && (
                <div className="space-y-3">
                  <button type="button" disabled={busy||loading}
                    onClick={()=>void action('prepare')}
                    className="min-h-10 rounded-xl bg-[#F3F6FA] px-4 text-[12px] font-semibold text-[#52647A] disabled:opacity-50">
                    {doc?'운행·경비 원본 다시 불러오기':'실제 예약으로 정산 초안 생성'}
                  </button>
                  {doc && (
                    <>
                      <div className="rounded-xl bg-[#F7F9FC] p-3 text-[12px] leading-6 text-[#52647A]">
                        <div>운행일지 승인: {doc.source_snapshot.serviceVerified?'확인됨':'검증 필요'}</div>
                        <div>미검수 경비: {doc.source_snapshot.pendingExpenseCount}건</div>
                        <div>서비스 시간: {doc.source_snapshot.serviceMinutes ?? '미확인'}분</div>
                        <div>고객 청구 가능 승인 실비: {displayAmount(doc.source_snapshot.billableExpenses.reduce((v,e)=>v+e.amount,0))}</div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {field('reference','계약·확정 요율 증빙번호')}
                        {field('laborReference','기사 인건비 증빙번호')}
                        {field('baseRate','기본요금 (원)','number')}
                        {field('overtimeHourlyRate','시간당 초과요금 (원)','number')}
                        {field('driverLaborCost','확인된 기사 인건비 (원)','number')}
                        {field('baseHours','기본 서비스 시간 (시간)','number')}
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-[#53647B]">초과시간 올림 단위</p>
                          <HqSearchSelect label="초과시간 올림 단위" size="sm"
                            value={form.roundingMinutes} onChange={value=>setField('roundingMinutes',value)}
                            placeholder="반올림 단위" options={[
                              {value:'1',label:'1분'},{value:'10',label:'10분'},
                              {value:'30',label:'30분'},{value:'60',label:'60분'},
                            ]}/>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-[#53647B]">부가세 기준</p>
                          <HqSearchSelect label="정산 부가세 기준" size="sm"
                            value={form.vatMode} onChange={value=>setField('vatMode',value)}
                            placeholder="부가세 처리" options={[
                              {value:'unset',label:'미확정'},
                              {value:'included',label:'요금에 포함'},
                              {value:'excluded',label:'요금 별도'},
                            ]}/>
                        </div>
                      </div>
                      <button type="button" disabled={busy||loading||form.vatMode==='unset'}
                        onClick={()=>void action('price')}
                        className="min-h-10 rounded-xl bg-[#1E60F3] px-4 text-[12px] font-bold text-white disabled:bg-[#E8EDF5] disabled:text-[#8996A9]">
                        계약 증빙 반영 및 서버 재계산
                      </button>
                    </>
                  )}
                </div>
              )}
              {doc && (doc.status==='reviewing'||doc.status==='approved'||doc.status==='issued') && totals && (
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F7F9FC] p-4 sm:grid-cols-4">
                  {[['공급가액',totals.supplyAmount],['초과요금',totals.overtimeFare],
                    ['승인 실비',totals.billableExpenses],['부가세 포함 청구액',totals.grandTotal]].map(([label,value])=>(
                    <div key={String(label)}>
                      <p className="text-[11px] text-[#8290A4]">{label}</p>
                      <p className="mt-1 text-[14px] font-bold text-[#253552]">{displayAmount(value)}</p>
                    </div>
                  ))}
                </div>
              )}
              {doc?.status==='reviewing' && (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-[12px] leading-5 text-[#52647A]">
                    <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}
                      className="mt-1 accent-[#1E60F3]"/>
                    예약·운행시간·실비 영수증과 계약·인건비 증빙을 대조했습니다. 서버 승인 후 금액이 고정됩니다.
                  </label>
                  <button type="button" disabled={!confirmed||busy} onClick={()=>void action('approve')}
                    className="min-h-10 rounded-xl bg-[#1E60F3] px-4 text-[12px] font-bold text-white disabled:bg-[#E8EDF5] disabled:text-[#8996A9]">
                    <CheckCircle2 className="mr-1 inline size-4"/> 관리자 정산 승인
                  </button>
                </div>
              )}
              {doc?.status==='approved' && (
                <div className="space-y-2">
                  <p className="text-[12px] text-[#52647A]">서버 승인 완료 · {doc.approved_at || '승인 시각 확인 중'}</p>
                  <label className="flex items-center gap-2 text-[12px] text-[#52647A]">
                    <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}
                      className="accent-[#1E60F3]"/> 고객사 발행 내용을 확인했습니다.
                  </label>
                  <button type="button" disabled={!confirmed||busy} onClick={()=>void action('issue')}
                    className="min-h-10 rounded-xl bg-[#1E60F3] px-4 text-[12px] font-bold text-white disabled:bg-[#E8EDF5] disabled:text-[#8996A9]">
                    고객사 정산서 발행 확정
                  </button>
                </div>
              )}
              {doc?.status==='issued' && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[12px] text-[#52647A]">발행 확정 · {doc.issued_at}</span>
                  <button type="button" disabled={busy} onClick={()=>void download()}
                    className="flex min-h-10 items-center gap-2 rounded-xl bg-[#1E60F3] px-4 text-[12px] font-bold text-white disabled:opacity-40">
                    <FileText className="size-4"/> 서버 발행 정산서 Excel(CSV)
                  </button>
                </div>
              )}
              <p className="text-[11px] leading-5 text-[#9AA7B8]">
                서버 원장과 브라우저 임시 정산서는 별개입니다. 한 차량·예약당 한 문서이며, 기사 인건비와 내부 수익은 고객사 파일에 포함되지 않습니다.
                발행은 파일을 생성할 뿐 자동으로 고객에게 전송하지 않습니다.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}