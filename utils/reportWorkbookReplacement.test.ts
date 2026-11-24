import test from 'node:test';
import assert from 'node:assert/strict';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {blankKakaoExcelDraft} from './kakaoExcelImport';
import {reportWorkbookYear} from './reportWorkbookYear';

test('new owner workbook stays intact while subsequent chat reports append to its own monthly sheet',()=>{
 const source=kakaoWorkbookFixture();
 const initial={...blankKakaoExcelDraft(),date:'2026-04-05',plate:'700호 1458',model:'스프린터 319',driver:'이전 기사',customer:'이전 보고',time:'10:00~18:00',route:'차고지 - 호텔'};
 const old=appendKakaoExcelReport(source,initial);
 const wifeOriginal=kakaoWorkbookFixture();
 assert.equal(reportWorkbookYear(wifeOriginal,'사모님 원본 2026년.xlsx'),2026);
 const now={...initial,date:'2026-04-12',driver:'현재 기사',customer:'새 채팅 보고'};
 const current=appendKakaoExcelReport(wifeOriginal,now);
 assert.equal(workbookFromFile(old.bytes).Sheets['4월'].cells['D'+old.rowNumber].v,'이전 보고');
 assert.equal(workbookFromFile(current.bytes).Sheets['4월'].cells['D'+current.rowNumber].v,'새 채팅 보고');
 assert.equal(workbookFromFile(source).Sheets['4월'].cells['D'+current.rowNumber]?.v,undefined);
 assert.deepEqual(wifeOriginal,source,'the uploaded owner original must never be edited in place');
 assert.notDeepEqual(current.bytes,wifeOriginal,'new messages create a separate updated workbook version');
});
