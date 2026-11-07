'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Check, Loader2, Globe2, UserRound, Phone, ChevronLeft, ChevronRight } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { HqDriverSummary } from '@/types/driverHq';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { DRIVERS_PER_PAGE, paginateDriverItems } from '@/utils/driverPickerPagination';

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
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [englishOnly, setEnglishOnly] = useState(requiredLanguage === 'english');
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [selectedDriverId, setSelectedDriverId] = useState(initialDriverId);
  const onCloseRef = useRef(onClose);
  const searchRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedDriverId(initialDriverId || '');
    setEnglishOnly(requiredLanguage === 'english');
    setOnlyAvailable(true);
    setSearch('');
  }, [isOpen, initialDriverId, requiredLanguage]);

  // Filters only change the visible list, never the dialog's height.
  useEffect(() => {
    setCurrentPage(0);
    if (pagesRef.current) pagesRef.current.scrollLeft = 0;
  }, [isOpen, search, englishOnly, onlyAvailable]);

  // Open on the page containing the current driver assignment, if present.
  // Keep the current assignment visible, even when it is driver #5 or later.
  useEffect(() => {
    if (!isOpen || !mounted) return;
    const matchingDrivers = driversList.filter(driver =>
      driver.isAvailable && !excludedDriverIds.includes(driver.id) &&
      (requiredLanguage !== 'english' || driverSupportsEnglish(driver))
    ).sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable) || a.name.localeCompare(b.name, 'ko'));
    const selectedIndex = matchingDrivers.findIndex(driver => driver.id === initialDriverId);
    const target = selectedIndex < 0 ? 0 : Math.floor(selectedIndex / DRIVERS_PER_PAGE);
    setCurrentPage(target);
    if (pagesRef.current) pagesRef.current.scrollLeft = target * pagesRef.current.clientWidth;
  // Intentionally initialize for each opened booking. Active filters reset separately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mounted, initialDriverId, driversList.length]);

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

  if (!isOpen || !mounted) return null;

  const q = search.trim().toLocaleLowerCase();
  const isExcluded = (id: string) => excludedDriverIds.includes(id);
  const filteredDrivers = driversList.filter((driver) => {
    if (onlyAvailable && (!driver.isAvailable || isExcluded(driver.id))) return false;
    if ((requiredLanguage === 'english' || englishOnly) && !driverSupportsEnglish(driver)) return false;
    if (q && ![driver.name, driver.affiliation || '', driver.residence || '', driver.phone || '', driver.vehicleModel || '']
      .some((word) => word.toLocaleLowerCase().includes(q))) return false;
    return true;
  }).sort((a,b) => Number(b.isAvailable) - Number(a.isAvailable) || a.name.localeCompare(b.name, 'ko'));
  const driverPages = paginateDriverItems(filteredDrivers);
  const pageCount = driverPages.length;
  const goToPage = (index: number) => {
    const next = Math.max(0, Math.min(index, pageCount - 1));
    setCurrentPage(next);
    if (pagesRef.current) {
      pagesRef.current.scrollTo({ left: next * pagesRef.current.clientWidth, behavior: 'smooth' });
    }
  };
  const selected = driversList.find((driver) => driver.id === selectedDriverId);
  const canConfirm = Boolean(selected?.isAvailable && !isExcluded(selected.id) &&
    (requiredLanguage !== 'english' || driverSupportsEnglish(selected)) &&
    (!englishOnly || driverSupportsEnglish(selected)));

  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center p-4 sm:p-6 bg-[#17233B]/30 backdrop-blur-[2px] animate-in fade-in duration-200"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-picker-title"
        className="flex h-[min(744px,94dvh)] w-full max-w-lg flex-col overflow-hidden rounded-[26px] bg-[#FAFBFD] shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)] animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="shrink-0 p-5 pb-3 sm:p-6 sm:pb-3.5 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="driver-picker-title" className="text-[21px] font-bold tracking-[-0.035em] text-[#17233B]">
                기사님 선택
              </h3>
              <p className="mt-0.5 truncate text-xs text-[#73839D] font-medium">
                {targetVehicleName}{targetDate ? ` · ${targetDate}` : ''}{targetTime ? ` ${targetTime}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="기사님 선택 닫기"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6] hover:text-[#17233B] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search Box */}
          <div className="flex h-[52px] items-center gap-3 rounded-[16px] bg-white px-4 shadow-[0_5px_16px_rgba(35,49,78,0.045),0_2px_5px_rgba(35,49,78,0.02)] focus-within:ring-2 focus-within:ring-[#1E60F3]/20 transition-shadow">
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
                    ? 'bg-[#EEF3FF] text-[#1E60F3]'
                    : 'bg-white text-[#73839D] shadow-[0_3px_10px_rgba(35,49,78,0.04)] hover:bg-[#F7F9FC]'
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
                    ? 'bg-[#EEF3FF] text-[#1E60F3]'
                    : 'bg-white text-[#73839D] shadow-[0_3px_10px_rgba(35,49,78,0.04)] hover:bg-[#F7F9FC]'
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

        {/* Fixed-height driver viewport. Filters never resize the modal. */}
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-2 sm:px-6">
          {hookDrivers.isLoading && propDrivers === undefined && !driversList.length ? (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[#73839D]">
              <Loader2 className="size-4 animate-spin text-[#1E60F3]" /> 기사 정보를 불러오고 있어요.
            </div>
          ) : hookDrivers.error && propDrivers === undefined && !driversList.length ? (
            <div role="alert" className="flex h-full items-center justify-center px-4 text-center text-[13px] text-[#73839D]">{hookDrivers.error}</div>
          ) : filteredDrivers.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <UserRound className="size-10 text-[#95A3B9]" strokeWidth={1.4} />
              <p className="text-[13px] font-semibold text-[#4D607C]">조건에 맞는 기사님이 없어요.</p>
              <button
                type="button"
                onClick={() => { setSearch(''); setOnlyAvailable(false); if (requiredLanguage !== 'english') setEnglishOnly(false); }}
                className="min-h-10 cursor-pointer rounded-[13px] bg-white px-4 text-[12px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.055)] hover:bg-[#F5F8FF]"
              >
                전체 기사 보기
              </button>
            </div>
          ) : (
            <>
              <div
                ref={pagesRef}
                aria-label="기사 목록, 좌우로 넘겨 볼 수 있어요"
                onScroll={(event) => {
                  const width = event.currentTarget.clientWidth;
                  if (width) setCurrentPage(Math.min(pageCount - 1, Math.round(event.currentTarget.scrollLeft / width)));
                }}
                className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {driverPages.map((page, pageIndex) => (
                  <div
                    key={page.map(driver => driver.id).join(':')}
                    className="flex h-full w-full shrink-0 snap-start snap-always flex-col gap-2 overflow-y-auto overscroll-contain pb-2"
                    aria-label={'기사 목록 ' + (pageIndex + 1) + '/' + pageCount}
                  >
                    {page.map((driver) => {
                      const active = selectedDriverId === driver.id;
                      const english = driverSupportsEnglish(driver);
                      const blocked = isExcluded(driver.id);
                      const canChoose = driver.isAvailable && !blocked;
                      return (
                        <button
                          key={driver.id}
                          type="button"
                          onClick={() => { if (canChoose) setSelectedDriverId(driver.id); }}
                          aria-pressed={active}
                          disabled={!canChoose}
                          className={'group relative flex min-h-[79px] w-full shrink-0 cursor-pointer items-center justify-between gap-3 rounded-[17px] px-3.5 py-2.5 text-left transition-all sm:min-h-[83px] sm:px-4 ' +
                            (active ? 'bg-[#EEF3FF] shadow-[0_4px_14px_rgba(35,49,78,0.065)]' :
                              'bg-white shadow-[0_4px_14px_rgba(35,49,78,0.045)] hover:bg-[#F5F8FF]') +
                            ' disabled:cursor-not-allowed disabled:opacity-50'}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className={'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F7F9FC] sm:size-13 ' +
                              (active ? 'ring-2 ring-[#1E60F3]/25' : '')}>
                              {driver.avatarUrl ? (
                                <img src={driver.avatarUrl} alt={driver.name} className="size-full object-cover" loading="lazy" />
                              ) : (
                                <UserRound className="size-6 text-[#95A3B9]" strokeWidth={1.5} aria-hidden="true" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-[#17233B] sm:text-[14px]">{driver.name} 기사님</span>
                              <span className="mt-0.5 block truncate text-[11px] text-[#73839D]">소속 · {driver.affiliation || driver.residence || '소속 미등록'}</span>
                              <span className="mt-0.5 block text-[11px] text-[#73839D]">
                                한국어{english ? ' · 영어 가능' : ''}
                                {typeof driver.careerYears === 'number' && driver.careerYears > 0 ? ' · 경력 ' + driver.careerYears + '년' : ''}
                              </span>
                              {blocked || !driver.isAvailable ? <span className="block text-[11px] text-[#A34E45]">배정 불가</span> : null}
                            </span>
                          </span>
                          {active && <Check className="size-5 shrink-0 text-[#1E60F3]" strokeWidth={2.5} aria-label="선택한 기사님" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-t border-[#E9EDF4]/70 pt-2">
                <p className="text-[11px] font-medium text-[#73839D]">
                  {pageCount > 1 ? '좌우로 밀어서 다른 기사님도 볼 수 있어요' : '기사님을 선택해 주세요'}
                </p>
                {pageCount > 1 && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label="이전 기사 목록"
                      disabled={currentPage === 0}
                      onClick={() => goToPage(currentPage - 1)}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white text-[#4D607C] shadow-[0_2px_8px_rgba(35,49,78,0.045)] disabled:cursor-not-allowed disabled:opacity-30"
                    ><ChevronLeft className="size-4" /></button>
                    <span aria-live="polite" className="min-w-8 text-center text-[11px] font-semibold tabular-nums text-[#73839D]">{currentPage + 1}/{pageCount}</span>
                    <button
                      type="button"
                      aria-label="다음 기사 목록"
                      disabled={currentPage >= pageCount - 1}
                      onClick={() => goToPage(currentPage + 1)}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white text-[#4D607C] shadow-[0_2px_8px_rgba(35,49,78,0.045)] disabled:cursor-not-allowed disabled:opacity-30"
                    ><ChevronRight className="size-4" /></button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="shrink-0 bg-white p-4 pt-3 sm:p-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 py-3.5 rounded-[15px] bg-[#F7F9FC] hover:bg-[#EDF1F6] active:scale-[0.99] text-[#4D607C] font-semibold text-sm transition-all cursor-pointer text-center"
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
            className="w-2/3 py-3.5 rounded-[15px] bg-[#1E60F3] hover:bg-[#1757DC] active:scale-[0.99] text-white font-semibold text-sm shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-all cursor-pointer disabled:bg-blue-200 disabled:shadow-none disabled:cursor-not-allowed text-center"
          >
            기사님 선택 완료
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
};
