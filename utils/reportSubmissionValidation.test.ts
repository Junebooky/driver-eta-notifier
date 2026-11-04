import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReportInput} from './reportSubmissionValidation';
import {buildDriverReportTemplate} from './reportChatTemplate';

const valid='2026년 11월 4일\n수행담당 : 김승준\n차량번호 : 73호2553\n고객명 : 인터코스\n시작   시간 : 09:00\n종료   시간 : 21:50\n운행일지\n07:00 차고지 -> 08:50 메리어트 호텔 -> 21:50 차고지\n경비지출\n통행료 : 1,000원';

test('Small talk or junk text is never interpreted as a report',()=>{
 for(const message of ['ㅎㅎ','ㅋㅋㅋ','안녕하세요','감사합니다','넵','', '오늘도 수고 많았어요']){
  const checked=validateReportInput(message);
  assert.equal(checked.accepted,false,message);
  assert.equal(checked.needsTemplate,true);
  assert.match(checked.reply,/양식/);
 }
});
test('Partially filled report and blank template are rejected with missing field hints',()=>{
 const empty=validateReportInput(buildDriverReportTemplate('2026-11-04'));
 assert.equal(empty.accepted,false);
 assert.ok(empty.missing.includes('수행담당'));
 assert.ok(empty.missing.includes('운행일지(경유지 2곳 이상)'));
 const partial=validateReportInput(valid.replace('고객명 : 인터코스','고객명 : '));
 assert.equal(partial.accepted,false);
 assert.ok(partial.missing.includes('고객명'));
 assert.match(partial.reply,/고객명/);
});
test('Complete report passes, extra odometer and expense data do not change report classification',()=>{
 assert.equal(validateReportInput(valid).accepted,true);
 const expanded=valid.replace('운행일지', '시작km : 154,725 km\n종료km : 154,861 km\n일일운행합 : 136 km\n운행일지').replace('경비지출','경비지출\n주차비 : 18,800원\n식 비 : 9,500원');
 assert.equal(validateReportInput(expanded).accepted,true);
});
test('Missing or single-stop route does not qualify even when the other fields are filled',()=>{
 assert.equal(validateReportInput(valid.replace('07:00 차고지 -> 08:50 메리어트 호텔 -> 21:50 차고지','')).accepted,false);
 assert.equal(validateReportInput(valid.replace('07:00 차고지 -> 08:50 메리어트 호텔 -> 21:50 차고지','차고지')).accepted,false);
});
