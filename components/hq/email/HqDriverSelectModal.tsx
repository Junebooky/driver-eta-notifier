'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Check, Loader2, Globe2, UserRound, Phone } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { HqDriverSummary } from '@/types/driverHq';
import { useHqDrivers } from '@/utils/useHqDrivers';

export interface AvailableDriverItem {
  id: string;
  name: string;
  rating?: number;
  reviewCount?: number;
  flags: string[];
  languages: ('ko' | 'en' | 'ja' | string)[];
  languageLabels?: string[];
  affiliation: string;
  careerYears?: number;
  residence: string;
  avatarUrl?: string;
  recentTrips?: { date: string; route: string }[];
  isAvailable: boolean;
  phone?: string;
  plate?: string;
  vehicleModel?: string;
  englishAvailable?: boolean;
}

export function driverSupportsEnglish(driver?: AvailableDriverItem | HqDriverSummary | null): boolean {
  if (!driver) return false;
  if ('englishAvailable' in driver && driver.englishAvailable) return true;
  if (!driver.languages) return false;
  return driver.languages.some(
    (l) => l.toLowerCase() === 'en' || l.includes('영어') || l.toLowerCase() === 'english'
  );
}

export interface HqDriverSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDriver: (driver: AvailableDriverItem | HqDriverSummary) => void;
  targetVehicleName?: string;
  targetDate?: string;
  targetTime?: string;
  initialDriverId?: string;
  requiredLanguage?: 'any' | 'english';
  drivers?: (AvailableDriverItem | HqDriverSummary)[];
  excludedDriverIds?: string[];
}

