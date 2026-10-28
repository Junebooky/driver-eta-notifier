'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { getKstTodayDateStr, getKstTomorrowDateStr } from '@/utils/dispatchConflictDetector';

interface TossDatePickerProps {
  value: string; // ISO date format 'YYYY-MM-DD'
  onChange: (dateIso: string) => void;
  label?: string;
  required?: boolean;
  minDate?: string;
  maxDate?: string;
  containerClassName?: string;
  heightClass?: string;
  disabled?: boolean;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseIsoYearMonthDay(iso?: string) {
  if (!iso) {
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
  }
  const parts = iso.split('-').map((v) => parseInt(v, 10));
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

function formatKoreanDisplay(iso: string): string {
  if (!iso) return '날짜 선택';
  try {
    const { year, month, day } = parseIsoYearMonthDay(iso);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = WEEKDAYS[dateObj.getDay()];
    return `${year}. ${String(month).padStart(2, '0')}. ${String(day).padStart(2, '0')}. (${dayOfWeek})`;
  } catch {
    return iso;
  }
}

export const TossDatePicker: React.FC<TossDatePickerProps> = ({
  value,
  onChange,
  label,
  required = false,
  minDate,
  maxDate,
  containerClassName = '',
  heightClass = 'h-11',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initial = useMemo(() => parseIsoYearMonthDay(value), [value]);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  // Sync view when value changes from outside
  useEffect(() => {
    if (value) {
      const parsed = parseIsoYearMonthDay(value);
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [value]);

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
  const tomorrowIso = useMemo(() => getKstTomorrowDateStr(), []);

  // Compute calendar grid days for viewYear & viewMonth
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0 (Sun) to 6 (Sat)
    const lastDate = new Date(viewYear, viewMonth, 0).getDate(); // Days in current month

    // Days in previous month
    const prevMonthLastDate = new Date(viewYear, viewMonth - 1, 0).getDate();

    const days: Array<{
      day: number;
      monthOffset: number; // -1 = prev month, 0 = current, 1 = next
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

    // Next month padding to make total days multiple of 7 (up to 35 or 42)
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

  const handleSelectDate = (iso: string) => {
    haptics.selection();
    onChange(iso);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${containerClassName}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
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
        className={`w-full ${heightClass} bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl px-3.5 flex items-center gap-2.5 transition-all cursor-pointer shadow-2xs select-none ${
          disabled ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <CalendarIcon className="w-4 h-4 text-[#1E60F3] shrink-0" />
        <span className="text-sm font-bold text-slate-900 flex-1 truncate">
          {formatKoreanDisplay(value)}
        </span>
      </div>

      {/* Toss-Style Calendar Popover */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto right-auto sm:right-0 top-full mt-2 z-50 w-[310px] sm:w-[328px] rounded-3xl bg-gradient-to-b from-blue-50/70 via-white to-white border border-blue-100/90 shadow-[0_20px_60px_rgba(30,96,243,0.14)] p-4 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-blue-100/60">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold text-slate-900 tracking-tight">
                {viewYear}년 {viewMonth}월
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="이전 달"
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white/80 active:scale-95 transition-all cursor-pointer shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="다음 달"
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-white/80 active:scale-95 transition-all cursor-pointer shadow-2xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="닫기"
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-white/80 active:scale-95 transition-all cursor-pointer ml-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Preset Pills */}
          <div className="flex items-center gap-1.5 mb-3 px-0.5">
            <button
              type="button"
              onClick={() => handleSelectDate(todayIso)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                value === todayIso
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'bg-white/90 text-slate-700 hover:bg-blue-50 hover:text-[#1E60F3] border border-slate-200/60'
              }`}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => handleSelectDate(tomorrowIso)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                value === tomorrowIso
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'bg-white/90 text-slate-700 hover:bg-blue-50 hover:text-[#1E60F3] border border-slate-200/60'
              }`}
            >
              내일
            </button>
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
              const isSelected = item.iso === value;
              const isToday = item.iso === todayIso;
              const isDisabled =
                (minDate && item.iso < minDate) || (maxDate && item.iso > maxDate);

              return (
                <div key={item.iso} className="flex items-center justify-center p-0.5">
                  <button
                    type="button"
                    disabled={Boolean(isDisabled)}
                    onClick={() => handleSelectDate(item.iso)}
                    className={`w-9 h-9 rounded-2xl flex flex-col items-center justify-center text-xs transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-[#1E60F3] text-white font-extrabold shadow-md shadow-blue-500/35 scale-105 z-10'
                        : isToday
                        ? 'bg-blue-100/60 text-[#1E60F3] font-black border border-blue-300/50 hover:bg-blue-100'
                        : item.isCurrentMonth
                        ? 'text-slate-800 font-semibold hover:bg-white hover:shadow-2xs hover:text-[#1E60F3]'
                        : 'text-slate-300 font-normal hover:bg-slate-100/50'
                    } ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}
                  >
                    <span>{item.day}</span>
                    {isToday && !isSelected && (
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

