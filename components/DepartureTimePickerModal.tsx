'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, Check, ArrowRight } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface DepartureTimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  initialDate?: Date;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toTimeInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export const DepartureTimePickerModal: React.FC<DepartureTimePickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialDate,
}) => {
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');

  // Body Scroll Lock
  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, [isOpen]);

  // Initialize date & time when modal opens
  useEffect(() => {
    if (isOpen) {
      const base = initialDate && !isNaN(initialDate.getTime()) ? initialDate : new Date();
      setDateStr(toDateInputValue(base));
      setTimeStr(toTimeInputValue(base));
    }
  }, [isOpen, initialDate]);

  // Compute selected Date object
  const selectedDateObj = useMemo(() => {
    if (!dateStr || !timeStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    if (!y || !m || !d || isNaN(hh) || isNaN(mm)) return new Date();
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }, [dateStr, timeStr]);

  // Formatted date label with Korean day of week
  const dateLabel = useMemo(() => {
    const d = selectedDateObj;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = WEEKDAYS[d.getDay()];
    return `${d.getFullYear()}년 ${m}월 ${day}일 (${dow})`;
  }, [selectedDateObj]);

  // Formatted time label with Korean AM/PM
  const timeLabel = useMemo(() => {
    const h = selectedDateObj.getHours();
    const m = String(selectedDateObj.getMinutes()).padStart(2, '0');
    const period = h < 12 ? '오전' : '오후';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${period} ${h12}:${m}`;
  }, [selectedDateObj]);

  if (!isOpen) return null;

  // Quick date chips
  const handleQuickDate = (offsetDays: number) => {
    haptics.lightTap();
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    setDateStr(toDateInputValue(d));
  };

  // Quick time additions
  const handleAddMinutes = (minutes: number) => {
    haptics.lightTap();
    const cur = new Date(selectedDateObj.getTime() + minutes * 60 * 1000);
    setDateStr(toDateInputValue(cur));
    setTimeStr(toTimeInputValue(cur));
  };

  // Set to current time (rounded up to nearest 10 min)
  const handleSetNow = () => {
    haptics.lightTap();
    const now = new Date();
    const rem = now.getMinutes() % 10;
    if (rem !== 0) now.setMinutes(now.getMinutes() + (10 - rem));
    setDateStr(toDateInputValue(now));
    setTimeStr(toTimeInputValue(now));
  };

  const handleConfirm = () => {
    haptics.successPulse();
    onConfirm(selectedDateObj);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none overscroll-contain"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85dvh] animate-in slide-in-from-bottom-6 duration-300"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#1E60F3] text-white flex items-center justify-center shadow-xs">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                출발 시간 선택
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                실시간 및 미래 교통 예측을 위한 출발 시간 설정
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          className="p-5 space-y-4 overflow-y-auto max-h-[85dvh] flex-1 text-slate-800 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Quick Date Chips */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>날짜 선택</span>
            </label>

            <div className="flex items-center gap-1.5">
              {[
                { label: '오늘', offset: 0 },
                { label: '내일', offset: 1 },
                { label: '모레', offset: 2 },
              ].map(({ label, offset }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleQuickDate(offset)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold border border-slate-200 hover:border-[#1E60F3] hover:bg-blue-50/40 text-slate-700 hover:text-[#1E60F3] transition-all cursor-pointer shadow-2xs active:scale-95"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative pt-1">
              <input
                type="date"
                value={dateStr}
                onChange={(e) => {
                  haptics.lightTap();
                  setDateStr(e.target.value);
                }}
                className="w-full px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50/80 font-bold text-slate-900 text-sm focus:bg-white focus:border-[#1E60F3] outline-none transition-all cursor-pointer shadow-xs"
              />
              <p className="text-[11px] text-slate-500 font-semibold mt-1 px-1">
                {dateLabel}
              </p>
            </div>
          </div>

          {/* Quick Time Chips */}
          <div className="space-y-1.5 pt-1">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>시간 선택</span>
            </label>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSetNow}
                className="flex-1 py-2 rounded-xl text-sm font-bold border border-slate-200 hover:border-[#1E60F3] hover:bg-blue-50/40 text-slate-700 hover:text-[#1E60F3] transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                지금
              </button>
              <button
                type="button"
                onClick={() => handleAddMinutes(10)}
                className="flex-1 py-2 rounded-xl text-sm font-bold border border-slate-200 hover:border-[#1E60F3] hover:bg-blue-50/40 text-slate-700 hover:text-[#1E60F3] transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                +10분
              </button>
              <button
                type="button"
                onClick={() => handleAddMinutes(30)}
                className="flex-1 py-2 rounded-xl text-sm font-bold border border-slate-200 hover:border-[#1E60F3] hover:bg-blue-50/40 text-slate-700 hover:text-[#1E60F3] transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                +30분
              </button>
              <button
                type="button"
                onClick={() => handleAddMinutes(60)}
                className="flex-1 py-2 rounded-xl text-sm font-bold border border-slate-200 hover:border-[#1E60F3] hover:bg-blue-50/40 text-slate-700 hover:text-[#1E60F3] transition-all cursor-pointer shadow-2xs active:scale-95"
              >
                +1시간
              </button>
            </div>

            <div className="relative pt-1">
              <input
                type="time"
                value={timeStr}
                onChange={(e) => {
                  haptics.lightTap();
                  setTimeStr(e.target.value);
                }}
                className="w-full px-3.5 py-3 rounded-2xl border border-slate-200 bg-slate-50/80 font-bold text-slate-900 text-sm focus:bg-white focus:border-[#1E60F3] outline-none transition-all cursor-pointer shadow-xs"
              />
              <p className="text-[11px] text-slate-500 font-semibold mt-1 px-1">
                {timeLabel}
              </p>
            </div>
          </div>

          {/* Selection Summary Card */}
          <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/80 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                예측
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#1E60F3]">
                  선택한 출발 시각
                </p>
                <p className="text-sm font-black text-slate-900">
                  {dateLabel} {timeLabel}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#1E60F3]" />
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-all cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-[2] py-3 rounded-xl bg-[#1E60F3] hover:bg-[#1650D6] text-white font-extrabold text-sm shadow-md shadow-blue-500/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>이 시간으로 예측 실행</span>
          </button>
        </div>
      </div>
    </div>
  );
};
