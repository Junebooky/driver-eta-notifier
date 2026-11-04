import { normalizeDateToIso, normalizeTimeHHmm, parseKstDateTimeToMs } from './dispatchConflictDetector';

export function validateDispatchInterval(input: {
  date: string; pickupTime: string; endDate?: string; endTime?: string; dispatchStatus?: string;
}): string | null {
  const date = normalizeDateToIso(input.date);
  const start = normalizeTimeHHmm(input.pickupTime);
  if (!date || !start) return '유효한 운행 날짜와 픽업 시간을 입력해 주세요.';
  if (input.endDate && !normalizeDateToIso(input.endDate)) return '종료 날짜가 올바르지 않습니다.';
  if (input.dispatchStatus !== 'published' && !input.endTime) return null;
  const endDate = input.endDate ? normalizeDateToIso(input.endDate) : date;
  const end = normalizeTimeHHmm(input.endTime);
  if (!end) return '배차 확정에는 실제 종료 날짜와 시간이 필요합니다. 종료 미정이면 예약만 등록해 주세요.';
  if (parseKstDateTimeToMs(endDate, end) <= parseKstDateTimeToMs(date, start)) {
    return '종료 일시는 픽업 일시보다 이후여야 합니다.';
  }
  return null;
}

/** Unknown legacy end times remain an open hold until an administrator confirms them. */
export function scheduleOverlapsInterval(
  schedule: { startDate: string; pickupTime: string; endDate?: string; endTime?: string },
  query: { startDate: string; startTime: string; endDate?: string; endTime: string },
  bufferMinutes = 60,
): boolean {
  const start = parseKstDateTimeToMs(schedule.startDate, schedule.pickupTime);
  const end = schedule.endTime ? parseKstDateTimeToMs(schedule.endDate || schedule.startDate, schedule.endTime) : Infinity;
  const queryStart = parseKstDateTimeToMs(query.startDate, query.startTime);
  const queryEnd = parseKstDateTimeToMs(query.endDate || query.startDate, query.endTime);
  if ([start, end, queryStart, queryEnd].some(Number.isNaN)) return true;
  if (end <= start || queryEnd <= queryStart) return true;
  return start < queryEnd + bufferMinutes * 60000 && queryStart < end + bufferMinutes * 60000;
}
