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
