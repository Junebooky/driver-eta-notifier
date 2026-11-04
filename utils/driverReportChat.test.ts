import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDriverReport,workMinutes,koreaDate,routeFromDiary} from './driverReportChat';
const raw=(time='09:15~17:20',plate='700호 1458')=>`2026년 10월 24일\n수행담당 : 검증 기사\n차량번호 : ${plate}\n고객명 : 샤넬\n시작 시간 : ${time.split('~')[0]}\n종료 시간 : ${time.split('~')[1]}\n운행일지\n안다즈 호텔 → 09:15 서울 옥션 → 16:00 김포공항 → 14:30 안다즈 호텔 → 17:20 김포공항 / 업무종료 → 16:00 차고지\n경비지출\n합계 : 50,000원`;
test('company report keeps repeated stops in original order and maps standard models with UUID',()=>{
 const p=parseDriverReport(raw(),'검증 기사');
 assert.deepEqual(p.reviewReasons,[]);assert.equal(p.draft.model,'스프린터 319');assert.ok(p.vehicleUuid);
 assert.equal(p.draft.route,'안다즈 호텔 - 서울 옥션 - 김포공항 - 안다즈 호텔 - 김포공항 - 차고지');
 assert.ok(p.warnings.some(w=>w.includes('경유시간')));assert.equal(p.draft.overtime,'');
 assert.equal(p.draft.amount,'');assert.equal(p.draft.totalWithVat,'');
 for(const [plate,model] of [['711하 1058','스프린터 519'],['193호 5336','카니발 하이리무진'],['125호 7665','스타리아']])assert.equal(parseDriverReport(raw(undefined,plate)).draft.model,model);
});
test('10 hour duty threshold excludes night minutes from ordinary OT',()=>{
 assert.deepEqual(workMinutes('06:00','16:40'),{total:640,ot:40,night:0});
 assert.deepEqual(workMinutes('08:00','20:00'),{total:720,ot:120,night:0});
 assert.deepEqual(workMinutes('10:00','24:00'),{total:840,ot:120,night:120});
 assert.equal(parseDriverReport(raw('06:00~16:40')).draft.overtime,'OT 40분');
 assert.equal(parseDriverReport(raw('10:00~24:00')).draft.overtime,'OT 2시간 / 심야 2시간');
 assert.equal(parseDriverReport(raw('18:00~24:00')).draft.overtime,'심야 2시간');
 assert.equal(workMinutes('22:00','02:00'),null);assert.equal(workMinutes('10:00','35:00'),null);
});
test('uncertain plate, period, year, overnight and impersonated names require review',()=>{
 assert.ok(parseDriverReport(raw(undefined,'1458')).vehicleUuid);
 assert.ok(parseDriverReport(raw(undefined,'9999')).reviewReasons.length);
 assert.ok(parseDriverReport(raw(undefined,'700호1458/711하1058')).reviewReasons.length);
 assert.ok(parseDriverReport(raw().replace('2026년 10월 24일','10월 24일')).reviewReasons.some(s=>s.includes('연도')));
 assert.ok(parseDriverReport(raw().replace('10월 24일','10월 24일~30일')).reviewReasons.length);
 assert.ok(parseDriverReport(raw('22:00~02:00')).reviewReasons.length);
 assert.ok(parseDriverReport(raw(),'다른 기사').reviewReasons.some(s=>s.includes('기사명')));
 assert.equal(koreaDate(new Date('2026-11-03T16:00:00Z')),'2026-11-04');
 assert.equal(routeFromDiary('운행일지\n서울 → 업무종료 → 서울\n특이사항\n경비'),'서울 - 서울');
});
test('yearless reports use the active ledger year, never the server calendar; night end is configurable',()=>{
 const message=raw('10:00~24:00').replace('2026년 ','');
 const p=parseDriverReport(message,'검증 기사',new Date('2030-01-01'),{workbookYear:2026,nightEndHour:6});
 assert.deepEqual(p.reviewReasons,[]);assert.equal(p.draft.date,'2026-10-24');assert.equal(p.draft.model,'스프린터 319');
 assert.equal(p.draft.overtime,'OT 2시간 / 심야 2시간');
 assert.deepEqual(workMinutes('20:00','30:00',4),{total:600,ot:0,night:360});
});
