'use client';

import {useCallback,useEffect,useState} from 'react';
import {Check,Copy,Plus,RefreshCw,ShieldCheck,ShieldOff} from 'lucide-react';
import {HqExcelSectionIcon} from './HqExcelSectionIcon';

type LinkStatus={
 ok:boolean;
 active:boolean;
 issuedAt:string|null;
 expiresAt:string|null;
 path?:string|null;
 needsRecovery?:boolean;
 error?:string;
};
type Notice={text:string;kind:'success'|'error'};

const subtleButton='inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#E0E7F2] bg-[#F7F9FC] px-5 py-3 text-[14px] font-semibold text-[#66748A] transition-colors hover:bg-[#EDF2F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7CBFC] disabled:cursor-not-allowed disabled:opacity-40';
const formatExpiry=(value:string)=>{
 const parts=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(value));
 const find=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 return find('year')+'. '+find('month')+'. '+find('day')+'.';
};

/**
 * HQ-only link control. The secret is never fetched or stored again after
 * issuance; keep the existing rotating/revoking API and one-time reveal.
 */
export function HqSharedReportLink(){
 const [state,setState]=useState<LinkStatus|null>(null);
 const [link,setLink]=useState('');
 const [recoveryInput,setRecoveryInput]=useState('');
 const [notice,setNotice]=useState<Notice|null>(null);
 const [busy,setBusy]=useState(false);
 const [refreshing,setRefreshing]=useState(false);

 const refresh=useCallback(async()=>{
  const res=await fetch('/api/hq/report-links',{cache:'no-store'});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'링크 상태를 확인하지 못했어요.');
  setState(data as LinkStatus);
  setLink(data.path?window.location.origin+data.path:'');
 },[]);

 useEffect(()=>{
  void refresh().catch(error=>setNotice({kind:'error',text:(error as Error).message}));
 },[refresh]);

 async function reload(){
  setRefreshing(true);
  try{await refresh();setNotice(null);}
  catch(error){setNotice({kind:'error',text:(error as Error).message});}
  finally{setRefreshing(false);}
 }

 async function act(action:'issue'|'revoke'|'remember'){
  if(action==='issue'&&state?.active&&!window.confirm('기존 링크가 즉시 무효화됩니다. 새 링크를 발급할까요?'))return;
  if(action==='revoke'&&!window.confirm('현재 공유된 운행보고 링크를 폐기할까요?'))return;
  if(action==='remember'&&!recoveryInput.trim())return;
  setBusy(true);
  setNotice(null);
  try{
   const res=await fetch('/api/hq/report-links',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,link:action==='remember'?recoveryInput.trim():undefined})
   });
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||'링크를 관리하지 못했어요.');
   await refresh();
   if(action==='remember')setRecoveryInput('');
   setNotice({
    kind:'success',
    text:action==='issue'
     ?'새 링크를 발급했어요. 언제든 다시 복사할 수 있어요.'
     :action==='remember'?'기존 링크를 다시 확인할 수 있게 보관했어요.':'링크를 폐기했어요.'
   });
  }catch(error){
   setNotice({kind:'error',text:(error as Error).message});
  }finally{
   setBusy(false);
  }
 }

 async function copy(){
  if(!link)return;
  try{
   await navigator.clipboard.writeText(link);
   setNotice({kind:'success',text:'링크를 복사했어요.'});
  }catch{
   setNotice({kind:'error',text:'자동 복사가 어려워요. 위 주소를 길게 눌러 복사해 주세요.'});
  }
 }

 const locked=busy||refreshing;
 return <section aria-label="공용 운행 링크" className="w-full min-w-0 space-y-6 rounded-[24px] border border-[#E4EAF3] bg-white p-5 shadow-[0_10px_36px_rgba(54,78,115,0.06)] sm:space-y-7 sm:p-8">
  <div className="flex min-w-0 items-start gap-4 sm:gap-5">
   <HqExcelSectionIcon src="/images/icons/excel/icon_link.png" label="공용 운행 링크"/>
   <div className="min-w-0 space-y-1">
    <h2 className="font-bold text-slate-800">공용 운행 링크</h2>
    <p className="mt-1 text-sm text-slate-500">링크로 운행보고를 간편하게 받아보세요.</p>
   </div>
  </div>

  <p className="text-[13px] leading-[1.85] text-[#66748C] sm:text-[14px]">
   기사 계정 없이 링크만 열면 보고를 제출할 수 있어요.
   외부에 공유됐다면 링크를 폐기한 뒤 다시 발급해 주세요.
  </p>

  <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
   <button type="button" disabled={locked} onClick={()=>void act('issue')}
    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#1E60F3] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_4px_12px_rgba(30,96,243,0.14)] transition-colors hover:bg-[#1A56DD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#95B5FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
    <Plus size={19} strokeWidth={2.1}/>새 링크 발급
   </button>
   <button type="button" disabled={locked||!state?.active} onClick={()=>void act('revoke')} className={subtleButton}>
    <ShieldOff size={18} strokeWidth={1.8}/>링크 폐기
   </button>
   <button type="button" disabled={locked} onClick={()=>void reload()} aria-label="링크 상태 새로고침" title="상태 새로고침"
    className="flex h-11 w-12 items-center justify-center rounded-2xl border border-[#E0E7F2] bg-[#F7F9FC] text-[#66748A] transition-colors hover:bg-[#EDF2F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7CBFC] disabled:opacity-40">
    <RefreshCw size={18} strokeWidth={1.8} className={refreshing?'animate-spin':''}/>
   </button>
  </div>

  <p className="text-[13px] leading-6 text-[#6C7890]" role="status">
   <span className="mr-3 font-medium text-[#718099]">상태</span>
   <span className="font-semibold text-[#465775]">{state?(state.active?'사용 가능':'미발급 또는 만료·폐기'):'확인 중'}</span>
   {state?.active&&state.expiresAt&&<span className="ml-2">· 만료 {formatExpiry(state.expiresAt)}</span>}
  </p>

  {link&&<div className="min-w-0 space-y-4 rounded-[20px] bg-[#F3F6FC] p-4 sm:p-6">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <h3 className="text-[16px] font-semibold tracking-[-0.025em] text-[#2B3953]">발급된 링크</h3>
     <p className="mt-1 text-[13px] text-[#7A879A]">필요할 때 언제든 다시 복사할 수 있어요.</p>
    </div>
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6EEFC] px-3 py-1.5 text-[12px] font-medium text-[#1E60F3]">
     <ShieldCheck size={15}/>보안 링크
    </span>
   </div>
   <label htmlFor="hq-shared-report-link" className="sr-only">발급된 운행보고 주소</label>
   <input id="hq-shared-report-link" aria-label="발급된 운행보고 주소" readOnly value={link}
    onFocus={event=>event.currentTarget.select()}
    className="block h-12 w-full min-w-0 rounded-[14px] border border-[#DEE6F1] bg-white px-4 text-[15px] text-[#45546C] outline-none focus:border-[#B6CAF2] focus:ring-2 focus:ring-[#D9E6FE]"/>
   <button type="button" onClick={()=>void copy()}
    className="inline-flex min-h-10 items-center gap-2 rounded-xl px-1 text-[14px] font-semibold text-[#1E60F3] transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7CBFC]">
    <Copy size={18}/>링크 복사
   </button>
  </div>}


  {state?.active&&state.needsRecovery&&!link&&<div className="min-w-0 space-y-3 rounded-[20px] bg-[#F3F6FC] p-4 sm:p-5">
   <p className="text-sm font-semibold text-[#465775]">기존 링크를 다시 표시할 수 있어요</p>
   <p className="text-[13px] leading-6 text-[#77869A]">이전에 발급한 주소는 원문을 저장하지 않았어요. 기존에 공유했던 링크를 아래에 붙여넣으면 다시 확인할 수 있어요. 원문을 찾을 수 없다면 새 링크를 발급해 주세요.</p>
   <form onSubmit={event=>{event.preventDefault();void act('remember');}} className="flex min-w-0 flex-col gap-2 sm:flex-row">
    <input aria-label="기존 운행보고 링크 붙여넣기" value={recoveryInput} onChange={event=>setRecoveryInput(event.target.value)}
     placeholder="기존 링크 주소를 붙여넣어 주세요" className="h-11 min-w-0 flex-1 rounded-xl border border-[#DFE7F1] bg-white px-3 text-[14px] text-[#465775] outline-none focus:border-[#1E60F3]"/>
    <button type="submit" disabled={locked||!recoveryInput.trim()} className={subtleButton}>기존 링크 보관</button>
   </form>
  </div>}

  {notice&&<div role="status" aria-live="polite"
   className="flex min-w-0 items-center gap-3 rounded-2xl bg-[#F1F5FC] px-4 py-3.5 text-[13px] leading-6 text-[#596981] sm:text-[14px]">
   <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E1EAFB] text-[#1E60F3]">
    {notice.kind==='success'?<Check size={16} strokeWidth={2.3}/>:<ShieldOff size={15} strokeWidth={1.9}/>}
   </span>
   <span className="min-w-0 flex-1">{notice.text}</span>
  </div>}
 </section>;
}
