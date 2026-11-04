import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { appendKakaoExcelReport } from './kakaoExcelWorkbook';
import { blankKakaoExcelDraft } from './kakaoExcelImport';

const draft = {...blankKakaoExcelDraft(),date:'2026-04-05',plate:'700호1458',model:'스프린터',customer:'검증 거래처',driver:'검증 기사',time:'09:15~17:20'};
function fixture() {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    [45184,7725,'차종','거래처','운전자','타임','센딩,픽업','셀프/의전','OT Hours','합계','결제방법','합계(부포함)'],
    ['4/1~30',1458,'스프린터','다른 거래처','다른 기사','11(13:20~24:20)'],
    [46113,'703서2660/2874','G90','기존 거래처','기존 기사','17:30~24:20'],
  ]);
  sheet['L113'] = {t:'n',f:'SUM(J2:J112)*1.1',z:'#,##0.00'};
  sheet['B244'] = {t:'s',v:'원본 비표준 메모'};
  sheet['!ref']='A1:L244'; sheet['!merges']=[{s:{r:240,c:0},e:{r:240,c:11}}];
  sheet['!cols']=[{wch:22},{wch:30}];
  XLSX.utils.book_append_sheet(wb,sheet,'4월');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['보존 탭'],['=literal']]),'기타');
  const entries = unzipSync(new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx',cellStyles:true})));
  entries['customXml/item1.xml']=strToU8('<custom>opaque data retained</custom>');
  return zipSync(entries);
}

test('Synthetic company-layout copy retains every ZIP member and all pre-existing sheet XML, formulas, styles and footer', () => {
  const before = fixture(), original = Uint8Array.from(before);
  const result = appendKakaoExcelReport(before,draft);
  assert.deepEqual(before,original);
  assert.equal(result.rowNumber,245);
  const a=unzipSync(before),b=unzipSync(result.bytes);
  assert.deepEqual(Object.keys(a),Object.keys(b));
  for (const name of Object.keys(a)) {
    if (name !== 'xl/worksheets/sheet1.xml') assert.deepEqual(b[name],a[name],name);
  }
  const strip = (s:string) => s.replace(/<dimension[^>]*\/>/,'').replace(/<row r="245">[\s\S]*?<\/row>/,'');
  assert.equal(strip(strFromU8(b['xl/worksheets/sheet1.xml'])),strip(strFromU8(a['xl/worksheets/sheet1.xml'])));
  const after = XLSX.read(result.bytes,{type:'array',cellStyles:true,cellNF:true});
  assert.equal(after.Sheets['4월'].L113.f,'SUM(J2:J112)*1.1');
  assert.equal(after.Sheets['4월'].B244.v,'원본 비표준 메모');
  assert.equal(after.Sheets['4월'].A245.v,'2026-04-05');
  assert.equal(after.Sheets['4월'].M245,undefined);
  assert.throws(()=>appendKakaoExcelReport(result.bytes,draft),/중복/);
});

test('Missing approved month is blocked instead of inventing a template',()=>{
  assert.throws(()=>appendKakaoExcelReport(fixture(),{...draft,date:'2026-10-05'}),/승인/);
});
test('Existing period and multiple plate records conservatively block possible duplicates',()=>{
  assert.throws(()=>appendKakaoExcelReport(fixture(),{...draft,customer:'다른 거래처',driver:'다른 기사'}),/중복/);
  const wb=XLSX.read(fixture(),{type:'array'});
  const date=XLSX.SSF.parse_date_code(wb.Sheets['4월'].A3.v)!;
  assert.throws(()=>appendKakaoExcelReport(fixture(),{...draft,date:`${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`,plate:'703서2660',customer:'기존 거래처',driver:'기존 기사'}),/중복/);
});
test('Untrusted strings are stored as literal strings and blank billing cells stay absent',()=>{
  const after=XLSX.read(appendKakaoExcelReport(fixture(),{...draft,customer:'=1+1'}).bytes,{type:'array'}).Sheets['4월'];
  assert.equal(after.D245.v,'=1+1'); assert.equal(after.D245.f,undefined);
  for (const c of ['I','J','K','L']) assert.equal(after[c+'245'],undefined);
});
