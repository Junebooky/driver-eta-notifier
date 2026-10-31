'use client';
import { useEffect, useState } from 'react';
import type { FleetAvailabilityResult } from '@/utils/availabilityEngine';

export function useFleetAvailability(startDate: string, startTime: string, endDate: string, endTime: string, excludeScheduleId?: string) {
  const key = new URLSearchParams({ startDate, startTime, endDate, endTime, ...(excludeScheduleId ? { excludeScheduleId } : {}) }).toString();
  const [result, setResult] = useState<{ key: string; data?: FleetAvailabilityResult; error?: string } | null>(null);
  useEffect(() => {
    if (!startDate || !startTime || !endDate || !endTime) return;
    const abort = new AbortController();
    fetch(`/api/fleet/availability?${key}`, { cache: 'no-store', signal: abort.signal })
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || '가용성 조회 실패');
        if (!abort.signal.aborted) setResult({ key, data });
      }).catch(error => { if (!abort.signal.aborted) setResult({ key, error: String(error.message || error) }); });
    return () => abort.abort();
  }, [key, startDate, startTime, endDate, endTime]);
  const current = result?.key === key ? result : null;
  return { data: current?.data, error: current?.error, loading: !current };
}
