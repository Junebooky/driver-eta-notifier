'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Upload,Download,RefreshCw,ChevronRight,Check,Search} from 'lucide-react';
import {HqExcelSectionIcon} from './HqExcelSectionIcon';
import {HqExcelWorkbookView,type ReportExcelFocus} from './HqExcelWorkbookView';
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
 const [excelFocus,setExcelFocus]=useState<ReportExcelFocus|null>(null);
 const [replacement,setReplacement]=useState<{file:File;year:number;expectedVersion:string;previousName:string}|null>(null);
 const [workbookReset,setWorkbookReset]=useState(0);
 const focusCounter=useRef(0);
 function viewExcelLocation(report:DriverReportSubmission){
  if(report.excel_status!=='applied'||!report.excel_sheet_name||!report.excel_row_number)return;
  const year=report.ledger_year??workbook?.year;
  if(!year){setMessage('연결된 연간 Excel 장부를 확인할 수 없습니다.');return;}
  setMessage('');
  setExcelFocus({year,sheet:report.excel_sheet_name,row:report.excel_row_number,requestId:++focusCounter.current});
 }

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

 async function uploadWorkbook(chosen:File,source?:{year:number;expectedVersion:string}){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const headers:Record<string,string>={'Content-Type':'application/octet-stream','X-Workbook-Name':encodeURIComponent(chosen.name)};
   if(source){headers['X-Workbook-Replace-Version']=source.expectedVersion;headers['X-Workbook-Replace-Year']=String(source.year);}
   const result=await json('/api/hq/report-workbook',{method:'POST',headers,body:chosen});
   setReplacement(null);setExcelFocus(null);setSelected(null);setIsExpanded(false);
   if(result.replacement)setWorkbookReset(value=>value+1);
   await refresh();
   setMessage(result.replacement
    ? `새 원본으로 교체했습니다. 이전 보고 ${result.replacement.archivedReports}건은 이전 장부에 보관되며, 새 채팅 보고는 새 Excel에 누적됩니다.`
    : '원본 백업과 작업본을 등록했습니다.');
  }catch(error){setMessage((error as Error).message);}
  finally{setBusy(false);}
 }
 async function older(){try{const r=await json('/api/hq/driver-reports?before='+reports[reports.length-1]?.seq);setReports(p=>[...p,...r.submissions.filter((s:DriverReportSubmission)=>!p.some(a=>a.id===s.id))]);setMore(r.hasMore);}catch(e){setMessage((e as Error).message);}}
 return <section aria-label="기사 운행보고 자동 누적" className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
  <div className="flex flex-wrap items-start gap-3"><HqExcelSectionIcon src="/images/icons/excel/icon_kakao.png" label="실시간 운행보고" count={unreadIds.length}/><div className="flex-1"><h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-800">실시간 운행보고</h2><p className="mt-1 text-sm text-slate-500">카카오톡 보고를 분석해 엑셀 기록부에 실시간으로 동기화해요.</p></div><div className="flex shrink-0 items-center gap-2"><span role="status" aria-live="polite" className="text-[12px] text-[#72829A]">{refreshComplete?'업데이트됨':''}</span><button type="button" aria-label="제출 현황 새로고침" title="보고·Excel·미열람 현황 다시 불러오기" disabled={busy||refreshing} onClick={()=>void manualRefresh()} className={btn+' group min-h-10 min-w-10 hover:border-slate-300 hover:bg-slate-50 transition-all'}>{refreshComplete?<Check size={16} className="text-[#1E60F3]"/>:<RefreshCw size={16} className={refreshing?'animate-spin':'transition-transform duration-500 ease-out group-hover:rotate-180'}/>}</button></div></div>
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 sm:p-4">
   <div className="flex min-w-0 items-center gap-3 sm:gap-3.5">
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
     <img src="/images/icons/excel/icon_excel_v02.png" alt="Excel" draggable={false} className="h-full w-full select-none object-contain drop-shadow-sm"/>
    </div>
    <div className="min-w-0">
     <p className="text-[12px] font-medium text-slate-400">동기화 중인 엑셀</p>
     <p className="mt-0.5 truncate text-[14px] font-bold text-slate-800 tracking-tight sm:text-[15px]">{workbook?.filename||'등록된 원본이 없습니다'}</p>
    </div>
   </div>
   <div className="flex shrink-0 flex-wrap items-center gap-2">
    {!workbook&&<button disabled={busy} onClick={()=>file.current?.click()} className={btn+' h-10'}><Upload size={15}/>원본 등록</button>}
    {workbook&&<button type="button" disabled={busy} onClick={()=>file.current?.click()}
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20">
      <Upload size={15} className="text-slate-500"/>원본 교체
     </button>}
    {workbook&&<a className="hq-excel-download-lift inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30 active:bg-slate-100" href={'/api/hq/report-workbook?download=1&year='+workbook.year}><Download size={15} className="text-slate-500"/>엑셀 다운로드 ⤓</a>}
   </div>
   <input ref={file} type="file" accept=".xlsx" className="hidden" aria-label="회사 Excel 원본 등록" onChange={e=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    if(f.size>12*1024*1024){setMessage('Excel은 12MB 이하만 등록할 수 있습니다.');return;}
    if(workbook){setMessage('');setReplacement({file:f,year:workbook.year,expectedVersion:workbook.active_version,previousName:workbook.filename});}
    else void uploadWorkbook(f);
   }}/>
  </div>
  

  {workbook&&versions.length>1&&
   <details className="rounded-xl px-1 text-xs text-slate-500">
    <summary className="w-fit cursor-pointer py-1.5 font-medium hover:text-slate-700">이전 Excel 작업본 · 원본 다운로드</summary>
    <div className="mt-1 flex flex-wrap gap-2">
     {versions.filter(v=>v.id!==workbook.active_version).slice(0,8).map(v=>
      <a key={v.id} href={'/api/hq/report-workbook?download=1&year='+workbook.year+'&version='+v.id}
       className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">
       <Download size={13}/>{v.kind==='original'?'이전 원본':'작업본'} · {new Date(v.created_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}
      </a>)}
    </div>
   </details>}

  {(workbook||excelFocus)&&<HqExcelWorkbookView key={workbookReset} year={excelFocus?.year??workbook!.year} focus={excelFocus} onCommitted={refresh}/>}

  {message&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-slate-600">{message}</p>}
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
   <div role="group" aria-label="보고 상태 필터" className="inline-flex h-10 items-center rounded-xl bg-slate-100 p-1">
    {([
     {id:'all',label:'전체'},
     {id:'applied',label:'반영 완료'},
     {id:'review',label:'확인 필요'}
    ] as const).map(item=>{
      const active=filter===item.id;
      return <button key={item.id} type="button" aria-pressed={active}
       onClick={()=>setFilter(item.id)}
       className={'h-8 rounded-lg px-3.5 sm:px-4 text-[13px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/40 '+(active?'bg-white text-slate-900 font-semibold shadow-xs':'text-slate-500 font-medium hover:text-slate-800')}>{item.label}</button>;
    })}
   </div>
   <div className="relative w-full sm:w-[280px] lg:w-[320px]">
    <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
    <input aria-label="최근 보고 검색" type="search" placeholder="기사명, 차량번호, 고객사 검색" value={search} onChange={e=>setSearch(e.target.value)}
     className="h-10 w-full min-w-0 rounded-xl border border-slate-200/90 bg-white pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none transition-all hover:border-slate-300 focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10"/>
   </div>
  </div>
  <div className="space-y-2.5">
   {reports.filter(s=>reportMatchesFilter(s.excel_status,filter)&&(!search||[s.parsed.draft.driver,s.parsed.draft.customer,s.parsed.draft.plate,s.parsed.draft.date].some(v=>v.includes(search)))).map(report=>{
    const title = (report.parsed.draft.driver && report.parsed.draft.plate)
      ? `${report.parsed.draft.driver} · ${report.parsed.draft.plate}`
      : [report.parsed.draft.driver, report.parsed.draft.plate].filter(Boolean).join(' · ') || '정보 누락 · 확인 필요';
    const subtitle = (report.parsed.draft.date && report.parsed.draft.customer)
      ? `${report.parsed.draft.date} · ${report.parsed.draft.customer}`
      : [report.parsed.draft.date, report.parsed.draft.customer].filter(Boolean).join(' · ') || '기사 및 거래처 정보 미확인';
    return <div key={report.id} className="min-w-0">
    <div className={'group/card flex w-full items-center gap-3 sm:gap-4 rounded-[20px] border px-5 py-4 sm:px-6 sm:py-[18px] text-left transition-all duration-200 '+(selected?.id===report.id&&isExpanded?'border-[#C8DAFA] bg-[linear-gradient(110deg,#FFFFFF_45%,#F2F7FF_100%)] shadow-[0_6px_24px_rgba(30,96,243,0.08)]':'border-[#EDF1F7] bg-[linear-gradient(110deg,#FFFFFF_52%,#F6F9FF_100%)] shadow-[0_4px_20px_rgba(15,23,42,0.035)] hover:border-[#DCE5F2] hover:shadow-[0_6px_24px_rgba(15,23,42,0.06)]')}>
     <button type="button" aria-expanded={selected?.id===report.id&&isExpanded} aria-controls={'report-details-'+report.id}
      onClick={()=>void detail(report)} className="min-w-0 flex-1 text-left focus:outline-none cursor-pointer">
      <p className="text-[15px] sm:text-[15.5px] font-bold tracking-[-0.02em] text-[#222E42] leading-snug">{title}</p>
      <p className="mt-1 truncate text-[13px] font-normal tracking-[-0.01em] text-[#7A8699] leading-snug">{subtitle}</p>
     </button>

     <div className="flex shrink-0 items-center gap-3 sm:gap-3.5">
      {/* 위치 찾기 3D 아이콘 (카드 호버 시 스무스하게 등장 · 반영 완료 바로 왼쪽) */}
      {report.excel_status==='applied'&&report.excel_sheet_name&&report.excel_row_number&&(
       <div className="relative group/pos inline-flex items-center justify-center shrink-0 opacity-0 translate-x-1.5 scale-90 pointer-events-none transition-all duration-200 ease-out group-hover/card:opacity-100 group-hover/card:translate-x-0 group-hover/card:scale-100 group-hover/card:pointer-events-auto focus-within:opacity-100 focus-within:translate-x-0 focus-within:scale-100 focus-within:pointer-events-auto">
        <button
         type="button"
         onClick={(e)=>{e.stopPropagation(); viewExcelLocation(report);}}
         className="cursor-pointer transition-transform duration-150 group-hover/pos:scale-110 active:scale-95 flex items-center justify-center p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30 rounded-lg"
         aria-label="해당 시트를 찾아드려요!"
        >
         <img
          src="/images/icons/excel/icon_position.png"
          alt="해당 시트를 찾아드려요!"
          className="w-8 h-8 sm:w-9 sm:h-9 object-contain select-none"
          draggable={false}
         />
        </button>

        {/* Hover Tooltip (위로 향하는 말풍선 규격) */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/pos:flex flex-col items-center pointer-events-none z-[100]">
         <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
          해당 시트를 찾아드려요!
         </span>
         <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 shadow-xs"/>
        </div>
       </div>
      )}

      <span className={'shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold tracking-[-0.01em] '+(report.excel_status==='applied'?'bg-[#E8F0FE] text-[#2463EB]':'bg-[#F2F4F7] text-[#667085]')}>{reportDisplayStatus(report.excel_status)}</span>
      <button type="button" aria-label="상세 내용 토글" onClick={()=>void detail(report)} className="shrink-0 p-0.5 text-[#8E9BAA] hover:text-[#475569] transition-colors cursor-pointer focus:outline-none">
       <ChevronRight size={17} strokeWidth={2} className={'transition-transform duration-200 '+(selected?.id===report.id&&isExpanded?'rotate-90':'')}/>
      </button>
     </div>
    </div>
    <div id={'report-details-'+report.id} aria-hidden={!(selected?.id===report.id&&isExpanded)}
      className={'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out '+(selected?.id===report.id&&isExpanded?'grid-rows-[1fr] opacity-100':'grid-rows-[0fr] opacity-0')}>
     <div className="min-h-0 overflow-hidden">
      <div className="pt-2">
       {selected?.id===report.id&&<div className="space-y-3 rounded-xl border border-blue-100 bg-slate-50 p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-700">보고 확인</h3><button onClick={()=>setIsExpanded(false)} className="text-sm text-slate-500">닫기</button></div>
   {selected.excel_status==='applied'&&selected.excel_sheet_name&&selected.excel_row_number
    ?<button type="button" onClick={()=>viewExcelLocation(selected)}
      className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#D8E4F8] bg-white px-3 text-xs font-semibold text-[#1E60F3] transition-colors hover:bg-[#F1F5FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30">
      <img src="/images/icons/excel/icon_position.png" alt="" className="w-4 h-4 object-contain select-none" draggable={false}/>
      Excel에서 위치 보기 · {selected.excel_sheet_name} · {selected.excel_row_number}행
     </button>
    :<p className="text-xs text-[#7A879A]">{selected.excel_status==='archived'
      ? '이전 Excel에 보관된 보고입니다. 새 원본에는 자동 중복 등록되지 않습니다.'
      : 'Excel 반영 확인 필요'}</p>}
   {(selected.last_error||selected.parsed.reviewReasons.length>0)&&<details className="text-xs text-[#6D7B90]"><summary className="cursor-pointer py-1">확인 항목 보기</summary><div className="mt-2 space-y-1 rounded-xl bg-white p-3">{selected.parsed.reviewReasons.map((reason,index)=><p key={index}>{reason}</p>)}{selected.last_error&&<p>{selected.last_error}</p>}</div></details>}
   <div aria-label="제출 대화 기록" className="max-h-60 space-y-2 overflow-y-auto">{visibleHqReportMessages(chat).map(m=><p key={m.id} className="whitespace-pre-wrap rounded-xl bg-white p-3 text-xs leading-5 text-[#596981]"><span className="font-semibold">{m.sender_type==='driver'?'기사':'관리자'} · </span>{m.body}</p>)}</div>
   {<><label className="block text-xs font-medium text-slate-500">확인한 보고 내용 (원문은 보관됩니다)<textarea value={corrected} onChange={e=>setCorrected(e.target.value)} rows={7} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"/></label><label className="block text-xs text-slate-500">검토 메모<input value={note} onChange={e=>setNote(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm"/></label><div className="flex flex-wrap gap-2"><button disabled={busy} className={btn} onClick={()=>void action({action:'review',id:selected.id,revision:selected.revision,correctedMessage:corrected,note})}>{selected.applied_version?'정정 후 기존 기록 반영':'확인 후 반영'}</button>{selected.excel_status!=='archived'&&<button disabled={busy} className={btn} onClick={()=>void action({action:'retry',id:selected.id})}>기존 내용 재처리</button>}</div></>}
   <details><summary className="text-xs text-slate-500">수정 이력</summary>{audit.map(a=><p key={a.id} className="mt-2 text-xs text-slate-500">{a.created_at} · {a.action}</p>)}</details>
  </div>}
      </div>
     </div>
    </div>
   </div>;})}
   {!reports.some(s=>reportMatchesFilter(s.excel_status,filter)&&(!search||[s.parsed.draft.driver,s.parsed.draft.customer,s.parsed.draft.plate,s.parsed.draft.date].some(v=>v.includes(search))))&&<p className="py-8 text-center text-sm text-[#8B97A8]">{reports.length?'조건에 맞는 보고가 없습니다.':'아직 접수된 운행보고가 없습니다.'}</p>}
  </div>
  {replacement&&
   <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/25 p-4" role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="hq-excel-replace-title"
      className="w-full max-w-md rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_18px_65px_rgba(15,23,42,0.14)] sm:p-6">
     <h3 id="hq-excel-replace-title" className="text-lg font-bold tracking-tight text-slate-900">Excel 원본 교체</h3>
     <p className="mt-2 text-sm leading-6 text-slate-500">
      기존 장부와 보고 기록은 백업으로 보관합니다. 새 파일을 원본으로 등록하면 이후 채팅 운행보고가 이 파일에 누적됩니다.
     </p>
     <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
      <div><p className="text-[11px] font-medium text-slate-400">현재 원본 · {replacement.year}년</p>
       <p className="mt-1 break-all text-sm font-semibold text-slate-700">{replacement.previousName}</p></div>
      <div className="border-t border-slate-200 pt-3"><p className="text-[11px] font-medium text-slate-400">새 원본</p>
       <p className="mt-1 break-all text-sm font-semibold text-slate-900">{replacement.file.name}</p></div>
     </div>
     <p className="mt-3 text-xs leading-5 text-slate-500">
      이전에 반영된 보고는 옛 장부에 보관하며, 새 원본에 다시 넣지 않습니다. 사모님 원본의 기존 기록 중복을 방지하기 위한 방식입니다.
     </p>
     {message&&<p role="alert" className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</p>}
     <div className="mt-5 grid grid-cols-2 gap-2.5">
      <button type="button" disabled={busy} onClick={()=>setReplacement(null)}
       className="min-h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">취소</button>
      <button type="button" disabled={busy} onClick={()=>void uploadWorkbook(replacement.file,{year:replacement.year,expectedVersion:replacement.expectedVersion})}
       className="min-h-11 rounded-xl bg-[#1E60F3] text-sm font-semibold text-white hover:bg-[#1955DA] disabled:opacity-50">{busy?'등록 중...':'이 원본으로 교체'}</button>
     </div>
    </div>
   </div>}
 </section>;
}
