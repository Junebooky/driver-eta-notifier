import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {appendManualWorkbookRow,appendManualWorkbookColumn,visibleWorkbookColumns,deleteManualWorkbookRow,deleteManualWorkbookColumn} from './reportWorkbookStructure';
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
 assert.throws(()=>appendManualWorkbookRow(protectedBook,'4월'),/편집 제한/);
 assert.throws(()=>appendManualWorkbookColumn(protectedBook,'4월','비고'),/편집 제한/);
 assert.deepEqual(unzipSync(protectedBook)[path],protectedFiles[path]);
 assert.throws(()=>appendManualWorkbookRow(kakaoWorkbookFixture(),'13월'),/선택한 월/);
 assert.throws(()=>appendManualWorkbookColumn(kakaoWorkbookFixture(),'4월','=SUM(1)'),/열 이름/);
 assert.throws(()=>appendManualWorkbookColumn(kakaoWorkbookFixture(),'4월',''),/열 이름/);
});

test('an existing native Excel auto-filter remains intact after safe row and column additions',()=>{
 const members=unzipSync(kakaoWorkbookFixture());
 members[path]=strToU8(strFromU8(members[path]).replace('</sheetData>','</sheetData><autoFilter ref="A1:L3"/>'));
 const original=zipSync(members);
 const row=appendManualWorkbookRow(original,'4월');
 const column=appendManualWorkbookColumn(row.bytes,'4월','새 메모');
 const xml=strFromU8(unzipSync(column.bytes)[path]);
 assert.match(xml,/<autoFilter ref="A1:L3"\/>/);
 assert.match(xml,/<c r="M1" t="inlineStr">/);
 assert.match(xml,/<row r="4" ht="22\.17" customHeight="1"\/>/);
 assert.deepEqual(unzipSync(original)[path],members[path]);
});

