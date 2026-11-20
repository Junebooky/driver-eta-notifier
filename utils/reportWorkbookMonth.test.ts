import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strToU8,strFromU8} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {workbookFromFile,appendKakaoExcelReport} from './kakaoExcelWorkbook';
import {blankKakaoExcelDraft} from './kakaoExcelImport';
import {parseWorkbookMonthSheet,workbookMonthLabel,workbookMonthSheetNames,findWorkbookMonthSheetName} from './reportWorkbookMonth';
import {readWorkbookGrid,patchWorkbookCell} from './reportWorkbookGrid';
import {addApprovedMonth,ensureReportMonth} from './reportWorkbookOperations';
import {appendManualWorkbookRow,deleteManualWorkbookRow} from './reportWorkbookStructure';
import {reportWorkbookYear} from './reportWorkbookYear';

function octoberLegacy():Uint8Array {
 const members=unzipSync(kakaoWorkbookFixture());
 members['xl/workbook.xml']=strToU8(strFromU8(members['xl/workbook.xml']).replace('name="4월"','name="202610월"'));
 return zipSync(members);
}
test('original October sheet named 202610월 is shown as 10월 without renaming the owner workbook',()=>{
 const original=octoberLegacy(),before=unzipSync(original);
 const book=workbookFromFile(original);
 assert.deepEqual(workbookMonthSheetNames(book.SheetNames,2026),['202610월','11월']);
 assert.equal(workbookMonthLabel('202610월'),'10월');
 assert.equal(workbookMonthLabel('11월'),'11월');
 assert.equal(parseWorkbookMonthSheet('202610월',2027),null);
 assert.equal(findWorkbookMonthSheetName(book.SheetNames,10,2026),'202610월');
 assert.equal(findWorkbookMonthSheetName(book.SheetNames,11,2026),'11월');
 const grid=readWorkbookGrid(original,'202610월');
 assert.ok(grid.rows.length>0);
 assert.deepEqual(grid.months,['202610월','11월']);
 assert.equal(grid.month,'202610월');
 assert.deepEqual(unzipSync(original)['xl/workbook.xml'],before['xl/workbook.xml']);
 assert.equal(reportWorkbookYear(original,'회사 2026년 10월 11월.xlsx'),2026);
});
test('prefixed October sheet remains editable and delete-on-row-hover applies to manually added rows',()=>{
 const original=octoberLegacy();
 const edited=patchWorkbookCell(original,'202610월',2,'A','2026-10-09');
 assert.equal(edited.changed,true);
 const manual=appendManualWorkbookRow(edited.bytes,'202610월');
 assert.ok(readWorkbookGrid(manual.bytes,'202610월').manualRows.includes(manual.rowNumber));
 const deleted=deleteManualWorkbookRow(manual.bytes,'202610월',manual.rowNumber);
 assert.ok(!readWorkbookGrid(deleted.bytes,'202610월').manualRows.includes(manual.rowNumber));
 assert.deepEqual(unzipSync(deleted.bytes)['xl/worksheets/sheet2.xml'],unzipSync(original)['xl/worksheets/sheet2.xml']);
});
test('October report is appended into the existing 202610월 sheet; no duplicate 10월 worksheet',()=>{
 const original=octoberLegacy();
 const checked=ensureReportMonth(original,10);
 assert.equal(checked.created,false);
 assert.deepEqual(checked.bytes,original);
 assert.deepEqual(addApprovedMonth(original,'11월',10),original);
 const draft={...blankKakaoExcelDraft(),date:'2026-10-11',plate:'700호1458',model:'스프린터 519 CDI',customer:'신규 October 거래처',driver:'관리 기사',time:'09:00~18:00'};
 const appended=appendKakaoExcelReport(original,draft);
 assert.equal(appended.sheetName,'202610월');
 assert.ok(appended.rowNumber>=2);
 assert.deepEqual(workbookFromFile(appended.bytes).SheetNames,['202610월','11월']);
 assert.deepEqual(unzipSync(appended.bytes)['xl/worksheets/sheet2.xml'],unzipSync(original)['xl/worksheets/sheet2.xml']);
});
