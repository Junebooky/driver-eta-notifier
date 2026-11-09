import { ensureClientAuth } from './cockpitClientAuth';

export type HqHardDeleteScope = 'booking' | 'event';

export async function hardDeleteHqSchedule(scheduleId: string, scope: HqHardDeleteScope): Promise<number> {
  if (!scheduleId) throw new Error('서버에 등록된 배차만 삭제할 수 있습니다.');
  await ensureClientAuth('hq');
  const response = await fetch('/api/schedules/hard-delete', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduleId, scope, confirm: true }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(result.error || '배차 삭제 결과를 확인하지 못했습니다.');
  }
  const deletedCount = Number(result.deletedCount);
  if (!Number.isInteger(deletedCount) || deletedCount < 1) {
    throw new Error('삭제된 배차가 없습니다. 목록을 다시 확인해 주세요.');
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vip_hq_schedules_updated'));
  }
  return deletedCount;
}
