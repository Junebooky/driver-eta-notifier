import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {workbookFromFile} from './kakaoExcelWorkbook';
import {routeColumnWidth,widenReportColumns} from './reportExcelCellFormatting';

type Location={sheet:string;row:number};
export type ReportManifest=Record<string,Location>;
export type ReorderedMonth={bytes:Uint8Array;rowNumber:number;moves:Record<string,number>;changed:boolean;reason?:string};
type DatedRow={row:number;date:string;id?:string};
const ROW=/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
const CELL=/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const MONTH=/^(?:[1-9]|1[0-2])월$/;
const MAX_ROWS=1000;

function sheetPath(entries:Record<string,Uint8Array>,month:string){
 const p=new DOMParser(),book=p.parseFromString(strFromU8(entries['xl/workbook.xml']),'application/xml');
 const rel=p.parseFromString(strFromU8(entries['xl/_rels/workbook.xml.rels']),'application/xml');
 const id=Array.from(book.getElementsByTagName('sheet')).find(x=>x.getAttribute('name')===month)?.getAttribute('r:id');
 const target=Array.from(rel.getElementsByTagName('Relationship')).find(x=>x.getAttribute('Id')===id)?.getAttribute('Target');
 if(!target||target.includes('..')||target.includes('\\'))throw Error('월별 시트 경로가 올바르지 않습니다.');
 return target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
}
function isoDate(y:number,m:number,d:number):string|null{
 if(y<2000||y>2099||m<1||m>12||d<1||d>31)return null;
 const date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==m||date.getUTCDate()!==d)return null;
 return date.toISOString().slice(0,10);
}
function reportDate(raw:string|number,year:number,date1904:boolean):string|null{
 if(typeof raw==='number'){
  if(!Number.isFinite(raw))return null;
  const base=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
  const date=new Date(base+Math.floor(raw)*86400000);
  return Number.isFinite(date.getTime())?isoDate(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate()):null;
 }
 const text=String(raw||'').trim();
 if(/[~～]/.test(text))return null; // Date ranges cannot be placed on a single day.
 let m=text.match(/^(\d{4})\s*(?:년|[-./])\s*(\d{1,2})\s*(?:월|[-./])\s*(\d{1,2})(?:일)?(?!\d)/);
 if(m)return isoDate(Number(m[1]),Number(m[2]),Number(m[3]));
 m=text.match(/^(\d{1,2})\s*(?:월|[-./])\s*(\d{1,2})(?:일)?(?!\d)/);
 return m?isoDate(year,Number(m[1]),Number(m[2])):null;
}
function rowInfo(xml:string){
 const open=xml.match(/^<row\b[^>]*>/)?.[0];
 if(!open)return null;
 const body=xml.endsWith('/>')?'':xml.slice(open.length,-6);
 // Formulas, custom row children or inline references are not safe to relocate.
 if(body.replace(CELL,'').trim()!=='')return null;
 return {open,body};
}
function moveRow(xml:string,to:number):string|null{
 const info=rowInfo(xml);if(!info)return null;
 const head=info.open.replace(/\br="(\d+)"/,'r="'+to+'"');
 if(head===info.open&&!new RegExp('\\br="'+to+'"').test(head))return null;
 const body=info.body.replace(/(<c\b[^>]*?\br=")([A-Z]{1,3})(\d+)(")/g,(_all,prefix:string,col:string,_row:string,suffix:string)=>prefix+col+to+suffix);
 return head+body+'</row>';
}
/** Date-sort manual and imported data together, without moving formula or merged rows.
 * Full row XML travels with the record (including M:... values and row formatting).
 * Report UUID position changes are committed in the same workbook CAS transaction.
 */
