import test from 'node:test';import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {amendReportRow,addApprovedMonth,ensureReportMonth,removeReportRow} from './reportWorkbookOperations';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {blankKakaoExcelDraft,validateKakaoExcelDraft} from './kakaoExcelImport';
const draft={...blankKakaoExcelDraft(),date:'2026-04-05',plate:'700호1458',model:'스프린터 319',customer:'정정 검증',driver:'기사',time:'10:00~24:00',overtime:'OT 2시간 / 심야 2시간'};
test('applied corrections edit the same owned cells without adding a duplicate row or changing other XML',()=>{
 const initial=appendKakaoExcelReport(kakaoWorkbookFixture(),draft);const corrected=amendReportRow(initial.bytes,'4월',245,{...draft,time:'10:00~23:00',overtime:'OT 2시간 / 심야 1시간'});
 assert.equal(corrected.rowNumber,245);const wb=workbookFromFile(corrected.bytes);assert.equal(wb.Sheets['4월'].cells.F245.v,'10:00~23:00');assert.equal(wb.Sheets['4월'].cells.F246,undefined);assert.equal(wb.Sheets['4월'].cells.I245.v,'OT 2시간 / 심야 1시간');
 const a=unzipSync(initial.bytes),b=unzipSync(corrected.bytes);for(const n of Object.keys(a))if(n!=='xl/worksheets/sheet1.xml')assert.deepEqual(a[n],b[n]);
 const strip=(s:string)=>s.replace(/<row\b(?=[^>]*\br="245")[^>]*>[\s\S]*?<\/row>/,'');assert.equal(strip(strFromU8(a['xl/worksheets/sheet1.xml'])),strip(strFromU8(b['xl/worksheets/sheet1.xml'])));
 assert.equal(workbookFromFile(removeReportRow(corrected.bytes,'4월',245)).Sheets['4월'].cells.D245,undefined);
});
test('approved blank month keeps styles/formulas and original records but copies no historical records',()=>{
 const original=kakaoWorkbookFixture(),out=addApprovedMonth(original,'4월',10),wb=workbookFromFile(out);assert.ok(wb.Sheets['10월']);assert.equal(wb.Sheets['10월'].cells.D3?.v,'');assert.equal(wb.Sheets['10월'].cells.A1.v,'날짜');
 const a=unzipSync(original),b=unzipSync(out);assert.deepEqual(a['xl/worksheets/sheet1.xml'],b['xl/worksheets/sheet1.xml']);assert.deepEqual(a['xl/styles.xml'],b['xl/styles.xml']);assert.ok(strFromU8(b['xl/worksheets/sheet3.xml']).includes('<f>SUM(J2:J112)*1.1</f>'));
 assert.deepEqual(validateKakaoExcelDraft({...draft,date:'2027-04-05'}),[]);
});

test('November is automatically created from October as an empty sheet, then the report appends to November only',()=>{
 const original=kakaoWorkbookFixture();
 const october=addApprovedMonth(original,'4월',10);
 const before=unzipSync(october);
 const auto=ensureReportMonth(october,11);
 assert.equal(auto.created,true);assert.equal(auto.sourceMonth,'10월');
 const wb=workbookFromFile(auto.bytes);
 assert.ok(wb.Sheets['11월']);assert.equal(wb.Sheets['11월'].cells.D3?.v,'');
 assert.deepEqual(unzipSync(auto.bytes)['xl/worksheets/sheet1.xml'],before['xl/worksheets/sheet1.xml']);
 const novemberDraft={...draft,date:'2026-11-06',customer:'11월 자동생성 검증'};
 const applied=appendKakaoExcelReport(auto.bytes,novemberDraft);
 const result=workbookFromFile(applied.bytes);
 assert.equal(applied.sheetName,'11월');
 assert.equal(result.Sheets['11월'].cells.D245.v,'11월 자동생성 검증');
 assert.equal(result.Sheets['10월'].cells.D245,undefined);
 assert.deepEqual(unzipSync(applied.bytes)['xl/worksheets/sheet1.xml'],before['xl/worksheets/sheet1.xml']);
 const again=ensureReportMonth(applied.bytes,11);
 assert.equal(again.created,false);assert.deepEqual(again.bytes,applied.bytes);
});
test('Auto-create prefers an existing earlier month and fails safe when the workbook has no monthly template',()=>{
 const source=kakaoWorkbookFixture();
 const auto=ensureReportMonth(source,11);assert.equal(auto.sourceMonth,'4월');
 const explicit=ensureReportMonth(addApprovedMonth(source,'4월',10),11,'4월');assert.equal(explicit.sourceMonth,'4월');
 const entries=unzipSync(source);
 entries['xl/workbook.xml']=strToU8(strFromU8(entries['xl/workbook.xml']).replace('name="4월"','name="Legacy"'));
 assert.throws(()=>ensureReportMonth(zipSync(entries),11),/월별 시트/);
 assert.throws(()=>ensureReportMonth(source,13),/월을 확인/);
});
