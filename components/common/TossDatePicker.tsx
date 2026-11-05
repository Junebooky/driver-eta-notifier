'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { DriverCalendarCard } from './DriverCalendarCard';

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

function formatKoreanDisplay(iso: string): string {
  if (!iso) return '날짜 선택';
  try {
    const { year, month, day } = parseIsoYearMonthDay(iso);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = WEEKDAYS[dateObj.getDay()];
    return `${year}년 ${String(month).padStart(2, '0')}월 ${String(day).padStart(2, '0')}일 (${dayOfWeek})`;
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
        className={`w-full ${heightClass} bg-white border border-slate-100/90 hover:border-blue-200 focus:border-[#0055FF] focus:ring-2 focus:ring-blue-100 rounded-2xl px-4 flex items-center justify-between gap-2.5 transition-all cursor-pointer shadow-[0_3px_12px_rgba(15,23,42,0.04)] select-none ${
          disabled ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        <span className="text-sm font-bold text-[#0F172A] flex-1 truncate tabular-nums">
          {formatKoreanDisplay(value)}
        </span>
        <CalendarIcon className="w-[18px] h-[18px] text-[#0055FF] shrink-0 stroke-[2]" />
      </div>

      {/* Reference Image 1 Calendar Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <DriverCalendarCard
            value={value}
            minDate={minDate}
            maxDate={maxDate}
            onChange={(iso) => {
              onChange(iso);
              setIsOpen(false);
            }}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
};