export function organizeManagedMonth(bytes:Uint8Array,month:string,year:number,manifest:ReportManifest,
 incoming?:{row:number;date:string}):ReorderedMonth{
 if(!MONTH.test(month)||!Number.isInteger(year))throw Error('정렬할 월별 시트를 확인해 주세요.');
 const wb=workbookFromFile(bytes),sheet=wb.Sheets[month];
 if(!sheet)throw Error('정렬할 월별 시트가 없습니다.');
 const unchanged=(reason:string):ReorderedMonth=>({bytes,rowNumber:incoming?.row??0,moves:{},changed:false,reason});
 const entries=unzipSync(bytes),path=sheetPath(entries,month),source=strFromU8(entries[path]||new Uint8Array());
 if(Object.keys(entries).some(k=>/_xmlsignatures\//i.test(k)))return unchanged('서명된 Excel은 안전하게 행을 이동할 수 없습니다.');
 if(/<(?:tableParts|pivotTableParts|hyperlinks|drawing|legacyDrawing|conditionalFormatting|dataValidations|autoFilter|sheetProtection|extLst)\b/.test(source))
  return unchanged('외부 연결·특수 서식이 있는 시트는 수기 행 이동을 지원하지 않습니다.');
 const block=source.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
 if(!block||block[1].replace(ROW,'').trim())return unchanged('표준 Excel 행 구조가 아닙니다.');
 const rowMap=new Map<number,string>();
 for(const match of block[1].matchAll(ROW)){
  const r=Number(match[0].match(/^<row\b[^>]*\br="(\d+)"/)?.[1]);
  if(!Number.isInteger(r)||r<1||rowMap.has(r))return unchanged('행 번호가 중복되거나 올바르지 않습니다.');
  rowMap.set(r,match[0]);
 }
 const protectedRows=new Set<number>();
 for(const m of sheet.merges)for(let row=m.s.r+1;row<=m.e.r+1;row++)protectedRows.add(row);
 for(const [row,xml] of rowMap){
  if(/<f(?:\s|>)/.test(xml))protectedRows.add(row);
  if(!rowInfo(xml))protectedRows.add(row);
 }
 const ids=new Map<number,string>();
 for(const [id,where] of Object.entries(manifest||{})){
  if(where?.sheet!==month)continue;
  if(!Number.isInteger(where.row)||where.row<2||ids.has(where.row))
   return unchanged('자동 보고서의 행 위치가 일치하지 않습니다.');
  ids.set(where.row,id);
 }
 if(incoming){
  if(!Number.isInteger(incoming.row)||incoming.row<2||ids.has(incoming.row))
   return unchanged('새 운행보고의 행 위치가 중복되었습니다.');
  ids.set(incoming.row,'__incoming__');
 }
 const active=new Map<number,Set<string>>();
 for(const [address,cell] of Object.entries(sheet.cells)){
  const m=address.match(/^([A-Z]{1,3})(\d+)$/);
  if(!m||Number(m[2])<2||cell.v===undefined||cell.v===null||String(cell.v)==='')continue;
  const row=Number(m[2]);
  if(!active.has(row))active.set(row,new Set());
  active.get(row)!.add(m[1]);
 }
 const records:DatedRow[]=[];
 const yearMonth=Number(month.slice(0,-1));
 for(const row of new Set([...active.keys(),...ids.keys()])){
  const columns=active.get(row)||new Set<string>();
  const managed=ids.get(row);
  if(protectedRows.has(row)){
   if(managed)return unchanged(row+'행에 수식 또는 병합된 셀이 있어 자동 보고를 이동할 수 없습니다.');
   continue;
  }
  const hasData=managed||[...columns].some(col=>col.length===1&&col>='A'&&col<='L');
  if(!hasData){protectedRows.add(row);continue;}
  const raw=sheet.cells['A'+row]?.v??'';
  const date=reportDate(raw,year,wb.date1904);
  if(!date||!date.startsWith(year+'-'+String(yearMonth).padStart(2,'0')+'-'))
   return unchanged(row+'행의 수기 기록 날짜를 확인할 수 없습니다. 원본은 변경하지 않았습니다.');
  if(incoming?.row===row&&incoming.date!==date)
   return unchanged('새 보고의 날짜와 실제 Excel 날짜가 일치하지 않습니다.');
  if(!rowMap.has(row))return unchanged(row+'행의 Excel 내용을 찾을 수 없습니다.');
  records.push({row,date,id:managed});
 }
 if(records.length===0)return unchanged('정렬할 날짜 기록이 없습니다.');
 if(records.length>MAX_ROWS)return unchanged('안전을 위해 한 번에 1,000행까지만 정리할 수 있습니다.');
 for(const row of ids.keys())if(!records.some(record=>record.row===row))return unchanged('자동 보고서 위치를 확인하지 못했습니다.');
 const sourceRows=new Set(records.map(record=>record.row));
 // Rows with non-record data, formulas or merges are reserved; never overwrite them.
 const targets:number[]=[];
 for(let row=2;row<=25000&&targets.length<records.length;row++){
  if(protectedRows.has(row))continue;
  if(active.has(row)&&!sourceRows.has(row))continue;
  targets.push(row);
 }
 if(targets.length!==records.length)return unchanged('안전하게 기록을 옮길 빈 행이 부족합니다.');
 const sorted=records.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.row-b.row);
 const moves:Record<string,number>={};
 let incomingRow=incoming?.row??0,positionChanged=false;
 const replacement=new Map<number,string>();
 for(let i=0;i<sorted.length;i++){
  const item=sorted[i],dest=targets[i],xml=rowMap.get(item.row);
  if(!xml)return unchanged('이동할 원본 행이 없습니다.');
  const moved=moveRow(xml,dest);
  if(!moved)return unchanged(item.row+'행의 특수 셀 때문에 이동할 수 없습니다.');
  replacement.set(dest,moved);
  if(item.row!==dest){
   positionChanged=true;
   if(item.id&&item.id!=='__incoming__')moves[item.id]=dest;
  }
  if(item.id==='__incoming__')incomingRow=dest;
 }
 const touched=new Set([...sourceRows,...targets]);
 const finalRows=new Map(rowMap);
 for(const row of touched){
  if(replacement.has(row))finalRows.set(row,replacement.get(row)!);
  else finalRows.set(row,'<row r="'+row+'"/>');
 }
 const rowsXml=[...finalRows.entries()].sort((a,b)=>a[0]-b[0]).map(([,xml])=>xml).join('');
 let changedSource=positionChanged?source.replace(block[0],block[0].replace(block[1],rowsXml)):source;
 // The full G column (including historical rows) determines the downloaded width.
 const routes=Object.entries(sheet.cells).filter(([address])=>/^G[1-9]\d*$/.test(address))
  .map(([,cell])=>String(cell.v??''));
 const fitted=widenReportColumns(changedSource,routeColumnWidth(routes));
 const changed=positionChanged||fitted!==source;
 if(!changed)return {bytes,rowNumber:incomingRow,moves:{},changed:false,reason:'이미 날짜순으로 정리돼 있습니다.'};
 changedSource=fitted;
 entries[path]=strToU8(changedSource);
 const output=zipSync(entries,{level:6});
 workbookFromFile(output); // Never return a corrupt archive.
 return {bytes:output,rowNumber:incomingRow,moves,changed:true};
}
