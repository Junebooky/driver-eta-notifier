'use client';

import React, { useState, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { LocationPreset } from '@/types';
import { DEFAULT_PRESET_LOCATIONS } from '@/utils/presets';
import { LocationSearchModal, SelectedLocationData } from './LocationSearchModal';
import { DriverCalendarCard } from './common/DriverCalendarCard';
import { DriverTimePickerModal } from './common/DriverTimePickerModal';
import {
  X,
  Calendar,
  Clock,
  Check,
  Search,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ScheduleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newSchedule: ScheduleItem) => void | Promise<void>;
  initialDate?: string; // e.g., '2026-09-28', '20260928', '9.28'
  presets?: LocationPreset[];
  vehicleNo?: string;
  driverName?: string;
  passengerName?: string | null;
  homeLocation?: { name: string; address: string; lat: number; lng: number } | null;
}

interface SelectedLocation {
  name: string;
  address: string;
  lat: number;
  lng: number;
  presetId?: string;
}

// Helper: Normalize incoming date to ISO 'YYYY-MM-DD'
function normalizeToIsoDate(dateStr?: string): string {
  if (!dateStr) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  // YYYYMMDD
  const digits = dateStr.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  const currentYear = new Date().getFullYear();
  if (digits.length === 4) {
    return `${currentYear}-${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
  }
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: Format ISO 'YYYY-MM-DD' into Korean e.g. "2026년 11월 05일 (목)"
function formatKoreanDate(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(year, month - 1, day);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = days[dateObj.getDay()];
  return `${year}년 ${String(month).padStart(2, '0')}월 ${String(day).padStart(2, '0')}일 (${dayOfWeek})`;
}

// Helper: Generate date label for ScheduleItem e.g. "11월 5일 (목)"
function getIsoDateLabel(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(parseInt(parts[0], 10), month - 1, day);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = days[dateObj.getDay()];
  return `${month}월 ${day}일 (${dayOfWeek})`;
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
  presets,
  vehicleNo = '4호차',
  passengerName,
  homeLocation,
}) => {
  const formId = useId();
  const dateFieldRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Custom Calendar & Time Picker states
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

  // Active Presets: Sync from props or vehicle-isolated localStorage to ensure Personal MY presets are included
  const [activePresets, setActivePresets] = useState<LocationPreset[]>(() => {
    if (presets && presets.length > 0) return presets;
    if (typeof window !== 'undefined' && vehicleNo) {
      const cleanV = vehicleNo.match(/(\d+호차)/)?.[1] || vehicleNo || '4호차';
      try {
        const cached = localStorage.getItem(`cockpit_presets_${cleanV}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {
        // Fallback
      }
    }
    return DEFAULT_PRESET_LOCATIONS;
  });

  useEffect(() => {
    if (presets && presets.length > 0) {
      setActivePresets(presets);
    } else if (typeof window !== 'undefined' && vehicleNo) {
      const cleanV = vehicleNo.match(/(\d+호차)/)?.[1] || vehicleNo || '4호차';
      try {
        const cached = localStorage.getItem(`cockpit_presets_${cleanV}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setActivePresets(parsed);
          }
        }
      } catch {
        // Fallback
      }
    }
  }, [presets, vehicleNo, isOpen]);

  // 1. Date Field (ISO: YYYY-MM-DD)
  const [pickupDate, setPickupDate] = useState(() => normalizeToIsoDate(initialDate));

  // 2. Location Fields
  const [origin, setOrigin] = useState<SelectedLocation | null>(null);
  const [destination, setDestination] = useState<SelectedLocation | null>(null);

  // Standalone Location Search Modal Target: 'origin' | 'destination' | null
  const [searchModalTarget, setSearchModalTarget] = useState<'origin' | 'destination' | null>(null);

  // 3. Time & Details (Unified to '픽업')
  const [pickupTime, setPickupTime] = useState('09:00');
  const [passenger, setPassenger] = useState('');
  const [flight, setFlight] = useState('');
  const [notes, setNotes] = useState('');

  // Validation error highlights
  const [formErrors, setFormErrors] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  // Body Scroll Lock
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Close calendar when clicking outside dateFieldRef
  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (dateFieldRef.current && !dateFieldRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isCalendarOpen]);

  // Reset or pre-fill on modal open
  useEffect(() => {
    if (isOpen) {
      setPickupDate(normalizeToIsoDate(initialDate));

      setOrigin({
        name: activePresets[2]?.shortName || '조선팰리스 강남',
        address: activePresets[2]?.address || '서울 강남구 테헤란로 231',
        lat: activePresets[2]?.lat || 37.5042,
        lng: activePresets[2]?.lng || 127.0425,
        presetId: activePresets[2]?.id || 'josun_palace',
      });
      setDestination({
        name: activePresets[0]?.shortName || '인천공항 T1',
        address: activePresets[0]?.address || '인천 중구 공항로 272',
        lat: activePresets[0]?.lat || 37.4495,
        lng: activePresets[0]?.lng || 126.4512,
        presetId: activePresets[0]?.id || 'icn_t1',
      });

      setPickupTime('09:00');
      setPassenger(passengerName || '');
      setFlight('');
      setNotes('');
      setSearchModalTarget(null);
      setIsCalendarOpen(false);
      setIsTimePickerOpen(false);
      setFormErrors({});
      setSaveError('');
    }
  }, [isOpen, initialDate, presets, passengerName]);

  if (!isOpen || !mounted) return null;

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const errors: { [key: string]: boolean } = {};
    if (!pickupDate) errors.date = true;
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

    const resolvedTimeDisplay = `픽업 ${pickupTime}`;

    const newSchedule: ScheduleItem = {
      id: `manual_${Date.now()}`,
      date: pickupDate,
      dateLabel: getIsoDateLabel(pickupDate),
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

    setIsSaving(true);
    setSaveError('');
    try {
      await onSave(newSchedule);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const passengerInputId = `${formId}-passenger`;
  const flightInputId = `${formId}-flight`;
  const notesInputId = `${formId}-notes`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none overscroll-contain animate-in fade-in duration-200"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      {/* Background Dimmed Overlay */}
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs -z-10" />

      {/* Modal Card */}
      <div
        className="w-full max-w-md bg-[#F6F8FC] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100/90 overflow-hidden flex flex-col max-h-[92dvh] relative z-10 animate-in slide-in-from-bottom-6 duration-300"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-2 shrink-0">
          <div className="min-w-0">
            <h3 className="text-xl font-extrabold text-[#0F172A] tracking-tight leading-snug">
              새 스케줄 등록
            </h3>
            <p className="text-xs sm:text-[13px] font-medium text-slate-400 mt-1 truncate">
              {vehicleNo} 전담 VIP 의전 배차 일정
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isSaving) return;
              haptics.lightTap();
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-[#EBEEF5] hover:bg-slate-200/80 text-slate-500 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="닫기"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Modal Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          className="px-5 sm:px-6 pt-3 pb-5 space-y-4 overflow-y-auto max-h-[90dvh] flex-1 text-slate-800 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {saveError && (
            <p role="alert" aria-live="polite" className="text-xs font-bold text-rose-600">
              {saveError}
            </p>
          )}

          {/* 1. 픽업 일자 (클릭 시 레퍼런스 1 스타일 달력 UI 표시) */}
          <div className="relative" ref={dateFieldRef}>
            <span className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5">
              픽업 일자
            </span>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setIsCalendarOpen((prev) => !prev);
              }}
              className={`relative flex items-center justify-between w-full h-12 px-4 bg-white border rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] transition-all group cursor-pointer ${
                formErrors.date
                  ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-200'
                  : isCalendarOpen
                    ? 'border-[#0055FF] ring-2 ring-[#0055FF]/10'
                    : 'border-slate-100/90 hover:border-blue-200'
              }`}
              aria-label="픽업 일자 선택"
              aria-expanded={isCalendarOpen}
            >
              <span className="text-sm sm:text-[15px] font-bold text-[#0F172A] tracking-tight tabular-nums">
                {formatKoreanDate(pickupDate) || '날짜 선택'}
              </span>
              <Calendar className="w-[18px] h-[18px] text-[#0055FF] shrink-0 stroke-[2]" />
            </button>

            {isCalendarOpen && (
              <div className="mt-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <DriverCalendarCard
                  value={pickupDate}
                  onChange={(nextIso) => {
                    setPickupDate(nextIso);
                    if (formErrors.date) {
                      setFormErrors((prev) => ({ ...prev, date: false }));
                    }
                  }}
                  onClose={() => setIsCalendarOpen(false)}
                />
              </div>
            )}
          </div>

          {/* 2. 픽업 경로 (출발지 → 도착지) */}
          <div>
            <span className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5">
              픽업 경로 (출발지 → 도착지)
            </span>

            <div className="space-y-2.5">
              {/* Origin Card */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setSearchModalTarget('origin');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    haptics.lightTap();
                    setSearchModalTarget('origin');
                  }
                }}
                className={`px-4 py-3.5 rounded-2xl bg-white border shadow-[0_3px_12px_rgba(15,23,42,0.04)] flex items-center justify-between gap-3 transition-all cursor-pointer ${
                  formErrors.origin
                    ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-200'
                    : 'border-slate-100/90 hover:border-blue-200'
                }`}
                title="출발지 검색 및 선택"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="px-2.5 py-1 rounded-lg bg-[#EBF2FF] text-[#0055FF] font-extrabold text-xs shrink-0 mt-0.5">
                    출발
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm sm:text-[15px] font-extrabold text-[#0F172A] truncate block leading-snug">
                      {origin ? origin.name : '출발지를 선택해 주세요'}
                    </span>
                    {origin && (
                      <span className="text-xs text-slate-400 font-medium truncate block mt-0.5">
                        {origin.address}
                      </span>
                    )}
                  </div>
                </div>
                <Search className="w-[18px] h-[18px] text-[#0055FF] shrink-0 stroke-[2.2]" />
              </div>

              {/* Destination Card */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptics.lightTap();
                  setSearchModalTarget('destination');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    haptics.lightTap();
                    setSearchModalTarget('destination');
                  }
                }}
                className={`px-4 py-3.5 rounded-2xl bg-white border shadow-[0_3px_12px_rgba(15,23,42,0.04)] flex items-center justify-between gap-3 transition-all cursor-pointer ${
                  formErrors.destination
                    ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-200'
                    : 'border-slate-100/90 hover:border-blue-200'
                }`}
                title="도착지 검색 및 선택"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="px-2.5 py-1 rounded-lg bg-[#0055FF] text-white font-extrabold text-xs shrink-0 mt-0.5">
                    도착
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm sm:text-[15px] font-extrabold text-[#0F172A] truncate block leading-snug">
                      {destination ? destination.name : '도착지를 선택해 주세요'}
                    </span>
                    {destination && (
                      <span className="text-xs text-slate-400 font-medium truncate block mt-0.5">
                        {destination.address}
                      </span>
                    )}
                  </div>
                </div>
                <Search className="w-[18px] h-[18px] text-[#0055FF] shrink-0 stroke-[2.2]" />
              </div>
            </div>
          </div>

          {/* 3. 픽업 시간 (클릭 시 통합 피커 타임 모달 오픈) */}
          <div>
            <span className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5">
              픽업 시간
            </span>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setIsTimePickerOpen(true);
              }}
              className="relative flex items-center justify-between w-full h-12 px-4 bg-white border border-slate-100/90 hover:border-blue-200 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] transition-all group cursor-pointer"
              aria-label="픽업 시간 선택"
            >
              <span className="text-sm sm:text-[15px] font-bold text-[#0F172A] tracking-tight tabular-nums">
                {formatKoreanTime(pickupTime) || '시간 선택'}
              </span>
              <Clock className="w-[18px] h-[18px] text-slate-400 group-hover:text-[#0055FF] transition-colors shrink-0 stroke-[2]" />
            </button>
          </div>

          {/* 4. 승객명 & 항공편명 (선택) — 2-Column Side-by-Side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={passengerInputId}
                className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5"
              >
                승객명
              </label>
              <input
                id={passengerInputId}
                name="passenger_name"
                type="text"
                value={passenger}
                onChange={(e) => setPassenger(e.target.value)}
                placeholder="예: SOYFAN 외 2명"
                className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-sm sm:text-[15px] font-bold text-[#0F172A] placeholder:font-medium placeholder:text-slate-400 outline-none focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/10 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor={flightInputId}
                className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5"
              >
                항공편명 (선택)
              </label>
              <input
                id={flightInputId}
                name="flight_number"
                type="text"
                value={flight}
                onChange={(e) => setFlight(e.target.value.toUpperCase())}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="예: SQ 612"
                className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-sm sm:text-[15px] font-bold text-[#0F172A] placeholder:font-medium placeholder:text-slate-400 outline-none focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/10 transition-all uppercase"
              />
            </div>
          </div>

          {/* 5. 의전 메모 / 특이사항 */}
          <div>
            <label
              htmlFor={notesInputId}
              className="block text-xs sm:text-[13px] font-extrabold text-[#0F172A] mb-1.5"
            >
              의전 메모 / 특이사항
            </label>
            <input
              id={notesInputId}
              name="protocol_notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: VIP 전담 의전 영접, 수하물 3개 등 특이사항 입력"
              className="w-full h-12 px-4 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-sm sm:text-[15px] font-bold text-[#0F172A] placeholder:font-medium placeholder:text-slate-400 outline-none focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/10 transition-all"
            />
          </div>

          {/* 6. Modal Actions Footer */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (isSaving) return;
                haptics.lightTap();
                onClose();
              }}
              className="flex-1 h-13 rounded-2xl bg-white border border-slate-100/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] text-slate-600 font-extrabold text-sm sm:text-[15px] hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-[2] h-13 rounded-2xl bg-[#0055FF] hover:bg-[#0046D5] text-white font-extrabold text-sm sm:text-[15px] shadow-[0_6px_18px_rgba(0,85,255,0.28)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Check className="w-4.5 h-4.5 stroke-[2.5]" />
              <span>{isSaving ? '저장 중…' : '스케줄 저장'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Unified Driver Time Picker Modal (피커 타임 UI) */}
      <DriverTimePickerModal
        isOpen={isTimePickerOpen}
        title="픽업 시각 설정"
        value={pickupTime}
        onClose={() => setIsTimePickerOpen(false)}
        onConfirm={(nextTime) => setPickupTime(nextTime)}
      />

      {/* Standalone Location Search Modal (Child Layer: z-[110]) */}
      {searchModalTarget && (
        <LocationSearchModal
          isOpen={!!searchModalTarget}
          onClose={() => setSearchModalTarget(null)}
          target={searchModalTarget}
          presets={activePresets}
          homeLocation={homeLocation}
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
    </div>,
    document.body
  );
};
