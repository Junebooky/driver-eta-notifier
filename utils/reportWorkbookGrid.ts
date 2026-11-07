import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {workbookFromFile} from './kakaoExcelWorkbook';
import {widenReportColumns,routeColumnWidth} from './reportExcelCellFormatting';

const MAX_VALUE=2400;
const COLS='ABCDEFGHIJKL';
const rowExpression=(row:number)=>new RegExp('<row\\b(?=[^>]*\\br="'+row+'")[^>]*?(?:/>|>[\\s\\S]*?<\\/row>)');
const cellExpression=(name:string)=>new RegExp('<c\\b(?=[^>]*\\br="'+name+'")[^>]*?(?:/>|>[\\s\\S]*?<\\/c>)');
const xml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function sheetEntry(entries:Record<string,Uint8Array>,sheet:string){
 const parser=new DOMParser();
 const book=parser.parseFromString(strFromU8(entries['xl/workbook.xml']),'application/xml');
 const rels=parser.parseFromString(strFromU8(entries['xl/_rels/workbook.xml.rels']),'application/xml');
 const id=Array.from(book.getElementsByTagName('sheet')).find(n=>n.getAttribute('name')===sheet)?.getAttribute('r:id');
 const path=Array.from(rels.getElementsByTagName('Relationship')).find(r=>r.getAttribute('Id')===id)?.getAttribute('Target');
 if(!path||path.includes('..')||path.includes('\\'))throw new Error('시트 위치를 확인해 주세요.');
 const full=path.startsWith('/')?path.slice(1):'xl/'+path.replace(/^\.\//,'');
 if(!entries[full])throw new Error('Excel 시트를 찾지 못했습니다.');
 return full;
}
export const excelCellColumn=(col:string)=>COLS.includes(col)&&col.length===1;
export type WorkbookViewRow={row:number;cells:string[];locked:string[]};
export function readWorkbookGrid(bytes:Uint8Array,month:string,limit=300,offset=0,focusRow?:number){
 if(!/^(?:[1-9]|1[0-2])월$/.test(month))throw new Error('월별 시트를 선택해 주세요.');
 const book=workbookFromFile(bytes),sheet=book.Sheets[month];
 if(!sheet)throw new Error('선택한 월 시트가 없습니다.');
 const entries=unzipSync(bytes),path=sheetEntry(entries,month),source=strFromU8(entries[path]);
 const parsed=new DOMParser().parseFromString(source,'application/xml');
 const formulas=new Set(Array.from(parsed.getElementsByTagName('c')).filter(c=>c.getElementsByTagName('f').length>0).map(c=>c.getAttribute('r')||''));
 const rowIds=[...new Set(Object.keys(sheet.cells).map(address=>Number(address.match(/\d+$/)?.[0])).filter(n=>n>=2&&Number.isInteger(n)))].sort((a,b)=>a-b);
 const live=rowIds.filter(n=>COLS.split('').some(col=>{
  const v=sheet.cells[col+n]?.v;
  return formulas.has(col+n)||v!==undefined&&v!==null&&String(v)!=='';
 }));
 if(focusRow!==undefined){
  if(!Number.isInteger(focusRow)||focusRow<2||focusRow>25000)throw new Error('이동할 Excel 행을 확인해 주세요.');
  const target=live.indexOf(focusRow);
  if(target<0)throw new Error('선택한 보고가 현재 Excel 행에 없습니다. 운행보고 상태를 새로고침해 주세요.');
  offset=Math.floor(target/limit)*limit;
 }
 const rows:WorkbookViewRow[]=live.slice(offset,offset+limit).map(row=>({
  row,cells:COLS.split('').map(col=>{const value=sheet.cells[col+row]?.v;if(col==='A'&&typeof value==='number'&&value>20000&&value<100000){return new Date((book.date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30))+value*86400000).toISOString().slice(0,10);}return String(value??'');}),
  locked:COLS.split('').filter(col=>formulas.has(col+row))
 }));
 return {months:book.SheetNames.filter(m=>/^(?:[1-9]|1[0-2])월$/.test(m)),month,rows,total:live.length,offset,limit,columns:COLS.split('')};
}
export function patchWorkbookCell(bytes:Uint8Array,month:string,row:number,col:string,value:string){
 if(!/^(?:[1-9]|1[0-2])월$/.test(month)||!excelCellColumn(col)||!Number.isInteger(row)||row<2||row>25000)throw new Error('편집할 셀 위치를 확인해 주세요.');
 if(typeof value!=='string'||value.length>MAX_VALUE||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))throw new Error('셀 값을 확인해 주세요.');
 const trimmed=value.trim();
 if(/^([=@+]|-($|[^0-9]))/.test(trimmed))throw new Error('Excel 수식이나 명령은 직접 입력할 수 없습니다.');
 if(col==='A'&&!/^\d{4}-\d{2}-\d{2}$/.test(trimmed))throw new Error('날짜는 2026-11-04 형식으로 입력해 주세요.');
 const book=workbookFromFile(bytes);
 if(!book.Sheets[month])throw new Error('해당 월 시트가 없습니다.');
 if(col==='A'){
  const d=new Date(trimmed+'T00:00:00Z');
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==trimmed||Number(trimmed.slice(5,7))!==Number(month.replace('월','')))throw new Error('동일한 월의 올바른 날짜만 입력할 수 있습니다.');
 }
 if(['J','L'].includes(col)&&trimmed!==''&&!/^\d+(?:\.\d{1,2})?$/.test(trimmed.replace(/,/g,'')))throw new Error('금액은 숫자로 입력해 주세요.');
 const entries=unzipSync(bytes),path=sheetEntry(entries,month),source=strFromU8(entries[path]);
 if(/_xmlsignatures\//i.test(Object.keys(entries).join('|')))throw new Error('전자서명된 장부는 직접 수정할 수 없습니다.');
 const parsed=new DOMParser().parseFromString(source,'application/xml');
 for(const m of Array.from(parsed.getElementsByTagName('mergeCell'))){
  const range=m.getAttribute('ref')||'';const x=range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if(x&&row>=Number(x[2])&&row<=Number(x[4])&&col>=x[1]&&col<=x[3])throw new Error('병합된 셀은 직접 수정할 수 없습니다.');
 }
 const original=source.match(rowExpression(row))?.[0];
 if(!original||!COLS.split('').some(c=>String(book.Sheets[month].cells[c+row]?.v??'')!==''))throw new Error('기존 데이터가 있는 행만 편집할 수 있습니다.');
 const address=col+row,existing=original.match(cellExpression(address))?.[0];
 if(existing&&/<f(?:\s|>)/.test(existing))throw new Error('수식이 포함된 셀은 수정할 수 없습니다.');
 const oldValue=String(book.Sheets[month].cells[address]?.v??'');
 if(oldValue===trimmed)return {bytes,oldValue,value:trimmed,changed:false};
 const s=existing?.match(/\bs="(\d+)"/)?.[1];
 let renderValue=trimmed;
 let numeric=['J','L'].includes(col)&&trimmed!=='';
 if(col==='A'&&existing&&!/t="(inlineStr|s|str|d)"/.test(existing)){
  const base=book.date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
  renderValue=String(Math.round((Date.parse(trimmed+'T00:00:00Z')-base)/86400000));numeric=true;
 }
 const attrs=' r="'+address+'"'+(s?' s="'+s+'"':'');
 const newCell=trimmed===''?'<c'+attrs+'/>':numeric?
  '<c'+attrs+'><v>'+renderValue.replace(/,/g,'')+'</v></c>':
  '<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+xml(trimmed)+'</t></is></c>';
 const revisedRow=existing?original.replace(existing,newCell):original.replace(/<\/row>$/,newCell+'</row>');
 if(revisedRow===original)throw new Error('셀 값을 변경하지 못했습니다.');
 let changedSource=source.replace(original,revisedRow);
 if(col==='G'){
  const routes=Object.entries(book.Sheets[month].cells).filter(([address])=>/^G[1-9]\d*$/.test(address)&&address!==col+row).map(([,cell])=>String(cell.v??''));
  changedSource=widenReportColumns(changedSource,routeColumnWidth([...routes,trimmed]));
 }
 entries[path]=strToU8(changedSource);
 const output=zipSync(entries,{level:6});workbookFromFile(output);
 return {bytes:output,oldValue,value:trimmed,changed:true};
}
