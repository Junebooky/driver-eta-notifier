'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { haptics } from '@/utils/haptics';

interface DepartureTimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  initialDate?: Date;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ITEM_HEIGHT = 40; // px per wheel row
const PAD_ITEMS = 3; // 3 rows above and 3 rows below center = 7 visible rows (280px)
const CONTAINER_HEIGHT = ITEM_HEIGHT * (PAD_ITEMS * 2 + 1); // 280px
const PAD_HEIGHT = ITEM_HEIGHT * PAD_ITEMS; // 120px

interface WheelOption<T> {
  key: string;
  label: string;
  value: T;
}

interface WheelColumnProps<T> {
  ariaLabel: string;
  options: WheelOption<T>[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
  flexClass: string;
  alignClass?: string;
}

function WheelColumn<T>({
  ariaLabel,
  options,
  selectedIndex,
  onSelectIndex,
  flexClass,
  alignClass = 'justify-center',
}: WheelColumnProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastReportedIdxRef = useRef<number>(selectedIndex);
  const isProgrammaticScrollRef = useRef<boolean>(false);

  // Position scroll container on open / external index sync
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    lastReportedIdxRef.current = selectedIndex;
    const targetTop = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - targetTop) > 2) {
      isProgrammaticScrollRef.current = true;
      el.scrollTop = targetTop;
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }
  }, [selectedIndex]);

  // Native `scrollsnapchange` listener where supported, paired with scroll fallback
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof HTMLElement === 'undefined' || !('onscrollsnapchange' in HTMLElement.prototype)) {
      return;
    }

    const handleSnapChange = (event: Event) => {
      const snapEvent = event as Event & { snapTargetBlock?: HTMLElement | null };
      const snappedEl = snapEvent.snapTargetBlock;
      if (!snappedEl) return;
      const idxAttr = snappedEl.getAttribute('data-wheel-idx');
      if (idxAttr !== null) {
        const parsedIdx = Number(idxAttr);
        if (!Number.isNaN(parsedIdx) && parsedIdx !== lastReportedIdxRef.current) {
          lastReportedIdxRef.current = parsedIdx;
          haptics.lightTap();
          onSelectIndex(parsedIdx);
        }
      }
    };

    el.addEventListener('scrollsnapchange', handleSnapChange);
    return () => {
      el.removeEventListener('scrollsnapchange', handleSnapChange);
    };
  }, [onSelectIndex]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isProgrammaticScrollRef.current) return;
    const rawIdx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(options.length - 1, rawIdx));
    if (clampedIdx !== lastReportedIdxRef.current) {
      lastReportedIdxRef.current = clampedIdx;
      haptics.lightTap();
      onSelectIndex(clampedIdx);
    }
  }, [options.length, onSelectIndex]);

  const handleClickItem = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    lastReportedIdxRef.current = idx;
    haptics.lightTap();
    onSelectIndex(idx);
    el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
  };

  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label={ariaLabel}
      onScroll={handleScroll}
      className={`${flexClass} relative z-10 overflow-y-auto no-scrollbar overscroll-contain`}
      style={{
        height: `${CONTAINER_HEIGHT}px`,
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ height: `${PAD_HEIGHT}px` }} aria-hidden="true" />
      {options.map((opt, idx) => {
        const dist = Math.abs(idx - selectedIndex);
        const isSelected = dist === 0;

        let textStyle = 'text-[13px] sm:text-[14px] font-medium text-[#BDC4D0] scale-[0.9]';
        if (dist === 0) {
          textStyle = 'text-[18px] sm:text-[20px] font-extrabold text-[#0F172A] scale-100';
        } else if (dist === 1) {
          textStyle = 'text-[16px] sm:text-[17px] font-medium text-[#8C95A6] scale-[0.97]';
        } else if (dist === 2) {
          textStyle = 'text-[14px] sm:text-[15px] font-medium text-[#A6AEBD] scale-[0.93]';
        }

        return (
          <div
            key={opt.key}
            role="option"
            aria-selected={isSelected}
            data-wheel-idx={idx}
            onClick={() => handleClickItem(idx)}
            style={{
              height: `${ITEM_HEIGHT}px`,
              scrollSnapAlign: 'center',
            }}
            className={`flex items-center ${alignClass} px-1 whitespace-nowrap cursor-pointer transition-all duration-150 tabular-nums ${textStyle}`}
          >
            {opt.label}
          </div>
        );
      })}
      <div style={{ height: `${PAD_HEIGHT}px` }} aria-hidden="true" />
    </div>
  );
}

