'use client';

import React, { useState, useEffect } from 'react';
import { X, Sparkles, ChevronRight, Info, Check, Clock } from 'lucide-react';
import { PredictionResult, PredictionTimelineItem } from '@/app/api/route/prediction/route';
import { haptics } from '@/utils/haptics';
import { formatEtaTime } from '@/utils/navigation';

interface PredictionResultSheetProps {
  isOpen: boolean;
  onClose: () => void;
  prediction: PredictionResult | null;
  isLoading: boolean;
  onOpenTimePicker: () => void;
  onApplyPrediction: (selectedDate: Date, durationMinutes: number, arrivalFormatted: string) => void;
  selectedDate: Date;
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
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(2); // Default to index 2 (offset 0)
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);

  // Sync active slot when prediction updates
  useEffect(() => {
    if (prediction?.timeline) {
      const zeroIdx = prediction.timeline.findIndex((t) => t.offsetMinutes === 0);
      setActiveSlotIdx(zeroIdx >= 0 ? zeroIdx : 0);
    }
  }, [prediction]);

  if (!isOpen) return null;

  // Active slot calculation
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
  const departureFormatted = formatEtaTime(effectiveDepartureDate);

  // Format header text: "오늘 오후 3시 10분 출발하면 ⓘ"
  const h24 = effectiveDepartureDate.getHours();
  const period = h24 >= 12 ? '오후' : '오전';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const m = effectiveDepartureDate.getMinutes();

  // Date relative label
  const today = new Date();
  const diffDays = effectiveDepartureDate.getDate() - today.getDate();
  let dateText = '오늘';
  if (diffDays === 1) dateText = '내일';
  else if (diffDays === 2) dateText = '모레';
  else if (diffDays > 2) dateText = `${effectiveDepartureDate.getMonth() + 1}월 ${effectiveDepartureDate.getDate()}일`;

  const headerTitle = `${dateText} ${period} ${h12}시 ${String(m).padStart(2, '0')}분 출발하면`;

  const handleApply = () => {
    haptics.successPulse();
    onApplyPrediction(effectiveDepartureDate, currentDuration, arrivalFormatted);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center select-none animate-fade-in">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Bottom Sheet Container */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl p-5 z-10 animate-in slide-in-from-bottom-5 duration-250 border border-slate-100 flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Top Drag Indicator Pill */}
        <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-3" />

        {/* 1. Header: Circular AI Gradient Badge + Title + Info Icon + Close Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Gradient Circular AI Badge */}
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#1E60F3] via-indigo-600 to-purple-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-3.5 h-3.5 fill-white" />
            </div>

            {/* Briefing Text */}
            <div className="flex items-center space-x-1">
              <span className="text-xs font-bold text-slate-800 tracking-tight">
                {headerTitle}
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
              <span className="font-bold block">AI 미래 소요 시간 예측 안내</span>
              <span>TMAP 타임머신 및 수도권 도로망 시간대별 교통 빅데이터를 분석하여 예상 이동 시간을 계산합니다.</span>
            </div>
          </div>
        )}

        {/* 2. Large Typography Duration: "{소요시간}분 걸려요" */}
        <div className="mt-4 mb-3">
          {isLoading ? (
            <div className="flex items-center space-x-2 py-3">
              <div className="w-5 h-5 border-2 border-[#1E60F3] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-bold text-slate-500">AI 시간대별 소요 시간을 계산 중입니다...</span>
            </div>
          ) : (
            <>
              <div className="flex items-baseline">
                <span className="text-4xl sm:text-5xl font-black text-[#1E60F3] tracking-tight">
                  {currentDuration}
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 ml-1.5 tracking-tight">
                  분 걸려요
                </span>
              </div>

              {/* Subtitle: Estimated arrival & distance */}
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-normal">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  도착 예정: <strong className="text-slate-800 font-bold">{arrivalFormatted}</strong>
                </span>
                <span>•</span>
                <span>{prediction?.predictedDistanceKm || 50}km</span>
                <span>•</span>
                <span className="text-slate-600">{prediction?.trafficSummary || '교통 통계 반영'}</span>
              </div>

              {/* Compact Pill Button: [시간변경 >] */}
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    onOpenTimePicker();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-2xs border border-slate-200/60"
                  title="출발 시각 다시 선택"
                >
                  <span>시간변경</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* 3. Congestion Timeline Slider & Comparative Bar Graph */}
        {timeline.length > 0 && (
          <div className="my-3 p-3.5 bg-slate-50/80 border border-slate-100 rounded-2xl">
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="font-bold text-slate-800">출발 시간대별 예상 소요 시간</span>
              <span className="text-[11px] text-slate-400">막대를 눌러 시간 변경 가능</span>
            </div>

            {/* Relative Diff Badges & Bars Container */}
            <div className="grid grid-cols-7 gap-1.5 items-end pt-3 pb-1">
              {timeline.slice(1, 8).map((slot, idx) => {
                const actualIdx = idx + 1;
                const isSelected = actualIdx === activeSlotIdx;
                const diff = slot.diffMinutes;

                // Color coding for relative time variation badges
                let badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                let barColor = 'bg-slate-300';
                let diffText = '동일';

                if (diff < 0) {
                  badgeClass = 'bg-amber-100/90 text-amber-800 border-amber-200 font-bold';
                  barColor = 'bg-amber-400';
                  diffText = `${diff}분`;
                } else if (diff > 0 && diff <= 3) {
                  badgeClass = 'bg-orange-100/90 text-orange-800 border-orange-200 font-bold';
                  barColor = 'bg-orange-400';
                  diffText = `+${diff}분`;
                } else if (diff > 3) {
                  badgeClass = 'bg-rose-100 text-rose-800 border-rose-200 font-black';
                  barColor = 'bg-rose-500';
                  diffText = `+${diff}분`;
                }

                // Relative bar height (base 30px up to 60px)
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

                    {/* Timeline Label or Time */}
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

        {/* 4. Bottom Action: Confirm and Sync to Protocol Report */}
        <div className="pt-2 pb-[max(env(safe-area-inset-bottom),8px)]">
          <button
            type="button"
            onClick={handleApply}
            className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-[#1346D8] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.98] active:bg-[#0f3bb8] text-white rounded-2xl font-bold text-sm tracking-tight shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ease-out"
          >
            <Check className="w-4.5 h-4.5" />
            <span>이 시간으로 설정 및 단톡방 보고 반영</span>
          </button>
        </div>
      </div>
    </div>
  );
};
