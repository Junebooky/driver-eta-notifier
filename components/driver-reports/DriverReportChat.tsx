'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {readChatDraft,saveChatDraft,clearChatDrafts} from '@/utils/reportChatDraft';
import {ArrowLeft,Plus,RefreshCw,ChevronUp} from 'lucide-react';
import {VipChatAvatar} from './VipChatAvatar';
import {ChatTypingBubble} from './ChatTypingBubble';
import {waitForChatTyping} from '@/utils/reportChatTyping';
import {useChatViewport} from './useChatViewport';
import {buildDriverReportTemplate} from '@/utils/reportChatTemplate';
import {ReportServicePicker} from './ReportServicePicker';
import type {ReportServiceType} from '@/utils/reportServiceTypes';
import type {ReportChatMessage} from '@/types/driverReportChat';
import {koreaDate} from '@/utils/driverReportChat';

type Outgoing={id:string;body:string;created_at:string;failed:boolean;serviceType?:ReportServiceType};
const time=(date:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(new Date(date));
const dayLabel=(date:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(date+'T12:00:00+09:00'));
export function DriverReportChat({driverId,driverName='기사님'}:{driverId:string;driverName?:string}) {
 const [messages,setMessages]=useState<ReportChatMessage[]>([]),[outgoing,setOutgoing]=useState<Outgoing[]>([]);
 const [localGuidance,setLocalGuidance]=useState<Array<{id:string;body:string;reply:string;created_at:string}>>([]);
 const [text,setText]=useState(''),[error,setError]=useState(''),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true);
 const [draftLoaded,setDraftLoaded]=useState(false);
 const [serviceType,setServiceType]=useState<ReportServiceType|null>(null);
 const [reportActive,setReportActive]=useState(true);
 const frame=useRef<HTMLDivElement>(null);
 useChatViewport(frame);
 const [today,setToday]=useState(koreaDate()),[templates,setTemplates]=useState(false),[sending,setSending]=useState(false),[typing,setTyping]=useState(false);
 const scroller=useRef<HTMLElement>(null),input=useRef<HTMLTextAreaElement>(null),active=useRef(true),inflight=useRef(false),stick=useRef(true),fetched=useRef(false);
 const load=useCallback(async(before?:number)=>{
  const res=await fetch('/api/driver-reports?driverId='+encodeURIComponent(driverId)+(before?'&before='+before:''),{cache:'no-store'});
  const data=await res.json();
  if(res.status===401||res.status===403){setMessages([]);setOutgoing([]);clearChatDrafts(localStorage);window.location.replace('/driver/reports');return;}
  if(!res.ok)throw new Error(data.error||'대화를 불러오지 못했어요.');
  if(!active.current)return;
  setMessages(previous=>{
   const joined=new Map(previous.map(m=>[m.id,m]));for(const m of data.messages as ReportChatMessage[])joined.set(m.id,m);
   return [...joined.values()].sort((a,b)=>a.seq-b.seq);
  });
  if(before||!fetched.current)setHasMore(data.hasMore);fetched.current=true;
  setError('');
 },[driverId]);
 useEffect(()=>{
  active.current=true;
  void Promise.resolve().then(()=>load()).catch(e=>active.current&&setError(e.message)).finally(()=>active.current&&setLoading(false));
  const poll=window.setInterval(()=>{setToday(koreaDate());if(document.visibilityState==='visible'&&!inflight.current)void load().catch(()=>{});},12000);
  return()=>{active.current=false;window.clearInterval(poll);};
 },[load]);
 useEffect(()=>{
  let alive=true;queueMicrotask(()=>{
   if(!alive)return;
   try{
    const d=readChatDraft(localStorage,driverId);
    if(d){setText(d.text);setOutgoing(d.outgoing);setServiceType(d.serviceType);}
    // A finished report stays finished even after returning to the chat.
    if(!d?.text&&!d?.outgoing?.length&&!d?.serviceType&&sessionStorage.getItem('vip_driver_report_completed_v1:'+driverId)==='1')setReportActive(false);
   }catch{setError('이 기기에 임시 저장할 수 없어요.');}
   setDraftLoaded(true);
  });
  const clear=()=>{setText('');setOutgoing([]);setServiceType(null);setReportActive(true);clearChatDrafts(localStorage);try{sessionStorage.removeItem('vip_driver_report_completed_v1:'+driverId);}catch{}};
  window.addEventListener('report-draft-clear',clear);return()=>{alive=false;window.removeEventListener('report-draft-clear',clear);};
 },[driverId]);
 useEffect(()=>{if(draftLoaded)try{saveChatDraft(localStorage,driverId,text,outgoing,serviceType);}catch{queueMicrotask(()=>setError('임시 저장 공간이 부족해요. 작성 내용을 복사해 보관해 주세요.'));}},[draftLoaded,driverId,text,outgoing,serviceType]);
 useEffect(()=>{if(input.current){input.current.style.height='auto';input.current.style.height=Math.min(176,input.current.scrollHeight)+'px';}},[text]);
 useEffect(()=>{const view=scroller.current;if(view&&stick.current)view.scrollTop=view.scrollHeight;},[messages,outgoing,localGuidance,serviceType,typing]);
 useEffect(()=>{
  const guard=(e:BeforeUnloadEvent)=>{if(text||outgoing.length){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);
 },[text,outgoing]);
 async function send(retry?:Outgoing) {
  if(inflight.current||(!retry&&!text.trim()))return;
  if(!retry&&!serviceType){setError('먼저 운행 유형을 선택해 주세요.');return;}
  if(retry&&!retry.serviceType&&!serviceType){setError('운행 유형을 선택한 뒤 다시 보내주세요.');return;}
  if(!retry&&outgoing.length>=10){setError('미전송 보고가 10건 있어요. 먼저 다시 보내기를 눌러 주세요.');return;}
  inflight.current=true;setSending(true);setTyping(true);stick.current=true;
  const typingStarted=Date.now();
  const item=retry||{id:crypto.randomUUID(),body:text.trim(),created_at:new Date().toISOString(),failed:false,serviceType:serviceType??undefined};
  setOutgoing(p=>[...p.filter(v=>v.id!==item.id),{...item,failed:false}]);if(!retry)setText('');
  try{
   const response=await fetch('/api/driver-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:item.body,requestKey:item.id,driverId,serviceType:item.serviceType??serviceType})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'전송하지 못했어요.');
   // Never delay storage or the network; only delay displaying the bot response.
   await waitForChatTyping(typingStarted);
   if(data.accepted===false&&data.needsTemplate){
    setOutgoing(p=>p.filter(v=>v.id!==item.id));
    setLocalGuidance(p=>[...p,{id:item.id,body:item.body,reply:data.reply||'아래 + 버튼에서 보고 양식을 불러와 작성해 주세요.',created_at:item.created_at}]);
    return;
   }
   if(data.accepted===false&&data.needsServiceType){
    setOutgoing(p=>p.filter(v=>v.id!==item.id));
    setLocalGuidance(p=>[...p,{id:item.id,body:item.body,reply:data.reply,created_at:item.created_at}]);
    return;
   }
   await load();setOutgoing(p=>p.filter(v=>v.id!==item.id));
   if(data.accepted){
    setServiceType(null);setReportActive(false);setTemplates(false);
    try{sessionStorage.setItem('vip_driver_report_completed_v1:'+driverId,'1');}catch{/* Optional session state. */}
   }
   if(data.duplicate)setError('이미 접수된 보고예요. 기존 대화와 반영 상태를 확인해 주세요.');
  }catch(e){setOutgoing(p=>p.map(v=>v.id===item.id?{...v,failed:true}:v));setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}
  finally{inflight.current=false;setSending(false);setTyping(false);input.current?.focus();}
 }
 function startNextReport(){
  setReportActive(true);setServiceType(null);setTemplates(false);setError('');
  try{sessionStorage.removeItem('vip_driver_report_completed_v1:'+driverId);}catch{/* Optional session state. */}
 }
 function template(){
  if(text.trim()&&!window.confirm('작성 중인 내용 대신 보고 양식을 불러올까요?'))return;
  const reportDate=today;
  setText(buildDriverReportTemplate(reportDate));setTemplates(false);input.current?.focus();
 }
 const bubble=(m:{id:string;body:string;created_at:string},mine:boolean,status?:Outgoing)=> <div key={m.id} className={'flex items-start gap-2.5 px-3 sm:px-5 '+(mine?'justify-end':'justify-start')}>
  {!mine&&<VipChatAvatar/>}
  <div className={'flex min-w-0 max-w-[88%] flex-col '+(mine?'items-end':'items-start')}>
   {!mine&&<span className="mb-1 ml-0.5 text-[12px] font-medium text-[#3E4B57]">VIP리무진코리아</span>}
   <div className={'flex min-w-0 max-w-full items-end gap-1.5 '+(mine?'flex-row-reverse':'')}>
    <div className={'min-w-0 whitespace-pre-wrap break-words rounded-[10px] px-3 py-2.5 text-[14px] leading-[1.55] '+(mine?'rounded-tr-[3px] bg-[#FEE500] text-[#30353A]':'rounded-tl-[3px] bg-white text-[#30353A]')}>{m.body}</div>
    <div className={'mb-0.5 flex shrink-0 flex-col gap-0.5 text-[10px] leading-tight text-[#566B7C] '+(mine?'items-end':'items-start')}>
     {status&&(status.failed?<button onClick={()=>void send(status)} disabled={sending} className="flex items-center gap-1 underline underline-offset-2"><RefreshCw size={10}/>재전송</button>:<span>전송 중</span>)}
     <time dateTime={m.created_at}>{time(m.created_at)}</time>
    </div>
   </div>
  </div>
 </div>;
 return <div ref={frame} className="fixed inset-x-0 top-0 z-40 mx-auto flex h-dvh min-h-0 min-w-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-hidden bg-[#B2C7D9] text-[#30353A] sm:max-w-2xl">
  <header className="z-10 flex shrink-0 items-center gap-2 bg-[#B2C7D9] px-2 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
   <Link href="/" aria-label="기사 홈으로" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/15"><ArrowLeft size={24} strokeWidth={1.9}/></Link>
   <div className="min-w-0 flex-1"><h1 className="truncate text-[18px] font-semibold tracking-[-0.025em]">VIP리무진코리아</h1></div>
  </header>
  <div className="shrink-0 pb-3 pt-3 text-center"><span className="rounded-full bg-[#94AABD]/70 px-4 py-1 text-[11px] font-medium text-white">{dayLabel(today)}</span></div>
  <section ref={scroller} aria-label="VIP리무진코리아와 대화" className="min-h-0 min-w-0 flex-1 select-text space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain pb-5 pt-2" onScroll={e=>{const el=e.currentTarget;stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>
   {hasMore&&<button onClick={()=>{stick.current=false;void load(messages[0]?.seq).catch(e=>setError(e.message));}} className="mx-auto flex items-center gap-1 rounded-full bg-white/70 px-4 py-2 text-xs text-[#566B7C]"><ChevronUp size={13}/>이전 대화</button>}
   {!loading&&!messages.length&&bubble({id:'welcome',created_at:new Date().toISOString(),body:`${driverName}님, 오늘도 수고 많으셨어요.\n운행보고를 여기로 보내 주세요.`},false)}
   {loading&&<p role="status" className="text-center text-xs text-[#566B7C]">이전 대화를 불러오고 있어요…</p>}
   {messages.map((m,i)=><div key={m.id} className="space-y-3">{koreaDate(new Date(m.created_at))!==today&&(i===0||koreaDate(new Date(messages[i-1].created_at))!==koreaDate(new Date(m.created_at)))&&<p className="text-center text-[11px] text-[#566B7C]">{dayLabel(koreaDate(new Date(m.created_at)))}</p>}{bubble(m,m.sender_type==='driver')}</div>)}
   {outgoing.map(m=>bubble(m,true,m))}
   {typing&&<ChatTypingBubble/>}
   {localGuidance.map(m=><div key={m.id} className="space-y-3">{bubble({id:m.id+'-sent',body:m.body,created_at:m.created_at},true)}{bubble({id:m.id+'-help',body:m.reply,created_at:m.created_at},false)}</div>)}
   {draftLoaded&&reportActive&&<div className="px-3 sm:px-5"><ReportServicePicker value={serviceType} onChange={v=>{setServiceType(v);setError('');}}/></div>}
  </section>
  {error&&<div role="status" className="flex items-center gap-2 border-t border-white/50 bg-white/90 px-4 py-2.5 text-xs leading-5 text-[#59646D]"><span className="flex-1">{error}</span><button aria-label="대화 다시 불러오기" onClick={()=>void load().catch(e=>setError(e.message))}><RefreshCw size={15}/></button></div>}
  <footer className="shrink-0 bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
   {reportActive&&templates&&<div className="mb-2 rounded-lg bg-[#F4F5F6] p-2"><button onClick={template} className="w-full rounded-md px-3 py-2 text-left text-sm text-[#49525C]">운행보고 양식 불러오기</button></div>}
   <div className="flex items-end gap-2.5">
    <button aria-label={reportActive?"보고 양식":"새 운행보고 시작"} aria-expanded={reportActive&&templates} onClick={()=>reportActive?setTemplates(v=>!v):startNextReport()} className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center text-[#6B747B] hover:bg-[#F3F4F5]"><Plus size={29} strokeWidth={1.7}/></button>
    <textarea ref={input} aria-label="메시지 입력" placeholder={!reportActive?'다음 보고는 + 버튼을 눌러주세요':serviceType?'메시지 입력':'먼저 운행 유형을 선택해 주세요'} disabled={!reportActive||!serviceType} value={text} onChange={e=>setText(e.target.value)} maxLength={20000} rows={1} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send();}}} className="max-h-44 min-h-11 min-w-0 flex-1 resize-none rounded-[10px] border border-[#E2E4E6] bg-white px-3 py-2.5 text-[16px] leading-[1.5] outline-none placeholder:text-[#A4ABB1] placeholder:text-[12px] placeholder:whitespace-nowrap sm:placeholder:text-[14px] focus:border-[#B9C1C7]"/>
    <button aria-label="메시지 보내기" disabled={!reportActive||!serviceType||!text.trim()||sending} onClick={()=>void send()} className="mb-0.5 flex h-9 shrink-0 items-center justify-center rounded-[7px] bg-[#FEE500] px-3.5 text-[13px] font-semibold text-[#3B3C35] disabled:bg-[#F2F2F2] disabled:text-[#B4B9BC]">전송</button>
   </div>
  </footer>
 </div>;
}
