'use client';
import {useCallback,useEffect,useState} from 'react';
import {ChevronDown,ChevronUp,Pencil,Save,X} from 'lucide-react';
type Row={row:number;cells:string[];locked:string[]};
type Grid={version:string;year:number;filename:string;month:string;months:string[];total:number;rows:Row[];columns:string[]};
const headers=['날짜','차량번호','차종','거래처','운전자','타임','운행경로','셀프/의전','OT Hours','금액','결제방법','합계'];
export function HqExcelWorkbookView({year,onCommitted}:{year:number;onCommitted:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[month,setMonth]=useState(''),[grid,setGrid]=useState<Grid|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[edit,setEdit]=useState<{row:number;col:string;value:string}|null>(null);
 const load=useCallback(async(target:string)=>{
  const params=new URLSearchParams({view:'1',year:String(year)});
  if(target)params.set('month',target);
  const r=await fetch('/api/hq/report-workbook?'+params,{cache:'no-store'});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Excel을 불러올 수 없습니다.');
  setGrid(data);setMonth(data.month);
 },[year]);
 useEffect(()=>{if(open)void load(month).catch(e=>setError((e as Error).message));},[open,month,load]);
 async function save(){
  if(!edit||!grid||busy)return;
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/hq/report-workbook',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'edit_cell',year,month:grid.month,row:edit.row,column:edit.col,
     value:edit.value,expectedVersion:grid.version})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'저장하지 못했습니다.');
   setEdit(null);await load(grid.month);await onCommitted();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="min-w-0 space-y-3">
  <button type="button" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setEdit(null);setError('');}}
   className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DFE7F1] bg-white px-4 py-2.5 text-sm font-semibold text-[#485F82] hover:bg-[#F7F9FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/30">
   <Pencil size={16}/>Excel 보기·편집{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
  </button>
  {open&&<div className="min-w-0 space-y-3 rounded-2xl border border-[#E2E9F3] bg-white p-3 sm:p-4">
   <div><p className="text-sm font-bold text-[#354868]">{year}년 Excel 작업본</p>
    <p className="mt-1 text-xs text-[#8796AA]">셀을 눌러 바로 수정하세요. 기존 원본과 수식은 보존됩니다.</p></div>
   <div role="tablist" aria-label="월별 시트" className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
    {grid?.months.map(name=><button type="button" role="tab" aria-selected={month===name} key={name} onClick={()=>{setEdit(null);setError('');setMonth(name);}}
     className={'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold '+(month===name?'bg-[#1E60F3] text-white':'bg-[#F2F4F6] text-[#6F809A]')}>{name}</button>)}
   </div>
   {error&&<p role="alert" className="rounded-xl bg-[#F3F6FC] p-3 text-sm text-[#65758A]">{error}</p>}
   {grid&&<div className="max-h-[500px] max-w-full overflow-auto rounded-xl border border-[#E2E9F2]">
    <table className="w-max min-w-full border-collapse text-[11px] text-[#465775]">
     <thead className="sticky top-0 z-10 bg-[#EDF2F8]"><tr>
      <th className="sticky left-0 z-20 border-b border-r border-[#DCE5F1] bg-[#EDF2F8] px-2 py-2">행</th>
      {headers.map((h,i)=><th key={h} className={'whitespace-nowrap border-b border-r border-[#DCE5F1] px-3 py-2 text-left '+(i===6?'min-w-[440px]':i===7?'min-w-[145px]':'min-w-[100px]')}>{h}</th>)}
     </tr></thead>
     <tbody>{grid.rows.map(row=><tr key={row.row} className="hover:bg-[#F8FAFD]">
      <td className="sticky left-0 z-[1] border-b border-r border-[#E8EDF3] bg-[#F7F9FC] px-2 py-2 text-center font-medium text-[#8B9BB1]">{row.row}</td>
      {row.cells.map((value,i)=>{
       const col=grid.columns[i],active=edit?.row===row.row&&edit.col===col,locked=row.locked.includes(col);
       return <td key={col} className="max-w-[560px] border-b border-r border-[#E8EDF3] p-0">
        {active?<div className="flex min-w-[180px] items-center gap-1 p-1">
         <input autoFocus aria-label={col+row.row+' 편집'} value={edit.value} onChange={e=>setEdit({...edit,value:e.target.value})}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save();}if(e.key==='Escape')setEdit(null);}}
          className="min-w-0 flex-1 rounded-lg border border-[#1E60F3] bg-white px-2 py-2 text-xs outline-none"/>
         <button type="button" aria-label="저장" disabled={busy} onClick={()=>void save()} className="p-1.5 text-[#1E60F3]"><Save size={16}/></button>
         <button type="button" aria-label="취소" onClick={()=>setEdit(null)} className="p-1.5 text-[#8A97A9]"><X size={16}/></button>
        </div>:
        <button type="button" disabled={busy||locked} title={locked?'수식은 편집할 수 없습니다.':'클릭하여 편집'}
         onClick={()=>{setEdit({row:row.row,col,value});setError('');}}
         className={'block min-h-9 w-full px-3 py-2 text-left hover:bg-[#EAF1FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3] '+(i===6?'whitespace-nowrap':'whitespace-normal')}>{value||' '}</button>}
       </td>;
      })}
     </tr>)}</tbody>
    </table>
    {grid.rows.length===0&&<p className="p-8 text-center text-xs text-[#8F9BAA]">이 시트에는 아직 보고가 없습니다.</p>}
   </div>}
   <p className="text-xs text-[#8392A6]">{grid?'표시 '+grid.rows.length+'행 · 전체 '+grid.total+'행':'Excel을 불러오는 중'}</p>
   {busy&&<p className="text-xs text-[#1E60F3]">저장 중...</p>}
  </div>}
 </div>;
}
