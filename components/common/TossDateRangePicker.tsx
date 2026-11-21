'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import {
  getKstTodayDateStr,
  normalizeDateToIso,
} from '@/utils/dispatchConflictDetector';
import { formatDateRangeDisplay } from '@/components/hq/HqQuickDispatch';

interface TossDateRangePickerProps {
  startDate: string;
  endDate?: string | null;
  onChangeRange: (startIso: string, endIso: string) => void;
  label?: string;
  required?: boolean;
  minDate?: string;
  containerClassName?: string;
  heightClass?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  customTrigger?: (displayLabel: string, isOpen: boolean) => React.ReactNode;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseIso(iso?: string | null) {
  if (!iso) {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
  }
  const clean = normalizeDateToIso(iso) || iso;
  const parts = clean.split('-').map((v) => parseInt(v, 10));
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function formatIso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export const TossDateRangePicker: React.FC<TossDateRangePickerProps> = ({
  startDate,
  endDate,
  onChangeRange,
  label,
  required = false,
  minDate,
  containerClassName = '',
  heightClass = 'h-11 sm:h-12',
  disabled = false,
  align = 'left',
  customTrigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Staged internal range while picking in popover
  const [tempStart, setTempStart] = useState(startDate || getKstTodayDateStr());
  const [tempEnd, setTempEnd] = useState(endDate || startDate || getKstTodayDateStr());
  const [pickStep, setPickStep] = useState<'start' | 'end'>('start');

  const initial = useMemo(() => parseIso(startDate), [startDate]);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  // Sync internal state when external props change or popover opens
  useEffect(() => {
    if (isOpen) {
      const s = startDate || getKstTodayDateStr();
      const e = endDate || s;
      setTempStart(s);
      setTempEnd(e);
      setPickStep('start');
      const parsed = parseIso(s);
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [isOpen, startDate, endDate]);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  const todayIso = useMemo(() => getKstTodayDateStr(), []);

  // Compute calendar grid days
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth - 1, 1).getDay();
    const lastDate = new Date(viewYear, viewMonth, 0).getDate();
    const prevMonthLastDate = new Date(viewYear, viewMonth - 1, 0).getDate();

    const days: Array<{
      day: number;
      monthOffset: number;
      iso: string;
      isCurrentMonth: boolean;
    }> = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDate - i;
      const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
      const prevYear = viewMonth === 1 ? viewYear - 1 : viewYear;
      days.push({
        day: dayNum,
        monthOffset: -1,
        iso: formatIso(prevYear, prevMonth, dayNum),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= lastDate; d++) {
      days.push({
        day: d,
        monthOffset: 0,
        iso: formatIso(viewYear, viewMonth, d),
        isCurrentMonth: true,
      });
    }

    // Next month padding
    const remaining = (7 - (days.length % 7)) % 7;
    for (let n = 1; n <= remaining; n++) {
      const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1;
      const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
      days.push({
        day: n,
        monthOffset: 1,
        iso: formatIso(nextYear, nextMonth, n),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    haptics.lightTap();
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    haptics.lightTap();
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = (clickedIso: string) => {
    haptics.selection();
    if (pickStep === 'start') {
      setTempStart(clickedIso);
      setTempEnd(clickedIso);
      setPickStep('end');
      onChangeRange(clickedIso, clickedIso);
    } else {
      // Step === 'end'
      if (clickedIso < tempStart) {
        setTempStart(clickedIso);
        setTempEnd(clickedIso);
        setPickStep('end');
        onChangeRange(clickedIso, clickedIso);
      } else if (clickedIso === tempStart) {
        onChangeRange(clickedIso, clickedIso);
        setPickStep('start');
        setIsOpen(false);
      } else {
        setTempEnd(clickedIso);
        setPickStep('start');
        onChangeRange(tempStart, clickedIso);
        setIsOpen(false);
      }
    }
  };

  const displayLabel = formatDateRangeDisplay(startDate, endDate);

  return (
    <div className={`relative ${containerClassName}`} ref={containerRef}>
      {customTrigger ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => {
            if (disabled) return;
            haptics.lightTap();
            setIsOpen((prev) => !prev);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!disabled) setIsOpen((prev) => !prev);
            }
          }}
          className={disabled ? 'opacity-60 pointer-events-none' : ''}
        >
          {customTrigger(displayLabel, isOpen)}
        </div>
      ) : (
        <>
          {label && (
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              {label} {required && <span className="text-red-500 font-bold ml-0.5">*</span>}
            </label>
          )}

          {/* Trigger Button */}
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            onClick={() => {
              if (disabled) return;
              haptics.lightTap();
              setIsOpen((prev) => !prev);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!disabled) setIsOpen((prev) => !prev);
              }
            }}
            className={`w-full ${heightClass} bg-white border border-[#E1E7F0]/25 rounded-[16px] px-4 flex items-center gap-2.5 transition-all cursor-pointer shadow-[0_5px_16px_rgba(35,49,78,0.045),0_2px_5px_rgba(35,49,78,0.02)] hover:shadow-[0_6px_18px_rgba(35,49,78,0.065)] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20 select-none ${
              disabled ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-slate-900 truncate flex-1">
              {displayLabel}
            </span>
          </div>
        </>
      )}

      {/* Toss-Style Calendar Popover (Clean White) */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0 left-auto' : 'left-0 right-auto'
          } top-full mt-2 z-50 w-[310px] sm:w-[332px] rounded-[22px] bg-white shadow-[0_16px_46px_rgba(35,49,78,0.13),0_4px_12px_rgba(35,49,78,0.04)] p-4 animate-in fade-in zoom-in-95 duration-150`}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-2">
            <span className="text-[16px] font-bold text-[#17233B] tracking-[-0.02em]">
              {viewYear}년 {viewMonth}월
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="이전 달"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#F7F9FC] text-[#73839D] hover:text-[#17233B] hover:bg-[#EDF1F6] active:scale-[0.98] transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="다음 달"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#F7F9FC] text-[#73839D] hover:text-[#17233B] hover:bg-[#EDF1F6] active:scale-[0.98] transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="닫기"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#F7F9FC] text-[#73839D] hover:text-[#17233B] hover:bg-[#EDF1F6] active:scale-[0.98] transition-all cursor-pointer ml-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Row */}
          <div className="grid grid-cols-7 text-center mb-1">
            {WEEKDAYS.map((wd, idx) => (
              <div
                key={wd}
                className={`text-[11px] font-bold py-1 ${
                  idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-slate-400'
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {calendarDays.map((item) => {
              const isStart = item.iso === tempStart;
              const isEnd = item.iso === tempEnd;
              const isInRange = tempStart && tempEnd && item.iso > tempStart && item.iso < tempEnd;
              const isToday = item.iso === todayIso;
              const isDisabled = minDate && item.iso < minDate;

              return (
                <div
                  key={item.iso}
                  className={`flex items-center justify-center p-0.5 relative ${
                    isInRange ? 'bg-[#EEF3FF]/60' : ''
                  } ${isStart && tempEnd > tempStart ? 'rounded-l-2xl bg-[#EEF3FF]/50' : ''} ${
                    isEnd && tempEnd > tempStart ? 'rounded-r-2xl bg-[#EEF3FF]/50' : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={Boolean(isDisabled)}
                    onClick={() => handleDayClick(item.iso)}
                    className={`w-9 h-9 rounded-2xl flex flex-col items-center justify-center text-xs transition-all cursor-pointer relative ${
                      isStart || isEnd
                        ? 'bg-[#1E60F3] text-white font-semibold shadow-[0_4px_12px_rgba(30,96,243,0.13)] z-10'
                        : isInRange
                        ? 'bg-[#EEF3FF] text-[#1E60F3] font-semibold'
                        : isToday
                        ? 'bg-[#F7F9FC] text-[#1E60F3] font-semibold'
                        : item.isCurrentMonth
                        ? 'text-slate-800 font-semibold hover:bg-slate-100 hover:text-[#1E60F3]'
                        : 'text-slate-300 font-normal hover:bg-slate-100/50'
                    } ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}
                  >
                    <span>{item.day}</span>
                    {isToday && !isStart && !isEnd && (
                      <span className="w-1 h-1 rounded-full bg-[#1E60F3] absolute bottom-1" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

