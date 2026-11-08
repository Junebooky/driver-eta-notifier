import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidFieldKnowledgeImageUrl } from './hqKnowledgeImageUrl';
import {
  FIELD_KNOWLEDGE_STORAGE_KEY,
  deleteFieldKnowledgeItem,
  getStoredFieldKnowledge,
  saveFieldKnowledgeItem,
} from './fieldKnowledgeData';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('knowledge URLs reject unsafe, malformed or oversized values', () => {
  assert.equal(isValidFieldKnowledgeImageUrl('https://example.com/photo.jpg'), true);
  assert.equal(isValidFieldKnowledgeImageUrl('/images/icons/knowledge/icon_knowledge.png'), true);
  assert.equal(isValidFieldKnowledgeImageUrl('javascript:alert(1)'), false);
  assert.equal(isValidFieldKnowledgeImageUrl('http://example.com/a.jpg'), false);
  assert.equal(isValidFieldKnowledgeImageUrl('/images/../secret.png'), false);
  assert.equal(isValidFieldKnowledgeImageUrl('//evil.example/file.png'), false);
  assert.equal(isValidFieldKnowledgeImageUrl('https://user:pass@example.com/photo'), false);
  assert.equal(isValidFieldKnowledgeImageUrl('a'.repeat(2049)), false);
});

test('local field knowledge never silently reseeds a deliberately empty list', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stored = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mockStorage });
  try {
    const current = getStoredFieldKnowledge();
    assert.ok(current.length > 0);
    assert.equal(saveFieldKnowledgeItem({
      ...current[0], id: 'test-item', title: '기기 전용 테스트 장소',
    }), true);
    assert.equal(getStoredFieldKnowledge().some(item => item.id === 'test-item'), true);
    stored.set(FIELD_KNOWLEDGE_STORAGE_KEY, JSON.stringify([current[0]]));
    assert.equal(deleteFieldKnowledgeItem(current[0].id), true);
    assert.deepEqual(getStoredFieldKnowledge(), []);
    assert.equal(stored.get(FIELD_KNOWLEDGE_STORAGE_KEY), '[]');

    mockStorage.setItem = () => { throw new Error('storage quota exceeded'); };
    assert.equal(saveFieldKnowledgeItem({ ...current[0], title: '실패 테스트' }), false);
    assert.equal(deleteFieldKnowledgeItem(current[0].id), false);
    assert.deepEqual(getStoredFieldKnowledge(), []);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('customer operations show in-page failures, not fake success alerts', () => {
  const view = source('components/hq/customers/HqCustomersView.tsx');
  const register = source('components/hq/customers/HqCustomerRegisterModal.tsx');
  assert.match(view, /<HqSearchSelect/);
  assert.match(view, /<HqInlineFeedback/);
  assert.doesNotMatch(view, /\balert\(/);
  assert.match(view, /setOperationMessage\(/);
  assert.match(view, /return true;[\s\S]*?\/\/.*server/); // checked below with the refresh branch.
  assert.match(view, /The server confirmed the new customer/);
  assert.match(register, /<HqSearchSelect/);
  assert.match(register, /<HqInlineFeedback/);
  assert.match(register, /normalizeDateToIso\(nextEventDate\)/);
  assert.doesNotMatch(register, /\balert\(|'D-30'|S클래스 1대|2024\. 11\. 30/);
  assert.match(register, /if \(result !== false\)/);
});

test('knowledge management uses honest local feedback and shared modal actions', () => {
  const view = source('components/hq/knowledge/HqFieldKnowledgeView.tsx');
  assert.match(view, /saveFieldKnowledgeItem\(editingItem\)/);
  assert.match(view, /!saveFieldKnowledgeItem\(editingItem\)/);
  assert.match(view, /!deleteFieldKnowledgeItem\(editingItem\.id\)/);
  assert.match(view, /isValidFieldKnowledgeImageUrl\(photoUrlDraft\)/);
  assert.equal((view.match(/<HqModal/g) || []).length, 2);
  assert.match(view, /<HqSearchSelect/);
  assert.doesNotMatch(view, /<select\b|window\.prompt\(|window\.confirm\(/);
  assert.match(view, /기사 앱이나 다른 기기에는 자동 공유되지 않습니다/);
  assert.match(view, /onClick=\{confirmDeleteItem\}/);
  assert.match(view, /onClick=\{savePhotoUrl\}/);
  assert.match(view, /이 브라우저에 저장했습니다/);
});

test('driver memo stays attached to its own driver and reports server failure', () => {
  const detail = source('components/hq/drivers/HqDriverDetailSplitView.tsx');
  assert.match(detail, /currentDriverIdRef\.current = activeDriver\?\.id/);
  assert.match(detail, /const targetDriverId = activeDriver\.id/);
  assert.match(detail, /currentDriverIdRef\.current !== targetDriverId/);
  assert.match(detail, /<HqTextarea/);
  assert.match(detail, /<HqInlineFeedback message=\{memoError\}/);
  assert.match(detail, /setMemoError\(/);
  assert.doesNotMatch(detail, /alert\('메모 저장에 실패/);
});
