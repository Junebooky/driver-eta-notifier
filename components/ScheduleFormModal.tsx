'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Check,
  Navigation,
  Search,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ScheduleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newSchedule: ScheduleItem) => void;
  initialDate?: string; // e.g., '2026-09-28', '20260928', '9.28'
  presets?: LocationPreset[];
  vehicleNo?: string;
  driverName?: string;
  passengerName?: string;
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

// Helper: Format ISO 'YYYY-MM-DD' into Korean e.g. "2026년 09월 28일 (월)"
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

// Helper: Generate date label for ScheduleItem e.g. "9월 28일 (월)"
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
  const [mounted, setMounted] = useState(false);

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
      } catch (e) { }
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
      } catch (e) { }
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
      setPickupDate(normalizeToIsoDate(initialDate));

      // Default presets
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
      setPassenger(passengerName || 'DENZEL SOFYAN');
      setFlight('');
      setNotes('');
      setSearchModalTarget(null);
      setFormErrors({});
    }
  }, [isOpen, initialDate, presets, passengerName]);

  if (!isOpen || !mounted) return null;

  // Form Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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

    // Ensure clean pickup time format e.g. "픽업 09:00"
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

    onSave(newSchedule);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none overscroll-contain animate-in fade-in duration-200"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={onClose}
    >
      {/* Background Dimmed Overlay: covering entire browser viewport without gaps */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm -z-10" />

      {/* Modal Card */}
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90dvh] relative z-10 animate-in slide-in-from-bottom-6 duration-300"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shadow-xs shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
                새 스케줄 등록
              </h3>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
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
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body: Max 90dvh and isolated overscroll */}
        <div
          className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[90dvh] flex-1 text-slate-800 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {/* [태스크 2] 픽업 일자 (단일 네이티브 날짜 터치 박스) */}
          <div className="space-y-2">
            <label className="text-base font-extrabold text-slate-700 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#1E60F3]" />
              <span>픽업 일자</span>
            </label>

            <div
              className={`relative flex items-center justify-between w-full px-5 py-3 bg-slate-50 border rounded-2xl transition-all shadow-xs group cursor-pointer ${formErrors.date
                ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-200'
                : 'border-slate-200 hover:border-[#1E60F3]'
                }`}
            >
              <span className="text-base font-semibold text-slate-900 tracking-tight">
                {formatKoreanDate(pickupDate) || '날짜 선택'}
              </span>
              <Calendar className="w-5 h-5 text-[#1E60F3] group-hover:scale-110 transition-transform shrink-0" />
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => {
                  haptics.lightTap();
                  setPickupDate(e.target.value);
                  if (formErrors.date) {
                    setFormErrors((prev) => ({ ...prev, date: false }));
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="픽업 일자 선택"
              />
            </div>
          </div>

          {/* [태스크 4] 픽업 경로 (출발지 ➔ 도착지) */}
          <div className="space-y-2.5">
            <label className="text-base font-extrabold text-slate-700 flex items-center gap-2">
              <Navigation className="w-5 h-5 text-[#1E60F3]" />
              <span>픽업 경로 (출발지 ➔ 도착지)</span>
            </label>

            {/* 출발지 / 도착지 선택 카드 2단 */}
            <div className="space-y-2.5">
              {/* Origin Card */}
              <div
                onClick={() => {
                  haptics.lightTap();
                  setSearchModalTarget('origin');
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${formErrors.origin
                  ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-200'
                  : 'border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 hover:border-slate-300'
                  }`}
                title="출발지 검색 및 선택"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 font-black text-sm shrink-0">
                      출발
                    </span>
                    <span className="text-base font-black text-slate-900 truncate">
                      {origin ? origin.name : '출발지를 선택해 주세요'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[#1E60F3] shrink-0 ml-2">
                    <Search className="w-4 h-4 text-[#1E60F3]" />

                  </div>
                </div>
                {origin && (
                  <p className="text-sm text-slate-500 truncate mt-1.5 pl-10">
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
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${formErrors.destination
                  ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-200'
                  : 'border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 hover:border-slate-300'
                  }`}
                title="도착지 검색 및 선택"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-2.5 py-1 rounded-lg bg-[#1E60F3] text-white font-black text-sm shrink-0">
                      도착
                    </span>
                    <span className="text-base font-black text-slate-900 truncate">
                      {destination ? destination.name : '도착지를 선택해 주세요'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[#1E60F3] shrink-0 ml-2">
                    <Search className="w-4 h-4 text-[#1E60F3]" />
                  </div>
                </div>
                {destination && (
                  <p className="text-sm text-slate-500 truncate mt-1.5 pl-10">
                    {destination.address}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 픽업 시간 (단일 네이티브 터치 박스) */}
          <div className="space-y-2">
            <label className="text-base font-extrabold text-slate-700 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#1E60F3]" />
              <span>픽업 시간</span>
            </label>

            <div className="relative flex items-center justify-between w-full px-5 py-3 bg-slate-50 border border-slate-200 hover:border-[#1E60F3] rounded-2xl transition-all shadow-xs group cursor-pointer">
              <span className="text-base font-semibold text-slate-900 tracking-tight">
                {formatKoreanTime(pickupTime) || '시간 선택'}
              </span>
              <Clock className="w-5 h-5 text-slate-400 group-hover:text-[#1E60F3] transition-colors shrink-0" />
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => {
                  haptics.lightTap();
                  setPickupTime(e.target.value);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="픽업 시간 선택"
              />
            </div>
          </div>

          {/* 승객명 & 항공편명 & 의전 메모 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-base font-extrabold text-slate-700 flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#1E60F3]" />
                <span>승객명</span>
              </label>
              <input
                type="text"
                value={passenger}
                onChange={(e) => setPassenger(e.target.value)}
                placeholder="예: DENZEL SOFYAN"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 placeholder:text-base placeholder:text-slate-400 outline-none focus:border-[#1E60F3]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-base font-extrabold text-slate-700 flex items-center gap-1.5">
                <Plane className="w-4 h-4 text-indigo-500" />
                <span>항공편명 (선택)</span>
              </label>
              <input
                type="text"
                value={flight}
                onChange={(e) => setFlight(e.target.value.toUpperCase())}
                placeholder="예: SQ 612"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 placeholder:text-base placeholder:text-slate-400 outline-none focus:border-[#1E60F3] uppercase"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-base font-extrabold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-500" />
              <span>의전 메모 / 특이사항</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="예: VIP 전담 의전 영접, 수하물 3개 등 특이사항 입력"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base font-semibold text-slate-900 placeholder:text-base placeholder:text-slate-400 outline-none focus:border-[#1E60F3]"
            />
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 sm:p-5 bg-slate-50/80 border-t border-slate-100 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-base hover:bg-slate-100 transition-all cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-[2] py-4 rounded-2xl bg-[#1E60F3] hover:bg-[#1650D6] text-white font-black text-base shadow-md shadow-blue-500/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5 stroke-[2.5]" />
            <span>스케줄 등록 완료</span>
          </button>
        </div>
      </div>

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
