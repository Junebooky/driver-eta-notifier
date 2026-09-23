'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LocationPreset } from '@/types';
import { X, Search, MapPin, Loader2 } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface CustomPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPreset: (preset: LocationPreset) => void;
  presetToEdit?: LocationPreset | null;
  onUpdatePreset?: (preset: LocationPreset) => void;
  isHomeMode?: boolean;
  onSaveHome?: (home: { name: string; address: string; lat: number; lng: number }) => void;
  isAdmin?: boolean;
}

interface PoiResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * Sanitize search query by stripping commas and dong/ho/floor/building patterns
 * (e.g., '4108동', '101호', 'B1층', '3층', etc.) to ensure building-level TMAP retrieval.
 */
export function sanitizeSearchQuery(query: string): string {
  const detailPattern = /([0-9A-Za-z가-힣]+(?:동|호|층|관))/g;
  const cleanQuery = query
    .replace(detailPattern, '')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanQuery || query;
}

// Client-side in-memory search cache for 0ms instant retrieval
const customPresetSearchCache = new Map<string, PoiResult[]>();

export const CustomPresetModal: React.FC<CustomPresetModalProps> = ({
  isOpen,
  onClose,
  onAddPreset,
  presetToEdit,
  onUpdatePreset,
  isHomeMode = false,
  onSaveHome,
  isAdmin = false,
}) => {
  // Search & Autocomplete State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PoiResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Selected Preset Form State
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // Populate form if presetToEdit is provided
  useEffect(() => {
    if (isOpen) {
      if (presetToEdit) {
        setName(presetToEdit.name);
        setShortName(presetToEdit.shortName);
        setAddress(presetToEdit.address || '');
        setLat(presetToEdit.lat);
        setLng(presetToEdit.lng);
        setSearchQuery('');
        setSearchResults([]);
        setSearchError(null);
      } else {
        setName('');
        setShortName('');
        setAddress('');
        setLat(null);
        setLng(null);
        setSearchQuery('');
        setSearchResults([]);
        setSearchError(null);
      }
    }
  }, [isOpen, presetToEdit]);

  // Real-time TMAP POI Autocomplete with in-memory caching and AbortController
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

    // 0ms In-memory cache hit
    if (customPresetSearchCache.has(query)) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      const cached = customPresetSearchCache.get(query)!;
      setSearchResults(cached);
      setIsSearching(false);
      setSearchError(cached.length === 0 ? '추천 검색 결과가 없습니다.' : null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const debounceTimer = setTimeout(async () => {
      // Abort any prior in-flight request
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
          customPresetSearchCache.set(query, pois);
          setSearchResults(pois);
          if (pois.length === 0) {
            setSearchError('추천 검색 결과가 없습니다.');
          }
        } else {
          setSearchError('TMAP 검색 서버 응답에 실패했습니다.');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // Aborted intentionally due to newer user typing
          return;
        }
        console.warn('POI autocomplete error:', err);
        setSearchError('검색 중 오류가 발생했습니다.');
      } finally {
        if (abortControllerRef.current === controller) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(debounceTimer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [searchQuery]);

  if (!isOpen) return null;

  // Select POI from autocomplete results: populate fields without auto-closing modal
  const handleSelectPoi = (poi: PoiResult) => {
    haptics.lightTap();

    const cleanShort = poi.name.length > 8 ? poi.name.slice(0, 8) : poi.name;
    setName(poi.name);
    setShortName(cleanShort);
    setAddress(poi.address || poi.name);
    setLat(poi.lat);
    setLng(poi.lng);

    // Dismiss search dropdown so user can review and edit fields
    setSearchResults([]);
    setSearchQuery(poi.name);
  };

  // Dismiss mobile virtual keyboard on touching/scrolling result list
  const handleListTouch = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || (!isHomeMode && !shortName.trim())) {
      alert('거점 명칭을 입력해 주세요.');
      return;
    }
    if (lat === null || lng === null) {
      alert('검색 결과에서 위치를 선택해 주세요.');
      return;
    }

    haptics.successPulse();

    if (isHomeMode && onSaveHome) {
      onSaveHome({
        name: name.trim() || '자택',
        address: address.trim() || '자택 주소',
        lat,
        lng,
      });
      setSearchQuery('');
      setSearchResults([]);
      setName('');
      setShortName('');
      setAddress('');
      setLat(null);
      setLng(null);
      onClose();
      return;
    }

    if (presetToEdit && onUpdatePreset) {
      onUpdatePreset({
        ...presetToEdit,
        name: name.trim(),
        shortName: shortName.trim(),
        address: address.trim() || '사용자 지정 거점',
        lat,
        lng,
      });
    } else {
      const newPreset: LocationPreset = {
        id: `custom_${Date.now()}`,
        name: name.trim(),
        shortName: shortName.trim(),
        lat,
        lng,
        category: isAdmin ? 'HOTEL' : 'CUSTOM',
        address: address.trim() || '사용자 지정 거점',
        isGlobal: isAdmin,
      };
      onAddPreset(newPreset);
    }

    // Reset form
    setSearchQuery('');
    setSearchResults([]);
    setName('');
    setShortName('');
    setAddress('');
    setLat(null);
    setLng(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-black text-slate-900 tracking-tight">
              {isHomeMode
                ? '자택 주소 등록'
                : presetToEdit
                ? '장소 수정'
                : isAdmin
                ? '공통 거점 등록'
                : '장소 등록'}
            </h2>
            {isAdmin && !isHomeMode && (
              <span className="text-[10px] bg-[#1E60F3] text-white font-bold px-1.5 py-0.5 rounded">
                전사 공통
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-transform duration-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div
          className="p-5 space-y-4 max-h-[80vh] overflow-y-auto overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {/* TMAP Real-time POI Autocomplete Search */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              TMAP 장소 검색 (실시간 추천)
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="장소명 또는 주소 검색 (예: 인천공항, 신라호텔, 코엑스)"
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-medium transition-colors"
                autoFocus
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-[#1E60F3] animate-spin absolute right-3 top-3" />
              )}
            </div>

            {/* Real-time Autocomplete Results Dropdown */}
            {searchResults.length > 0 && (
              <div
                onTouchStart={handleListTouch}
                onScrollCapture={handleListTouch}
                style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
                className="mt-2 border border-slate-200 rounded-xl bg-white shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100 animate-fade-in overscroll-contain touch-pan-y"
              >
                <div className="p-2 text-[10px] font-bold text-slate-400 bg-slate-50/80 uppercase">
                  터치하여 거점 정보 입력
                </div>
                {searchResults.map((poi, index) => (
                  <button
                    key={`${poi.id || 'poi'}-${index}`}
                    type="button"
                    onClick={() => handleSelectPoi(poi)}
                    className="w-full p-2.5 text-left hover:bg-blue-50/80 active:bg-blue-100 transition-colors flex items-start space-x-2 cursor-pointer group"
                  >
                    <MapPin className="w-4 h-4 text-[#1E60F3] shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">{poi.name}</div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">{poi.address}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchError && (
              <p className="text-[11px] text-rose-500 font-semibold mt-1.5">{searchError}</p>
            )}
          </div>

          {/* Preset Registration Form (For custom name adjustment or manual registration) */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                거점 전체 명칭
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="검색 결과에서 거점을 선택하거나 입력하세요"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            {!isHomeMode && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  버튼 표기 명칭 (최대 8자 권장)
                </label>
                <input
                  type="text"
                  required
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="예: 소노펠리체"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold active:scale-95 transition-transform duration-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={lat === null || !name.trim()}
                className="w-2/3 py-3 rounded-xl bg-[#1E60F3] hover:bg-[#1346D8] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.97] active:bg-[#0f3bb8] disabled:opacity-40 text-white text-xs font-black shadow-xs transition-all duration-150 ease-out cursor-pointer"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
