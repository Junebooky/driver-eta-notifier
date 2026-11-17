import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {patchWorkbookCell,readWorkbookGrid,addWorkbookDownloadAutoFilters} from './reportWorkbookGrid';
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

test('whole-month filters use real B/D/E columns, combine matches, and preserve physical report rows',()=>{
 const original=kakaoWorkbookFixture();
 const initial=readWorkbookGrid(original,'4월');
 assert.deepEqual(new Set(initial.filterOptions.plate),new Set(['1458','703서2660/2874']));
 assert.ok(initial.filterOptions.customer.includes('기존 거래처'));
 assert.ok(initial.filterOptions.driver.includes('다른 기사'));
 const matches=readWorkbookGrid(original,'4월',1,0,undefined,{plate:'703서2660/2874',driver:'기존 기사',customer:'기존 거래처'});
 assert.equal(matches.total,1);
 assert.equal(matches.rows[0].row,3);
 assert.equal(matches.unfilteredTotal,initial.total);
 assert.equal(readWorkbookGrid(original,'4월',300,0,undefined,{plate:'1458',customer:'기존 거래처'}).total,0);
 assert.equal(readWorkbookGrid(original,'4월',300,0,undefined,{customer:'다른 거래처'}).rows[0].row,2);
 assert.equal(readWorkbookGrid(original,'4월',300,0,undefined,{driver:'기존 기사'}).rows[0].row,3);
 assert.deepEqual(kakaoWorkbookFixture(),original,'a filtered preview never mutates the source workbook');
});

test('column sorts are non-destructive, stable across pages and bypassed for physical focus',()=>{
 const b=kakaoWorkbookFixture();
 const ascending=readWorkbookGrid(b,'4월',1,0,undefined,{sortBy:'D',sortDirection:'asc'});
 const descending=readWorkbookGrid(b,'4월',1,0,undefined,{sortBy:'D',sortDirection:'desc'});
 assert.equal(ascending.rows[0].row,3);
 assert.equal(descending.rows[0].row,2);
 assert.equal(readWorkbookGrid(b,'4월',1,1,undefined,{sortBy:'D',sortDirection:'asc'}).rows[0].row,2);
 const focused=readWorkbookGrid(b,'4월',1,0,3,{plate:'not this number',sortBy:'D',sortDirection:'desc'});
 assert.equal(focused.rows[0].row,3);
 assert.equal(focused.offset,1,'focus pages by physical row when filters are ignored');
 assert.equal(readWorkbookGrid(b,'4월').rows[0].row,2,'the stored order never changes');
});

test('latest Excel download has native sheet filter arrows while saved originals and formulas remain unchanged',()=>{
 const bytes=kakaoWorkbookFixture(),original=unzipSync(bytes);
 const download=addWorkbookDownloadAutoFilters(bytes),after=unzipSync(download);
 assert.notDeepEqual(download,bytes);
 assert.match(strFromU8(after['xl/worksheets/sheet1.xml']),/<autoFilter ref="A1:L3"\/>/);
 assert.doesNotMatch(strFromU8(after['xl/worksheets/sheet1.xml']),/<autoFilter ref="A1:L244"/);
 assert.deepEqual(after['xl/worksheets/sheet2.xml'],original['xl/worksheets/sheet2.xml']);
 for(const name of Object.keys(original))if(name!=='xl/worksheets/sheet1.xml')assert.deepEqual(after[name],original[name]);
 assert.match(strFromU8(after['xl/worksheets/sheet1.xml']),/<f>SUM\(J2:J112\)\*1\.1<\/f>/);
 assert.deepEqual(unzipSync(bytes)['xl/worksheets/sheet1.xml'],original['xl/worksheets/sheet1.xml']);
 assert.equal(workbookFromFile(download).Sheets['4월'].cells.D2.v,'다른 거래처');
 assert.equal(addWorkbookDownloadAutoFilters(download),download,'already filtered workbook is returned without rewriting');
});

test('download filters leave a protected monthly worksheet byte-for-byte unchanged',async()=>{
 const {zipSync,strToU8}=await import('fflate'),base=unzipSync(kakaoWorkbookFixture());
 base['xl/worksheets/sheet1.xml']=strToU8(strFromU8(base['xl/worksheets/sheet1.xml']).replace('</sheetData>','</sheetData><sheetProtection sheet="1"/>'));
 const bytes=zipSync(base);
 assert.deepEqual(addWorkbookDownloadAutoFilters(bytes),bytes);
});
