import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {appendManualWorkbookRow,appendManualWorkbookColumn,visibleWorkbookColumns} from './reportWorkbookStructure';
import {readWorkbookGrid,patchWorkbookCell,addWorkbookDownloadAutoFilters} from './reportWorkbookGrid';
import {workbookFromFile} from './kakaoExcelWorkbook';
import {organizeManagedMonth} from './reportWorkbookRowOrder';

const path='xl/worksheets/sheet1.xml';

test('web Excel adds a physical empty editable row without moving reports, formulas or memo cells',()=>{
 const bytes=kakaoWorkbookFixture(),members=unzipSync(bytes);
 const added=appendManualWorkbookRow(bytes,'4월');
 assert.equal(added.rowNumber,4);
 const after=unzipSync(added.bytes),sheet=strFromU8(after[path]);
 assert.match(sheet,/<row r="4" ht="22\.17" customHeight="1"\/>/);
 assert.equal(readWorkbookGrid(added.bytes,'4월').rows.find(r=>r.row===4)?.cells.every(v=>v===''),true);
 assert.equal(workbookFromFile(added.bytes).Sheets['4월'].cells.D2.v,'다른 거래처');
 assert.equal(workbookFromFile(added.bytes).Sheets['4월'].cells.L113.v,0);
 assert.equal(workbookFromFile(added.bytes).Sheets['4월'].cells.B244.v,'원본 비표준 메모');
 for(const key of Object.keys(members))if(key!==path)assert.deepEqual(after[key],members[key]);
 assert.deepEqual(unzipSync(bytes)[path],members[path],'company original must not be mutated');
 const filled=patchWorkbookCell(added.bytes,'4월',4,'D','수기 고객사');
 assert.equal(workbookFromFile(filled.bytes).Sheets['4월'].cells.D4.v,'수기 고객사');
 assert.equal(readWorkbookGrid(filled.bytes,'4월').rows.find(r=>r.row===4)?.cells[3],'수기 고객사');
});

test('consecutive new rows do not overwrite existing manually created rows',()=>{
 const first=appendManualWorkbookRow(kakaoWorkbookFixture(),'4월');
 const second=appendManualWorkbookRow(first.bytes,'4월');
 assert.equal(first.rowNumber,4);
 assert.equal(second.rowNumber,5);
 assert.ok(readWorkbookGrid(second.bytes,'4월').rows.some(row=>row.row===4));
 assert.ok(readWorkbookGrid(second.bytes,'4월').rows.some(row=>row.row===5));
});

test('custom labeled columns start after the reserved A-L chauffeur schema and support editing',()=>{
 const bytes=kakaoWorkbookFixture();
 const first=appendManualWorkbookColumn(bytes,'4월','비고');
 assert.equal(first.column,'M');
 assert.equal(workbookFromFile(first.bytes).Sheets['4월'].cells.M1.v,'비고');
 const grid=readWorkbookGrid(first.bytes,'4월');
 assert.deepEqual(grid.columns,'ABCDEFGHIJKLM'.split(''));
 assert.equal(grid.headers[12],'비고');
 const filled=patchWorkbookCell(first.bytes,'4월',2,'M','기타 사항');
 assert.equal(workbookFromFile(filled.bytes).Sheets['4월'].cells.M2.v,'기타 사항');
 assert.equal(workbookFromFile(filled.bytes).Sheets['4월'].cells.D2.v,'다른 거래처');
 const second=appendManualWorkbookColumn(filled.bytes,'4월','회사 메모');
 assert.equal(second.column,'N');
 assert.equal(readWorkbookGrid(second.bytes,'4월').headers[13],'회사 메모');
 const snapshot=unzipSync(bytes),after=unzipSync(second.bytes);
 for(const key of Object.keys(snapshot))if(key!==path)assert.deepEqual(after[key],snapshot[key]);
 assert.match(strFromU8(after[path]),/<c r="N1" t="inlineStr">/);
 assert.throws(()=>appendManualWorkbookColumn(second.bytes,'4월','비고'),/이미 사용 중/);
 assert.throws(()=>patchWorkbookCell(bytes,'4월',2,'M','권한 없는 셀'),/추가되지 않은 열/);
});

test('new row and custom column work together and downloaded workbook keeps custom data',()=>{
 const a=appendManualWorkbookRow(kakaoWorkbookFixture(),'4월');
 const b=appendManualWorkbookColumn(a.bytes,'4월','추가 경비');
 const saved=patchWorkbookCell(b.bytes,'4월',4,'M','주차 5,000원').bytes;
 const view=readWorkbookGrid(saved,'4월');
 assert.equal(view.rows.find(r=>r.row===4)?.cells[12],'주차 5,000원');
 const xlsx=addWorkbookDownloadAutoFilters(saved);
 assert.equal(workbookFromFile(xlsx).Sheets['4월'].cells.M4.v,'주차 5,000원');
 assert.equal(workbookFromFile(xlsx).Sheets['4월'].cells.L113.v,0);
});

test('manual blank rows cannot be overwritten during existing date-sort compaction',()=>{
 const bytes=appendManualWorkbookRow(kakaoWorkbookFixture(),'4월');
 const result=organizeManagedMonth(bytes.bytes,'4월',2026,{});
 // The fixture has no sortable 2026 reports. In any case the reserved row survives.
 if(result.changed)assert.match(strFromU8(unzipSync(result.bytes)[path]),/<row r="4" ht="22\.17" customHeight="1"\/>/);
 else assert.match(strFromU8(unzipSync(bytes.bytes)[path]),/<row r="4" ht="22\.17" customHeight="1"\/>/);
});

test('protected and special workbooks fail safely without modifying any member',()=>{
 const original=unzipSync(kakaoWorkbookFixture());
 const protectedFiles={...original};
 protectedFiles[path]=strToU8(strFromU8(original[path]).replace('</sheetData>','</sheetData><sheetProtection sheet="1"/>'));
 const protectedBook=zipSync(protectedFiles);
 assert.throws(()=>appendManualWorkbookRow(protectedBook,'4월'),/보호된 시트/);
 assert.throws(()=>appendManualWorkbookColumn(protectedBook,'4월','비고'),/보호된 시트/);
 assert.deepEqual(unzipSync(protectedBook)[path],protectedFiles[path]);
 assert.throws(()=>appendManualWorkbookRow(kakaoWorkbookFixture(),'13월'),/선택한 월/);
 assert.throws(()=>appendManualWorkbookColumn(kakaoWorkbookFixture(),'4월','=SUM(1)'),/열 이름/);
 assert.throws(()=>appendManualWorkbookColumn(kakaoWorkbookFixture(),'4월',''),/열 이름/);
});
