import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {workbookFromFile} from './kakaoExcelWorkbook';

type Location={sheet:string;row:number};
export type ReportManifest=Record<string,Location>;
export type ReorderedMonth={bytes:Uint8Array;rowNumber:number; moves:Record<string,number>;changed:boolean;reason?:string};
const rowMatcher=/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g;
const cellMatcher=/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g;
const validMonth=/^(?:[1-9]|1[0-2])월$/;
function sheetPath(entries:Record<string,Uint8Array>,month:string){
 const p=new DOMParser(),book=p.parseFromString(strFromU8(entries['xl/workbook.xml']),'application/xml');
 const rel=p.parseFromString(strFromU8(entries['xl/_rels/workbook.xml.rels']),'application/xml');
 const id=Array.from(book.getElementsByTagName('sheet')).find(x=>x.getAttribute('name')===month)?.getAttribute('r:id');
 const target=Array.from(rel.getElementsByTagName('Relationship')).find(x=>x.getAttribute('Id')===id)?.getAttribute('Target');
 if(!target||target.includes('..')||target.includes('\\'))throw Error('월별 시트 경로가 올바르지 않습니다.');
 return target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
}
function reportDate(raw:string|number,year:number,date1904:boolean):string|null{
 if(typeof raw==='number'){
  const base=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
  const value=new Date(base+raw*86400000);
  return Number.isFinite(value.getTime())?value.toISOString().slice(0,10):null;
 }
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
 const m=raw.match(/^(\d{1,2})\/(\d{1,2})$/);
 return m?year+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'):null;
}
/** Reorders ONLY A-L cells owned by managed report IDs; all legacy rows and formulas stay put.
 * The caller commits row-number moves atomically with the new Excel version.
 */
