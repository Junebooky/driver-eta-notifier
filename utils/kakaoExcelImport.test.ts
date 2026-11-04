import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKakaoExcelReport} from './kakaoExcelImport';
import {appendKakaoExcelReport,workbookFromFile} from './kakaoExcelWorkbook';
import {kakaoWorkbookFixture} from './kakaoExcelFixture';
const input = [
  '10월 24일(토)', '수행담당 : 윤태준', '차량번호 : 700호 1458',
  '출     근 : 9:15', '고객명 : 샤넬', '탑승인원 : 3명',
  '출발지 : 안다즈 호텔', '최종도착지 : 차고지',
  '시작   시간 : 09:15', '종료   시간 : 17:20', '운행총시간 : 8시간 05분',
  '운행일지', '안다즈 호텔 → 09:15 서울 옥션 → 16:00 김포공항 → 14:30 안다즈 호텔 → 17:20 김포공항 / 업무종료 → 16:00 차고지',
  '경비지출', '주유비 : 39,000원', '식비 : 11,900원', '합 계 : 50,900원',
].join('\n');


test('A01 report → approved monthly sheet, only A–L, duplicate protection',()=>{
 const draft={...parseKakaoExcelReport(input).draft,date:'2026-04-24',serviceType:'의전'};
 const result=appendKakaoExcelReport(kakaoWorkbookFixture(),draft);
 const cells=workbookFromFile(result.bytes).Sheets['4월'].cells;
 assert.equal(cells.B245.v,1458); assert.equal(cells.C245.v,'스프린터');
 assert.equal(cells.D245.v,'샤넬'); assert.equal(cells.H245.v,'의전');
 assert.equal(cells.I245.v,'');
 for(const col of ['J','K','L','M']) assert.equal(cells[col+'245'],undefined);
 assert.throws(()=>appendKakaoExcelReport(result.bytes,draft),/중복/);
});
