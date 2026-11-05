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
    <div className="fixed inset-0 z-[105] flex items-end justify-center bg-slate-900/30 sm:items-center sm:p-5"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="driver-picker-title"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] bg-white sm:max-h-[85vh] sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <div className="min-w-0">
            <h3 id="driver-picker-title" className="text-[17px] font-semibold tracking-tight text-slate-900">기사님 선택</h3>
            <p className="mt-1 truncate text-xs text-slate-500">
              {targetVehicleName}{targetDate ? ` · ${targetDate}` : ''}{targetTime ? ` ${targetTime}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="기사님 선택 닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="shrink-0 space-y-3 px-5 pb-4 sm:px-6">
          <div className="flex h-11 items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 focus-within:ring-1 focus-within:ring-slate-200">
            <Search className="h-[18px] w-[18px] shrink-0 text-slate-400" />
            <input ref={searchRef} type="search" autoComplete="off" value={search}
              onChange={(event) => setSearch(event.target.value)} placeholder="기사명, 소속, 연락처 검색"
              aria-label="기사님 검색"
              className="min-w-0 w-full bg-transparent text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400" />
            {search && (
              <button type="button" aria-label="검색어 지우기" onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                className="p-1 text-slate-400 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={onlyAvailable} onClick={() => setOnlyAvailable((value) => !value)}
              className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${onlyAvailable
                ? 'bg-slate-200/70 text-slate-800' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
              예약 가능
            </button>
            <button type="button" disabled={requiredLanguage === 'english'} aria-pressed={englishOnly}
              onClick={() => setEnglishOnly((value) => !value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${englishOnly
                ? 'bg-slate-200/70 text-slate-800' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'} disabled:cursor-default`}>
              <Globe2 className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.7} /> 영어 가능
            </button>
            <span className="ml-auto text-xs tabular-nums text-slate-400">{filteredDrivers.length}명</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-5">
          {hookDrivers.isLoading && propDrivers === undefined && !driversList.length ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 기사 프로필을 불러오고 있습니다.
            </div>
          ) : hookDrivers.error && propDrivers === undefined && !driversList.length ? (
            <p role="alert" className="py-14 text-center text-sm text-slate-500">{hookDrivers.error}</p>
          ) : filteredDrivers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <UserRound className="h-9 w-9 text-slate-300" strokeWidth={1.4} />
              <p className="text-sm font-medium text-slate-600">조건에 맞는 기사님이 없습니다.</p>
              <button type="button" onClick={() => { setSearch(''); setOnlyAvailable(false); if (requiredLanguage !== 'english') setEnglishOnly(false); }}
                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100">전체 기사 보기</button>
            </div>
          ) : filteredDrivers.map((driver) => {
            const active = selectedDriverId === driver.id;
            const english = driverSupportsEnglish(driver);
            const blocked = isExcluded(driver.id);
            const canChoose = driver.isAvailable && !blocked;
            return (
              <button key={driver.id} type="button" onClick={() => setSelectedDriverId(driver.id)}
                aria-pressed={active} disabled={!canChoose}
                className={`flex min-h-[92px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors sm:px-4 ${active
                  ? 'bg-slate-100/80' : 'hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-55`}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-50">
                  {driver.avatarUrl
                    ? <img src={driver.avatarUrl} alt={driver.name} className="h-full w-full object-cover" loading="lazy" />
                    : <UserRound className="h-6 w-6 text-slate-300" strokeWidth={1.4} aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-900">{driver.name} 기사님</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{driver.affiliation || '소속 미등록'} · {driver.residence || '거주지 미등록'}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span>한국어{english ? ' · 영어 가능' : ''}</span>
                    {typeof driver.careerYears === 'number' && driver.careerYears > 0 && <span>경력 {driver.careerYears}년</span>}
                    {blocked ? <span>다른 호차에 배정됨</span> : !driver.isAvailable ? <span>해당 일정 배정 불가</span> : null}
                  </div>
                </div>
                {active && <Check className="h-4 w-4 shrink-0 text-slate-600" aria-label="선택한 기사님" />}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose}
            className="min-h-11 flex-1 rounded-xl bg-slate-50 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">
            취소
          </button>
          <button type="button" disabled={!canConfirm}
            onClick={() => {
              if (!selected || !canConfirm) return;
              haptics.success();
              onSelectDriver(selected);
              onClose();
            }}
            className="min-h-11 flex-[1.6] rounded-xl bg-[#1E60F3] text-sm font-semibold text-white transition-colors hover:bg-[#1855DB] disabled:bg-slate-200 disabled:text-slate-500">
            기사님 선택 완료
          </button>
        </div>
      </section>
    </div>
  );
};
