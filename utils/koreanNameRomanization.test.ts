import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestKoreanEnglishNames} from './koreanNameRomanization';

test('Korean names get romanization candidates, not translated meanings',()=>{
  assert.deepEqual(suggestKoreanEnglishNames('윤태준'),['Taejun Yoon','Tae-jun Yoon','Taejun Yun']);
  assert.equal(suggestKoreanEnglishNames('김민혁')[0],'Minhyeok Kim');
  assert.equal(suggestKoreanEnglishNames('이철수')[0],'Cheolsu Lee');
  assert.deepEqual(suggestKoreanEnglishNames('QA 테스트'),[]);
  assert.deepEqual(suggestKoreanEnglishNames(''),[]);
  assert.deepEqual(suggestKoreanEnglishNames('James'),[]);
});
test('common surnames and compound surnames remain distinct and editable',()=>{
  assert.equal(suggestKoreanEnglishNames('박지민')[0],'Jimin Park');
  assert.equal(suggestKoreanEnglishNames('남궁민수')[0],'Minsu Namgung');
  assert.ok(suggestKoreanEnglishNames('이현준').some(s=>s.endsWith(' Lee')));
  // No auto-saving or replacement of a person's passport spelling occurs here.
});
