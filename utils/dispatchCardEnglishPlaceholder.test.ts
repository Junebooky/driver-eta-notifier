import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatKoreanEnglishName, resolveDispatchCardEnglishName } from './koreanNameRomanization';

// Guard the mobile and PC builder's one-tap name interaction against regressions.
// The placeholder is only a suggestion, never a silently saved value.
const builder = readFileSync(
  join(process.cwd(), 'components/hq/drivers/HqDispatchCardBuilderModal.tsx'), 'utf8',
);

test('Korean chauffeur names produce one deterministic placeholder value', () => {
  assert.equal(formatKoreanEnglishName('윤태준'), 'Tae-jun Yoon');
  assert.equal(formatKoreanEnglishName('김민혁'), 'Min-hyeok Kim');
  assert.equal(formatKoreanEnglishName('QA 테스트'), '');
  assert.equal(resolveDispatchCardEnglishName('윤태준', 'Taejun Yoon'), 'Taejun Yoon');
});

test('English-name placeholder can be filled with one tap or apply button', () => {
  assert.match(builder, /placeholder: suggestedEnglishName \|\| 'Tae-jun Yoon'/);
  assert.match(builder, /onFocus=\{field\.label === '영문 성명' \? applySuggestedEnglishName : undefined\}/);
  assert.match(builder, /onClick=\{field\.label === '영문 성명' \? applySuggestedEnglishName : undefined\}/);
  assert.match(builder, /onClick=\{\(\) => setEnglishName\(suggestedEnglishName\)\}/);
  assert.match(builder, /setEnglishName\(data\.profile\.englishName \|\| ''\)/);
  assert.doesNotMatch(builder, /englishNameSuggestions|readOnly=\{field\.label === '영문 성명'/);
});
