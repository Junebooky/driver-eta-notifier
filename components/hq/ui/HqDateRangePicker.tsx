'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import {
  formatHqDateRangeLabel,
  resolveHqDateBounds,
  type HqDateRange,
} from '@/utils/hqDateRange';

export interface HqDateRangePickerProps {
  value: HqDateRange;
  onChange: (value: HqDateRange) => void;
  disabled?: boolean;
  label?: string;
}

/** Shared A-plan filter popover. Native date fields are only used for date entry, never for time. */
export function HqDateRangePicker({ value, onChange, disabled, label = '운행일' }: HqDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(value.from || '');
  const [to, setTo] = useState(value.to || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const choose = (mode: Exclude<HqDateRange['mode'], 'custom'>) => {
    onChange({ mode });
    setError('');
    setOpen(false);
  };

  const applyCustom = () => {
    const bounds = resolveHqDateBounds({ mode: 'custom', from, to });
    if (!bounds) {
      setError('시작일과 종료일을 순서대로 입력해 주세요.');
      return;
    }
    onChange({ mode: 'custom', from: bounds.from, to: bounds.to });
    setError('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) {
            setFrom(value.from || '');
            setTo(value.to || '');
            setError('');
          }
          setOpen(!open);
        }}
        aria-label={`${label} 기간 필터`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex min-h-10 max-w-full items-center gap-2 rounded-[13px] bg-[#F7F9FC] px-3 text-[12px] font-semibold text-[#52647A] transition-colors hover:bg-[#F0F3F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20 disabled:opacity-50 ${open ? 'ring-1 ring-[#1E60F3]/25' : ''}`}
      >
        <CalendarDays size={15} className="shrink-0 text-[#7289A6]" />
        <span className="truncate">{formatHqDateRangeLabel(value)}</span>
        <ChevronDown size={14} className={`shrink-0 text-[#9BA7B7] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="dialog" aria-label={`${label} 기간 선택`}
          className="absolute left-0 top-full z-[70] mt-2 w-[min(310px,calc(100vw-32px))] rounded-[18px] bg-white p-3 shadow-[0_12px_38px_rgba(35,49,78,0.12)]">
          <p className="mb-2 px-1 text-[12px] font-semibold text-[#52647A]">조회 기간</p>
          <div className="grid grid-cols-2 gap-1">
            {([
              { mode: 'all', text: '전체 기간' },
              { mode: 'today', text: '오늘' },
              { mode: 'week', text: '이번 주' },
              { mode: 'month', text: '이번 달' },
            ] as const).map(option => (
              <button key={option.mode} type="button"
                onClick={() => choose(option.mode)}
                aria-pressed={value.mode === option.mode}
                className={`flex min-h-10 items-center justify-between gap-2 rounded-[11px] px-3 text-left text-[12px] font-medium transition-colors ${value.mode === option.mode
                  ? 'bg-[#EEF3FF] text-[#1E60F3]' : 'text-[#52647A] hover:bg-[#F7F9FC]'}`}
              >
                {option.text}
                {value.mode === option.mode && <Check size={14}/>}
              </button>
            ))}
          </div>
          <div className="my-3 h-px bg-[#F1F3F6]" />
          <p className="mb-2 px-1 text-[12px] font-semibold text-[#52647A]">직접 선택</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-[#8794A7]">
              시작일
              <input type="date" aria-label="필터 시작일" value={from} onChange={event => { setFrom(event.target.value); setError(''); }}
                className="mt-1 min-h-10 w-full min-w-0 rounded-[11px] bg-[#F7F9FC] px-2 text-[12px] font-medium text-[#17233B] outline-none focus:ring-2 focus:ring-[#1E60F3]/20" />
            </label>
            <label className="text-[11px] font-medium text-[#8794A7]">
              종료일
              <input type="date" aria-label="필터 종료일" value={to} min={from || undefined}
                onChange={event => { setTo(event.target.value); setError(''); }}
                className="mt-1 min-h-10 w-full min-w-0 rounded-[11px] bg-[#F7F9FC] px-2 text-[12px] font-medium text-[#17233B] outline-none focus:ring-2 focus:ring-[#1E60F3]/20" />
            </label>
          </div>
          {error && <p role="alert" className="mt-2 text-[11px] font-medium text-[#B75547]">{error}</p>}
          <button type="button" onClick={applyCustom}
            className="mt-3 min-h-10 w-full rounded-[12px] bg-[#1E60F3] text-[12px] font-semibold text-white transition-colors hover:bg-[#1856DD]">
            선택 기간 적용
          </button>
        </div>
      )}
    </div>
  );
}
