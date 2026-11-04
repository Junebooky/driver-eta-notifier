import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {unzipSync,strFromU8,strToU8,zipSync} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {appendKakaoExcelReport} from './kakaoExcelWorkbook';
import {amendReportRow} from './reportWorkbookOperations';
import {blankKakaoExcelDraft} from './kakaoExcelImport';
const parser=new DOMParser();
const report={...blankKakaoExcelDraft(),date:'2026-04-06',plate:'700호 1458',
 model:'스프린터',customer:'서식 검증 고객',driver:'검증 기사',
 time:'09:00~17:00',route:'차고지 → 호텔 → 공항 → 호텔 → 회의장 → 호텔 → 차고지 → 사무실 → 차고지',
 serviceType:'의전',overtime:'OT 2시간 / 심야 1시간',amount:'150000',payment:'카드',totalWithVat:'165000'};
const cellStyle=(bytes:Uint8Array,col:string,row:number)=>{
 const entries=unzipSync(bytes);
 const styles=parser.parseFromString(strFromU8(entries['xl/styles.xml']),'application/xml');
 const sheet=parser.parseFromString(strFromU8(entries['xl/worksheets/sheet1.xml']),'application/xml');
 const cells=Array.from(sheet.getElementsByTagName('c'));
 const cell=cells.find(x=>x.getAttribute('r')===col+row);
 assert.ok(cell,'Expected styled cell '+col+row);
 const index=Number(cell.getAttribute('s')||0);
 const xf=styles.getElementsByTagName('cellXfs')[0].getElementsByTagName('xf')[index];
 assert.ok(xf,'Expected style index '+index);
 const fontId=Number(xf.getAttribute('fontId')||0);
 const font=styles.getElementsByTagName('fonts')[0].getElementsByTagName('font')[fontId];
 assert.ok(font,'Expected font '+fontId);
 return {size:Number(font.getElementsByTagName('sz')[0]?.getAttribute('val')),wrap:xf.getElementsByTagName('alignment')[0]?.getAttribute('wrapText')};
};
test('New A-L report row uses 10pt G/H/I with wrapping, 11pt elsewhere, with widened columns',()=>{
 const output=appendKakaoExcelReport(kakaoWorkbookFixture(),report);
 for(const col of ['G','H','I']){
  const style=cellStyle(output.bytes,col,245);
  assert.equal(style.size,10,col);assert.equal(style.wrap,'1',col);
 }
 for(const col of ['A','B','C','D','E','F','J','K','L']){
  assert.equal(cellStyle(output.bytes,col,245).size,11,col);
 }
 const sheet=strFromU8(unzipSync(output.bytes)['xl/worksheets/sheet1.xml']);
 assert.match(sheet,/<col min="7" max="7" width="62" customWidth="1"\/>/);
 assert.match(sheet,/<col min="8" max="8" width="22" customWidth="1"\/>/);
 assert.match(sheet,/<col min="9" max="9" width="29" customWidth="1"\/>/);
 assert.match(sheet,/<col min="1" max="1" width="22" customWidth="1"\/>/);
 const row=sheet.match(/<row\b(?=[^>]*\br="245")[^>]*>/)?.[0];
 assert.ok(row);assert.ok(Number(row.match(/\bht="([^"]+)"/)?.[1])>=24);
});
test('Blank H/I still carry 10pt and subsequent append reuses styles',()=>{
 const first=appendKakaoExcelReport(kakaoWorkbookFixture(),{...report,serviceType:'',overtime:''});
 assert.equal(cellStyle(first.bytes,'H',245).size,10);
 assert.equal(cellStyle(first.bytes,'I',245).size,10);
 const second=appendKakaoExcelReport(first.bytes,{...report,time:'18:00~19:00',serviceType:'',overtime:''});
 assert.deepEqual(unzipSync(second.bytes)['xl/styles.xml'],unzipSync(first.bytes)['xl/styles.xml']);
});
test('Existing wider width is not reduced; overlapping groups are split without losing neighbours',()=>{
 const entries=unzipSync(kakaoWorkbookFixture());
 const sheet=strFromU8(entries['xl/worksheets/sheet1.xml']);
 entries['xl/worksheets/sheet1.xml']=strToU8(sheet.replace('</cols>','<col min="5" max="10" width="75" customWidth="1"/></cols>'));
 const output=appendKakaoExcelReport(zipSync(entries),report);
 const after=strFromU8(unzipSync(output.bytes)['xl/worksheets/sheet1.xml']);
 for(const col of [7,8,9])assert.match(after,new RegExp('<col[^>]*min="'+col+'"[^>]*max="'+col+'"[^>]*width="75"'));
 assert.match(after,/<col min="5" max="6" width="75" customWidth="1"\/>/);
 assert.match(after,/<col min="10" max="10" width="75" customWidth="1"\/>/);
});
test('Corrected report row remains 10pt G/H/I without growing style definitions',()=>{
 const first=appendKakaoExcelReport(kakaoWorkbookFixture(),report);
 const adjusted=amendReportRow(first.bytes,'4월',245,{...report,time:'10:00~18:00'});
 for(const col of ['G','H','I'])assert.equal(cellStyle(adjusted.bytes,col,245).size,10);
 assert.deepEqual(unzipSync(first.bytes)['xl/styles.xml'],unzipSync(adjusted.bytes)['xl/styles.xml']);
});
