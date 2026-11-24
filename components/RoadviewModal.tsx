'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LocationPreset } from '@/types';
import {
  X,
  Search,
  Eye,
  ArrowUpRight,
  Home,
  Clock,
  Sparkles,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { sanitizeSearchQuery } from './CustomPresetModal';
import { getCachedTmapPoisClient, searchTmapPoisClient } from '@/lib/places/tmapSearchEngine';

export interface RecentDestination {
  id?: string;
  name: string;
  shortName?: string;
  address?: string;
  lat: number;
  lng: number;
  category?: string;
}

interface RoadviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDestination?: LocationPreset | null;
  presets: LocationPreset[];
  recentDestinations?: RecentDestination[];
  homeLocation?: { name: string; address: string; lat: number; lng: number } | null;
}

interface PoiResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const roadviewSearchCache = new Map<string, PoiResult[]>();
const RECENT_SEARCHES_STORAGE_KEY = 'cockpit_recent_searches';
const PRESETS_PER_PAGE = 12; // 3 columns x 4 rows

const DEFAULT_RECENT_DESTINATIONS: RecentDestination[] = [
  { id: 'def-1', name: '뜨락', address: '서울 강남구 영동대로142길 13-3', lat: 37.5218, lng: 127.0568 },
  { id: 'def-2', name: '콘래드', address: '서울 영등포구 국제금융로 10', lat: 37.5251, lng: 126.9265 },
  { id: 'def-3', name: '자택', address: '경기 용인시 수지구 광교마을로 90, 401동 107호', lat: 37.3025, lng: 127.0715 },
  { id: 'def-4', name: '연남CGV', address: '서울 마포구', lat: 37.5582, lng: 126.9255 },
];

