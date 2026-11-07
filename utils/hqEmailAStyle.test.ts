import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const inbox=r('components/hq/email/HqEmailInboxView.tsx');
const step=r('components/hq/email/HqStep1ExtractView.tsx');
const compose=r('components/hq/email/HqComposeEmailModal.tsx');
const batch=r('components/hq/email/HqEmailBatchRevisionPanel.tsx');
const css=r('app/globals.css');

test('inbox A-plan keeps live IMAP, manual AI and safe dispatch controls',()=>{
  assert.match(inbox,/hq-email-a space-y-5/);
  assert.match(inbox,/fetchLiveInbox\(true\)/);
  assert.match(inbox,/handleSelectEmail\(item\.id\)/);
  assert.match(inbox,/setStatusFilter\(tab\.id\)/);
  assert.match(inbox,/dispatchMutation\.retry\(\)/);
  assert.match(inbox,/HqEmailWorkflowStepper/);
  assert.doesNotMatch(inbox,/bg-blue-50\/90 border-l-4/);
});

test('AI source viewer keeps the actual attachment count, every candidate and AI command',()=>{
  assert.match(step,/attachmentFiles\.map\(\(file, index\)/);
  assert.match(step,/emailDetail\?\.hasAttachments/);
  assert.match(step,/encodeURIComponent\(file\.filename\)/);
  assert.match(step,/onExtractWithAi/);
  assert.match(step,/extractedDraft/);
  assert.match(step,/shadow-\[0_6px_20px/);
});

test('compose email preserves explicit real-send safety and To/Cc recipient flow',()=>{
  assert.match(compose,/hq-email-compose-a/);
  assert.match(compose,/onSubmit=\{handleSendEmail\}/);
  assert.match(compose,/isConfirmedRealSend/);
  assert.match(compose,/setToEmails/);
  assert.match(compose,/setCcEmails/);
  assert.match(compose,/EMAIL_TEMPLATES\.map/);
  assert.doesNotMatch(compose,/bg-gradient-to-r from-\[#0B1E48\]/);
  assert.match(css,/A02 batch-approval internals are not restyled/);
});

test('A02 multi-day/vehicle atomic approval panel remains available',()=>{
  assert.match(batch,/emailBatchRows/);
  assert.match(batch,/onApprove/);
  assert.match(batch,/onAssignment/);
  assert.match(batch,/onCancelReason/);
});
