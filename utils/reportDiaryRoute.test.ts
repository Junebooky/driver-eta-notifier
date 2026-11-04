import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDiaryRoute,statedReportTime} from './reportDiaryRoute';
import {validateReportInput} from './reportSubmissionValidation';
import {parseKakaoExcelReport} from './kakaoExcelImport';
import {parseDriverReport,routeFromDiary} from './driverReportChat';

const example='17:00 차고지 발 -> 18:00 포시즌스호텔 서울 픽업 -> 19:30 여의도 파크원 타워 > 21:40 청담동 미쉐린 다이닝(대기) > 24:20 한남동 프라이빗 바 이동 - 익일 03:30 게스트 3인 한남더힐/나인원 순차 드롭 > 04:15 메인 VIP 포시즌스 복귀 샌딩(운행종료) > 05:10 차고지 입고';
const places=[
 '차고지 발','포시즌스호텔 서울 픽업','여의도 파크원 타워',
 '청담동 미쉐린 다이닝(대기)','한남동 프라이빗 바 이동',
 '게스트 3인 한남더힐/나인원 순차 드롭',
 '메인 VIP 포시즌스 복귀 샌딩(운행종료)','차고지 입고'
];
const raw=[
 '2026년 11월 4일','수행담당 : 검증 기사','차량번호 : 700호 1458',
 '고객명 : VIP 행사','출발지 : 차고지','최종도착지 : 차고지',
 '시작 시간 : 17:00','종료 시간 : 익일 05:10','운행총시간 : 12시간 10분',
 '운행일지',example,'경비지출','통행료 : 1,000원'
].join('\n');

test('mixed arrows, > and standalone dash preserve all eight waypoints with next-day times',()=>{
 const data=parseDiaryRoute(raw);
 assert.equal(data.present,true);
 assert.deepEqual(data.stops.map(x=>x.place),places);
 assert.deepEqual(data.stops.map(x=>x.time),
  ['17:00','18:00','19:30','21:40','24:20','27:30','28:15','29:10']);
 assert.equal(data.timesOutOfOrder,false);
 assert.equal(data.invalidTimes,false);
 assert.equal(validateReportInput(raw).accepted,true);
 const excel=parseKakaoExcelReport(raw,2026);
 assert.deepEqual(excel.missing,[]);
 assert.equal(excel.draft.route,places.join(' → '));
 assert.equal(excel.draft.time,'17:00~29:10');
 assert.equal(excel.warnings.some(w=>w.includes('경유시간')),false);
 const report=parseDriverReport(raw,'검증 기사');
 assert.equal(report.draft.route,places.join(' - '));
 assert.equal(report.draft.time,'17:00~29:10');
 assert.equal(report.totalWorkMinutes,730);
 assert.deepEqual(report.reviewReasons,[]);
});

test('standalone dash and > split no-time stop lists; hyphenated proper names stay intact',()=>{
 const diary='운행일지\n차고지 - 그랜드-인터컨티넨탈 서울 > 강남-테헤란로 - 차고지\n경비지출\n식비 : 11,000원';
 const parsed=parseDiaryRoute(diary);
 assert.deepEqual(parsed.stops.map(s=>s.place),['차고지','그랜드-인터컨티넨탈 서울','강남-테헤란로','차고지']);
 assert.equal(routeFromDiary(diary),'차고지 - 그랜드-인터컨티넨탈 서울 - 강남-테헤란로 - 차고지');
 const same=raw.replace(example, '17:00 차고지 - 18:00 호텔 > 19:30 차고지');
 assert.equal(validateReportInput(same).accepted,true);
 assert.deepEqual(parseDiaryRoute(same).stops.map(s=>s.place),['차고지','호텔','차고지']);
});

test('next-day clock conversion is explicit; never silently roll over an earlier bare time',()=>{
 assert.equal(statedReportTime('익일 03:30'),'27:30');
 assert.equal(statedReportTime('다음날 05:10'),'29:10');
 assert.equal(statedReportTime('24:20'),'24:20');
 assert.equal(statedReportTime('03:30'),'03:30');
 assert.equal(statedReportTime('익일 25:10'),'');
 assert.equal(statedReportTime('익일 03:80'),'');
 const ambiguous=parseDiaryRoute('운행일지\n23:45 호텔 > 02:10 차고지');
 assert.deepEqual(ambiguous.stops.map(s=>s.time),['23:45','02:10']);
 assert.equal(ambiguous.timesOutOfOrder,true);
 const explicit=parseDiaryRoute('운행일지\n23:45 호텔 > 익일 02:10 차고지 > 03:50 차고지');
 assert.deepEqual(explicit.stops.map(s=>s.time),['23:45','26:10','27:50']);
 assert.equal(explicit.timesOutOfOrder,false);
});

test('invalid waypoint clocks are not silently accepted into automatic Excel processing',()=>{
 const invalid=raw.replace('익일 03:30','익일 03:99');
 assert.equal(validateReportInput(invalid).accepted,true); // Raw report still accepted for HQ review.
 const excel=parseKakaoExcelReport(invalid,2026);
 assert.ok(excel.warnings.some(w=>w.includes('올바르지 않은 경유시간')));
 const driver=parseDriverReport(invalid,'검증 기사');
 assert.ok(driver.reviewReasons.some(s=>s.includes('경유시간')));
});
