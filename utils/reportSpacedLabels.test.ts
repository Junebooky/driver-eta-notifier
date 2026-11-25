import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReportInput} from './reportSubmissionValidation';
import {parseKakaoExcelReport,validateKakaoExcelDraft} from './kakaoExcelImport';
import {parseDriverReport} from './driverReportChat';
import {parseDiaryRoute} from './reportDiaryRoute';

// Anonymized regression fixture: same spacing, compact route arrows, secondary
// vehicle note and distinct service/duty clocks as the reported failure.
const raw=[
 '운 행 일 자 : 11월 24일(화)',
 '수 행 담 당 : 검증 기사',
 '차 량 번 호 : 125호9982',
 '출 근 시 간 : 09:00',
 '고   객   명 : 테스트 고객',
 '탑 승 인 원 : 1명',
 '출   발   지 : 차고지',
 '최종도착지 : 차고지',
 '시 작 시 간 : 15:40',
 '종 료 시 간 : 18:00',
 '운행총시간 : 2시간20분',
 '시   작 KM : 36,654 km',
 '종   료 KM : 36,812 km',
 '일일운행합 : 158 km',
 '',
 '운행일지',
 '14:30차고지~>15:40인천공항T1~>18:00테스트 호텔/업무종료~>21:45차고지',
 '',
 '경비지출',
 '통행료 : 11,000원',
 '주유비 : 53,000원(1458)',
 '합   계 : 11,000원',
 '',
 '특이사항:',
 '* 별도 차량회수(1458)',
 '* 호텔 대기 후 복귀',
 '',
 '퇴근시간 : 21:45',
].join('\n');

test('fully spaced labels and tilde arrows pass both intake and Excel parsing',()=>{
 assert.deepEqual(validateReportInput(raw).missing,[]);
 assert.equal(validateReportInput(raw).accepted,true);
 const route=parseDiaryRoute(raw);
 assert.deepEqual(route.stops.map(x=>x.place),['차고지','인천공항T1','테스트 호텔','차고지']);
 assert.deepEqual(route.stops.map(x=>x.time),['14:30','15:40','18:00','21:45']);
 assert.equal(route.invalidTimes,false);
 assert.equal(route.timesOutOfOrder,false);
 const excel=parseKakaoExcelReport(raw,2026);
 assert.deepEqual(excel.missing,[]);
 assert.deepEqual(validateKakaoExcelDraft(excel.draft,2026),[]);
 const report=parseDriverReport(raw,'검증 기사',new Date('2026-11-25'),{workbookYear:2026});
 assert.deepEqual(report.reviewReasons,[]);
 assert.deepEqual(report.warnings,[]);
 assert.equal(report.draft.date,'2026-11-24');
 assert.equal(report.draft.plate,'125호 9982');
 assert.ok(report.vehicleUuid);
 assert.match(report.draft.model,/스프린터.*319/);
 assert.equal(report.draft.driver,'검증 기사');
 assert.equal(report.draft.customer,'테스트 고객');
 assert.equal(report.draft.time,'15:40~18:00');
 assert.equal(report.totalWorkMinutes,140);
 assert.equal(report.draft.route,'차고지 - 인천공항T1 - 테스트 호텔 - 차고지');
 assert.equal(report.draft.amount,'');
 assert.equal(report.draft.payment,'');
 assert.equal(report.draft.totalWithVat,'');
 assert.equal(report.draft.overtime,'');
});

test('spacing tolerance rejects empty fields and sends ambiguous duplicates for review',()=>{
 for(const changed of [
  raw.replace('고   객   명 : 테스트 고객','고   객   명 : '),
  raw.replace('시 작 시 간 : 15:40','시 작\n시 간 : 15:40'),
 ]){
  assert.equal(validateReportInput(changed).accepted,false);
 }
 for(const duplicate of [
  raw.replace('수 행 담 당 : 검증 기사','수 행 담 당 : 검증 기사\n수행담당 : 다른 기사'),
  raw.replace('차 량 번 호 : 125호9982','차 량 번 호 : 125호9982\n차량번호 : 700호1458'),
 ]){
  assert.equal(validateReportInput(duplicate).accepted,true);
  assert.ok(parseDriverReport(duplicate,undefined,new Date('2026-11-25'),{workbookYear:2026}).reviewReasons.length);
 }
 const multiple=raw.replace('125호9982','125호9982/700호1458');
 assert.equal(parseKakaoExcelReport(multiple,2026).draft.plate,'');
 assert.ok(parseDriverReport(multiple,undefined,new Date('2026-11-25'),{workbookYear:2026}).reviewReasons.length);
 const inconsistent=raw.replace('2시간20분','2시간30분(기재 오류)');
 assert.ok(parseDriverReport(inconsistent,undefined,new Date('2026-11-25'),{workbookYear:2026}).reviewReasons.some(x=>x.includes('총시간')));
});

test('alternate tilde arrows preserve timed and untimed stops without stripping place punctuation',()=>{
 const timed=parseDiaryRoute('운행일지\n09:00차고지～＞10:00호텔-별관~ >11:00차고지');
 assert.deepEqual(timed.stops.map(x=>x.place),['차고지','호텔-별관','차고지']);
 const untimed=parseDiaryRoute('운행일지\n차고지~>호텔-별관~>차고지');
 assert.deepEqual(untimed.stops.map(x=>x.place),['차고지','호텔-별관','차고지']);
});
