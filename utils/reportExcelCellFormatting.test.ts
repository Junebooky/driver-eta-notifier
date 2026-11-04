import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {unzipSync,strFromU8,strToU8,zipSync} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {routeColumnWidth,EXCEL_MAX_COL_WIDTH} from './reportExcelCellFormatting';
import {amendReportRow} from './reportWorkbookOperations';
import {patchWorkbookCell} from './reportWorkbookGrid';
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
 return {size:Number(font.getElementsByTagName('sz')[0]?.getAttribute('val')),wrap:xf.getElementsByTagName('alignment')[0]?.getAttribute('wrapText'),shrink:xf.getElementsByTagName('alignment')[0]?.getAttribute('shrinkToFit')};
};
test('New A-L report row uses 10pt G/H/I, non-wrapped G and 11pt elsewhere, with wider columns',()=>{
 const output=appendKakaoExcelReport(kakaoWorkbookFixture(),report);
 for(const col of ['G','H','I']){
  const style=cellStyle(output.bytes,col,245);
  assert.equal(style.size,10,col);assert.equal(style.wrap,col==='G'?'0':'1',col);
  if(col==='G')assert.equal(style.shrink,'1');
 }
 for(const col of ['A','B','C','D','E','F','J','K','L']){
  assert.equal(cellStyle(output.bytes,col,245).size,11,col);
 }
 const sheet=strFromU8(unzipSync(output.bytes)['xl/worksheets/sheet1.xml']);
 assert.match(sheet,new RegExp('<col min="7" max="7" width="'+routeColumnWidth([report.route])+'" customWidth="1"\\/>'));
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
test('G route width refits to contents, while grouped neighbouring column widths remain intact',()=>{
 const entries=unzipSync(kakaoWorkbookFixture());
 const sheet=strFromU8(entries['xl/worksheets/sheet1.xml']);
 entries['xl/worksheets/sheet1.xml']=strToU8(sheet.replace('</cols>','<col min="5" max="10" width="75" customWidth="1"/></cols>'));
 const output=appendKakaoExcelReport(zipSync(entries),report);
 const after=strFromU8(unzipSync(output.bytes)['xl/worksheets/sheet1.xml']);
 for(const col of [7,8,9])assert.match(after,new RegExp('<col[^>]*min="'+col+'"[^>]*max="'+col+'"[^>]*width="'+(col===7?routeColumnWidth([report.route]):75)+'"'));
 assert.match(after,/<col min="5" max="6" width="75" customWidth="1"\/>/);
 assert.match(after,/<col min="10" max="10" width="75" customWidth="1"\/>/);
});
test('Corrected report row remains 10pt G/H/I without growing style definitions',()=>{
 const first=appendKakaoExcelReport(kakaoWorkbookFixture(),report);
 const adjusted=amendReportRow(first.bytes,'4월',245,{...report,time:'10:00~18:00'});
 for(const col of ['G','H','I'])assert.equal(cellStyle(adjusted.bytes,col,245).size,10);
 assert.deepEqual(unzipSync(first.bytes)['xl/styles.xml'],unzipSync(adjusted.bytes)['xl/styles.xml']);
});

test('G expands to the longest service route in the month, remains one line, and H has the chosen category',()=>{
 const firstRoute=Array.from({length:55},()=> '서울호텔').join(' → ');
 const secondRoute=Array.from({length:60},()=> '인천공항').join(' → ');
 const first=appendKakaoExcelReport(kakaoWorkbookFixture(),{...report,route:firstRoute,serviceType:'김포공항 샌딩'});
 const output=appendKakaoExcelReport(first.bytes,{...report,date:'2026-04-07',route:secondRoute,serviceType:'인천공항 샌딩'});
 const sheet=strFromU8(unzipSync(output.bytes)['xl/worksheets/sheet1.xml']);
 const col=sheet.match(/<col min="7" max="7" width="([^"]+)"/)?.[1];
 assert.equal(Number(col),routeColumnWidth([firstRoute,secondRoute]));
 assert.equal(Number(col),EXCEL_MAX_COL_WIDTH);
 const book=workbookFromFile(output.bytes);
 assert.equal(book.Sheets['4월'].cells.G245.v,firstRoute);
 assert.equal(book.Sheets['4월'].cells.H245.v,'김포공항 샌딩');
 assert.equal(book.Sheets['4월'].cells.G246.v,secondRoute);
 assert.equal(book.Sheets['4월'].cells.H246.v,'인천공항 샌딩');
 assert.equal(cellStyle(output.bytes,'G',245).wrap,'0');
 assert.equal(cellStyle(output.bytes,'G',246).wrap,'0');
});
test('G grows between 62 and 255 and does not shrink when a short report is appended or corrected',()=>{
 const longRoute=Array.from({length:24},()=> '호텔').join(' → ');
 const first=appendKakaoExcelReport(kakaoWorkbookFixture(),{...report,route:longRoute,serviceType:'의전'});
 const firstWidth=Number(strFromU8(unzipSync(first.bytes)['xl/worksheets/sheet1.xml']).match(/<col min="7" max="7" width="([^"]+)"/)?.[1]);
 assert.equal(firstWidth,routeColumnWidth([longRoute]));
 assert.ok(firstWidth>62&&firstWidth<EXCEL_MAX_COL_WIDTH);
 const second=appendKakaoExcelReport(first.bytes,{...report,date:'2026-04-07',route:'차고지 → 호텔'});
 const secondWidth=Number(strFromU8(unzipSync(second.bytes)['xl/worksheets/sheet1.xml']).match(/<col min="7" max="7" width="([^"]+)"/)?.[1]);
 assert.equal(secondWidth,firstWidth);
 const adjusted=amendReportRow(second.bytes,'4월',246,{...report,date:'2026-04-07',route:longRoute+' → 차고지'});
 const amendedWidth=Number(strFromU8(unzipSync(adjusted.bytes)['xl/worksheets/sheet1.xml']).match(/<col min="7" max="7" width="([^"]+)"/)?.[1]);
 assert.ok(amendedWidth>=firstWidth);
 assert.equal(cellStyle(adjusted.bytes,'G',246).wrap,'0');
});

test('G width shrinks after the previously longest route is shortened, keeping other XML parts',()=>{
 const longRoute=Array.from({length:35},()=> '파르나스').join(' - ');
 const first=appendKakaoExcelReport(kakaoWorkbookFixture(),{...report,route:longRoute});
 const before=unzipSync(first.bytes);
 const previous=Number(strFromU8(before['xl/worksheets/sheet1.xml']).match(/<col min="7" max="7" width="([^"]+)"/)?.[1]);
 assert.ok(previous>70);
 const edited=patchWorkbookCell(first.bytes,'4월',245,'G','차고지 - 호텔');
 const after=unzipSync(edited.bytes);
 const newWidth=Number(strFromU8(after['xl/worksheets/sheet1.xml']).match(/<col min="7" max="7" width="([^"]+)"/)?.[1]);
 assert.equal(newWidth,routeColumnWidth(['차고지 - 호텔']));
 assert.ok(newWidth<previous);
 assert.equal(workbookFromFile(edited.bytes).Sheets['4월'].cells.G245.v,'차고지 - 호텔');
 for(const part of Object.keys(before))if(part!=='xl/worksheets/sheet1.xml')assert.deepEqual(before[part],after[part]);
});
