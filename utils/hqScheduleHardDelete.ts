import { ensureClientAuth } from './cockpitClientAuth';

export type HqHardDeleteScope = 'booking' | 'event' | 'customer';
export type HqScheduleDeleteMode = 'schedule_only' | 'include_drafts';

export interface HqScheduleDeleteInspection {
  count: number;
  hasRecords: boolean;
  canIncludeDrafts: boolean;
  counts: {
    drivingLogs: number;
    expenses: number;
    settlements: number;
    linkAudits: number;
    custodies: number;
    custodyRequests: number;
  };
}

function requestBody(scheduleId: string, scope: HqHardDeleteScope, scheduleIds?: readonly string[]) {
  if (!scheduleId) throw new Error('서버에 등록된 배차만 삭제할 수 있습니다.');
  if (scope === 'customer' && (!scheduleIds?.length || !scheduleIds.includes(scheduleId))) {
    throw new Error('삭제할 고객사의 배차 목록을 다시 확인해 주세요.');
  }
  return { scheduleId, scope, scheduleIds: scope === 'customer' ? scheduleIds : undefined };
}

/** Inspect the exact target IDs via the HQ-authenticated server. No mutations. */
export async function inspectHqScheduleDeletion(
  scheduleId: string, scope: HqHardDeleteScope, scheduleIds?: readonly string[]
): Promise<HqScheduleDeleteInspection> {
  const body = requestBody(scheduleId, scope, scheduleIds);
  await ensureClientAuth('hq');
  const response = await fetch('/api/schedules/hard-delete', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(result.error || '삭제 대상 업무 기록을 확인하지 못했습니다.');
  }
  return result as HqScheduleDeleteInspection;
}

/** Explicitly requested deletion mode; no hidden record-deletion fallback. */
export async function hardDeleteHqSchedule(
  scheduleId: string, scope: HqHardDeleteScope, scheduleIds?: readonly string[],
  mode: HqScheduleDeleteMode = 'schedule_only'
): Promise<number> {
  const body = requestBody(scheduleId, scope, scheduleIds);
  await ensureClientAuth('hq');
  const response = await fetch('/api/schedules/hard-delete', {
    method: 'DELETE', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, mode, confirm: true }),
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