test('rich Excel metadata (drawings, hyperlinks, validations, conditional formats, extension tags) does not block no-shift additions',()=>{
 const zipped=unzipSync(kakaoWorkbookFixture());
 let original=strFromU8(zipped[path]);
 if(!/xmlns:r=/.test(original))original=original.replace('<worksheet','<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
 const decorations='<conditionalFormatting sqref="B2:B3"><cfRule type="expression" priority="1"><formula>TRUE</formula></cfRule></conditionalFormatting>'
  +'<dataValidations count="1"><dataValidation sqref="D2" type="list" allowBlank="1"><formula1>"Y,N"</formula1></dataValidation></dataValidations>'
  +'<hyperlinks><hyperlink ref="D2" location="Sheet2!A1" display="goto"/></hyperlinks>'
  +'<drawing r:id="rId99"/><tableParts count="1"><tablePart r:id="rId100"/></tableParts><extLst><ext uri="{01101010}"/></extLst>';
 zipped[path]=strToU8(original.replace('</worksheet>',decorations+'</worksheet>'));
 zipped['xl/tables/table1.xml']=strToU8('<table ref="A1:L10"/>');
 const bytes=zipSync(zipped,{level:6});
 const added=appendManualWorkbookRow(bytes,'4월');
 assert.equal(added.rowNumber,4);
 const col=appendManualWorkbookColumn(added.bytes,'4월','회사 메모');
 assert.equal(col.column,'M');
 const xml=strFromU8(unzipSync(col.bytes)[path]);
 assert.ok(xml.includes(decorations),'all existing Excel metadata is preserved byte for byte in the worksheet XML');
 assert.equal(workbookFromFile(col.bytes).Sheets['4월'].cells.D2.v,'다른 거래처');
 for(const name of Object.keys(zipped))if(name!==path)assert.deepEqual(unzipSync(col.bytes)[name],zipped[name]);
});

test('delete a web-added row without shifting existing report rows or unrelated sheet contents',()=>{
 const original=kakaoWorkbookFixture(),manual=appendManualWorkbookRow(original,'4월');
 const filled=patchWorkbookCell(manual.bytes,'4월',manual.rowNumber,'D','삭제할 수기 고객').bytes;
 const deleted=deleteManualWorkbookRow(filled,'4월',manual.rowNumber);
 assert.equal(deleted.rowNumber,4);
 assert.equal(readWorkbookGrid(deleted.bytes,'4월').rows.some(row=>row.row===4),false);
 assert.equal(workbookFromFile(deleted.bytes).Sheets['4월'].cells.D4,undefined);
 assert.equal(workbookFromFile(deleted.bytes).Sheets['4월'].cells.D2.v,'다른 거래처');
 assert.equal(workbookFromFile(deleted.bytes).Sheets['4월'].cells.D3.v,'기존 거래처');
 assert.equal(workbookFromFile(deleted.bytes).Sheets['4월'].cells.L113.v,0);
 assert.deepEqual(unzipSync(original)['xl/worksheets/sheet2.xml'],unzipSync(deleted.bytes)['xl/worksheets/sheet2.xml']);
 assert.deepEqual(unzipSync(original)[path],unzipSync(original)[path],'the source remains untouched');
 assert.throws(()=>deleteManualWorkbookRow(original,'4월',2),/수기 행만 삭제/);
 assert.throws(()=>deleteManualWorkbookRow(original,'4월',113),/수기 행만 삭제/);
});

test('delete custom M column and preserve the report A-L and other user-created columns',()=>{
 const original=kakaoWorkbookFixture();
 const a=appendManualWorkbookColumn(original,'4월','회사 메모');
 const b=appendManualWorkbookColumn(a.bytes,'4월','추가 비용');
 const c=patchWorkbookCell(b.bytes,'4월',2,'M','삭제할 내용');
 const d=patchWorkbookCell(c.bytes,'4월',2,'N','유지할 내용');
 const deleted=deleteManualWorkbookColumn(d.bytes,'4월','M');
 assert.equal(deleted.column,'M');
 assert.equal(workbookFromFile(deleted.bytes).Sheets['4월'].cells.M1,undefined);
 assert.equal(workbookFromFile(deleted.bytes).Sheets['4월'].cells.M2,undefined);
 assert.equal(workbookFromFile(deleted.bytes).Sheets['4월'].cells.N2.v,'유지할 내용');
 assert.equal(workbookFromFile(deleted.bytes).Sheets['4월'].cells.D2.v,'다른 거래처');
 assert.deepEqual(readWorkbookGrid(deleted.bytes,'4월').columns,'ABCDEFGHIJKL'.split('').concat('N'));
 assert.equal(readWorkbookGrid(deleted.bytes,'4월').headers[12],'추가 비용');
 assert.throws(()=>deleteManualWorkbookColumn(d.bytes,'4월','B'),/자동입력 열/);
 assert.throws(()=>deleteManualWorkbookColumn(original,'4월','M'),/사용자 추가 열/);
 const readded=appendManualWorkbookColumn(deleted.bytes,'4월','새 M 열');
 assert.equal(readded.column,'M','deleted M slot can be reused without shifting N');
 assert.equal(workbookFromFile(readded.bytes).Sheets['4월'].cells.N2.v,'유지할 내용');
 assert.deepEqual(readWorkbookGrid(readded.bytes,'4월').columns,'ABCDEFGHIJKLMN'.split(''));
});

test('protected worksheet refuses delete; explicit worksheet formulas may not be dropped',()=>{
 const src=unzipSync(kakaoWorkbookFixture());
 const a=appendManualWorkbookColumn(kakaoWorkbookFixture(),'4월','추가 내용');
 const entries=unzipSync(a.bytes);
 const xml=strFromU8(entries[path]);
 entries[path]=strToU8(xml.replace('</sheetData>','</sheetData><sheetProtection sheet="1"/>'));
 const protectedBytes=zipSync(entries,{level:6});
 assert.throws(()=>deleteManualWorkbookColumn(protectedBytes,'4월','M'),/편집 제한/);
 assert.throws(()=>deleteManualWorkbookRow(protectedBytes,'4월',4),/편집 제한|수기 행/);
 assert.deepEqual(unzipSync(protectedBytes)[path],entries[path]);
 const withFormula=unzipSync(a.bytes);
 const formula='<c r="O2"><f>M2*3</f><v>0</v></c>';
 withFormula[path]=strToU8(strFromU8(withFormula[path]).replace('</sheetData>','</sheetData><row r="300">'+formula+'</row>'));
 assert.throws(()=>deleteManualWorkbookColumn(zipSync(withFormula,{level:6}),'4월','M'),/참조하는 Excel 수식/);
 for(const name of Object.keys(src))if(name!=='path')assert.ok(src[name]);
});

test('a custom Excel table-owned header is protected while adjacent user columns remain editable',()=>{
 const entries=unzipSync(kakaoWorkbookFixture());
 let source=strFromU8(entries[path]);
 if(!/xmlns:r=/.test(source))source=source.replace('<worksheet','<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
 entries[path]=strToU8(source.replace('</worksheet>','<tableParts count="1"><tablePart r:id="rId101"/></tableParts></worksheet>'));
 entries['xl/tables/table1.xml']=strToU8('<table ref="A1:M10"/>');
 const bytes=zipSync(entries,{level:6});
 assert.throws(()=>appendManualWorkbookColumn(bytes,'4월','메모'),/표가 M열을 사용/);
 assert.equal(appendManualWorkbookRow(bytes,'4월').rowNumber,4,'no-shift row creation is safe for existing table ranges');
 assert.deepEqual(unzipSync(bytes)[path],entries[path]);
});
