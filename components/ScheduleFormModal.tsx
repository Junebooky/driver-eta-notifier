'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { LocationPreset } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';
import { sanitizeSearchQuery } from './CustomPresetModal';
import {
  X,
  Calendar,
  Clock,
  User,
  Plane,
  FileText,
  MapPin,
  Search,
  Check,
  Sparkles,
  Loader2,
  Navigation,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ScheduleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newSchedule: ScheduleItem) => void;
  initialDate?: string; // e.g., '20260925', '2026-09-25', '9.25'
  presets?: LocationPreset[];
  vehicleNo?: string;
  driverName?: string;
  passengerName?: string;
}

interface SelectedLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
  presetId?: string;
}

interface PoiResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// Helper: Normalize any incoming date string to an 8-digit string 'YYYYMMDD'
function normalizeTo8Digits(dateStr?: string): string {
  if (!dateStr) return '';
  const digits = dateStr.replace(/\D/g, '');
  if (digits.length === 8) {
    return digits;
  }
  // If e.g. '0925' or '925'
  const currentYear = new Date().getFullYear();
  if (digits.length === 4) {
    return `${currentYear}${digits}`;
  }
  if (digits.length === 3) {
    return `${currentYear}0${digits}`;
  }
  return digits.slice(0, 8);
}

