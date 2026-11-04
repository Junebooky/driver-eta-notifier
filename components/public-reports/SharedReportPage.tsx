'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUp,ClipboardList,Plus,ShieldCheck} from 'lucide-react';

const STORE_KEY='vip_shared_report_link_v1';
const valid=(s:string)=>/^[A-Za-z0-9_-]{43}$/.test(s);
type LocalMessage={id:string;body:string;at:string};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function SharedReportPage(){
 const [token,setToken]=useState(''),[ready,setReady]=useState(false);
 const [draft,setDraft]=useState(''),[items,setItems]=useState<LocalMessage[]>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[templates,setTemplates]=useState(false);
 const pending=useRef<{id:string;body:string}|null>(null);
 const end=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const incoming=new URLSearchParams(location.hash.slice(1)).get('key')||'';
  let stored='';
  try{
   if(valid(incoming))sessionStorage.setItem(STORE_KEY,incoming);
   stored=sessionStorage.getItem(STORE_KEY)||'';
  }catch{stored=incoming;}
  if(incoming)history.replaceState(history.state,'',location.pathname);
  queueMicrotask(()=>{setToken(valid(stored)?stored:'');setReady(true);});
 },[]);
 useEffect(()=>{end.current?.scrollIntoView({block:'end'});},[items,error]);
 function template(){
  const [y,m,d]=today().split('-');
  if(draft.trim()&&!confirm('작성 중인 내용을 보고 양식으로 바꿀까요?'))return;
  pending.current=null;
  setDraft(y+'년 '+Number(m)+'월 '+Number(d)+'일\n수행담당 : \n차량번호 : \n고객명 : \n시작 시간 : \n종료 시간 : \n운행일지\n');
  setTemplates(false);
 }
 async function send(){
  if(busy||!token||!draft.trim())return;
  const item=pending.current||{id:crypto.randomUUID(),body:draft.trim()};
  pending.current=item;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/public-report',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token,message:item.body,requestKey:item.id})
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'보고를 전송하지 못했습니다.');
   setItems(prev=>[...prev,{id:item.id,body:item.body,at:new Date().toISOString()}]);
   setDraft('');pending.current=null;
   setError(data.duplicate?'이미 접수된 동일 보고입니다.':'보고가 접수됐습니다. Excel 반영 상태는 회사에서 확인합니다.');
  }catch(e){setError(e instanceof Error?e.message:'연결을 확인하고 다시 보내 주세요.');}
  finally{setBusy(false);}
 }
 return <main className="mx-auto flex h-dvh min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-[#F3F5F8] text-slate-700">
  <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-4">
   <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EEF3FF] text-[#1E60F3]"><ClipboardList size={22}/></span>
   <div className="flex-1"><h1 className="text-base font-semibold">VIP리무진코리아</h1><p className="text-xs text-slate-500">운행보고 접수</p></div>
   <ShieldCheck size={20} className="text-slate-400"/>
  </header>
  <section className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-6">
   <div className="mx-auto max-w-sm rounded-2xl bg-white px-4 py-3 text-center text-sm leading-6 text-slate-600">
    로그인 없이 운행보고를 보낼 수 있습니다. 다른 사람의 보고 내용은 표시되지 않습니다.
   </div>
   {ready&&!token&&<div role="alert" className="rounded-2xl bg-white p-4 text-sm">올바른 회사 보고 링크를 열어 주세요. 링크를 받지 못했다면 HQ에 요청해 주세요.</div>}
   {items.map(item=><div key={item.id} className="flex flex-col items-end gap-2">
    <div className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[#E5EDFF] px-4 py-3 text-sm leading-6">{item.body}</div>
    <span className="text-xs text-slate-400">{new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(new Date(item.at))}</span>
    <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm">접수되었습니다. 회사에서 Excel 반영을 확인합니다.</div>
   </div>)}
   <div ref={end}/>
  </section>
  {error&&<p role="status" className="border-t border-slate-100 bg-white px-5 py-3 text-xs leading-5 text-slate-600">{error}</p>}
  <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
   {templates&&<button type="button" onClick={template} className="mb-3 w-full rounded-xl bg-slate-50 p-3 text-left text-sm">운행보고 양식 불러오기</button>}
   <div className="flex items-end gap-2">
    <button type="button" aria-label="보고 양식" onClick={()=>setTemplates(v=>!v)} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500"><Plus size={22}/></button>
    <textarea aria-label="메시지 입력" value={draft} disabled={!token||busy}
     onChange={e=>{setDraft(e.target.value);pending.current=null;}}
     onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send();}}}
     rows={2} maxLength={20000} placeholder="운행보고를 붙여넣거나 입력하세요"
     className="max-h-44 min-h-14 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#1E60F3]" />
    <button type="button" aria-label="메시지 보내기" disabled={!token||!draft.trim()||busy} onClick={()=>void send()} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E60F3] text-white disabled:bg-slate-200"><ArrowUp size={21}/></button>
   </div>
   <p className="mt-2 text-center text-[11px] text-slate-400">보고 제출만 가능 · 다른 사람의 대화 및 관리자 정보는 볼 수 없습니다</p>
  </footer>
 </main>;
}
