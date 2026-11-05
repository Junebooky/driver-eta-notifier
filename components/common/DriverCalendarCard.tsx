'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { getKstTodayDateStr } from '@/utils/dispatchConflictDetector';

export interface DriverCalendarCardProps {
  value: string; // 'YYYY-MM-DD'
  onChange: (dateIso: string) => void;
  onClose?: () => void;
  onClear?: () => void;
  highlightedDates?: Set<string>;
  minDate?: string;
  maxDate?: string;
  className?: string;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseIsoYearMonthDay(iso?: string) {
  const fallbackIso = getKstTodayDateStr();
  const target = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : fallbackIso;
  const [y, m, d] = target.split('-').map((v) => parseInt(v, 10));
  return {
    year: y || new Date().getFullYear(),
    month: m || new Date().getMonth() + 1,
    day: d || new Date().getDate(),
  };
}

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const DriverCalendarCard: React.FC<DriverCalendarCardProps> = ({
  value,
  onChange,
  onClose,
  onClear,
  highlightedDates,
  minDate,
  maxDate,
  className = '',
}) => {
  const initial = useMemo(() => parseIsoYearMonthDay(value), [value]);
  const [viewYear, setViewYear] = useState<number>(initial.year);
  const [viewMonth, setViewMonth] = useState<number>(initial.month); // 1..12
  const [isMonthSelectorOpen, setIsMonthSelectorOpen] = useState<boolean>(false);

  useEffect(() => {
    if (value) {
      const parsed = parseIsoYearMonthDay(value);
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [value]);

  const todayIso = useMemo(() => getKstTodayDateStr(), []);

  // Always build 42 cells (6 rows x 7 cols) to match Reference Image 1
  const cells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth - 1, 0).getDate();

    const list: Array<{
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
    }> = [];

    const prevYear = viewMonth === 1 ? viewYear - 1 : viewYear;
    const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      list.push({
        day: d,
        dateStr: formatIso(prevYear, prevMonth, d),
        isCurrentMonth: false,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      list.push({
        day: d,
        dateStr: formatIso(viewYear, viewMonth, d),
        isCurrentMonth: true,
      });
    }

    const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
    const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1;
    let nextDay = 1;
    while (list.length < 42) {
      list.push({
        day: nextDay,
        dateStr: formatIso(nextYear, nextMonth, nextDay),
        isCurrentMonth: false,
      });
      nextDay++;
    }

    return list;
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

  const handleSelectDate = (dateStr: string) => {
    haptics.selection();
    onChange(dateStr);
    onClose?.();
  };

  const handleJumpToday = () => {
    haptics.selection();
    const today = getKstTodayDateStr();
    const parsed = parseIsoYearMonthDay(today);
    setViewYear(parsed.year);
    setViewMonth(parsed.month);
    onChange(today);
    onClose?.();
  };

  const handleClear = () => {
    haptics.lightTap();
    if (onClear) {
      onClear();
    } else {
      const today = getKstTodayDateStr();
      onChange(today);
    }
    onClose?.();
  };

  return (
    <div
      className={`bg-white rounded-[28px] shadow-[0_14px_40px_rgba(15,23,42,0.12)] border border-slate-100/90 p-5 w-[312px] sm:w-[328px] select-none ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header: "2026년 11월 v" on left, "↑ ↓" on right */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setIsMonthSelectorOpen((prev) => !prev);
          }}
          className="inline-flex items-center gap-1.5 text-[17px] font-extrabold text-[#0F172A] tracking-tight hover:opacity-80 transition-opacity cursor-pointer"
        >
          <span>
            {viewYear}년 {viewMonth}월
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-600 stroke-[2.2] transition-transform duration-150 ${
              isMonthSelectorOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="이전 달"
            className="w-8 h-8 rounded-full hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-600 transition-all cursor-pointer"
          >
            <ArrowUp className="w-5 h-5 stroke-[1.8]" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="다음 달"
            className="w-8 h-8 rounded-full hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-600 transition-all cursor-pointer"
          >
            <ArrowDown className="w-5 h-5 stroke-[1.8]" />
          </button>
        </div>
      </div>

      {isMonthSelectorOpen ? (
        /* Quick Month Selector Grid when "2026년 11월 v" is clicked */
        <div className="py-2 space-y-3">
          <div className="flex items-center justify-between px-2">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
            >
              {viewYear - 1}년
            </button>
            <span className="text-sm font-extrabold text-[#0F172A]">{viewYear}년</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
            >
              {viewYear + 1}년
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => {
              const active = m === viewMonth;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setViewMonth(m);
                    setIsMonthSelectorOpen(false);
                  }}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-[#0055FF] text-white shadow-[0_4px_12px_rgba(0,85,255,0.28)]'
                      : 'bg-[#F6F8FC] text-slate-700 hover:bg-slate-200/70'
                  }`}
                >
                  {m}월
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Weekday Row */}
          <div className="grid grid-cols-7 text-center mb-2">
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                className="text-[13px] font-bold text-slate-500 py-1"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* 6x7 Days Grid */}
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {cells.map((cell) => {
              const isSelected = cell.dateStr === value;
              const isToday = cell.dateStr === todayIso;
              const hasDot = highlightedDates?.has(cell.dateStr);
              const isDisabled =
                Boolean(minDate && cell.dateStr < minDate) ||
                Boolean(maxDate && cell.dateStr > maxDate);

              return (
                <div key={cell.dateStr} className="flex items-center justify-center py-0.5">
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelectDate(cell.dateStr)}
                    className={`relative w-10 h-10 rounded-[12px] flex flex-col items-center justify-center text-[15px] tabular-nums transition-all cursor-pointer active:scale-95 ${
                      isSelected
                        ? 'bg-[#0055FF] text-white font-bold shadow-[0_4px_12px_rgba(0,85,255,0.28)]'
                        : !cell.isCurrentMonth
                          ? 'text-slate-400/75 font-normal hover:bg-slate-50'
                          : isToday
                            ? 'text-[#0055FF] font-extrabold hover:bg-blue-50/60'
                            : 'text-[#0F172A] font-medium hover:bg-slate-100/80'
                    } ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}
                  >
                    <span className="leading-none">{cell.day}</span>
                    {hasDot && (
                      <span
                        className={`w-1 h-1 rounded-full mt-0.5 ${
                          isSelected ? 'bg-white' : 'bg-[#0055FF]'
                        }`}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom Action Bar: 삭제 (left) / 오늘 (right) */}
      <div className="flex items-center justify-between pt-3.5 mt-1 px-1">
        <button
          type="button"
          onClick={handleClear}
          className="text-[15px] font-bold text-[#0055FF] hover:opacity-75 active:scale-95 transition-all cursor-pointer"
        >
          삭제
        </button>
        <button
          type="button"
          onClick={handleJumpToday}
          className="text-[15px] font-bold text-[#0055FF] hover:opacity-75 active:scale-95 transition-all cursor-pointer"
        >
          오늘
        </button>
      </div>
    </div>
  );
};

