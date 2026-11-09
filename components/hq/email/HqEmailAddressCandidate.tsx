'use client';

import { useEffect, useState } from 'react';
import { HqButton } from '@/components/hq/ui';
import type { PoiResult } from '@/components/hq/HqPlaceSearchInput';
import { searchTmapPoisClient } from '@/lib/places/tmapSearchEngine';
import { addressHintToTmapQuery } from '@/utils/emailBookingEvidence';

/** Read-only client address -> real TMAP candidate lookup.
 * Automatically searches when AI extraction reveals an address, but never
 * saves coordinates or marks it verified until an HQ operator selects one. */
export function HqEmailAddressCandidate({
  sourceAddress,
  placeName,
  isPoiConfirmed,
  onPick,
  onLocateInSource,
  className = 'pl-14',
}: {
  sourceAddress: string;
  placeName: string;
  isPoiConfirmed: boolean;
  onPick: (poi: PoiResult) => void;
  onLocateInSource?: (address: string) => void;
  className?: string;
}) {
  const [candidate, setCandidate] = useState<PoiResult | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'not-found'>('idle');

  useEffect(() => {
    if (!sourceAddress.trim() || isPoiConfirmed) {
      setCandidate(null);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    setCandidate(null);
    const query = addressHintToTmapQuery(sourceAddress);
    (async () => {
      try {
        let result = await searchTmapPoisClient(query, { signal: controller.signal });
        // Fallback is a venue-name lookup, NOT an address verified by the client.
        if (!result.length && placeName.trim()) {
          result = await searchTmapPoisClient(placeName, { signal: controller.signal });
        }
        if (controller.signal.aborted) return;
        setCandidate(result[0] || null);
        setState(result.length ? 'ready' : 'not-found');
      } catch {
        if (!controller.signal.aborted) setState('not-found');
      }
    })();
    return () => controller.abort();
  }, [sourceAddress, placeName, isPoiConfirmed]);

  return (
    <div className={`${className} mt-1 space-y-1 text-[11px] leading-relaxed`}>
      <p className="text-slate-500 break-words" title={sourceAddress}>
        고객 제공 주소 · {sourceAddress}
      </p>
      {onLocateInSource && <HqButton variant="ghost" size="sm" onClick={event => { event.stopPropagation(); onLocateInSource(sourceAddress); }} aria-label={`고객 제공 주소 원문 확인: ${sourceAddress}`}>원문에서 확인</HqButton>}
      {!isPoiConfirmed && state === 'loading' && <p className="text-slate-400">주소로 TMAP 후보 검색 중…</p>}
      {!isPoiConfirmed && state === 'not-found' && (
        <p className="text-slate-400">자동 주소 검색 결과 없음 · 장소를 눌러 직접 확인</p>
      )}
      {!isPoiConfirmed && state === 'ready' && candidate && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onPick(candidate); }}
          className="block text-left text-slate-600 hover:text-[#1E60F3] transition-colors cursor-pointer"
          title={'TMAP 후보 직접 선택: ' + candidate.address}
        >
          TMAP 후보 · {candidate.name} ({candidate.address}) · <span className="font-semibold underline">주소 확인 후 선택</span>
        </button>
      )}
    </div>
  );
}
