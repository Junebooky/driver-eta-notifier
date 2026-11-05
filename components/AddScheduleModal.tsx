'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Search, Map, MoreVertical, Loader2, AlertCircle } from 'lucide-react';
import { RouteStopItem, isValidTimeHHMM, clampTimeComponent } from '@/utils/drivingLog';
import { haptics } from '@/utils/haptics';
import { searchTmapPoisClient } from '@/lib/places/tmapSearchEngine';

interface AddScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (stop: RouteStopItem) => void;
  editingStop?: RouteStopItem | null;
  onOpenMapSearch?: () => void;
  selectedLocationFromMap?: { name: string; address?: string } | null;
}

interface StoredSearchItem {
  name?: string;
  shortName?: string;
  address?: string;
}

interface PoiApiItem {
  name: string;
  address: string;
}

const DEFAULT_RECENT_LOCATIONS: Array<{ name: string; address: string }> = [
  { name: '뜨락', address: '서울 강남구 영동대로142길 13-3' },
  { name: '콘래드', address: '서울 영등포구 국제금융로 10' },
  { name: '경기 용인시 수지구 광교마을로 90', address: '경기 용인시 수지구 광교마을로 90, 401동 107호' },
  { name: '연남CGV', address: '서울 마포구' },
];

const getStoredRecentLocations = (): Array<{ name: string; address: string }> => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('cockpit_recent_searches');
      if (stored) {
        const parsed = JSON.parse(stored) as StoredSearchItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed
            .slice(0, 4)
            .map((item) => ({
              name: item.name || item.shortName || '',
              address: item.address || '',
            }))
            .filter((item) => Boolean(item.name));
          if (valid.length > 0) {
            return valid;
          }
        }
      }
    } catch {
      // Fallback
    }
  }
  return DEFAULT_RECENT_LOCATIONS;
};

