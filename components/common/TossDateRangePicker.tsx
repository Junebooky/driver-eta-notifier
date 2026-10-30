'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import {
  getKstTodayDateStr,
  getKstTomorrowDateStr,
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

function addDays(iso: string, days: number): string {
  try {
    const d = new Date(iso + 'T00:00:00+09:00');
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return iso;
  }
}

export const TossDateRangePicker: React.FC<TossDateRangePickerProps> = ({
  startDate,
  endDate,
  onChangeRange,
  label,
  required = false,
  minDate,
  containerClassName = '',
  heightClass = 'h-12',
  disabled = false,
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
  const tomorrowIso = useMemo(() => getKstTomorrowDateStr(), []);

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
    } else {
      // Step === 'end'
      if (clickedIso < tempStart) {
        // Clicked date is earlier than start: make it new start
        setTempStart(clickedIso);
        setTempEnd(clickedIso);
        setPickStep('end');
      } else {
        setTempEnd(clickedIso);
        setPickStep('start');
      }
    }
  };

  const applyPreset = (s: string, e: string) => {
    haptics.lightTap();
    setTempStart(s);
    setTempEnd(e);
    setPickStep('start');
    const p = parseIso(s);
    setViewYear(p.year);
    setViewMonth(p.month);
  };

  const handleApply = () => {
    haptics.successPulse();
    onChangeRange(tempStart, tempEnd || tempStart);
    setIsOpen(false);
  };

  const displayLabel = formatDateRangeDisplay(startDate, endDate);

  return (
    <div className={`relative ${containerClassName}`} ref={containerRef}>
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
        className={`w-full ${heightClass} bg-white border border-slate-200 hover:border-blue-400 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 rounded-xl px-3.5 flex items-center gap-2.5 transition-all cursor-pointer shadow-2xs select-none ${
          disabled ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <CalendarIcon className="w-5 h-5 text-[#1E60F3] shrink-0" />
        <span className="text-sm font-bold text-slate-900 truncate flex-1">
          {displayLabel}
        </span>
      </div>

      {/* Toss-Style Calendar Popover */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto right-auto sm:right-0 top-full mt-2 z-50 w-[310px] sm:w-[332px] rounded-3xl bg-gradient-to-b from-blue-50/70 via-white to-white border border-blue-100/90 shadow-[0_20px_60px_rgba(30,96,243,0.16)] p-4 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-blue-100/60">
            <span className="text-base font-extrabold text-slate-900 tracking-tight">
              {viewYear}년 {viewMonth}월
            </span>

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

          {/* Preset Chips */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3 px-0.5">
            <button
              type="button"
              onClick={() => applyPreset(todayIso, todayIso)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tempStart === todayIso && tempEnd === todayIso
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'bg-white/90 text-slate-700 hover:bg-blue-50 hover:text-[#1E60F3] border border-slate-200/60'
              }`}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => applyPreset(tomorrowIso, tomorrowIso)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tempStart === tomorrowIso && tempEnd === tomorrowIso
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'bg-white/90 text-slate-700 hover:bg-blue-50 hover:text-[#1E60F3] border border-slate-200/60'
              }`}
            >
              내일
            </button>
            <button
              type="button"
              onClick={() => applyPreset(tempStart, addDays(tempStart, 1))}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tempEnd === addDays(tempStart, 1)
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'bg-white/90 text-slate-700 hover:bg-blue-50 hover:text-[#1E60F3] border border-slate-200/60'
              }`}
            >
              +1일 (1박2일)
            </button>
            <button
              type="button"
              onClick={() => applyPreset(tempStart, addDays(tempStart, 2))}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tempEnd === addDays(tempStart, 2)
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : 'bg-white/90 text-slate-700 hover:bg-blue-50 hover:text-[#1E60F3] border border-slate-200/60'
              }`}
            >
              +2일 (2박3일)
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
              const isStart = item.iso === tempStart;
              const isEnd = item.iso === tempEnd;
              const isInRange = tempStart && tempEnd && item.iso > tempStart && item.iso < tempEnd;
              const isToday = item.iso === todayIso;
              const isDisabled = minDate && item.iso < minDate;

              return (
                <div
                  key={item.iso}
                  className={`flex items-center justify-center p-0.5 relative ${
                    isInRange ? 'bg-blue-100/50' : ''
                  } ${isStart && tempEnd > tempStart ? 'rounded-l-2xl bg-blue-100/30' : ''} ${
                    isEnd && tempEnd > tempStart ? 'rounded-r-2xl bg-blue-100/30' : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={Boolean(isDisabled)}
                    onClick={() => handleDayClick(item.iso)}
                    className={`w-9 h-9 rounded-2xl flex flex-col items-center justify-center text-xs transition-all cursor-pointer relative ${
                      isStart || isEnd
                        ? 'bg-[#1E60F3] text-white font-extrabold shadow-md shadow-blue-500/35 scale-105 z-10'
                        : isInRange
                        ? 'bg-blue-100 text-[#1E60F3] font-bold'
                        : isToday
                        ? 'bg-blue-50 text-[#1E60F3] font-black border border-blue-200'
                        : item.isCurrentMonth
                        ? 'text-slate-800 font-semibold hover:bg-white hover:shadow-2xs hover:text-[#1E60F3]'
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

          {/* Selected Schedule Summary Bar */}
          <div className="mt-3.5 p-2.5 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block">선택된 일정</span>
              <span className="text-xs font-black text-[#1E60F3]">
                {formatDateRangeDisplay(tempStart, tempEnd)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleApply}
              className="px-3.5 py-1.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white font-extrabold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>일정 적용</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

