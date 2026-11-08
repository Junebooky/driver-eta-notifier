'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link2,RefreshCw} from 'lucide-react';
import {HqSearchSelect} from '@/components/hq/ui/HqSearchSelect';

type LogRecord = {
  id:string;driving_date:string;driver_id:string|null;driver_name:string|null;
  vehicle_plate:string|null;customer_name:string|null;status:string|null;
};
type BookingRecord = {
  id:string;date:string;end_date:string|null;driver_id:string|null;
  driver_name:string|null;vehicle_plate:string|null;customer_name:string|null;
  event_name:string|null;
};
type LinkRecords = {
  ok?:boolean;error?:string;logs?:LogRecord[];schedules?:BookingRecord[];
  expenseCounts?:Record<string,number>;
};
export function HqBookingLogLinkPanel({onLinked}:{onLinked:()=>Promise<void>}) {
  const [records,setRecords]=useState<LinkRecords>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [logId,setLogId]=useState('');
  const [scheduleId,setScheduleId]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch('/api/hq/booking-log-links',{cache:'no-store'});
      const data=await response.json().catch(()=>({})) as LinkRecords;
      if(!response.ok||!data.ok||!Array.isArray(data.logs)||!Array.isArray(data.schedules))
        throw new Error(data.error||'미연결 운행일지를 확인하지 못했습니다.');
      setRecords(data);
      setLogId(previous=>data.logs!.some(log=>log.id===previous)?previous:(data.logs![0]?.id||''));
      setError('');
    }catch(e){setRecords({});setError(e instanceof Error?e.message:'서버 조회 실패');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  const log=useMemo(()=>records.logs?.find(row=>row.id===logId),[records,logId]);
  const eligible=useMemo(()=>{
    if(!log)return [];
    return (records.schedules||[]).filter(row=>
      row.date<=log.driving_date && log.driving_date<=(row.end_date||row.date)
      && (!row.driver_id||!log.driver_id||row.driver_id===log.driver_id)
      && (!row.vehicle_plate||!log.vehicle_plate||
        row.vehicle_plate.replace(/[\s-]/g,'')===log.vehicle_plate.replace(/[\s-]/g,'')));
  },[records.schedules,log]);
  const booking=eligible.find(row=>row.id===scheduleId);
  useEffect(()=>{setScheduleId('');setConfirmed(false);},[logId]);
  const connect=async()=>{
    if(!log||!booking||!confirmed||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/hq/booking-log-links',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({logId:log.id,scheduleId:booking.id,confirmed:true}),
      });
      const data=await response.json().catch(()=>({})) as {ok?:boolean;error?:string;result?:{expenseCount?:number}};
      if(!response.ok||!data.ok)throw new Error(data.error||'연결 저장 실패');
      setNotice('예약·운행일지 연결 완료 · 연결된 경비 '+(data.result?.expenseCount||0)+'건');
      setConfirmed(false);setScheduleId('');
      await refresh();await onLinked();
    }catch(e){setError(e instanceof Error?e.message:'연결 저장 실패');}
    finally{setBusy(false);}
  };
  return (
    <div className="rounded-2xl bg-[#F8FAFD] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white">
            <Link2 className="size-4 text-[#1E60F3]"/>
          </span>
          <div>
            <p className="text-[13px] font-bold text-[#17233B]">예약 · 운행일지 연결 검토</p>
            <p className="text-[11px] leading-5 text-[#8290A4]">
              미연결 운행일지 {records.logs?.length??'—'}건 · 자동 연결하지 않음
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="연결 목록 새로고침" onClick={()=>void refresh()}
            disabled={loading||busy} className="rounded-xl p-2 text-[#78879B] hover:bg-white disabled:opacity-40">
            <RefreshCw className="size-4"/>
          </button>
          <button type="button" onClick={()=>setExpanded(previous=>!previous)}
            className="rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-[#53647B]"
            aria-expanded={expanded}>{expanded?'닫기':'검토하기'}</button>
        </div>
      </div>
      {notice && <p role="status" className="mt-2 text-[12px] text-[#52647A]">{notice}</p>}
      {error && <p role="alert" className="mt-2 text-[12px] text-[#A25F58]">{error}</p>}
      {expanded && <div className="mt-4 space-y-3">
        <p className="text-[11px] leading-5 text-[#78879B]">
          고객사명이 같아도 자동으로 묶지 않습니다. 날짜·차량·기사 정보를 직접 대조한 뒤 저장합니다.
          승인된 정산서나 이미 연결된 예약은 선택할 수 없습니다.
        </p>
        {loading ? <p className="text-[12px] text-[#78879B]">서버 기록 확인 중…</p>:
          !records.logs?.length ? <p className="text-[12px] text-[#78879B]">미연결 운행일지가 없습니다.</p>:
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-[#75849A]">미연결 운행일지</p>
                <HqSearchSelect label="운행일지 선택" size="sm" value={logId} onChange={setLogId} placeholder="운행일지 선택"
                  options={records.logs.map(row=>({
                    value:row.id,
                    label:[row.driving_date,row.driver_name||'기사 미등록',row.vehicle_plate||'차량 미등록'].join(' · '),
                    subtitle:row.status||'검토 상태 미확인',
                  }))}/>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-[#75849A]">연결할 실제 예약</p>
                <HqSearchSelect label="예약 선택" size="sm" value={scheduleId}
                  onChange={value=>{setScheduleId(value);setConfirmed(false);}}
                  placeholder={eligible.length?'예약 선택':'일치하는 날짜의 예약 없음'}
                  options={eligible.map(row=>({
                    value:row.id,
                    label:[row.date,row.customer_name||'고객사 미등록',row.vehicle_plate||'차량 미배정'].join(' · '),
                    subtitle:row.driver_name||'기사 미배정',
                  }))}/>
              </div>
            </div>
            {log && <div className="rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-[#66768D]">
              운행일지: {log.customer_name||'고객사 미등록'} · 상태 {log.status||'미확인'}
              {' · '}연결된 경비 {records.expenseCounts?.[log.id]||0}건
              {booking && <div className="mt-1 text-[#253552]">
                선택한 예약: {booking.event_name||booking.customer_name||'행사명 없음'}
                {' · '}{booking.driver_name||'기사 미배정'}
              </div>}
            </div>}
            <label className="flex items-start gap-2 text-[11px] leading-5 text-[#53647B]">
              <input type="checkbox" className="mt-1 accent-[#1E60F3]"
                checked={confirmed} disabled={!booking||busy}
                onChange={event=>setConfirmed(event.target.checked)}/>
              예약 원본과 운행일지의 날짜·기사·차량을 확인했습니다. 잘못 연결하면 정산 근거가 달라집니다.
            </label>
            <button type="button" disabled={!confirmed||!booking||busy}
              onClick={()=>void connect()}
              className="min-h-10 rounded-xl bg-[#1E60F3] px-4 text-[12px] font-bold text-white disabled:bg-[#E8EDF5] disabled:text-[#8996A9]">
              {busy?'연결 검증 중…':'확인 후 서버에 연결'}
            </button>
          </>
        }
      </div>}
    </div>
  );
}
