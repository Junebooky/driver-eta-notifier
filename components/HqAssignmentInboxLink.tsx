'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
export function HqAssignmentInboxLink(){
 const [count,setCount]=useState<number|null>(null);
 useEffect(()=>{const abort=new AbortController();let running=false;const refresh=async()=>{if(running)return;running=true;try{const response=await fetch('/api/schedules?role=hq',{cache:'no-store',signal:abort.signal});const data=await response.json();if(response.ok&&!abort.signal.aborted)setCount(data.schedules.filter((row:{dispatch_status?:string})=>row.dispatch_status==='unassigned').length);}catch{}finally{running=false;}};void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},8000);return()=>{abort.abort();clearInterval(timer);};},[]);
 return <Link href="/hq?tab=dispatch&view=action" className="rounded-lg bg-blue-50 px-3 py-2 font-bold text-[#1E60F3]">기사·차량 지정 요청{count===null?'':` ${count}건`}</Link>;
}
