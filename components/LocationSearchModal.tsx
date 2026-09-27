'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LocationPreset } from '@/types';
import { sanitizeSearchQuery } from './CustomPresetModal';
import {
  X,
  Search,
  MapPin,
  Sparkles,
  Loader2,
  Home,
  Navigation,
  Check,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

export interface SelectedLocationData {
  id?: string;
  name: string;
  shortName: string;
  address: string;
  lat: number;
  lng: number;
  category?: LocationPreset['category'];
}

interface LocationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: 'origin' | 'destination';
  presets: LocationPreset[];
  homeLocation?: { name: string; address: string; lat: number; lng: number } | null;
  currentSelectedId?: string;
  onSelectLocation: (location: SelectedLocationData) => void;
  onOpenHomeModal?: () => void;
}

interface PoiResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// In-memory 0ms instant cache for location searches
const locationSearchCache = new Map<string, PoiResult[]>();

export const LocationSearchModal: React.FC<LocationSearchModalProps> = ({
  isOpen,
  onClose,
  target,
  presets,
  homeLocation,
  currentSelectedId,
  onSelectLocation,
  onOpenHomeModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PoiResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. Body Scroll Lock: Prevent background page from scrolling
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Auto focus search input with slight delay for mobile keyboard stability
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => {
      document.body.style.overflow = originalOverflow;
      clearTimeout(timer);
    };
  }, [isOpen]);

  // Reset search state when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
    }
  }, [isOpen, target]);

  // Real-time TMAP POI Search with in-memory caching and AbortController
  useEffect(() => {
    const rawQuery = searchQuery.trim();
    const query = sanitizeSearchQuery(rawQuery);

    if (query.length < 2) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    // 0ms Cache hit
    if (locationSearchCache.has(query)) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      const cached = locationSearchCache.get(query)!;
      setSearchResults(cached);
      setIsSearching(false);
      setSearchError(cached.length === 0 ? '추천 검색 결과가 없습니다.' : null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(`/api/search?keyword=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          const pois: PoiResult[] = data.pois || [];
          locationSearchCache.set(query, pois);
          setSearchResults(pois);
          if (pois.length === 0) {
            setSearchError('추천 검색 결과가 없습니다.');
          }
        } else {
          setSearchError('TMAP 검색 서버 응답에 실패했습니다.');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('TMAP Location Search error:', err);
        setSearchError('장소 검색 중 오류가 발생했습니다.');
      } finally {
        if (abortControllerRef.current === controller) {
          setIsSearching(false);
        }
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [searchQuery]);

  if (!isOpen) return null;

  // Dismiss keyboard when touching or scrolling results list
  const handleScrollTouch = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // Handler: Selecting a Preset
  const handleSelectPreset = (preset: LocationPreset) => {
    haptics.lightTap();
    onSelectLocation({
      id: preset.id,
      name: preset.name,
      shortName: preset.shortName,
      address: preset.address || preset.name,
      lat: preset.lat,
      lng: preset.lng,
      category: preset.category,
    });
    onClose();
  };

  // Handler: Selecting Home
  const handleSelectHome = () => {
    haptics.lightTap();
    if (homeLocation && homeLocation.name) {
      onSelectLocation({
        id: 'slot_home',
        name: homeLocation.name,
        shortName: '자택',
        address: homeLocation.address || homeLocation.name,
        lat: homeLocation.lat,
        lng: homeLocation.lng,
        category: 'CUSTOM',
      });
      onClose();
    } else if (onOpenHomeModal) {
      onOpenHomeModal();
      onClose();
    }
  };

  // Handler: Selecting a POI Result
  const handleSelectPoi = (poi: PoiResult) => {
    haptics.successPulse();
    onSelectLocation({
      id: `poi_${poi.id}`,
      name: poi.name,
      shortName: poi.name.slice(0, 10),
      address: poi.address,
      lat: poi.lat,
      lng: poi.lng,
      category: 'CUSTOM',
    });
    onClose();
  };

  const isOrigin = target === 'origin';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none overscroll-contain"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[88dvh] animate-in slide-in-from-bottom-6 duration-300"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* 1. Modal Header (Selection Mode Badge & Close Button)     */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-xs text-white ${
                isOrigin ? 'bg-slate-700' : 'bg-[#1E60F3]'
              }`}
            >
              {isOrigin ? (
                <Navigation className="w-3.5 h-3.5 fill-white" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[11px] font-black px-1.5 py-0.5 rounded shadow-2xs ${
                    isOrigin
                      ? 'bg-slate-100 text-slate-700 border border-slate-200'
                      : 'bg-blue-50 text-[#1E60F3] border border-blue-200'
                  }`}
                >
                  {isOrigin ? '출발지 설정' : '목적지 설정'}
                </span>
                <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                  장소 검색 및 거점 선택
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                자주 가는 거점을 원터치로 고르거나 TMAP으로 검색하세요.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
            title="닫기"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================= */}
        {/* 2. Real-time TMAP Search Input Bar                       */}
        {/* ========================================================= */}
        <div className="p-4 pb-3 border-b border-slate-100 shrink-0 bg-slate-50/50">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="장소명, 지하철역, 건물명 검색 (예: 혜화역, 조선팰리스)"
              className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
            />
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-[#1E60F3] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
            ) : searchQuery.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  inputRef.current?.focus();
                }}
                className="w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                aria-label="검색어 지우기"
              >
                <X className="w-3 h-3" />
              </button>
            ) : null}
          </div>
        </div>

        {/* ========================================================= */}
        {/* 3. Modal Scrollable Body: Presets & POI Search Results    */}
        {/* ========================================================= */}
        <div
          className="p-4 space-y-4 overflow-y-auto flex-1 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
          onTouchMove={handleScrollTouch}
        >
          {/* TMAP Search Results (If query length >= 2) */}
          {searchQuery.trim().length >= 2 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
                <span>TMAP 검색 결과</span>
                {searchResults.length > 0 && (
                  <span className="text-[11px] text-[#1E60F3] font-black">
                    {searchResults.length}건 검색됨
                  </span>
                )}
              </div>

              {searchResults.length > 0 ? (
                <div className="space-y-1.5 divide-y divide-slate-100 border border-slate-100 rounded-2xl bg-white p-1 shadow-xs">
                  {searchResults.map((poi, idx) => (
                    <button
                      key={`${poi.id}-${idx}`}
                      type="button"
                      onClick={() => handleSelectPoi(poi)}
                      className="w-full text-left p-3 rounded-xl hover:bg-blue-50/70 transition-all flex items-start gap-2.5 cursor-pointer group active:scale-[0.99]"
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#1E60F3] group-hover:text-white transition-colors">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-[#1E60F3] transition-colors">
                          {poi.name}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {poi.address}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 group-hover:text-[#1E60F3] shrink-0 self-center">
                        선택 ➔
                      </span>
                    </button>
                  ))}
                </div>
              ) : !isSearching ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                  <p className="text-xs font-bold text-slate-600">
                    {searchError || '검색된 장소가 없습니다.'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    건물명이나 역 이름으로 간결하게 검색해 보세요.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ========================================================= */}
          {/* Frequently Visited Presets Section (Always visible)       */}
          {/* ========================================================= */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#1E60F3]" />
                <span>자주 가는 거점 퀵 선택</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                원터치 즉시 확정
              </span>
            </div>

            {/* Prominent High-Density 3-Column Card Grid */}
            <div className="grid grid-cols-3 gap-2">
              {/* Home Slot */}
              <button
                type="button"
                onClick={handleSelectHome}
                className={`min-h-[64px] p-2.5 rounded-2xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-2xs ${
                  currentSelectedId === 'slot_home'
                    ? 'border-2 border-[#1E60F3] bg-blue-50/40 text-[#1E60F3] font-bold shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
                title={homeLocation?.name ? `자택: ${homeLocation.name}` : '자택 등록'}
              >
                <div className="flex items-center justify-center gap-1 w-full min-w-0">
                  <Home className="w-3 h-3 text-slate-500 shrink-0 group-hover:text-[#1E60F3]" />
                  <span className="text-xs font-bold tracking-tight text-slate-800 truncate">
                    자택
                  </span>
                </div>
                <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 truncate w-full mt-0.5">
                  {homeLocation?.name ? homeLocation.name : '등록 필요'}
                </span>
              </button>

              {/* All Preset Chips */}
              {presets.map((p, idx) => {
                const isHQ = !p.vehicle_no && !p.vehicleNo;
                const isSelected = currentSelectedId === p.id;
                return (
                  <button
                    key={`${p.id}-${idx}`}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`min-h-[64px] p-2.5 rounded-2xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-2xs ${
                      isSelected
                        ? 'border-2 border-[#1E60F3] bg-blue-50/40 text-[#1E60F3] font-bold shadow-xs'
                        : 'bg-white border-slate-200 hover:border-[#1E60F3]/60 hover:bg-blue-50/30'
                    }`}
                    title={`${p.name} (${p.address || p.name})`}
                  >
                    <span className="text-xs font-bold tracking-tight text-slate-800 group-hover:text-[#1E60F3] truncate w-full transition-colors">
                      {p.shortName}
                    </span>

                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                        isHQ
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-blue-50 text-[#1E60F3]'
                      }`}
                    >
                      {isHQ ? '공통' : '개인'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
          <span>거점을 터치하면 {isOrigin ? '출발지' : '목적지'}로 즉시 설정됩니다.</span>
          <span className="text-slate-400 font-bold">TMAP 실시간</span>
        </div>
      </div>
    </div>
  );
};
