'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LocationPreset } from '@/types';
import {
  sanitizeSearchQuery,
  getCachedTmapPoisClient,
  searchTmapPoisClient,
} from '@/lib/places/tmapSearchEngine';
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
  isPackage?: boolean;
  packageData?: LocationPreset['packageData'];
}

interface LocationSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: 'origin' | 'destination' | 'waypoint';
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
const PRESETS_PER_PAGE = 12; // 3 columns x 4 rows

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
  const [isLocatingCurrent, setIsLocatingCurrent] = useState(false);

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

    const centerLat = homeLocation?.lat || 37.5665;
    const centerLng = homeLocation?.lng || 126.9780;

    // 0ms Unified Cache hit
    const cached = getCachedTmapPoisClient(query, centerLat, centerLng);
    if (cached) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
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
        const pois = await searchTmapPoisClient(query, {
          lat: centerLat,
          lng: centerLng,
          signal: controller.signal,
        });
        setSearchResults(pois);
        if (pois.length === 0) {
          setSearchError('추천 검색 결과가 없습니다.');
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
      { type: 'current_location' as const },
      { type: 'home' as const },
      ...localPresets.map((preset) => ({ type: 'preset' as const, preset })),
    ];
  }, [localPresets]);

  const totalPages = Math.max(1, Math.ceil(allSlots.length / PRESETS_PER_PAGE));

  const pages = useMemo(() => {
    const result: (typeof allSlots)[] = [];
    for (let i = 0; i < allSlots.length; i += PRESETS_PER_PAGE) {
      result.push(allSlots.slice(i, i + PRESETS_PER_PAGE));
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
      shortName: preset.shortName || preset.name,
      address: preset.address || preset.name,
      lat: preset.lat,
      lng: preset.lng,
      category: preset.category,
      isPackage: preset.isPackage,
      packageData: preset.packageData,
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

  // Handler: Selecting Current GPS Location (현위치)
  const handleSelectCurrentLocation = () => {
    haptics.mediumTap();
    setIsLocatingCurrent(true);

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setIsLocatingCurrent(false);
      alert('이 브라우저에서는 위치 서비스를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let resolvedAddress = `GPS 수신 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

        try {
          const res = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.address) {
              resolvedAddress = data.address;
            }
          }
        } catch (e) {
          console.warn('Reverse geocode error:', e);
        }

        const locationData: SelectedLocationData = {
          id: 'gps_current',
          name: '현위치',
          shortName: '현위치',
          address: resolvedAddress,
          lat: latitude,
          lng: longitude,
          category: 'CUSTOM',
        };

        setIsLocatingCurrent(false);
        haptics.successPulse();
        recordRecentSearch(locationData);
        onSelectLocation(locationData);
        onClose();
      },
      (error) => {
        console.warn('GPS location error:', error);
        setIsLocatingCurrent(false);
        haptics.errorAlert();
        alert('현재 위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.');
      },
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 30000,
      }
    );
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
  const isWaypoint = target === 'waypoint';

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none overscroll-contain driver-modal-backdrop"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#F6F8FC] rounded-3xl shadow-2xl border border-slate-100/90 overflow-hidden flex flex-col h-[88dvh] max-h-[88dvh] driver-modal-card"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* Sticky Pinned Header & TMAP Search Input Container        */}
        {/* ========================================================= */}
        <div className="flex-shrink-0 sticky top-0 z-20 bg-[#F6F8FC]">
          {/* 1. Modal Header (Selection Mode Icon & Close Button) */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <img
                src={
                  isOrigin
                    ? '/images/icons/driver_ui/icon_origin.png'
                    : '/images/icons/driver_ui/icon_destination.png'
                }
                alt={isOrigin ? '출발지 아이콘' : '목적지 아이콘'}
                aria-hidden="true"
                draggable={false}
                className="w-12 h-12 object-contain shrink-0 select-none pointer-events-none"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                    {isOrigin ? '출발지 선택' : isWaypoint ? '경유지 선택' : '목적지 선택'}
                  </h3>
                </div>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {isWaypoint ? '경유할 장소나 주소를 검색하세요.' : '주소를 검색하거나 저장된 거점을 선택하세요.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#EDF1F7] hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition-colors active:scale-95"
              title="닫기"
              aria-label="닫기"
            >
              <X className="w-4 h-4 stroke-[2.4]" />
            </button>
          </div>

          {/* 2. Real-time TMAP Search Input Bar */}
          <div className="px-5 pb-2 pt-1 bg-[#F6F8FC]">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none stroke-[2]" />
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="장소명, 지하철역, 건물명 검색 (예: 포시즌스호텔, 코엑스)"
                className="w-full h-12 pl-10 pr-10 bg-white border border-slate-100/90 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-medium outline-none focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 transition-all shadow-[0_3px_14px_rgba(15,23,42,0.04)]"
              />
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-[#0055FF] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
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
          className="px-5 py-3 space-y-5 overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
          onTouchMove={handleScrollTouch}
        >
          {/* 1-Tap '현위치로 설정' Quick Action Card (Always visible before active search query) */}
          {searchQuery.trim().length < 2 && (
            <button
              type="button"
              onClick={handleSelectCurrentLocation}
              disabled={isLocatingCurrent}
              className="w-full p-4 rounded-3xl border border-slate-100/90 bg-white hover:border-blue-200 hover:bg-[#FBFDFF] active:scale-[0.99] transition-all flex items-center justify-between group shadow-[0_4px_18px_rgba(15,23,42,0.04)] cursor-pointer text-left"
              title="현재 GPS 위치를 선택"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-[#0055FF] text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,85,255,0.24)]">
                  {isLocatingCurrent ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin text-white" />
                  ) : (
                    <Navigation className="w-4.5 h-4.5 fill-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-[15px] font-extrabold text-slate-900 group-hover:text-[#0055FF] transition-colors">
                      현위치로 설정
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#EBF3FF] text-[#0055FF]">
                      GPS 실시간
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
                    현재 내 GPS 수신 위치를 {isOrigin ? '출발지' : '위치'}로 즉시 지정합니다.
                  </p>
                </div>
              </div>
              <span className="text-xs sm:text-[13px] font-extrabold text-[#0055FF] shrink-0 ml-2">
                {isLocatingCurrent ? '수신 중...' : '선택 →'}
              </span>
            </button>
          )}

          {/* Search Results (If query length >= 2) */}
          {searchQuery.trim().length >= 2 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs sm:text-[13px] font-extrabold text-slate-700 px-1">
                <span>검색 결과</span>
                {searchResults.length > 0 && (
                  <span className="text-[11px] text-[#0055FF] font-black">
                    {searchResults.length}건 검색됨
                  </span>
                )}
              </div>

              {searchResults.length > 0 ? (
                <div className="space-y-1.5 divide-y divide-slate-100 border border-slate-100/90 rounded-3xl bg-white p-1.5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
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
                        className="w-full text-left p-3 rounded-2xl hover:bg-blue-50/70 transition-all flex items-start gap-2.5 cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#0055FF] group-hover:text-white transition-colors">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold text-slate-900 truncate group-hover:text-[#0055FF] transition-colors">
                            {poi.name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
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
                                ? 'fill-[#FFB800] stroke-[#FFB800] text-[#FFB800]'
                                : 'stroke-slate-300 fill-none text-slate-300 hover:stroke-slate-400'
                                }`}
                            />
                          </button>
                          <span className="text-[11px] font-bold text-slate-400 group-hover:text-[#0055FF] shrink-0 ml-1">
                            선택 →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !isSearching ? (
                <div className="text-center py-8 bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.04)] space-y-1.5">
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
          {/* [태스크 4] '최근 검색' 섹션 (최대 8개 가로 스크롤)        */}
          {/* ========================================================= */}
          {recentSearches.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs sm:text-[13px] font-bold text-slate-700 px-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-800">최근 검색</span>
                  <span className="text-xs font-semibold text-slate-400">
                    ({recentSearches.length})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleClearRecentSearches}
                  className="text-xs font-medium text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                >
                  전체 삭제
                </button>
              </div>

              {/* 3-Column Fixed Grid (No Horizontal Scroll) */}
              <div className="grid grid-cols-3 gap-2.5 pt-0.5">
                {recentSearches.slice(0, 3).map((item, idx) => {
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
                      className="min-w-0 p-3.5 rounded-2xl border border-slate-100/90 bg-white hover:border-blue-200 hover:bg-[#FBFDFF] active:scale-95 transition-all flex flex-col justify-between cursor-pointer relative group shadow-[0_3px_14px_rgba(15,23,42,0.04)]"
                      title={`${item.name} (${item.address})`}
                    >
                      <div className="flex items-start justify-between gap-1 w-full">
                        <span className="text-sm font-extrabold text-slate-900 group-hover:text-[#0055FF] truncate transition-colors flex-1 pr-0.5">
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
                            className={`w-4 h-4 transition-all duration-200 ${isFav
                              ? 'fill-[#FFB800] stroke-[#FFB800] text-[#FFB800]'
                              : 'stroke-slate-300 fill-none text-slate-300 hover:stroke-slate-400'
                              }`}
                          />
                        </button>
                      </div>

                      <p className="text-[11px] font-medium text-slate-400 truncate mt-1">
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
            <div className="flex items-center justify-between text-sm sm:text-[15px] font-extrabold text-slate-900 px-1">
              <span>자주 가는 거점 퀵 선택</span>
              {onOpenManagePresets && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    onOpenManagePresets();
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-slate-100/90 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-[11px] font-bold transition-all active:scale-95 cursor-pointer shadow-[0_2px_8px_rgba(15,23,42,0.03)]"
                  title="거점 순서 변경 및 관리"
                >
                  <Settings2 className="w-3.5 h-3.5 text-slate-600" />
                </button>
              )}
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
                  <div key={pageIdx} className="w-full shrink-0 py-0.5">
                    <div className="grid grid-cols-3 gap-2.5">
                      {pageSlots.map((slot, sIdx) => {
                        if (slot.type === 'current_location') {
                          const isSelected = currentSelectedId === 'gps_current';
                          return (
                            <button
                              key="slot_current_location"
                              type="button"
                              onClick={handleSelectCurrentLocation}
                              disabled={isLocatingCurrent}
                              className={`min-h-[60px] sm:min-h-[64px] px-2.5 py-3 rounded-2xl border text-center flex flex-col justify-center items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-[0_3px_12px_rgba(15,23,42,0.04)] ${isSelected
                                ? 'border-2 border-[#0055FF] bg-[#EEF4FF] text-[#0055FF] font-bold'
                                : 'bg-[#EEF4FF] border-[#DCE8FF] hover:border-[#0055FF]/50 hover:bg-[#E4EEFF]'
                                }`}
                              title="현재 위치 (GPS)로 설정"
                            >
                              <div className="flex items-center justify-center gap-1.5 w-full min-w-0">
                                {isLocatingCurrent ? (
                                  <Loader2 className="w-3.5 h-3.5 text-[#0055FF] animate-spin shrink-0" />
                                ) : (
                                  <Navigation className="w-3.5 h-3.5 text-[#0055FF] fill-[#0055FF] shrink-0" />
                                )}
                                <span className="text-sm font-extrabold tracking-tight text-slate-900 group-hover:text-[#0055FF] truncate">
                                  현위치
                                </span>
                              </div>
                              <span className="text-[11px] font-bold text-[#0055FF] truncate w-full mt-1 leading-none">
                                실시간 GPS
                              </span>
                            </button>
                          );
                        }

                        if (slot.type === 'home') {
                          return (
                            <button
                              key="slot_home"
                              type="button"
                              onClick={handleSelectHome}
                              className={`min-h-[60px] sm:min-h-[64px] px-2.5 py-3 rounded-2xl border text-center flex flex-col justify-center items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-[0_3px_12px_rgba(15,23,42,0.04)] ${currentSelectedId === 'slot_home'
                                ? 'border-2 border-[#0055FF] bg-blue-50/40 text-[#0055FF] font-bold'
                                : 'bg-white border-slate-100/90 hover:border-blue-200 hover:bg-[#FBFDFF]'
                                }`}
                              title={homeLocation?.name ? `자택: ${homeLocation.name}` : '자택 등록'}
                            >
                              <div className="flex items-center justify-center gap-1 w-full min-w-0">
                                <span className="text-sm font-extrabold tracking-tight text-slate-900 group-hover:text-[#0055FF] truncate">
                                  자택
                                </span>
                              </div>
                              <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-600 truncate w-full mt-1 leading-none">
                                {homeLocation?.name ? homeLocation.name : '등록 필요'}
                              </span>
                            </button>
                          );
                        }

                        const p = slot.preset;
                        const isViaPreset = Boolean(
                          p.isPackage ||
                          p.is_package ||
                          (p.packageData?.waypoints && p.packageData.waypoints.length > 0) ||
                          (p.package_data?.waypoints && p.package_data.waypoints.length > 0) ||
                          p.id?.startsWith('pkg-') ||
                          p.full_name?.includes('➔') ||
                          p.name?.includes('➔')
                        );
                        const isDefault = Boolean(p.isCommon || p.type === 'common' || p.isGlobal || (!p.vehicle_no && !p.vehicleNo));
                        const isSelected = currentSelectedId === p.id;

                        return (
                          <button
                            key={`${p.id}-${sIdx}`}
                            type="button"
                            onClick={() => handleSelectPreset(p)}
                            className={`min-h-[60px] sm:min-h-[64px] px-2.5 py-3 rounded-2xl border text-center flex flex-col justify-center items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-[0_3px_12px_rgba(15,23,42,0.04)] ${isSelected
                              ? 'border-2 border-[#0055FF] bg-blue-50/40 text-[#0055FF] font-bold'
                              : 'bg-white border-slate-100/90 hover:border-blue-200 hover:bg-[#FBFDFF]'
                              }`}
                            title={
                              isViaPreset
                                ? (p.full_name || p.fullName || p.name)
                                : `${p.fullName || p.full_name || p.name} (${p.address || p.name})`
                            }
                          >
                            <div className="flex items-center justify-center gap-1 w-full min-w-0">
                              {isViaPreset && (
                                <span className="text-xs text-amber-600 font-bold shrink-0 leading-none" title="경로 패키지">
                                  ⤳
                                </span>
                              )}
                              <span className="text-sm font-extrabold tracking-tight text-slate-900 group-hover:text-[#0055FF] truncate transition-colors">
                                {p.shortName || p.name}
                              </span>
                            </div>

                            {isViaPreset ? (
                              <span className="text-[11px] font-semibold text-amber-600 mt-1 leading-none">
                                경유
                              </span>
                            ) : isDefault ? (
                              <span className="text-[11px] font-medium text-slate-400 mt-1 leading-none">
                                공통
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-[#0055FF] mt-1 leading-none">
                                개인
                              </span>
                            )}
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
                    ? 'w-7 bg-[#0055FF] shadow-[0_2px_8px_rgba(0,85,255,0.35)]'
                    : 'w-2 bg-slate-200 hover:bg-slate-300'
                    }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="px-5 py-3 bg-[#F6F8FC] border-t border-slate-200/60 text-xs text-slate-400 flex items-center justify-between shrink-0">
          <span className="font-medium">거점을 터치하면 {isOrigin ? '출발지' : '목적지'}로 즉시 설정됩니다.</span>
          <span className="text-[#0055FF] font-bold">실시간 장소 검색</span>
        </div>
      </div>
    </div>
  );
};
