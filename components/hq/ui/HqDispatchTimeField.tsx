'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Clock } from 'lucide-react';

interface HqDispatchTimeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  parseInput: (raw: string) => string | null;
  formatValue: (value: string) => string;
  disabled?: boolean;
  compact?: boolean;
  required?: boolean;
}

/**
 * Shared HQ dispatch time control: keyboard input + an explicit, always-visible
 * dropdown trigger. Does not depend on browser-native <input type="time"> UI.
 * The dropdown is in document flow so scrollable HQ modals cannot clip it.
 */
export function HqDispatchTimeField({
  label, value, onChange, parseInput, formatValue, disabled = false, compact = false, required = false,
}: HqDispatchTimeFieldProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!opened) setDraft(value);
  }, [opened, value]);

  useEffect(() => {
    if (!opened) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // Both HQ time lists can stay open together. Only clicks outside
      // all time fields should dismiss an open list.
      if (!rootRef.current?.contains(event.target as Node)
        && !target?.closest('[data-hq-dispatch-time]')) {
        setOpened(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpened(false);
        setDraft(value);
        setInvalid(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [opened, value]);

  useEffect(() => {
    if (!opened) return;
    const active = listRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [opened]);

  const options = useMemo(() => {
    const steps = Array.from({ length: 48 }, (_, i) =>
      `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
    if (value && !steps.includes(value)) steps.push(value);
    return steps.sort();
  }, [value]);

  const choose = (next: string) => {
    onChange(next);
    setDraft(next);
    setInvalid(false);
    setOpened(false);
  };

  const commitTyped = () => {
    const parsed = parseInput(draft);
    if (parsed) {
      onChange(parsed);
      setDraft(parsed);
      setInvalid(false);
    } else if (draft.trim()) {
      setInvalid(true);
    } else {
      setDraft(value);
      setInvalid(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={compact
        ? 'relative min-w-0 self-start'
        : 'min-w-0 self-start rounded-[20px] bg-white p-4 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-5'}
      data-hq-dispatch-time={label}
    >
      <div className={compact ? 'flex items-end gap-2' : 'flex items-center gap-3'}>
        {!compact && <Clock aria-hidden="true" className="h-5 w-5 shrink-0 text-[#8290A1]" strokeWidth={1.8} />}
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className={compact ? 'mb-1.5 block text-xs font-bold text-[#17233B]' : 'block text-[12px] font-medium text-[#73839D]'}>
            {label}{required && <span className="ml-0.5 text-[#1E60F3]"> *</span>}
          </label>
          <input
            id={id}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            placeholder="예: 09:00"
            aria-label={`${label} 직접 입력`}
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-controls={opened ? `${id}-options` : undefined}
            disabled={disabled}
            onFocus={() => { setOpened(true); setInvalid(false); }}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              setInvalid(false);
              // Keep valid HH:mm edits synced even before the input loses focus.
              if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next)) onChange(next);
            }}
            onBlur={commitTyped}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTyped();
                if (parseInput(draft)) setOpened(false);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpened(false);
                setDraft(value);
                setInvalid(false);
                event.currentTarget.blur();
              }
            }}
            className={compact
              ? 'h-11 w-full min-w-0 rounded-[13px] bg-white px-3 text-[14px] font-semibold tabular-nums text-[#17233B] shadow-[0_4px_14px_rgba(35,49,78,0.045)] outline-none placeholder:text-[#9AA6B6] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12'
              : 'mt-1.5 min-h-9 w-full min-w-0 rounded-[12px] bg-[#FAFBFD] px-3 text-[14px] font-semibold tabular-nums text-[#17233B] outline-none placeholder:text-[#9AA6B6] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 disabled:cursor-not-allowed disabled:opacity-50'}
          />
        </div>
        <button
          type="button"
          aria-label={`${label} 목록 열기`}
          aria-expanded={opened}
          aria-controls={`${id}-options`}
          disabled={disabled}
          onClick={() => { setOpened(prev => !prev); setInvalid(false); }}
          className={`flex shrink-0 items-center justify-center rounded-[13px] bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EEF3FF] hover:text-[#1E60F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 disabled:opacity-40 ${compact ? 'size-11 sm:size-12' : 'size-10'}`}
        >
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${opened ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {invalid && <p role="alert" className="mt-2 text-[11px] font-medium text-[#A34E45]">시간을 확인해 주세요. 예: 09:15, 오후 2:30</p>}
      {opened && !disabled && (
        <div id={`${id}-options`} role="group" aria-label={`${label} 선택`}
          className="relative z-20 mt-3 rounded-[16px] bg-[#FAFBFD] p-2 shadow-[0_4px_14px_rgba(35,49,78,0.04)]">
          <p className="px-2 pb-2 text-[11px] font-medium text-[#8492A4]">
            직접 입력하거나 아래 시간을 선택해 주세요.
          </p>
          <div ref={listRef} className="flex max-h-56 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
            {options.map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={value === option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                className={`flex min-h-11 w-full shrink-0 items-center justify-between rounded-[12px] px-3.5 text-left text-[14px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 ${value === option
                  ? 'bg-[#EEF3FF] text-[#1E60F3]'
                  : 'bg-white text-[#52647A] hover:bg-[#F0F3F8]'}`}
              >
                <span>{option}</span>
                {value === option && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
          {value && <p className="px-2 pt-2 text-[11px] text-[#8A97A7]">선택 시간: {formatValue(value)}</p>}
        </div>
      )}
    </div>
  );
}
