import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findEmailSourceRanges } from './emailWorkflowReview';
import { validateDispatchInterval } from './dispatchInterval';
import { buildEmailDispatchPlan } from './emailDispatchPlan';
import { createEmptyDraft } from '../services/emailBookingGeminiService';

const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('text is selectable by default while source address is a real action', () => {
  assert.doesNotMatch(read('app/layout.tsx'), /antialiased select-none/);
  assert.match(read('app/layout.tsx'), /antialiased select-text/);
  const address = read('components/hq/email/HqEmailAddressCandidate.tsx');
  assert.match(address, /onLocateInSource\(sourceAddress\)/);
  assert.match(address, /sourceEvidence\.excerpt/);
  assert.match(read('components/hq/email/HqStep1ExtractView.tsx'), /sourceEvidence=\{currentEvidence\?\.address === wp\.clientAddress/);
});

test('the extra batch comparison card is not mounted in the email workflow', () => {
  const inbox = read('components/hq/email/HqEmailInboxView.tsx');
  assert.doesNotMatch(inbox, /<HqEmailBatchRevisionPanel/);
  assert.match(inbox, /batchReviewRows=\{/);
  assert.match(inbox, /buildEmailBatchRevisionApproval/);
  assert.match(read('components/hq/email/HqStep1ExtractView.tsx'), /등록 방법 선택/);
});

test('address matching tolerates punctuation differences but not unrelated districts', () => {
  const text = 'Pick up: 123, Teheran-ro, Gangnam-gu\nAnother: 123 Teheran-ro, Seocho-gu';
  const matched = findEmailSourceRanges(text, '123 Teheran ro Gangnam gu');
  assert.equal(matched.length, 1);
  assert.equal(text.slice(matched[0].start, matched[0].end), '123, Teheran-ro, Gangnam-gu');
  assert.equal(findEmailSourceRanges(text, '123 Teheran-ro, Mapo-gu').length, 0);
});

test('unknown departure is a real empty value, never fake midnight; publication fails closed', () => {
  assert.equal(validateDispatchInterval({ date: '2026-11-15', pickupTime: '', dispatchStatus: 'unassigned' }), null);
  assert.match(validateDispatchInterval({ date: '2026-11-15', pickupTime: '', endTime: '18:00', dispatchStatus: 'published' }) || '', /출발 시간/);
  assert.match(read('components/hq/ui/HqDispatchTimeField.tsx'), /<span>미지정<\/span>/);
  assert.match(read('lib/dispatch/scheduleServerStore.ts'), /const formattedPickupTime = hhmm \? .* : null/);
});

test('email booking can stay unassigned without a known departure time', () => {
  const draft = {
    ...createEmptyDraft({ emailId: 'mail-unspecified', subject: '픽업 예정', sender: 'client@example.com', bodyText: '' }),
    pickupDate: '2026-11-15', pickupTime: '', pickupLocation: '서울역', dropoffLocation: '서울시청',
    companyName: '고객사', waypoints: [
      { id: 'a', order: 1, date: '2026-11-15', time: '', location: '서울역' },
      { id: 'b', order: 2, date: '2026-11-15', time: '', location: '서울시청' },
    ],
  };
  const slot = [{ vehicleModel: '차량 미지정', driver: null }];
  assert.equal(buildEmailDispatchPlan(draft, slot, 'unassigned')[0].pickupTime, '');
  assert.throws(() => buildEmailDispatchPlan(draft, slot, 'published'), /출발 시간/);
});
