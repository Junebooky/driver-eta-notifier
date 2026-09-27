'use client';

import React, { useState, useEffect } from 'react';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { LocationPreset } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';
import { LocationSearchModal, SelectedLocationData } from './LocationSearchModal';
import {
  X,
  Calendar,
  Clock,
  User,
  Plane,
  FileText,
  MapPin,
  Check,
  Navigation,
  Search,
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

// Helper: Normalize any incoming date string to an 8-digit string 'YYYYMMDD'
function normalizeTo8Digits(dateStr?: string): string {
  if (!dateStr) return '';
  const digits = dateStr.replace(/\D/g, '');
  if (digits.length === 8) {
    return digits;
  }
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

// Helper: Format HH:mm into Korean 12-hour format e.g. "오전 09:00", "오후 02:30"
function formatKoreanTime(timeStr: string): string {
  if (!timeStr) return '';
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const hStr = String(h12).padStart(2, '0');
  return `${period} ${hStr}:${m}`;
}

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

  // Standalone Location Search Modal Target: 'origin' | 'destination' | null
  const [searchModalTarget, setSearchModalTarget] = useState<'origin' | 'destination' | null>(null);

  // 3. Time & Details (Unified to '픽업')
  const [pickupTime, setPickupTime] = useState('09:00');
  const [timeDisplay, setTimeDisplay] = useState('09:00');
  const [passenger, setPassenger] = useState('');
  const [flight, setFlight] = useState('');
  const [notes, setNotes] = useState('');

  // Validation error highlights
  const [formErrors, setFormErrors] = useState<{ [key: string]: boolean }>({});

  // [태스크 1] 바디 스크롤 락 (Body Scroll Lock)
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Reset or pre-fill on modal open
  useEffect(() => {
    if (isOpen) {
      const normalized = normalizeTo8Digits(initialDate);
      if (normalized && normalized.length === 8) {
        setRawDate(normalized);
      } else {
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
      setTimeDisplay('09:00');
      setPassenger(passengerName || 'DENZEL SOFYAN');
      setFlight('');
      setNotes('');
      setSearchModalTarget(null);
      setFormErrors({});
    }
  }, [isOpen, initialDate, presets, passengerName]);

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

    haptics.successPulse();

    // Flight Type detection
    const isAirportDest =
      destination!.name.includes('공항') ||
      destination!.address.includes('공항') ||
      destination!.name.toLowerCase().includes('airport');

    const isAirportOrigin =
      origin!.name.includes('공항') ||
      origin!.address.includes('공항') ||
      origin!.name.toLowerCase().includes('airport');

    let flightType: 'arrival' | 'departure' | 'none' = 'none';
    if (flight) {
      flightType = isAirportDest ? 'departure' : 'arrival';
    } else if (isAirportDest) {
      flightType = 'departure';
    } else if (isAirportOrigin) {
      flightType = 'arrival';
    }

    // Ensure clean pickup time format e.g. "픽업 09:00"
    const resolvedTimeDisplay = `픽업 ${pickupTime}`;

    const newSchedule: ScheduleItem = {
      id: `manual_${Date.now()}`,
      date: dateInfo!.isoDate,
      dateLabel: dateInfo!.dateLabel,
      pickup_time: `${pickupTime}:00`,
      dropoff_time: null,
      time_display: resolvedTimeDisplay,
      vehicle_no: vehicleNo,
      origin_name: origin!.name,
      origin_address: origin!.address,
      origin_preset_id: origin!.presetId || 'custom_origin',
      origin_lat: origin!.lat,
      origin_lng: origin!.lng,
      destination_name: destination!.name,
      destination_address: destination!.address,
      destination_preset_id: destination!.presetId || 'custom_destination',
      destination_lat: destination!.lat,
      destination_lng: destination!.lng,
      status: 'confirmed',
      passenger: passenger.trim() || 'VIP 승객',
      flight: flight.trim() || undefined,
      flightType: flightType !== 'none' ? flightType : undefined,
      notes: notes.trim() || undefined,
    };

    onSave(newSchedule);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none overscroll-contain"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85dvh] animate-in slide-in-from-bottom-6 duration-300"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
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

        {/* Modal Scrollable Body: Max 85dvh and isolated overscroll */}
        <div
          className="p-5 space-y-4 overflow-y-auto max-h-[85dvh] flex-1 text-slate-800 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {/* ========================================================= */}
          {/* [태스크 3] 날짜 입력 필드 (숫자 8자리 + 요일 자동 연산 뱃지)  */}
          {/* ========================================================= */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1E60F3]" />
                <span>픽업 일자 (8자리 숫자)</span>
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
          {/* [태스크 2] 독립형 장소 검색 모달 연동 출발지 & 도착지 카드 */}
          {/* ========================================================= */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>픽업 경로 (출발지 ➔ 도착지)</span>
            </label>

            {/* 출발지 / 도착지 선택 카드 2단 */}
            <div className="space-y-2">
              {/* Origin Card */}
              <div
                onClick={() => {
                  haptics.lightTap();
                  setSearchModalTarget('origin');
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  formErrors.origin
                    ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-200'
                    : 'border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
                title="출발지 검색 및 선택"
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
                  <div className="flex items-center gap-1 text-[11px] font-bold text-[#1E60F3] shrink-0 ml-2">
                    <Search className="w-3 h-3 text-[#1E60F3]" />
                    <span>변경</span>
                  </div>
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
                  setSearchModalTarget('destination');
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  formErrors.destination
                    ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-200'
                    : 'border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 hover:border-slate-300'
                }`}
                title="도착지 검색 및 선택"
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
                  <div className="flex items-center gap-1 text-[11px] font-bold text-[#1E60F3] shrink-0 ml-2">
                    <Search className="w-3 h-3 text-[#1E60F3]" />
                    <span>변경</span>
                  </div>
                </div>
                {destination && (
                  <p className="text-[11px] text-slate-500 truncate mt-1 pl-8">
                    {destination.address}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 픽업 시간 (단일 네이티브 터치 박스)                         */}
          {/* ========================================================= */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>픽업 시간</span>
            </label>

            <div className="relative flex items-center justify-between w-full px-4 py-3.5 bg-slate-50 border border-slate-200 hover:border-[#1E60F3] rounded-2xl transition-all shadow-xs group cursor-pointer">
              <span className="text-base font-bold text-slate-800 tracking-tight">
                {formatKoreanTime(pickupTime) || '시간 선택'}
              </span>
              <Clock className="w-5 h-5 text-slate-400 group-hover:text-[#1E60F3] transition-colors" />
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => {
                  haptics.lightTap();
                  setPickupTime(e.target.value);
                  setTimeDisplay(e.target.value);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="픽업 시간 선택"
              />
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
              placeholder="예: VIP 전담 의전 영접, 수하물 3개 등 특이사항 입력"
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

      {/* Standalone Location Search Modal (Child Layer) */}
      {searchModalTarget && (
        <LocationSearchModal
          isOpen={!!searchModalTarget}
          onClose={() => setSearchModalTarget(null)}
          target={searchModalTarget}
          presets={presets}
          currentSelectedId={searchModalTarget === 'origin' ? origin?.presetId : destination?.presetId}
          onSelectLocation={(loc: SelectedLocationData) => {
            if (searchModalTarget === 'origin') {
              setOrigin({
                name: loc.shortName || loc.name,
                address: loc.address || loc.name,
                lat: loc.lat,
                lng: loc.lng,
                presetId: loc.id,
              });
              if (formErrors.origin) setFormErrors((prev) => ({ ...prev, origin: false }));
            } else if (searchModalTarget === 'destination') {
              setDestination({
                name: loc.shortName || loc.name,
                address: loc.address || loc.name,
                lat: loc.lat,
                lng: loc.lng,
                presetId: loc.id,
              });
              if (formErrors.destination) setFormErrors((prev) => ({ ...prev, destination: false }));
            }
            setSearchModalTarget(null);
          }}
        />
      )}
    </div>
  );
};
