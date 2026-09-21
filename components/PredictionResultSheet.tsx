'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Info, Check } from 'lucide-react';
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

function formatDurationKorean(minutes: number): { timePart: string; unitPart: string } {
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

  // 1. Body Scroll Lock when sheet is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [isOpen]);

  // 2. Filter / structure timeline slots for Screenshot 2 Horizontal Bar Rows
  // Typically: Base Departure (0m), +30m, +60m (1시간 후), +90m, +120m (2시간 후)
  const displayRows = useMemo(() => {
    if (!prediction?.timeline || prediction.timeline.length === 0) {
      return [];
    }

    // Filter slots starting from offset >= 0 to show future progression
    const futureSlots = prediction.timeline.filter((s) => s.offsetMinutes >= 0);
    const sourceSlots = futureSlots.length > 0 ? futureSlots : prediction.timeline;

    // Pick 5 representative intervals: 0m, 30m (or next), 60m (1시간 후), 90m, 120m (2시간 후)
    const targetOffsets = [0, 30, 60, 90, 120];
    const picked: { slot: PredictionTimelineItem; label: string; isBase: boolean }[] = [];

    targetOffsets.forEach((targetOffset) => {
      // Find closest slot
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
        // Label is the actual departure time (e.g., '오후 3:30')
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

  // Sync active slot on prediction update
  useEffect(() => {
    setActiveSlotIdx(0);
  }, [prediction]);

  if (!isOpen) return null;

  const currentItem = displayRows[activeSlotIdx]?.slot;
  const currentDuration = currentItem
    ? currentItem.durationMinutes
    : prediction?.predictedDurationMinutes || 45;

  const currentOffsetMs = (currentItem ? currentItem.offsetMinutes : 0) * 60 * 1000;
  const effectiveDepartureDate = new Date(selectedDate.getTime() + currentOffsetMs);
  const effectiveArrivalDate = new Date(
    effectiveDepartureDate.getTime() + currentDuration * 60 * 1000
  );
  const arrivalFormatted = formatEtaTime(effectiveArrivalDate);

  // 1. Header Briefing: "9월 25일 금요일 오후 3시 30분 출발하면 ⓘ"
  const month = effectiveDepartureDate.getMonth() + 1;
  const day = effectiveDepartureDate.getDate();
  const dayOfWeek = FULL_WEEKDAYS[effectiveDepartureDate.getDay()];
  const h24 = effectiveDepartureDate.getHours();
  const period = h24 >= 12 ? '오후' : '오전';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const m = effectiveDepartureDate.getMinutes();

  const headerBriefing = `${month}월 ${day}일 ${dayOfWeek} ${period} ${h12}시 ${String(m).padStart(2, '0')}분 출발하면`;

  // 2. Large Typography Duration Text
  const { timePart, unitPart } = formatDurationKorean(currentDuration);

  const handleApply = () => {
    haptics.lightTap();
    onApplyPrediction?.(effectiveDepartureDate, currentDuration, arrivalFormatted);
    onClose();
  };

  // Base Duration for relative comparison (Row 0 is the baseline)
  const baseDuration = displayRows[0]?.slot.durationMinutes || currentDuration;

  // Knob baseline anchor position on horizontal bar (fixed at 80% to give room for shorter/longer bars)
  const BASE_KNOB_PERCENT = 80;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center select-none animate-fade-in">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          haptics.lightTap();
          onClose();
        }}
      />

      {/* Bottom Sheet Container */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl p-6 z-10 animate-in slide-in-from-bottom-5 duration-250 border border-slate-100 flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Top Drag Indicator Pill */}
        <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-4" />

        {/* 1. Header: Circular AI Multi-Color Gradient Ring Symbol + Briefing + Close */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center space-x-2">
            {/* Native Ai Multi-Color Gradient Ring Symbol (Screenshot 2 Match) */}
            <div className="w-6 h-6 rounded-full p-[1.5px] bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 flex items-center justify-center shadow-xs shrink-0">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <span className="text-[10px] font-black text-slate-800 tracking-tighter leading-none">
                  Ai
                </span>
              </div>
            </div>

            {/* Detailed Briefing Text: e.g. "9월 25일 금요일 오후 3시 30분 출발하면" */}
            <div className="flex items-center space-x-1">
              <span className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
                {headerBriefing}
              </span>
              <button
                type="button"
                onClick={() => setShowInfoTooltip(!showInfoTooltip)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                aria-label="안내 정보"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Tooltip Banner */}
        {showInfoTooltip && (
          <div className="mt-2.5 p-2.5 bg-blue-50/90 border border-blue-200/80 rounded-xl text-blue-900 text-[11px] leading-relaxed animate-fade-in flex items-start space-x-2">
            <Info className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">네이버지도 & TMAP 빅데이터 기반 소요 시간 예측</span>
              <span>수도권 도로망의 시간대별 교통량 통계를 분석하여 출발 시각에 따른 정체 및 도착 예정 시각을 계산합니다.</span>
            </div>
          </div>
        )}

        {/* 2. Large Typography Duration: "1시간 33분 걸려요" (Bold Blue #1E60F3 + Charcoal #1E293B) */}
        <div className="flex flex-col items-center justify-center my-4">
          {isLoading ? (
            <div className="flex items-center space-x-2 py-4">
              <div className="w-5 h-5 border-2 border-[#1E60F3] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-slate-500">AI 시간대별 소요 시간을 계산 중입니다...</span>
            </div>
          ) : (
            <>
              <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight flex items-baseline justify-center">
                <span className="text-[#1E60F3] font-black">{timePart}</span>
                <span className="ml-2 font-bold text-[#1E293B]">{unitPart}</span>
              </h3>

              {/* Compact Pill Button: [시간변경] (Outline pill button) */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onOpenTimePicker();
                }}
                className="mt-3 px-4 py-1.5 rounded-full border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                title="출발 시각 다시 선택"
              >
                <span>시간변경</span>
              </button>
            </>
          )}
        </div>

        {/* 3. Horizontal Progress Bar Rows (Screenshot 2 Match) */}
        {displayRows.length > 0 && (
          <div className="relative my-4 pt-2 pb-3 px-2">
            {/* Timeline Rows Container */}
            <div className="relative flex flex-col space-y-7">
              {displayRows.map((rowItem, idx) => {
                const isSelected = idx === activeSlotIdx;
                const isBaseRow = rowItem.isBase;
                const slotDuration = rowItem.slot.durationMinutes;
                const diffMinutes = slotDuration - baseDuration;

                // Gauge width calculation relative to base knob position (80%)
                // If diff is -7m, width = BASE_KNOB_PERCENT * (slotDuration / baseDuration)
                let gaugePercent = BASE_KNOB_PERCENT;
                if (baseDuration > 0) {
                  gaugePercent = Math.min(
                    95,
                    Math.max(25, BASE_KNOB_PERCENT * (slotDuration / baseDuration))
                  );
                }

                // Color coding for gauge bar & diff text:
                // Fast/saving: #00C853 (Native Vibrant Green)
                // Equal: #1E60F3
                // Slower/delay: Amber / Rose
                let barColor = 'bg-[#00C853]';
                let diffTextColor = 'text-[#00C853]';
                let diffText = '';

                if (diffMinutes < 0) {
                  barColor = 'bg-[#00C853]';
                  diffTextColor = 'text-[#00C853]';
                  diffText = `${diffMinutes}분`;
                } else if (diffMinutes > 0) {
                  barColor = diffMinutes > 5 ? 'bg-rose-500' : 'bg-amber-500';
                  diffTextColor = diffMinutes > 5 ? 'text-rose-600' : 'text-amber-600';
                  diffText = `+${diffMinutes}분`;
                }

                return (
                  <div
                    key={rowItem.slot.offsetMinutes}
                    onClick={() => {
                      haptics.lightTap();
                      setActiveSlotIdx(idx);
                    }}
                    className={`group relative flex items-center cursor-pointer transition-all ${
                      isSelected ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    {/* Left Column: Fixed-width Time Label (오후 3:30, 1시간 후, 2시간 후) */}
                    <div className="w-20 sm:w-24 shrink-0 text-left">
                      <span
                        className={`text-xs sm:text-sm leading-none ${
                          isBaseRow
                            ? 'font-bold text-slate-800'
                            : 'font-semibold text-slate-400'
                        }`}
                      >
                        {rowItem.label}
                      </span>
                    </div>

                    {/* Right Column: Base Rail + Horizontal Gauge Bar + Slider Knob & Diff Label */}
                    <div className="relative flex-1 flex items-center h-5">
                      {/* Subtle Blue Tint Area (Left of knob baseline) */}
                      <div
                        className="absolute left-0 top-[-14px] bottom-[-14px] bg-blue-50/25 pointer-events-none rounded-sm"
                        style={{ width: `${BASE_KNOB_PERCENT}%` }}
                      />

                      {/* Vertical Dashed Guideline from Slider Knob down to bottom */}
                      <div
                        className="absolute top-[-14px] bottom-[-14px] border-l border-dashed border-blue-400/60 pointer-events-none z-10"
                        style={{ left: `${BASE_KNOB_PERCENT}%` }}
                      />

                      {/* Gray Base Rail */}
                      <div className="absolute left-0 right-0 h-1.5 bg-slate-100 rounded-full w-full" />

                      {isBaseRow ? (
                        /* First Row: Interactive Blue Slider Track with Circular Knob */
                        <>
                          <div
                            className="absolute left-0 h-1.5 bg-[#1E60F3] rounded-full z-10 transition-all duration-300"
                            style={{ width: `${BASE_KNOB_PERCENT}%` }}
                          />
                          {/* Circular Slider Knob */}
                          <div
                            className="absolute -translate-x-1/2 w-4 h-4 bg-[#1E60F3] rounded-full ring-4 ring-blue-100 shadow-sm z-20 transition-all duration-300 pointer-events-none"
                            style={{ left: `${BASE_KNOB_PERCENT}%` }}
                          />
                        </>
                      ) : (
                        /* Following Rows: Horizontal Progress Bar + Delta Difference Badge */
                        <>
                          {/* Progress Gauge Bar */}
                          <div
                            className={`absolute left-0 h-1.5 rounded-full z-10 transition-all duration-300 ${barColor}`}
                            style={{ width: `${gaugePercent}%` }}
                          />

                          {/* Relative Difference Text (e.g., -7분, -12분, -17분, -20분) right aligned above bar end */}
                          {diffText && (
                            <div
                              className="absolute -top-4 font-bold text-xs leading-none z-20 pointer-events-none transition-all duration-300"
                              style={{ left: `${Math.max(20, gaugePercent - 6)}%` }}
                            >
                              <span className={diffTextColor}>{diffText}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Bottom Action: Confirm Button */}
        <div className="pt-4 pb-[max(env(safe-area-inset-bottom),8px)]">
          <button
            type="button"
            onClick={handleApply}
            className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-[#1850D0] active:scale-[0.98] text-white rounded-2xl font-bold text-base shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ease-out"
          >
            <Check className="w-5 h-5" />
            <span>확인 (조회 완료)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

