import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {workbookFromFile} from './kakaoExcelWorkbook';

/**
 * The company report's A–L layout is permanently reserved for automatic
 * reporting. HQ can add manual rows in genuinely empty physical slots and
 * add custom columns to the RIGHT of L without shifting report references.
 *
 * All edits are made to the OOXML worksheet member only, leaving other XLSX
 * members, historic versions, formulas and customer formatting untouched.
 */
export const MANUAL_ROW_HEIGHT='22.17';
export const EXTRA_COLUMN_LETTERS='MNOPQRSTUVWXYZ';
export const MAX_MANAGED_ROW=25000;
const ROW_XML=/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
const CELL_XML=/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const XML_UNSAFE=/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const escapeXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const alphaIndex=(value:string)=>[...value].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
const code=(index:number)=>{let n=index,out='';while(n>0){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26);}return out;};
const monthName=(month:string)=>/^(?:[1-9]|1[0-2])월$/.test(month);
const cellColumn=(address:string)=>address.match(/^([A-Z]+)[1-9]\d*$/)?.[1]||'';
const rowNumber=(xml:string)=>Number(xml.match(/^<row\b[^>]*\br="(\d+)"/)?.[1]||0);
const sheetXmlPath=(entries:Record<string,Uint8Array>,month:string)=>{
 const parser=new DOMParser();
 const wb=parser.parseFromString(strFromU8(entries['xl/workbook.xml']),'application/xml');
 const rel=parser.parseFromString(strFromU8(entries['xl/_rels/workbook.xml.rels']),'application/xml');
 const id=Array.from(wb.getElementsByTagName('sheet')).find(x=>x.getAttribute('name')===month)?.getAttribute('r:id');
 const target=Array.from(rel.getElementsByTagName('Relationship')).find(x=>x.getAttribute('Id')===id)?.getAttribute('Target');
 if(!target||/\.\.|\\/.test(target))throw new Error('Excel 시트 경로를 확인해 주세요.');
 const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
 if(!entries[path])throw new Error('시트 원본을 찾지 못했습니다.');
 return path;
};
function safeWorksheet(entries:Record<string,Uint8Array>,month:string){
 if(!monthName(month))throw new Error('월별 Excel 시트를 선택해 주세요.');
 if(Object.keys(entries).some(x=>/_xmlsignatures\//i.test(x)))throw new Error('전자서명된 Excel은 웹에서 구조를 수정할 수 없습니다.');
 const path=sheetXmlPath(entries,month),source=strFromU8(entries[path]);
 // Simple monthly worksheets only. Rich Excel structures need an Excel-native
 // structural update, not a partial XML rewrite that could corrupt references.
 if(/<(?:sheetProtection|tableParts|pivotTableParts|drawing|legacyDrawing|hyperlinks|dataValidations|conditionalFormatting|extLst)\b/i.test(source))
  throw new Error('보호된 시트·표·외부 연결이 포함된 월별 시트는 안전하게 행·열을 추가할 수 없습니다. 원본 양식을 확인해 주세요.');
 if(/<(?:\w+:)?sheetData\b/.test(source) && !/<sheetData\b[^>]*>/.test(source))
  throw new Error('특수 형식의 Excel 시트는 구조를 수정할 수 없습니다.');
 const part=source.match(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/)?.[0];
 if(!part)throw new Error('Excel 시트의 행 구조를 확인할 수 없습니다.');
 const fragments=part.match(ROW_XML)||[];
 if(part.replace(/<sheetData\b[^>]*>/,'').replace(/<\/sheetData>/,'').replace(ROW_XML,'').trim())
  throw new Error('시트에 지원하지 않는 행 XML이 있습니다.');
 const ids=fragments.map(rowNumber);
 if(ids.some(n=>!Number.isInteger(n)||n<1)||new Set(ids).size!==ids.length||ids.some((n,i)=>i>0&&n<=ids[i-1]))
  throw new Error('행 순서가 올바르지 않아 자동 수정할 수 없습니다.');
 return {path,source,part,fragments};
}
function dimension(source:string,row:number,col:number){
 return source.replace(/<dimension\b[^>]*\bref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"[^>]*\/>/,all=>{
  const range=all.match(/\bref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"/);
  if(!range)return all;
  const lastCol=range[3]||range[1],lastRow=Number(range[4]||range[2]);
  const updated=code(Math.max(alphaIndex(lastCol),col))+Math.max(lastRow,row);
  return all.replace(range[0],'ref="'+range[1]+range[2]+':'+updated+'"');
 });
}
export function isManualRowXml(row:string){
 return /\bcustomHeight="1"/.test(row) && /\bht="22\.17"/.test(row);
}
export function visibleWorkbookColumns(cells:Record<string,{v:string|number}>) {
 let highest=12;
 for(const [addr,cell] of Object.entries(cells)){
  const col=cellColumn(addr),index=alphaIndex(col);
  if(index>12&&index<=26&&String(cell.v??'').trim())highest=Math.max(highest,index);
 }
 return Array.from({length:highest},(_,i)=>code(i+1));
}
export function appendManualWorkbookRow(bytes:Uint8Array,month:string){
 const wb=workbookFromFile(bytes),sheet=wb.Sheets[month];
 if(!sheet)throw new Error('선택한 월 시트가 없습니다.');
 const entries=unzipSync(bytes),{path,source,part,fragments}=safeWorksheet(entries,month);
 const rowMap=new Map(fragments.map(xml=>[rowNumber(xml),xml] as const));
 const used=new Set<number>();
 let lastReport=1;
 for(const [addr,cell] of Object.entries(sheet.cells)){
  const m=addr.match(/^([A-Z]+)(\d+)$/);
  if(!m)continue;
  const row=Number(m[2]),col=m[1];
  if(row<2||row>MAX_MANAGED_ROW)continue;
  if(String(cell.v??'').trim())used.add(row);
  if(['D','E'].includes(col)&&String(cell.v??'').trim())lastReport=Math.max(lastReport,row);
 }
 // Preserve prior manually added blank rows, even before any cells are filled.
 for(const [r,xml] of rowMap)if(isManualRowXml(xml)){used.add(r);lastReport=Math.max(lastReport,r);}
 const merged=sheet.merges;
 let row=lastReport+1;
 while(row<=MAX_MANAGED_ROW){
  const mergedHere=merged.some(m=>row>=m.s.r+1&&row<=m.e.r+1);
  const xml=rowMap.get(row);
  if(!used.has(row)&&!mergedHere&&!/<f(?:\s|>)/.test(xml||''))break;
  row++;
 }
 if(row>MAX_MANAGED_ROW)throw new Error('추가 가능한 빈 행이 없습니다. 월별 시트를 확인해 주세요.');
 const old=rowMap.get(row),marker=' ht="'+MANUAL_ROW_HEIGHT+'" customHeight="1"';
 let revised:string;
 if(old){
  revised=old.replace(/^(<row\b[^>]*?)(\s*\/?>)/,open=>{
   return open.replace(/\s(?:ht|customHeight)="[^"]*"/g,'').replace(/\s*\/?>$/,ending=>marker+ending);
  });
  if(revised===old)throw new Error('빈 행 스타일을 적용할 수 없습니다.');
 }else revised='<row r="'+row+'"'+marker+'/>';
 let nextPart=part;
 if(old)nextPart=part.replace(old,revised);
 else{
  const later=fragments.find(xml=>rowNumber(xml)>row);
  nextPart=later?part.replace(later,revised+later):part.replace('</sheetData>',revised+'</sheetData>');
 }
 let changed=source.replace(part,nextPart);
 changed=dimension(changed,row,Math.max(12,sheet.ref.e.c+1));
 entries[path]=strToU8(changed);
 const output=zipSync(entries,{level:6});
 workbookFromFile(output);
 return {bytes:output,rowNumber:row};
}
export function appendManualWorkbookColumn(bytes:Uint8Array,month:string,label:string){
 const trimmed=label.trim();
 if(!trimmed||trimmed.length>60||XML_UNSAFE.test(trimmed)||/^[=+@]/.test(trimmed))
  throw new Error('열 이름은 1~60자로 입력해 주세요.');
 const wb=workbookFromFile(bytes),sheet=wb.Sheets[month];
 if(!sheet)throw new Error('선택한 월 시트가 없습니다.');
 const current=visibleWorkbookColumns(sheet.cells);
 for(const col of current){
  if(col.charCodeAt(0)>76 && String(sheet.cells[col+'1']?.v??'').trim()===trimmed)
   throw new Error('이미 사용 중인 열 이름입니다.');
 }
 const next=code(current.length+1);
 if(!EXTRA_COLUMN_LETTERS.includes(next)||next.length!==1)
  throw new Error('웹 편집의 사용자 추가 열은 Z열까지 지원합니다.');
 const entries=unzipSync(bytes),{path,source,part,fragments}=safeWorksheet(entries,month);
 let row=fragments.find(xml=>rowNumber(xml)===1);
 const formatted=escapeXml(trimmed);
 // Reuse preformatted, but empty, header cells where present.
 let added='<c r="'+next+'1" t="inlineStr"><is><t xml:space="preserve">'+formatted+'</t></is></c>';
 if(row){
  const cells=row.match(CELL_XML)||[];
  const existing=cells.find(x=>new RegExp('\\br="'+next+'1"').test(x));
  if(existing){
   if(/<f(?:\s|>)/.test(existing)||String(sheet.cells[next+'1']?.v??'').trim())
    throw new Error('추가하려는 열에 기존 데이터가 있습니다.');
   const style=existing.match(/\bs="(\d+)"/)?.[1];
   if(style)added=added.replace(' r="'+next+'1"',' r="'+next+'1" s="'+style+'"');
   row=row.replace(existing,added);
  }else{
   const later=cells.find(cell=>alphaIndex(cell.match(/\br="([A-Z]+)\d+"/)?.[1]||'')>alphaIndex(next));
   if(row.endsWith('/>'))row=row.replace(/\/>$/,'>'+added+'</row>');
   else row=later?row.replace(later,added+later):row.replace('</row>',added+'</row>');
  }
 }else row='<row r="1">'+added+'</row>';
 let nextPart=part;
 const old=fragments.find(xml=>rowNumber(xml)===1);
 if(old)nextPart=part.replace(old,row);
 else nextPart=part.replace(/(<sheetData\b[^>]*>)/,'$1'+row);
 let changed=source.replace(part,nextPart);
 changed=dimension(changed,Math.max(1,sheet.ref.e.r+1),alphaIndex(next));
 entries[path]=strToU8(changed);
 const output=zipSync(entries,{level:6});
 workbookFromFile(output);
 return {bytes:output,column:next,label:trimmed};
}
