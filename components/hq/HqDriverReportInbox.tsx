'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Upload,Download,RefreshCw,History,ArrowRight,Check,FileSpreadsheet} from 'lucide-react';
import {HqExcelSectionIcon} from './HqExcelSectionIcon';
import {HqExcelWorkbookView} from './HqExcelWorkbookView';
import type {DriverReportSubmission,ReportChatMessage} from '@/types/driverReportChat';
import {reportDisplayStatus,reportMatchesFilter,visibleHqReportMessages,type ReportHqFilter} from '@/utils/reportHqPresentation';
type Version={id:string;generation:number;kind:string;created_at:string};
const json=async(url:string,init?:RequestInit)=>{const r=await fetch(url,{cache:'no-store',...init});const d=await r.json();if(!r.ok)throw new Error(d.error||'처리하지 못했습니다.');return d;};
export function HqDriverReportInbox() {
 const [reports,setReports]=useState<DriverReportSubmission[]>([]),[versions,setVersions]=useState<Version[]>([]);
 const [workbook,setWorkbook]=useState<{active_version:string;filename:string;year:number}|null>(null);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<DriverReportSubmission|null>(null);
 const [isExpanded,setIsExpanded]=useState(false),[unreadIds,setUnreadIds]=useState<string[]>([]);
 const [refreshing,setRefreshing]=useState(false),[refreshComplete,setRefreshComplete]=useState(false);
 const refreshFeedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [chat,setChat]=useState<ReportChatMessage[]>([]),[audit,setAudit]=useState<{id:string;action:string;created_at:string}[]>([]);
 const [corrected,setCorrected]=useState(''),[note,setNote]=useState(''),[version,setVersion]=useState('');
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState<ReportHqFilter>('all'),[more,setMore]=useState(false);const file=useRef<HTMLInputElement>(null),selection=useRef<string|null>(null);
 const refresh=useCallback(async()=>{
  const [r,w,reads]=await Promise.all([json('/api/hq/driver-reports'),json('/api/hq/report-workbook'),json('/api/hq/report-reads')]);
  setReports(previous=>{const merged=new Map(previous.map(s=>[s.id,s]));for(const s of r.submissions)merged.set(s.id,s);return [...merged.values()].sort((a,b)=>b.seq-a.seq);});
  setSelected(current=>current?r.submissions.find((item:DriverReportSubmission)=>item.id===current.id)||current:null);
  setMore(r.hasMore);setVersions(w.versions);setWorkbook(w.workbook);setUnreadIds(reads.unreadIds||[]);
 },[]);
 useEffect(()=>{void Promise.resolve().then(refresh).catch(e=>setMessage(e.message));const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{});},15000);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>()=>{if(refreshFeedbackTimer.current)clearTimeout(refreshFeedbackTimer.current);},[]);
 async function manualRefresh(){
  if(refreshing||busy)return;
  if(refreshFeedbackTimer.current)clearTimeout(refreshFeedbackTimer.current);
  setRefreshing(true);setRefreshComplete(false);
  try{
   // This queries reports, the active Excel version and today's unread count.
   await refresh();
   // Also refresh the currently open report details without closing the card.
   const currentId=isExpanded?selection.current:null;
   if(currentId){
    const details=await json('/api/hq/driver-reports?submissionId='+encodeURIComponent(currentId));
    if(selection.current===currentId){setChat(details.messages);setAudit(details.audit);}
   }
   setMessage('');
   setRefreshComplete(true);
   refreshFeedbackTimer.current=setTimeout(()=>setRefreshComplete(false),2600);
  }catch(error){setMessage((error as Error).message);}
  finally{setRefreshing(false);}
 }
 async function detail(s:DriverReportSubmission) {
  if(selected?.id===s.id&&isExpanded){setIsExpanded(false);return;}
  selection.current=s.id;setIsExpanded(true);
  // Mark only a newly applied report as read; the server persists this per HQ account.
  if(s.excel_status==='applied'&&unreadIds.includes(s.id)){
   void json('/api/hq/report-reads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({submissionId:s.id})})
    .then(()=>setUnreadIds(previous=>previous.filter(id=>id!==s.id)))
    .catch(error=>setMessage((error as Error).message));
  }setSelected(s);setCorrected(`${s.parsed.draft.date.replace(/(\d{4})-(\d{2})-(\d{2})/,'$1년 $2월 $3일')}\n수행담당 : ${s.parsed.draft.driver}\n차량번호 : ${s.parsed.draft.plate}\n고객명 : ${s.parsed.draft.customer}\n시작 시간 : ${s.parsed.draft.time.split('~')[0]||''}\n종료 시간 : ${s.parsed.draft.time.split('~')[1]||''}\n운행일지\n${s.parsed.draft.route.split(' - ').join(' → ')}`);setChat([]);setAudit([]);setNote('');
  try{const r=await json('/api/hq/driver-reports?submissionId='+s.id);if(selection.current===s.id){setChat(r.messages);setAudit(r.audit);}}catch(e){setMessage((e as Error).message);}
 }
 async function action(body:unknown){setBusy(true);try{await json('/api/hq/driver-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await refresh();setSelected(null);setIsExpanded(false);setMessage('처리 결과를 갱신했습니다.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const btn='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-40';
 async function older(){try{const r=await json('/api/hq/driver-reports?before='+reports[reports.length-1]?.seq);setReports(p=>[...p,...r.submissions.filter((s:DriverReportSubmission)=>!p.some(a=>a.id===s.id))]);setMore(r.hasMore);}catch(e){setMessage((e as Error).message);}}
 return <section aria-label="기사 운행보고 자동 누적" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
  <div className="flex flex-wrap items-start gap-3"><HqExcelSectionIcon src="/images/icons/excel/icon_kakao.png" label="기사 운행보고" count={unreadIds.length}/><div className="flex-1"><h2 className="font-bold text-slate-800">기사 운행보고 · 자동 누적</h2><p className="mt-1 text-sm text-slate-500">기사 대화방에서 접수한 보고와 회사 Excel 작업본을 관리합니다.</p></div><div className="flex shrink-0 items-center gap-2"><span role="status" aria-live="polite" className="text-[12px] text-[#72829A]">{refreshComplete?'업데이트됨':''}</span><button type="button" aria-label="제출 현황 새로고침" title="보고·Excel·미열람 현황 다시 불러오기" disabled={busy||refreshing} onClick={()=>void manualRefresh()} className={btn+' min-h-10 min-w-10'}>{refreshComplete?<Check size={16} className="text-[#1E60F3]"/>:<RefreshCw size={16} className={refreshing?'animate-spin':''}/>}</button></div></div>
  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-4">
   <div className="mr-auto min-w-0"><p className="flex items-center gap-2 text-xs text-slate-400"><FileSpreadsheet size={15} className="shrink-0 text-[#6A83A7]"/>회사 Excel 작업본</p><p className="mt-1 flex min-w-0 items-start gap-2 text-sm font-semibold text-slate-700"><FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-[#6A83A7]"/><span className="min-w-0 break-all">{workbook?.filename||'등록된 원본이 없습니다'}</span></p></div>
   {!workbook&&<button disabled={busy} onClick={()=>file.current?.click()} className={btn}><Upload size={16}/>원본 등록</button>}{workbook&&<a className={btn+' hq-excel-download-lift min-h-11 w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/40 active:bg-[#EFF4FF]'} href={'/api/hq/report-workbook?download=1&year='+workbook.year}><Download size={16}/>최신 Excel</a>}
   <input ref={file} type="file" accept=".xlsx" className="hidden" aria-label="회사 Excel 원본 등록" onChange={e=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    if(f.size>12*1024*1024){setMessage('Excel은 12MB 이하만 등록할 수 있습니다.');return;}
    setBusy(true);void json('/api/hq/report-workbook',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Workbook-Name':encodeURIComponent(f.name)},body:f}).then(()=>refresh()).then(()=>setMessage('원본 백업과 작업본을 등록했습니다.')).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));
   }}/>
  </div>
  

  {workbook&&<HqExcelWorkbookView year={workbook.year} onCommitted={refresh}/>}

  {message&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-slate-600">{message}</p>}
  <div className="flex flex-wrap items-center gap-2">
   <div role="group" aria-label="보고 상태 필터" className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-2xl bg-[#F2F4F6] p-1">
    {([
     {id:'all',label:'전체 보고'},
     {id:'applied',label:'반영 완료'},
     {id:'review',label:'확인 필요'}
    ] as const).map(item=><button key={item.id} type="button" aria-pressed={filter===item.id}
     onClick={()=>setFilter(item.id)}
     className={'whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/50 sm:px-4 '+(filter===item.id?'bg-white text-[#1E60F3] shadow-[0_1px_5px_rgba(50,70,110,0.09)]':'text-[#718099] hover:bg-white/70 hover:text-[#465775]')}>{item.label}</button>)}
   </div>
   <div className="ml-auto w-full min-w-0 sm:w-[260px] lg:w-[300px]">
    <input aria-label="최근 보고 검색" type="search" placeholder="기사·차량·거래처·날짜 검색" value={search} onChange={e=>setSearch(e.target.value)}
     className="h-11 w-full min-w-0 rounded-2xl border border-[#E0E7F2] bg-white px-4 text-[14px] text-[#465775] outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-[#9AA7B8] hover:border-[#B8C9E8] focus:border-[#1E60F3] focus:bg-white focus:ring-2 focus:ring-[#1E60F3]/10"/>
   </div>
  </div>
  <div className="space-y-2">
   {reports.filter(s=>reportMatchesFilter(s.excel_status,filter)&&(!search||[s.parsed.draft.driver,s.parsed.draft.customer,s.parsed.draft.plate,s.parsed.draft.date].some(v=>v.includes(search)))).map(report=><div key={report.id} className="min-w-0">
    <button type="button" aria-expanded={selected?.id===report.id&&isExpanded} aria-controls={'report-details-'+report.id}
     onClick={()=>void detail(report)} className={'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-150 hover:bg-[#F7F9FC] '+(selected?.id===report.id&&isExpanded?'border-[#CBDCFB] bg-[#FAFCFF]':'border-[#E9EDF4] bg-white')}>
     <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-[#465775]">{report.parsed.draft.driver||'담당 확인'} · {report.parsed.draft.plate||'차량 확인'}</p>
      <p className="mt-1 truncate text-xs text-[#8B97A8]">{report.parsed.draft.date||'날짜 확인'} · {report.parsed.draft.customer||'거래처 확인'}</p>
     </div>
     <span className={'shrink-0 rounded-full px-3 py-1 text-xs font-medium '+(report.excel_status==='applied'?'bg-[#EAF0FE] text-[#1E60F3]':'bg-[#F2F4F6] text-[#6D7B90]')}>{reportDisplayStatus(report.excel_status)}</span>
     <ArrowRight size={15} className={'shrink-0 text-[#B4BFCC] transition-transform duration-200 '+(selected?.id===report.id&&isExpanded?'rotate-90':'')}/>
    </button>
    <div id={'report-details-'+report.id} aria-hidden={!(selected?.id===report.id&&isExpanded)}
      className={'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out '+(selected?.id===report.id&&isExpanded?'grid-rows-[1fr] opacity-100':'grid-rows-[0fr] opacity-0')}>
     <div className="min-h-0 overflow-hidden">
      <div className="pt-2">
       {selected?.id===report.id&&<div className="space-y-3 rounded-xl border border-blue-100 bg-slate-50 p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-700">보고 확인</h3><button onClick={()=>setIsExpanded(false)} className="text-sm text-slate-500">닫기</button></div>
   <p className="text-xs text-[#7A879A]">{selected.excel_sheet_name&&`${selected.excel_sheet_name} · ${selected.excel_row_number}행`}{selected.excel_status!=='applied'&&!selected.excel_sheet_name?'Excel 반영 확인 필요':''}</p>
   {(selected.last_error||selected.parsed.reviewReasons.length>0)&&<details className="text-xs text-[#6D7B90]"><summary className="cursor-pointer py-1">확인 항목 보기</summary><div className="mt-2 space-y-1 rounded-xl bg-white p-3">{selected.parsed.reviewReasons.map((reason,index)=><p key={index}>{reason}</p>)}{selected.last_error&&<p>{selected.last_error}</p>}</div></details>}
   <div aria-label="제출 대화 기록" className="max-h-60 space-y-2 overflow-y-auto">{visibleHqReportMessages(chat).map(m=><p key={m.id} className="whitespace-pre-wrap rounded-xl bg-white p-3 text-xs leading-5 text-[#596981]"><span className="font-semibold">{m.sender_type==='driver'?'기사':'관리자'} · </span>{m.body}</p>)}</div>
   {<><label className="block text-xs font-medium text-slate-500">확인한 보고 내용 (원문은 보관됩니다)<textarea value={corrected} onChange={e=>setCorrected(e.target.value)} rows={7} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"/></label><label className="block text-xs text-slate-500">검토 메모<input value={note} onChange={e=>setNote(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm"/></label><div className="flex flex-wrap gap-2"><button disabled={busy} className={btn} onClick={()=>void action({action:'review',id:selected.id,revision:selected.revision,correctedMessage:corrected,note})}>{selected.applied_version?'정정 후 기존 기록 반영':'확인 후 반영'}</button><button disabled={busy} className={btn} onClick={()=>void action({action:'retry',id:selected.id})}>기존 내용 재처리</button></div></>}
   <details><summary className="text-xs text-slate-500">수정 이력</summary>{audit.map(a=><p key={a.id} className="mt-2 text-xs text-slate-500">{a.created_at} · {a.action}</p>)}</details>
  </div>}
      </div>
     </div>
    </div>
   </div>)}
   {!reports.some(s=>reportMatchesFilter(s.excel_status,filter)&&(!search||[s.parsed.draft.driver,s.parsed.draft.customer,s.parsed.draft.plate,s.parsed.draft.date].some(v=>v.includes(search))))&&<p className="py-8 text-center text-sm text-[#8B97A8]">{reports.length?'조건에 맞는 보고가 없습니다.':'아직 접수된 운행보고가 없습니다.'}</p>}
  </div>
  <details className="text-xs text-[#7A879A]">
   <summary className="cursor-pointer select-none py-1">자동 적재 관리</summary>
   <button className={btn+' mt-2'} disabled={busy} onClick={()=>void action({action:'drain'})}><RefreshCw size={15}/>대기·오류 재처리 (최대 20건)</button>
  </details>
  {more&&<button onClick={()=>void older()} className={btn}>이전 보고 더 보기</button>}

  {versions.length>0&&<details><summary className="flex cursor-pointer items-center gap-2 text-xs text-slate-500"><History size={14}/>작업본 버전 · 복구</summary><div className="mt-3 flex flex-wrap gap-2"><select aria-label="Excel 버전" value={version} onChange={e=>setVersion(e.target.value)} className={btn}><option value="">버전 선택</option>{versions.map(v=><option key={v.id} value={v.id}>#{v.generation} · {v.kind} · {new Date(v.created_at).toLocaleString('ko-KR')}</option>)}</select>{version&&<><a className={btn} href={'/api/hq/report-workbook?download=1&version='+version+'&year='+workbook?.year}>선택 버전 다운로드</a><button disabled={busy} className={btn} onClick={()=>{
    if(!window.confirm('이 버전으로 복구한 뒤, 빠진 보고는 다시 반영 대기로 돌립니다. 계속할까요?'))return;
    setBusy(true);void json('/api/hq/report-workbook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'restore',version,expected:workbook?.active_version})}).then(()=>refresh()).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));
   }}>선택 버전 복구</button></>}</div></details>}
 </section>;
}
