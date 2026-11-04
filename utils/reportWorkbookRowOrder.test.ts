import test from 'node:test';
import assert from 'node:assert/strict';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {addApprovedMonth} from './reportWorkbookOperations';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {organizeManagedMonth} from './reportWorkbookRowOrder';
import {blankKakaoExcelDraft} from './kakaoExcelImport';
const draft={...blankKakaoExcelDraft(),date:'2026-11-12',plate:'700호1458',model:'스타리아',customer:'고객',driver:'기사',time:'10:00~18:00'};
test('Nov 11/12 then 11/05 inserts earlier date above, preserving manifest moves and formulas',()=>{
 const b=addApprovedMonth(kakaoWorkbookFixture(),'4월',11);
 const late=appendKakaoExcelReport(b,draft);
 const early=appendKakaoExcelReport(late.bytes,{...draft,date:'2026-11-05',plate:'700호1357'});
 const out=organizeManagedMonth(early.bytes,'11월',2026,{'00000000-0000-4000-8000-000000000001':{sheet:'11월',row:late.rowNumber}},{row:early.rowNumber,date:'2026-11-05'});
 const sheet=workbookFromFile(out.bytes).Sheets['11월'];
 assert.equal(out.rowNumber,2);assert.equal(out.moves['00000000-0000-4000-8000-000000000001'],3);
 const iso=(n:string|number)=>typeof n==='number'?new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10):n;
 assert.equal(iso(sheet.cells.A2.v),'2026-11-05');
 assert.equal(iso(sheet.cells.A3.v),'2026-11-12');
 assert.equal(sheet.cells.L113.v,'');
});
test('Any unowned historical entry blocks automatic compaction and leaves byte-for-byte source untouched',()=>{
 const old=appendKakaoExcelReport(kakaoWorkbookFixture(),{...draft,date:'2026-04-05'});
 const out=organizeManagedMonth(old.bytes,'4월',2026,{}, {row:old.rowNumber,date:'2026-04-05'});
 assert.equal(out.changed,false);assert.deepEqual(out.bytes,old.bytes);
});
