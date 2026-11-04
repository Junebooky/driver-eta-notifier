import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { normalizedPlate, validateKakaoExcelDraft, type KakaoExcelDraft } from '@/utils/kakaoExcelImport';
import {reportRowCellStyles,widenReportColumns,reportRowHeight,routeColumnWidth} from '@/utils/reportExcelCellFormatting';

const MAX_BYTES = 12 * 1024 * 1024;
export interface KakaoWorkbookResult { bytes: Uint8Array; sheetName: string; rowNumber: number; createdMonth: boolean }
type Cell = {v: string | number; z?: string};
type Point = {r:number;c:number};
type Range = {s:Point;e:Point};
type Sheet = {cells:Record<string,Cell>; ref:Range; merges:Range[]};
type Workbook = {SheetNames:string[]; Sheets:Record<string,Sheet>; date1904:boolean};
function colName(i:number):string { let s=''; for (i++;i;i=Math.floor((i-1)/26)) s=String.fromCharCode(65+(i-1)%26)+s; return s; }
function point(a:string):Point {
  const m=a.match(/^([A-Z]+)([1-9]\d*)$/); if (!m) throw new Error('셀 주소가 올바르지 않습니다.');
  return {r:Number(m[2])-1,c:[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1};
}
function range(a:string):Range { const [s,e]=a.split(':'); return {s:point(s),e:point(e||s)}; }
function rangeName(r:Range) { return colName(r.s.c)+(r.s.r+1)+':'+colName(r.e.c)+(r.e.r+1); }
function sheetPath(target:string):string {
  if (!target || /\.\.|\\/.test(target)) throw new Error('시트 경로를 확인할 수 없습니다.');
  return target.startsWith('/') ? target.slice(1) : 'xl/'+target.replace(/^\.\//,'');
}
export function workbookFromFile(bytes: Uint8Array): Workbook {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Excel 파일은 12MB 이하의 .xlsx 파일만 지원합니다.');
  let expanded = 0;
  unzipSync(bytes, {filter: entry => {
    expanded += entry.originalSize;
    if (expanded > 64 * 1024 * 1024) throw new Error('압축 해제 크기가 너무 큽니다.');
    return false;
  }});
  const entries=unzipSync(bytes);
  const read=(path:string) => { if (!entries[path]) throw new Error('Excel 내부 문서가 없습니다: '+path); return document(strFromU8(entries[path])); };
  const book=read('xl/workbook.xml'), rels=Array.from(read('xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship'));
  const shared=entries['xl/sharedStrings.xml'] ? Array.from(read('xl/sharedStrings.xml').getElementsByTagName('si')).map(si=>Array.from(si.getElementsByTagName('t')).map(t=>t.textContent).join('')) : [];
  const styles=entries['xl/styles.xml'] ? read('xl/styles.xml') : null;
  const formats=new Map(Array.from(styles?.getElementsByTagName('numFmt') || []).map(n=>[Number(n.getAttribute('numFmtId')),n.getAttribute('formatCode')||'']));
  const cellStyles=Array.from(styles?.getElementsByTagName('cellXfs')[0]?.getElementsByTagName('xf') || []);
  const wb:Workbook={SheetNames:[],Sheets:{},date1904:['1','true'].includes(book.getElementsByTagName('workbookPr')[0]?.getAttribute('date1904')||'')};
  for (const meta of Array.from(book.getElementsByTagName('sheet'))) {
    const name=meta.getAttribute('name')||'';
    const target=rels.find(r=>r.getAttribute('Id')===meta.getAttribute('r:id'))?.getAttribute('Target')||'';
    const doc=read(sheetPath(target));
    const sheet:Sheet={cells:{},ref:range(doc.getElementsByTagName('dimension')[0]?.getAttribute('ref')||'A1:L1'),merges:Array.from(doc.getElementsByTagName('mergeCell')).map(m=>range(m.getAttribute('ref')||''))};
    for (const c of Array.from(doc.getElementsByTagName('c'))) {
      const addr=c.getAttribute('r')||''; const pos=point(addr);
      sheet.ref.e.r=Math.max(sheet.ref.e.r,pos.r); sheet.ref.e.c=Math.max(sheet.ref.e.c,pos.c);
      const text=c.getElementsByTagName('v')[0]?.textContent ?? '';
      const type=c.getAttribute('t');
      const v=type==='s' ? shared[Number(text)] ?? '' : type==='inlineStr' ? Array.from(c.getElementsByTagName('t')).map(t=>t.textContent).join('') : type==='str' || type==='d' || type==='e' ? text : text!=='' ? Number(text) : '';
      const numFmtId=Number(cellStyles[Number(c.getAttribute('s')||0)]?.getAttribute('numFmtId')||0);
      const z=formats.get(numFmtId) || (numFmtId>=14 && numFmtId<=22 || numFmtId>=45 && numFmtId<=47 ? 'date' : '');
      sheet.cells[addr]={v,z};
    }
    wb.SheetNames.push(name); wb.Sheets[name]=sheet;
  }
  if (!wb.SheetNames.length) throw new Error('Excel 시트가 없는 파일입니다.');
  return wb;
}
const canonicalTime = (v: unknown) => clean(v).replace(/^\d+(?:\.\d+)?\((.*)\)$/,'$1').replace(/(^|~)(\d):/g,'$10$2:');
const clean = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, '').toLowerCase();
const xml = (v: string) => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function document(source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('지원하지 않는 Excel XML입니다.');
  return new DOMParser({onError: () => {throw new Error('Excel XML이 손상되었습니다.');}}).parseFromString(source,'application/xml');
}
function serial(date: string, date1904: boolean) {
  return Math.floor((Date.parse(date+'T00:00:00Z') - Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30))/86400000);
}
function plateParts(v: unknown) { return String(v ?? '').split(/[\/,]/).map(normalizedPlate); }
function samePlate(value: unknown, plate: string) {
  const full = normalizedPlate(plate), last4 = full.slice(-4);
  return plateParts(value).some(p => p === full || /^\d{4}$/.test(p) && p === last4 || /^\d{1,4}$/.test(p) && Number(p) === Number(last4));
}
function sameDate(v: unknown, date: string, date1904: boolean): boolean {
  if (Number(v) === serial(date,date1904) || clean(v) === date) return true;
  const match = String(v ?? '').match(/^(\d{1,2})\/(\d{1,2})(?:~(?:(\d{1,2})\/)?(\d{1,2}))?$/);
  if (!match) return false;
  const [,m,d,em,ed] = match;
  const key = Number(date.slice(5,7))*100+Number(date.slice(8));
  return key >= Number(m)*100+Number(d) && key <= Number(em||m)*100+Number(ed||d);
}
export function appendKakaoExcelReport(bytes: Uint8Array, draft: KakaoExcelDraft): KakaoWorkbookResult {
  const errors = validateKakaoExcelDraft(draft);
  if (errors.length) throw new Error(errors.join(' '));
  const wb = workbookFromFile(bytes), sheetName = Number(draft.date.slice(5,7))+'월';
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(sheetName+' 시트가 없습니다. Excel에서 회사가 승인한 월별 템플릿을 복제한 뒤 다시 열어 주세요. 임의 양식은 생성하지 않습니다.');
  const entries = unzipSync(bytes);
  if (Object.keys(entries).some(n => /_xmlsignatures\//i.test(n))) throw new Error('전자서명된 장부는 수정할 수 없습니다.');
  const workbook = document(strFromU8(entries['xl/workbook.xml']));
  const meta = Array.from(workbook.getElementsByTagName('sheet')).find(s => s.getAttribute('name') === sheetName);
  const relationships = document(strFromU8(entries['xl/_rels/workbook.xml.rels']));
  const target = Array.from(relationships.getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === meta?.getAttribute('r:id'))?.getAttribute('Target');
  if (!target || /\.\.|\\/.test(target)) throw new Error('시트 경로를 확인할 수 없습니다.');
  const path = target.startsWith('/') ? target.slice(1) : 'xl/'+target.replace(/^\.\//,'');
  if (!entries[path]) throw new Error('시트 XML을 찾을 수 없습니다.');
  const source = strFromU8(entries[path]), doc = document(source);
  if (doc.getElementsByTagName('tableParts').length || /<\w+:sheetData/.test(source)) throw new Error('표 또는 특수 시트는 Excel에서 검토해 주세요.');
  const date1904 = wb.date1904;
  const rows = Array.from(doc.getElementsByTagName('row'));
  let last = Math.max(1, sheet.ref.e.r+1);
  for (const row of rows) {
    const r = Number(row.getAttribute('r'));
    if (!Number.isInteger(r) || r < 1) throw new Error('행 번호가 올바르지 않습니다.');
    last = Math.max(last,r);
    if (r === 1) continue;
    const value = (c:string) => sheet.cells[c+r]?.v;
    if (sameDate(value('A'),draft.date,date1904) && samePlate(value('B'),draft.plate) && clean(value('D')) === clean(draft.customer) && clean(value('E')) === clean(draft.driver)) {
      // Nonstandard multi-plate/period/time rows need review rather than a false negative.
      const oldTime = canonicalTime(value('F'));
      const newTime = canonicalTime(draft.time);
      if (oldTime === newTime || /[\/,~]/.test(String(value('A'))) || plateParts(value('B')).length > 1 || !/^\d{2}:\d{2}~\d{2}:\d{2}$/.test(oldTime)) throw new Error('중복 또는 기간·복수 차량의 기존 기록과 겹칩니다. 기존 장부를 확인해 주세요.');
    }
  }
  for (const merge of sheet.merges) last = Math.max(last,merge.e.r+1);
  if (last >= 25000) throw new Error('안전하게 추가할 수 있는 행 범위를 초과했습니다.');
  // A newly generated month is a blank styled template, possibly with footer
  // formulas at row 113 and formatting through row 244. Fill the FIRST blank
  // report row instead of treating those template rows as customer records.
  const hasLiveRecord=Object.entries(sheet.cells).some(([addr,cell])=>{
   if(!/^[A-L](?:[2-9]|[1-9]\d+)$/.test(addr)||String(cell.v??'')==='')return false;
   const found=source.match(new RegExp('<c\\b(?=[^>]*\\br="'+addr+'")[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)'))?.[0]||'';
   return !/<f(?:\s|>)/.test(found);
  });
  const firstRow=rows.find(r=>r.getAttribute('r')==='2');
  const firstHasFormula=firstRow&&Array.from(firstRow.getElementsByTagName('f')).length>0;
  const firstMerged=sheet.merges.some(m=>m.s.r<=1&&m.e.r>=1);
  const rowNumber=!hasLiveRecord&&!firstHasFormula&&!firstMerged?2:last+1;
  // Existing data and formulas are never shifted/overwritten. Managed rows are
  // normalized separately with atomic manifest/DB row-number updates.
  // Reuse only explicit column styles of the last actual data row, never formulas.
  const template = [...rows].reverse().find(r => {
    const n = r.getAttribute('r'); return n !== '1' && String(sheet.cells['B'+n]?.v??'').trim()!=='' && String(sheet.cells['D'+n]?.v??'').trim()!=='';
  }) || rows.find(r=>{const n=r.getAttribute('r');return n!=='1'&&sheet.cells['B'+n]!==undefined&&sheet.cells['D'+n]!==undefined;});
  const styles = new Map<string,string|null>();
  for(const c of Array.from(template?.getElementsByTagName('c') || [])){
    const key=c.getAttribute('r')?.replace(/\d/g,'');if(key)styles.set(key,c.getAttribute('s'));
  }
  const styleIds=reportRowCellStyles(entries,styles);
  const suffix = normalizedPlate(draft.plate).slice(-4);
  const dateStyle = template ? sheet.cells['A'+template.getAttribute('r')]?.z : undefined;
  const dateValue = typeof dateStyle === 'string' && (dateStyle === 'date' || /[ymd]/i.test(dateStyle.replace(/"[^"]*"/g,''))) ? serial(draft.date,date1904) : draft.date;
  const values: (string|number)[] = [dateValue,suffix.startsWith('0') ? suffix : Number(suffix),draft.model,draft.customer,draft.driver,draft.time,draft.route,draft.serviceType,draft.overtime,draft.amount,draft.payment,draft.totalWithVat];
  const cells = values.map((value,i) => {
    if (value === '' && (i<6||i>8)) return '';
    const col = colName(i), attrs = ` r="${col}${rowNumber}" s="${styleIds[i]}"`;
    if (value === '') return `<c${attrs}/>`;
    const numeric = typeof value === 'number' || [8,9,11].includes(i) && /^\d+(?:\.\d+)?$/.test(String(value).replace(/,/g,''));
    return numeric ? `<c${attrs}><v>${String(value).replace(/,/g,'')}</v></c>` : `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
  }).join('');
  const height=reportRowHeight(draft.route,draft.serviceType,draft.overtime);
  let patched:string;
  const oldRow=rows.find(r=>Number(r.getAttribute('r'))===rowNumber);
  const freshRow='<row r="'+rowNumber+'" ht="'+height+'" customHeight="1">'+cells+'</row>';
  if(oldRow){
   const original=source.match(new RegExp('<row\\b(?=[^>]*\\br="'+rowNumber+'")[^>]*?(?:\\/>|>[\\s\\S]*?<\\/row>)'))?.[0];
   if(!original)throw new Error('템플릿 행의 구조를 확인해 주세요.');
   const start=(original.match(/^<row\b[^>]*>/)?.[0]||'<row r="'+rowNumber+'">').replace(/\/>$/, '>');
   const body=original.endsWith('/>')?'':original.slice(start.length,-6);
   if(/<f(?:\s|>)/.test(body))throw new Error('수식이 있는 행에는 자동으로 기록하지 않습니다.');
   const keep=body.replace(/<c\b(?=[^>]*\br="[A-L]\d+")[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,'');
   patched=source.replace(original,start+keep+cells+'</row>');
  }else{
   const next=rows.find(r=>Number(r.getAttribute('r'))>rowNumber);
   const following=next?source.match(new RegExp('<row\\b(?=[^>]*\\br="'+next.getAttribute('r')+'")[^>]*?(?:\\/>|>[\\s\\S]*?<\\/row>)'))?.[0]:null;
   if(following)patched=source.replace(following,freshRow+following);
   else patched=source.replace(/<\/sheetData\s*>/,freshRow+'</sheetData>');
  }
  if (patched === source) throw new Error('지원하지 않는 빈 시트입니다. 승인된 템플릿을 확인해 주세요.');
  const range = {s:{...sheet.ref.s},e:{...sheet.ref.e}}; range.e.r = Math.max(range.e.r,rowNumber-1); range.e.c = Math.max(range.e.c,11);
  patched = patched.replace(/<dimension\b[^>]*\bref="[^"]*"[^>]*\/>/,`<dimension ref="${rangeName(range)}"/>`);
  patched=widenReportColumns(patched,routeColumnWidth([draft.route,...Object.entries(sheet.cells).filter(([address])=>/^G[1-9]\d*$/.test(address)).map(([,cell])=>String(cell.v??''))]));
  entries[path] = strToU8(patched);
  // Existing cells, formulas, drawings and unrelated ZIP members are unchanged.
  // styles.xml is extended only when new report fonts/cell styles are needed.
  const result = zipSync(entries,{level:6});
  workbookFromFile(result);
  return {bytes:result,sheetName,rowNumber,createdMonth:false};
}
