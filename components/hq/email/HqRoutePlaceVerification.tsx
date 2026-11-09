'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Compass, MapPin, Search } from 'lucide-react';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import { HqBadge } from '@/components/hq/ui';
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
      className="space-y-3.5 rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-5 border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-2 pb-1">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Compass className="w-4.5 h-4.5 text-[#1E60F3] shrink-0" />
            운행 경로 · 주소 확인
          </h4>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            이메일에서 추출한 장소명은 주소가 아닙니다. TMAP 검색 결과를 선택해 위치를 확정해 주세요.
          </p>
        </div>
        <HqBadge tone={missingCount ? 'warning' : 'neutral'} className="shrink-0">
          {missingCount === 0 ? `${confirmedCount}곳 확인 완료` : `${missingCount}곳 확인 필요`}
        </HqBadge>
      </div>

      <div className="space-y-2.5">
        {stops.map((stop, index) => {
          const verified = isVerifiedEmailRouteStop(stop);
          const expanded = editingId === stop.id;
          return (
            <div key={stop.id} className="rounded-2xl border border-slate-100/90 bg-white hover:bg-slate-50/50 p-4 transition-all shadow-2xs space-y-1.5">
              <div className="flex min-w-0 items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="w-2 h-2 rounded-full bg-slate-300 inline-block mr-1 shrink-0" aria-hidden="true" />
                    <span className="shrink-0 tabular-nums font-black text-slate-900">{stop.time || '--:--'}</span>
                    <span className="min-w-0 font-black text-slate-900">{stop.location || '장소 미지정'}</span>
                    {index === 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-100/80">출발</span>}
                    {index === stops.length - 1 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">종료</span>}
                  </div>
                  {stop.address ? (
                    <p className="mt-1 break-words text-[11px] font-medium leading-relaxed text-slate-400 pl-5">{stop.address}</p>
                  ) : (
                    <p className="mt-1 text-[11px] font-medium text-slate-400 pl-5">
                      {verified ? '좌표 확인됨 · 상세 주소를 다시 선택할 수 있어요' : <HqBadge tone="warning">주소 미확정</HqBadge>}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 pl-5">
                    {verified ? <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" /> : <Search className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{verified ? 'TMAP 위치 확인됨' : 'TMAP 검색 결과 선택 필요'}</span>
                  </p>
                </div>
                <button type="button" disabled={disabled || !onUpdateDraft}
                  onClick={() => { setSelectionError(null); setEditingId(expanded ? null : stop.id); }}
                  aria-expanded={expanded} aria-label={`${stop.location || '경유지'} 주소 ${expanded ? '닫기' : '확인하기'}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40">
                  <span>{verified ? '변경' : '주소 확인'}</span>
                  {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </div>
              {expanded && (
                <div className="relative z-20 mt-3 pl-5">
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
