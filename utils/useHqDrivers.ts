'use client';

import { useState, useEffect, useCallback } from 'react';
import { HqDriverSummary } from '@/types/driverHq';

export interface UseHqDriversResult {
  drivers: HqDriverSummary[];
  counts: {
    total: number;
    employed: number;
    freelance: number;
    englishCount: number;
  };
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateDriver: (id: string, updates: Record<string, any>) => Promise<boolean>;
  createDriver: (data: Record<string, any>) => Promise<HqDriverSummary | null>;
}

export function useHqDrivers(): UseHqDriversResult {
  const [drivers, setDrivers] = useState<HqDriverSummary[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    employed: 0,
    freelance: 0,
    englishCount: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrivers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/hq/drivers', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || '기사 목록을 불러오지 못했습니다.');
      }

      setDrivers(data.drivers || []);
      setCounts(
        data.counts || {
          total: (data.drivers || []).length,
          employed: 0,
          freelance: 0,
          englishCount: 0,
        }
      );
    } catch (err: any) {
      console.error('[useHqDrivers] Fetch error:', err);
      setError(err.message || '서버 통신 실패');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const updateDriver = useCallback(
    async (id: string, updates: Record<string, any>): Promise<boolean> => {
      try {
        const res = await fetch(`/api/hq/drivers/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok || !data.driver) {
          throw new Error(data.error || '기사 정보 수정에 실패했습니다.');
        }

        // Optimistically or synchronously update in local state
        setDrivers((prev) =>
          prev.map((d) => (d.id === id ? { ...d, ...data.driver } : d))
        );
        return true;
      } catch (err: any) {
        console.error('[useHqDrivers] Update error:', err);
        return false;
      }
    },
    []
  );

  const createDriver = useCallback(
    async (payload: Record<string, any>): Promise<HqDriverSummary | null> => {
      try {
        const res = await fetch('/api/hq/drivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok || !data.driver) {
          throw new Error(data.error || '신규 기사 등록에 실패했습니다.');
        }

        // Add to local state & re-fetch to ensure counts and rankings are updated
        await fetchDrivers();
        return data.driver;
      } catch (err: any) {
        console.error('[useHqDrivers] Create error:', err);
        return null;
      }
    },
    [fetchDrivers]
  );

  return {
    drivers,
    counts,
    isLoading,
    error,
    refetch: fetchDrivers,
    updateDriver,
    createDriver,
  };
}
