'use client';
import { useEffect, useState } from 'react';
import type { FleetAvailabilityResult } from '@/utils/availabilityEngine';
import { parseKstDateTimeToMs } from '@/utils/dispatchConflictDetector';
import { combineFleetAvailability } from '@/utils/fleetVehicleStatus';

export interface FleetWindow { startDate: string; startTime: string; endDate: string; endTime: string }

export function useFleetAvailabilityWindows(windows: FleetWindow[], excludeScheduleId?: string) {
  const valid = windows.length > 0 && windows.every(window => {
    const start = parseKstDateTimeToMs(window.startDate, window.startTime);
    const end = parseKstDateTimeToMs(window.endDate, window.endTime);
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  });
  const key = JSON.stringify(valid ? windows.map(window => new URLSearchParams({ ...window, ...(excludeScheduleId ? { excludeScheduleId } : {}) }).toString()) : []);
  const [result, setResult] = useState<{ key: string; data?: ReturnType<typeof combineFleetAvailability>; error?: string } | null>(null);
  useEffect(() => {
    const queries: string[] = JSON.parse(key);
    if (!queries.length) return;
    let active = true;
    let abort: AbortController | undefined;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      abort?.abort();
      const controller = new AbortController();
      abort = controller;
      try {
        const responses: FleetAvailabilityResult[] = await Promise.all(queries.map(async query => {
          const res = await fetch(`/api/fleet/availability?${query}`, { cache: 'no-store', signal: controller.signal });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || '가용성 조회 실패');
          return data;
        }));
        if (active && !controller.signal.aborted) setResult({ key, data: combineFleetAvailability(responses) });
      } catch (error) {
        if (active && !controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : '가용성 조회 실패' });
      }
    };
    void refresh();
    const timer = setInterval(refresh, 8000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('vip_hq_schedules_updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false; abort?.abort(); clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('vip_hq_schedules_updated', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [key]);
  const current = result?.key === key ? result : null;
  return { data: valid ? current?.data : undefined, error: valid ? current?.error : '실제 시작·종료 날짜와 시간을 확인해 주세요.', loading: valid && !current };
}

export function useFleetAvailability(startDate: string, startTime: string, endDate: string, endTime: string, excludeScheduleId?: string) {
  return useFleetAvailabilityWindows([{ startDate, startTime, endDate, endTime }], excludeScheduleId);
}