// Helper: Validate 8-digit date and calculate day of week
function parseAndValidate8DigitDate(raw: string) {
  if (raw.length !== 8) return null;
  const year = parseInt(raw.slice(0, 4), 10);
  const month = parseInt(raw.slice(4, 6), 10);
  const day = parseInt(raw.slice(6, 8), 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const targetDate = new Date(year, month - 1, day);
  if (
    targetDate.getFullYear() !== year ||
    targetDate.getMonth() !== month - 1 ||
    targetDate.getDate() !== day
  ) {
    return null;
  }

  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][targetDate.getDay()];
  const formattedDate = `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dateLabel = `${month}월 ${day}일 (${dayOfWeek})`;

  return { year, month, day, dayOfWeek, formattedDate, isoDate, dateLabel };
}

// Client-side in-memory search cache for 0ms instant retrieval
const scheduleSearchCache = new Map<string, PoiResult[]>();

export const ScheduleFormModal: React.FC<ScheduleFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialDate,
  presets = DEFAULT_PRESET_LOCATIONS,
  vehicleNo = '4호차',
  passengerName,
}) => {
  // 1. Date Field (Numeric 8 digits: YYYYMMDD)
  const [rawDate, setRawDate] = useState('');

  // 2. Location Fields
  const [origin, setOrigin] = useState<SelectedLocation | null>(null);
  const [destination, setDestination] = useState<SelectedLocation | null>(null);

  // Active location selection drawer: 'origin' | 'destination' | null
  const [activeLocationTarget, setActiveLocationTarget] = useState<'origin' | 'destination' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PoiResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 3. Time & Details
  const [pickupTime, setPickupTime] = useState('09:00');
  const [timeDisplay, setTimeDisplay] = useState('09:00 픽업');
  const [passenger, setPassenger] = useState('');
  const [flight, setFlight] = useState('');
  const [notes, setNotes] = useState('');

  // Validation error highlights
  const [formErrors, setFormErrors] = useState<{ [key: string]: boolean }>({});

  // Reset or pre-fill on modal open
  useEffect(() => {
    if (isOpen) {
      const normalized = normalizeTo8Digits(initialDate);
      if (normalized && normalized.length === 8) {
        setRawDate(normalized);
      } else {
        // Default to today if not provided
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        setRawDate(`${y}${m}${d}`);
      }

      // Default presets
      setOrigin({
        name: presets[2]?.shortName || '조선팰리스 강남',
        address: presets[2]?.address || '서울 강남구 테헤란로 231',
        lat: presets[2]?.lat || 37.5042,
        lng: presets[2]?.lng || 127.0425,
        presetId: presets[2]?.id || 'josun_palace',
      });
      setDestination({
        name: presets[0]?.shortName || '인천공항 T1',
        address: presets[0]?.address || '인천 중구 공항로 272',
        lat: presets[0]?.lat || 37.4495,
        lng: presets[0]?.lng || 126.4512,
        presetId: presets[0]?.id || 'icn_t1',
      });

      setPickupTime('09:00');
      setTimeDisplay('09:00 픽업');
      setPassenger(passengerName || 'DENZEL SOFYAN');
      setFlight('');
      setNotes('VIP 전담 의전 영접');
      setActiveLocationTarget(null);
      setSearchQuery('');
      setSearchResults([]);
      setFormErrors({});
    }
  }, [isOpen, initialDate, presets, passengerName]);

  // Real-time TMAP POI search with in-memory caching and AbortController
  useEffect(() => {
    const rawQ = searchQuery.trim();
    const q = sanitizeSearchQuery(rawQ);
    if (q.length < 2) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    // 0ms In-memory cache hit
    if (scheduleSearchCache.has(q)) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      const cached = scheduleSearchCache.get(q)!;
      setSearchResults(cached);
      setIsSearching(false);
      setSearchError(cached.length === 0 ? '추천 검색 결과가 없습니다.' : null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      // Abort any prior in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(`/api/search?keyword=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const pois: PoiResult[] = data.pois || [];
          scheduleSearchCache.set(q, pois);
          setSearchResults(pois);
          if (pois.length === 0) {
            setSearchError('추천 검색 결과가 없습니다.');
          }
        } else {
          setSearchError('TMAP 검색 서버 응답에 실패했습니다.');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // Aborted intentionally due to newer user typing
          return;
        }
        console.warn('TMAP search error:', err);
        setSearchError('검색 중 오류가 발생했습니다.');
      } finally {
        if (abortControllerRef.current === controller) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [searchQuery]);

  if (!isOpen) return null;

  // Real-time parsed date info
  const dateInfo = parseAndValidate8DigitDate(rawDate);

  // Date input handler: numeric only, max 8 chars
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 8);
    setRawDate(digitsOnly);
    if (formErrors.date) {
      setFormErrors((prev) => ({ ...prev, date: false }));
    }
  };

  // Dismiss mobile virtual keyboard on touching/scrolling result list
  const handleListTouch = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // Quick Location Selection
  const handleSelectLocation = (loc: SelectedLocation) => {
    haptics.lightTap();
    if (activeLocationTarget === 'origin') {
      setOrigin(loc);
      if (formErrors.origin) setFormErrors((prev) => ({ ...prev, origin: false }));
    } else if (activeLocationTarget === 'destination') {
      setDestination(loc);
      if (formErrors.destination) setFormErrors((prev) => ({ ...prev, destination: false }));
    }
    setActiveLocationTarget(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Form Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: { [key: string]: boolean } = {};
    if (!dateInfo) errors.date = true;
    if (!origin) errors.origin = true;
    if (!destination) errors.destination = true;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      haptics.warningPulse();
      return;
    }

    if (!dateInfo || !origin || !destination) return;

    const newSchedule: ScheduleItem = {
      id: `sch-manual-${Date.now()}`,
      vehicle_no: vehicleNo,
      date: dateInfo.isoDate,
      dateLabel: dateInfo.dateLabel,
      pickup_time: pickupTime || '09:00',
      dropoff_time: null,
      time_display: timeDisplay.trim() || `${pickupTime} 픽업`,
      origin_name: origin.name,
      origin_address: origin.address,
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      origin_preset_id: origin.presetId || 'custom_origin',
      destination_name: destination.name,
      destination_address: destination.address,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      destination_preset_id: destination.presetId || 'custom_dest',
      passenger: passenger.trim() || 'VIP 승객',
      flight: flight.trim() ? flight.trim().toUpperCase() : undefined,
      notes: notes.trim() || undefined,
      status: 'confirmed',
    };

    haptics.success();
    onSave(newSchedule);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92dvh] animate-in slide-in-from-bottom-6 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#1E60F3] text-white flex items-center justify-center shadow-xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                새 스케줄 직접 등록
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {vehicleNo} 전담 VIP 의전 배차 일정
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          className="p-5 space-y-4 overflow-y-auto flex-1 text-slate-800 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {/* ========================================================= */}
          {/* [태스크 2] 날짜 입력 필드 (숫자 8자리 + 요일 자동 연산 뱃지)  */}
          {/* ========================================================= */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1E60F3]" />
                <span>운행 일자 (8자리 숫자)</span>
              </label>

              {/* 실시간 요일 계산 완료 뱃지 (파란색 볼드) */}
              {dateInfo && (
                <div className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#1E60F3] font-black text-xs flex items-center gap-1 shadow-2xs animate-fade-in">
                  <Check className="w-3 h-3 stroke-[3]" />
                  <span>
                    {dateInfo.formattedDate} ({dateInfo.dayOfWeek})
                  </span>
                </div>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={rawDate}
                onChange={handleDateChange}
                placeholder="예: 20260925 (8자리 숫자)"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold tracking-wider text-slate-900 outline-none transition-all ${
                  formErrors.date
                    ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-200'
                    : dateInfo
                    ? 'border-[#1E60F3] bg-blue-50/20 ring-1 ring-blue-100'
                    : 'border-slate-200 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100'
                }`}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] px-1">
              <span className="text-slate-400">
                숫자만 입력 시 요일이 자동 연산됩니다.
              </span>
              {rawDate.length === 8 && !dateInfo && (
                <span className="text-rose-500 font-bold animate-fade-in">
                  올바른 날짜를 입력해 주세요 (예: 20260925)
                </span>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* [태스크 3] 출발지 & 도착지 장소 가드레일 (TMAP 검색 + 퀵 선택)  */}
          {/* ========================================================= */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>운행 경로 (출발지 ➔ 도착지)</span>
            </label>

            {/* 출발지 / 도착지 선택 카드 2단 */}
            <div className="space-y-2">
              {/* Origin Card */}
              <div
                onClick={() => {
                  haptics.lightTap();
                  setActiveLocationTarget(activeLocationTarget === 'origin' ? null : 'origin');
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  activeLocationTarget === 'origin'
                    ? 'border-2 border-[#1E60F3] bg-blue-50/30 shadow-xs'
                    : 'border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-extrabold text-[10px] shrink-0">
                      출발
                    </span>
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {origin ? origin.name : '출발지를 선택해 주세요'}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-[#1E60F3] shrink-0 ml-2">
                    {activeLocationTarget === 'origin' ? '선택 중' : '변경'}
                  </span>
                </div>
                {origin && (
                  <p className="text-[11px] text-slate-500 truncate mt-1 pl-8">
                    {origin.address}
                  </p>
                )}
              </div>

              {/* Destination Card */}
              <div
                onClick={() => {
                  haptics.lightTap();
                  setActiveLocationTarget(activeLocationTarget === 'destination' ? null : 'destination');
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  activeLocationTarget === 'destination'
                    ? 'border-2 border-[#1E60F3] bg-blue-50/30 shadow-xs'
                    : 'border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-[#1E60F3] text-white font-extrabold text-[10px] shrink-0">
                      도착
                    </span>
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {destination ? destination.name : '도착지를 선택해 주세요'}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-[#1E60F3] shrink-0 ml-2">
                    {activeLocationTarget === 'destination' ? '선택 중' : '변경'}
                  </span>
                </div>
                {destination && (
                  <p className="text-[11px] text-slate-500 truncate mt-1 pl-8">
                    {destination.address}
                  </p>
                )}
              </div>
            </div>

            {/* Location Selector Drawer (Opens when activeLocationTarget is set) */}
            {activeLocationTarget && (
              <div className="p-3.5 rounded-2xl bg-white border border-[#1E60F3]/40 shadow-lg space-y-3 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        activeLocationTarget === 'origin' ? 'bg-slate-600' : 'bg-[#1E60F3]'
                      }`}
                    />
                    <span className="text-xs font-bold text-slate-900">
                      {activeLocationTarget === 'origin' ? '출발지 검색 및 선택' : '도착지 검색 및 선택'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveLocationTarget(null)}
                    className="text-[11px] font-medium text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    닫기
                  </button>
                </div>

                {/* 1. TMAP Real-time Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="장소명 또는 주소 검색 (TMAP 실시간)"
                    className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  />
                  <Search className="w-4 h-4 text-[#1E60F3] absolute left-3 top-2.5" />
                  {isSearching && (
                    <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin absolute right-3 top-3" />
                  )}
                  {searchQuery && !isSearching && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* TMAP Autocomplete Results List */}
                {searchResults.length > 0 && (
                  <div
                    onTouchStart={handleListTouch}
                    onScrollCapture={handleListTouch}
                    style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
                    className="max-h-40 overflow-y-auto space-y-1 divide-y divide-slate-50 border border-slate-100 rounded-xl p-1 bg-slate-50/50 overscroll-contain touch-pan-y"
                  >
                    {searchResults.map((poi, idx) => (
                      <button
                        key={`${poi.id || 'poi'}-${idx}`}
                        type="button"
                        onClick={() =>
                          handleSelectLocation({
                            name: poi.name,
                            address: poi.address,
                            lat: poi.lat,
                            lng: poi.lng,
                          })
                        }
                        className="w-full text-left p-2 rounded-lg hover:bg-blue-50 transition-colors flex items-start gap-2 cursor-pointer group"
                      >
                        <MapPin className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#1E60F3] shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate group-hover:text-[#1E60F3]">
                            {poi.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">{poi.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchError && (
                  <p className="text-[11px] text-slate-400 text-center py-1">{searchError}</p>
                )}

                {/* 2. Frequently Visited Presets Quick-Select Chips (공통 / 개인) */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#1E60F3]" />
                      <span>자주 가는 목적지 퀵 선택</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      터치 시 즉시 지정
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {presets.map((p, pIdx) => {
                      const isHQ = !p.vehicle_no && !p.vehicleNo;
                      return (
                        <button
                          key={`${p.id}-${pIdx}`}
                          type="button"
                          onClick={() =>
                            handleSelectLocation({
                              name: p.shortName,
                              address: p.address || p.name,
                              lat: p.lat,
                              lng: p.lng,
                              presetId: p.id,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:border-[#1E60F3] hover:bg-blue-50/50 text-slate-800 shrink-0 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-2xs"
                        >
                          <span
                            className={`text-[9px] font-extrabold px-1 py-0.2 rounded ${
                              isHQ ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-[#1E60F3]'
                            }`}
                          >
                            {isHQ ? '공통' : '개인'}
                          </span>
                          <span className="text-xs font-bold">{p.shortName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 시간 표기 & 픽업 시각                                      */}
          {/* ========================================================= */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>픽업 및 운행 시각</span>
            </label>

            <div className="grid grid-cols-[100px_1fr] gap-2">
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => {
                  setPickupTime(e.target.value);
                  setTimeDisplay(`${e.target.value} 픽업`);
                }}
                className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-[#1E60F3]"
              />
              <input
                type="text"
                value={timeDisplay}
                onChange={(e) => setTimeDisplay(e.target.value)}
                placeholder="예: 09:00 픽업, 16:45 출국"
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-[#1E60F3]"
              />
            </div>

            {/* Quick Time Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5 no-scrollbar">
              {['09:00 픽업', '10:00 픽업', '13:00 픽업', '14:30 픽업', '착륙 영접'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setTimeDisplay(tag);
                    const match = tag.match(/(\d{2}:\d{2})/);
                    if (match) setPickupTime(match[1]);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-600 shrink-0 transition-colors cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 승객명 & 항공편명 & 의전 메모                              */}
          {/* ========================================================= */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <User className="w-3 h-3 text-[#1E60F3]" />
                <span>승객명</span>
              </label>
              <input
                type="text"
                value={passenger}
                onChange={(e) => setPassenger(e.target.value)}
                placeholder="예: DENZEL SOFYAN"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-[#1E60F3]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Plane className="w-3 h-3 text-indigo-500" />
                <span>항공편명 (선택)</span>
              </label>
              <input
                type="text"
                value={flight}
                onChange={(e) => setFlight(e.target.value.toUpperCase())}
                placeholder="예: SQ 612"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-[#1E60F3] uppercase"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-500" />
              <span>의전 메모 / 특이사항</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: T1 3층 게이트 하차 영접"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-[#1E60F3]"
            />
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-[2] py-3 rounded-xl bg-[#1E60F3] hover:bg-[#1650D6] text-white font-extrabold text-xs shadow-md shadow-blue-500/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>스케줄 등록 완료</span>
          </button>
        </div>
      </div>
    </div>
  );
};
