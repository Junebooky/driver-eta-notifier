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
  assert.match(component, /문자 \/ 카카오톡 직접 전달/);
  assert.match(component, /외부 이메일 직접 전달/);
  assert.match(component, /다운로드 준비 기록/);
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