export const RoadviewModal: React.FC<RoadviewModalProps> = ({
  isOpen,
  onClose,
  currentDestination,
  presets,
  recentDestinations: propRecentDestinations,
  homeLocation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PoiResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Recent Searches
  const [recentList, setRecentList] = useState<RecentDestination[]>([]);

  // Carousel Pagination State
  const [currentPage, setCurrentPage] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Official Kakao Roadview Deep Link Handler (Safari 빈 탭 생성 방지: 현재 창 이동)
  const openRoadview = (lat: number, lng: number) => {
    if (!lat || !lng) return;
    haptics.successPulse();
    const url = `https://map.kakao.com/link/roadview/${lat},${lng}`;
    window.location.href = url;
  };

  // Body Scroll Lock
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Auto-focus search input with small timeout
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);

    return () => {
      document.body.style.overflow = originalOverflow;
      clearTimeout(timer);
    };
  }, [isOpen]);

  // Load Recent Searches when modal opens
  useEffect(() => {
    if (isOpen) {
      if (propRecentDestinations && propRecentDestinations.length > 0) {
        setRecentList(propRecentDestinations);
      } else {
        try {
          const stored = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setRecentList(parsed);
            } else {
              setRecentList(DEFAULT_RECENT_DESTINATIONS);
            }
          } else {
            setRecentList(DEFAULT_RECENT_DESTINATIONS);
          }
        } catch (e) {
          console.warn('Failed to load recent destinations for roadview:', e);
          setRecentList(DEFAULT_RECENT_DESTINATIONS);
        }
      }

      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      setCurrentPage(0);
    }
  }, [isOpen, propRecentDestinations]);

  // Real-time POI Search with Debounce & Cache
  useEffect(() => {
    const rawQuery = searchQuery.trim();
    const query = sanitizeSearchQuery(rawQuery);

    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const cached = getCachedTmapPoisClient(query, 37.5665, 126.9780);
    if (cached) {
      setSearchResults(cached);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const pois = await searchTmapPoisClient(query, {
          lat: 37.5665,
          lng: 126.9780,
          signal: controller.signal,
        });
        setSearchResults(pois);
        if (pois.length === 0) {
          setSearchError('검색 결과가 없습니다.');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Roadview POI Search error:', err);
          setSearchError('장소 검색 중 오류가 발생했습니다.');
        }
      } finally {
        setIsSearching(false);
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

  // Carousel Pagination Slots Construction (Home + Presets)
  const allSlots = useMemo(() => {
    return [
      ...(homeLocation ? [{ type: 'home' as const }] : []),
      ...presets.map((preset) => ({ type: 'preset' as const, preset })),
    ];
  }, [presets, homeLocation]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 driver-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg bg-[#F6F8FC] rounded-3xl shadow-2xl border border-slate-100/90 max-h-[90vh] sm:max-h-[88vh] flex flex-col overflow-hidden select-none driver-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 bg-[#F6F8FC] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/images/icons/driver_ui/icon_roadview_v02.png"
              alt="로드뷰 아이콘"
              aria-hidden="true"
              draggable={false}
              className="w-14 h-14 object-contain shrink-0 select-none pointer-events-none"
            />
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                현장 로드뷰
              </h2>
              <p className="text-xs font-medium text-slate-400 mt-0.5">
                터치 한 번, 바로 거리뷰
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#EDF1F7] hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 transition flex items-center justify-center cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-4 h-4 stroke-[2.4]" />
          </button>
        </div>

        {/* Real-time POI Search Bar */}
        <div className="px-5 pb-2 bg-[#F6F8FC] shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none stroke-[2]" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="장소명 또는 주소 검색"
              className="w-full h-12 pl-10 pr-9 bg-white border border-slate-100/90 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 transition-all shadow-[0_3px_14px_rgba(15,23,42,0.04)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {searchQuery.trim().length >= 2 && (
            <div className="mt-2 bg-white border border-slate-100/90 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.08)] max-h-56 overflow-y-auto divide-y divide-slate-100">
              {isSearching ? (
                <div className="p-4 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-[#0055FF]" />
                  <span>장소 검색 중...</span>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((poi, idx) => (
                  <button
                    key={`roadview-poi-${poi.id}-${idx}`}
                    type="button"
                    onClick={() => openRoadview(poi.lat, poi.lng)}
                    className="w-full p-3.5 text-left hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-2.5 cursor-pointer group active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold text-slate-900 group-hover:text-[#0055FF] truncate">
                        {poi.name}
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">{poi.address}</div>
                    </div>
                    <div className="shrink-0 p-1.5 text-[#0055FF] group-hover:scale-110 transition-transform">
                      <Eye aria-hidden="true" className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.2]" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-xs font-medium text-slate-400">
                  {searchError || '검색 결과가 없습니다.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
          {/* Quick Destination Card (현재 운행 목적지 카드 전체 터치) */}
          {currentDestination && currentDestination.lat && currentDestination.lng && (
            <div className="space-y-2">
              <span className="flex items-center justify-between text-xs sm:text-[13px] font-semibold text-slate-500 px-1">
                현재 운행 목적지
              </span>
              <button
                type="button"
                onClick={() => openRoadview(currentDestination.lat!, currentDestination.lng!)}
                className="w-full px-4 py-3.5 rounded-2xl bg-white border-[1.5px] border-[#0055FF] hover:bg-blue-50/20 transition-all text-left flex items-center justify-between group active:scale-[0.99] cursor-pointer shadow-[0_4px_16px_rgba(0,85,255,0.08)]"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#0055FF] shrink-0" />
                    <span className="text-base font-extrabold text-slate-900 truncate group-hover:text-[#0055FF] transition-colors">
                      {currentDestination.shortName || currentDestination.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium truncate mt-0.5 pl-4">
                    {currentDestination.address || currentDestination.fullName || currentDestination.name}
                  </p>
                </div>
                <div className="shrink-0 p-1 text-[#0055FF] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
                  <ArrowUpRight aria-hidden="true" className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[2.5]" />
                </div>
              </button>
            </div>
          )}

          {/* 최근 검색 (2열 볼륨감 있는 화이트 카드 그리드 - 전면 탭 인터랙션) */}
          {recentList.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs sm:text-[13px] font-semibold text-slate-500 px-1">
                <span className="flex items-center gap-1.5">
                  <span>최근 검색</span>
                  <span className="text-xs font-semibold text-slate-400">
                    ({recentList.length})
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {recentList.slice(0, 4).map((item, idx) => (
                  <button
                    key={`recent-${item.id || item.name}-${idx}`}
                    type="button"
                    onClick={() => openRoadview(item.lat, item.lng)}
                    className="p-3.5 rounded-2xl border border-slate-100/90 bg-white hover:border-blue-200 hover:bg-[#FBFDFF] active:scale-[0.98] transition-all flex flex-col justify-between text-left cursor-pointer shadow-[0_3px_14px_rgba(15,23,42,0.04)] group"
                    title={`${item.name} 거리뷰 보기`}
                  >
                    <div className="text-xs sm:text-[13px] font-extrabold text-slate-900 group-hover:text-[#0055FF] truncate transition-colors w-full">
                      {item.shortName || item.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-1 w-full">
                      {item.address || item.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 자주 가는 거점 퀵 선택 (4행 x 3열 = 12개 슬롯 그리드) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs sm:text-[13px] font-semibold text-slate-500 px-1">
              <span className="flex items-center gap-1.5">
                <span>자주 가는 거점 퀵 선택</span>
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                탭하여 거리뷰 호출
              </span>
            </div>

            {/* 3-Column x 4-Row (12 slots) Grid with Horizontal Slider */}
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
                    <div className="grid grid-cols-3 gap-2.5 content-start">
                      {pageSlots.map((slot, sIdx) => {
                        if (slot.type === 'home') {
                          if (!homeLocation) return null;
                          return (
                            <button
                              key="slot_home"
                              type="button"
                              onClick={() => openRoadview(homeLocation.lat, homeLocation.lng)}
                              className="min-h-[58px] sm:min-h-[62px] px-2.5 py-3 rounded-2xl border border-slate-100/90 bg-white hover:border-blue-200 hover:bg-[#FBFDFF] shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-center flex flex-col justify-center items-center cursor-pointer transition-all duration-150 active:scale-[0.98] group"
                              title={`자택: ${homeLocation.name} 거리뷰`}
                            >
                              <div className="flex items-center justify-center gap-1 w-full min-w-0">
                                <Home className="w-3 h-3 text-slate-500 shrink-0 group-hover:text-[#0055FF]" />
                                <span className="text-xs sm:text-[13px] font-extrabold tracking-tight text-slate-900 group-hover:text-[#0055FF] truncate">
                                  자택
                                </span>
                              </div>
                              <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-600 truncate w-full mt-1 leading-none">
                                {homeLocation.name}
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
                        const isDefault = Boolean(
                          p.isCommon || p.type === 'common' || p.isGlobal || (!p.vehicle_no && !p.vehicleNo)
                        );

                        return (
                          <button
                            key={`${p.id}-${sIdx}`}
                            type="button"
                            onClick={() => openRoadview(p.lat, p.lng)}
                            className="min-h-[58px] sm:min-h-[62px] px-2.5 py-3 rounded-2xl border border-slate-100/90 bg-white hover:border-blue-200 hover:bg-[#FBFDFF] shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-center flex flex-col justify-center items-center cursor-pointer transition-all duration-150 active:scale-[0.98] group"
                            title={`${p.fullName || p.name} 거리뷰 보기`}
                          >
                            <div className="flex items-center justify-center gap-1 w-full min-w-0">
                              {isViaPreset && (
                                <span className="text-xs text-amber-600 font-bold shrink-0 leading-none" title="경로 패키지">
                                  ⤳
                                </span>
                              )}
                              <span className="text-xs sm:text-[13px] font-extrabold tracking-tight text-slate-900 group-hover:text-[#0055FF] truncate transition-colors">
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

            {/* Capsule Indicator */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-2 pb-1">
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
                      ? 'w-6 bg-[#0055FF] shadow-[0_2px_8px_rgba(0,85,255,0.35)]'
                      : 'w-2 bg-slate-200 hover:bg-slate-300'
                      }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="px-5 py-3 bg-[#F6F8FC] border-t border-slate-200/50 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
          <span>항목을 터치하면 해당 위치의 카카오 거리뷰가 새 창으로 열립니다.</span>
          <span className="text-slate-400 font-bold flex items-center gap-1">
            <span>카카오맵</span>
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
};
