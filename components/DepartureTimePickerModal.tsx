'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface DepartureTimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  initialDate?: Date;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ITEM_HEIGHT = 48; // 48px fixed row height (h-12)

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

const PERIODS: Array<'오전' | '오후'> = ['오전', '오후'];
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 10, 20, 30, 40, 50];

// Calculate nearest future 10-minute slot (current time rounded UP to next 10m)
function getMinAllowedDate(base: Date = new Date()): Date {
  const min = new Date(base);
  const minutes = min.getMinutes();
  const remainder = minutes % 10;
  const addMin = remainder === 0 ? 0 : 10 - remainder;
  min.setMinutes(minutes + addMin, 0, 0);
  return min;
}

function constructDate(
  offsetDays: number,
  period: '오전' | '오후',
  hour12: number,
  minute: number,
  baseNow: Date = new Date()
): Date {
  const d = new Date(baseNow);
  d.setDate(d.getDate() + offsetDays);
  let h24 = hour12 % 12;
  if (period === '오후') {
    h24 += 12;
  }
  d.setHours(h24, minute, 0, 0);
  return d;
}

export const DepartureTimePickerModal: React.FC<DepartureTimePickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialDate,
}) => {
  const datesList = useRef(generateDates()).current;

  // Refs for 4 columns
  const dateColRef = useRef<HTMLDivElement>(null);
  const periodColRef = useRef<HTMLDivElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minuteColRef = useRef<HTMLDivElement>(null);

  // States
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'오전' | '오후'>('오후');
  const [selectedHour, setSelectedHour] = useState(3);
  const [selectedMinute, setSelectedMinute] = useState(10);
  const [isShaking, setIsShaking] = useState(false);

  // Track previous hour to detect 11 <-> 12 rollover
  const prevHourRef = useRef<number>(selectedHour);
  const isProgrammaticScroll = useRef(false);

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

  // Helper to scroll column to index
  const scrollColumnToIndex = useCallback((
    el: HTMLDivElement | null,
    idx: number,
    behavior: ScrollBehavior = 'smooth'
  ) => {
    if (!el) return;
    isProgrammaticScroll.current = true;
    el.scrollTo({
      top: idx * ITEM_HEIGHT,
      behavior,
    });
    setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 200);
  }, []);

  // Elastic Rubber-band Snapback with Cross-Platform Haptics & Vibration
  const triggerRubberBandSnapback = useCallback(() => {
    // 1. Android vibration feedback: [20, 30, 20]
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([20, 30, 20]);
      }
    } catch {
      // Ignore vibration error
    }
    // 2. Cross-platform haptic audio/sensory feedback
    haptics.warningPulse();

    // 3. Visual micro-shake / bounce animation
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
    }, 400);

    // 4. Elastic snapback to minAllowedDate
    const minValid = getMinAllowedDate();
    const h24 = minValid.getHours();
    const period: '오전' | '오후' = h24 >= 12 ? '오후' : '오전';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const minute = minValid.getMinutes();

    setSelectedDateIdx(0);
    setSelectedPeriod(period);
    setSelectedHour(h12);
    setSelectedMinute(minute);
    prevHourRef.current = h12;

    scrollColumnToIndex(dateColRef.current, 0, 'smooth');
    scrollColumnToIndex(periodColRef.current, PERIODS.indexOf(period), 'smooth');
    scrollColumnToIndex(hourColRef.current, HOURS.indexOf(h12), 'smooth');
    scrollColumnToIndex(minuteColRef.current, MINUTES.indexOf(minute), 'smooth');
  }, [scrollColumnToIndex]);

  // 2. Initialize from initialDate or minAllowedDate on open
  useEffect(() => {
    if (!isOpen) return;

    const minValid = getMinAllowedDate();
    let base = initialDate || minValid;
    if (base.getTime() < minValid.getTime()) {
      base = minValid;
    }

    const h24 = base.getHours();
    const m = base.getMinutes();
    const roundedM = Math.min(50, Math.round(m / 10) * 10);
    const period: '오전' | '오후' = h24 >= 12 ? '오후' : '오전';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;

    setSelectedDateIdx(0);
    setSelectedPeriod(period);
    setSelectedHour(h12);
    setSelectedMinute(roundedM);
    prevHourRef.current = h12;

    // Center all columns with initial scroll
    const timer = setTimeout(() => {
      scrollColumnToIndex(dateColRef.current, 0, 'auto');
      scrollColumnToIndex(periodColRef.current, PERIODS.indexOf(period), 'auto');
      scrollColumnToIndex(hourColRef.current, HOURS.indexOf(h12), 'auto');
      scrollColumnToIndex(minuteColRef.current, MINUTES.indexOf(roundedM), 'auto');
    }, 40);

    return () => clearTimeout(timer);
  }, [isOpen, initialDate, scrollColumnToIndex]);

  if (!isOpen) return null;

  // Check if a specific slot is in the past
  const now = new Date();
  const minAllowed = getMinAllowedDate(now);
  const isToday = selectedDateIdx === 0;

  // Period disabled check (is entire morning in the past?)
  const isPeriodDisabled = (p: '오전' | '오후') => {
    if (!isToday) return false;
    // Morning is disabled if latest morning time (11:50) is before minAllowed
    if (p === '오전') {
      const maxMorning = constructDate(0, '오전', 11, 50, now);
      return maxMorning.getTime() < minAllowed.getTime();
    }
    return false;
  };

  // Hour disabled check
  const isHourDisabled = (hour: number) => {
    if (!isToday) return false;
    const maxHourTime = constructDate(0, selectedPeriod, hour, 50, now);
    return maxHourTime.getTime() < minAllowed.getTime();
  };

  // Minute disabled check
  const isMinuteDisabled = (minute: number) => {
    if (!isToday) return false;
    const itemTime = constructDate(0, selectedPeriod, selectedHour, minute, now);
    return itemTime.getTime() < minAllowed.getTime();
  };

  // 3. Hour Selection / Rollover Sync Handler
  const handleSelectHour = (newHour: number) => {
    const prevHour = prevHourRef.current;
    let nextPeriod = selectedPeriod;
    let nextDateIdx = selectedDateIdx;

    // Rollover 11 -> 12 (Forward)
    if (prevHour === 11 && newHour === 12) {
      if (selectedPeriod === '오전') {
        nextPeriod = '오후';
        setSelectedPeriod('오후');
        scrollColumnToIndex(periodColRef.current, 1, 'smooth');
      } else {
        // 오후 11시 -> 12시는 자정(다음날 오전 12시)
        nextPeriod = '오전';
        nextDateIdx = Math.min(datesList.length - 1, selectedDateIdx + 1);
        setSelectedPeriod('오전');
        setSelectedDateIdx(nextDateIdx);
        scrollColumnToIndex(periodColRef.current, 0, 'smooth');
        scrollColumnToIndex(dateColRef.current, nextDateIdx, 'smooth');
      }
    }
    // Rollover 12 -> 11 (Backward)
    else if (prevHour === 12 && newHour === 11) {
      if (selectedPeriod === '오후') {
        nextPeriod = '오전';
        setSelectedPeriod('오전');
        scrollColumnToIndex(periodColRef.current, 0, 'smooth');
      } else if (selectedDateIdx > 0) {
        // 오전 12시 -> 11시 뒤로는 전날 오후 11시
        nextPeriod = '오후';
        nextDateIdx = Math.max(0, selectedDateIdx - 1);
        setSelectedPeriod('오후');
        setSelectedDateIdx(nextDateIdx);
        scrollColumnToIndex(periodColRef.current, 1, 'smooth');
        scrollColumnToIndex(dateColRef.current, nextDateIdx, 'smooth');
      }
    }

    prevHourRef.current = newHour;
    setSelectedHour(newHour);
    scrollColumnToIndex(hourColRef.current, HOURS.indexOf(newHour), 'smooth');

    // Check if new time falls in past
    const projected = constructDate(nextDateIdx, nextPeriod, newHour, selectedMinute, now);
    if (projected.getTime() < minAllowed.getTime()) {
      triggerRubberBandSnapback();
    } else {
      haptics.lightTap();
    }
  };

  const handleSelectMinute = (minute: number) => {
    const projected = constructDate(selectedDateIdx, selectedPeriod, selectedHour, minute, now);
    if (projected.getTime() < minAllowed.getTime()) {
      triggerRubberBandSnapback();
      return;
    }
    haptics.lightTap();
    setSelectedMinute(minute);
    scrollColumnToIndex(minuteColRef.current, MINUTES.indexOf(minute), 'smooth');
  };

  const handleSelectPeriod = (period: '오전' | '오후') => {
    if (isPeriodDisabled(period)) {
      triggerRubberBandSnapback();
      return;
    }
    const projected = constructDate(selectedDateIdx, period, selectedHour, selectedMinute, now);
    if (projected.getTime() < minAllowed.getTime()) {
      triggerRubberBandSnapback();
      return;
    }
    haptics.lightTap();
    setSelectedPeriod(period);
    scrollColumnToIndex(periodColRef.current, PERIODS.indexOf(period), 'smooth');
  };

  const handleSelectDate = (idx: number) => {
    haptics.lightTap();
    setSelectedDateIdx(idx);
    scrollColumnToIndex(dateColRef.current, idx, 'smooth');

    // Check if switching to '오늘' creates an invalid past time
    if (idx === 0) {
      const projected = constructDate(0, selectedPeriod, selectedHour, selectedMinute, now);
      if (projected.getTime() < minAllowed.getTime()) {
        triggerRubberBandSnapback();
      }
    }
  };

  // Scroll listeners with snap checking
  const handleScrollEnd = (
    el: HTMLDivElement | null,
    itemCount: number,
    onIndexSelect: (idx: number) => void
  ) => {
    if (!el || isProgrammaticScroll.current) return;
    const scrollTop = el.scrollTop;
    const idx = Math.round(scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(itemCount - 1, idx));
    onIndexSelect(clamped);
  };

  // Bottom action: Confirm button
  const handleConfirm = () => {
    const target = constructDate(
      datesList[selectedDateIdx].offsetDays,
      selectedPeriod,
      selectedHour,
      selectedMinute,
      new Date()
    );

    if (target.getTime() < minAllowed.getTime()) {
      triggerRubberBandSnapback();
      return;
    }

    haptics.successPulse();
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

        {/* 4-Column Wheel Picker with Exact Horizontal Baseline Alignment & Rubber-Band Bounce */}
        <div
          className={`relative my-6 px-1 h-[240px] flex items-center justify-center overflow-hidden transition-transform duration-200 ${
            isShaking ? 'translate-y-1.5' : ''
          }`}
        >
          {/* Subtle Rounded Highlight Box across all 4 columns: exactly h-12 (48px) at top-[96px] */}
          <div className="absolute left-1 right-1 top-[96px] h-[48px] bg-slate-100/90 rounded-2xl pointer-events-none z-0 border border-slate-200/60 shadow-inner" />

          {/* Top Gradient Fade Mask */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white via-white/80 to-transparent pointer-events-none z-20" />

          {/* Bottom Gradient Fade Mask */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-20" />

          {/* 4 Columns Container */}
          <div className="grid grid-cols-4 gap-1 w-full h-[240px] relative z-10">
            {/* Column 1: Date with Day of Week (오늘, 내일, 9월 22일 화 등) */}
            <div
              ref={dateColRef}
              onScroll={() =>
                handleScrollEnd(dateColRef.current, datesList.length, (idx) => {
                  if (idx !== selectedDateIdx) handleSelectDate(idx);
                })
              }
              className="h-[240px] flex flex-col items-center overflow-y-auto scrollbar-none snap-y snap-mandatory pt-[96px] pb-[96px]"
              style={{ overscrollBehavior: 'contain' }}
            >
              {datesList.map((item, idx) => {
                const isSelected = idx === selectedDateIdx;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleSelectDate(idx)}
                    className={`h-[48px] w-full flex items-center justify-center snap-center shrink-0 transition-all cursor-pointer ${
                      isSelected
                        ? 'text-slate-900 font-bold text-base sm:text-lg'
                        : 'text-slate-400 hover:text-slate-600 font-medium text-xs sm:text-sm'
                    }`}
                  >
                    <span className="truncate px-0.5 leading-none select-none">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Column 2: AM / PM (오전, 오후) */}
            <div
              ref={periodColRef}
              onScroll={() =>
                handleScrollEnd(periodColRef.current, PERIODS.length, (idx) => {
                  const p = PERIODS[idx];
                  if (p !== selectedPeriod) handleSelectPeriod(p);
                })
              }
              className="h-[240px] flex flex-col items-center overflow-y-auto scrollbar-none snap-y snap-mandatory pt-[96px] pb-[96px]"
              style={{ overscrollBehavior: 'contain' }}
            >
              {PERIODS.map((period) => {
                const isSelected = period === selectedPeriod;
                const disabled = isPeriodDisabled(period);
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => handleSelectPeriod(period)}
                    disabled={disabled}
                    className={`h-[48px] w-full flex items-center justify-center snap-center shrink-0 transition-all ${
                      disabled
                        ? 'text-slate-300 opacity-20 pointer-events-none cursor-not-allowed font-normal text-xs sm:text-sm'
                        : isSelected
                        ? 'text-slate-900 font-bold text-base sm:text-lg cursor-pointer'
                        : 'text-slate-400 hover:text-slate-600 font-medium text-xs sm:text-sm cursor-pointer'
                    }`}
                  >
                    <span className="leading-none select-none">{period}</span>
                  </button>
                );
              })}
            </div>

            {/* Column 3: Hours (1 ~ 12) with Smart Rollover */}
            <div
              ref={hourColRef}
              onScroll={() =>
                handleScrollEnd(hourColRef.current, HOURS.length, (idx) => {
                  const h = HOURS[idx];
                  if (h !== selectedHour) handleSelectHour(h);
                })
              }
              className="h-[240px] flex flex-col items-center overflow-y-auto scrollbar-none snap-y snap-mandatory pt-[96px] pb-[96px]"
              style={{ overscrollBehavior: 'contain' }}
            >
              {HOURS.map((hour) => {
                const isSelected = hour === selectedHour;
                const disabled = isHourDisabled(hour);
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => handleSelectHour(hour)}
                    disabled={disabled}
                    className={`h-[48px] w-full flex items-center justify-center snap-center shrink-0 transition-all ${
                      disabled
                        ? 'text-slate-300 opacity-20 pointer-events-none cursor-not-allowed font-normal text-xs sm:text-sm'
                        : isSelected
                        ? 'text-slate-900 font-bold text-base sm:text-lg cursor-pointer'
                        : 'text-slate-400 hover:text-slate-600 font-medium text-xs sm:text-sm cursor-pointer'
                    }`}
                  >
                    <span className="leading-none select-none">{hour}시</span>
                  </button>
                );
              })}
            </div>

            {/* Column 4: Minutes in 10s (00 ~ 50) */}
            <div
              ref={minuteColRef}
              onScroll={() =>
                handleScrollEnd(minuteColRef.current, MINUTES.length, (idx) => {
                  const m = MINUTES[idx];
                  if (m !== selectedMinute) handleSelectMinute(m);
                })
              }
              className="h-[240px] flex flex-col items-center overflow-y-auto scrollbar-none snap-y snap-mandatory pt-[96px] pb-[96px]"
              style={{ overscrollBehavior: 'contain' }}
            >
              {MINUTES.map((minute) => {
                const isSelected = minute === selectedMinute;
                const disabled = isMinuteDisabled(minute);
                return (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => handleSelectMinute(minute)}
                    disabled={disabled}
                    className={`h-[48px] w-full flex items-center justify-center snap-center shrink-0 transition-all ${
                      disabled
                        ? 'text-slate-300 opacity-20 pointer-events-none cursor-not-allowed font-normal text-xs sm:text-sm'
                        : isSelected
                        ? 'text-slate-900 font-bold text-base sm:text-lg cursor-pointer'
                        : 'text-slate-400 hover:text-slate-600 font-medium text-xs sm:text-sm cursor-pointer'
                    }`}
                  >
                    <span className="leading-none select-none">{String(minute).padStart(2, '0')}분</span>
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
