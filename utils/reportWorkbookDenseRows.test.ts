import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
import {addApprovedMonth} from './reportWorkbookOperations';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {organizeManagedMonth} from './reportWorkbookRowOrder';
import {readWorkbookGrid} from './reportWorkbookGrid';
import {blankKakaoExcelDraft} from './kakaoExcelImport';

const path='xl/worksheets/sheet3.xml';
const draft={...blankKakaoExcelDraft(),date:'2026-11-02',plate:'700호1458',
 model:'스타리아',customer:'과거 고객',driver:'기사',time:'08:00~18:00'};

function rowFragment(xml:string,row:number){
 const match=xml.match(new RegExp('<row\\b(?=[^>]*\\br="'+row+'")[^>]*>[\\s\\S]*?<\\/row>'));
 if(!match)throw Error(row+'행 XML을 찾을 수 없습니다.');
 return match[0];
}
function relocate(xml:string,from:number,to:number){
 return xml.replace(new RegExp('(<row\\b[^>]*\\br=")'+from+'(")'),(_all,a:string,b:string)=>a+to+b)
  .replace(new RegExp('(\\br="[A-Z]+)'+from+'(")','g'),(_all,a:string,b:string)=>a+to+b);
}
/** Old production behavior: the template dimension ended after row 201,
 * so two new reports landed in physical rows 202 and 203. */
function spacedWorkbook(){
 const blank=addApprovedMonth(kakaoWorkbookFixture(),'4월',11);
 const legacy=appendKakaoExcelReport(blank,draft);
 const first=appendKakaoExcelReport(legacy.bytes,{...draft,date:'2026-11-08',plate:'700호1336',customer:'관리 보고 A'});
 const second=appendKakaoExcelReport(first.bytes,{...draft,date:'2026-11-18',plate:'700호2658',customer:'관리 보고 B'});
 assert.deepEqual([legacy.rowNumber,first.rowNumber,second.rowNumber],[2,3,4]);
 const entries=unzipSync(second.bytes);
 let xml=strFromU8(entries[path]);
 const movedA=relocate(rowFragment(xml,3),3,202),movedB=relocate(rowFragment(xml,4),4,203);
 xml=xml.replace(rowFragment(xml,3),'<row r="3" s="1"/>')
  .replace(rowFragment(xml,4),'<row r="4" s="1"/>')
  .replace('</sheetData>',movedA+movedB+'</sheetData>');
 xml=xml.replace('</worksheet>',
  '<conditionalFormatting sqref="B2:B201"><cfRule type="expression" priority="1"><formula>TRUE</formula></cfRule></conditionalFormatting>'+
  '<dataValidations count="1"><dataValidation sqref="D2:D201" type="list"><formula1>"Y,N"</formula1></dataValidation></dataValidations>'+
  '<autoFilter ref="A1:L203"/></worksheet>');
 entries[path]=strToU8(xml);
 return {bytes:zipSync(entries,{level:6}),members:entries};
}
const idA='00000000-0000-4000-8000-000000000202';
const idB='00000000-0000-4000-8000-000000000203';

test('new reports use the first safe blank row, not the last formatted worksheet cell',()=>{
 const blank=addApprovedMonth(kakaoWorkbookFixture(),'4월',11);
 const first=appendKakaoExcelReport(blank,draft);
 assert.equal(first.rowNumber,2);
 const second=appendKakaoExcelReport(first.bytes,{...draft,date:'2026-11-08',plate:'700호1336'});
 assert.equal(second.rowNumber,3);
 const sheet=workbookFromFile(second.bytes).Sheets['11월'];
 assert.equal(sheet.cells.L113.v,'');
 assert.equal(sheet.cells.D2.v,'과거 고객');
 assert.equal(sheet.cells.B3.v,1336);
});

test('historical 202/203 reports compact to 3/4, preserving formula/footer, metadata and UUID moves',()=>{
 const {bytes,members}=spacedWorkbook();
 const before=readWorkbookGrid(bytes,'11월');
 assert.deepEqual(before.rowGap,{after:2,before:202,gap:199});
 const manifest={[idA]:{sheet:'11월',row:202},[idB]:{sheet:'11월',row:203}};
 const out=organizeManagedMonth(bytes,'11월',2026,manifest);
 assert.equal(out.changed,true,out.reason);
 assert.deepEqual(out.moves,{[idA]:3,[idB]:4});
 const sheet=workbookFromFile(out.bytes).Sheets['11월'];
 assert.equal(sheet.cells.D2.v,'과거 고객');
 assert.equal(sheet.cells.D3.v,'관리 보고 A');
 assert.equal(sheet.cells.D4.v,'관리 보고 B');
 assert.equal(sheet.cells.D202?.v||'','');
 assert.equal(sheet.cells.D203?.v||'','');
 assert.equal(sheet.cells.L113.v,'');
 const view=readWorkbookGrid(out.bytes,'11월');
 assert.equal(view.rowGap,null);
 assert.deepEqual(view.rows.map(row=>row.row).filter(row=>row<10),[2,3,4]);
 const result=unzipSync(out.bytes),xml=strFromU8(result[path]);
 assert.match(xml,/<conditionalFormatting sqref="B2:B201">/);
 assert.match(xml,/<dataValidations count="1">/);
 assert.match(xml,/<autoFilter ref="A1:L203"\/>/);
 assert.match(xml,/<c r="L113"[^>]*><f>SUM\(J2:J112\)\*1\.1<\/f>/);
 for(const name of Object.keys(members))if(name!==path)assert.deepEqual(result[name],members[name]);
 assert.deepEqual(unzipSync(bytes)[path],members[path],'versioned original bytes stay untouched');
});

test('records appended after a historic 202/203 gap use the first blank row, not 204',()=>{
 const {bytes}=spacedWorkbook();
 const appended=appendKakaoExcelReport(bytes,{...draft,date:'2026-11-12',plate:'700호8040',customer:'추가 기사 보고'});
 assert.equal(appended.rowNumber,3);
 const normalized=organizeManagedMonth(appended.bytes,'11월',2026,
  {[idA]:{sheet:'11월',row:202},[idB]:{sheet:'11월',row:203}},
  {row:appended.rowNumber,date:'2026-11-12'});
 assert.equal(normalized.changed,true,normalized.reason);
 assert.equal(normalized.rowNumber,4);
 assert.equal(normalized.moves[idA],3);
 assert.equal(normalized.moves[idB],5);
});

test('explicit formulas pinned to an old report row block a destructive move',()=>{
 const {bytes}=spacedWorkbook(),entries=unzipSync(bytes);
 entries[path]=strToU8(strFromU8(entries[path]).replace('</sheetData>',
  '<row r="250"><c r="L250"><f>J202*2</f><v>0</v></c></row></sheetData>'));
 const target=zipSync(entries);
 const out=organizeManagedMonth(target,'11월',2026,{[idA]:{sheet:'11월',row:202}});
 assert.equal(out.changed,false);
 assert.match(out.reason||'',/수식/);
 assert.deepEqual(out.bytes,target);
});
