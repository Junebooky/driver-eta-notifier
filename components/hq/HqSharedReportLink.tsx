'use client';

import {useCallback,useEffect,useState} from 'react';
import {Check,Copy,Plus,ShieldCheck,AlertCircle,ChevronDown,ChevronUp} from 'lucide-react';

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
 const [expanded,setExpanded]=useState(false);

 const refresh=useCallback(async()=>{
  const res=await fetch('/api/hq/report-links',{cache:'no-store'});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'링크 상태를 확인하지 못했어요.');
  setState(data as LinkStatus);
  setExpanded(previous=>!data.active||previous);
  setLink(data.path?window.location.origin+data.path:'');
 },[]);

 useEffect(()=>{
  void refresh().catch(error=>setNotice({kind:'error',text:(error as Error).message}));
 },[refresh]);

 async function act(action:'issue'|'remember'){
  if(action==='issue'&&state?.active&&!window.confirm('기존 링크가 즉시 무효화됩니다. 새 링크를 발급할까요?'))return;
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
   setExpanded(true); // Keep a newly issued link visible for copying.
   if(action==='remember')setRecoveryInput('');
   setNotice({
    kind:'success',
    text:action==='issue'
     ?'새 링크를 발급했어요. 언제든 다시 복사할 수 있어요.'
     :'기존 링크를 다시 확인할 수 있게 보관했어요.'
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

 const locked=busy;
 return <section aria-label="공용 운행 링크 관리" className="w-full min-w-0">
  <div className="flex flex-wrap items-center justify-between gap-2.5">
   <button type="button" aria-expanded={expanded} aria-controls="hq-shared-link-details" onClick={()=>setExpanded(value=>!value)}
    className="group inline-flex h-9 items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3.5 text-[13px] font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30">
    <span className="text-[13px]">🔗</span>
    <span>공용 운행 링크 관리</span>
    {state?.active ? (
     <span className="inline-flex items-center gap-1 pl-1 text-[11px] font-medium text-emerald-600">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"/>
      사용 가능
     </span>
    ) : (
     <span className="inline-flex items-center gap-1 pl-1 text-[11px] font-medium text-slate-400">
      미발급
     </span>
    )}
    <span className="text-slate-400 transition-transform duration-150 group-hover:text-slate-600">
     {expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
    </span>
   </button>

   {link&&!expanded&&(
    <button type="button" onClick={()=>void copy()}
     className="inline-flex h-9 items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50/70 px-3.5 text-[12px] font-semibold text-[#1E60F3] shadow-2xs transition-all hover:bg-blue-100/70 active:scale-95">
     <Copy size={13}/>
     <span>링크 복사</span>
    </button>
   )}
  </div>

  {expanded&&<div id="hq-shared-link-details" className="mt-3 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
    <div>
     <h3 className="text-[15px] font-bold text-slate-800">공용 운행 링크</h3>
     <p className="mt-0.5 text-xs text-slate-500">기사 계정 없이 링크만 열면 보고를 제출할 수 있어요.</p>
    </div>
    <div className="flex items-center gap-2">
     <button type="button" disabled={locked} onClick={()=>void act('issue')}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1E60F3] px-3.5 text-[13px] font-semibold text-white shadow-xs transition-colors hover:bg-[#1A56DD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#95B5FF] disabled:opacity-50">
      <Plus size={15}/>새 링크 발급
     </button>
    </div>
   </div>

   <p className="text-xs text-slate-500" role="status">
    <span className="mr-2 font-medium text-slate-400">상태</span>
    <span className="font-semibold text-slate-700">{state?(state.active?'사용 가능':'미발급 또는 만료'):'확인 중'}</span>
    {state?.active&&state.expiresAt&&<span className="ml-2">· 만료 {formatExpiry(state.expiresAt)}</span>}
   </p>

   {link&&<div className="space-y-3 rounded-xl bg-slate-50 p-3.5">
    <div className="flex items-center justify-between gap-2">
     <span className="text-xs font-semibold text-slate-700">발급된 링크</span>
     <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-[#1E60F3]">
      <ShieldCheck size={13}/>보안 링크
     </span>
    </div>
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
     <input id="hq-shared-report-link" aria-label="발급된 운행보고 주소" readOnly value={link}
      onFocus={event=>event.currentTarget.select()}
      className="h-10 flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#1E60F3]"/>
     <button type="button" onClick={()=>void copy()}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3.5 text-xs font-semibold text-[#1E60F3] shadow-2xs hover:bg-slate-50">
      <Copy size={14}/>링크 복사
     </button>
    </div>
   </div>}

   {state?.active&&state.needsRecovery&&!link&&<div className="space-y-2 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
    <p className="font-semibold text-slate-700">기존 링크 복원</p>
    <p className="text-[12px] text-slate-500 leading-relaxed">이전에 발급한 링크를 아래에 붙여넣으면 다시 확인할 수 있어요.</p>
    <form onSubmit={event=>{event.preventDefault();void act('remember');}} className="flex gap-2">
     <input aria-label="기존 운행보고 링크 붙여넣기" value={recoveryInput} onChange={event=>setRecoveryInput(event.target.value)}
      placeholder="기존 링크 주소를 붙여넣어 주세요" className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#1E60F3]"/>
     <button type="submit" disabled={locked||!recoveryInput.trim()} className={subtleButton+' min-h-9 px-3 py-1.5 text-xs'}>보관</button>
    </form>
   </div>}
  </div>}

  {notice&&<div role="status" aria-live="polite"
   className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-blue-50 px-3.5 py-2.5 text-xs text-slate-700">
   <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#1E60F3]">
    {notice.kind==='success'?<Check size={12} strokeWidth={2.5}/>:<AlertCircle size={12} strokeWidth={2}/>}
   </span>
   <span className="flex-1">{notice.text}</span>
  </div>}
 </section>;
}
