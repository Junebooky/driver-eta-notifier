import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateDriverItems, DRIVERS_PER_PAGE } from './driverPickerPagination';

test('driver picker uses four items per horizontal page, preserving all entries and order', () => {
  assert.equal(DRIVERS_PER_PAGE, 4);
  for (const length of [0, 1, 2, 4, 5, 8, 9, 13]) {
    const items = Array.from({ length }, (_, i) => 'driver-' + i);
    const pages = paginateDriverItems(items);
    assert.equal(pages.length, Math.ceil(length / DRIVERS_PER_PAGE));
    assert.deepEqual(pages.flat(), items);
    assert.ok(pages.every(page => page.length >= 1 && page.length <= 4));
  }
});

test('filtering produces a smaller list without changing page capacity', () => {
  const before = ['Ko1','En1','Ko2','En2','Ko3','En3'];
  assert.deepEqual(paginateDriverItems(before.filter(x => x.startsWith('En'))), [['En1','En2','En3']]);
  assert.deepEqual(paginateDriverItems(before), [['Ko1','En1','Ko2','En2'], ['Ko3','En3']]);
  assert.throws(() => paginateDriverItems(before, 0));
});
