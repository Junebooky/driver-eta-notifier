import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const inbox=read('components/hq/email/HqEmailInboxView.tsx');
const extract=read('components/hq/email/HqStep1ExtractView.tsx');

test('mobile inbox opens the selected email immediately instead of stacking it below the list',()=>{
  assert.match(inbox,/\[mobileDetailOpen, setMobileDetailOpen\]/);
  assert.match(inbox,/setMobileDetailOpen\(true\)/);
  assert.match(inbox,/scrollMobileTo\('detail'\)/);
  assert.match(inbox,/\$\{mobileDetailOpen \? 'hidden md:flex' : 'flex'\}/);
  assert.match(inbox,/\$\{mobileDetailOpen \? 'block' : 'hidden md:block'\}/);
  assert.match(inbox,/setMobileDetailOpen\(false\)/);
  assert.match(inbox,/이메일 목록으로 돌아가기/);
  assert.match(inbox,/scrollMobileTo\('list'\)/);
  assert.match(inbox,/md:min-h-\[700px\]/);
  assert.doesNotMatch(inbox,/flex min-h-\[700px\] w-full/);
  assert.match(inbox,/role="button"[\s\S]*?onKeyDown=\{\(event\) =>/);
  assert.match(inbox,/onExtractWithAi=\{handleExtractWithAi\}/);
});

test('mobile email opens original body with AI icon in subject header, then switches to draft result',()=>{
  assert.match(inbox,/\[mobileEmailView, setMobileEmailView\]/);
  assert.match(inbox,/setMobileEmailView\('source'\)/);
  assert.match(inbox,/setMobileEmailView\('analysis'\)/);
  assert.match(inbox,/mobileView=\{mobileEmailView\}/);
  assert.match(inbox,/onMobileViewChange=/);
  assert.match(extract,/mobileView === 'source' \? 'flex' : 'hidden'/);
  assert.match(extract,/mobileView === 'analysis' \? 'flex' : 'hidden'/);
  assert.match(extract,/md:flex lg:col-span-6 lg:min-h-\[640px\]/);
  assert.match(extract,/aria-label=\{extractedDraft \? 'AI 분석 결과 보기' : 'AI로 분석하기'\}/);
  assert.match(extract,/onClick=\{\(\) => extractedDraft \? onMobileViewChange\?\.\('analysis'\) : onExtractWithAi\(\)\}/);
  assert.match(extract,/disabled=\{isExtractingAi \|\| isLoadingDetail\}/);
  assert.match(extract,/메일 원문 보기/);
  assert.match(extract,/onMobileViewChange\?\.\('source'\)/);
  assert.match(extract,/Excel·PDF 일정표를 함께 분석/);
  assert.match(extract,/onClick=\{onExtractWithAi\}/);
});
