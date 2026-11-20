'use client';

import React, { useEffect, useState } from 'react';
import { Plane } from 'lucide-react';
import type { FlightInfo, FlightType } from '@/types';
import {
  buildFallbackFlightHint,
  formatLiveFlightHint,
  normalizeFlightCode,
  resolveFlightHintDirection,
  type EmailFlightHintInfo,
} from '@/utils/emailFlightHint';

const liveFlightCache = new Map<string, { flight: FlightInfo | null; candidates: FlightInfo[] } | null>();
const inflightRequests = new Map<string, Promise<{ flight: FlightInfo | null; candidates: FlightInfo[] } | null>>();

async function fetchFlightLookup(
  flightCode: string,
  type: FlightType,
): Promise<{ flight: FlightInfo | null; candidates: FlightInfo[] } | null> {
  const key = `${type}:${flightCode}`;
  if (liveFlightCache.has(key)) {
    return liveFlightCache.get(key) ?? null;
  }
  const existing = inflightRequests.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetch(
        `/api/flight?flightId=${encodeURIComponent(flightCode)}&type=${encodeURIComponent(type)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        liveFlightCache.set(key, null);
        return null;
      }
      const data = await response.json();
      if (!data?.success || !data?.flight) {
        liveFlightCache.set(key, null);
        return null;
      }
      const payload = {
        flight: data.flight as FlightInfo,
        candidates: Array.isArray(data.candidates) ? (data.candidates as FlightInfo[]) : [],
      };
      liveFlightCache.set(key, payload);
      return payload;
    } catch {
      return null;
    } finally {
      inflightRequests.delete(key);
    }
  })();

  inflightRequests.set(key, request);
  return request;
}

export interface HqFlightInfoHintProps {
  flightNumber?: string | null;
  date?: string | null;
  role?: 'arrival' | 'departure' | 'connection' | 'unknown';
  originAirport?: string | null;
  destinationAirport?: string | null;
  scheduledArrival?: string | null;
  scheduledDeparture?: string | null;
  className?: string;
}

export const HqFlightInfoHint: React.FC<HqFlightInfoHintProps> = ({
  flightNumber,
  date,
  role,
  originAirport,
  destinationAirport,
  scheduledArrival,
  scheduledDeparture,
  className = '',
}) => {
  const normalizedCode = normalizeFlightCode(flightNumber);
  const direction = resolveFlightHintDirection({
    originAirport,
    destinationAirport,
    role,
    scheduledArrival,
    scheduledDeparture,
  });
  const queryType: FlightType = direction?.queryType || (role === 'departure' ? 'departure' : 'arrival');
  const [liveHint, setLiveHint] = useState<EmailFlightHintInfo | null>(null);

  useEffect(() => {
    if (!normalizedCode || role === 'connection' || !direction) {
      setLiveHint(null);
      return;
    }
    let active = true;
    const cacheKey = `${queryType}:${normalizedCode}`;
    const cached = liveFlightCache.get(cacheKey);
    if (cached) {
      const matched = (date && cached.candidates.find(c => c.flightDate === date)) || cached.flight;
      setLiveHint(matched ? formatLiveFlightHint(matched) : null);
      return;
    }

    fetchFlightLookup(normalizedCode, queryType).then((payload) => {
      if (!active) return;
      if (!payload) {
        setLiveHint(null);
        return;
      }
      const matched = (date && payload.candidates.find(c => c.flightDate === date)) || payload.flight;
      setLiveHint(matched ? formatLiveFlightHint(matched) : null);
    });

    return () => {
      active = false;
    };
  }, [normalizedCode, queryType, date, role, direction]);

  if (!normalizedCode || role === 'connection') return null;

  const fallback = buildFallbackFlightHint({
    flightNumber: normalizedCode,
    date,
    originAirport,
    destinationAirport,
    role,
    scheduledArrival,
    scheduledDeparture,
  });

  const hint = liveHint || fallback;
  if (!hint) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium text-[#61728A] leading-snug break-keep ${className}`}
      title={hint.isLiveApi ? '실시간 항공편 조회 결과' : '항공사 터미널 · 일정 기준 안내'}
    >
      <Plane className={`h-3 w-3 shrink-0 ${hint.isLiveApi ? 'text-[#1E60F3]' : 'text-[#8FA0B8]'}`} aria-hidden="true" />
      <span>{hint.summaryText}</span>
    </span>
  );
};
