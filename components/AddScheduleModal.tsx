'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Clock, Search, MapPin, Map, MoreVertical, Loader2 } from 'lucide-react';
import { RouteStopItem, REFERENCE_RECENT_LOCATIONS } from '@/utils/drivingLog';
import { haptics } from '@/utils/haptics';

interface AddScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (stop: RouteStopItem) => void;
  editingStop?: RouteStopItem | null;
  onOpenMapSearch?: () => void;
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

const AddScheduleModalContent: React.FC<{
  onClose: () => void;
  onSave: (stop: RouteStopItem) => void;
  editingStop?: RouteStopItem | null;
  onOpenMapSearch?: () => void;
}> = ({ onClose, onSave, editingStop, onOpenMapSearch }) => {
  // Derive initial values pure without effect
  const [time, setTime] = useState(() => {
    if (editingStop?.time) return editingStop.time;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  const [place, setPlace] = useState(editingStop?.place || '');
  const [address, setAddress] = useState(editingStop?.address || '');
  const [memo, setMemo] = useState(editingStop?.memo || '');

  const recentLocations: Array<{ name: string; address: string }> = useMemo(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('cockpit_recent_searches');
        if (stored) {
          const parsed = JSON.parse(stored) as StoredSearchItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.slice(0, 4).map((item) => ({
              name: item.name || item.shortName || '',
              address: item.address || '',
            }));
          }
        }
      } catch {
        // Fallback
      }
    }
    return REFERENCE_RECENT_LOCATIONS;
  }, []);

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
        const res = await fetch(`/api/search?keyword=${encodeURIComponent(val.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.pois)) {
            setSearchSuggestions(
              (data.pois as PoiApiItem[]).slice(0, 5).map((p) => ({
                name: p.name,
                address: p.address,
              }))
            );
          }
        }
      } catch (err) {
        console.warn('Live search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  const handleSelectRecent = (loc: { name: string; address: string }) => {
    haptics.selection();
    setPlace(loc.name);
    setAddress(loc.address);
    setSearchSuggestions([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!time.trim() || !place.trim()) {
      alert('시간과 장소를 입력해주세요.');
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
      className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-300"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          {editingStop ? '일정 수정' : '일정 추가'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="닫기"
        >
          <X className="w-5 h-5 stroke-[2.2]" />
        </button>
      </div>

      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* 1. 시간 */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">시간</label>
          <div className="relative flex items-center">
            <Clock className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none stroke-[2]" />
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="예) 08:30"
              maxLength={5}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200/90 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs"
            />
          </div>
        </div>

        {/* 2. 장소 */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">장소</label>
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none stroke-[2]" />
            <input
              type="text"
              value={place}
              onChange={handlePlaceChange}
              placeholder="장소명 또는 주소를 검색하세요."
              className="w-full pl-10 pr-11 py-3 bg-white border border-slate-200/90 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs"
            />
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                if (onOpenMapSearch) onOpenMapSearch();
              }}
              className="absolute right-2.5 p-1.5 text-slate-500 hover:text-[#1E60F3] hover:bg-blue-50/50 rounded-lg transition-colors"
              title="지도/거점 검색"
            >
              <Map className="w-5 h-5 stroke-[1.8]" />
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
            <div className="mt-2 border border-slate-100 rounded-xl bg-white shadow-md overflow-hidden divide-y divide-slate-100">
              {searchSuggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectRecent(item)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50/60 transition-colors flex items-start gap-2.5"
                >
                  <MapPin className="w-4 h-4 text-[#1E60F3] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{item.address}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. 최근 검색한 장소 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700">최근 검색한 장소</span>
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                if (onOpenMapSearch) onOpenMapSearch();
              }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium flex items-center gap-0.5"
            >
              전체보기 &gt;
            </button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-100/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
            {recentLocations.map((loc, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectRecent(loc)}
                className="flex items-center justify-between px-3.5 py-3 hover:bg-slate-50/80 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 group-hover:text-[#1E60F3] group-hover:bg-blue-50/50 group-hover:border-blue-100 transition-colors shrink-0">
                    <MapPin className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 group-hover:text-[#1E60F3] transition-colors truncate">
                      {loc.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">{loc.address}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectRecent(loc);
                  }}
                  className="p-1 text-slate-300 hover:text-slate-500 rounded transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 4. 메모 (선택) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">메모 (선택)</label>
          <div className="relative">
            <textarea
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, 200))}
              placeholder="예) 고객 미팅, 식사, 대기 등"
              className="w-full p-3.5 pb-7 bg-white border border-slate-200/90 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all resize-none shadow-2xs"
            />
            <span className="absolute bottom-2.5 right-3 text-[11px] text-slate-400 font-medium">
              {memo.length}/200
            </span>
          </div>
        </div>
      </div>

      {/* Bottom CTA Button */}
      <div className="p-4 border-t border-slate-100 bg-white">
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full py-3.5 bg-[#1E60F3] text-white text-sm font-bold rounded-xl shadow-[0_4px_14px_rgba(30,96,243,0.32)] hover:bg-blue-600 active:scale-[0.98] transition-all"
        >
          {editingStop ? '수정하기' : '추가하기'}
        </button>
      </div>
    </div>
  );
};

export const AddScheduleModal: React.FC<AddScheduleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingStop,
  onOpenMapSearch,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      {/* Backdrop Click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Fresh component mounted on open or editingStop change */}
      <AddScheduleModalContent
        key={`${editingStop?.id || 'new'}`}
        onClose={onClose}
        onSave={onSave}
        editingStop={editingStop}
        onOpenMapSearch={onOpenMapSearch}
      />
    </div>
  );
};
