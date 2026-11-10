'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { PredictionResult, PredictionTimelineItem } from '@/app/api/route/prediction/route';
import { haptics } from '@/utils/haptics';
import { formatEtaTime } from '@/utils/navigation';

interface PredictionResultSheetProps {
  isOpen: boolean;
  onClose: () => void;
  prediction: PredictionResult | null;
  isLoading: boolean;
  onOpenTimePicker: () => void;
  onApplyPrediction?: (selectedDate: Date, durationMinutes: number, arrivalFormatted: string) => void;
  selectedDate: Date;
}

const FULL_WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function formatDurationKorean(minutes: number | null): { timePart: string; unitPart: string } {
  if (minutes === null || minutes <= 0) {
    return { timePart: '예측 불가', unitPart: '' };
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) {
      return { timePart: `${h}시간`, unitPart: '걸려요' };
    }
    return { timePart: `${h}시간 ${m}분`, unitPart: '걸려요' };
  }
  return { timePart: `${minutes}분`, unitPart: '걸려요' };
}

function formatDatePrefixKorean(target: Date): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((targetStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '내일';
  return `${target.getMonth() + 1}월 ${target.getDate()}일 ${FULL_WEEKDAYS[target.getDay()]}`;
}

export const PredictionResultSheet: React.FC<PredictionResultSheetProps> = ({
  isOpen,
  onClose,
  prediction,
  isLoading,
  onOpenTimePicker,
  onApplyPrediction,
  selectedDate,
}) => {
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(0);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);

  // Body Scroll Lock + Escape Key Dismiss
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Structure genuine TMAP timeline slots matching Reference UI:
  // 0m (base time), +30m, +60m ('1시간 후'), +90m, +120m ('2시간 후')
  const displayRows = useMemo(() => {
    if (!prediction?.timeline || prediction.timeline.length === 0) {
      return [];
    }

    const futureSlots = prediction.timeline.filter((s) => s.offsetMinutes >= 0);
    const sourceSlots = futureSlots.length > 0 ? futureSlots : prediction.timeline;

    const targetOffsets = [0, 30, 60, 90, 120];
    const picked: { slot: PredictionTimelineItem; label: string; isBase: boolean }[] = [];

    targetOffsets.forEach((targetOffset) => {
      let closest = sourceSlots[0];
      let minDiff = Math.abs(sourceSlots[0].offsetMinutes - targetOffset);
      for (const s of sourceSlots) {
        const diff = Math.abs(s.offsetMinutes - targetOffset);
        if (diff < minDiff) {
          minDiff = diff;
          closest = s;
        }
      }

      let label = '';
      if (targetOffset === 0) {
        const h24 = selectedDate.getHours();
        const period = h24 >= 12 ? '오후' : '오전';
        let h12 = h24 % 12;
        if (h12 === 0) h12 = 12;
        const m = selectedDate.getMinutes();
        label = `${period} ${h12}:${String(m).padStart(2, '0')}`;
      } else if (targetOffset === 60) {
        label = '1시간 후';
      } else if (targetOffset === 120) {
        label = '2시간 후';
      }

      if (!picked.some((p) => p.slot.offsetMinutes === closest.offsetMinutes)) {
        picked.push({
          slot: closest,
          label,
          isBase: targetOffset === 0,
        });
      }
    });

    return picked;
  }, [prediction, selectedDate]);

  // Reset active slot on prediction update
  const [prevPrediction, setPrevPrediction] = useState<PredictionResult | null>(prediction);
  if (prediction !== prevPrediction) {
    setPrevPrediction(prediction);
    setActiveSlotIdx(0);
  }

  if (!isOpen) return null;

  const isUnavailable = Boolean(
    prediction?.isUnavailable ||
      (!isLoading && (!prediction || displayRows.length === 0 || displayRows[0]?.slot.durationMinutes === null))
  );

  const currentItem = displayRows[activeSlotIdx]?.slot;
  const currentDuration =
    currentItem && currentItem.durationMinutes !== null
      ? currentItem.durationMinutes
      : prediction?.predictedDurationMinutes ?? null;

  const currentOffsetMs = (currentItem ? currentItem.offsetMinutes : 0) * 60 * 1000;
  const effectiveDepartureDate = new Date(selectedDate.getTime() + currentOffsetMs);
  const effectiveArrivalDate =
    currentDuration !== null
      ? new Date(effectiveDepartureDate.getTime() + currentDuration * 60 * 1000)
      : null;
  const arrivalFormatted = effectiveArrivalDate ? formatEtaTime(effectiveArrivalDate) : '--:--';

  // Header Briefing: e.g. "오늘 오후 10시 40분 출발하면"
  const datePrefix = formatDatePrefixKorean(effectiveDepartureDate);
  const h24 = effectiveDepartureDate.getHours();
  const period = h24 >= 12 ? '오후' : '오전';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const m = effectiveDepartureDate.getMinutes();
  const timePhrase = m === 0 ? `${period} ${h12}시` : `${period} ${h12}시 ${m}분`;
  const headerBriefing = `${datePrefix} ${timePhrase} 출발하면`;

  const { timePart, unitPart } = formatDurationKorean(currentDuration);

  // Base Duration for relative comparison (Row 0 is the baseline)
  const baseDuration = displayRows[0]?.slot.durationMinutes ?? currentDuration ?? 0;
  const BASE_KNOB_PERCENT = 80;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none overscroll-contain driver-modal-backdrop"
      onClick={() => {
        haptics.lightTap();
        onClose();
      }}
    >
      {/* Outer Soft Cool-Gray Modal Container holding Two Volumetric White Cards */}
      <div
        className="relative w-full max-w-md bg-[#F4F7FC] rounded-[32px] p-4 sm:p-5 shadow-2xl z-10 border border-white/90 flex flex-col gap-4 max-h-[90dvh] overflow-y-auto driver-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CARD 1: Top Briefing + Large Duration + [시간변경] Pill */}
        <div className="bg-white rounded-[28px] px-5 sm:px-6 py-7 shadow-[0_8px_28px_rgba(15,23,42,0.05)] border border-slate-100/80 flex flex-col items-center text-center">
          {/* Header Row: Iridescent AI Ring + Briefing + Info Icon */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {/* Iridescent Orbital AI Badge */}
            <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 32 32" className="w-7 h-7" aria-hidden="true">
                <defs>
                  <linearGradient id="aiRingGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38BDF8" />
                    <stop offset="50%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#EC4899" />
                  </linearGradient>
                  <linearGradient id="aiRingGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#A855F7" />
                    <stop offset="50%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#2DD4BF" />
                  </linearGradient>
                </defs>
                <ellipse
                  cx="16"
                  cy="16"
                  rx="13.5"
                  ry="11.5"
                  transform="rotate(-25 16 16)"
                  fill="none"
                  stroke="url(#aiRingGrad1)"
                  strokeWidth="2.2"
                  opacity="0.85"
                />
                <ellipse
                  cx="16"
                  cy="16"
                  rx="13.5"
                  ry="11.5"
                  transform="rotate(35 16 16)"
                  fill="none"
                  stroke="url(#aiRingGrad2)"
                  strokeWidth="1.8"
                  opacity="0.75"
                />
                <circle cx="16" cy="16" r="10.5" fill="#FFFFFF" />
              </svg>
              <span className="absolute text-[10px] font-black text-[#0F172A] tracking-tighter leading-none">
                AI
              </span>
            </div>

            <span className="text-[15px] sm:text-[17px] font-bold text-[#0F172A] tracking-tight">
              {headerBriefing}
            </span>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setShowInfoTooltip((prev) => !prev);
              }}
              className="text-[#94A3B8] hover:text-slate-600 transition-colors cursor-pointer p-0.5"
              aria-label="TMAP 예측 안내"
            >
              <Info className="w-[18px] h-[18px] stroke-[1.8]" />
            </button>
          </div>

          {/* Optional Info Tooltip */}
          {showInfoTooltip && (
            <div className="mt-3 p-3 bg-[#F4F7FC] rounded-2xl text-slate-600 text-xs leading-relaxed text-left w-full animate-fade-in">
              <span className="font-extrabold text-[#0F172A] block mb-0.5">
                TMAP 타임머신 교통 빅데이터 예측
              </span>
              티맵 공식 예측 API를 호출하여 선택한 출발 시각과 이후 시간대별 실제 예상 소요 시간을 계산합니다.
            </div>
          )}

          {/* Duration Display or Loading / Unavailable State */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center my-6">
              <div className="w-8 h-8 border-3 border-[#1868F6] border-t-transparent rounded-full animate-spin mb-2.5" />
              <span className="text-sm font-bold text-slate-500">
                TMAP 교통 예측 시간 계산 중...
              </span>
            </div>
          ) : isUnavailable || currentDuration === null ? (
            <div className="flex flex-col items-center justify-center my-5 px-2">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mb-2.5">
                <AlertTriangle className="w-5 h-5 stroke-[2]" />
              </div>
              <p className="text-base font-extrabold text-[#0F172A] mb-1">
                예측 정보를 불러올 수 없습니다
              </p>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                {prediction?.error || '현재 시각 이후의 출발 시간을 다시 선택해 주세요.'}
              </p>
            </div>
          ) : (
            <h3 className="mt-3.5 mb-5 text-[36px] sm:text-[42px] leading-tight tracking-tight flex items-baseline justify-center gap-2">
              <span className="text-[#1868F6] font-black tabular-nums">{timePart}</span>
              {unitPart && <span className="text-[#0F172A] font-black">{unitPart}</span>}
            </h3>
          )}

          {/* Soft Pill Button: [시간변경] */}
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onOpenTimePicker();
            }}
            className="px-6 py-2.5 rounded-full bg-[#ECF2FC] hover:bg-[#DFE9FA] active:scale-95 text-[#0F172A] text-[15px] font-bold transition-all cursor-pointer"
          >
            시간변경
          </button>
        </div>

        {/* CARD 2: Timeline Comparison Bars */}
        {!isLoading && !isUnavailable && displayRows.length > 0 && (
          <div className="bg-white rounded-[28px] p-3.5 sm:p-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)] border border-slate-100/80">
            <div className="flex flex-col">
              {displayRows.map((rowItem, idx) => {
                const isSelected = idx === activeSlotIdx;
                const isBaseRow = rowItem.isBase;
                const isLastRow = idx === displayRows.length - 1;
                const slotDuration = rowItem.slot.durationMinutes;
                const isSlotUnavailable = rowItem.slot.isUnavailable || slotDuration === null;
                const diffMinutes = slotDuration !== null ? slotDuration - baseDuration : 0;

                let gaugePercent = BASE_KNOB_PERCENT;
                if (baseDuration > 0 && slotDuration !== null) {
                  gaugePercent = Math.min(
                    95,
                    Math.max(28, BASE_KNOB_PERCENT * (slotDuration / baseDuration))
                  );
                }

                const isHeavyDelay = diffMinutes >= 8;
                const barColor = isHeavyDelay ? 'bg-[#F05650]' : 'bg-[#F6BC28]';
                const diffTextColor = isHeavyDelay ? 'text-[#E54842]' : 'text-[#EAA615]';
                const diffText =
                  diffMinutes > 0
                    ? `+${diffMinutes}분`
                    : diffMinutes < 0
                    ? `${diffMinutes}분`
                    : '0분';

                if (isBaseRow) {
                  return (
                    <div
                      key={rowItem.slot.offsetMinutes}
                      onClick={() => {
                        haptics.lightTap();
                        setActiveSlotIdx(idx);
                        if (onApplyPrediction && slotDuration !== null) {
                          onApplyPrediction(selectedDate, slotDuration, arrivalFormatted);
                        }
                      }}
                      className="rounded-2xl bg-[#EEF3FC] px-4 py-3.5 flex items-center cursor-pointer transition-colors"
                    >
                      {/* Left Label */}
                      <div className="w-20 sm:w-22 shrink-0 text-left">
                        <span className="text-[15px] font-extrabold text-[#0F172A] tracking-tight tabular-nums whitespace-nowrap">
                          {rowItem.label}
                        </span>
                      </div>

                      {/* Right Slider Track */}
                      <div className="relative flex-1 flex items-center h-5 ml-2">
                        {/* Vertical Dashed Line starting downward from knob center */}
                        {displayRows.length > 1 && (
                          <div
                            className="absolute top-1/2 bottom-[-24px] border-l border-dashed border-[#B8CEF8] pointer-events-none z-0"
                            style={{ left: `${BASE_KNOB_PERCENT}%` }}
                          />
                        )}

                        {/* Gray Base Rail */}
                        <div className="absolute inset-x-0 h-[5px] bg-[#D8E1F0] rounded-full" />

                        {/* Solid Royal Blue Bar */}
                        <div
                          className="absolute left-0 h-[5px] bg-[#1868F6] rounded-full z-10"
                          style={{ width: `${BASE_KNOB_PERCENT}%` }}
                        />

                        {/* White-Centered Blue Ring Knob */}
                        <div
                          className="absolute -translate-x-1/2 w-5 h-5 rounded-full bg-white border-[4px] border-[#1868F6] shadow-[0_2px_6px_rgba(24,104,246,0.28)] z-20 pointer-events-none"
                          style={{ left: `${BASE_KNOB_PERCENT}%` }}
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={rowItem.slot.offsetMinutes}
                    onClick={() => {
                      if (!isSlotUnavailable) {
                        haptics.lightTap();
                        setActiveSlotIdx(idx);
                      }
                    }}
                    className={`rounded-xl px-4 pt-6 pb-2.5 flex items-center transition-colors ${
                      isSlotUnavailable
                        ? 'opacity-45 cursor-not-allowed'
                        : isSelected
                        ? 'bg-[#F8FAFF] cursor-pointer'
                        : 'hover:bg-slate-50/70 cursor-pointer'
                    }`}
                  >
                    {/* Left Label ('1시간 후', '2시간 후', or blank on 30m/90m intervals) */}
                    <div className="w-20 sm:w-22 shrink-0 text-left">
                      <span className="text-sm sm:text-[15px] font-medium text-[#64748B] tracking-tight whitespace-nowrap">
                        {rowItem.label}
                      </span>
                    </div>

                    {/* Right Comparison Bar */}
                    <div className="relative flex-1 flex items-center h-5 ml-2">
                      {/* Continuous Vertical Dashed Reference Line */}
                      <div
                        className={`absolute top-[-28px] ${
                          isLastRow ? 'bottom-1/2' : 'bottom-[-18px]'
                        } border-l border-dashed border-[#B8CEF8] pointer-events-none z-0`}
                        style={{ left: `${BASE_KNOB_PERCENT}%` }}
                      />

                      {/* Gray Base Rail */}
                      <div className="absolute inset-x-0 h-[5px] bg-[#E5E9F0] rounded-full" />

                      {isSlotUnavailable ? (
                        <span className="relative z-10 text-[11px] font-bold text-slate-400 pl-2">
                          예측 불가
                        </span>
                      ) : (
                        <>
                          <div
                            className={`absolute left-0 h-[5px] rounded-full z-10 transition-all duration-300 ${barColor}`}
                            style={{ width: `${gaugePercent}%` }}
                          />
                          <div
                            className="absolute left-0 -top-5 text-right pointer-events-none z-20 transition-all duration-300"
                            style={{ width: `${gaugePercent}%` }}
                          >
                            <span
                              className={`text-[15px] font-extrabold tracking-tight tabular-nums ${diffTextColor}`}
                            >
                              {diffText}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
