'use client';

import { useState, useEffect, useCallback } from 'react';
import { HqDriverSummary } from '@/types/driverHq';

export interface CreateDriverResult {
  ok: boolean;
  driver?: HqDriverSummary;
  error?: string;
  statusCode?: number;
  isDuplicate?: boolean;
  duplicateCount?: number;
  existingDrivers?: Array<{
    id: string;
    name: string;
    phone: string;
    vehicleNo?: string;
    carNumber?: string;
    vehicleModel?: string;
    createdAt?: string;
  }>;
}

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
  statusCode: number | null;
  refetch: () => Promise<void>;
  updateDriver: (id: string, updates: Record<string, any>) => Promise<boolean>;
  deleteDriver: (id: string) => Promise<boolean>;
  createDriver: (data: Record<string, any>, allowDuplicate?: boolean) => Promise<CreateDriverResult>;
}

// Module-level in-memory cache to guarantee instant 0ms switching across tabs
let memoryDriversCache: HqDriverSummary[] | null = null;
let memoryCountsCache: {
  total: number;
  employed: number;
  freelance: number;
  englishCount: number;
} | null = null;
let lastFetchedAt = 0;
const DRIVERS_CACHE_KEY = 'vip_hq_drivers_cache_v1';
const SYNC_EVENT_NAME = 'hq-drivers-cache-updated';
const FRESH_CACHE_TTL_MS = 15 * 1000; // 15 seconds fresh window before SWR revalidation

function readInitialCache(): {
  drivers: HqDriverSummary[];
  counts: { total: number; employed: number; freelance: number; englishCount: number };
} | null {
  if (memoryDriversCache && memoryCountsCache) {
    return { drivers: memoryDriversCache, counts: memoryCountsCache };
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(DRIVERS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.drivers)) {
          memoryDriversCache = parsed.drivers;
          memoryCountsCache = parsed.counts || {
            total: parsed.drivers.length,
            employed: 0,
            freelance: 0,
            englishCount: 0,
          };
          lastFetchedAt = Number(parsed.timestamp) || Date.now();
          return { drivers: memoryDriversCache!, counts: memoryCountsCache! };
        }
      }
    } catch (e) {
      // Ignore sessionStorage read errors
    }
  }
  return null;
}

function writeCache(
  drivers: HqDriverSummary[],
  counts: { total: number; employed: number; freelance: number; englishCount: number }
) {
  memoryDriversCache = drivers;
  memoryCountsCache = counts;
  lastFetchedAt = Date.now();
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(
        DRIVERS_CACHE_KEY,
        JSON.stringify({ drivers, counts, timestamp: lastFetchedAt })
      );
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT_NAME, {
          detail: { drivers, counts, timestamp: lastFetchedAt },
        })
      );
    } catch (e) {
      // Ignore quota errors
    }
  }
}

