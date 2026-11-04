'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,ChevronLeft,ChevronRight,Expand,Minimize2,FileSpreadsheet,Pencil,Save,X} from 'lucide-react';
type Row={row:number;cells:string[];locked:string[]};
type Grid={version:string;year:number;filename:string;month:string;months:string[];total:number;offset:number;limit:number;rows:Row[];columns:string[]};
const columnWidths=[120,112,165,210,125,145,475,165,190,130,130,135];
const totalWidth=52+columnWidths.reduce((sum,width)=>sum+width,0);
const headers=['날짜','차량번호','차종','거래처','운전자','타임','운행경로','셀프/의전','OT Hours','금액','결제방법','합계'];
export function HqExcelWorkbookView({year,onCommitted}:{year:number;onCommitted:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[month,setMonth]=useState(''),[grid,setGrid]=useState<Grid|null>(null);
 const [offset,setOffset]=useState(0);
 const scrollRef=useRef<HTMLDivElement>(null);
 const [zoom,setZoom]=useState(false);
 const [scrollEdges,setScrollEdges]=useState({left:true,right:true});
 const syncScroll=useCallback(()=>{const node=scrollRef.current;if(!node)return;setScrollEdges({left:node.scrollLeft<=2,right:node.scrollLeft+node.clientWidth>=node.scrollWidth-2});},[]);
 useEffect(()=>{syncScroll();const node=scrollRef.current;if(!node)return;const observer=new ResizeObserver(syncScroll);observer.observe(node);return()=>observer.disconnect();},[syncScroll,grid,zoom]);
 useEffect(()=>{if(!zoom)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setZoom(false);setEdit(null);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[zoom]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[edit,setEdit]=useState<{row:number;col:string;value:string}|null>(null);
 const load=useCallback(async(target:string)=>{
  const params=new URLSearchParams({view:'1',year:String(year)});
  if(target)params.set('month',target);params.set('offset',String(offset));
  const r=await fetch('/api/hq/report-workbook?'+params,{cache:'no-store'});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Excel을 불러올 수 없습니다.');
  setGrid(data);setMonth(data.month);
 },[year,offset]);
 useEffect(()=>{if(open)void Promise.resolve().then(()=>load(month)).catch(e=>setError((e as Error).message));},[open,month,load]);
 async function sortMonth(){
  if(!grid||busy)return;
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/hq/report-workbook',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'sort_month',year,month:grid.month,expectedVersion:grid.version})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'날짜순 정리를 완료하지 못했습니다.');
   if(data.unchanged)setError(data.message||'이미 날짜순으로 정리돼 있습니다.');
   await load(grid.month);await onCommitted();
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
   if(dateChanged)setError('날짜를 수정했습니다. 날짜순 정리를 눌러 기록 순서를 다시 맞춰 주세요.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className={zoom?'fixed inset-0 z-[150] flex min-w-0 flex-col bg-[#F4F7FC] p-2 sm:p-5':'min-w-0 space-y-3'}>
  {!zoom&&<button type="button" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setEdit(null);setError('');}}
   className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DFE7F1] bg-white px-4 py-2.5 text-sm font-semibold text-[#485F82] hover:bg-[#F7F9FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30">
   <Pencil size={16}/>Excel 보기·편집{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
  </button>}
  {open&&<div className={zoom?'flex h-full min-h-0 min-w-0 flex-col gap-3 rounded-2xl border border-[#E2E9F3] bg-white p-3 shadow-xl sm:p-5':'min-w-0 space-y-3 rounded-2xl border border-[#E2E9F3] bg-white p-3 sm:p-4'}>
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><p className="flex items-center gap-2 text-sm font-bold text-[#354868]"><FileSpreadsheet size={17} className="text-[#627FA8]"/>{year}년 Excel 작업본</p>
     <p className="mt-1 text-xs text-[#8796AA]">셀을 눌러 바로 수정하세요. 기존 원본과 수식은 보존됩니다.</p></div>
    <div className="flex flex-wrap items-center gap-2"><button type="button" aria-label={zoom?'크게 보기 닫기':'Excel 크게 보기'} onClick={()=>{setZoom(v=>!v);setEdit(null);}} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#DBE5F2] bg-white px-3 py-2 text-xs font-semibold text-[#597294] hover:bg-[#F5F8FC]">{zoom?<Minimize2 size={15}/>:<Expand size={15}/>}{zoom?'기본 보기':'크게 보기'}</button><button type="button" disabled={!grid||busy} onClick={()=>void sortMonth()}
     className="rounded-xl border border-[#DBE5F2] bg-[#F6F9FD] px-3 py-2 text-xs font-semibold text-[#597294] hover:bg-[#EBF2FF] disabled:opacity-40">
     날짜순 정리
    </button>{zoom&&<button type="button" aria-label="확대 화면 닫기" onClick={()=>{setZoom(false);setEdit(null);}} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#DBE5F2] text-[#71839C] hover:bg-[#F5F8FC]"><X size={18}/></button>}</div>
   </div>
   <div role="tablist" aria-label="월별 시트" className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
    {grid?.months.map(name=><button type="button" role="tab" aria-selected={month===name} key={name} onClick={()=>{setEdit(null);setError('');setOffset(0);setMonth(name);}}
     className={'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold '+(month===name?'bg-[#1E60F3] text-white':'bg-[#F2F4F6] text-[#6F809A]')}>{name}</button>)}
   </div>
   {error&&<p role="alert" className="rounded-xl bg-[#F3F6FC] p-3 text-sm text-[#65758A]">{error}</p>}
   {grid&&<div ref={scrollRef} onScroll={syncScroll} className={'hq-excel-scroll min-w-0 max-w-full overflow-auto overscroll-contain rounded-xl border border-[#E2E9F2] '+(zoom?'min-h-0 flex-1':'max-h-[500px]')}>
    <table className="table-fixed border-collapse text-[11px] text-[#465775]" style={{width:totalWidth}}><colgroup><col style={{width:52}}/>{columnWidths.map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
     <thead className="sticky top-0 z-10 bg-[#EDF2F8]"><tr>
      <th className="sticky left-0 z-20 border-b border-r border-[#DCE5F1] bg-[#EDF2F8] px-2 py-2">행</th>
      {headers.map(h=><th key={h} className="overflow-hidden whitespace-nowrap border-b border-r border-[#DCE5F1] px-3 py-2 text-left">{h}</th>)}
     </tr></thead>
     <tbody>{grid.rows.map(row=><tr key={row.row} className="hover:bg-[#F8FAFD]">
      <td className="sticky left-0 z-[1] border-b border-r border-[#E8EDF3] bg-[#F7F9FC] px-2 py-2 text-center font-medium text-[#8B9BB1]">{row.row}</td>
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
    {grid.rows.length===0&&<p className="p-8 text-center text-xs text-[#8F9BAA]">이 시트에는 아직 보고가 없습니다.</p>}
   </div>}
   {grid&&<div className="flex items-center justify-between gap-2 pt-1"><span className="text-[11px] text-[#8A98AA]">좌우로 이동해 열을 확인하세요.</span><div className="flex items-center gap-1.5"><button type="button" aria-label="Excel 왼쪽으로 스크롤" disabled={scrollEdges.left} onClick={()=>scrollRef.current?.scrollBy({left:-340,behavior:'smooth'})} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E0E8F2] bg-[#F8FAFD] text-[#7588A1] hover:bg-[#EDF3FA] disabled:opacity-35"><ChevronLeft size={18}/></button><button type="button" aria-label="Excel 오른쪽으로 스크롤" disabled={scrollEdges.right} onClick={()=>scrollRef.current?.scrollBy({left:340,behavior:'smooth'})} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E0E8F2] bg-[#F8FAFD] text-[#7588A1] hover:bg-[#EDF3FA] disabled:opacity-35"><ChevronRight size={18}/></button></div></div>}
   <p className="text-xs text-[#8392A6]">{grid?'표시 '+grid.rows.length+'행 · 전체 '+grid.total+'행':'Excel을 불러오는 중'}</p>
   {grid&&grid.total>grid.limit&&<div className="flex gap-3"><button type="button" disabled={offset===0||busy} onClick={()=>{setEdit(null);setOffset(Math.max(0,offset-grid.limit));}} className="min-h-11 px-3 text-sm text-[#1E60F3] disabled:opacity-40">이전 행</button><button type="button" disabled={offset+grid.limit>=grid.total||busy} onClick={()=>{setEdit(null);setOffset(offset+grid.limit);}} className="min-h-11 px-3 text-sm text-[#1E60F3] disabled:opacity-40">다음 행</button></div>}
   {busy&&<p className="text-xs text-[#1E60F3]">저장 중...</p>}
  </div>}
 </div>;
}