export const DepartureTimePickerModal: React.FC<DepartureTimePickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialDate,
}) => {
  // Build date options (-3 days .. +30 days around today, ensuring initialDate is covered)
  const dateOptions = useMemo<WheelOption<{ year: number; month: number; date: number }>[]>(() => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let minOffset = -3;
    let maxOffset = 30;
    if (initialDate && !Number.isNaN(initialDate.getTime())) {
      const initMidnight = new Date(
        initialDate.getFullYear(),
        initialDate.getMonth(),
        initialDate.getDate()
      );
      const diff = Math.round(
        (initMidnight.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (diff < minOffset) minOffset = diff - 2;
      if (diff > maxOffset) maxOffset = diff + 3;
    }

    const list: WheelOption<{ year: number; month: number; date: number }>[] = [];
    for (let offset = minOffset; offset <= maxOffset; offset++) {
      const d = new Date(todayMidnight);
      d.setDate(todayMidnight.getDate() + offset);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const dow = WEEKDAYS[d.getDay()];
      const label = offset === 0 ? '오늘' : `${m}월 ${day}일 ${dow}`;
      list.push({
        key: `date-${y}-${m}-${day}`,
        label,
        value: { year: y, month: m, date: day },
      });
    }
    return list;
  }, [initialDate]);

  // Period options ('오전', '오후')
  const periodOptions = useMemo<WheelOption<'AM' | 'PM'>[]>(
    () => [
      { key: 'period-am', label: '오전', value: 'AM' },
      { key: 'period-pm', label: '오후', value: 'PM' },
    ],
    []
  );

  // Hour options (3 cycles of 1..12 so drum wraps visually past 12 -> 1, 2)
  const hourOptions = useMemo<WheelOption<number>[]>(() => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const list: WheelOption<number>[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const h of base) {
        list.push({
          key: `hour-${cycle}-${h}`,
          label: String(h),
          value: h,
        });
      }
    }
    return list;
  }, []);

  // Minute options (5 cycles of 00..50 in 10-min intervals)
  const minuteOptions = useMemo<WheelOption<number>[]>(() => {
    const base = [0, 10, 20, 30, 40, 50];
    const list: WheelOption<number>[] = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      for (const m of base) {
        list.push({
          key: `min-${cycle}-${m}`,
          label: String(m).padStart(2, '0'),
          value: m,
        });
      }
    }
    return list;
  }, []);

  const [dateIdx, setDateIdx] = useState<number>(3);
  const [periodIdx, setPeriodIdx] = useState<number>(1);
  const [hourIdx, setHourIdx] = useState<number>(21); // middle cycle 10
  const [minuteIdx, setMinuteIdx] = useState<number>(12); // middle cycle 00

  // Body Scroll Lock + Escape Key
  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = orig;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Initialize wheel indices when modal opens
  const [wasOpen, setWasOpen] = useState(false);
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    const base =
      initialDate && !Number.isNaN(initialDate.getTime()) ? new Date(initialDate) : new Date();
    // Round minutes to nearest 10-minute slot
    const roundedMin = Math.round(base.getMinutes() / 10) * 10;
    if (roundedMin === 60) {
      base.setHours(base.getHours() + 1, 0, 0, 0);
    } else {
      base.setMinutes(roundedMin, 0, 0);
    }

    const foundDateIdx = dateOptions.findIndex(
      (opt) =>
        opt.value.year === base.getFullYear() &&
        opt.value.month === base.getMonth() + 1 &&
        opt.value.date === base.getDate()
    );
    setDateIdx(foundDateIdx >= 0 ? foundDateIdx : 3);

    const h24 = base.getHours();
    setPeriodIdx(h24 >= 12 ? 1 : 0);

    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    setHourIdx(12 + (h12 - 1)); // middle cycle (12..23)

    const minSlot = Math.floor(base.getMinutes() / 10) % 6;
    setMinuteIdx(12 + minSlot); // middle cycle (12..17)
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  if (!isOpen) return null;

  const handleConfirm = () => {
    haptics.successPulse();
    const chosenDate = dateOptions[dateIdx]?.value || dateOptions[3].value;
    const chosenPeriod = periodOptions[periodIdx]?.value || 'AM';
    const chosenHour12 = hourOptions[hourIdx]?.value || 12;
    const chosenMinute = minuteOptions[minuteIdx]?.value || 0;

    let hour24 = chosenHour12 % 12;
    if (chosenPeriod === 'PM') {
      hour24 += 12;
    }

    const finalDate = new Date(
      chosenDate.year,
      chosenDate.month - 1,
      chosenDate.date,
      hour24,
      chosenMinute,
      0,
      0
    );
    onConfirm(finalDate);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200 select-none overscroll-contain"
      onClick={() => {
        haptics.lightTap();
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-md bg-[#F7F9FC] rounded-t-[32px] sm:rounded-[32px] px-5 pt-3.5 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6 shadow-2xl border border-white/90 overflow-hidden animate-in slide-in-from-bottom-5 duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Drag Handle Pill */}
        <div className="w-12 h-1.5 rounded-full bg-[#DCE2EE] mx-auto mb-4" />

        {/* Centered Title */}
        <h3 className="text-xl sm:text-[22px] font-extrabold text-[#0F172A] text-center tracking-tight mb-3">
          출발 시간
        </h3>

        {/* 4-Column Drum Wheel Picker */}
        <div
          className="relative flex items-center px-2 sm:px-4"
          style={{ height: `${CONTAINER_HEIGHT}px` }}
        >
          {/* Unified White Center Highlight Bar */}
          <div className="absolute left-1 right-1 top-1/2 -translate-y-1/2 h-12 bg-white rounded-2xl shadow-[0_4px_18px_rgba(15,23,42,0.06)] border border-slate-100/80 pointer-events-none z-0" />

          {/* Top Smooth Cylindrical Fade Mask */}
          <div className="absolute inset-x-0 top-0 h-[104px] bg-gradient-to-b from-[#F7F9FC] via-[#F7F9FC]/75 to-transparent pointer-events-none z-20" />

          {/* Bottom Smooth Cylindrical Fade Mask */}
          <div className="absolute inset-x-0 bottom-0 h-[104px] bg-gradient-to-t from-[#F7F9FC] via-[#F7F9FC]/75 to-transparent pointer-events-none z-20" />

          {/* Col 1: Date */}
          <WheelColumn
            ariaLabel="출발 날짜"
            options={dateOptions}
            selectedIndex={dateIdx}
            onSelectIndex={setDateIdx}
            flexClass="flex-[2.2]"
            alignClass="justify-center"
          />

          {/* Col 2: AM / PM */}
          <WheelColumn
            ariaLabel="오전 오후"
            options={periodOptions}
            selectedIndex={periodIdx}
            onSelectIndex={setPeriodIdx}
            flexClass="flex-[1]"
            alignClass="justify-center"
          />

          {/* Col 3: Hour (1..12) */}
          <WheelColumn
            ariaLabel="시"
            options={hourOptions}
            selectedIndex={hourIdx}
            onSelectIndex={setHourIdx}
            flexClass="flex-[0.85]"
            alignClass="justify-center"
          />

          {/* Col 4: Minute (00..50) */}
          <WheelColumn
            ariaLabel="분"
            options={minuteOptions}
            selectedIndex={minuteIdx}
            onSelectIndex={setMinuteIdx}
            flexClass="flex-[0.85]"
            alignClass="justify-center"
          />
        </div>

        {/* Bottom Primary CTA Button */}
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full h-14 mt-4 rounded-2xl bg-[#0055FF] hover:bg-[#0046D5] active:scale-[0.99] text-white font-extrabold text-base sm:text-[17px] shadow-[0_6px_20px_rgba(0,85,255,0.28)] flex items-center justify-center transition-all cursor-pointer"
        >
          확인
        </button>
      </div>
    </div>
  );
};
