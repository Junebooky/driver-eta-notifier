'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Check, Loader2, Globe2, UserRound } from 'lucide-react';
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
}

export const HqDriverSelectModal: React.FC<HqDriverSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectDriver,
  targetVehicleName = '차량 미지정',
  targetDate = '',
  targetTime = '',
  initialDriverId = '',
  requiredLanguage = 'any',
  drivers: propDrivers,
}) => {
  const hookDrivers = useHqDrivers();
  const driversList: (AvailableDriverItem | HqDriverSummary)[] = propDrivers?.length ? propDrivers : hookDrivers.drivers;
  const [search, setSearch] = useState('');
  const [englishOnly, setEnglishOnly] = useState(requiredLanguage === 'english');
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [selectedDriverId, setSelectedDriverId] = useState(initialDriverId);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    setSelectedDriverId(initialDriverId || '');
    setEnglishOnly(requiredLanguage === 'english');
    setSearch('');
  }, [isOpen, initialDriverId, requiredLanguage]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const q = search.trim().toLowerCase();
  const filteredDrivers = driversList.filter((driver) => {
    if (onlyAvailable && !driver.isAvailable) return false;
    if ((requiredLanguage === 'english' || englishOnly) && !driverSupportsEnglish(driver)) return false;
    if (q && ![driver.name, driver.affiliation || '', driver.residence || '', driver.phone || '']
      .some((value) => value.toLowerCase().includes(q))) return false;
    return true;
  });
  const selected = driversList.find((driver) => driver.id === selectedDriverId);
  const canConfirm = Boolean(selected?.isAvailable && (requiredLanguage !== 'english' || driverSupportsEnglish(selected)));

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/35 sm:items-center sm:p-5"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="driver-picker-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white sm:max-h-[85vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 id="driver-picker-title" className="text-base font-semibold tracking-tight text-slate-900">기사님 선택</h3>
            <p className="mt-1 truncate text-xs text-slate-500">
              {targetVehicleName}{targetDate ? ` · ${targetDate}` : ''}{targetTime ? ` ${targetTime}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 space-y-3 px-5 py-4">
          <label className="flex h-11 items-center gap-2 rounded-xl bg-slate-50 px-3">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="기사명·소속 검색" aria-label="기사 검색"
              className="min-w-0 w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setOnlyAvailable((value) => !value)}
              className={`rounded-lg px-3 py-2 text-xs font-medium ${onlyAvailable ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500'}`}>
              가용 기사만
            </button>
            <button type="button" disabled={requiredLanguage === 'english'}
              onClick={() => setEnglishOnly((value) => !value)}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium ${englishOnly ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500'} disabled:cursor-default`}>
              <Globe2 className="h-3.5 w-3.5" /> 영어 가능
            </button>
            <span className="ml-auto text-xs text-slate-400">{filteredDrivers.length}명</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4 sm:px-5">
          {hookDrivers.isLoading && !driversList.length && (
            <div className="flex items-center justify-center gap-2 p-10 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 기사 정보 확인 중
            </div>
          )}
          {!hookDrivers.isLoading && filteredDrivers.length === 0 && (
            <p className="py-14 text-center text-sm text-slate-500">조건에 맞는 기사님이 없습니다.</p>
          )}
          {filteredDrivers.map((driver) => {
            const active = selectedDriverId === driver.id;
            const english = driverSupportsEnglish(driver);
            return (
              <button key={driver.id} type="button" onClick={() => setSelectedDriverId(driver.id)}
                disabled={!driver.isAvailable}
                className={`flex w-full min-h-20 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? 'bg-slate-100' : 'hover:bg-slate-50'} disabled:opacity-45`}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-medium text-slate-500">
                  {driver.avatarUrl
                    ? <img src={driver.avatarUrl} alt={driver.name} className="h-full w-full object-cover" />
                    : <UserRound className="h-6 w-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{driver.name} 기사님</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{driver.affiliation || '소속 미등록'} · {driver.residence || '거주지 미등록'}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span>한국어{english ? ' · 영어 가능' : ''}</span>
                    {typeof driver.careerYears === 'number' && <span>경력 {driver.careerYears}년</span>}
                    {typeof driver.rating === 'number' && driver.rating > 0 && <span>평점 {driver.rating.toFixed(1)}</span>}
                  </div>
                </div>
                {active && <Check className="h-5 w-5 shrink-0 text-slate-700" />}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white px-5 py-4">
          <button type="button" onClick={onClose}
            className="min-h-11 flex-1 rounded-xl bg-slate-50 text-sm font-medium text-slate-600 hover:bg-slate-100">취소</button>
          <button type="button" disabled={!canConfirm}
            onClick={() => {
              if (!selected || !canConfirm) return;
              haptics.success();
              onSelectDriver(selected);
              onClose();
            }}
            className="min-h-11 flex-[1.5] rounded-xl bg-[#1E60F3] text-sm font-semibold text-white hover:bg-[#1855DB] disabled:bg-slate-200 disabled:text-slate-500">
            기사님 선택 완료
          </button>
        </div>
      </section>
    </div>
  );
};
