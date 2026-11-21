import test from 'node:test';
import assert from 'node:assert/strict';
import {formatKoreanEnglishName,resolveDispatchCardEnglishName} from './koreanNameRomanization';

test('company fixed English name format is hyphenated given name, conventional surname last',()=>{
  assert.equal(formatKoreanEnglishName('윤태준'),'Tae-jun Yun');
  assert.equal(formatKoreanEnglishName('윤 태준'),'Tae-jun Yun');
  assert.equal(formatKoreanEnglishName('김민혁'),'Min-hyeok Kim');
  assert.equal(formatKoreanEnglishName('이철수'),'Cheol-su Lee');
  assert.equal(formatKoreanEnglishName('박지민'),'Ji-min Park');
  assert.equal(formatKoreanEnglishName('남궁민수'),'Min-su Namgung');
  assert.equal(formatKoreanEnglishName('이준'),'Jun Lee');
  assert.equal(formatKoreanEnglishName('홍길동'),'Gil-dong Hong');
});
test('romanize only Korean names, with no candidate selection and no API call',()=>{
  assert.equal(formatKoreanEnglishName('QA 테스트'),'');
  assert.equal(formatKoreanEnglishName(''),'');
  assert.equal(formatKoreanEnglishName('James'),'');
  assert.equal(formatKoreanEnglishName('A김'),'');
});
test('already confirmed English names are respected until the Korean name changes',()=>{
  assert.equal(resolveDispatchCardEnglishName('윤태준',undefined),'Tae-jun Yun');
  assert.equal(resolveDispatchCardEnglishName('윤태준','Taejun Yoon'),'Taejun Yoon');
  assert.equal(resolveDispatchCardEnglishName('윤태준','  Tae-jun   Yun  '),'Tae-jun Yun');
});
