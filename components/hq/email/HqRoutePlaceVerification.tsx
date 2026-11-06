'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, MapPin, Search } from 'lucide-react';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import { HqPlaceSearchInput } from '@/components/hq/HqPlaceSearchInput';
import {
  changeEmailRouteStopName, confirmEmailRouteStop, getEmailRouteStops, isVerifiedEmailRouteStop,
} from '@/utils/emailRoutePlaceVerification';

interface Props {
  draft: HqEmailExtractedDraft;
  onUpdateDraft?: (updated: HqEmailExtractedDraft) => void;
  disabled?: boolean;
}

/** Visible from step 5: operators can verify every waypoint without going back to step 3. */
export const HqRoutePlaceVerification: React.FC<Props> = ({ draft, onUpdateDraft, disabled = false }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const stops = getEmailRouteStops(draft);
  const confirmedCount = stops.filter(isVerifiedEmailRouteStop).length;
  const missingCount = stops.length - confirmedCount;

  useEffect(() => {
    if (editingId && !stops.some((point) => point.id === editingId)) setEditingId(null);
  }, [editingId, stops]);

  return (
    <section id="email-route-place-verification" aria-label="운행 경로 주소 확정"
      className="space-y-3 rounded-2xl bg-slate-50/75 p-3.5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
            <MapPin className="h-4 w-4 text-slate-400" strokeWidth={1.7} />
            운행 경로 · 주소 확인
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            이메일에서 추출한 장소명은 주소가 아닙니다. TMAP 검색 결과를 선택해 위치를 확정해 주세요.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-medium tabular-nums text-slate-600">
          {missingCount === 0 ? `${confirmedCount}곳 확인 완료` : `${missingCount}곳 확인 필요`}
        </span>
      </div>

      <div className="space-y-1.5">
        {stops.map((stop, index) => {
          const verified = isVerifiedEmailRouteStop(stop);
          const expanded = editingId === stop.id;
          return (
            <div key={stop.id} className="rounded-xl bg-white px-3.5 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <div className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="shrink-0 tabular-nums text-slate-500">{stop.time || '--:--'}</span>
                    <span className="min-w-0 font-medium text-slate-800">{stop.location || '장소 미지정'}</span>
                    {index === 0 && <span className="text-[10px] text-slate-400">출발</span>}
                    {index === stops.length - 1 && <span className="text-[10px] text-slate-400">종료</span>}
                  </p>
                  {stop.address ? (
                    <p className="mt-1 break-words text-[11px] leading-relaxed text-slate-500">{stop.address}</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">
                      {verified ? '좌표 확인됨 · 상세 주소를 다시 선택할 수 있어요' : '상세 주소 미확정'}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                    {verified ? <CheckCircle2 className="h-3 w-3 text-slate-500" /> : <Search className="h-3 w-3 text-slate-400" />}
                    {verified ? 'TMAP 위치 확인됨' : 'TMAP 검색 결과 선택 필요'}
                  </p>
                </div>
                <button type="button" disabled={disabled || !onUpdateDraft}
                  onClick={() => { setSelectionError(null); setEditingId(expanded ? null : stop.id); }}
                  aria-expanded={expanded} aria-label={`${stop.location || '경유지'} 주소 ${expanded ? '닫기' : '확인하기'}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                  {verified ? '변경' : '주소 확인'}
                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              {expanded && (
                <div className="relative z-20 mt-3 pl-0.5">
                  <HqPlaceSearchInput
                    value={stop.location}
                    onChange={(name) => {
                      setSelectionError(null);
                      onUpdateDraft?.(changeEmailRouteStopName(draft, stop.id, name));
                    }}
                    onSelectPoi={(poi) => {
                      try {
                        onUpdateDraft?.(confirmEmailRouteStop(draft, stop.id, poi));
                        setSelectionError(null);
                        setEditingId(null);
                      } catch (error) {
                        setSelectionError(error instanceof Error ? error.message : '장소 확인에 실패했습니다.');
                      }
                    }}
                    autoSearch
                    isConfirmed={verified}
                    disabled={disabled}
                    tone="neutral"
                    heightClass="h-10"
                    placeholder="장소명 또는 주소로 TMAP 검색"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400">검색 결과에서 정확한 주소를 선택하면 자동으로 확정됩니다.</p>
                  {selectionError && <p role="alert" className="mt-1.5 text-[11px] text-rose-600">{selectionError}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {missingCount > 0 && (
        <p role="status" className="px-1 text-xs text-slate-600">
          나머지 {missingCount}곳을 확인해야 실제 배차를 저장할 수 있습니다.
        </p>
      )}
    </section>
  );
};