const AddScheduleModalContent: React.FC<{
  onClose: () => void;
  onSave: (stop: RouteStopItem) => void;
  editingStop?: RouteStopItem | null;
  onOpenMapSearch?: () => void;
  selectedLocationFromMap?: { name: string; address?: string } | null;
}> = ({ onClose, onSave, editingStop, onOpenMapSearch, selectedLocationFromMap }) => {
  // Derive initial values purely
  const [time, setTime] = useState(() => {
    if (editingStop?.time) return editingStop.time;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  const [place, setPlace] = useState(
    () => selectedLocationFromMap?.name || editingStop?.place || ''
  );
  const [address, setAddress] = useState(
    () => selectedLocationFromMap?.address || editingStop?.address || ''
  );
  const [memo, setMemo] = useState(editingStop?.memo || '');
  const [timeError, setTimeError] = useState<string | null>(null);

  // Mobile-friendly iOS Wheel Time Picker Modal state
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [pickerHour, setPickerHour] = useState('09');
  const [pickerMinute, setPickerMinute] = useState('00');

  const openTimePicker = () => {
    haptics.lightTap();
    if (isValidTimeHHMM(time)) {
      const [h, m] = time.split(':');
      setPickerHour(h);
      setPickerMinute(m);
    } else {
      const now = new Date();
      setPickerHour(String(now.getHours()).padStart(2, '0'));
      setPickerMinute(String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0'));
    }
    setIsTimePickerOpen(true);
    setTimeout(() => {
      const [h, m] = isValidTimeHHMM(time) ? time.split(':') : ['09', '00'];
      document.getElementById(`schedule-wheel-hour-${h}`)?.scrollIntoView({ block: 'center' });
      document.getElementById(`schedule-wheel-min-${m}`)?.scrollIntoView({ block: 'center' });
    }, 30);
  };

  const applyTimePicker = () => {
    haptics.selection();
    const hh = clampTimeComponent(pickerHour || '00', 23);
    const mm = clampTimeComponent(pickerMinute || '00', 59);
    setTime(`${hh}:${mm}`);
    if (timeError) setTimeError(null);
    setIsTimePickerOpen(false);
  };

  // Stored recent searches (empty if user has no search history)
  const [recentLocations] = useState<Array<{ name: string; address: string }>>(
    getStoredRecentLocations
  );

  const [searchSuggestions, setSearchSuggestions] = useState<Array<{ name: string; address: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Live POI search as user types
  const handlePlaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPlace(val);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val.trim() || val.length < 2) {
      setSearchSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const pois = await searchTmapPoisClient(val.trim());
        setSearchSuggestions(
          pois.slice(0, 5).map((p) => ({
            name: p.name,
            address: p.address,
          }))
        );
      } catch (err) {
        console.warn('Live search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  const handleSelectLocation = (loc: { name: string; address: string }) => {
    haptics.selection();
    setPlace(loc.name);
    setAddress(loc.address);
    setSearchSuggestions([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Strict 24h format validation
    if (!isValidTimeHHMM(time.trim())) {
      setTimeError('올바른 시간(00:00 ~ 23:59)을 입력해주세요.');
      haptics.warningPulse();
      return;
    }
    setTimeError(null);

    if (!place.trim()) {
      alert('장소를 입력해주세요.');
      return;
    }

    haptics.success();
    const newStop: RouteStopItem = {
      id: editingStop?.id || `stop-${Date.now()}`,
      time: time.trim(),
      place: place.trim(),
      address: address.trim() || undefined,
      memo: memo.trim() || undefined,
    };

    onSave(newStop);
    onClose();
  };

  return (
    <div
      className="relative w-full max-w-md bg-[#F6F8FC] rounded-3xl shadow-2xl border border-slate-100/90 z-10 flex flex-col max-h-[90vh] overflow-hidden driver-modal-card"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 bg-[#F6F8FC]">
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
          {editingStop ? '일정 수정' : '일정 추가'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors cursor-pointer"
          aria-label="닫기"
        >
          <X className="w-5 h-5 stroke-[2.2]" />
        </button>
      </div>

      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
        {/* 1. 시간 (탭 시 모바일 친화형 휠 타임피커 모달 오픈) */}
        <div>
          <label className="block text-xs sm:text-[13px] font-bold text-slate-700 mb-1.5">시간</label>
          <div className="relative flex items-center">
            <Clock className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none stroke-[2]" />
            <input
              type="text"
              readOnly
              value={time}
              onClick={openTimePicker}
              placeholder="예) 15:20"
              className={`w-full h-12 pl-10 pr-4 bg-white border ${
                timeError ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-100/90 hover:border-blue-200'
              } rounded-2xl text-sm sm:text-base font-extrabold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10 transition-all shadow-[0_3px_12px_rgba(15,23,42,0.04)] tabular-nums cursor-pointer`}
            />
          </div>
          {timeError && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{timeError}</span>
            </div>
          )}
        </div>

        {/* 2. 장소 */}
        <div>
          <label className="block text-xs sm:text-[13px] font-bold text-slate-700 mb-1.5">장소</label>
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none stroke-[2]" />
            <input
              type="text"
              value={place}
              onChange={handlePlaceChange}
              placeholder="장소명 또는 주소를 검색하세요."
              className="w-full h-12 pl-10 pr-11 bg-white border border-slate-100/90 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10 transition-all shadow-[0_3px_12px_rgba(15,23,42,0.04)]"
            />
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                if (onOpenMapSearch) onOpenMapSearch();
              }}
              className="absolute right-2.5 p-1.5 text-slate-500 hover:text-[#1E60F3] hover:bg-blue-50/50 rounded-xl transition-colors cursor-pointer"
              title="지도/거점 검색"
            >
              <Map className="w-4.5 h-4.5 stroke-[1.8]" />
            </button>
          </div>

          {/* Live Search Suggestions Dropdown */}
          {isSearching && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E60F3]" />
              <span>장소 검색 중...</span>
            </div>
          )}
          {searchSuggestions.length > 0 && (
            <div className="mt-2 border border-slate-100/90 rounded-2xl bg-white shadow-[0_6px_20px_rgba(15,23,42,0.08)] overflow-hidden divide-y divide-slate-100">
              {searchSuggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectLocation(item)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50/60 transition-colors flex items-start gap-2.5 cursor-pointer"
                >
                  <img
                    src="/images/icons/excel/icon_position.png"
                    alt="위치"
                    className="w-5 h-5 object-contain shrink-0 mt-0.5 select-none"
                    draggable={false}
                  />
                  <div className="min-w-0">
                    <div className="text-xs sm:text-[13px] font-extrabold text-slate-900 truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.address}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. 최근 검색한 장소 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-[13px] font-extrabold text-slate-800">최근 검색한 장소</span>
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                if (onOpenMapSearch) onOpenMapSearch();
              }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium flex items-center gap-0.5 cursor-pointer"
            >
              전체보기 &gt;
            </button>
          </div>

          <div className="divide-y divide-slate-100/90 border border-slate-100/90 rounded-2xl bg-white overflow-hidden shadow-[0_3px_14px_rgba(15,23,42,0.04)]">
            {recentLocations.map((loc, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectLocation(loc)}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/80 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#F3F6FB] flex items-center justify-center group-hover:bg-blue-50 transition-colors shrink-0 overflow-hidden">
                    <img
                      src="/images/icons/excel/icon_position.png"
                      alt="위치"
                      className="w-5 h-5 object-contain select-none"
                      draggable={false}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-[13px] font-extrabold text-slate-900 group-hover:text-[#1E60F3] transition-colors truncate">
                      {loc.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">{loc.address}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectLocation(loc);
                  }}
                  className="p-1 text-slate-300 hover:text-slate-500 rounded transition-colors cursor-pointer"
                  aria-label="선택"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 4. 메모 (선택) */}
        <div>
          <label className="block text-xs sm:text-[13px] font-bold text-slate-700 mb-1.5">메모 (선택)</label>
          <div className="relative">
            <textarea
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, 200))}
              placeholder="예) 고객 미팅, 식사, 대기 등"
              className="w-full p-4 pb-7 bg-white border border-slate-100/90 rounded-2xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10 transition-all resize-none shadow-[0_3px_12px_rgba(15,23,42,0.04)]"
            />
            <span className="absolute bottom-2.5 right-3.5 text-[11px] text-slate-400 font-medium">
              {memo.length}/200
            </span>
          </div>
        </div>
      </div>

      {/* Bottom CTA Button */}
      <div className="px-5 pb-5 pt-2 bg-[#F6F8FC]">
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full h-12 sm:h-13 bg-[#0055FF] hover:bg-[#0046D5] text-white text-sm sm:text-[15px] font-extrabold rounded-2xl shadow-[0_6px_18px_rgba(0,85,255,0.28)] active:scale-[0.98] transition-all cursor-pointer"
        >
          {editingStop ? '수정하기' : '추가하기'}
        </button>
      </div>

      {/* iOS-style Wheel & Direct Input Time Picker Modal (일정 시각 설정 - 출퇴근 시간 피커와 동일) */}
      {isTimePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 driver-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              haptics.lightTap();
              setIsTimePickerOpen(false);
            }
          }}
        >
          <div
            className="bg-[#F6F8FC] border border-slate-100/90 rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4 driver-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                일정 시각 설정
              </h3>
              <button
                type="button"
                onClick={() => setIsTimePickerOpen(false)}
                className="w-8 h-8 rounded-full bg-[#EDF1F7] hover:bg-slate-200/80 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>

            {/* 직접 타이핑 가능한 시간 입력 바 + 원터치 '지금' 버튼 */}
            <div className="flex items-center justify-between bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <input
                  id="schedule-picker-hour-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={pickerHour}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    if (digits === '') {
                      setPickerHour('');
                      return;
                    }
                    const num = Math.min(23, parseInt(digits, 10));
                    const nextVal = digits.length === 2 ? String(num).padStart(2, '0') : digits;
                    setPickerHour(nextVal);
                    const padded = String(num).padStart(2, '0');
                    document
                      .getElementById(`schedule-wheel-hour-${padded}`)
                      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    if (digits.length === 2) {
                      const minInput = document.getElementById(
                        'schedule-picker-min-input'
                      ) as HTMLInputElement | null;
                      minInput?.focus();
                      minInput?.select();
                    }
                  }}
                  onBlur={() => setPickerHour(clampTimeComponent(pickerHour || '00', 23))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyTimePicker();
                    }
                  }}
                  aria-label="시 입력"
                  className="w-12 h-9 rounded-xl bg-[#F4F7FC] border border-transparent focus:bg-white focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 text-center text-lg font-black text-[#0055FF] tabular-nums outline-none transition-all"
                />
                <span className="text-lg font-black text-[#0055FF] select-none">:</span>
                <input
                  id="schedule-picker-min-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={pickerMinute}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    if (digits === '') {
                      setPickerMinute('');
                      return;
                    }
                    const num = Math.min(59, parseInt(digits, 10));
                    const nextVal = digits.length === 2 ? String(num).padStart(2, '0') : digits;
                    setPickerMinute(nextVal);
                    const padded = String(num).padStart(2, '0');
                    document
                      .getElementById(`schedule-wheel-min-${padded}`)
                      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  }}
                  onBlur={() => setPickerMinute(clampTimeComponent(pickerMinute || '00', 59))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyTimePicker();
                    }
                  }}
                  aria-label="분 입력"
                  className="w-12 h-9 rounded-xl bg-[#F4F7FC] border border-transparent focus:bg-white focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 text-center text-lg font-black text-[#0055FF] tabular-nums outline-none transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  const now = new Date();
                  const hh = String(now.getHours()).padStart(2, '0');
                  const mm = String(now.getMinutes()).padStart(2, '0');
                  setPickerHour(hh);
                  setPickerMinute(mm);
                  setTimeout(() => {
                    document.getElementById(`schedule-wheel-hour-${hh}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    document.getElementById(`schedule-wheel-min-${mm}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  }, 30);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-[#EBF3FF] hover:bg-blue-100/80 text-xs font-extrabold text-[#0055FF] active:scale-95 transition-all cursor-pointer flex items-center gap-1"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>지금</span>
              </button>
            </div>

            {/* iOS 스타일 상하 스와이프 휠 피커 */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl p-2.5">
              {/* Hour Wheel (00 ~ 23) */}
              <div className="h-36 overflow-y-auto snap-y snap-mandatory no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden space-y-1 px-1">
                {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((hh) => {
                  const selected = clampTimeComponent(pickerHour || '00', 23) === hh;
                  return (
                    <button
                      id={`schedule-wheel-hour-${hh}`}
                      key={hh}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setPickerHour(hh);
                      }}
                      className={`w-full py-1.5 rounded-xl text-center snap-center transition-all cursor-pointer tabular-nums ${
                        selected
                          ? 'bg-[#0055FF] text-white text-base font-black shadow-[0_3px_10px_rgba(0,85,255,0.25)]'
                          : 'text-sm font-semibold text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {hh}시
                    </button>
                  );
                })}
              </div>

              <span className="text-xl font-black text-slate-300 select-none">:</span>

              {/* Minute Wheel (00 ~ 59) */}
              <div className="h-36 overflow-y-auto snap-y snap-mandatory no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden space-y-1 px-1">
                {Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0')).map((mm) => {
                  const selected = clampTimeComponent(pickerMinute || '00', 59) === mm;
                  return (
                    <button
                      id={`schedule-wheel-min-${mm}`}
                      key={mm}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setPickerMinute(mm);
                      }}
                      className={`w-full py-1.5 rounded-xl text-center snap-center transition-all cursor-pointer tabular-nums ${
                        selected
                          ? 'bg-[#0055FF] text-white text-base font-black shadow-[0_3px_10px_rgba(0,85,255,0.25)]'
                          : 'text-sm font-semibold text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {mm}분
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsTimePickerOpen(false)}
                className="flex-1 py-3 bg-[#EEF2F7] hover:bg-slate-200/80 text-xs sm:text-sm font-extrabold text-slate-700 rounded-2xl cursor-pointer transition-all active:scale-98"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={applyTimePicker}
                className="flex-1 py-3 bg-[#0055FF] hover:bg-[#0046D5] text-white text-xs sm:text-sm font-extrabold rounded-2xl shadow-[0_6px_16px_rgba(0,85,255,0.28)] cursor-pointer transition-all active:scale-98"
              >
                설정 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const AddScheduleModal: React.FC<AddScheduleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingStop,
  onOpenMapSearch,
  selectedLocationFromMap,
}) => {
  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm driver-modal-backdrop">
      {/* Backdrop Click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Fresh component mounted on open, editingStop, or selectedLocationFromMap change */}
      <AddScheduleModalContent
        key={`${editingStop?.id || 'new'}-${selectedLocationFromMap?.name || ''}`}
        onClose={onClose}
        onSave={onSave}
        editingStop={editingStop}
        onOpenMapSearch={onOpenMapSearch}
        selectedLocationFromMap={selectedLocationFromMap}
      />
    </div>
  );
};
