'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,ArrowUp,Plus,RefreshCw,MessageCircle,ChevronUp} from 'lucide-react';
import type {ReportChatMessage} from '@/types/driverReportChat';
import {koreaDate} from '@/utils/driverReportChat';

type Outgoing={id:string;body:string;created_at:string;failed:boolean};
const time=(date:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(new Date(date));
const dayLabel=(date:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(date+'T12:00:00+09:00'));
export function DriverReportChat({driverId,driverName='기사님'}:{driverId:string;driverName?:string}) {
 const [messages,setMessages]=useState<ReportChatMessage[]>([]),[outgoing,setOutgoing]=useState<Outgoing[]>([]);
 const [text,setText]=useState(''),[error,setError]=useState(''),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true);
 const [today,setToday]=useState(koreaDate()),[templates,setTemplates]=useState(false),[sending,setSending]=useState(false);
 const tail=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),active=useRef(true),inflight=useRef(false),stick=useRef(true),fetched=useRef(false);
 const load=useCallback(async(before?:number)=>{
  const res=await fetch('/api/driver-reports?driverId='+encodeURIComponent(driverId)+(before?'&before='+before:''),{cache:'no-store'});
  const data=await res.json();
  if(res.status===401||res.status===403){setMessages([]);setOutgoing([]);window.location.replace('/driver/reports');return;}
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
  const poll=window.setInterval(()=>{setToday(koreaDate());if(document.visibilityState==='visible')void load().catch(()=>{});},12000);
  return()=>{active.current=false;window.clearInterval(poll);};
 },[load]);
 useEffect(()=>{if(input.current){input.current.style.height='auto';input.current.style.height=Math.min(176,input.current.scrollHeight)+'px';}},[text]);
 useEffect(()=>{if(stick.current)tail.current?.scrollIntoView({block:'end'});},[messages,outgoing]);
 useEffect(()=>{
  const guard=(e:BeforeUnloadEvent)=>{if(text||outgoing.length){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);
 },[text,outgoing]);
 async function send(retry?:Outgoing) {
  if(inflight.current||(!retry&&!text.trim()))return;
  inflight.current=true;setSending(true);stick.current=true;
  const item=retry||{id:crypto.randomUUID(),body:text.trim(),created_at:new Date().toISOString(),failed:false};
  setOutgoing(p=>[...p.filter(v=>v.id!==item.id),{...item,failed:false}]);if(!retry)setText('');
  try{
   const response=await fetch('/api/driver-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:item.body,requestKey:item.id,driverId})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'전송하지 못했어요.');
   await load();setOutgoing(p=>p.filter(v=>v.id!==item.id));
   if(data.duplicate)setError('이미 접수된 보고예요. 기존 대화와 반영 상태를 확인해 주세요.');
  }catch(e){setOutgoing(p=>p.map(v=>v.id===item.id?{...v,failed:true}:v));setError(e instanceof Error?e.message:'연결을 확인해 주세요.');}
  finally{inflight.current=false;setSending(false);input.current?.focus();}
 }
 function template(){
  if(text.trim()&&!window.confirm('작성 중인 내용 대신 보고 양식을 불러올까요?'))return;
  const [y,m,d]=today.split('-');
  setText(`${y}년 ${Number(m)}월 ${Number(d)}일\n수행담당 : ${driverName}\n차량번호 : \n고객명 : \n시작 시간 : \n종료 시간 : \n운행일지\n`);setTemplates(false);input.current?.focus();
 }
 const bubble=(m:{id:string;body:string;created_at:string},mine:boolean,status?:Outgoing)=> <div key={m.id} className={'flex gap-2 px-4 sm:px-6 '+(mine?'justify-end':'justify-start')}>
  {!mine&&<div aria-hidden="true" className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1E60F3] shadow-sm"><MessageCircle size={22} strokeWidth={1.7}/></div>}
  <div className={'flex max-w-[84%] flex-col '+(mine?'items-end':'items-start')}>
   {!mine&&<span className="mb-1.5 ml-1 text-xs font-medium text-slate-500">VIP리무진코리아</span>}
   <div className={'whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-7 shadow-[0_2px_5px_rgba(34,57,86,0.025)] '+(mine?'rounded-[22px] rounded-tr-md bg-[#E5EDFF] text-slate-800':'rounded-[22px] rounded-tl-md border border-slate-100 bg-white text-slate-700')}>{m.body}</div>
   <div className="mt-1.5 flex items-center gap-2 px-1 text-[10px] text-slate-400"><time dateTime={m.created_at}>{time(m.created_at)}</time>{status&&(status.failed?<button onClick={()=>void send(status)} disabled={sending} className="flex items-center gap-1 text-[#1E60F3]"><RefreshCw size={11}/>다시 보내기</button>:<span>보내는 중</span>)}</div>
  </div>
 </div>;
 return <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col overflow-hidden bg-[#F3F5F8] text-slate-800">
  <header className="z-10 flex shrink-0 items-center gap-3 border-b border-slate-200/60 bg-[#F3F5F8]/95 px-4 pb-4 pt-[max(16px,env(safe-area-inset-top))]">
   <Link href="/" aria-label="기사 홈으로" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white"><ArrowLeft size={23}/></Link>
   <div className="flex-1"><h1 className="text-[17px] font-bold tracking-tight">VIP리무진코리아</h1><p className="mt-0.5 text-xs text-slate-400">운행보고 대화방</p></div>
   <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#1E60F3]"><MessageCircle size={21}/></div>
  </header>
  <div className="shrink-0 pb-3 pt-4 text-center"><span className="rounded-full bg-slate-200/60 px-4 py-1.5 text-[11px] font-medium text-slate-500">{dayLabel(today)}</span></div>
  <section aria-label="VIP리무진코리아와 대화" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-6 pt-3" onScroll={e=>{const el=e.currentTarget;stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>
   {hasMore&&<button onClick={()=>{stick.current=false;void load(messages[0]?.seq).catch(e=>setError(e.message));}} className="mx-auto flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs text-slate-500"><ChevronUp size={13}/>이전 대화</button>}
   {!loading&&!messages.length&&bubble({id:'welcome',created_at:new Date().toISOString(),body:`${driverName}님, 오늘도 수고 많으셨어요.\n운행보고를 여기로 보내 주세요.`},false)}
   {loading&&<p role="status" className="text-center text-xs text-slate-400">이전 대화를 불러오고 있어요…</p>}
   {messages.map((m,i)=><div key={m.id} className="space-y-4">{koreaDate(new Date(m.created_at))!==today&&(i===0||koreaDate(new Date(messages[i-1].created_at))!==koreaDate(new Date(m.created_at)))&&<p className="text-center text-[11px] text-slate-400">{dayLabel(koreaDate(new Date(m.created_at)))}</p>}{bubble(m,m.sender_type==='driver')}</div>)}
   {outgoing.map(m=>bubble(m,true,m))}<div ref={tail}/>
  </section>
  {error&&<div role="status" className="flex items-center gap-2 border-t border-slate-100 bg-white px-5 py-3 text-xs leading-5 text-slate-500"><span className="flex-1">{error}</span><button aria-label="대화 다시 불러오기" onClick={()=>void load().catch(e=>setError(e.message))}><RefreshCw size={15}/></button></div>}
  <footer className="shrink-0 border-t border-slate-200/60 bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
   {templates&&<div className="mb-3 rounded-2xl bg-slate-50 p-2"><button onClick={template} className="w-full rounded-xl px-4 py-3 text-left text-sm text-slate-600">운행보고 양식 불러오기</button></div>}
   <div className="flex items-end gap-2"><button aria-label="보고 양식" aria-expanded={templates} onClick={()=>setTemplates(v=>!v)} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-50"><Plus size={25} strokeWidth={1.7}/></button>
    <textarea ref={input} aria-label="메시지 입력" placeholder="메시지 입력" value={text} onChange={e=>setText(e.target.value)} maxLength={20000} rows={1} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send();}}} className="max-h-44 min-h-12 flex-1 resize-y rounded-[24px] border border-slate-200 bg-[#F7F8FA] px-4 py-3 text-[15px] leading-6 outline-none placeholder:text-slate-400 focus:border-[#1E60F3]/40"/>
    <button aria-label="메시지 보내기" disabled={!text.trim()||sending} onClick={()=>void send()} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E60F3] text-white disabled:bg-slate-100 disabled:text-slate-300"><ArrowUp size={22} strokeWidth={2.3}/></button>
   </div>
  </footer>
 </div>;
}
