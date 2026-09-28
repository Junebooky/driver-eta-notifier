'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Clock,
  Star,
  Settings2,
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
  onTogglePresetFavorite?: (preset: LocationPreset, action: 'add' | 'remove') => void;
  onOpenManagePresets?: () => void;
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
const RECENT_SEARCHES_STORAGE_KEY = 'cockpit_recent_searches';
const ITEMS_PER_PAGE = 21; // 3 columns x 7 rows

export const LocationSearchModal: React.FC<LocationSearchModalProps> = ({
  isOpen,
  onClose,
  target,
  presets,
  homeLocation,
  currentSelectedId,
  onSelectLocation,
  onOpenHomeModal,
  onTogglePresetFavorite,
  onOpenManagePresets,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PoiResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Local synced presets for 0ms favorite toggle
  const [localPresets, setLocalPresets] = useState<LocationPreset[]>(presets);
  useEffect(() => {
    setLocalPresets(presets);
  }, [presets]);

  // Recent Searches State
  const [recentSearches, setRecentSearches] = useState<SelectedLocationData[]>([]);

  // Carousel Pagination State
  const [currentPage, setCurrentPage] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

  // Load Recent Searches on Mount or Open
  useEffect(() => {
    if (isOpen) {
      try {
        const stored = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setRecentSearches(parsed);
          }
        }
      } catch (e) {
        console.warn('Failed to load recent searches:', e);
      }
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      setCurrentPage(0);
    }
  }, [isOpen, target]);

  // Record a Selected Location into Recent Searches
  const recordRecentSearch = (item: SelectedLocationData) => {
    try {
      const filtered = recentSearches.filter(
        (x) => x.name !== item.name && x.address !== item.address
      );
      const updated = [item, ...filtered].slice(0, 8);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save recent search to localStorage:', e);
    }
  };

  // Clear All Recent Searches
  const handleClearRecentSearches = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.lightTap();
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch (e) { }
  };

  // Check if a Location is in Presets (Favorites)
  const isFavorite = (loc: { name: string; address?: string; lat?: number; lng?: number }) => {
    return localPresets.some((p) => {
      if (p.name === loc.name) return true;
      if (loc.address && p.address && p.address === loc.address) return true;
      if (loc.lat && loc.lng && Math.abs(p.lat - loc.lat) < 0.0001 && Math.abs(p.lng - loc.lng) < 0.0001) return true;
      return false;
    });
  };

  // Toggle Favorite Handler
  const handleToggleFavorite = async (e: React.MouseEvent, loc: SelectedLocationData) => {
    e.stopPropagation();
    haptics.lightTap();

    const existing = localPresets.find((p) => {
      if (p.name === loc.name) return true;
      if (loc.address && p.address && p.address === loc.address) return true;
      if (loc.lat && loc.lng && Math.abs(p.lat - loc.lat) < 0.0001 && Math.abs(p.lng - loc.lng) < 0.0001) return true;
      return false;
    });

    if (existing) {
      // Remove from presets
      setLocalPresets((prev) => prev.filter((p) => p.id !== existing.id));
      onTogglePresetFavorite?.(existing, 'remove');
      try {
        await fetch(`/api/presets?id=${encodeURIComponent(existing.id)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('Failed to delete preset from server:', err);
      }
    } else {
      // Add to presets
      const newPreset: LocationPreset = {
        id: `custom_${Date.now()}`,
        name: loc.name,
        shortName: loc.shortName || loc.name.slice(0, 8),
        address: loc.address || loc.name,
        lat: loc.lat,
        lng: loc.lng,
        category: 'CUSTOM',
        isGlobal: false,
      };
      setLocalPresets((prev) => [...prev, newPreset]);
      onTogglePresetFavorite?.(newPreset, 'add');
      try {
        await fetch('/api/presets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPreset),
        });
      } catch (err) {
        console.warn('Failed to save preset to server:', err);
      }
    }
  };

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
        const centerLat = homeLocation?.lat || 37.5665;
        const centerLng = homeLocation?.lng || 126.9780;
        const res = await fetch(
          `/api/search?keyword=${encodeURIComponent(query)}&lat=${centerLat}&lng=${centerLng}`,
          {
            signal: controller.signal,
          }
        );

        if (res.ok) {
          const data = await res.json();
          const pois: PoiResult[] = data.pois || [];
          locationSearchCache.set(query, pois);
          setSearchResults(pois);
          if (pois.length === 0) {
            setSearchError('추천 검색 결과가 없습니다.');
          }
        } else {
          setSearchError('검색 서버 응답에 실패했습니다.');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('Location Search error:', err);
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
  }, [searchQuery, homeLocation]);

  // Carousel Pagination Slots Construction
  const allSlots = useMemo(() => {
    return [
      { type: 'home' as const },
      ...localPresets.map((preset) => ({ type: 'preset' as const, preset })),
    ];
  }, [localPresets]);

  const totalPages = Math.max(1, Math.ceil(allSlots.length / ITEMS_PER_PAGE));

  const pages = useMemo(() => {
    const result: (typeof allSlots)[] = [];
    for (let i = 0; i < allSlots.length; i += ITEMS_PER_PAGE) {
      result.push(allSlots.slice(i, i + ITEMS_PER_PAGE));
    }
    return result.length > 0 ? result : [[]];
  }, [allSlots]);

  // Touch Swipe on Carousel
  const handleCarouselTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleCarouselTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
      if (deltaX < 0 && currentPage < totalPages - 1) {
        haptics.lightTap();
        setCurrentPage((prev) => prev + 1);
      } else if (deltaX > 0 && currentPage > 0) {
        haptics.lightTap();
        setCurrentPage((prev) => prev - 1);
      }
    }
  };

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
    const data: SelectedLocationData = {
      id: preset.id,
      name: preset.name,
      shortName: preset.shortName,
      address: preset.address || preset.name,
      lat: preset.lat,
      lng: preset.lng,
      category: preset.category,
    };
    recordRecentSearch(data);
    onSelectLocation(data);
    onClose();
  };

  // Handler: Selecting Home
  const handleSelectHome = () => {
    haptics.lightTap();
    if (homeLocation && homeLocation.name) {
      const data: SelectedLocationData = {
        id: 'slot_home',
        name: homeLocation.name,
        shortName: '자택',
        address: homeLocation.address || homeLocation.name,
        lat: homeLocation.lat,
        lng: homeLocation.lng,
        category: 'CUSTOM',
      };
      recordRecentSearch(data);
      onSelectLocation(data);
      onClose();
    } else if (onOpenHomeModal) {
      onOpenHomeModal();
      onClose();
    }
  };

  // Handler: Selecting a POI Result
  const handleSelectPoi = (poi: PoiResult) => {
    haptics.successPulse();
    const data: SelectedLocationData = {
      id: `poi_${poi.id}`,
      name: poi.name,
      shortName: poi.name.slice(0, 10),
      address: poi.address,
      lat: poi.lat,
      lng: poi.lng,
      category: 'CUSTOM',
    };
    recordRecentSearch(data);
    onSelectLocation(data);
    onClose();
  };

  const isOrigin = target === 'origin';

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none overscroll-contain"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col h-[90dvh] max-h-[90dvh] animate-in slide-in-from-bottom-6 duration-300"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* Sticky Pinned Header & TMAP Search Input Container        */}
        {/* ========================================================= */}
        <div className="flex-shrink-0 sticky top-0 z-20 bg-white border-b border-slate-100">
          {/* 1. Modal Header (Selection Mode Badge & Close Button) */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100/80">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-xs text-white ${isOrigin ? 'bg-slate-700' : 'bg-[#1E60F3]'
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

                  <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                    장소 선택
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  주소를 검색하거나 저장된 거점을 선택하세요.
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

          {/* 2. Real-time TMAP Search Input Bar */}
          <div className="p-4 pb-3 bg-slate-50/50">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="장소명, 지하철역, 건물명 검색 (예: 포시즌스호텔, 코엑스)"
                className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
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
        </div>

        {/* ========================================================= */}
        {/* 3. Modal Scrollable Body: Recent, Presets & POI Search     */}
        {/* ========================================================= */}
        <div
          className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
          onTouchMove={handleScrollTouch}
        >
          {/* Search Results (If query length >= 2) */}
          {searchQuery.trim().length >= 2 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-bold text-slate-700 px-1">
                <span>검색 결과</span>
                {searchResults.length > 0 && (
                  <span className="text-[11px] text-[#1E60F3] font-black">
                    {searchResults.length}건 검색됨
                  </span>
                )}
              </div>

              {searchResults.length > 0 ? (
                <div className="space-y-1.5 divide-y divide-slate-100 border border-slate-100 rounded-2xl bg-white p-1 shadow-xs">
                  {searchResults.map((poi, idx) => {
                    const poiLocationData: SelectedLocationData = {
                      id: `poi_${poi.id}`,
                      name: poi.name,
                      shortName: poi.name.slice(0, 10),
                      address: poi.address,
                      lat: poi.lat,
                      lng: poi.lng,
                      category: 'CUSTOM',
                    };
                    const isFav = isFavorite(poiLocationData);

                    return (
                      <div
                        key={`${poi.id}-${idx}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectPoi(poi)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectPoi(poi);
                          }
                        }}
                        className="w-full text-left p-3 rounded-xl hover:bg-blue-50/70 transition-all flex items-start gap-2.5 cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#1E60F3] group-hover:text-white transition-colors">
                          <MapPin className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 truncate group-hover:text-[#1E60F3] transition-colors">
                            {poi.name}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {poi.address}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 self-center">
                          {/* Favorite Star Button (Prevents closing modal) */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleFavorite(e, poiLocationData)}
                            className="p-1.5 rounded-lg hover:bg-slate-200/70 transition-colors cursor-pointer"
                            title={isFav ? '즐겨찾는 거점에서 제거' : '자주 가는 거점으로 등록'}
                            aria-label="즐겨찾기 토글"
                          >
                            <Star
                              className={`w-4 h-4 transition-all duration-200 ${isFav
                                ? 'fill-[#FEE500] stroke-[#FEE500] text-[#FEE500]'
                                : 'stroke-slate-300 fill-none text-slate-300 hover:stroke-slate-400'
                                }`}
                            />
                          </button>
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-[#1E60F3] shrink-0 ml-1">
                            선택 ➔
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !isSearching ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                  <p className="text-sm font-bold text-slate-600">
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
          {/* [태스크 4] '🕒 최근 검색' 섹션 신설 (최대 8개 가로 스크롤) */}
          {/* ========================================================= */}
          {recentSearches.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-bold text-slate-700 px-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>최근 검색</span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    ({recentSearches.length})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleClearRecentSearches}
                  className="text-[11px] font-medium text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                >
                  전체 삭제
                </button>
              </div>

              {/* Horizontal Scrollable Chips / Cards */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar touch-pan-x">
                {recentSearches.map((item, idx) => {
                  const isFav = isFavorite(item);
                  return (
                    <div
                      key={`recent-${item.id || item.name}-${idx}`}
                      onClick={() => {
                        haptics.lightTap();
                        recordRecentSearch(item);
                        onSelectLocation(item);
                        onClose();
                      }}
                      className="min-w-[150px] max-w-[210px] p-2.5 rounded-2xl border border-slate-200 bg-white hover:border-[#1E60F3]/60 hover:bg-blue-50/20 active:scale-95 transition-all flex flex-col justify-between cursor-pointer shrink-0 relative group shadow-2xs"
                      title={`${item.name} (${item.address})`}
                    >
                      <div className="flex items-start justify-between gap-1 w-full">
                        <span className="text-sm font-bold text-slate-800 group-hover:text-[#1E60F3] truncate transition-colors flex-1 pr-1">
                          {item.shortName || item.name}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => handleToggleFavorite(e, item)}
                          className="p-1 rounded-md hover:bg-slate-100 transition cursor-pointer shrink-0 -mt-1 -mr-1"
                          title={isFav ? '즐겨찾는 거점에서 제거' : '자주 가는 거점으로 등록'}
                          aria-label="즐겨찾기 토글"
                        >
                          <Star
                            className={`w-3.5 h-3.5 transition-all duration-200 ${isFav
                              ? 'fill-[#FEE500] stroke-[#FEE500] text-[#FEE500]'
                              : 'stroke-slate-300 fill-none text-slate-300 hover:stroke-slate-400'
                              }`}
                          />
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 truncate mt-1">
                        {item.address || item.name}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* [태스크 3] '자주 가는 거점 퀵 선택' 캐러셀 & 캡슐형 인디케이터 */}
          {/* ========================================================= */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm font-bold text-slate-700 px-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#1E60F3]" />
                <span>자주 가는 거점 퀵 선택</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                  원터치 즉시 확정
                </span>
                {onOpenManagePresets && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      onOpenManagePresets();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-[11px] font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
                    title="거점 순서 변경 및 관리"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                )}
              </div>
            </div>

            {/* 3-Column Grid with Horizontal Carousel Slider */}
            <div
              className="w-full overflow-hidden select-none touch-pan-y"
              onTouchStart={handleCarouselTouchStart}
              onTouchEnd={handleCarouselTouchEnd}
            >
              <div
                className="flex transition-transform duration-300 ease-out will-change-transform"
                style={{ transform: `translateX(-${currentPage * 100}%)` }}
              >
                {pages.map((pageSlots, pageIdx) => (
                  <div key={pageIdx} className="w-full shrink-0 px-2 py-1.5">
                    <div className="grid grid-cols-3 gap-2">
                      {pageSlots.map((slot, sIdx) => {
                        if (slot.type === 'home') {
                          return (
                            <button
                              key="slot_home"
                              type="button"
                              onClick={handleSelectHome}
                              className={`min-h-[64px] p-2.5 rounded-2xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-2xs ${currentSelectedId === 'slot_home'
                                ? 'border-2 border-[#1E60F3] bg-blue-50/40 text-[#1E60F3] font-bold shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                                }`}
                              title={homeLocation?.name ? `자택: ${homeLocation.name}` : '자택 등록'}
                            >
                              <div className="flex items-center justify-center gap-1 w-full min-w-0">
                                <Home className="w-3 h-3 text-slate-500 shrink-0 group-hover:text-[#1E60F3]" />
                                <span className="text-sm font-bold tracking-tight text-slate-800 truncate">
                                  자택
                                </span>
                              </div>
                              <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 truncate w-full mt-0.5">
                                {homeLocation?.name ? homeLocation.name : '등록 필요'}
                              </span>
                            </button>
                          );
                        }

                        const p = slot.preset;
                        const isHQ = Boolean(p.isCommon || p.type === 'common' || p.isGlobal || (!p.vehicle_no && !p.vehicleNo));
                        const isSelected = currentSelectedId === p.id;

                        return (
                          <button
                            key={`${p.id}-${sIdx}`}
                            type="button"
                            onClick={() => handleSelectPreset(p)}
                            className={`min-h-[64px] p-2.5 rounded-2xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-2xs ${isSelected
                              ? 'border-2 border-[#1E60F3] bg-blue-50/40 text-[#1E60F3] font-bold shadow-xs'
                              : 'bg-white border-slate-200 hover:border-[#1E60F3]/60 hover:bg-blue-50/30'
                              }`}
                            title={`${p.name} (${p.address || p.name})`}
                          >
                            <span className="text-sm font-bold tracking-tight text-slate-800 group-hover:text-[#1E60F3] truncate w-full transition-colors">
                              {p.shortName}
                            </span>

                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${isHQ
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
                ))}
              </div>
            </div>

            {/* Capsule / Pill Page Indicator (Always visible: single pill if 1 page, multiple if > 1 page) */}
            <div className="flex items-center justify-center gap-1.5 pt-3 pb-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setCurrentPage(i);
                  }}
                  aria-label={`페이지 ${i + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${currentPage === i
                    ? 'w-6 bg-[#1E60F3] shadow-[0_2px_8px_rgba(30,96,243,0.35)]'
                    : 'w-2 bg-slate-200 hover:bg-slate-300'
                    }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
          <span>거점을 터치하면 {isOrigin ? '출발지' : '목적지'}로 즉시 설정됩니다.</span>
          <span className="text-slate-400 font-bold">실시간 장소 검색</span>
        </div>
      </div>
    </div>
  );
};
