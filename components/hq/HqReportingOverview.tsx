'use client';
import { useCallback,useState } from 'react';
import { useReportingRefresh } from '@/hooks/useReportingRefresh';
interface Summary{logs:{total:number;submitted:number;pending:number;distanceKm:number};expenses:{total:number;pending:number;amount:number;approvedAmount:number;unlinked:number};}
export function HqReportingOverview(){
  const [summary,setSummary]=useState<Summary|null>(null);
  const load=useCallback(async()=>{
    const response=await fetch('/api/hq/reporting/summary',{cache:'no-store',credentials:'include'});
    const result=await response.json();
    if(response.ok && result.ok && result.summary){setSummary(result.summary);return {ok:true};}
    return {ok:false,error:result.error || '집계 내역을 확인하지 못했습니다.'};
  },[]);
  const {error,refresh}=useReportingRefresh(load);
  if(error)return <aside className="mx-4 my-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{error}<button type="button" className="ml-3 underline" onClick={()=>void refresh()}>다시 확인</button></aside>;
  if(!summary)return <p className="px-5 py-3 text-xs text-slate-500" role="status">운행·경비 누적 내역을 확인하고 있습니다.</p>;
  const cards=[['제출된 운행일지',`${summary.logs.submitted.toLocaleString()}건`],['총 운행 거리',`${summary.logs.distanceKm.toLocaleString()} km`],['등록 경비',`${summary.expenses.total.toLocaleString()}건`],['경비 합계',`${summary.expenses.amount.toLocaleString()}원`]];
  return <section aria-label="운행일지와 경비 누적 현황" className="mx-4 my-3 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-slate-800">운행·경비 누적 현황</p><span className="text-xs text-slate-500">전체 기간 · 운행일지 검토 대기 {summary.logs.pending}건 · 경비 검수 대기 {summary.expenses.pending}건</span></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([label,value])=><div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-[#1E60F3]">{value}</p></div>)}</div>
    {summary.expenses.unlinked>0 && <p className="mt-3 text-xs text-amber-700">운행일지 연결 대기 경비 {summary.expenses.unlinked}건 · 같은 기사·예약·날짜의 운행일지가 저장되면 자동 연결됩니다.</p>}
  </section>;
}
