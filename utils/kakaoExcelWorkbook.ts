import * as XLSX from 'xlsx';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { normalizedPlate, validateKakaoExcelDraft, type KakaoExcelDraft } from '@/utils/kakaoExcelImport';

const MAX_BYTES = 12 * 1024 * 1024;
export interface KakaoWorkbookResult { bytes: Uint8Array; sheetName: string; rowNumber: number; createdMonth: boolean }
export function workbookFromFile(bytes: Uint8Array): XLSX.WorkBook {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Excel 파일은 12MB 이하의 .xlsx 파일만 지원합니다.');
  // Inspect ZIP sizes before decompression, including unsupported/signed files.
  let expanded = 0;
  unzipSync(bytes, {filter: entry => {
    expanded += entry.originalSize;
    if (expanded > 64 * 1024 * 1024) throw new Error('압축 해제 크기가 너무 큽니다.');
    return false;
  }});
  const wb = XLSX.read(bytes, {type:'array', cellStyles:true, cellNF:true, cellDates:false});
  if (!wb.SheetNames.length) throw new Error('Excel 시트가 없는 파일입니다.');
  return wb;
}
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
  const date1904 = !!wb.Workbook?.WBProps?.date1904;
  const rows = Array.from(doc.getElementsByTagName('row'));
  let last = Math.max(1, XLSX.utils.decode_range(sheet['!ref'] || 'A1:L1').e.r+1);
  for (const row of rows) {
    const r = Number(row.getAttribute('r'));
    if (!Number.isInteger(r) || r < 1) throw new Error('행 번호가 올바르지 않습니다.');
    last = Math.max(last,r);
    if (r === 1) continue;
    const value = (c:string) => (sheet[c+r] as XLSX.CellObject | undefined)?.v;
    if (sameDate(value('A'),draft.date,date1904) && samePlate(value('B'),draft.plate) && clean(value('D')) === clean(draft.customer) && clean(value('E')) === clean(draft.driver)) {
      // Nonstandard multi-plate/period/time rows need review rather than a false negative.
      const oldTime = clean(value('F')).replace(/^\d+(?:\.\d+)?\((.*)\)$/,'$1');
      const newTime = clean(draft.time).replace(/^\d+(?:\.\d+)?\((.*)\)$/,'$1');
      if (oldTime === newTime || /[\/,~]/.test(String(value('A'))) || plateParts(value('B')).length > 1 || !/^\d{2}:\d{2}~\d{2}:\d{2}$/.test(oldTime)) throw new Error('중복 또는 기간·복수 차량의 기존 기록과 겹칩니다. 기존 장부를 확인해 주세요.');
    }
  }
  for (const merge of sheet['!merges'] || []) last = Math.max(last,merge.e.r+1);
  if (last >= 25000) throw new Error('안전하게 추가할 수 있는 행 범위를 초과했습니다.');
  const rowNumber = last+1;
  // Append AFTER every used/styled/footer/merged row. Never shift or overwrite cells.
  // Reuse only explicit column styles of the last actual data row, never formulas.
  const template = [...rows].reverse().find(r => {
    const n = r.getAttribute('r'); return n !== '1' && sheet['B'+n]?.v != null && sheet['D'+n]?.v != null;
  });
  const styles = new Map(Array.from(template?.getElementsByTagName('c') || []).map(c => [c.getAttribute('r')?.replace(/\d/g,''),c.getAttribute('s')]));
  const suffix = normalizedPlate(draft.plate).slice(-4);
  const dateStyle = template ? sheet['A'+template.getAttribute('r')]?.z : undefined;
  const dateValue = typeof dateStyle === 'string' && XLSX.SSF.is_date(dateStyle) ? serial(draft.date,date1904) : draft.date;
  const values: (string|number)[] = [dateValue,suffix.startsWith('0') ? suffix : Number(suffix),draft.model,draft.customer,draft.driver,draft.time,draft.route,draft.serviceType,draft.overtime,draft.amount,draft.payment,draft.totalWithVat];
  const cells = values.map((value,i) => {
    if (value === '') return '';
    const col = XLSX.utils.encode_col(i), style = styles.get(col);
    const attrs = ` r="${col}${rowNumber}"${style ? ` s="${xml(style)}"` : ''}`;
    const numeric = typeof value === 'number' || [8,9,11].includes(i) && /^\d+(?:\.\d+)?$/.test(String(value).replace(/,/g,''));
    return numeric ? `<c${attrs}><v>${String(value).replace(/,/g,'')}</v></c>` : `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
  }).join('');
  let patched = source.replace(/<\/sheetData\s*>/,`<row r="${rowNumber}">${cells}</row></sheetData>`);
  if (patched === source) throw new Error('지원하지 않는 빈 시트입니다. 승인된 템플릿을 확인해 주세요.');
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:L1'); range.e.r = rowNumber-1; range.e.c = Math.max(range.e.c,11);
  patched = patched.replace(/<dimension\b[^>]*\bref="[^"]*"[^>]*\/>/,`<dimension ref="${XLSX.utils.encode_range(range)}"/>`);
  entries[path] = strToU8(patched);
  // Every other ZIP member (styles, formulas on other tabs, drawings, relationships)
  // is retained byte-for-byte uncompressed. No SheetJS whole-workbook serialization.
  const result = zipSync(entries,{level:6});
  workbookFromFile(result);
  return {bytes:result,sheetName,rowNumber,createdMonth:false};
}
