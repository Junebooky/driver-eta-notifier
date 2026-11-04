'use client';
import {useEffect,useRef,useState} from 'react';
export default function DriverConnect(){
 const token=useRef(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{token.current=new URLSearchParams(location.hash.slice(1)).get('invite')||'';history.replaceState(null,'',location.pathname);queueMicrotask(()=>setReady(!!token.current));},[]);
 async function connect(){setBusy(true);try{const r=await fetch('/api/auth/report-invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.current,label:'내 휴대전화'})});const d=await r.json();if(!r.ok)throw new Error(d.error);sessionStorage.clear();localStorage.removeItem('report-chat-draft');location.replace('/driver/reports');}catch(e){setError((e as Error).message);setBusy(false);}}
 return <main className="m-auto w-full max-w-md space-y-5 p-7 text-slate-700"><h1 className="text-xl font-bold">VIP리무진코리아</h1><p>이 휴대전화로 운행보고를 보내세요.</p><p className="text-sm">회사에서 본인에게 보낸 링크인지 확인해 주세요. 다른 사람에게 전달하지 마세요.</p><button disabled={!ready||busy} onClick={()=>void connect()} className="w-full rounded-2xl bg-[#1E60F3] p-4 font-semibold text-white disabled:opacity-40">{busy?'연결 중…':'내 대화방 연결하기'}</button>{error&&<p role="alert">{error}</p>}</main>;
}
