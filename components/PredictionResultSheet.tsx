'use client';

import React, { useState, useEffect } from 'react';
import { X, Sparkles, Info, Check, Clock } from 'lucide-react';
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
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(2); // Default to offset 0 index
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

  // 2. Sync active slot when prediction updates
  useEffect(() => {
    if (prediction?.timeline && prediction.timeline.length > 0) {
      const zeroIdx = prediction.timeline.findIndex((t) => t.offsetMinutes === 0);
      setActiveSlotIdx(zeroIdx >= 0 ? zeroIdx : 0);
    }
  }, [prediction]);

  if (!isOpen) return null;

  const timeline = prediction?.timeline || [];
  const currentSlot: PredictionTimelineItem | undefined = timeline[activeSlotIdx];

  const currentDuration = currentSlot
    ? currentSlot.durationMinutes
    : prediction?.predictedDurationMinutes || 45;

  const currentOffsetMs = (currentSlot ? currentSlot.offsetMinutes : 0) * 60 * 1000;
  const effectiveDepartureDate = new Date(selectedDate.getTime() + currentOffsetMs);
  const effectiveArrivalDate = new Date(
    effectiveDepartureDate.getTime() + currentDuration * 60 * 1000
  );
  const arrivalFormatted = formatEtaTime(effectiveArrivalDate);

  // 1. Detailed Header Briefing: "9월 25일 금요일 오후 3시 30분 출발하면 ⓘ"
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

  // Safe percentage for slider track & handle knob
  const safeTotalSlots = Math.max(1, timeline.length - 1);
  const sliderPercentage = Math.min(100, Math.max(0, (activeSlotIdx / safeTotalSlots) * 100));

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

        {/* 1. Header: Circular AI Gradient Badge + Detailed Date/Weekday Briefing + Info + Close */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center space-x-2">
            {/* Gradient Circular AI Badge */}
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#1E60F3] via-indigo-600 to-purple-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-3.5 h-3.5 fill-white" />
            </div>

            {/* Detailed Briefing Text: e.g. "9월 25일 금요일 오후 3시 30분 출발하면" */}
            <div className="flex items-center space-x-1">
              <span className="text-xs font-bold text-slate-800 tracking-tight">
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
            <Sparkles className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">네이버지도 & TMAP 빅데이터 기반 소요 시간 예측</span>
              <span>수도권 도로망의 시간대별 교통량 통계를 분석하여 출발 시각에 따른 정체 및 도착 예정 시각을 계산합니다.</span>
            </div>
          </div>
        )}

        {/* 2. Large Typography Duration: "1시간 33분 걸려요" / "40분 걸려요" */}
        <div className="flex flex-col items-center justify-center my-5">
          {isLoading ? (
            <div className="flex items-center space-x-2 py-4">
              <div className="w-5 h-5 border-2 border-[#1E60F3] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-slate-500">AI 시간대별 소요 시간을 계산 중입니다...</span>
            </div>
          ) : (
            <>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight flex items-baseline justify-center">
                <span className="text-[#1E60F3] font-black">{timePart}</span>
                <span className="ml-1.5 font-bold">{unitPart}</span>
              </h3>

              {/* Compact Pill Button: [시간변경] */}
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

        {/* 3. Congestion Timeline Slider Track & Comparative Bar Graph */}
        {timeline.length > 0 && (
          <div className="my-2 p-4 bg-slate-50/80 border border-slate-100 rounded-2xl">
            {/* Blue Slider Track with Circular Handle Knob */}
            <div className="relative w-full h-1.5 bg-slate-200 rounded-full my-3">
              {/* Active Blue Bar */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-[#1E60F3] rounded-full transition-all duration-200"
                style={{ width: `${sliderPercentage}%` }}
              />
              {/* Circular Knob: w-4 h-4 bg-white border-4 border-[#1E60F3] */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white border-4 border-[#1E60F3] rounded-full shadow-sm transition-all duration-200 pointer-events-none"
                style={{ left: `${sliderPercentage}%` }}
              />
            </div>

            {/* Relative Diff Badges & Bars Container */}
            <div className="grid grid-cols-7 gap-1.5 items-end pt-3 pb-1">
              {timeline.slice(1, 8).map((slot, idx) => {
                const actualIdx = idx + 1;
                const isSelected = actualIdx === activeSlotIdx;
                const diff = slot.diffMinutes;

                // Color coding for relative time variation badges & bars:
                // 단축 구간: 산뜻한 에메랄드 그린 컬러 막대 (bg-emerald-500) 및 -X분 텍스트
                // 정체 구간: 주황 / 레드 컬러 막대 및 +X분 텍스트
                let badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                let barColor = 'bg-slate-300';
                let diffText = '동일';

                if (diff < 0) {
                  badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold';
                  barColor = 'bg-emerald-500';
                  diffText = `${diff}분`;
                } else if (diff > 0 && diff <= 3) {
                  badgeClass = 'bg-orange-50 text-orange-700 border-orange-300 font-bold';
                  barColor = 'bg-orange-400';
                  diffText = `+${diff}분`;
                } else if (diff > 3) {
                  badgeClass = 'bg-rose-50 text-rose-700 border-rose-300 font-black';
                  barColor = 'bg-rose-500';
                  diffText = `+${diff}분`;
                }

                // Proportional bar height (base 30px up to 64px)
                const baseHeight = 32;
                const dynamicHeight = Math.min(64, Math.max(22, baseHeight + diff * 3));

                return (
                  <button
                    key={slot.timeFormatted + idx}
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setActiveSlotIdx(actualIdx);
                    }}
                    className={`flex flex-col items-center justify-end rounded-xl p-1 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/90 ring-2 ring-[#1E60F3]/60 scale-105'
                        : 'hover:bg-slate-100/80'
                    }`}
                  >
                    {/* Relative Diff Badge */}
                    <span
                      className={`text-[10px] px-1 py-0.5 rounded-md border leading-none mb-1.5 whitespace-nowrap ${badgeClass}`}
                    >
                      {diffText}
                    </span>

                    {/* Proportional Bar */}
                    <div
                      style={{ height: `${dynamicHeight}px` }}
                      className={`w-4.5 rounded-t-md transition-all ${
                        isSelected ? 'bg-[#1E60F3] shadow-xs' : barColor
                      }`}
                    />

                    {/* Time Label */}
                    <span
                      className={`text-[10px] mt-1.5 tracking-tighter leading-none ${
                        isSelected ? 'text-[#1E60F3] font-bold' : 'text-slate-500 font-medium'
                      }`}
                    >
                      {slot.timeFormatted}
                    </span>

                    {/* Secondary 1시간 후 / 2시간 후 Label */}
                    {slot.label && (
                      <span className="text-[9px] text-slate-400 font-bold mt-0.5 leading-none scale-90 truncate">
                        {slot.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Bottom Action: Close Lookup Sheet */}
        <div className="pt-3 pb-[max(env(safe-area-inset-bottom),8px)]">
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
