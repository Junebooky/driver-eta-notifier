'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Plus,RefreshCw} from 'lucide-react';
import {VipChatAvatar} from '@/components/driver-reports/VipChatAvatar';
import {ChatTypingBubble} from '@/components/driver-reports/ChatTypingBubble';
import {waitForChatTyping} from '@/utils/reportChatTyping';
import {useChatViewport} from '@/components/driver-reports/useChatViewport';
import {buildDriverReportTemplate} from '@/utils/reportChatTemplate';
import {ReportServicePicker} from '@/components/driver-reports/ReportServicePicker';
import type {ReportServiceType} from '@/utils/reportServiceTypes';

const STORE_KEY='vip_shared_report_link_v1';
const COMPLETED_KEY='vip_shared_report_last_completed_v1';
const valid=(s:string)=>/^[A-Za-z0-9_-]{43}$/.test(s);
type LocalMessage={id:string;body:string;at:string;reply:string};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const showTime=(date:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(new Date(date));
const showDay=(date:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(date+'T12:00:00+09:00'));

export function SharedReportPage(){
 const [token,setToken]=useState(''),[ready,setReady]=useState(false);
 const [draft,setDraft]=useState(''),[items,setItems]=useState<LocalMessage[]>([]);
 const [pendingVisual,setPendingVisual]=useState<{id:string;body:string;at:string}|null>(null);
 const [serviceType,setServiceType]=useState<ReportServiceType|null>(null);
 const [reportActive,setReportActive]=useState(true);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[templates,setTemplates]=useState(false);
 const pending=useRef<{id:string;body:string;serviceType:ReportServiceType}|null>(null);
 const frame=useRef<HTMLElement>(null),scroller=useRef<HTMLElement>(null);
 useChatViewport(frame);
 const input=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{
  const incoming=new URLSearchParams(location.hash.slice(1)).get('key')||'';
  let stored='';
  try{
   if(valid(incoming))sessionStorage.setItem(STORE_KEY,incoming);
   stored=sessionStorage.getItem(STORE_KEY)||'';
  }catch{stored=incoming;}
  if(incoming)history.replaceState(history.state,'',location.pathname);
  queueMicrotask(()=>{
   setToken(valid(stored)?stored:'');
   try{if(valid(stored)&&sessionStorage.getItem(COMPLETED_KEY)===stored)setReportActive(false);}catch{/* Private browsing may block storage. */}
   setReady(true);
  });
 },[]);
 useEffect(()=>{const view=scroller.current;if(view)view.scrollTop=view.scrollHeight;},[items,pendingVisual,error,serviceType]);
 useEffect(()=>{if(input.current){input.current.style.height='auto';input.current.style.height=Math.min(176,input.current.scrollHeight)+'px';}},[draft]);
 function template(){
  const reportDate=today();
  if(draft.trim()&&!confirm('작성 중인 내용을 보고 양식으로 바꿀까요?'))return;
  pending.current=null;
  setDraft(buildDriverReportTemplate(reportDate));
  setTemplates(false);input.current?.focus();
 }
 async function send(){
  if(busy||!token||!draft.trim())return;
  if(!serviceType){setError('먼저 운행 유형을 선택해 주세요.');return;}
  const item=pending.current||{id:crypto.randomUUID(),body:draft.trim(),serviceType};
  pending.current=item;
  setBusy(true);setError('');
  const typingStarted=Date.now();
  setPendingVisual({id:item.id,body:item.body,at:new Date().toISOString()});
  try{
   const response=await fetch('/api/public-report',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token,message:item.body,requestKey:item.id,serviceType:item.serviceType})
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'보고를 전송하지 못했습니다.');
   await waitForChatTyping(typingStarted);
   setItems(prev=>[...prev,{id:item.id,body:item.body,at:new Date().toISOString(),reply:data.reply||'운행보고 잘 받았습니다. 감사합니다 ^.^'}]);
   setDraft('');pending.current=null;
   if(data.accepted){
    setServiceType(null);
    setReportActive(false);
    setTemplates(false);
    try{sessionStorage.setItem(COMPLETED_KEY,token);}catch{/* Optional session state. */}
   }
  }catch(e){setError(e instanceof Error?e.message:'연결을 확인하고 다시 보내 주세요.');}
  finally{setPendingVisual(null);setBusy(false);input.current?.focus();}
 }
 function startNextReport(){
  setReportActive(true);setServiceType(null);setTemplates(false);setError('');
  try{sessionStorage.removeItem(COMPLETED_KEY);}catch{/* Optional session state. */}
 }
 function goBack(){if(draft.trim()&&!confirm('작성 중인 보고를 두고 나가시겠어요?'))return;window.history.back();}
 return <main ref={frame} className="fixed inset-x-0 top-0 z-40 mx-auto flex h-dvh min-h-0 min-w-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-hidden bg-[#B2C7D9] text-[#30353A] sm:max-w-2xl">
  <header className="z-10 flex shrink-0 items-center gap-2 bg-[#B2C7D9] px-2 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
   <button type="button" aria-label="뒤로 가기" onClick={goBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/15"><ArrowLeft size={24} strokeWidth={1.9}/></button>
   <h1 className="min-w-0 flex-1 truncate text-[18px] font-semibold tracking-[-0.025em]">VIP리무진코리아</h1>
  </header>
  <section ref={scroller} aria-label="VIP리무진코리아와 대화" className="min-h-0 min-w-0 flex-1 select-text space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-5 pt-3 sm:px-5">
   <div className="text-center"><span className="rounded-full bg-[#94AABD]/70 px-4 py-1 text-[11px] font-medium text-white">{showDay(today())}</span></div>
   <div className="flex items-start gap-2.5">
    <VipChatAvatar/>
    <div className="flex max-w-[88%] min-w-0 flex-col items-start">
     <span className="mb-1 ml-0.5 text-[12px] font-medium text-[#3E4B57]">VIP리무진코리아</span>
     <div className="rounded-[10px] rounded-tl-[3px] bg-white px-3 py-2.5 text-[14px] leading-[1.55]">안녕하세요. 운행보고를 이 대화방으로 보내 주세요.</div>
    </div>
   </div>
   {ready&&!token&&<p role="alert" className="rounded-lg bg-white/85 px-3 py-3 text-sm text-[#53616C]">회사에서 발급한 운행보고 링크로 접속해 주세요.</p>}
   {items.map(item=><div key={item.id} className="space-y-3">
    <div className="flex justify-end">
     <div className="flex max-w-[88%] min-w-0 flex-row-reverse items-end gap-1.5">
      <div className="min-w-0 whitespace-pre-wrap break-words rounded-[10px] rounded-tr-[3px] bg-[#FEE500] px-3 py-2.5 text-[14px] leading-[1.55]">{item.body}</div>
      <time dateTime={item.at} className="mb-0.5 shrink-0 text-[10px] text-[#566B7C]">{showTime(item.at)}</time>
     </div>
    </div>
    <div className="flex items-start gap-2.5">
     <VipChatAvatar/>
     <div className="flex max-w-[88%] min-w-0 flex-col items-start">
      <span className="mb-1 ml-0.5 text-[12px] font-medium text-[#3E4B57]">VIP리무진코리아</span>
      <div className="flex min-w-0 items-end gap-1.5">
       <div className="whitespace-pre-wrap break-words rounded-[10px] rounded-tl-[3px] bg-white px-3 py-2.5 text-[14px] leading-[1.55]">{item.reply}</div>
       <time dateTime={item.at} className="mb-0.5 shrink-0 text-[10px] text-[#566B7C]">{showTime(item.at)}</time>
      </div>
     </div>
    </div>
   </div>)}
   {pendingVisual&&<div className="space-y-3">
    <div className="flex justify-end">
     <div className="flex max-w-[88%] min-w-0 flex-row-reverse items-end gap-1.5">
      <div className="min-w-0 whitespace-pre-wrap break-words rounded-[10px] rounded-tr-[3px] bg-[#FEE500] px-3 py-2.5 text-[14px] leading-[1.55]">{pendingVisual.body}</div>
      <time dateTime={pendingVisual.at} className="mb-0.5 shrink-0 text-[10px] text-[#566B7C]">{showTime(pendingVisual.at)}</time>
     </div>
    </div>
    <ChatTypingBubble/>
   </div>}
   {ready&&token&&reportActive&&<ReportServicePicker value={serviceType} onChange={v=>{setServiceType(v);pending.current=null;setError('');}}/>}
  </section>
  {error&&<div role="status" className="flex items-center gap-2 bg-white/90 px-4 py-2.5 text-xs leading-5 text-[#59646D]"><span className="flex-1">{error}</span><button type="button" aria-label="오류 안내 닫기" onClick={()=>setError('')}><RefreshCw size={15}/></button></div>}
  <footer className="shrink-0 bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
   {reportActive&&templates&&<div className="mb-2 rounded-lg bg-[#F4F5F6] p-2"><button type="button" onClick={template} className="w-full rounded-md px-3 py-2 text-left text-sm text-[#49525C]">운행보고 양식 불러오기</button></div>}
   <div className="flex items-end gap-2.5">
    <button type="button" aria-label={reportActive?"보고 양식":"새 운행보고 시작"} aria-expanded={reportActive&&templates} onClick={()=>reportActive?setTemplates(v=>!v):startNextReport()} className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center text-[#6B747B] hover:bg-[#F3F4F5]"><Plus size={29} strokeWidth={1.7}/></button>
    <textarea ref={input} aria-label="메시지 입력" value={draft} disabled={!token||busy||!reportActive||!serviceType}
     onChange={e=>{setDraft(e.target.value);pending.current=null;}}
     onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send();}}}
     rows={1} maxLength={20000} placeholder={reportActive?"메시지 입력":"다음 보고는 + 버튼을 눌러주세요"}
     className="max-h-44 min-h-11 min-w-0 flex-1 resize-none rounded-[10px] border border-[#E2E4E6] bg-white px-3 py-2.5 text-[16px] leading-[1.5] outline-none placeholder:text-[#A4ABB1] placeholder:text-[12px] placeholder:whitespace-nowrap sm:placeholder:text-[14px] focus:border-[#B9C1C7] disabled:bg-[#F7F8F9]"/>
    <button type="button" aria-label="메시지 보내기" disabled={!token||!reportActive||!serviceType||!draft.trim()||busy} onClick={()=>void send()} className="mb-0.5 flex h-9 shrink-0 items-center justify-center rounded-[7px] bg-[#FEE500] px-3.5 text-[13px] font-semibold text-[#3B3C35] disabled:bg-[#F2F2F2] disabled:text-[#B4B9BC]">전송</button>
   </div>
  </footer>
 </main>;
}
