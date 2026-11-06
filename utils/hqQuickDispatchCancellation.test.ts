import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelHqQuickDispatchSchedule } from './hqQuickDispatchCancellation';

test('confirmed cancellation calls the existing authenticated HQ cancel API with a reason', async () => {
  const sent: { url?: string; options?: RequestInit } = {};
  const fakeRequest = (async (url: string, options?: RequestInit) => {
    sent.url = url;
    sent.options = options;
    return new Response(JSON.stringify({ ok: true, dispatchStatus: 'cancelled' }), { status: 200 });
  }) as typeof fetch;
  await cancelHqQuickDispatchSchedule(' schedule-123 ', ' 고객 요청 ', fakeRequest);
  assert.equal(sent.url, '/api/schedules/cancel');
  assert.equal(sent.options?.method, 'POST');
  assert.equal((sent.options?.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(String(sent.options?.body)), {
    scheduleId: 'schedule-123',
    reason: '고객 요청',
    cancelledBy: '본사 관제',
  });
});

test('empty cancellation reason uses the existing endpoint default', async () => {
  let payload: { reason?: string } | null = null;
  const fakeRequest = (async (_url: string, options?: RequestInit) => {
    payload = JSON.parse(String(options?.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  await cancelHqQuickDispatchSchedule('schedule-123', '  ', fakeRequest);
  assert.equal(payload?.reason, '고객 요청 취소');
});

test('missing schedule ID never sends a cancellation request', async () => {
  let calls = 0;
  const fakeRequest = (async () => { calls++; return new Response('{}'); }) as typeof fetch;
  await assert.rejects(
    () => cancelHqQuickDispatchSchedule('  ', '고객 취소', fakeRequest),
    /서버 일정 ID/,
  );
  assert.equal(calls, 0);
});

test('server and authentication errors surface without pretending a cancellation succeeded', async () => {
  const fakeRequest = (async () =>
    new Response(JSON.stringify({ ok: false, error: '관리자 권한이 필요합니다.' }), { status: 403 })
  ) as typeof fetch;
  await assert.rejects(
    () => cancelHqQuickDispatchSchedule('schedule-123', '고객 취소', fakeRequest),
    /관리자 권한/,
  );
});

test('non-JSON server errors do not report success', async () => {
  const fakeRequest = (async () =>
    new Response('gateway failure', { status: 502 })
  ) as typeof fetch;
  await assert.rejects(
    () => cancelHqQuickDispatchSchedule('schedule-123', '고객 취소', fakeRequest),
    /배차 취소 처리에 실패/,
  );
});

test('network failures propagate to the caller for an actionable error banner', async () => {
  const fakeRequest = (async () => { throw new Error('Network offline'); }) as typeof fetch;
  await assert.rejects(
    () => cancelHqQuickDispatchSchedule('schedule-123', '고객 취소', fakeRequest),
    /Network offline/,
  );
});
