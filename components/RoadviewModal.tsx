'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LocationPreset } from '@/types';
import {
  X,
  Search,
  MapPin,
  Eye,
  Home,
  Navigation,
  Clock,
  Sparkles,
  Loader2,
  Clipboard,
  ExternalLink,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { sanitizeSearchQuery } from './CustomPresetModal';

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

  // Clipboard Address State
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isResolvingClipboard, setIsResolvingClipboard] = useState(false);

  // Recent Searches
  const [recentList, setRecentList] = useState<RecentDestination[]>([]);

  // Carousel Pagination State
  const [currentPage, setCurrentPage] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Official Kakao Roadview Deep Link Handler
  const openRoadview = (lat: number, lng: number) => {
    if (!lat || !lng) return;
    haptics.successPulse();
    const url = `https://map.kakao.com/link/roadview/${lat},${lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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

  // Load Recent Searches & Clipboard when modal opens
  useEffect(() => {
    if (isOpen) {
      // 1. Load Recent Searches
      if (propRecentDestinations && propRecentDestinations.length > 0) {
        setRecentList(propRecentDestinations);
      } else {
        try {
          const stored = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setRecentList(parsed);
            }
          }
        } catch (e) {
          console.warn('Failed to load recent destinations for roadview:', e);
        }
      }

      // 2. Check Clipboard for copied address text
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard
          .readText()
          .then((text) => {
            const trimmed = text?.trim();
            if (trimmed && trimmed.length > 3 && trimmed.length < 100) {
              // Heuristic: check if looks like address or place
              setCopiedAddress(trimmed);
            }
          })
          .catch(() => {
            // Clipboard permission might be denied or not available
          });
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

    if (roadviewSearchCache.has(query)) {
      setSearchResults(roadviewSearchCache.get(query)!);
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
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error('검색 서버 응답 오류');
        }

        const data = await res.json();
        const pois: PoiResult[] = (data.pois || []).map((poi: any) => ({
          id: poi.id || `poi_${Math.random()}`,
          name: poi.name,
          address: poi.address,
          lat: poi.lat,
          lng: poi.lng,
        }));

        roadviewSearchCache.set(query, pois);
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
    }, 280);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [searchQuery]);

  // Handle Copied Address Roadview Click
  const handleOpenCopiedAddress = async () => {
    if (!copiedAddress) return;
    setIsResolvingClipboard(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(copiedAddress)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.pois && data.pois.length > 0) {
          const first = data.pois[0];
          openRoadview(first.lat, first.lng);
          return;
        }
      }
      alert(`'${copiedAddress}'의 좌표를 찾을 수 없습니다. 검색창에 검색해 보세요.`);
    } catch (e) {
      console.error('Failed to resolve copied address coordinates:', e);
      alert('주소 검색 중 오류가 발생했습니다.');
    } finally {
      setIsResolvingClipboard(false);
    }
  };

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-300 p-0 sm:p-4">
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 shadow-2xs">
              <Eye className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                현장 로드뷰
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                승하차 현장 및 진입로 사전 답사
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition flex items-center justify-center cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Real-time POI Search Bar */}
        <div className="p-4 border-b border-slate-100/80 bg-slate-50/60 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="장소명 또는 주소 검색"
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200/90 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/15 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {searchQuery.trim().length >= 2 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-2xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
              {isSearching ? (
                <div className="p-4 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-[#1E60F3]" />
                  <span>장소 검색 중...</span>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((poi) => (
                  <div
                    key={poi.id}
                    onClick={() => openRoadview(poi.lat, poi.lng)}
                    className="p-3 text-left hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-2.5 cursor-pointer group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 group-hover:text-[#1E60F3] truncate">
                        {poi.name}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">{poi.address}</div>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 group-hover:bg-[#1E60F3] group-hover:text-white transition-all shadow-2xs">
                      <Eye className="w-4 h-4 stroke-[2]" />
                    </div>
                  </div>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick Survey Section (복사한 주소 & 현재 목적지 카드) */}
          <div className="space-y-2">
            {/* 1. 복사한 주소 카드 (클립보드 감지 시) */}
            {copiedAddress && (
              <div
                onClick={handleOpenCopiedAddress}
                className="w-full p-3 rounded-2xl bg-gradient-to-r from-blue-50/70 to-indigo-50/40 border border-blue-200/70 flex items-center justify-between gap-3 cursor-pointer hover:border-[#1E60F3] transition-all duration-150 active:scale-98 group shadow-2xs"
                title="복사한 주소 로드뷰 열기"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1E60F3] mb-0.5">
                    <Clipboard className="w-3.5 h-3.5" />
                    <span>복사한 주소</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {copiedAddress}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenCopiedAddress();
                  }}
                  disabled={isResolvingClipboard}
                  className="w-9 h-9 rounded-xl bg-[#1E60F3] text-white hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                  title="로드뷰 보기"
                >
                  {isResolvingClipboard ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Eye className="w-4 h-4 stroke-[2]" />
                  )}
                </button>
              </div>
            )}

            {/* 2. 현재 운행 목적지 카드 */}
            {currentDestination && (
              <div
                onClick={() => openRoadview(currentDestination.lat, currentDestination.lng)}
                className="w-full p-3 rounded-2xl bg-white border-2 border-[#1E60F3]/40 hover:border-[#1E60F3] flex items-center justify-between gap-3 cursor-pointer transition-all duration-150 active:scale-98 group shadow-xs"
                title="현재 운행 목적지 로드뷰 열기"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1E60F3] mb-0.5">
                    <Navigation className="w-3.5 h-3.5 fill-[#1E60F3]" />
                    <span>현재 운행 목적지</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {currentDestination.shortName || currentDestination.name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {currentDestination.address || currentDestination.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRoadview(currentDestination.lat, currentDestination.lng);
                  }}
                  className="w-9 h-9 rounded-xl bg-blue-50 text-[#1E60F3] hover:bg-[#1E60F3] hover:text-white transition-all active:scale-95 flex items-center justify-center shrink-0 shadow-2xs cursor-pointer group-hover:bg-[#1E60F3] group-hover:text-white"
                  title="로드뷰 보기"
                >
                  <Eye className="w-4 h-4 stroke-[2]" />
                </button>
              </div>
            )}
          </div>

          {/* 최근 검색 (2열 카드 그리드) */}
          {recentList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-bold text-slate-700 px-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>최근 검색</span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    ({recentList.length})
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recentList.slice(0, 4).map((item, idx) => (
                  <div
                    key={`recent-${item.id || item.name}-${idx}`}
                    onClick={() => openRoadview(item.lat, item.lng)}
                    className="p-2.5 rounded-2xl border border-slate-200 bg-white hover:border-[#1E60F3]/60 hover:bg-blue-50/20 active:scale-95 transition-all flex items-center justify-between gap-2 cursor-pointer shadow-2xs group"
                    title={`${item.name} 로드뷰 열기`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-800 group-hover:text-[#1E60F3] truncate transition-colors">
                        {item.shortName || item.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {item.address || item.name}
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0 group-hover:bg-[#1E60F3] group-hover:text-white transition-colors">
                      <Eye className="w-3.5 h-3.5 stroke-[2]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 자주 가는 거점 퀵 선택 (4행 x 3열 = 12개 슬롯 그리드) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm font-bold text-slate-700 px-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#1E60F3]" />
                <span>자주 가는 거점 퀵 선택</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                탭하여 로드뷰 호출
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
                  <div key={pageIdx} className="w-full shrink-0 px-1 py-1">
                    <div className="grid grid-cols-3 gap-2 content-start">
                      {pageSlots.map((slot, sIdx) => {
                        if (slot.type === 'home') {
                          if (!homeLocation) return null;
                          return (
                            <button
                              key="slot_home"
                              type="button"
                              onClick={() => openRoadview(homeLocation.lat, homeLocation.lng)}
                              className="min-h-[54px] sm:min-h-[58px] p-2 rounded-2xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-2xs bg-white border-slate-200 hover:border-[#1E60F3]/60 hover:bg-blue-50/20"
                              title={`자택: ${homeLocation.name} 로드뷰`}
                            >
                              <div className="flex items-center justify-center gap-1 w-full min-w-0">
                                <Home className="w-3 h-3 text-slate-500 shrink-0 group-hover:text-[#1E60F3]" />
                                <span className="text-sm font-bold tracking-tight text-slate-800 truncate">
                                  자택
                                </span>
                              </div>
                              <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 truncate w-full mt-0.5">
                                {homeLocation.name}
                              </span>
                            </button>
                          );
                        }

                        const p = slot.preset;
                        const isHQ = Boolean(
                          p.isCommon || p.type === 'common' || p.isGlobal || (!p.vehicle_no && !p.vehicleNo)
                        );

                        return (
                          <button
                            key={`${p.id}-${sIdx}`}
                            type="button"
                            onClick={() => openRoadview(p.lat, p.lng)}
                            className="min-h-[54px] sm:min-h-[58px] p-2 rounded-2xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-150 active:scale-95 group shadow-2xs bg-white border-slate-200 hover:border-[#1E60F3]/60 hover:bg-blue-50/30"
                            title={`${p.fullName || p.name} 로드뷰 보기`}
                          >
                            <span className="text-sm font-bold tracking-tight text-slate-800 group-hover:text-[#1E60F3] truncate w-full transition-colors">
                              {p.shortName || p.name}
                            </span>

                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                                isHQ ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-[#1E60F3]'
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
                    className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                      currentPage === i
                        ? 'w-6 bg-[#1E60F3] shadow-[0_2px_8px_rgba(30,96,243,0.35)]'
                        : 'w-2 bg-slate-200 hover:bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
          <span>항목을 터치하면 해당 위치의 카카오 로드뷰가 새 창으로 열립니다.</span>
          <span className="text-slate-400 font-bold flex items-center gap-1">
            <span>카카오맵</span>
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
};
