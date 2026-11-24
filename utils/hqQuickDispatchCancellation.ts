/**
 * Keep the quick-dispatch cancel action on the same authenticated endpoint as
 * HqBookingDetailModal. Only a confirmed user action should invoke this.
 */
export async function cancelHqQuickDispatchSchedule(
  scheduleId: string,
  reason: string,
  request: typeof fetch = fetch,
): Promise<void> {
  const id = scheduleId.trim();
  if (!id) throw new Error('취소할 예약의 서버 일정 ID가 없습니다.');

  const response = await request('/api/schedules/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scheduleId: id,
      reason: reason.trim() || '고객 요청 취소',
      cancelledBy: '본사 관제',
    }),
  });
  const data: { ok?: boolean; error?: string } | null = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    throw new Error(data?.error || '배차 취소 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
