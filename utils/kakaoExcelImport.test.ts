import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  excelVehicleModel, parseKakaoExcelReport, validateKakaoExcelDraft,
  type KakaoExcelDraft,
} from './kakaoExcelImport';
import {appendKakaoExcelReport} from './kakaoExcelWorkbook';

const input = [
  '10월 24일(토)', '수행담당 : 윤태준', '차량번호 : 700호 1458',
  '출     근 : 9:15', '고객명 : 샤넬', '탑승인원 : 3명',
  '출발지 : 안다즈 호텔', '최종도착지 : 차고지',
  '시작   시간 : 09:15', '종료   시간 : 17:20', '운행총시간 : 8시간 05분',
  '운행일지', '안다즈 호텔 → 09:15 서울 옥션 → 16:00 김포공항 → 14:30 안다즈 호텔 → 17:20 김포공항 / 업무종료 → 16:00 차고지',
  '경비지출', '주유비 : 39,000원', '식비 : 11,900원', '합 계 : 50,900원',
].join('\n');

function book() {
  const workbook = XLSX.utils.book_new();
  const april = XLSX.utils.aoa_to_sheet([
    [45184,7725,'차종','거래처','운전자','타임','센딩,픽업','셀프/의전','OT Hours','합계','결제방법','합계(부포함)'],
    [46113,1458,'스프린터','기존 고객사','기존 기사','09:00~17:00','기존 경로','의전',null,null,null,null],
  ]);
  XLSX.utils.book_append_sheet(workbook,april,'4월');
  return new Uint8Array(XLSX.write(workbook,{type:'array',bookType:'xlsx'}));
}

test('Kakao report reads only workbook fields, never sums expense as sale',()=>{
  const {draft,warnings,missing}=parseKakaoExcelReport(input,2026);
  assert.equal(draft.date,'2026-10-24');
  assert.equal(draft.plate,'700호 1458');
  assert.equal(draft.model,'스프린터');
  assert.equal(draft.customer,'샤넬');
  assert.equal(draft.driver,'윤태준');
  assert.equal(draft.time,'09:15~17:20');
  assert.equal(draft.route,'안다즈 호텔 - 차고지');
  assert.equal(draft.overtime,'');
  assert.equal(draft.amount,'');
  assert.equal(draft.totalWithVat,'');
  assert.equal(draft.payment,'');
  assert.equal(draft.serviceType,'');
  assert.deepEqual(missing,[]);
  assert.ok(warnings.some(x=>x.includes('경유시간')));
});

test('Full plate lookup does not guess from suffix and invalid date/time are not allowed',()=>{
  assert.equal(excelVehicleModel('700호 1458'),'스프린터');
  assert.equal(excelVehicleModel('999호 1458'),'');
  const {draft}=parseKakaoExcelReport('2026년 2월 30일\n차량번호: 700호 1458\n수행담당: 윤태준\n고객명: 샤넬\n시작 시간: 25:99\n종료 시간: 17:20');
  assert.equal(draft.date,'');
  assert.equal(draft.time,'');
  assert.ok(validateKakaoExcelDraft({...draft,date:'2026-02-30'}).length>0);
});

test('New month preserves existing 4월 data, only A-L, and prevents duplicate re-import',()=>{
  const original=book();
  const draft:KakaoExcelDraft={...parseKakaoExcelReport(input).draft,serviceType:'의전'};
  const result=appendKakaoExcelReport(original,draft);
  assert.equal(result.sheetName,'10월');
  assert.equal(result.rowNumber,2);
  assert.equal(result.createdMonth,true);
  const after=XLSX.read(result.bytes,{type:'array'});
  assert.deepEqual(after.SheetNames,['4월','10월']);
  assert.equal(after.Sheets['4월']['D2'].v,'기존 고객사');
  assert.equal(after.Sheets['4월']['A1'].v,45184);
  assert.equal(after.Sheets['10월']['A2'].v,46319);
  assert.equal(after.Sheets['10월']['B2'].v,1458);
  assert.equal(after.Sheets['10월']['D2'].v,'샤넬');
  assert.equal(after.Sheets['10월']['H2'].v,'의전');
  for(const col of ['I','J','K','L']) assert.equal(after.Sheets['10월'][col+'2'],undefined);
  assert.throws(()=>appendKakaoExcelReport(result.bytes,draft),/중복/);
  const other=appendKakaoExcelReport(result.bytes,{...draft,time:'18:00~19:00'});
  assert.equal(other.rowNumber,3);
});
