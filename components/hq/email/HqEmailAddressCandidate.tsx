'use client';

import { useEffect, useState } from 'react';
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
  sourceEvidence,
}: {
  sourceAddress: string;
  placeName: string;
  isPoiConfirmed: boolean;
  onPick: (poi: PoiResult) => void;
  onLocateInSource?: (address: string) => void;
  className?: string;
  sourceEvidence?: { message: string; excerpt: string };
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
      {onLocateInSource ? (
        <button type="button"
          title="이메일 원문에서 고객 제공 주소 찾기"
          aria-label={`고객 제공 주소 원문 확인: ${sourceAddress}`}
          onClick={(event) => { event.stopPropagation(); onLocateInSource(sourceAddress); }}
          className="w-full cursor-pointer break-words rounded-xl bg-[#F7F9FC] px-3 py-2.5 text-left text-[#52647A] transition-colors hover:bg-[#EEF3FF] hover:text-[#1E60F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25"
        >
          <span className="block text-[10px] text-[#8A97A7]">고객 제공 주소 · 눌러서 이메일 원문 확인</span>
          <span className="mt-1 block select-text font-medium">{sourceAddress}</span>
        </button>
      ) : <p className="select-text break-words text-slate-500" title={sourceAddress}>고객 제공 주소 · {sourceAddress}</p>}
      {sourceEvidence && (
        <div role="status" className="rounded-xl bg-[#F7F9FC] px-3 py-2.5 text-[11px] leading-relaxed text-[#52647A]">
          <p className="font-medium">{sourceEvidence.message}</p>
          {sourceEvidence.excerpt && <p className="mt-1.5 select-text whitespace-pre-wrap break-words text-[#17233B]">{sourceEvidence.excerpt}</p>}
        </div>
      )
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