export function organizeManagedMonth(bytes:Uint8Array,month:string,year:number,manifest:ReportManifest,
 incoming?:{row:number;date:string}):ReorderedMonth{
 if(!validMonth.test(month)||!Number.isInteger(year))throw Error('정렬할 월별 시트를 확인해 주세요.');
 const wb=workbookFromFile(bytes),sheet=wb.Sheets[month];
 if(!sheet)throw Error('정렬할 월별 시트가 없습니다.');
 const rows=Object.entries(manifest||{}).filter(([,v])=>v?.sheet===month&&Number.isInteger(v.row)&&v.row>=2)
  .map(([id,v])=>({id,row:v.row,date:reportDate(sheet.cells['A'+v.row]?.v??'',year,wb.date1904)}));
 if(incoming)rows.push({id:'__incoming__',row:incoming.row,date:incoming.date});
 const unchanged=(reason:string):ReorderedMonth=>({bytes,rowNumber:incoming?.row??0,moves:{},changed:false,reason});
 if(!rows.length)return unchanged('정렬할 보고가 없습니다.');
 if(rows.length>1000)return unchanged('안전을 위해 한 번에 1,000행까지만 정리할 수 있습니다.');
 if(rows.some(r=>!r.date||!r.date.startsWith(year+'-')||Number(r.date.slice(5,7))!==Number(month.replace('월',''))))return unchanged('날짜를 확인할 수 없는 기록이 있어 이동하지 않았습니다.');
 const positions=new Set(rows.map(v=>v.row));
 if(positions.size!==rows.length)return unchanged('기존 행 번호가 중복되어 이동하지 않았습니다.');
 const targets=rows.map((_,i)=>i+2);
 const entries=unzipSync(bytes),path=sheetPath(entries,month),source=strFromU8(entries[path]);
 if(Object.keys(entries).some(k=>/_xmlsignatures\//i.test(k)))return unchanged('서명된 Excel은 이동하지 않습니다.');
 // Do not reorder any sheet containing historic rows not managed by this feature.
 for(const [address,cell] of Object.entries(sheet.cells)){
  const m=address.match(/^([A-L])(\d+)$/);
  if(m&&Number(m[2])>1&&!positions.has(Number(m[2]))&&String(cell.v??'')!==''){
   const content=source.match(new RegExp('<c\\b(?=[^>]*\\br="'+address+'")[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)'))?.[0]||'';
   if(!/<f(?:\s|>)/.test(content))return unchanged('기존 수기 기록이 있어 자동으로 행을 옮기지 않았습니다.');
  }
 }
 const merged=[...source.matchAll(/<mergeCell\b[^>]*\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)];
 const touches=new Set([...positions,...targets]);
 for(const [,a,s,b,e] of merged){
  if((a<='L'||b<='L')&&[...touches].some(r=>r>=Number(s)&&r<=Number(e)))return unchanged('병합 셀 구간은 자동 이동하지 않았습니다.');
 }
 const segment=source.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/);
 if(!segment)return unchanged('표준 Excel 데이터 영역이 아닙니다.');
 const pieces=[...segment[1].matchAll(rowMatcher)],unparsed=segment[1].replace(rowMatcher,'').trim();
 if(unparsed)return unchanged('특수 행 구조가 있어 정렬하지 않았습니다.');
 const rowMap=new Map<number,string>();
 for(const match of pieces){
  const id=Number(match[0].match(/\br="(\d+)"/)?.[1]);
  if(!Number.isInteger(id)||id<1||rowMap.has(id))return unchanged('행 번호가 일치하지 않습니다.');
  rowMap.set(id,match[0]);
 }
 const payload=new Map<number,string>();
 for(const item of rows){
  const existing=rowMap.get(item.row);
  if(!existing)return unchanged('일부 적재 행이 존재하지 않습니다.');
  const cells=(existing.match(cellMatcher)||[]).filter(c=>/\br="[A-L]\d+"/.test(c));
  if(cells.some(c=>/<f(?:\s|>)/.test(c)))return unchanged('수식 셀이 포함된 행을 이동하지 않았습니다.');
  payload.set(item.row,cells.join(''));
 }
 for(const dest of targets){
  const existing=rowMap.get(dest);
  const contents=(existing?.match(cellMatcher)||[]).filter(c=>/\br="[A-L]\d+"/.test(c));
  if(contents.some(c=>/<f(?:\s|>)/.test(c)))return unchanged('합계 수식이 있는 행을 이동하지 않았습니다.');
 }
 const sorted=rows.slice().sort((a,b)=>a.date!.localeCompare(b.date!)||a.row-b.row);
 const moved:Record<string,number>={};let newRow=incoming?.row??0;
 for(const [idx,item] of sorted.entries()){
  const dest=idx+2;
  if(item.id==='__incoming__')newRow=dest;
  else if(item.row!==dest)moved[item.id]=dest;
 }
 if(!Object.keys(moved).length&&(!incoming||newRow===incoming.row))return unchanged('이미 날짜순으로 정리돼 있습니다.');
 const replacementCells=new Map<number,string>();
 for(const [idx,item] of sorted.entries()){
  const dest=idx+2;
  replacementCells.set(dest,(payload.get(item.row)||'').replace(/\br="([A-L])\d+"/g,(_s,col:string)=>'r="'+col+dest+'"'));
 }
 for(const n of touches){
  const old=rowMap.get(n)||'<row r="'+n+'"></row>';
  const opening=old.match(/^<row\b[^>]*>/)?.[0]||'<row r="'+n+'">';
  const body=old.endsWith('/>')?'':old.slice(opening.length,-6);
  const kept=body.replace(cellMatcher,m=>/\br="[A-L]\d+"/.test(m)?'':m);
  rowMap.set(n,opening+kept+(replacementCells.get(n)||'')+'</row>');
 }
 const replaced=source.replace(segment[0],segment[0].replace(segment[1],
  [...rowMap.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v).join('')));
 entries[path]=strToU8(replaced);
 const output=zipSync(entries,{level:6});workbookFromFile(output);
 return {bytes:output,rowNumber:newRow,moves:moved,changed:true};
}
