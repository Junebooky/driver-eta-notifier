'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface DepartureTimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  initialDate?: Date;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function generateDates() {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dayOfWeek = WEEKDAYS[d.getDay()];

    let label = `${month}월 ${day}일 ${dayOfWeek}`;
    if (i === 0) label = '오늘';
    else if (i === 1) label = '내일';

    dates.push({ label, offsetDays: i, month, day, dayOfWeek });
  }
  return dates;
}

const PERIODS = ['오전', '오후'];
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 10, 20, 30, 40, 50];

export const DepartureTimePickerModal: React.FC<DepartureTimePickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialDate,
}) => {
  const datesList = useRef(generateDates()).current;

  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'오전' | '오후'>('오후');
  const [selectedHour, setSelectedHour] = useState(3);
  const [selectedMinute, setSelectedMinute] = useState(10);

  // 1. Body Scroll Lock when modal is open
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

  // 2. Initialize from initialDate on open
  useEffect(() => {
    if (!isOpen) return;

    const base = initialDate || new Date();
    const h24 = base.getHours();
    const m = base.getMinutes();

    // Round to nearest 10-min slot
    const roundedM = Math.min(50, Math.round(m / 10) * 10);
    const period = h24 >= 12 ? '오후' : '오전';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;

    setSelectedDateIdx(0);
    setSelectedPeriod(period);
    setSelectedHour(h12);
    setSelectedMinute(roundedM);
  }, [isOpen, initialDate]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    haptics.successPulse();

    const target = new Date();
    target.setDate(target.getDate() + datesList[selectedDateIdx].offsetDays);

    let h24 = selectedHour % 12;
    if (selectedPeriod === '오후') {
      h24 += 12;
    }

    target.setHours(h24);
    target.setMinutes(selectedMinute);
    target.setSeconds(0);
    target.setMilliseconds(0);

    onConfirm(target);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center select-none animate-fade-in">
      {/* Dimmed backdrop with click-to-dismiss */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          haptics.lightTap();
          onClose();
        }}
      />

      {/* Modal Container */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 z-10 animate-in slide-in-from-bottom-5 duration-200 border border-slate-100 flex flex-col">
        {/* Header: Centered Bold Title + Close Button */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="w-8" />
          <h2 className="text-base font-black text-slate-900 tracking-tight">출발 시간</h2>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* 4-Column Wheel Picker with Center Highlight Row & Gradient Fades */}
        <div className="relative my-6 px-1 h-56 flex items-center justify-center overflow-hidden">
          {/* Subtle Rounded Highlight Box across all 4 columns (h-12) */}
          <div className="absolute left-1 right-1 top-1/2 -translate-y-1/2 h-12 bg-slate-100/90 rounded-2xl pointer-events-none z-0 border border-slate-200/60 shadow-inner" />

          {/* Top Gradient Fade Mask */}
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-white via-white/80 to-transparent pointer-events-none z-20" />

          {/* Bottom Gradient Fade Mask */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-20" />

          {/* 4 Columns Container */}
          <div className="grid grid-cols-4 gap-1 w-full h-full relative z-10">
            {/* Column 1: Date with Day of Week (오늘, 내일, 9월 22일 화 등) */}
            <div
              className="flex flex-col items-center overflow-y-auto scrollbar-none py-20"
              style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}
            >
              {datesList.map((item, idx) => {
                const isSelected = idx === selectedDateIdx;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setSelectedDateIdx(idx);
                    }}
                    className={`h-12 w-full flex items-center justify-center rounded-xl transition-all cursor-pointer snap-center shrink-0 ${
                      isSelected
                        ? 'text-slate-900 font-bold text-lg sm:text-xl scale-105'
                        : 'text-slate-400 hover:text-slate-600 font-medium text-sm sm:text-base'
                    }`}
                  >
                    <span className="truncate px-0.5">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Column 2: AM / PM (오전, 오후) */}
            <div
              className="flex flex-col items-center overflow-y-auto scrollbar-none py-20"
              style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}
            >
              {PERIODS.map((period) => {
                const isSelected = period === selectedPeriod;
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setSelectedPeriod(period as '오전' | '오후');
                    }}
                    className={`h-12 w-full flex items-center justify-center rounded-xl transition-all cursor-pointer snap-center shrink-0 ${
                      isSelected
                        ? 'text-slate-900 font-bold text-lg sm:text-xl scale-105'
                        : 'text-slate-400 hover:text-slate-600 font-medium text-sm sm:text-base'
                    }`}
                  >
                    {period}
                  </button>
                );
              })}
            </div>

            {/* Column 3: Hours (1 ~ 12) */}
            <div
              className="flex flex-col items-center overflow-y-auto scrollbar-none py-20"
              style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}
            >
              {HOURS.map((hour) => {
                const isSelected = hour === selectedHour;
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setSelectedHour(hour);
                    }}
                    className={`h-12 w-full flex items-center justify-center rounded-xl transition-all cursor-pointer snap-center shrink-0 ${
                      isSelected
                        ? 'text-slate-900 font-bold text-lg sm:text-xl scale-105'
                        : 'text-slate-400 hover:text-slate-600 font-medium text-sm sm:text-base'
                    }`}
                  >
                    {hour}시
                  </button>
                );
              })}
            </div>

            {/* Column 4: Minutes in 10s (00 ~ 50) */}
            <div
              className="flex flex-col items-center overflow-y-auto scrollbar-none py-20"
              style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}
            >
              {MINUTES.map((minute) => {
                const isSelected = minute === selectedMinute;
                return (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setSelectedMinute(minute);
                    }}
                    className={`h-12 w-full flex items-center justify-center rounded-xl transition-all cursor-pointer snap-center shrink-0 ${
                      isSelected
                        ? 'text-slate-900 font-bold text-lg sm:text-xl scale-105'
                        : 'text-slate-400 hover:text-slate-600 font-medium text-sm sm:text-base'
                    }`}
                  >
                    {String(minute).padStart(2, '0')}분
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Action: Full-width Vivid Blue Confirm Button */}
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-[#1850D0] active:scale-[0.98] text-white rounded-2xl font-bold text-base shadow-sm flex items-center justify-center cursor-pointer transition-all duration-150 ease-out"
        >
          확인
        </button>
      </div>
    </div>
  );
};
