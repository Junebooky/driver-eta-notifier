'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VehicleCustodyState } from '@/types/vehicleCustody';
import { fetchVehicleCustody } from '@/utils/vehicleCustody';

export function useVehicleCustody(enabled = true) {
  const [data, setData] = useState<VehicleCustodyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const running = useRef<Promise<VehicleCustodyState | null> | null>(null);
  const refresh = useCallback((force = false) => {
    if (!enabled) return Promise.resolve(null);
    if (force) { generation.current++; running.current = null; }
    if (running.current) return running.current;
    const at = generation.current;
    const request = (async () => {
      try {
        const result = await fetchVehicleCustody();
        if (at === generation.current) { setData(result); setError(null); }
        return result;
      } catch (error) {
        if (at === generation.current) setError(error instanceof Error ? error.message : '최신 인수 상태를 확인하지 못했습니다.');
        return null;
      } finally { if (at === generation.current) running.current = null; }
    })();
    running.current = request;
    return request;
  }, [enabled]);
  useEffect(() => {
    const counter = generation;
    if (!enabled) return;
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(visible, 8000);
    window.addEventListener('focus', visible); window.addEventListener('online', visible); window.addEventListener('vip_vehicle_custody_updated', visible);
    return () => { counter.current++; running.current = null; clearInterval(timer); window.removeEventListener('focus', visible); window.removeEventListener('online', visible); window.removeEventListener('vip_vehicle_custody_updated', visible); };
  }, [enabled, refresh]);
  return { data, error, refresh, ready: enabled && data !== null && error === null };
}
