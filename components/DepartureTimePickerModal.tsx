'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface DepartureTimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  initialDate?: Date;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ITEM_HEIGHT = 48; // 48px fixed row height

interface DateOption {
  label: string;
  offsetDays: number;
  month: number;
  day: number;
  dayOfWeek: string;
}

function generateDates(): DateOption[] {
  const dates: DateOption[] = [];
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

const ALL_PERIODS: Array<'오전' | '오후'> = ['오전', '오후'];
const ALL_HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ALL_MINUTES = [0, 10, 20, 30, 40, 50];

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

// -----------------------------------------------------------------------------
// 3D Convex Cylinder Drum Column Component (Zero-Latency Direct DOM Manipulation)
// -----------------------------------------------------------------------------
interface CylinderColumnProps<T> {
  items: T[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  getLabel: (item: T) => string;
  colRef: React.RefObject<HTMLDivElement | null>;
  isItemDisabled?: (item: T, index: number) => boolean;
  className?: string;
}

function CylinderColumn<T>({
  items,
  selectedIndex,
  onSelect,
  getLabel,
  colRef,
  isItemDisabled,
  className = '',
}: CylinderColumnProps<T>) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rAFRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  // Update transforms directly on DOM elements for Zero-Latency 120Hz smooth scrolling
  const updateTransforms = useCallback((scrollTop: number) => {
    const total = items.length;
    for (let idx = 0; idx < total; idx++) {
      const el = itemRefs.current[idx];
      if (!el) continue;

      const itemCenter = idx * ITEM_HEIGHT;
      const distance = itemCenter - scrollTop;
      const delta = distance / ITEM_HEIGHT;
      const absDelta = Math.abs(delta);

      // [Convex Drum 3D Geometry - Forward Protruding Formula]
      let rotateX = delta * -24;
      let translateZ = Math.max(-55, 24 - Math.pow(absDelta, 1.35) * 52);
      let scale = Math.max(0.80, 1.16 - absDelta * 0.28);
      let opacity = Math.max(0.18, 1.0 - absDelta * 0.62);

      // [태스크 1] Snap-to-Zero Deadzone (absDelta <= 0.15)
      // When item is within center window (±7px), force mathematical zero to prevent horizontal baseline tilting
      if (absDelta <= 0.15) {
        rotateX = 0;
        translateZ = 24; // 전면 돌출 기준 높이
        scale = 1.16;
        opacity = 1.0;
      }

      const disabled = isItemDisabled ? isItemDisabled(items[idx], idx) : false;

      el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) translateZ(${translateZ}px) scale(${scale})`;
      el.style.opacity = disabled ? (absDelta <= 0.15 ? '0.35' : '0.15') : `${opacity}`;

      // Dynamic Typography & Color switching based on center proximity & disabled state
      const span = el.querySelector('span');
      if (span) {
        if (disabled) {
          span.style.color = '#CBD5E1'; // slate-300
          span.style.fontWeight = '500';
          span.style.fontSize = absDelta < 0.45 ? '1.25rem' : '1.05rem';
        } else if (absDelta < 0.45) {
          span.style.color = '#0F172A';
          span.style.fontWeight = '900';
          span.style.fontSize = '1.35rem'; // ~22px-24px (text-2xl)
        } else {
          span.style.color = '#94A3B8';
          span.style.fontWeight = '600';
          span.style.fontSize = '1.1rem'; // ~17px-18px (text-lg)
        }
      }
    }
  }, [items, isItemDisabled]);

  // Sync scroll position when selectedIndex changes externally
  useEffect(() => {
    if (!colRef.current) return;
    const targetScroll = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(colRef.current.scrollTop - targetScroll) > 2) {
      isProgrammaticScrollRef.current = true;
      colRef.current.scrollTo({
        top: targetScroll,
        behavior: 'smooth',
      });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 200);
    }
    updateTransforms(targetScroll);
  }, [selectedIndex, colRef, updateTransforms]);

  // Initial layout transform binding
  useEffect(() => {
    if (colRef.current) {
      updateTransforms(colRef.current.scrollTop);
    }
  }, [updateTransforms, colRef]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;

    // Zero-Latency Direct GPU styling via requestAnimationFrame
    if (rAFRef.current) {
      cancelAnimationFrame(rAFRef.current);
    }
    rAFRef.current = requestAnimationFrame(() => {
      updateTransforms(st);
    });

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // [태스크 1] Debounced center snap index commit + Integer Pixel Magnetic Clamping
    scrollTimeoutRef.current = setTimeout(() => {
      if (isProgrammaticScrollRef.current) return;
      const finalIndex = Math.round(st / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, finalIndex));
      const targetScroll = clamped * ITEM_HEIGHT;

      // Magnetic snap to exact integer pixel offset (zero subpixel tilting)
      if (colRef.current && Math.abs(colRef.current.scrollTop - targetScroll) > 0.5) {
        colRef.current.scrollTo({
          top: targetScroll,
          behavior: 'smooth',
        });
      }
      updateTransforms(targetScroll);

      if (clamped !== selectedIndex) {
        onSelect(clamped);
      }
    }, 70);
  };

  return (
    <div
      ref={colRef}
      onScroll={handleScroll}
      className={`h-[240px] flex flex-col items-center overflow-y-auto scrollbar-none snap-y snap-mandatory pt-[96px] pb-[96px] ${className}`}
      style={{
        perspective: '1000px',
        transformStyle: 'preserve-3d',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        scrollSnapType: 'y mandatory',
      }}
    >
      {items.map((item, idx) => {
        const disabled = isItemDisabled ? isItemDisabled(item, idx) : false;
        return (
          <button
            key={`${getLabel(item)}-${idx}`}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              if (colRef.current) {
                colRef.current.scrollTo({
                  top: idx * ITEM_HEIGHT,
                  behavior: 'smooth',
                });
              }
              onSelect(idx);
            }}
            className={`h-[48px] w-full flex items-center justify-center snap-center shrink-0 select-none ${
              disabled ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'
            }`}
            style={{
              transformStyle: 'preserve-3d',
              willChange: 'transform, opacity',
              scrollSnapAlign: 'center',
              scrollSnapStop: 'normal',
            }}
          >
            <span className="leading-none truncate px-1 transition-colors duration-100 select-none">
              {getLabel(item)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main Modal Component
// -----------------------------------------------------------------------------
export const DepartureTimePickerModal: React.FC<DepartureTimePickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialDate,
}) => {
  const datesList = useRef(generateDates()).current;

  // Refs for 4 columns
  const dateColRef = useRef<HTMLDivElement | null>(null);
  const periodColRef = useRef<HTMLDivElement | null>(null);
  const hourColRef = useRef<HTMLDivElement | null>(null);
  const minuteColRef = useRef<HTMLDivElement | null>(null);

  // States
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'오전' | '오후'>('오후');
  const [selectedHour, setSelectedHour] = useState(3);
  const [selectedMinute, setSelectedMinute] = useState(10);
  const [isShaking, setIsShaking] = useState(false);

  // Track previous hour to detect 11 <-> 12 rollover
  const prevHourRef = useRef<number>(selectedHour);

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

  // 2. Fixed Data Sources for 100% Column Independence
  const now = new Date();
  const minAllowed = getMinAllowedDate(now);
  const isToday = selectedDateIdx === 0;
  const isNowAfternoon = now.getHours() >= 12;

  const periodsList = ALL_PERIODS;
  const hoursList = ALL_HOURS;
  const minutesList = ALL_MINUTES;

  // Helper to trigger Elastic Rubber-Band Snapback (Strictly scoped to '오늘')
  const triggerRubberBandSnapback = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([30, 40, 30]);
      }
    } catch {
      // Ignore vibration error
    }
    haptics.warningPulse();

    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
    }, 400);

    // Elastic snapback to minAllowedDate
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

    // Immediately animate columns to valid positions
    if (periodColRef.current) {
      const pIdx = periodsList.indexOf(period);
      periodColRef.current.scrollTo({ top: pIdx * ITEM_HEIGHT, behavior: 'smooth' });
    }
    if (hourColRef.current) {
      const hIdx = hoursList.indexOf(h12);
      hourColRef.current.scrollTo({ top: hIdx * ITEM_HEIGHT, behavior: 'smooth' });
    }
    if (minuteColRef.current) {
      const mIdx = minutesList.indexOf(minute);
      minuteColRef.current.scrollTo({ top: mIdx * ITEM_HEIGHT, behavior: 'smooth' });
    }
  }, [periodsList, hoursList, minutesList]);

  // 3. Initialize from initialDate or minAllowedDate on open
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
  }, [isOpen, initialDate]);

  if (!isOpen) return null;

  // Pre-disabled Visual Cue functions for past slots
  const isPeriodDisabled = (p: '오전' | '오후') => {
    return isToday && isNowAfternoon && p === '오전';
  };

  const isHourDisabled = (h: number) => {
    if (!isToday) return false;
    // Check if the latest minute of this hour is in the past
    const maxHourTime = constructDate(0, selectedPeriod, h, 50, now);
    return maxHourTime.getTime() < minAllowed.getTime();
  };

  const isMinuteDisabled = (m: number) => {
    if (!isToday) return false;
    const itemTime = constructDate(0, selectedPeriod, selectedHour, m, now);
    return itemTime.getTime() < minAllowed.getTime();
  };

  // 4. Selection Handlers with Real-time Elastic Rebound
  const handleSelectDateIdx = (idx: number) => {
    haptics.lightTap();
    setSelectedDateIdx(idx);

    // When switching back to '오늘', check if current time creates an invalid past time
    if (idx === 0) {
      const projected = constructDate(0, selectedPeriod, selectedHour, selectedMinute, now);
      if (projected.getTime() < minAllowed.getTime()) {
        triggerRubberBandSnapback();
      }
    }
  };

  const handleSelectPeriodIdx = (idx: number) => {
    const period = periodsList[idx] || '오후';

    // [태스크 2] Real-time Elastic Rebound when selecting '오전' during today's afternoon
    if (selectedDateIdx === 0 && isNowAfternoon && period === '오전') {
      // Forcibly rebound back to '오후' (index = 1) immediately with warning haptics
      if (periodColRef.current) {
        periodColRef.current.scrollTo({
          top: 1 * ITEM_HEIGHT,
          behavior: 'smooth',
        });
      }
      setSelectedPeriod('오후');
      triggerRubberBandSnapback();
      return;
    }

    haptics.lightTap();
    setSelectedPeriod(period);

    if (selectedDateIdx === 0) {
      const projected = constructDate(0, period, selectedHour, selectedMinute, now);
      if (projected.getTime() < minAllowed.getTime()) {
        triggerRubberBandSnapback();
      }
    }
  };

  const handleSelectHourIdx = (idx: number) => {
    const newHour = hoursList[idx];
    const prevHour = prevHourRef.current;
    let nextPeriod = selectedPeriod;
    let nextDateIdx = selectedDateIdx;

    // 12-Hour Smart Rollover with micro-haptics
    // Rollover 11 -> 12 (Forward)
    if (prevHour === 11 && newHour === 12) {
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(10);
        }
      } catch {}

      if (selectedPeriod === '오전') {
        nextPeriod = '오후';
        setSelectedPeriod('오후');
        if (periodColRef.current) {
          periodColRef.current.scrollTo({ top: 1 * ITEM_HEIGHT, behavior: 'smooth' });
        }
      } else {
        // 오후 11시 -> 12시는 자정(다음날 오전 12시)
        nextPeriod = '오전';
        nextDateIdx = Math.min(datesList.length - 1, selectedDateIdx + 1);
        setSelectedPeriod('오전');
        setSelectedDateIdx(nextDateIdx);
        if (periodColRef.current) periodColRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        if (dateColRef.current) dateColRef.current.scrollTo({ top: nextDateIdx * ITEM_HEIGHT, behavior: 'smooth' });
      }
    }
    // Rollover 12 -> 11 (Backward)
    else if (prevHour === 12 && newHour === 11) {
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(10);
        }
      } catch {}

      if (selectedPeriod === '오후') {
        if (selectedDateIdx > 0 || !isNowAfternoon) {
          nextPeriod = '오전';
          setSelectedPeriod('오전');
          if (periodColRef.current) periodColRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (selectedDateIdx > 0) {
        // 오전 12시 -> 11시 뒤로는 전날 오후 11시
        nextPeriod = '오후';
        nextDateIdx = Math.max(0, selectedDateIdx - 1);
        setSelectedPeriod('오후');
        setSelectedDateIdx(nextDateIdx);
        if (periodColRef.current) periodColRef.current.scrollTo({ top: 1 * ITEM_HEIGHT, behavior: 'smooth' });
        if (dateColRef.current) dateColRef.current.scrollTo({ top: nextDateIdx * ITEM_HEIGHT, behavior: 'smooth' });
      }
    }

    prevHourRef.current = newHour;
    setSelectedHour(newHour);

    // STRICT DATE-SCOPE: Only trigger snapback if on '오늘' (nextDateIdx === 0)
    if (nextDateIdx === 0) {
      const projected = constructDate(0, nextPeriod, newHour, selectedMinute, now);
      if (projected.getTime() < minAllowed.getTime()) {
        triggerRubberBandSnapback();
        return;
      }
    }

    haptics.lightTap();
  };

  const handleSelectMinuteIdx = (idx: number) => {
    const minute = minutesList[idx];
    setSelectedMinute(minute);

    // STRICT DATE-SCOPE: Only check past time if currently on '오늘' (selectedDateIdx === 0)
    if (selectedDateIdx === 0) {
      const projected = constructDate(0, selectedPeriod, selectedHour, minute, now);
      if (projected.getTime() < minAllowed.getTime()) {
        triggerRubberBandSnapback();
        return;
      }
    }

    haptics.lightTap();
  };

  // Bottom action: Confirm button (Strict Zero Silent Mutation - SSOT Principle)
  const handleConfirm = () => {
    const target = constructDate(
      datesList[selectedDateIdx].offsetDays,
      selectedPeriod,
      selectedHour,
      selectedMinute,
      new Date()
    );

    // If an invalid past time is reached on '오늘', do NOT mutate silently; rebound visibly first!
    if (selectedDateIdx === 0 && target.getTime() < minAllowed.getTime()) {
      triggerRubberBandSnapback();
      return;
    }

    // Submit EXACT value currently shown on the screen (Single Source of Truth)
    haptics.successPulse();
    onConfirm(target);
  };

  const periodIndex = Math.max(0, periodsList.indexOf(selectedPeriod));
  const hourIndex = Math.max(0, hoursList.indexOf(selectedHour));
  const minuteIndex = Math.max(0, minutesList.indexOf(selectedMinute));

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

        {/* 4-Column Wheel Picker with 3D Convex Cylinder Drum Interaction */}
        <div
          className={`relative my-6 px-1 h-[240px] flex items-center justify-center overflow-hidden transition-transform duration-200 ${
            isShaking ? 'translate-y-1.5' : ''
          }`}
          style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
        >
          {/* Subtle Ambient Glow Central Highlight Window across all 4 columns: exactly h-[48px] at top-[96px] */}
          <div className="absolute left-1 right-1 top-[96px] h-[48px] bg-slate-100/90 rounded-2xl pointer-events-none z-0 border border-blue-200/50 shadow-sm shadow-blue-500/10" />

          {/* Top Gradient Fade Mask for 3D depth */}
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white via-white/85 to-transparent pointer-events-none z-20" />

          {/* Bottom Gradient Fade Mask for 3D depth */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white via-white/85 to-transparent pointer-events-none z-20" />

          {/* 4 Completely Isolated Columns in 3D Perspective */}
          <div className="grid grid-cols-4 gap-1 w-full h-[240px] relative z-10">
            {/* Column 1: Date (오늘, 내일, 9월 22일 화 등) */}
            <CylinderColumn
              items={datesList}
              selectedIndex={selectedDateIdx}
              onSelect={handleSelectDateIdx}
              getLabel={(item) => item.label}
              colRef={dateColRef}
            />

            {/* Column 2: AM / PM (오전, 오후 - 100% Permanently Fixed Array, Zero Shaking) */}
            <CylinderColumn
              items={periodsList}
              selectedIndex={periodIndex}
              onSelect={handleSelectPeriodIdx}
              getLabel={(item) => item}
              colRef={periodColRef}
              isItemDisabled={(_, idx) => isPeriodDisabled(periodsList[idx])}
            />

            {/* Column 3: Hours (1 ~ 12) with Smart Rollover */}
            <CylinderColumn
              items={hoursList}
              selectedIndex={hourIndex}
              onSelect={handleSelectHourIdx}
              getLabel={(item) => `${item}시`}
              colRef={hourColRef}
              isItemDisabled={(_, idx) => isHourDisabled(hoursList[idx])}
            />

            {/* Column 4: Minutes in 10s (00 ~ 50) */}
            <CylinderColumn
              items={minutesList}
              selectedIndex={minuteIndex}
              onSelect={handleSelectMinuteIdx}
              getLabel={(item) => `${String(item).padStart(2, '0')}분`}
              colRef={minuteColRef}
              isItemDisabled={(_, idx) => isMinuteDisabled(minutesList[idx])}
            />
          </div>
        </div>

        {/* Bottom Action: Brand Cobalt Blue Confirm Button */}
        <button
          type="button"
          onClick={handleConfirm}
          className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-[#1650D6] active:bg-[#1244B8] active:scale-[0.98] text-white rounded-2xl font-bold text-base shadow-sm shadow-blue-500/20 flex items-center justify-center cursor-pointer transition-all duration-150 ease-out"
        >
          확인
        </button>
      </div>
    </div>
  );
};

