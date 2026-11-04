import test from 'node:test';
import assert from 'node:assert/strict';
import {excelVehicleModel,parseKakaoExcelReport,validateKakaoExcelDraft} from './kakaoExcelImport';

const input = [
  '10월 24일(토)', '수행담당 : 윤태준', '차량번호 : 700호 1458',
  '출     근 : 9:15', '고객명 : 샤넬', '탑승인원 : 3명',
  '출발지 : 안다즈 호텔', '최종도착지 : 차고지',
  '시작   시간 : 09:15', '종료   시간 : 17:20', '운행총시간 : 8시간 05분',
  '운행일지', '안다즈 호텔 → 09:15 서울 옥션 → 16:00 김포공항 → 14:30 안다즈 호텔 → 17:20 김포공항 / 업무종료 → 16:00 차고지',
  '경비지출', '주유비 : 39,000원', '식비 : 11,900원', '합 계 : 50,900원',
].join('\n');


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

test('Periods and multiple plates require explicit review; overnight is never silently inferred', () => {
  for (const date of ['4월 1일~30일', '4월 1일 ~ 4월 30일']) {
    const parsed = parseKakaoExcelReport(input.replace('10월 24일(토)',date));
    assert.equal(parsed.draft.date,'');
    assert.ok(parsed.warnings.some(w => w.includes('기간')));
  }
  for (const plate of ['703서2660/2874','700호1458, 700호1234']) {
    const parsed = parseKakaoExcelReport(input.replace('700호 1458',plate));
    assert.equal(parsed.draft.plate,'');
    assert.equal(parsed.draft.model,'');
  }
  assert.equal(parseKakaoExcelReport(input.replace('09:15','17:30').replace('17:20','00:20')).draft.time,'');
  const draft = parseKakaoExcelReport(input).draft;
  assert.deepEqual(validateKakaoExcelDraft({...draft,time:'11(13:20~24:20)'}),[]);
  assert.deepEqual(validateKakaoExcelDraft({...draft,time:'17:30~24:20'}),[]);
  for (const time of ['25:99~26:00','09:15~09:15','17:30~00:20','48:00~49:00','11(13:20~24:20']) assert.ok(validateKakaoExcelDraft({...draft,time}).length);
});
