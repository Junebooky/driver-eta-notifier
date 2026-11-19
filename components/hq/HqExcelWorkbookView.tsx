'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,ChevronLeft,ChevronRight,Expand,Minimize2,FileSpreadsheet,Pencil,Save,X,ArrowUpDown,ZoomIn,ZoomOut,MessageSquareText,Filter,RotateCcw,Rows3,Columns3,Plus,Check,Trash2,AlertTriangle} from 'lucide-react';
import {HqSearchSelect} from './ui/HqSearchSelect';
export type ReportExcelFocus={year:number;sheet:string;row:number;requestId:number};
type Row={row:number;cells:string[];locked:string[]};
type Grid={version:string;year:number;filename:string;month:string;months:string[];total:number;unfilteredTotal:number;filterOptions:{plate:string[];driver:string[];customer:string[]};offset:number;limit:number;rows:Row[];columns:string[];headers:string[];linkedRows:number[];manualRows:number[];rowGap:{after:number;before:number;gap:number}|null};
type DeleteTarget={action:'delete_row';row:number}|{action:'delete_column';column:string;label:string};
type FilterKey='plate'|'driver'|'customer';
type SortKey=string;
const blankFilters=()=>({plate:'',driver:'',customer:''});
type SourceLink={year:number;month:string;row:number;version:string};
type OriginalSource={year:number;month:string;row:number;rawMessage:string;driver:string;customer:string;plate:string;submittedAt:string};
const sourceLinkKey=(target:SourceLink)=>[target.year,target.version,target.month,target.row].join('/');
const columnWidths=[120,112,165,210,125,145,475,165,190,130,130,135];
export function HqExcelWorkbookView({year,onCommitted,focus}:{year:number;onCommitted:()=>Promise<void>;focus?:ReportExcelFocus|null}){
 const [open,setOpen]=useState(false),[month,setMonth]=useState(''),[grid,setGrid]=useState<Grid|null>(null);
 const [offset,setOffset]=useState(0);
 const [showColumnForm,setShowColumnForm]=useState(false);
 const [columnLabel,setColumnLabel]=useState('');
 const [success,setSuccess]=useState('');
 const [deleteTarget,setDeleteTarget]=useState<DeleteTarget|null>(null);
 const renderedWidths=[...columnWidths,...Array(Math.max(0,(grid?.columns.length??12)-12)).fill(165)];
 const renderedTotal=52+renderedWidths.reduce((sum,width)=>sum+width,0);
 const [filters,setFilters]=useState(blankFilters);
 const [sortBy,setSortBy]=useState<SortKey>('');
 const [sortDirection,setSortDirection]=useState<'asc'|'desc'>('asc');
 const changeFilter=(key:FilterKey,value:string)=>{setOffset(0);setEdit(null);setFilters(current=>({...current,[key]:value}));};
 const resetFilters=()=>{setOffset(0);setFilters(blankFilters());setSortBy('');setSortDirection('asc');};
 const [navigateTo,setNavigateTo]=useState<ReportExcelFocus|null>(null);
 const [highlightedRow,setHighlightedRow]=useState<number|null>(null);
 const [flashSequence,setFlashSequence]=useState(0);
 const scrollRef=useRef<HTMLDivElement>(null);
 const gridRequestSequence=useRef(0);
 const [sourceLink,setSourceLink]=useState<SourceLink|null>(null);
 const [sourceExpanded,setSourceExpanded]=useState(false);
 const [sourceText,setSourceText]=useState<OriginalSource|null>(null);
 const [sourceLoading,setSourceLoading]=useState(false);
 const [sourceError,setSourceError]=useState('');
 const sourceCache=useRef(new Map<string,OriginalSource>());
 const [zoom,setZoom]=useState(false);
 const [tableScale,setTableScale]=useState(100);
 const [scrollEdges,setScrollEdges]=useState({left:true,right:true});
 const syncScroll=useCallback(()=>{const node=scrollRef.current;if(!node)return;setScrollEdges({left:node.scrollLeft<=2,right:node.scrollLeft+node.clientWidth>=node.scrollWidth-2});},[]);
 useEffect(()=>{syncScroll();const node=scrollRef.current;if(!node)return;const observer=new ResizeObserver(syncScroll);observer.observe(node);return()=>observer.disconnect();},[syncScroll,grid,zoom,tableScale]);
 useEffect(()=>{if(!zoom)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setZoom(false);setEdit(null);setTableScale(100);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[zoom]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[edit,setEdit]=useState<{row:number;col:string;value:string}|null>(null);
 const dismissSource=useCallback(()=>setSourceLink(null),[]);
 const openSource=(row:number)=>{
  if(!grid||!grid.linkedRows?.includes(row))return;
  const candidate={year:grid.year,month:grid.month,row,version:grid.version};
  setSourceExpanded(false);
  setSourceLink(previous=>previous&&sourceLinkKey(previous)===sourceLinkKey(candidate)?null:candidate);
 };
 useEffect(()=>{
  if(!sourceLink){setSourceLoading(false);setSourceError('');setSourceText(null);return;}
  let cancelled=false;
  const key=sourceLinkKey(sourceLink);
  const cached=sourceCache.current.get(key);
  setSourceText(cached||null);
  setSourceError('');
  if(cached){setSourceLoading(false);return;}
  setSourceLoading(true);
  const controller=new AbortController();
  const params=new URLSearchParams({
   year:String(sourceLink.year),month:sourceLink.month,row:String(sourceLink.row),version:sourceLink.version,
  });
  void fetch('/api/hq/report-row-source?'+params,{cache:'no-store',signal:controller.signal}).then(async r=>{
   const data=await r.json().catch(()=>({}));
   if(!r.ok||!data.ok)throw Error(data.error||'연결된 원문을 불러오지 못했습니다.');
   if(cancelled)return;
   const value=data as OriginalSource;
   sourceCache.current.set(key,value);
   setSourceText(value);
  }).catch(e=>{if(!cancelled&&e?.name!=='AbortError')setSourceError((e as Error).message);})
   .finally(()=>{if(!cancelled)setSourceLoading(false);});
  return ()=>{cancelled=true;controller.abort();};
 },[sourceLink]);
 useEffect(()=>{
  if(!sourceLink)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')dismissSource();};
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 },[sourceLink,dismissSource]);
 useEffect(()=>{
  if(!focus||focus.year!==year)return;
  queueMicrotask(()=>{
   setOpen(true);setMonth(focus.sheet);setEdit(null);setError('');resetFilters();
   setNavigateTo(focus);
  });
 },[focus,year]);
 useEffect(()=>{
  if(!highlightedRow||!grid?.rows.some(row=>row.row===highlightedRow))return;
  const target=scrollRef.current?.querySelector<HTMLTableRowElement>('tr[data-excel-row="'+highlightedRow+'"]');
  if(!target)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center',inline:'nearest'});
 },[grid,highlightedRow,flashSequence]);

 const load=useCallback(async(target:string,focusRow?:number)=>{
  const requestId=++gridRequestSequence.current;
  const params=new URLSearchParams({view:'1',year:String(year)});
  if(target)params.set('month',target);
  params.set('offset',String(focusRow===undefined?offset:0));
  if(focusRow!==undefined)params.set('focusRow',String(focusRow));
  else {
   for(const key of ['plate','driver','customer'] as const)if(filters[key])params.set(key,filters[key]);
   if(sortBy){params.set('sortBy',sortBy);params.set('sortDirection',sortDirection);}
  }
  const r=await fetch('/api/hq/report-workbook?'+params,{cache:'no-store'});
  const data=await r.json();
  if(requestId!==gridRequestSequence.current)return;
  if(!r.ok)throw Error(data.error||'Excel을 불러올 수 없습니다.');
  dismissSource();setGrid(data);setMonth(data.month);
  if(focusRow!==undefined){
   setOffset(data.offset);setHighlightedRow(focusRow);setFlashSequence(count=>count+1);
   setNavigateTo(null);
  }
 },[year,offset,dismissSource,filters.plate,filters.driver,filters.customer,sortBy,sortDirection]);
 useEffect(()=>{
  if(!open)return;
  if(navigateTo&&navigateTo.sheet!==month)return;
  void Promise.resolve().then(()=>load(month,navigateTo?.row)).catch(e=>{
   setNavigateTo(null);setError((e as Error).message);
  });
  return ()=>{++gridRequestSequence.current;};
 },[open,month,load,navigateTo]);
 async function sortMonth(){
  if(!grid||busy)return;
  setBusy(true);setError('');setSuccess('');
  try{
   const r=await fetch('/api/hq/report-workbook',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'sort_month',year,month:grid.month,expectedVersion:grid.version})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'날짜순 정리를 완료하지 못했습니다.');
   if(data.unchanged)setSuccess(data.message||'이미 날짜순으로 정리돼 있습니다.');
   else setSuccess('날짜·행 번호 정리 완료 · 기사 보고 '+(data.moved??0)+'건 연결 위치 갱신');
   resetFilters();
   await load(grid.month);await onCommitted();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function addStructure(action:'add_row'|'add_column'){
  if(!grid||busy)return;
  setBusy(true);setError('');setSuccess('');setEdit(null);
  try{
   const r=await fetch('/api/hq/report-workbook',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,year,month:grid.month,expectedVersion:grid.version,
     ...(action==='add_column'?{label:columnLabel}:{})})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||!data.ok)throw Error(data.error||'Excel 구조를 저장하지 못했습니다.');
   dismissSource();setHighlightedRow(null);resetFilters();
   if(action==='add_row'){
    setSuccess(data.row+'행을 추가했습니다. 셀을 눌러 바로 입력하세요.');
    setNavigateTo({year,sheet:grid.month,row:data.row,requestId:Date.now()});
   }else{
    setShowColumnForm(false);setColumnLabel('');
    setSuccess(data.column+'열 ('+data.label+')을 추가했습니다. 셀을 눌러 입력하세요.');
    await load(grid.month);
   }
   await onCommitted();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function deleteStructure(){
  if(!grid||!deleteTarget||busy)return;
  const target=deleteTarget;
  setBusy(true);setError('');setSuccess('');
  try{
   const r=await fetch('/api/hq/report-workbook',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:target.action,year,month:grid.month,expectedVersion:grid.version,
     ...(target.action==='delete_row'?{row:target.row}:{column:target.column})})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok||!data.ok)throw Error(data.error||'Excel 삭제를 완료하지 못했습니다.');
   setDeleteTarget(null);setEdit(null);dismissSource();setHighlightedRow(null);
   resetFilters();
   await load(grid.month);
   await onCommitted();
   setSuccess(target.action==='delete_row'?target.row+'행을 삭제했습니다.':'사용자 '+target.column+'열을 삭제했습니다.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function save(){
  if(!edit||!grid||busy)return;
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/hq/report-workbook',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'edit_cell',year,month:grid.month,row:edit.row,column:edit.col,
     value:edit.value,expectedVersion:grid.version})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'저장하지 못했습니다.');
   const dateChanged=edit.col==='A';
   setEdit(null);await load(grid.month);await onCommitted();
   if(data.pending)setError(data.message||'셀 수정은 접수됐지만 Excel 반영은 아직 완료되지 않았습니다.');
   else if(dateChanged)setError('날짜를 수정했습니다. 날짜순 정리를 눌러 기록 순서를 다시 맞춰 주세요.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className={zoom?'fixed inset-0 z-[150] flex min-w-0 flex-col bg-[#F4F7FC] p-2 sm:p-5':'min-w-0 space-y-3'}>
  {!zoom&&<button type="button" aria-expanded={open} onClick={()=>{dismissSource();setOpen(v=>!v);setEdit(null);setError('');}}
   className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30">
   <Pencil size={14} className="text-slate-500"/>웹에서 편집 {open?'▴':'▾'}
  </button>}
  {open&&<div className={zoom?'flex h-full min-h-0 min-w-0 flex-col gap-3 rounded-2xl border border-[#E2E9F3] bg-white p-3 shadow-xl sm:p-5':'min-w-0 space-y-3 rounded-2xl border border-[#E2E9F3] bg-white p-3 sm:p-4'}>
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><p className="flex items-center gap-2 text-sm font-bold text-[#354868]"><FileSpreadsheet size={17} className="text-[#627FA8]"/>{year}년 Excel 작업본</p>
     <p className="mt-1 text-xs text-[#8796AA]">셀을 눌러 바로 수정하세요. 기존 원본과 수식은 보존됩니다.</p></div>
    <div className="flex flex-wrap items-center gap-2">
     {zoom&&(
      <div className="inline-flex h-10 items-center rounded-xl border border-[#DBE5F2] bg-[#F7F9FC] p-1 shadow-2xs">
       <div className="relative group/scale-down">
        <button
         type="button"
         aria-label="시트 축소"
         title="시트 축소"
         disabled={tableScale<=50}
         onClick={()=>setTableScale(s=>Math.max(50,s-10))}
         className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#597294] transition-all hover:bg-white hover:text-slate-900 hover:shadow-xs disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
        >
         <ZoomOut size={15}/>
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/scale-down:flex flex-col items-center pointer-events-none z-[160]">
         <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
          비율 축소 (넓게 보기)
         </span>
         <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5 shadow-xs"/>
        </div>
       </div>
       <div className="relative group/scale-reset">
        <button
         type="button"
         aria-label="비율 100%로 초기화"
         title="클릭 시 100%로 초기화"
         onClick={()=>setTableScale(100)}
         className="inline-flex h-8 min-w-[50px] items-center justify-center rounded-lg px-2 text-xs font-bold text-slate-700 transition-all hover:bg-white hover:text-[#1E60F3] hover:shadow-xs cursor-pointer select-none"
        >
         {tableScale}%
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/scale-reset:flex flex-col items-center pointer-events-none z-[160]">
         <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
          {tableScale===100?'현재 100%':'100%로 초기화'}
         </span>
         <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5 shadow-xs"/>
        </div>
       </div>
       <div className="relative group/scale-up">
        <button
         type="button"
         aria-label="시트 확대"
         title="시트 확대"
         disabled={tableScale>=150}
         onClick={()=>setTableScale(s=>Math.min(150,s+10))}
         className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#597294] transition-all hover:bg-white hover:text-slate-900 hover:shadow-xs disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
        >
         <ZoomIn size={15}/>
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/scale-up:flex flex-col items-center pointer-events-none z-[160]">
         <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
          비율 확대
         </span>
         <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5 shadow-xs"/>
        </div>
       </div>
      </div>
     )}
     <div className="relative group/sort">
      <button
       type="button"
       aria-label="날짜·행 번호 정리"
       title="날짜·행 번호 정리"
       disabled={!grid||busy}
       onClick={()=>void sortMonth()}
       className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#DBE5F2] bg-white text-[#597294] shadow-2xs transition-all hover:bg-[#F5F8FC] hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30 disabled:opacity-40 cursor-pointer"
      >
       <ArrowUpDown size={16}/>
      </button>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/sort:flex flex-col items-center pointer-events-none z-[160]">
       <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
        날짜·행 번호 정리
       </span>
       <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5 shadow-xs"/>
      </div>
     </div>
     <div className="relative group/expand">
      <button
       type="button"
       aria-label={zoom?'기본 크기로 복원':'화면 크게 보기'}
       title={zoom?'기본 크기로 복원':'화면 크게 보기'}
       onClick={()=>{
        setZoom(v=>{
         if(v)setTableScale(100);
         return !v;
        });
        setEdit(null);
       }}
       className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#DBE5F2] bg-white text-[#597294] shadow-2xs transition-all hover:bg-[#F5F8FC] hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30 cursor-pointer"
      >
       {zoom?<Minimize2 size={16}/>:<Expand size={16}/>}
      </button>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/expand:flex flex-col items-center pointer-events-none z-[160]">
       <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
        {zoom?'기본 크기로 복원':'화면 크게 보기'}
       </span>
       <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5 shadow-xs"/>
      </div>
     </div>
     {zoom&&(
      <div className="relative group/close">
       <button
        type="button"
        aria-label="확대 화면 닫기"
        title="확대 화면 닫기"
        onClick={()=>{
         setZoom(false);
         setEdit(null);
         setTableScale(100);
        }}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#DBE5F2] bg-white text-[#71839C] shadow-2xs transition-all hover:bg-[#F5F8FC] hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30 cursor-pointer"
       >
        <X size={17}/>
       </button>
       <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/close:flex flex-col items-center pointer-events-none z-[160]">
        <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
         닫기
        </span>
        <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-0.5 shadow-xs"/>
       </div>
      </div>
     )}
    </div>
   </div>
   <div role="tablist" aria-label="월별 시트" className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
    {grid?.months.map(name=><button type="button" role="tab" aria-selected={month===name} key={name} onClick={()=>{setEdit(null);setError('');setHighlightedRow(null);setNavigateTo(null);resetFilters();setMonth(name);}}
     className={'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold '+(month===name?'bg-[#1E60F3] text-white':'bg-[#F2F4F6] text-[#6F809A]')}>{name}</button>)}
   </div>
   {grid?.rowGap&&<div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F7F9FC] px-3 py-2.5">
    <span className="min-w-0 flex-1 text-[12px] leading-5 text-[#63768E]">
     실제 Excel 행 번호가 <strong className="text-[#3E5574]">{grid.rowGap.after} → {grid.rowGap.before}</strong>으로 건너뛰었어.
     기존 수식·원본은 유지하면서 기록과 연결 번호를 함께 정리할 수 있어.
    </span>
    <button type="button" disabled={busy} onClick={()=>void sortMonth()}
     className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-[12px] font-semibold text-[#1E60F3] shadow-[0_2px_10px_rgba(26,47,85,.06)] hover:bg-[#EEF3FC] disabled:opacity-40">
     <ArrowUpDown size={14}/>날짜·행 번호 맞추기
    </button>
   </div>}
   {grid&&<div className="flex flex-wrap items-center gap-2 rounded-xl bg-white">
    <button type="button" aria-label="Excel 새 행 추가" disabled={busy}
     onClick={()=>void addStructure('add_row')}
     className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#E4EAF2] bg-white px-3.5 text-[12px] font-semibold text-[#536985] shadow-[0_3px_10px_rgba(25,40,66,.035)] transition-colors hover:bg-[#F6F9FC] disabled:opacity-40">
     <Rows3 size={15}/><Plus size={12}/>행 추가
    </button>
    <button type="button" aria-label="Excel 새 열 추가" disabled={busy||grid.columns.length>=26}
     onClick={()=>{setShowColumnForm(value=>!value);setError('');setSuccess('');}}
     className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#E4EAF2] bg-white px-3.5 text-[12px] font-semibold text-[#536985] shadow-[0_3px_10px_rgba(25,40,66,.035)] transition-colors hover:bg-[#F6F9FC] disabled:opacity-40">
     <Columns3 size={15}/><Plus size={12}/>열 추가
    </button>
    <button type="button" aria-label="Excel 수기 행 삭제" disabled={busy||!grid.manualRows?.length}
     onClick={()=>{const row=grid.manualRows.at(-1);if(row)setDeleteTarget({action:'delete_row',row});}}
     className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#E4EAF2] bg-white px-3.5 text-[12px] font-semibold text-[#708098] transition-colors hover:bg-[#F8F5F5] disabled:opacity-35">
     <Rows3 size={15}/><Trash2 size={13}/>행 삭제
    </button>
    <button type="button" aria-label="Excel 사용자 열 삭제" disabled={busy||!grid.columns.some(col=>/^[M-Z]$/.test(col))}
     onClick={()=>{const col=grid.columns.filter(x=>/^[M-Z]$/.test(x)).at(-1);if(col)setDeleteTarget({action:'delete_column',column:col,label:grid.headers[grid.columns.indexOf(col)]});}}
     className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#E4EAF2] bg-white px-3.5 text-[12px] font-semibold text-[#708098] transition-colors hover:bg-[#F8F5F5] disabled:opacity-35">
     <Columns3 size={15}/><Trash2 size={13}/>열 삭제
    </button>
    <span className="text-[11px] text-[#92A0B2]">자동입력 열(A~L)·기사 보고 연결 행은 삭제 보호</span>
   </div>}
   {grid&&showColumnForm&&<form onSubmit={e=>{e.preventDefault();void addStructure('add_column');}}
    className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F7F9FC] p-3">
    <label htmlFor="hq-excel-new-column-name" className="text-[12px] font-semibold text-[#5B6F88]">새 열 이름</label>
    <input autoFocus id="hq-excel-new-column-name" value={columnLabel} maxLength={60}
     onChange={e=>setColumnLabel(e.target.value)} placeholder="예: 비고, 추가 경비" required
     className="min-h-10 min-w-0 flex-1 basis-[170px] rounded-xl border border-[#E2E9F3] bg-white px-3 text-[13px] text-[#354868] outline-none focus:border-[#1E60F3]" />
    <button type="submit" disabled={busy||!columnLabel.trim()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#1E60F3] px-3.5 text-[12px] font-semibold text-white disabled:opacity-40">
     <Check size={14}/>추가
    </button>
    <button type="button" onClick={()=>{setShowColumnForm(false);setColumnLabel('');}}
     className="inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-3 text-[12px] text-[#7C8B9E]">취소</button>
   </form>}
   {success&&<p role="status" className="rounded-xl bg-[#F4F8FD] px-3 py-2 text-[12px] text-[#53718E]">{success}</p>}
   {grid&&<div aria-label="Excel 열 필터 및 정렬" className="relative z-[40] flex min-w-0 flex-wrap items-center gap-2.5 rounded-2xl bg-[#F7F9FC] p-2.5 sm:p-3">
    <span className="inline-flex shrink-0 items-center gap-1.5 px-1 text-[12px] font-semibold text-[#657892]"><Filter size={14}/>필터</span>
    <div className="grid min-w-0 flex-[3] basis-[520px] grid-cols-1 gap-2 sm:grid-cols-3">
     {([
      {key:'plate',label:'차량번호',options:grid.filterOptions?.plate??[]},
      {key:'driver',label:'운전자명',options:grid.filterOptions?.driver??[]},
      {key:'customer',label:'거래처명',options:grid.filterOptions?.customer??[]},
     ] as const).map(item=><div key={item.key} className="min-w-0">
      <HqSearchSelect
       size="sm"
       label={item.label+' 필터'}
       placeholder={item.label+' 전체'}
       emptyLabel="전체 보기"
       value={filters[item.key]}
       onChange={value=>changeFilter(item.key,value)}
       options={item.options.map(value=>({value,label:value}))}
      />
     </div>)}
    </div>
    <div className="flex min-w-0 flex-1 basis-[200px] items-center gap-2">
     <div className="min-w-0 flex-1">
      <HqSearchSelect
       size="sm"
       label="Excel 정렬 기준"
       placeholder="기본 순서"
       emptyLabel="기본 순서"
       value={sortBy}
       onChange={value=>{setOffset(0);setEdit(null);setSortBy(value as SortKey);}}
       options={grid.headers.map((name,index)=>({value:grid.columns[index],label:name+'순'}))}
      />
     </div>
     <button type="button" aria-label={'정렬 방향: '+(sortDirection==='asc'?'오름차순':'내림차순')}
      title={sortDirection==='asc'?'오름차순 · 누르면 내림차순':'내림차순 · 누르면 오름차순'}
      disabled={!sortBy}
      onClick={()=>{setOffset(0);setSortDirection(current=>current==='asc'?'desc':'asc');}}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#60748F] shadow-[0_3px_12px_rgba(35,49,78,.035)] hover:text-[#1E60F3] disabled:opacity-35">
      <ArrowUpDown size={16}/>
     </button>
     <button type="button" aria-label="Excel 필터·정렬 초기화" title="필터·정렬 초기화"
      disabled={!Object.values(filters).some(Boolean)&&!sortBy}
      onClick={resetFilters}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#60748F] shadow-[0_3px_12px_rgba(35,49,78,.035)] hover:text-[#1E60F3] disabled:opacity-35">
      <RotateCcw size={15}/>
     </button>
    </div>
   </div>}
   {error&&<p role="alert" className="rounded-xl bg-[#F3F6FC] p-3 text-sm text-[#65758A]">{error}</p>}
   {grid&&<div ref={scrollRef} onScroll={syncScroll} className={'hq-excel-scroll min-w-0 max-w-full overflow-auto overscroll-contain rounded-xl border border-[#E2E9F2] '+(zoom?'min-h-0 flex-1':'max-h-[500px]')}>
    <table className="table-fixed border-collapse text-[11px] text-[#465775]" style={{width:renderedTotal,...(zoom&&tableScale!==100?{zoom:tableScale/100}:{})}}><colgroup><col style={{width:52}}/>{renderedWidths.map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
     <thead className="sticky top-0 z-10 bg-[#EDF2F8]"><tr>
      <th className="sticky left-0 z-20 border-b border-r border-[#DCE5F1] bg-[#EDF2F8] px-2 py-2">행</th>
      {grid.headers.map((h,index)=>{
        const col=grid.columns[index] as SortKey,active=sortBy===col;
        return <th key={h} aria-sort={active?(sortDirection==='asc'?'ascending':'descending'):'none'}
         className="overflow-hidden whitespace-nowrap border-b border-r border-[#DCE5F1] text-left">
         <div className="flex min-w-0 items-center">
         <button type="button"
          aria-label={h+' 열 정렬'+(active?' · '+(sortDirection==='asc'?'오름차순':'내림차순'):'')}
          title={active?(sortDirection==='asc'?'내림차순으로 정렬':'기본 순서로 복원'):'오름차순 정렬'}
          onClick={()=>{
           setOffset(0);setEdit(null);
           if(active){
            if(sortDirection==='asc')setSortDirection('desc');
            else{setSortBy('');setSortDirection('asc');}
           }else{setSortBy(col);setSortDirection('asc');}
          }}
          className={'group flex w-full items-center justify-between gap-1 px-3 py-2 text-left font-semibold transition-colors hover:bg-white/70 '+(active?'text-[#1E60F3]':'text-[#526680]')}>
          <span className="truncate">{h}</span>
          <ArrowUpDown size={12} className={active?'shrink-0 opacity-90':'shrink-0 opacity-35 group-hover:opacity-75'}/>
         </button>
         {/^[M-Z]$/.test(col)&&<button type="button" disabled={busy}
          aria-label={h+' 열 삭제'} title={h+' 사용자 열 삭제'}
          onClick={()=>setDeleteTarget({action:'delete_column',column:col,label:h})}
          className="mx-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[#94A1B2] hover:bg-white hover:text-[#B76363] disabled:opacity-40">
          <Trash2 size={13}/>
         </button>}
         </div>
        </th>;
       })}
     </tr></thead>
     <tbody>{grid.rows.map(row=><tr key={row.row+(highlightedRow===row.row?'-'+flashSequence:'')}
      data-excel-row={row.row}
      className={(highlightedRow===row.row?'hq-excel-target-row':'hover:bg-[#F8FAFD]')+' group/row'}>
      <td className="sticky left-0 z-[1] border-b border-r border-[#E8EDF3] bg-[#F7F9FC] px-1 py-0.5 text-center font-medium text-[#8B9BB1]">
       <div className="relative flex min-h-9 items-center justify-start px-1">
        <span className={grid.linkedRows?.includes(row.row)?'font-semibold text-[#1E60F3]':''}>{row.row}</span>
        {grid.linkedRows?.includes(row.row)&&
         <button type="button" onClick={()=>openSource(row.row)} title="클릭해서 기사 운행보고 원문 보기"
          aria-label={row.row+'행 기사 원문 보기'}
          aria-expanded={sourceLink?.row===row.row&&sourceLink?.month===grid.month}
          className="absolute right-0 top-1/2 inline-flex size-[21px] -translate-y-1/2 items-center justify-center rounded-md text-[#1E60F3] opacity-60 transition-opacity hover:bg-white hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30 sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
          <MessageSquareText size={13} strokeWidth={1.8}/>
         </button>}
        {!grid.linkedRows?.includes(row.row)&&grid.manualRows?.includes(row.row)&&
         <button type="button" disabled={busy} title={row.row+'행 삭제'} aria-label={row.row+'행 삭제'}
          onClick={()=>setDeleteTarget({action:'delete_row',row:row.row})}
          className="absolute right-0 top-1/2 inline-flex size-[21px] -translate-y-1/2 items-center justify-center rounded-md text-[#8B9DB1] opacity-60 transition-opacity hover:bg-white hover:text-[#B76363] hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30 disabled:opacity-25 sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
          <Trash2 size={12}/>
         </button>}
       </div>
      </td>
      {row.cells.map((value,i)=>{
       const col=grid.columns[i],active=edit?.row===row.row&&edit.col===col,locked=row.locked.includes(col);
       return <td key={col} className="min-w-0 overflow-hidden border-b border-r border-[#E8EDF3] p-0 align-top">
        {active?<div className="flex min-w-[180px] items-center gap-1 p-1">
         {col==='G'?<textarea autoFocus rows={3} aria-label={col+row.row+' 편집'} value={edit.value} onChange={e=>setEdit({...edit,value:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void save();}if(e.key==='Escape')setEdit(null);}} className="min-w-0 flex-1 resize-y rounded-lg border border-[#1E60F3] bg-white px-2 py-2 text-base outline-none"/>:<input autoFocus aria-label={col+row.row+' 편집'} value={edit.value} onChange={e=>setEdit({...edit,value:e.target.value})}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save();}if(e.key==='Escape')setEdit(null);}}
          className="min-w-0 flex-1 rounded-lg border border-[#1E60F3] bg-white px-2 py-2 text-base outline-none"/>}
         <button type="button" aria-label="저장" disabled={busy} onClick={()=>void save()} className="p-1.5 text-[#1E60F3]"><Save size={16}/></button>
         <button type="button" aria-label="취소" onClick={()=>setEdit(null)} className="p-1.5 text-[#8A97A9]"><X size={16}/></button>
        </div>:
        <button type="button" disabled={busy||locked}
         onClick={()=>{setEdit({row:row.row,col,value});setError('');}}
         className="block min-h-9 w-full max-w-full whitespace-pre-wrap break-words px-3 py-2 text-left [overflow-wrap:anywhere] hover:bg-[#EAF1FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]" title={locked?'수식은 편집할 수 없습니다.':value}>{value||' '}</button>}
       </td>;
      })}
     </tr>)}</tbody>
    </table>
    {grid.rows.length===0&&<p className="p-8 text-center text-xs text-[#8F9BAA]">조건에 맞는 행이 없습니다.</p>}
   </div>}
   {grid&&<div className="flex items-center justify-between gap-2 pt-1"><span className="text-[11px] text-[#8A98AA]">좌우로 이동해 열을 확인하세요.{zoom&&tableScale!==100&&<span className="ml-1.5 font-semibold text-[#1E60F3]">({tableScale}% 배율 적용 중)</span>}</span><div className="flex items-center gap-1.5"><button type="button" aria-label="Excel 왼쪽으로 스크롤" disabled={scrollEdges.left} onClick={()=>scrollRef.current?.scrollBy({left:-340,behavior:'smooth'})} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E0E8F2] bg-[#F8FAFD] text-[#7588A1] hover:bg-[#EDF3FA] disabled:opacity-35"><ChevronLeft size={18}/></button><button type="button" aria-label="Excel 오른쪽으로 스크롤" disabled={scrollEdges.right} onClick={()=>scrollRef.current?.scrollBy({left:340,behavior:'smooth'})} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E0E8F2] bg-[#F8FAFD] text-[#7588A1] hover:bg-[#EDF3FA] disabled:opacity-35"><ChevronRight size={18}/></button></div></div>}
   <p className="text-xs text-[#8392A6]">{grid?'표시 '+grid.rows.length+'행 · 검색 결과 '+grid.total+'행 / 전체 '+grid.unfilteredTotal+'행':'Excel을 불러오는 중'}</p>
   {grid&&grid.total>grid.limit&&<div className="flex gap-3"><button type="button" disabled={offset===0||busy} onClick={()=>{setEdit(null);setOffset(Math.max(0,offset-grid.limit));}} className="min-h-11 px-3 text-sm text-[#1E60F3] disabled:opacity-40">이전 행</button><button type="button" disabled={offset+grid.limit>=grid.total||busy} onClick={()=>{setEdit(null);setOffset(offset+grid.limit);}} className="min-h-11 px-3 text-sm text-[#1E60F3] disabled:opacity-40">다음 행</button></div>}
   {busy&&<p className="text-xs text-[#1E60F3]">저장 중...</p>}
  </div>}
  {deleteTarget&&grid&&<div role="presentation" className="fixed inset-0 z-[280] flex items-center justify-center bg-[#162238]/40 p-4">
   <div role="alertdialog" aria-modal="true" aria-labelledby="hq-excel-delete-title"
    aria-describedby="hq-excel-delete-desc"
    className="w-full max-w-[420px] rounded-[20px] bg-white p-5 shadow-[0_24px_65px_rgba(19,36,64,.2)] sm:p-6">
    <div className="flex items-start justify-between gap-3">
     <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#F7F0EF] text-[#B96666]"><AlertTriangle size={19}/></span>
      <h3 id="hq-excel-delete-title" className="text-[15px] font-bold text-[#354868]">{deleteTarget.action==='delete_row'?'행 삭제':'열 삭제'}</h3>
     </div>
     <button type="button" aria-label="삭제 취소" onClick={()=>setDeleteTarget(null)}
      className="inline-flex size-8 items-center justify-center rounded-lg bg-[#F6F8FA] text-[#7A8BA0]"><X size={16}/></button>
    </div>
    <p id="hq-excel-delete-desc" className="mt-3 text-[12px] leading-6 text-[#63748A]">
     해당 {deleteTarget.action==='delete_row'?'수기 행':'사용자 지정 열'}의 셀 내용이 Excel 작업본에서 삭제됩니다.
     기존 행 번호와 자동 운행보고 연결은 변경되지 않으며, 이전 장부 버전은 보관됩니다.
    </p>
    <label htmlFor="hq-excel-delete-choice" className="mt-4 block text-[12px] font-semibold text-[#506681]">삭제할 {deleteTarget.action==='delete_row'?'행':'열'}</label>
    <select id="hq-excel-delete-choice"
     value={deleteTarget.action==='delete_row'?String(deleteTarget.row):deleteTarget.column}
     onChange={e=>{
      if(deleteTarget.action==='delete_row')setDeleteTarget({action:'delete_row',row:Number(e.target.value)});
      else setDeleteTarget({action:'delete_column',column:e.target.value,label:grid.headers[grid.columns.indexOf(e.target.value)]});
     }}
     className="mt-2 h-11 w-full rounded-xl border border-[#E1E8F1] bg-white px-3 text-[13px] text-[#354868] outline-none focus:border-[#1E60F3]">
     {deleteTarget.action==='delete_row'
      ?grid.manualRows.map(r=><option key={r} value={r}>{r}행</option>)
      :grid.columns.filter(c=>/^[M-Z]$/.test(c)).map(c=><option key={c} value={c}>{c} · {grid.headers[grid.columns.indexOf(c)]}</option>)}
    </select>
    <div className="mt-5 flex justify-end gap-2">
     <button type="button" onClick={()=>setDeleteTarget(null)} disabled={busy}
      className="min-h-10 rounded-xl bg-[#F2F5F9] px-4 text-[12px] font-semibold text-[#687B94]">취소</button>
     <button type="button" disabled={busy} onClick={()=>void deleteStructure()}
      className="min-h-10 rounded-xl bg-[#B76363] px-4 text-[12px] font-semibold text-white disabled:opacity-40">
      {busy?'삭제 중...':'선택 항목 삭제'}
     </button>
    </div>
   </div>
  </div>}
  {sourceLink&&(
   <aside role="dialog" aria-label="연결된 기사 운행보고 원문"
    className={'fixed inset-x-3 bottom-3 z-[210] flex min-w-0 flex-col overflow-hidden rounded-[17px] bg-white p-3.5 shadow-[0_14px_40px_rgba(25,42,76,0.16)] ring-1 ring-[#E7ECF4] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:p-4 '+(sourceExpanded?'max-h-[78dvh] sm:w-[410px]':'max-h-[43dvh] sm:w-[310px]')}
    <div className="flex items-start justify-between gap-3">
     <div className="min-w-0">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-[#17233B]">
       <MessageSquareText size={16} className="text-[#8192AB]"/>기사 보고 원문
      </p>
      <p className="mt-1 text-[11px] font-medium text-[#8898AF]">{sourceLink.year}년 · {sourceLink.month} · {sourceLink.row}행</p>
     </div>
     <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" aria-label={sourceExpanded?'기사 원문 접기':'기사 원문 전체 보기'}
       title={sourceExpanded?'간단히 보기':'원문 전체 펼치기'}
       onClick={()=>setSourceExpanded(v=>!v)}
       className="inline-flex size-8 items-center justify-center rounded-[10px] bg-[#F5F7FA] text-[#657B95] hover:bg-[#EDF1F6]">
       {sourceExpanded?<Minimize2 size={15}/>:<Expand size={15}/>}
      </button>
      <button type="button" onClick={dismissSource} aria-label="원문 미리보기 닫기"
       className="flex size-8 items-center justify-center rounded-[10px] bg-[#F5F7FA] text-[#657B95] hover:bg-[#EDF1F6]">
       <X size={16}/>
      </button>
     </div>
    </div>
    {sourceLoading&&<p role="status" className="mt-4 rounded-[12px] bg-[#F6F8FC] p-3 text-[12px] text-[#7789A3]">원문을 불러오는 중…</p>}
    {sourceError&&<div role="alert" className="mt-4 rounded-[12px] bg-[#FBF4F3] p-3 text-[12px] text-[#A85C54]">
      {sourceError}
      <button type="button" className="ml-2 underline" onClick={()=>{sourceCache.current.delete(sourceLinkKey(sourceLink));setSourceLink({...sourceLink});}}>다시 시도</button>
    </div>}
    {sourceText&&!sourceLoading&&!sourceError&&<>
     <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-b border-[#EDF1F6] pb-3 text-[11px] text-[#7889A0]">
      <span>기사 {sourceText.driver||'미확인'}</span><span>거래처 {sourceText.customer||'미확인'}</span>
      {sourceText.plate&&<span>차량 {sourceText.plate}</span>}
     </div>
     <div className={'mt-2 min-h-0 rounded-[12px] bg-[#F8FAFC] px-3 py-2.5 '+(sourceExpanded?'max-h-[58dvh] overflow-y-auto overscroll-contain':'max-h-[128px] overflow-hidden')}>
      <p className="whitespace-pre-wrap break-words text-[12px] leading-[1.8] text-[#475C76]">{sourceText.rawMessage}</p>
     </div>
     {!sourceExpanded&&<button type="button" onClick={()=>setSourceExpanded(true)}
      className="mt-2 inline-flex min-h-7 items-center justify-center gap-1 rounded-lg text-[12px] font-semibold text-[#1E60F3] hover:bg-[#F5F8FD]">
      <Expand size={12}/>기사 원문 전체 보기
     </button>}
     <p className="mt-2 text-[10px] text-[#9AA7B8]">기사 제출 당시 원문 · Excel 수정 내용과 다를 수 있습니다.</p>
    </>}
   </aside>
  )}
 </div>;
}
