import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {patchWorkbookCell,readWorkbookGrid} from './reportWorkbookGrid';
import {workbookFromFile} from './kakaoExcelWorkbook';
test('HQ grid reads A-L values and saves one cell while preserving other XLSX members',()=>{
 const b=kakaoWorkbookFixture(),view=readWorkbookGrid(b,'4월');
 assert.equal(view.rows[0].row,2);assert.equal(view.rows[0].cells[3],'다른 거래처');
 const out=patchWorkbookCell(b,'4월',2,'D','수정한 고객사');
 assert.equal(out.changed,true);assert.equal(workbookFromFile(out.bytes).Sheets['4월'].cells.D2.v,'수정한 고객사');
 const before=unzipSync(b),after=unzipSync(out.bytes);
 for(const k of Object.keys(before))if(k!=='xl/worksheets/sheet1.xml')assert.deepEqual(after[k],before[k]);
 assert.match(strFromU8(after['xl/worksheets/sheet1.xml']),/수정한 고객사/);
 assert.equal(patchWorkbookCell(out.bytes,'4월',2,'D','수정한 고객사').changed,false);
});
test('HQ grid cannot overwrite formulas, merged cells or create fake rows',()=>{
 const bytes=kakaoWorkbookFixture();
 assert.throws(()=>patchWorkbookCell(bytes,'4월',113,'L','1000'),/수식/);
 assert.throws(()=>patchWorkbookCell(bytes,'4월',241,'A','2026-04-20'),/병합/);
 assert.throws(()=>patchWorkbookCell(bytes,'4월',999,'D','테스트'),/기존 데이터/);
 assert.throws(()=>patchWorkbookCell(bytes,'4월',2,'A','2026-05-05'),/동일한 월/);
 assert.throws(()=>patchWorkbookCell(bytes,'4월',2,'D','=HYPERLINK()'),/수식/);
});

test('HQ preview paginates beyond the first range, includes protected totals, and does not consume the next cell after an empty cell',async()=>{
 const {zipSync,strToU8}=await import('fflate');const bytes=kakaoWorkbookFixture();
 const second=readWorkbookGrid(bytes,'4월',1,1);assert.equal(second.rows[0].row,3);assert.equal(second.offset,1);
 const footer=readWorkbookGrid(bytes,'4월').rows.find(r=>r.row===113);assert.ok(footer?.locked.includes('L'));
 const entries=unzipSync(bytes),path='xl/worksheets/sheet1.xml';let source=strFromU8(entries[path]);source=source.replace(/<c\b(?=[^>]*\br="D2")[^>]*?>[\s\S]*?<\/c>/,'<c r="D2" s="0"/>');entries[path]=strToU8(source);
 const blank=zipSync(entries),oldDriver=workbookFromFile(blank).Sheets['4월'].cells.E2.v;
 const out=patchWorkbookCell(blank,'4월',2,'D','빈 셀 수정');assert.equal(workbookFromFile(out.bytes).Sheets['4월'].cells.E2.v,oldDriver);assert.equal(workbookFromFile(out.bytes).Sheets['4월'].cells.D2.v,'빈 셀 수정');
});

test('HQ row locator selects correct page by physical Excel row, never by report order',()=>{
 const bytes=kakaoWorkbookFixture();
 const page=readWorkbookGrid(bytes,'4월',1,0,3);
 assert.equal(page.offset,1);
 assert.equal(page.rows.length,1);
 assert.equal(page.rows[0].row,3);
 assert.equal(readWorkbookGrid(bytes,'4월',1,100,2).offset,0);
 assert.throws(()=>readWorkbookGrid(bytes,'4월',1,0,99999),/행/);
 assert.throws(()=>readWorkbookGrid(bytes,'4월',1,0,999),/현재 Excel 행/);
});
