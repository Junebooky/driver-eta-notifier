'use client';

import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Star, Check, Globe, AlertCircle, Loader2 } from 'lucide-react';
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
  targetDate = '2026. 10. 28. (수)',
  targetTime = '09:00',
  initialDriverId = '',
  requiredLanguage = 'any',
  drivers: propDrivers,
}) => {
  // Real DB drivers from hook as primary data source
  const hookDrivers = useHqDrivers();
  const driversList: (AvailableDriverItem | HqDriverSummary)[] =
    propDrivers && propDrivers.length > 0 ? propDrivers : hookDrivers.drivers;

  const [selectedDriverId, setSelectedDriverId] = useState<string>(initialDriverId);
  const [languageFilter, setLanguageFilter] = useState<'all' | 'en' | 'ko'>(
    requiredLanguage === 'english' ? 'en' : 'all'
  );
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(true);

  // Sync initialDriverId or fallback to first
  useEffect(() => {
    if (initialDriverId) {
      setSelectedDriverId(initialDriverId);
    } else if (driversList.length > 0) {
      setSelectedDriverId(driversList[0].id);
    }
  }, [initialDriverId, driversList]);

  // Sync filter if requiredLanguage changes
  useEffect(() => {
    if (requiredLanguage === 'english') {
      setLanguageFilter('en');
    }
  }, [requiredLanguage, isOpen]);

  if (!isOpen) return null;

  const filteredDrivers = driversList.filter((d) => {
    if (onlyAvailable && !d.isAvailable) return false;
    if (languageFilter === 'en' && !driverSupportsEnglish(d)) return false;
    if (languageFilter === 'ko' && !d.languages.includes('ko') && !d.languages.includes('한국어')) return false;
    return true;
  });

  const activeDriver =
    driversList.find((d) => d.id === selectedDriverId) || filteredDrivers[0] || driversList[0] || null;

  const handleConfirm = () => {
    if (!activeDriver) return;
    haptics.success();
    onSelectDriver(activeDriver);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">가용 기사 배정</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              실시간 DB 기사 목록을 조회하고, 언어 및 차량 적합도에 맞춰 기사를 배정합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-500 cursor-pointer transition-all"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Column Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {/* Column 1: Filters (md:col-span-3) */}
          <div className="md:col-span-3 p-4 bg-slate-50/60 space-y-4 overflow-y-auto">
            <div>
              <span className="block text-xs font-extrabold text-slate-900 mb-2">
                운행일 기준 가용 기사
              </span>
              <div className="space-y-2.5">
                {/* Date Display */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">운행 일자</label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-extrabold text-slate-800 shadow-2xs">
                    <Calendar className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                    <span>{targetDate}</span>
                  </div>
                </div>

                {/* Time Display */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">픽업 시간</label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-extrabold text-slate-800 shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                    <span>{targetTime}</span>
                  </div>
                </div>

                {/* Language Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">언어 조건</label>
                  <select
                    value={languageFilter}
                    onChange={(e) => setLanguageFilter(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-[#1E60F3] shadow-2xs cursor-pointer"
                  >
                    <option value="all">전체 (무관)</option>
                    <option value="en">영어 가능</option>
                    <option value="ko">한국어</option>
                  </select>
                </div>

                {/* Target Vehicle Info */}
                <div className="pt-2 border-t border-slate-200/80">
                  <span className="block text-[11px] font-bold text-slate-500 mb-1">배정 대상 차량</span>
                  <div className="px-3 py-2 bg-blue-50/80 border border-blue-200 rounded-xl text-xs font-extrabold text-[#1E60F3]">
                    {targetVehicleName}
                  </div>
                </div>

                {/* Toggle: 가용 기사만 보기 */}
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">가용 기사만 보기</span>
                  <button
                    type="button"
                    onClick={() => setOnlyAvailable(!onlyAvailable)}
                    className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                      onlyAvailable ? 'bg-[#1E60F3]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                        onlyAvailable ? 'left-5' : 'left-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Driver List (md:col-span-5) */}
          <div className="md:col-span-5 p-3 overflow-y-auto space-y-2 bg-white max-h-[520px]">
            {hookDrivers.isLoading && driversList.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Loader2 className="w-7 h-7 mx-auto text-[#1E60F3] animate-spin mb-2" />
                <p className="font-bold text-xs text-slate-600">실시간 기사 데이터 동기화 중...</p>
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="py-12 px-4 text-center bg-slate-50/80 rounded-2xl border border-slate-200/90 space-y-2 animate-in fade-in">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-extrabold text-slate-800">
                  {languageFilter === 'en' ? '영어 가능 기사 없음' : '가용 기사 없음'}
                </h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  {languageFilter === 'en'
                    ? "선택하신 조건(영어 필수)을 충족하는 가용 기사가 없습니다. 언어 조건을 '전체(무관)'으로 변경해 보세요."
                    : '현재 조건에 맞는 가용 기사가 없습니다. 운행 일자나 필터를 변경해 주세요.'}
                </p>
                {languageFilter === 'en' && (
                  <button
                    type="button"
                    onClick={() => setLanguageFilter('all')}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    기사 전체 보기 (무관)
                  </button>
                )}
              </div>
            ) : (
              filteredDrivers.map((driver) => {
                const isSelected = activeDriver?.id === driver.id;
                const isEnglish = driverSupportsEnglish(driver);

                return (
                  <div
                    key={driver.id}
                    onClick={() => {
                      setSelectedDriverId(driver.id);
                      haptics.lightTap();
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-[#1E60F3] bg-blue-50/70 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {driver.avatarUrl ? (
                        <img
                          src={driver.avatarUrl}
                          alt={driver.name}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                          className="w-11 h-11 rounded-full object-cover border border-slate-200 shadow-2xs shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-blue-50 text-[#1E60F3] border border-blue-100 font-black text-sm flex items-center justify-center shrink-0">
                          {driver.name.slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-extrabold text-slate-900">{driver.name}</span>
                          {driver.rating !== undefined && driver.rating !== null ? (
                            <div className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>{driver.rating.toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs font-semibold">-</span>
                          )}
                          {isEnglish && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-50 text-[#1E60F3] border border-blue-200">
                              🇺🇸 영어 가능
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                          <span>{driver.flags.join(' ')}</span>
                          <span className="text-slate-300">·</span>
                          <span className="truncate">{driver.affiliation}</span>
                          {driver.vehicleModel && driver.vehicleModel !== '차량 미지정' && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="truncate text-slate-600 font-medium">{driver.vehicleModel}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDriverId(driver.id);
                        haptics.lightTap();
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#1E60F3] text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {isSelected ? '선택됨' : '선택'}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Column 3: Selected Driver Profile Card (md:col-span-4) */}
          <div className="md:col-span-4 p-4 bg-slate-50/40 flex flex-col justify-between overflow-y-auto">
            {activeDriver ? (
              <div className="space-y-4">
                {/* Profile Top */}
                <div className="flex items-center gap-3">
                  {activeDriver.avatarUrl ? (
                    <img
                      src={activeDriver.avatarUrl}
                      alt={activeDriver.name}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                      className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shadow-xs"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1E60F3] border border-blue-100 font-black text-xl flex items-center justify-center shadow-xs shrink-0">
                      {activeDriver.name.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <h4 className="text-base font-black text-slate-900">{activeDriver.name}</h4>
                    {activeDriver.rating !== undefined && activeDriver.rating !== null ? (
                      <div className="flex items-center gap-1 text-xs font-extrabold text-amber-500 mt-0.5">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>
                          {activeDriver.rating.toFixed(1)} {activeDriver.reviewCount ? `(${activeDriver.reviewCount}건)` : ''}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 font-semibold mt-0.5">평점 미등록</div>
                    )}
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold rounded-md">
                        🇰🇷 한국어
                      </span>
                      {driverSupportsEnglish(activeDriver) && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-[#1E60F3] border border-blue-200 text-[10px] font-black rounded-md">
                          🇺🇸 영어 가능
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details list */}
                <div className="bg-white rounded-2xl p-3 border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">소속</span>
                    <span className="font-bold text-slate-800">{activeDriver.affiliation}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">연락처</span>
                    <span className="font-mono font-bold text-slate-800">{activeDriver.phone || '미등록'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">거주지</span>
                    <span className="font-bold text-slate-800">{activeDriver.residence}</span>
                  </div>
                  {activeDriver.vehicleModel && activeDriver.vehicleModel !== '차량 미지정' && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-slate-500 font-medium">배정 차량</span>
                      <span className="font-bold text-[#1E60F3]">
                        {activeDriver.vehicleModel} {activeDriver.plate ? `(${activeDriver.plate})` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Recent Trips */}
                <div>
                  <span className="block text-xs font-extrabold text-slate-800 mb-1.5">최근 운행</span>
                  {activeDriver.recentTrips && activeDriver.recentTrips.length > 0 ? (
                    <div className="space-y-1.5">
                      {activeDriver.recentTrips.map((trip, idx) => (
                        <div
                          key={idx}
                          className="bg-white rounded-xl p-2 border border-slate-200/80 flex items-center justify-between text-[11px]"
                        >
                          <span className="font-extrabold text-slate-500 shrink-0">{trip.date}</span>
                          <span className="font-bold text-slate-800 truncate ml-2">{trip.route}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 text-xs text-slate-400 text-center">
                      배정된 운행 이력이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">기사를 선택해주세요.</div>
            )}

            {/* Bottom Actions */}
            <div className="pt-4 flex items-center gap-2 border-t border-slate-200/80 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-[#1650D6] active:scale-95 text-white text-xs font-extrabold transition-all cursor-pointer shadow-md shadow-blue-500/20"
              >
                기사 배정
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
