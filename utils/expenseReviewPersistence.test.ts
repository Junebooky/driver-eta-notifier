import test from 'node:test';
import assert from 'node:assert/strict';
import { updateHqExpenseReviewDb, getHqExpenses, saveHqExpenses } from './expenseHqStorage';
import type { HqExpenseRecord } from '../types/expenseHq';

const original: HqExpenseRecord = {
  id: 'a0000000-0000-4000-8000-000000000001', no: 1, submittedAt: '', submittedDate: '',
  rawDate: '2026-11-01', time: '09:00', driverName: '검증 기사', vehicleModel: '차량', vehiclePlate: '검증 차량',
  category: 'parking', categoryLabel: '주차비', merchant: '주차장', amount: 8000,
  paymentMethod: 'company_card', paymentMethodLabel: '회사 카드', status: '검수 대기', hasReceiptImage: false,
  billableToCustomer: true, updatedAt: '2026-11-01T01:00:00.000Z',
};

test('failed, lost and incomplete review acknowledgments never approve or reclassify the local receipt', async () => {
  const previousFetch = globalThis.fetch;
  saveHqExpenses([original]);
  try {
    for (const response of [
      () => Response.json({ ok: false, error: 'DB 저장 실패' }, { status: 503 }),
      () => { throw new Error('response lost'); },
      () => Response.json({ ok: true }),
      () => Response.json({ ok: true, expense: { ...original, id: 'different', status: '승인 완료' } }),
      () => Response.json({ ok: true, expense: { ...original, status: '반려' } }),
    ]) {
      globalThis.fetch = (async () => response()) as typeof fetch;
      assert.equal((await updateHqExpenseReviewDb(original.id, { status: '승인 완료' }, original.updatedAt)).ok, false);
      assert.deepEqual(getHqExpenses(), [original]);
      assert.equal((await updateHqExpenseReviewDb(original.id, { billableToCustomer: false }, original.updatedAt)).ok, false);
      assert.deepEqual(getHqExpenses(), [original]);
    }
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({ ok: false }, { status: 409 }); }) as typeof fetch;
    const conflict = await updateHqExpenseReviewDb(original.id, { status: '승인 완료' }, original.updatedAt);
    assert.equal(conflict.ok, false); if (!conflict.ok) assert.equal(conflict.conflict, true);
    assert.equal((await updateHqExpenseReviewDb(original.id, { status: '승인 완료' })).ok, false);
    assert.equal(calls, 1, 'a receipt without a server revision must be refreshed first');
  } finally { globalThis.fetch = previousFetch; saveHqExpenses([]); }
});

test('confirmed review adopts the server reviewer, audit, classification and revision verbatim', async () => {
  const previousFetch = globalThis.fetch;
  const server = { ...original, status: '승인 완료' as const, billableToCustomer: false, reviewedBy: '실제 계정', reviewNotes: '확인', auditHistory: [{ actor: '실제 계정' }], updatedAt: '2026-11-01T02:00:00.000Z' };
  saveHqExpenses([original]);
  try {
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, '/api/expenses'); assert.equal(init?.method, 'PUT');
      assert.deepEqual(JSON.parse(String(init?.body)), { id: original.id, status: '승인 완료', billableToCustomer: false, reviewNotes: '확인', expectedUpdatedAt: original.updatedAt });
      return Response.json({ ok: true, expense: server });
    }) as typeof fetch;
    const result = await updateHqExpenseReviewDb(original.id, { status: '승인 완료', billableToCustomer: false, reviewNotes: '확인' }, original.updatedAt);
    assert.equal(result.ok, true); assert.deepEqual(getHqExpenses(), [server]);
  } finally { globalThis.fetch = previousFetch; saveHqExpenses([]); }
});
