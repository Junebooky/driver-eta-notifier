import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(
  new URL('../components/hq/bookings/HqDriverVehicleInfoModal.tsx', import.meta.url),
  'utf8',
);

test('dispatch card A-plan modal keeps a white accessible dialog and both preview modes', () => {
  assert.match(component, /role="dialog" aria-modal="true"/);
  assert.match(component, /aria-labelledby="hq-driver-card-title"/);
  assert.match(component, /bg-white/);
  assert.match(component, /bg-\[#FAFBFD\]/);
  assert.match(component, /aria-pressed=\{activeTab === 'pc'\}/);
  assert.match(component, /aria-pressed=\{activeTab === 'mobile'\}/);
  assert.match(component, /currentAsset\.signedUrl/);
  assert.match(component, /handleDownload/);
  assert.match(component, /aria-label="안내자료 원본 새 창에서 보기"/);
});

test('dispatch delivery choices use a branded custom popup, not an unstyled browser select', () => {
  assert.doesNotMatch(component, /<select\b/);
  assert.match(component, /role="listbox"/);
  assert.match(component, /role="option"/);
  assert.match(component, /aria-selected=\{channel === option\.value\}/);
  assert.match(component, /aria-expanded=\{isChannelMenuOpen\}/);
  assert.match(component, /DELIVERY_OPTIONS\.map/);
  assert.match(component, /문자·카카오톡으로 보냈어요/);
  assert.match(component, /이메일로 보냈어요/);
  assert.match(component, /이미지만 저장해둘게요/);
  assert.match(component, /event\.key === 'ArrowDown'/);
  assert.match(component, /event\.key !== 'Escape'/);
});

test('contact entry and checkbox keep real behavior and clear stale booking state', () => {
  assert.match(component, /formatPhoneNumber\(value\)/);
  assert.match(component, /setRecipient\(booking\?\.passengerPhone \|\| ''\)/);
  assert.match(component, /setManualDeliveryConfirmed\(false\)/);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /channel !== 'download'/);
  assert.match(component, /isPreparationOnly: !manualDeliveryConfirmed/);
  assert.match(component, /onDispatchRecorded\?\./);
  assert.match(component, /!recipient\.trim\(\)/);
});

test('A-plan keeps blue for primary actions without old dark button and green badge', () => {
  assert.match(component, /bg-\[#1E60F3\]/);
  assert.doesNotMatch(component, /bg-slate-900|hover:bg-slate-800/);
  assert.doesNotMatch(component, /bg-emerald-|text-emerald-/);
  assert.match(component, /shadow-\[0_6px_20px/);
  assert.match(component, /focus-visible:ring-2/);
});

test('the three requested brand icon paths are used without replacing original vehicle imagery', () => {
  assert.match(component, /\/images\/icons\/drivers\/icon_profile_card\.png/);
  assert.match(component, /\/images\/icons\/driver_ui\/icon_talk\.png/);
  assert.match(component, /\/images\/icons\/eemail\/icon_email\.png/);
  assert.match(component, /src=\{selectedDelivery\.icon\}/);
  assert.match(component, /src=\{option\.icon\}/);
});

test('customer-card copy uses simple and warm Korean throughout the visible workflow', () => {
  const labels = [
    '고객 안내 카드', '이미지 저장', '어떻게 전달하셨나요?',
    '고객에게 직접 전달한 방법을 기록으로 남겨둘 수 있어요.',
    '받는 분', '전달 방법', '문자·카카오톡으로 보냈어요',
    '이메일로 보냈어요', '이미지만 저장해둘게요',
    '자동으로 발송되지 않아요. 직접 전달한 뒤 기록을 남겨주세요.',
    '안내 카드를 직접 전달했어요', '기록 저장하기',
    '안전하게 보호되는 보안 링크예요',
  ];
  for (const label of labels) assert.ok(component.includes(label), label);
  assert.ok(!component.includes('기사·차량 Info 고객 안내자료'));
});
