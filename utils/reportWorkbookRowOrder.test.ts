import test from 'node:test';
import assert from 'node:assert/strict';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
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

test('self-closing styled template rows remain valid when filled and compacted; protected cached formulas are retained',async()=>{

 const entries=unzipSync(addApprovedMonth(kakaoWorkbookFixture(),'4월',11));
 const path='xl/worksheets/sheet3.xml';let xml=strFromU8(entries[path]);
 xml=xml.replace(/<row\b(?=[^>]*\br="2")[^>]*>[\s\S]*?<\/row>/,'<row r="2" s="1"/>').replace(/<row\b(?=[^>]*\br="3")[^>]*>[\s\S]*?<\/row>/,'<row r="3" s="1"/>');
 // The cached footer must not turn a blank data area into a populated month.
 xml=xml.replace('<f>SUM(J2:J112)*1.1</f>','<f ca="1">SUM(J2:J112)*1.1</f><v>123</v>');
 entries[path]=strToU8(xml);const blank=zipSync(entries),late=appendKakaoExcelReport(blank,draft);
 assert.equal(late.rowNumber,2);
 const early=appendKakaoExcelReport(late.bytes,{...draft,date:'2026-11-05',plate:'700호1357'});
 const sorted=organizeManagedMonth(early.bytes,'11월',2026,{late:{sheet:'11월',row:2}},{row:early.rowNumber,date:'2026-11-05'});
 assert.equal(sorted.rowNumber,2);assert.equal(sorted.moves.late,3);
 const sheet=workbookFromFile(sorted.bytes).Sheets['11월'];assert.equal(sheet.cells.B2.v,1357);assert.equal(sheet.cells.B3.v,1458);assert.equal(sheet.cells.L113.v,123);
 const result=strFromU8(unzipSync(sorted.bytes)[path]);assert.ok(!/<row\b[^>]*\/>\s*<c/.test(result));
});

test('Mixed manual + managed November records sort together, moving whole rows and M-column notes',()=>{
 const blank=addApprovedMonth(kakaoWorkbookFixture(),'4월',11);
 const manual=appendKakaoExcelReport(blank,{...draft,date:'2026-11-12',customer:'기존 수기',amount:'12000'});
 const files=unzipSync(manual.bytes),path='xl/worksheets/sheet3.xml';
 files[path]=strToU8(strFromU8(files[path]).replace(/(<row\b(?=[^>]*\br="2")[^>]*>[\s\S]*?)(<\/row>)/,'$1<c r="M2" t="inlineStr"><is><t>수기 메모</t></is></c>$2'));
 const manualWithNote=zipSync(files);
 const managed=appendKakaoExcelReport(manualWithNote,{...draft,date:'2026-11-05',customer:'자동 추가'});
 const reportId='00000000-0000-4000-8000-000000000059';
 const originalOther=unzipSync(managed.bytes);
 const sorted=organizeManagedMonth(managed.bytes,'11월',2026,{[reportId]:{sheet:'11월',row:managed.rowNumber}});
 assert.equal(sorted.changed,true);
 assert.equal(sorted.moves[reportId],2);
 const sheet=workbookFromFile(sorted.bytes).Sheets['11월'];
 assert.equal(sheet.cells.D2.v,'자동 추가');
 assert.equal(sheet.cells.D3.v,'기존 수기');
 const result=unzipSync(sorted.bytes);
 assert.match(strFromU8(result[path]),/<c r="M3" t="inlineStr">/);
 assert.match(strFromU8(result[path]),/<c r="L113"><f>SUM\(J2:J112\)\*1\.1<\/f>/);
 for(const name of Object.keys(originalOther))if(name!==path)assert.deepEqual(result[name],originalOther[name]);
});
test('Manual-only rows can be sorted without manifest UUID moves and original file is immutable',()=>{
 const blank=addApprovedMonth(kakaoWorkbookFixture(),'4월',11);
 const late=appendKakaoExcelReport(blank,{...draft,date:'2026-11-22',customer:'늦은 수기'});
 const early=appendKakaoExcelReport(late.bytes,{...draft,date:'2026-11-02',customer:'이른 수기'});
 const before=unzipSync(early.bytes);
 const result=organizeManagedMonth(early.bytes,'11월',2026,{});
 assert.equal(result.changed,true);
 assert.deepEqual(result.moves,{});
 assert.equal(workbookFromFile(result.bytes).Sheets['11월'].cells.D2.v,'이른 수기');
 assert.equal(workbookFromFile(result.bytes).Sheets['11월'].cells.D3.v,'늦은 수기');
 const original=unzipSync(early.bytes);
 for(const name of Object.keys(before))assert.deepEqual(original[name],before[name]);
});
test('Date sort safely refuses undated manual records instead of deleting them',()=>{
 const blank=addApprovedMonth(kakaoWorkbookFixture(),'4월',11);
 const late=appendKakaoExcelReport(blank,{...draft,date:'2026-11-22'});
 const files=unzipSync(late.bytes),path='xl/worksheets/sheet3.xml';
 files[path]=strToU8(strFromU8(files[path]).replace('</sheetData>','<row r="4"><c r="B4" t="inlineStr"><is><t>날짜 없는 수기</t></is></c></row></sheetData>'));
 const source=zipSync(files);
 const result=organizeManagedMonth(source,'11월',2026,{});
 assert.equal(result.changed,false);
 assert.match(result.reason||'',/날짜/);
 assert.deepEqual(result.bytes,source);
});
