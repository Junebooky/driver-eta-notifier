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
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/30 sm:items-center sm:p-5"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="hq-vehicle-picker-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] bg-white sm:max-h-[84vh] sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div className="min-w-0">
            <h3 id="hq-vehicle-picker-title" className="text-[17px] font-semibold tracking-tight text-slate-900">
              {slotNumber}호차 선택
            </h3>
            <p className="mt-1 text-xs text-slate-500">차량관리 등록 정보와 전체 운행 일정의 가용성을 확인합니다.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="차량 선택 닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="shrink-0 space-y-3 px-5 pb-4 sm:px-6">
          <div className="flex h-11 items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 focus-within:ring-1 focus-within:ring-slate-200">
            <Search className="h-[18px] w-[18px] shrink-0 text-slate-400" />
            <input ref={searchRef} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="차종, 차량번호 검색" aria-label="차량 검색"
              className="min-w-0 w-full bg-transparent text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400" />
            {query && (
              <button type="button" aria-label="검색어 지우기" onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                className="p-1 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="차종 필터">
            {FILTERS.map((item) => (
              <button key={item.key} type="button" aria-pressed={category === item.key}
                onClick={() => setCategory(item.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${category === item.key
                  ? 'bg-slate-200/70 text-slate-800'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <button type="button" aria-pressed={availableOnly} onClick={() => setAvailableOnly((value) => !value)}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-800">
              <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${availableOnly
                ? 'border-slate-500 bg-slate-500 text-white' : 'border-slate-300 bg-white'}`}>
                {availableOnly && <Check className="h-3 w-3" strokeWidth={2.5} />}
              </span>
              예약 가능한 차량만
            </button>
            <span className="tabular-nums text-slate-400">{filtered.length}대</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-5">
          {loading && !vehicles?.length ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 차량 가용성을 확인하고 있습니다.
            </div>
          ) : error && !vehicles?.length ? (
            <div role="alert" className="py-16 text-center text-sm text-slate-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <CarFront className="h-9 w-9 text-slate-300" strokeWidth={1.4} />
              <p className="text-sm font-medium text-slate-600">조건에 맞는 차량이 없습니다.</p>
              <button type="button" onClick={() => { setQuery(''); setCategory('all'); setAvailableOnly(false); }}
                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100">전체 차량 보기</button>
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
              <button key={vehicle.uuid || vehicle.plate} type="button" disabled={!canChoose}
                aria-pressed={selected} onClick={() => onSelect(vehicle)}
                className={`flex min-h-[92px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors sm:px-4 ${selected
                  ? 'bg-slate-100/80' : 'hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-55`}>
                <div className="flex h-[68px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 sm:w-[104px]">
                  <img src={getVerifiedVehiclePhoto(vehicle.plate)} alt={known?.model || vehicle.model}
                    className="h-full w-full object-contain" loading="lazy" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-900">{known?.modelShort || vehicle.model}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{vehicle.plate} · {known?.capacity || vehicle.capacity}</p>
                  <p className={`mt-1.5 text-[11px] ${canChoose ? 'text-slate-500' : 'text-slate-400'}`}>{availabilityLabel}</p>
                </div>
                {selected
                  ? <Check className="h-4 w-4 shrink-0 text-slate-600" aria-label="선택한 차량" />
                  : canChoose ? <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" /> : null}
              </button>
            );
          })}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-5 py-3 text-center text-[11px] text-slate-400 sm:px-6">
          실제 차량 가용성 기준 · 선택하면 배정 카드에 반영됩니다.
        </div>
      </section>
    </div>
  );
};