export function useHqDrivers(): UseHqDriversResult {
  const [initialData] = useState(() => readInitialCache());
  const [drivers, setDrivers] = useState<HqDriverSummary[]>(() => initialData?.drivers || []);
  const [counts, setCounts] = useState(() => initialData?.counts || {
    total: 0,
    employed: 0,
    freelance: 0,
    englishCount: 0,
  });
  // If cache is present, never block the UI with a spinner; show cached data immediately!
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialData);
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(() => (initialData ? 200 : null));

  // Sync state with other hook instances across the dashboard
  useEffect(() => {
    const handleCacheSync = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.drivers && Array.isArray(detail.drivers)) {
        setDrivers(detail.drivers);
        if (detail.counts) {
          setCounts(detail.counts);
        }
      }
    };
    window.addEventListener(SYNC_EVENT_NAME, handleCacheSync);
    return () => window.removeEventListener(SYNC_EVENT_NAME, handleCacheSync);
  }, []);

  const fetchDrivers = useCallback(async (force = false) => {
    // Stale-While-Revalidate: If data is fresh within TTL, avoid unnecessary roundtrips
    const isFresh = !force && memoryDriversCache && (Date.now() - lastFetchedAt < FRESH_CACHE_TTL_MS);
    if (isFresh) {
      return;
    }

    try {
      // Only trigger full-screen loading if we have zero cached data
      if (!memoryDriversCache && drivers.length === 0) {
        setIsLoading(true);
      }
      setError(null);

      const res = await fetch('/api/hq/drivers', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      setStatusCode(res.status);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `기사 목록을 불러오지 못했습니다. (HTTP ${res.status})`);
      }

      const fetchedDrivers = data.drivers || [];
      const fetchedCounts = data.counts || {
        total: fetchedDrivers.length,
        employed: 0,
        freelance: 0,
        englishCount: 0,
      };

      setDrivers(fetchedDrivers);
      setCounts(fetchedCounts);
      writeCache(fetchedDrivers, fetchedCounts);
      setStatusCode(200);
    } catch (err: any) {
      console.error('[useHqDrivers] Fetch error:', err);
      // If we don't have any cached data, surface the error
      if (!memoryDriversCache && drivers.length === 0) {
        setError(err.message || '서버 통신 실패');
      }
    } finally {
      setIsLoading(false);
    }
  }, [drivers.length]);

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

        // Optimistically update in local state and memory cache
        setDrivers((prev) => {
          const next = prev.map((d) => (d.id === id ? { ...d, ...data.driver } : d));
          writeCache(next, counts);
          return next;
        });

        // Re-fetch in background to update KPI counts (employed/freelance counts)
        fetchDrivers(true).catch(() => {});
        return true;
      } catch (err: any) {
        console.error('[useHqDrivers] Update error:', err);
        return false;
      }
    },
    [counts, fetchDrivers]
  );

  const deleteDriver = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/hq/drivers/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok) {
          throw new Error(data.error || '기사 삭제에 실패했습니다.');
        }

        // Optimistically remove from local state and update cache
        setDrivers((prev) => {
          const next = prev.filter((d) => d.id !== id);
          const nextCounts = {
            ...counts,
            total: Math.max(0, counts.total - 1),
          };
          setCounts(nextCounts);
          writeCache(next, nextCounts);
          return next;
        });

        fetchDrivers(true).catch(() => {});
        return true;
      } catch (err: any) {
        console.error('[useHqDrivers] Delete error:', err);
        return false;
      }
    },
    [counts, fetchDrivers]
  );

  const createDriver = useCallback(
    async (payload: Record<string, any>, allowDuplicate?: boolean): Promise<CreateDriverResult> => {
      try {
        const res = await fetch('/api/hq/drivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, allowDuplicate: Boolean(allowDuplicate) }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok || !data.driver) {
          return {
            ok: false,
            error: data.error || `기사 등록 실패 (HTTP ${res.status})`,
            statusCode: res.status,
            isDuplicate: Boolean(data.isDuplicate),
            duplicateCount: data.duplicateCount,
            existingDrivers: data.existingDrivers,
          };
        }

        const newDriver = data.driver;
        setDrivers((prev) => {
          const next = [newDriver, ...prev.filter((d) => d.id !== newDriver.id)];
          const nextCounts = {
            ...counts,
            total: counts.total + 1,
            employed: newDriver.affiliationType === 'employed' ? counts.employed + 1 : counts.employed,
            freelance: newDriver.affiliationType === 'freelance' ? counts.freelance + 1 : counts.freelance,
            englishCount: newDriver.englishAvailable ? counts.englishCount + 1 : counts.englishCount,
          };
          setCounts(nextCounts);
          writeCache(next, nextCounts);
          return next;
        });

        // Background refetch to ensure server-synced ordering and DB triggers
        fetchDrivers(true).catch(() => {});
        return { ok: true, driver: data.driver, statusCode: 200 };
      } catch (err: any) {
        console.error('[useHqDrivers] Create error:', err);
        return {
          ok: false,
          error: err.message || '네트워크 오류로 등록 실패',
          statusCode: 500,
        };
      }
    },
    [counts, fetchDrivers]
  );

  return {
    drivers,
    counts,
    isLoading,
    error,
    statusCode,
    refetch: () => fetchDrivers(true),
    updateDriver,
    deleteDriver,
    createDriver,
  };
}

