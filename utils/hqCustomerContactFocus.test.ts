import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('HQ modal keeps focus while contact form changes controlled values',()=>{
  const modal=read('components/hq/ui/HqModal.tsx');
  const editor=read('components/hq/customers/HqCustomerEditContactModal.tsx');
  const fields=read('components/hq/customers/HqContactChannelFields.tsx');
  // The focus trap must NOT be torn down when a parent recreates onClose.
  assert.match(modal,/const onCloseRef = useRef\(onClose\)/);
  assert.match(modal,/onCloseRef\.current = onClose/);
  assert.match(modal,/onCloseRef\.current\(\)/);
  assert.match(modal,/\}, \[isOpen, mounted\]\);/);
  assert.doesNotMatch(modal,/\}, \[isOpen, mounted, onClose\]\);/);
  assert.match(editor,/<HqContactChannelFields value=\{draft\} onChange=\{setDraft\}/);
  assert.match(fields,/value=\{value\.role\}/);
  assert.match(fields,/value=\{value\.name\}/);
  assert.match(fields,/value=\{value\.department\}/);
});

test('HQ customer primary-contact badge is not mistaken for job title',()=>{
  const overview=read('components/hq/customers/HqCustomerOverview.tsx');
  assert.match(overview,/person\.isPrimary&&<HqBadge tone="neutral">주 담당자<\/HqBadge>/);
  assert.match(overview,/\[person\.role,person\.department\]/);
  assert.doesNotMatch(overview,/person\.isPrimary&&<HqBadge>대표<\/HqBadge>/);
});
