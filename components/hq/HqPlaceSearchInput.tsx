'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Flag, Loader2, X, Navigation } from 'lucide-react';
import { haptics } from '@/utils/haptics';

export interface PoiResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export function sanitizeSearchQuery(query: string): string {
  const detailPattern = /(?<=\s|^)(?:[0-9]+동|[0-9]+호|[0-9B]+층|[A-Za-z]동)(?=\s|$)/g;
  const cleanQuery = query
    .replace(detailPattern, '')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanQuery || query;
}

// In-memory instant cache for TMAP POI searches
const placeSearchCache = new Map<string, PoiResult[]>();

interface HqPlaceSearchInputProps {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  onSelectPoi?: (poi: PoiResult) => void;
  placeholder?: string;
  icon?: 'mapPin' | 'flag';
  containerClassName?: string;
  heightClass?: string;
  disabled?: boolean;
}

export const HqPlaceSearchInput: React.FC<HqPlaceSearchInputProps> = ({
  label,
  required = false,
  value,
  onChange,
  onSelectPoi,
  placeholder = '위치 검색 또는 입력',
  icon = 'mapPin',
  containerClassName = '',
  heightClass = 'h-12',
  disabled = false,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PoiResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSelectionRef = useRef(false);
  const isUserTypingRef = useRef(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  // Search effect with 250ms debounce
  useEffect(() => {
    if (isSelectionRef.current) {
      isSelectionRef.current = false;
      return;
    }

    // Do NOT open dropdown or auto-search on mount / prop assignment
    if (!isUserTypingRef.current) {
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsDropdownOpen(false);
      setSearchError(null);
      setIsSearching(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    const cleanQuery = sanitizeSearchQuery(trimmed);

    // Instant in-memory cache check
    if (placeSearchCache.has(cleanQuery)) {
      const cached = placeSearchCache.get(cleanQuery)!;
      setSearchResults(cached);
      setIsDropdownOpen(cached.length > 0);
      setIsSearching(false);
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
        const res = await fetch(
          `/api/search?keyword=${encodeURIComponent(cleanQuery)}&lat=37.5665&lng=126.9780`,
          { signal: controller.signal }
        );

        if (res.ok) {
          const data = await res.json();
          const pois: PoiResult[] = data.pois || [];
          placeSearchCache.set(cleanQuery, pois);
          setSearchResults(pois);
          setIsDropdownOpen(pois.length > 0);
          if (pois.length === 0) {
            setSearchError('추천 검색 결과가 없습니다.');
          }
        } else {
          setSearchError('TMAP 검색 서버 응답 실패');
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
        setSearchError('검색 중 오류가 발생했습니다.');
      } finally {
        if (abortControllerRef.current === controller) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [value]);

  const handleSelectPoi = useCallback(
    (poi: PoiResult) => {
      haptics.selection();
      isSelectionRef.current = true;
      isUserTypingRef.current = false;
      onChange(poi.name);
      onSelectPoi?.(poi);
      setIsDropdownOpen(false);
      setSearchResults([]);
      setHighlightedIndex(-1);
    },
    [onChange, onSelectPoi]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || searchResults.length === 0) {
      if (e.key === 'ArrowDown' && searchResults.length > 0) {
        setIsDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        handleSelectPoi(searchResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleClear = () => {
    haptics.lightTap();
    isSelectionRef.current = true;
    isUserTypingRef.current = false;
    onChange('');
    setSearchResults([]);
    setIsDropdownOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className={`relative ${containerClassName}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          {label} {required && <span className="text-red-500 font-bold ml-0.5">*</span>}
        </label>
      )}

      <div
        className={`w-full ${heightClass} bg-white border border-slate-200 hover:border-blue-400 focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-blue-100 rounded-xl px-3.5 flex items-center gap-2.5 transition-all shadow-2xs ${
          disabled ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        {icon === 'mapPin' ? (
          <MapPin className="w-5 h-5 text-slate-700 shrink-0" />
        ) : (
          <Flag className="w-5 h-5 text-slate-700 shrink-0" />
        )}

        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            isUserTypingRef.current = true;
            onChange(e.target.value);
          }}
          onFocus={() => {
            if (isUserTypingRef.current && searchResults.length > 0) {
              setIsDropdownOpen(true);
            }
          }}
          onBlur={() => {
            setTimeout(() => {
              setIsDropdownOpen(false);
            }, 200);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
        />

        {isSearching && (
          <Loader2 className="w-4 h-4 text-[#1E60F3] animate-spin shrink-0" />
        )}

        {value && !isSearching && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="입력 내용 지우기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* TMAP POI Autocomplete Dropdown */}
      {isDropdownOpen && searchResults.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 overscroll-contain animate-in fade-in duration-150">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Navigation className="w-3 h-3 text-[#1E60F3]" />
              <span>TMAP 실시간 장소 검색</span>
            </span>
            <span>{searchResults.length}건</span>
          </div>

          {searchResults.map((poi, index) => {
            const isHighlighted = highlightedIndex === index;
            return (
              <button
                key={`${poi.id}-${index}`}
                type="button"
                onClick={() => handleSelectPoi(poi)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full px-3.5 py-2.5 text-left transition-colors flex items-start gap-2.5 cursor-pointer ${
                  isHighlighted ? 'bg-blue-50 text-[#1E60F3]' : 'hover:bg-slate-50 text-slate-900'
                }`}
              >
                <MapPin
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    isHighlighted ? 'text-[#1E60F3]' : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{poi.name}</div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{poi.address}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {isDropdownOpen && searchError && searchResults.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-center text-xs text-slate-400 font-medium">
          {searchError}
        </div>
      )}
    </div>
  );
};

