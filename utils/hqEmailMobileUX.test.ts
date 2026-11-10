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

test('mobile email detail shows one clear AI scheduling action above the email source, leaving desktop columns unchanged',()=>{
  assert.match(extract,/order-2 flex min-h-0[\s\S]*?lg:order-1 lg:col-span-6/);
  assert.match(extract,/order-1 flex min-h-\[300px\][\s\S]*?lg:order-2 lg:col-span-6/);
  assert.match(extract,/onClick=\{onExtractWithAi\}/);
  assert.match(extract,/disabled=\{isExtractingAi \|\| isLoadingDetail\}/);
  assert.match(extract,/AI로 분석하기/);
  assert.match(extract,/Excel·PDF 일정표를 함께 분석/);
  assert.match(extract,/min-h-12 w-full[\s\S]*?sm:w-auto/);
});
