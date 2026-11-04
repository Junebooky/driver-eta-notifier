import test from 'node:test';import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {amendReportRow,addApprovedMonth,removeReportRow} from './reportWorkbookOperations';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {blankKakaoExcelDraft,validateKakaoExcelDraft} from './kakaoExcelImport';
const draft={...blankKakaoExcelDraft(),date:'2026-04-05',plate:'700호1458',model:'스프린터 319',customer:'정정 검증',driver:'기사',time:'10:00~24:00',overtime:'OT 2시간 / 심야 2시간'};
test('applied corrections edit the same owned cells without adding a duplicate row or changing other XML',()=>{
 const initial=appendKakaoExcelReport(kakaoWorkbookFixture(),draft);const corrected=amendReportRow(initial.bytes,'4월',245,{...draft,time:'10:00~23:00',overtime:'OT 2시간 / 심야 1시간'});
 assert.equal(corrected.rowNumber,245);const wb=workbookFromFile(corrected.bytes);assert.equal(wb.Sheets['4월'].cells.F245.v,'10:00~23:00');assert.equal(wb.Sheets['4월'].cells.F246,undefined);assert.equal(wb.Sheets['4월'].cells.I245.v,'OT 2시간 / 심야 1시간');
 const a=unzipSync(initial.bytes),b=unzipSync(corrected.bytes);for(const n of Object.keys(a))if(n!=='xl/worksheets/sheet1.xml')assert.deepEqual(a[n],b[n]);
 const strip=(s:string)=>s.replace(/<row r="245">[\s\S]*?<\/row>/,'');assert.equal(strip(strFromU8(a['xl/worksheets/sheet1.xml'])),strip(strFromU8(b['xl/worksheets/sheet1.xml'])));
 assert.equal(workbookFromFile(removeReportRow(corrected.bytes,'4월',245)).Sheets['4월'].cells.D245,undefined);
});
test('approved blank month keeps styles/formulas and original records but copies no historical records',()=>{
 const original=kakaoWorkbookFixture(),out=addApprovedMonth(original,'4월',10),wb=workbookFromFile(out);assert.ok(wb.Sheets['10월']);assert.equal(wb.Sheets['10월'].cells.D3?.v,'');assert.equal(wb.Sheets['10월'].cells.A1.v,'날짜');
 const a=unzipSync(original),b=unzipSync(out);assert.deepEqual(a['xl/worksheets/sheet1.xml'],b['xl/worksheets/sheet1.xml']);assert.deepEqual(a['xl/styles.xml'],b['xl/styles.xml']);assert.ok(strFromU8(b['xl/worksheets/sheet3.xml']).includes('<f>SUM(J2:J112)*1.1</f>'));
 assert.deepEqual(validateKakaoExcelDraft({...draft,date:'2027-04-05'}),[]);
});
