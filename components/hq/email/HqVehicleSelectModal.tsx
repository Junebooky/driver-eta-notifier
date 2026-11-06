'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CarFront, Check, Loader2, Search, X } from 'lucide-react';
import type { AvailableVehicleItem } from '@/utils/availabilityEngine';
import { VIP_REAL_VEHICLES, getVehicleImage } from '@/utils/vehicleData';

type Category = 'all' | AvailableVehicleItem['uiCategory'];

const FILTERS: { key: Category; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'sedan', label: '세단' },
  { key: 'suv', label: 'SUV' },
  { key: 'van', label: '밴' },
  { key: 'sprinter', label: '스프린터' },
];

const normalized = (value?: string | null) =>
  (value || '').normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase();

export const getVerifiedVehiclePhoto = (plate?: string): string => {
  const vehicle = VIP_REAL_VEHICLES.find((item) => normalized(item.plate) === normalized(plate));
  // Never use old screenshot thumbnails or a different vehicle's image.
  return vehicle?.imageUrl && !/\/thumb_|\/car_phone_|\/car_g90|\/car_sprinter/i.test(vehicle.imageUrl)
    ? getVehicleImage(vehicle)
    : '/images/vehicle_photo_pending.svg';
};

export interface HqVehicleSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles?: AvailableVehicleItem[];
  loading: boolean;
  error?: string;
  slotNumber: number;
  selectedPlate?: string;
  excludedPlates?: string[];
  onSelect: (vehicle: AvailableVehicleItem) => void;
}

export const HqVehicleSelectModal: React.FC<HqVehicleSelectModalProps> = ({
  isOpen, onClose, vehicles, loading, error, slotNumber, selectedPlate, excludedPlates = [], onSelect,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [availableOnly, setAvailableOnly] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setCategory('all');
    setAvailableOnly(true);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const needle = normalized(query);
    return (vehicles || [])
      .filter((vehicle) => {
        const reserved = excludedPlates.some((plate) => normalized(plate) === normalized(vehicle.plate));
        if (category !== 'all' && vehicle.uiCategory !== category) return false;
        if (availableOnly && (!vehicle.isAvailable || reserved)) return false;
        const known = VIP_REAL_VEHICLES.find((item) => normalized(item.plate) === normalized(vehicle.plate));
        const words = [vehicle.model, vehicle.plate, vehicle.capacity, known?.modelShort, known?.plateShort, known?.categoryLabel];
        return !needle || words.some((word) => normalized(word).includes(needle));
      })
      .sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable) || a.model.localeCompare(b.model, 'ko') || a.plate.localeCompare(b.plate, 'ko'));
  }, [vehicles, query, category, availableOnly, excludedPlates]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="hq-vehicle-picker-title"
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
        
        {/* Search & Filters Header */}
        <div className="shrink-0 space-y-3.5 p-5 pb-3 sm:p-6 sm:pb-3.5">
          {/* Search Box */}
          <div className="flex h-12 items-center gap-3 rounded-2xl bg-slate-50/80 border border-slate-200/70 px-4 focus-within:bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="차종, 차량번호 검색"
              aria-label="차량 검색"
              className="min-w-0 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
            />
            {query && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar" role="group" aria-label="차종 필터">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={category === item.key}
                onClick={() => setCategory(item.key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  category === item.key
                    ? 'bg-blue-100/70 text-[#1E60F3] shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Availability Checkbox & Count */}
          <div className="flex items-center justify-between gap-3 text-xs pt-1">
            <button
              type="button"
              aria-pressed={availableOnly}
              onClick={() => setAvailableOnly((value) => !value)}
              className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer select-none"
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
                availableOnly ? 'bg-[#1E60F3] text-white' : 'border border-slate-300 bg-white'
              }`}>
                {availableOnly && <Check className="h-3 w-3 stroke-[3]" />}
              </span>
              <span>예약 가능한 차량만</span>
            </button>
            <span className="tabular-nums text-xs font-bold text-slate-400">{filtered.length}대</span>
          </div>
        </div>

        {/* Vehicle List */}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          {loading && !vehicles?.length ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500 font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-[#1E60F3]" /> 차량 가용성을 확인하고 있습니다.
            </div>
          ) : error && !vehicles?.length ? (
            <div role="alert" className="py-16 text-center text-sm font-medium text-slate-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <CarFront className="h-10 w-10 text-slate-300" strokeWidth={1.4} />
              <p className="text-sm font-bold text-slate-600">조건에 맞는 차량이 없습니다.</p>
              <button
                type="button"
                onClick={() => { setQuery(''); setCategory('all'); setAvailableOnly(false); }}
                className="rounded-xl px-4 py-2 text-xs font-bold text-[#1E60F3] bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
              >
                전체 차량 보기
              </button>
            </div>
          ) : filtered.map((vehicle) => {
            const known = VIP_REAL_VEHICLES.find((item) => normalized(item.plate) === normalized(vehicle.plate));
            const selected = normalized(vehicle.plate) === normalized(selectedPlate);
            const reserved = excludedPlates.some((plate) => normalized(plate) === normalized(vehicle.plate));
            const canChoose = vehicle.isAvailable && !reserved && !loading;
            const availabilityLabel = reserved ? '다른 호차에 배정됨'
              : vehicle.isAvailable ? '예약 가능'
              : vehicle.unavailabilityReason || (vehicle.requestedIntervalStatus === 'maintenance' ? '정비 중' : '예약 불가');

            return (
              <button
                key={vehicle.uuid || vehicle.plate}
                type="button"
                disabled={!canChoose}
                aria-pressed={selected}
                onClick={() => onSelect(vehicle)}
                className={`flex w-full items-center justify-between rounded-2xl p-3.5 text-left transition-all cursor-pointer ${
                  selected
                    ? 'bg-blue-50/70 border border-blue-200/80 shadow-2xs'
                    : 'border-b border-slate-100/80 last:border-b-0 hover:bg-slate-50/80'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Vehicle Icon / Photo */}
                  <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white border border-slate-100">
                    {selected ? (
                      <CarFront className="h-6 w-6 text-[#1E60F3] stroke-[1.8]" />
                    ) : (
                      <img
                        src={getVerifiedVehiclePhoto(vehicle.plate)}
                        alt={known?.model || vehicle.model}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">
                      {known?.modelShort || vehicle.model}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                      {vehicle.plate} · {known?.capacity || vehicle.capacity}
                    </p>
                    <p className={`mt-0.5 text-[11px] font-bold ${selected || vehicle.isAvailable ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {availabilityLabel}
                    </p>
                  </div>
                </div>

                {selected ? (
                  <Check className="h-5 w-5 shrink-0 text-[#1E60F3] stroke-[2.5]" aria-label="선택한 차량" />
                ) : canChoose ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Footer info text */}
        <div className="shrink-0 border-t border-slate-100 py-3.5 text-center text-xs font-medium text-slate-400">
          실제 차량 가용성 기준 · 선택하면 배정 카드에 반영됩니다.
        </div>
      </section>
    </div>
  );
};
