'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';

export interface ForecastLocation {
  name: string;
  lat?: number;
  lng?: number;
}

export interface RouteForecastChipProps {
  date: string;
  time?: string | null;
  origin: ForecastLocation;
  destination: ForecastLocation;
  /** True ONLY for HQ-verified coordinates. Missing address text alone is fine. */
  confirmed: boolean;
  /** Intermediate itinerary timestamps are not guaranteed to be departure times. */
  assumedDeparture?: boolean;
}

interface ForecastValue {
  minutes: number;
  arrival: string | null;
}

const resultCache = new Map<string, { expiresAt: number; promise: Promise<ForecastValue | null> }>();
const CACHE_MS = 15 * 60 * 1000;
const MAX_CACHE = 100;

function validCoordinate(point: ForecastLocation): boolean {
  return typeof point.lat === 'number' && Number.isFinite(point.lat) &&
    typeof point.lng === 'number' && Number.isFinite(point.lng) &&
    point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180 &&
    !(point.lat === 0 && point.lng === 0);
}

/** Strict KST clock. Never infer a departure time from the viewing device's timezone. */
export function scheduleForecastDate(date: string, time?: string | null): Date | null {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date || '') || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time || '')) return null;
  const instant = new Date(`${date}T${time}:00+09:00`);
  if (Number.isNaN(instant.getTime())) return null;
  // Prevent silently normalizing invalid calendar days such as Feb 30.
  if (new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(instant).replace(/\\s/g, '') !== date) return null;
  return instant;
}

function loadForecast(key: string, departureTime: Date, origin: ForecastLocation, destination: ForecastLocation): Promise<ForecastValue | null> {
  const existing = resultCache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const promise = fetch('/api/route/prediction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      singleSlot: true,
      predictionTime: departureTime.toISOString().replace('Z', '+00:00'),
      departure: { name: origin.name, lat: origin.lat, lng: origin.lng },
      destination: { name: destination.name, lat: destination.lat, lng: destination.lng },
      waypoints: [],
    }),
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      const minutes = data?.predictedDurationMinutes;
      // Never expose mock, fallback, cache error, or arbitrary duration as a real TMAP prediction.
      if (data?.isMock || data?.isFallback || data?.isUnavailable ||
        typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
      return {
        minutes,
        arrival: typeof data.arrivalTimeFormatted === 'string' ? data.arrivalTimeFormatted : null,
      };
    })
    .catch(() => null);
  resultCache.set(key, { promise, expiresAt: Date.now() + CACHE_MS });
  if (resultCache.size > MAX_CACHE) {
    const firstKey = resultCache.keys().next().value;
    if (firstKey !== undefined) resultCache.delete(firstKey);
  }
  return promise;
}

/**
 * Lightweight TMAP forecast used in both confirmed schedule and event itinerary rows.
 * Visible-only fetching + promise dedup + one-slot server endpoint protects free API quota.
 */
export function RouteForecastChip({
  date, time, origin, destination, confirmed, assumedDeparture = false,
}: RouteForecastChipProps) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState<ForecastValue | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

  const departureTime = useMemo(() => scheduleForecastDate(date, time), [date, time]);
  const routeKey = [date, time || '', origin.lat, origin.lng, destination.lat, destination.lng].join('|');
  const allowed = confirmed && validCoordinate(origin) && validCoordinate(destination) &&
    Boolean(departureTime) && departureTime!.getTime() > Date.now();

  useEffect(() => {
    setValue(null);
    setState('idle');
    if (!allowed || !departureTime) return;
    let disposed = false;
    let started = false;
    const target = elementRef.current;
    if (!target) return;
    const fetchIfVisible = () => {
      if (started) return;
      started = true;
      setState('loading');
      void loadForecast(routeKey, departureTime, origin, destination).then((result) => {
        if (disposed) return;
        setValue(result);
        setState(result ? 'ready' : 'unavailable');
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      fetchIfVisible();
    } else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          fetchIfVisible();
          observer.disconnect();
        }
      }, { rootMargin: '80px' });
      observer.observe(target);
      return () => { disposed = true; observer.disconnect(); };
    }
    return () => { disposed = true; };
  }, [allowed, departureTime?.getTime(), routeKey]);

  let label: string;
  if (!confirmed || !validCoordinate(origin) || !validCoordinate(destination)) {
    label = '위치 확인 후 예측 가능';
  } else if (!departureTime) {
    label = '시각 미확정';
  } else if (departureTime.getTime() <= Date.now()) {
    label = '지난 일정 · 예측 생략';
  } else if (state === 'ready' && value) {
    label = `${time} ${assumedDeparture ? '출발 가정' : '기준'} · TMAP 약 ${value.minutes}분${value.arrival ? ` · ${value.arrival} 도착 예상` : ''}`;
  } else if (state === 'unavailable') {
    label = 'TMAP 예측 불가';
  } else {
    label = `${time} ${assumedDeparture ? '출발 가정' : '기준'} · ${state === 'loading' ? '소요시간 조회 중' : '소요시간 조회 대기'}`;
  }

  return (
    <span
      ref={elementRef}
      title="선택된 일정 시각에 출발한다고 가정한 TMAP 교통 예측입니다. 실제 출발/도착시간과 차이가 날 수 있습니다."
      aria-live="polite"
      className="inline-flex max-w-full items-center gap-1.5 rounded-[10px] bg-[#F2F5F9] px-2.5 py-1.5 text-[11px] font-semibold leading-relaxed text-[#59708F]"
    >
      <Clock3 className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}
