import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8,zipSync,strToU8} from 'fflate';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {blankKakaoExcelDraft} from './kakaoExcelImport';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
const draft={...blankKakaoExcelDraft(),date:'2026-04-05',plate:'700호1458',model:'스프린터',customer:'검증 거래처',driver:'검증 기사',time:'09:15~17:20'};

test('Existing cells, formulas, styles, footer and all other ZIP members survive exactly',()=>{
 const before=kakaoWorkbookFixture(), copy=Uint8Array.from(before), result=appendKakaoExcelReport(before,draft);
 assert.deepEqual(before,copy); assert.equal(result.rowNumber,245);
 const a=unzipSync(before),b=unzipSync(result.bytes); assert.deepEqual(Object.keys(a),Object.keys(b));
 for(const n of Object.keys(a)) if(n!=='xl/worksheets/sheet1.xml') assert.deepEqual(b[n],a[n],n);
 const strip=(s:string)=>s.replace(/<dimension[^>]*\/>/,'').replace(/<row r="245">[\s\S]*?<\/row>/,'');
 assert.equal(strip(strFromU8(a['xl/worksheets/sheet1.xml'])),strip(strFromU8(b['xl/worksheets/sheet1.xml'])));
 const after=workbookFromFile(result.bytes).Sheets['4월'];
 assert.equal(after.cells.A245.v,46117); assert.equal(after.cells.M245,undefined);
 assert.throws(()=>appendKakaoExcelReport(result.bytes,draft),/중복/);
 assert.throws(()=>appendKakaoExcelReport(result.bytes,{...draft,time:'9:15~17:20'}),/중복/);
 assert.equal(appendKakaoExcelReport(result.bytes,{...draft,time:'18:00~19:00'}).rowNumber,246);
});
test('Missing approved month is blocked; existing period and multi-plate rows block possible duplicates',()=>{
 const bytes=kakaoWorkbookFixture();
 assert.throws(()=>appendKakaoExcelReport(bytes,{...draft,date:'2026-10-05'}),/승인/);
 assert.throws(()=>appendKakaoExcelReport(bytes,{...draft,customer:'다른 거래처',driver:'다른 기사'}),/중복/);
 assert.throws(()=>appendKakaoExcelReport(bytes,{...draft,date:'2026-04-01',plate:'703서2660',customer:'기존 거래처',driver:'기존 기사'}),/중복/);
});
test('Strings stay literal, optional billing cells absent, leading zero plates and date1904 preserved',()=>{
 const bytes=kakaoWorkbookFixture();
 const result=appendKakaoExcelReport(bytes,{...draft,customer:'=1+1',plate:'12가0123'});
 const after=workbookFromFile(result.bytes).Sheets['4월'];
 assert.equal(after.cells.D245.v,'=1+1'); assert.equal(after.cells.B245.v,'0123');
 for(const c of ['I','J','K','L']) assert.equal(after.cells[c+'245'],undefined);
 const entries=unzipSync(bytes);entries['xl/workbook.xml']=strToU8(strFromU8(entries['xl/workbook.xml']).replace('<sheets>','<workbookPr date1904="1"/><sheets>'));
 const converted=workbookFromFile(appendKakaoExcelReport(zipSync(entries),draft).bytes);
 assert.equal(converted.Sheets['4월'].cells.A245.v,46117-1462);
});
test('Malformed XML, over-limit files, signed files and table targets fail closed',()=>{
 assert.throws(()=>workbookFromFile(new Uint8Array()));
 assert.throws(()=>workbookFromFile(new Uint8Array(12*1024*1024+1)));
 const malformed=unzipSync(kakaoWorkbookFixture());malformed['xl/workbook.xml']=strToU8('<workbook><broken></workbook>');
 assert.throws(()=>workbookFromFile(zipSync(malformed)),/XML/);
 const entries=unzipSync(kakaoWorkbookFixture());entries['_xmlsignatures/sig1.xml']=strToU8('<Signature/>');
 assert.throws(()=>appendKakaoExcelReport(zipSync(entries),draft),/서명/);
 delete entries['_xmlsignatures/sig1.xml'];
 entries['xl/worksheets/sheet1.xml']=strToU8(strFromU8(entries['xl/worksheets/sheet1.xml']).replace('</worksheet>','<tableParts count="1"/></worksheet>'));
 assert.throws(()=>appendKakaoExcelReport(zipSync(entries),draft),/특수/);
});
