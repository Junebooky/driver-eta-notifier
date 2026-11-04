'use client';
import {useEffect,useState} from 'react';
import {Copy,Link2,RefreshCw,ShieldOff} from 'lucide-react';

type LinkStatus={ok:boolean;active:boolean;issuedAt:string|null;expiresAt:string|null;error?:string};
export function HqSharedReportLink(){
 const [state,setState]=useState<LinkStatus|null>(null);
 const [link,setLink]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){
  const res=await fetch('/api/hq/report-links',{cache:'no-store'});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'공유 링크 상태를 확인하지 못했습니다.');
  setState(data);
 }
 useEffect(()=>{void Promise.resolve().then(refresh).catch(e=>setMessage((e as Error).message));},[]);
 async function act(action:'issue'|'revoke'){
  if(action==='issue'&&state?.active&&!confirm('기존 공용 링크가 즉시 무효화됩니다. 새 링크를 발급할까요?'))return;
  if(action==='revoke'&&!confirm('현재 공유된 운행보고 링크를 폐기할까요?'))return;
  setBusy(true);
  try{
   const res=await fetch('/api/hq/report-links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||'링크를 관리하지 못했습니다.');
   setLink(data.path?location.origin+data.path:'');
   await refresh();
   setMessage(action==='issue'?'새 공용 링크를 발급했습니다. 링크는 지금 한 번만 복사할 수 있습니다.':'기존 공유 링크를 폐기했습니다.');
  }catch(e){setMessage((e as Error).message);}
  finally{setBusy(false);}
 }
 return <section aria-label="공용 운행보고 링크" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
  <div className="flex items-center gap-3">
   <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#1E60F3]"><Link2 size={20}/></span>
   <div><h2 className="font-semibold text-slate-800">공용 운행보고 링크</h2>
    <p className="mt-1 text-xs text-slate-500">기사 계정 없이 링크만 열면 운행보고를 전송할 수 있습니다.</p>
   </div>
  </div>
  <p className="text-xs leading-5 text-slate-500">보고 제출만 허용됩니다. 다른 사람의 대화 조회, HQ 열람·수정은 불가능합니다. 링크가 외부에 공개되면 폐기 후 재발급하세요.</p>
  <div className="flex flex-wrap items-center gap-2">
   <button type="button" disabled={busy} onClick={()=>void act('issue')} className="rounded-xl bg-[#1E60F3] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">랜덤 링크 발급·재발급</button>
   <button type="button" disabled={busy||!state?.active} onClick={()=>void act('revoke')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 disabled:opacity-40"><ShieldOff size={15}/> 링크 폐기</button>
   <button type="button" disabled={busy} onClick={()=>void refresh().catch(e=>setMessage((e as Error).message))} className="rounded-xl border border-slate-200 p-2.5 text-slate-500" aria-label="링크 상태 새로고침"><RefreshCw size={16}/></button>
  </div>
  <p className="text-xs text-slate-500">상태: {state?.active?'사용 가능':state?'미발급 또는 만료·폐기':'확인 중'}
    {state?.active&&state.expiresAt?' · 만료 '+new Date(state.expiresAt).toLocaleDateString('ko-KR'):''}</p>
  {link&&<div className="space-y-2 rounded-xl bg-slate-50 p-3">
   <label htmlFor="shared-link" className="text-xs text-slate-500">새로 발급된 링크 (이 화면에서 한 번만 표시)</label>
   <input id="shared-link" readOnly value={link} className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700"/>
   <button type="button" onClick={()=>void navigator.clipboard.writeText(link).then(()=>setMessage('링크를 복사했습니다.')).catch(()=>setMessage('링크를 길게 눌러 복사해 주세요.'))} className="inline-flex items-center gap-2 text-sm text-[#1E60F3]"><Copy size={15}/> 링크 복사</button>
  </div>}
  {message&&<p role="status" className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{message}</p>}
 </section>;
}
