'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface HqSearchSelectOption {
  value: string;
  label: string;
  subtitle?: string;
  imageSrc?: string;
  status?: string;
  disabled?: boolean;
  category?: string;
}

export interface HqSearchSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: HqSearchSelectOption[];
  placeholder: string;
  emptyLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  categoryOptions?: Array<{ value: string; label: string }>;
  imageShape?: 'circle' | 'vehicle';
}

/**
 * Shared HQ selectable dropdown for filters and detailed allocation.
 * All menu entries are actual buttons; disabled options cannot be selected.
 * Visuals match the A-plan Quick Dispatch white/search/image/selected pattern.
 */
export function HqSearchSelect({
  label, value, onChange, options, placeholder, emptyLabel,
  disabled = false, size = 'md', categoryOptions, imageShape = 'circle',
}: HqSearchSelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const selected = options.find(item => item.value === value);
  const filtered = useMemo(() => options.filter(item => {
    const text = `${item.label} ${item.subtitle || ''} ${item.status || ''}`.toLowerCase();
    return text.includes(search.trim().toLowerCase()) &&
      (category === 'all' || item.category === category);
  }), [options, search, category]);

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const onOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setSearch('');
    setCategory('all');
  };

  return (
    <div className="relative min-w-0" ref={root}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => {
          setSearch('');
          setCategory('all');
          setOpen(current => !current);
        }}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-[13px] text-left font-semibold text-[#52647A] transition-colors hover:bg-[#F0F3F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20 disabled:opacity-50 ${size === 'sm'
          ? 'min-h-10 bg-[#F7F9FC] px-3 text-[12px]'
          : 'min-h-12 bg-white px-3.5 text-[13px] shadow-[0_4px_14px_rgba(35,49,78,0.045)]'} ${open ? 'ring-1 ring-[#1E60F3]/35' : ''}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.imageSrc && <img src={selected.imageSrc} alt="" className={imageShape === 'vehicle'
            ? 'h-8 w-12 shrink-0 object-contain'
            : 'size-8 shrink-0 rounded-full object-cover'} />}
          <span className="min-w-0 truncate">{selected?.label || (value || placeholder)}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-[#94A1B2] transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && (
        <div id={id} role="listbox" aria-label={label}
          className="relative z-[80] mt-2 w-full min-w-0 max-w-[520px] rounded-[17px] bg-white p-2 shadow-[0_12px_35px_rgba(35,49,78,0.12)]">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9BA7B7]"/>
            <input ref={searchInput} type="search" aria-label={`${label} 검색`}
              value={search} onChange={event => setSearch(event.target.value)}
              placeholder="이름 또는 번호 검색"
              className="min-h-10 w-full rounded-[11px] bg-[#F7F9FC] py-2 pl-9 pr-8 text-[12px] font-medium text-[#17233B] outline-none focus:ring-2 focus:ring-[#1E60F3]/15"/>
            {search && <button type="button" onClick={() => setSearch('')} aria-label="검색 지우기"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A1B2]"><X size={14}/></button>}
          </div>
          {categoryOptions && (
            <div className="flex flex-wrap gap-1 py-2">
              {[{ value: 'all', label: '전체' }, ...categoryOptions].map(item => (
                <button key={item.value} type="button" onClick={() => setCategory(item.value)}
                  aria-pressed={category === item.value}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${category === item.value ? 'bg-[#1E60F3] text-white' : 'text-[#73839D] hover:bg-[#F3F5F9]'}`}>{item.label}</button>
              ))}
            </div>
          )}
          <div className="mt-1 max-h-60 space-y-0.5 overflow-y-auto overscroll-contain">
            {emptyLabel && (
              <button type="button" role="option" aria-selected={!value}
                onClick={() => choose('')}
                className={`flex min-h-10 w-full items-center justify-between rounded-[11px] px-3 text-left text-[12px] font-medium ${!value ? 'bg-[#EEF3FF] text-[#1E60F3]' : 'text-[#728098] hover:bg-[#F7F9FC]'}`}>
                {emptyLabel}{!value && <Check size={14}/>}
              </button>
            )}
            {filtered.length === 0 && <p className="p-4 text-center text-[12px] text-[#8D9BAD]">검색 결과가 없습니다.</p>}
            {filtered.map(item => (
              <button key={item.value} type="button" role="option" aria-selected={item.value === value}
                disabled={item.disabled}
                title={item.disabled ? item.status || '선택할 수 없습니다' : undefined}
                onClick={() => choose(item.value)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[11px] px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${item.value === value ? 'bg-[#EEF3FF]' : 'hover:bg-[#F7F9FC]'}`}>
                <span className="flex min-w-0 items-center gap-2.5">
                  {item.imageSrc && <img src={item.imageSrc} alt="" className={imageShape === 'vehicle'
                    ? 'h-9 w-14 shrink-0 object-contain'
                    : 'size-9 shrink-0 rounded-full object-cover'}/>}
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[#253552]">{item.label}</span>
                    {item.subtitle && <span className="mt-0.5 block truncate text-[11px] text-[#8492A4]">{item.subtitle}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {item.status && <span className="text-[10px] text-[#8290A3]">{item.status}</span>}
                  {item.value === value && <Check size={15} className="text-[#1E60F3]"/>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