export const HqDriverSelectModal: React.FC<HqDriverSelectModalProps> = ({
  isOpen, onClose, onSelectDriver, targetVehicleName = '차량 미지정',
  targetDate = '', targetTime = '', initialDriverId = '', requiredLanguage = 'any',
  drivers: propDrivers, excludedDriverIds = [],
}) => {
  const hookDrivers = useHqDrivers();
  // An explicitly empty availability list MUST remain empty: do not fall back to all HQ drivers.
  const driversList: (AvailableDriverItem | HqDriverSummary)[] =
    propDrivers !== undefined ? propDrivers : hookDrivers.drivers;
  const [search, setSearch] = useState('');
  const [englishOnly, setEnglishOnly] = useState(requiredLanguage === 'english');
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [selectedDriverId, setSelectedDriverId] = useState(initialDriverId);
  const onCloseRef = useRef(onClose);
  const searchRef = useRef<HTMLInputElement>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    setSelectedDriverId(initialDriverId || '');
    setEnglishOnly(requiredLanguage === 'english');
    setOnlyAvailable(true);
    setSearch('');
  }, [isOpen, initialDriverId, requiredLanguage]);

  useEffect(() => {
    if (!isOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const q = search.trim().toLocaleLowerCase();
  const isExcluded = (id: string) => excludedDriverIds.includes(id);
  const filteredDrivers = driversList.filter((driver) => {
    if (onlyAvailable && (!driver.isAvailable || isExcluded(driver.id))) return false;
    if ((requiredLanguage === 'english' || englishOnly) && !driverSupportsEnglish(driver)) return false;
    if (q && ![driver.name, driver.affiliation || '', driver.residence || '', driver.phone || '', driver.vehicleModel || '']
      .some((word) => word.toLocaleLowerCase().includes(q))) return false;
    return true;
  }).sort((a,b) => Number(b.isAvailable) - Number(a.isAvailable) || a.name.localeCompare(b.name, 'ko'));
  const selected = driversList.find((driver) => driver.id === selectedDriverId);
  const canConfirm = Boolean(selected?.isAvailable && !isExcluded(selected.id) &&
    (requiredLanguage !== 'english' || driverSupportsEnglish(selected)) &&
    (!englishOnly || driverSupportsEnglish(selected)));

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-picker-title"
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="shrink-0 p-5 pb-3 sm:p-6 sm:pb-3.5 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="driver-picker-title" className="text-lg font-bold tracking-tight text-slate-900">
                기사님 선택
              </h3>
              <p className="mt-0.5 truncate text-xs text-slate-400 font-medium">
                {targetVehicleName}{targetDate ? ` · ${targetDate}` : ''}{targetTime ? ` ${targetTime}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="기사님 선택 닫기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search Box */}
          <div className="flex h-12 items-center gap-3 rounded-2xl bg-slate-50/80 border border-slate-200/70 px-4 focus-within:bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="기사명, 소속, 연락처 검색"
              aria-label="기사님 검색"
              className="min-w-0 w-full bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Chips & Count */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={onlyAvailable}
                onClick={() => setOnlyAvailable((value) => !value)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
                  onlyAvailable
                    ? 'bg-blue-100/70 text-[#1E60F3]'
                    : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
                }`}
              >
                예약 가능
              </button>
              <button
                type="button"
                disabled={requiredLanguage === 'english'}
                aria-pressed={englishOnly}
                onClick={() => setEnglishOnly((value) => !value)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
                  englishOnly
                    ? 'bg-blue-100/70 text-[#1E60F3]'
                    : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
                } disabled:cursor-default disabled:opacity-50`}
              >
                <Globe2 className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.8} />
                영어 가능
              </button>
            </div>
            <span className="text-xs font-bold tabular-nums text-slate-400">
              {filteredDrivers.length}명
            </span>
          </div>
        </div>

        {/* Drivers List */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          {hookDrivers.isLoading && propDrivers === undefined && !driversList.length ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#1E60F3]" /> 기사 프로필을 불러오고 있습니다.
            </div>
          ) : hookDrivers.error && propDrivers === undefined && !driversList.length ? (
            <p role="alert" className="py-14 text-center text-sm text-slate-500">{hookDrivers.error}</p>
          ) : filteredDrivers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <UserRound className="h-10 w-10 text-slate-300" strokeWidth={1.4} />
              <p className="text-sm font-semibold text-slate-600">조건에 맞는 기사님이 없습니다.</p>
              <button
                type="button"
                onClick={() => { setSearch(''); setOnlyAvailable(false); if (requiredLanguage !== 'english') setEnglishOnly(false); }}
                className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                전체 기사 보기
              </button>
            </div>
          ) : (
            filteredDrivers.map((driver) => {
              const active = selectedDriverId === driver.id;
              const english = driverSupportsEnglish(driver);
              const blocked = isExcluded(driver.id);
              const canChoose = driver.isAvailable && !blocked;

              return (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() => {
                    if (canChoose) setSelectedDriverId(driver.id);
                  }}
                  aria-pressed={active}
                  disabled={!canChoose}
                  className={`group relative flex w-full items-center justify-between rounded-2xl p-3.5 sm:p-4 text-left transition-all ${
                    active
                      ? 'bg-blue-50/70 border border-blue-200/80 shadow-xs'
                      : 'border border-transparent hover:bg-slate-50/90'
                  } disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`flex h-13 w-13 sm:h-14 sm:w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ${
                      active ? 'ring-2 ring-blue-400 shadow-2xs' : 'ring-1 ring-slate-200/70'
                    }`}>
                      {driver.avatarUrl ? (
                        <img src={driver.avatarUrl} alt={driver.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <UserRound className="h-6 w-6 text-slate-400" strokeWidth={1.5} aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                        {driver.name} 기사님
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 font-medium">
                        소속 · {driver.affiliation || driver.residence || '소속 미등록'}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 font-medium">
                        <span>한국어{english ? ' · 영어 가능' : ''}</span>
                        {typeof driver.careerYears === 'number' && driver.careerYears > 0 && (
                          <span>· 경력 {driver.careerYears}년</span>
                        )}
                        {blocked ? (
                          <span className="font-bold text-rose-500">· 배정 불가</span>
                        ) : !driver.isAvailable ? (
                          <span className="text-slate-400">· 일정 불가</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {active && (
                    <Check className="h-5 w-5 text-[#1E60F3] stroke-[2.5] shrink-0 ml-3" aria-label="선택한 기사님" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer Buttons */}
        <div className="shrink-0 p-4 sm:p-5 pt-3 border-t border-slate-100 flex items-center gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-700 font-bold text-sm transition-all cursor-pointer text-center"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!selected || !canConfirm) return;
              haptics.success();
              onSelectDriver(selected);
              onClose();
            }}
            className="w-2/3 py-3.5 rounded-2xl bg-[#1E60F3] hover:bg-blue-600 active:scale-98 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:bg-blue-200 disabled:shadow-none disabled:cursor-not-allowed text-center"
          >
            기사님 선택 완료
          </button>
        </div>
      </section>
    </div>
  );
};
