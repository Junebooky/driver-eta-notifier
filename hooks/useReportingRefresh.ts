'use client';
import { useCallback,useEffect,useRef,useState } from 'react';

/** Poll the server so a driver's device and an HQ device do not depend on shared browser events. */
export function useReportingRefresh(load:()=>Promise<{ok:boolean;error?:string}>) {
  const [error,setError]=useState<string|null>(null);
  const [refreshing,setRefreshing]=useState(false);
  const running=useRef<Promise<void>|null>(null);
  const mounted=useRef(false);
  const refresh=useCallback(()=>{
    if(running.current)return running.current;
    if(mounted.current)setRefreshing(true);
    running.current=(async()=>{
      try{const result=await load();if(mounted.current)setError(result.ok?null:result.error || '서버 내역을 불러오지 못했습니다.');}
      catch{if(mounted.current)setError('서버에 연결하지 못했습니다. 다시 확인해 주세요.');}
      finally{running.current=null;if(mounted.current)setRefreshing(false);}
    })();
    return running.current;
  },[load]);
  useEffect(()=>{
    mounted.current=true;void refresh();
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=setInterval(visible,20_000);
    window.addEventListener('focus',visible);window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
    return()=>{mounted.current=false;clearInterval(timer);window.removeEventListener('focus',visible);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);};
  },[refresh]);
  return {error,refreshing,refresh};
}
