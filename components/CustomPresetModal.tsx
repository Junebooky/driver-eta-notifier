'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LocationPreset } from '@/types';
import {
  X,
  Search,
  MapPin,
  Loader2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Plus,
  Home,
  Check,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface CustomPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets?: LocationPreset[];
  onReorderPresets?: (reordered: LocationPreset[]) => void;
  onDeletePreset?: (id: string) => void;
  onAddPreset: (preset: LocationPreset) => void;
  presetToEdit?: LocationPreset | null;
  onUpdatePreset?: (preset: LocationPreset) => void;
  isHomeMode?: boolean;
  onSaveHome?: (home: { name: string; address: string; lat: number; lng: number }) => void;
  isAdmin?: boolean;
  homeLocation?: { name: string; address: string; lat: number; lng: number } | null;
  vehicleNo?: string;
  onOpenHomeModal?: () => void;
}

interface PoiResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * Sanitize search query by stripping commas and dong/ho/floor patterns
 * (e.g., '4108동', '101호', 'B1층', '3층', etc.) to ensure building-level retrieval.
 */
export function sanitizeSearchQuery(query: string): string {
  const detailPattern = /(?<=\s|^)(?:[0-9]+동|[0-9]+호|[0-9B]+층|[A-Za-z]동)(?=\s|$)/g;
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
  presets,
  onReorderPresets,
  onDeletePreset,
  onAddPreset,
  presetToEdit,
  onUpdatePreset,
  isHomeMode = false,
  onSaveHome,
  isAdmin = false,
  homeLocation,
  vehicleNo,
  onOpenHomeModal,
}) => {
  // Local Presets State for Reordering
  const [currentPresets, setCurrentPresets] = useState<LocationPreset[]>(presets || []);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Form Visibility & Edit Target State
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LocationPreset | null>(null);

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

  // Sync presets from props or vehicle localStorage
  useEffect(() => {
    if (presets && presets.length > 0) {
      setCurrentPresets(presets);
    } else if (vehicleNo) {
      const cleanV = vehicleNo.match(/(\d+호차)/)?.[1] || vehicleNo || '4호차';
      try {
        const cached = localStorage.getItem(`cockpit_presets_${cleanV}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCurrentPresets(parsed);
          }
        }
      } catch (e) {}
    }
  }, [presets, vehicleNo, isOpen]);

  // Sync external presetToEdit prop
  useEffect(() => {
    if (isOpen) {
      if (presetToEdit) {
        setEditingItem(presetToEdit);
        setName(presetToEdit.name);
        setShortName(presetToEdit.shortName);
        setAddress(presetToEdit.address || '');
        setLat(presetToEdit.lat);
        setLng(presetToEdit.lng);
        setSearchQuery('');
        setSearchResults([]);
        setSearchError(null);
        setIsAddFormOpen(true);
      } else {
        setEditingItem(null);
        setName('');
        setShortName('');
        setAddress('');
        setLat(null);
        setLng(null);
        setSearchQuery('');
        setSearchResults([]);
        setSearchError(null);
        if (!isHomeMode) {
          setIsAddFormOpen(false);
        }
      }
    }
  }, [isOpen, presetToEdit, isHomeMode]);

  // Real-time POI Autocomplete with in-memory caching and AbortController
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(`/api/search?keyword=${encodeURIComponent(query)}&lat=37.5665&lng=126.9780`, {
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
          setSearchError('검색 서버 응답에 실패했습니다.');
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
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

  // Select POI from autocomplete results
  const handleSelectPoi = (poi: PoiResult) => {
    haptics.lightTap();
    const cleanShort = poi.name.length > 8 ? poi.name.slice(0, 8) : poi.name;
    setName(poi.name);
    setShortName(cleanShort);
    setAddress(poi.address || poi.name);
    setLat(poi.lat);
    setLng(poi.lng);
    setSearchResults([]);
    setSearchQuery(poi.name);
  };

  // Reorder presets by moving an item from one index to another
  const handleMovePreset = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= currentPresets.length) return;
    haptics.lightTap();

    const updated = [...currentPresets];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setCurrentPresets(updated);

    // Save to vehicle-isolated localStorage immediately
    if (vehicleNo) {
      const cleanV = vehicleNo.match(/(\d+호차)/)?.[1] || vehicleNo || '4호차';
      try {
        localStorage.setItem(`cockpit_presets_${cleanV}`, JSON.stringify(updated));
        localStorage.setItem(`cockpit_presets_order_${cleanV}`, JSON.stringify(updated.map((p) => p.id)));
      } catch (e) {
        console.warn('Failed to persist preset order to localStorage:', e);
      }
    }

    onReorderPresets?.(updated);
  };

  // Delete a personal preset
  const handleDeletePreset = (id: string, presetName: string) => {
    if (!confirm(`'${presetName}' 거점을 목록에서 삭제하시겠습니까?`)) return;
    haptics.warningPulse();

    const updated = currentPresets.filter((p) => p.id !== id);
    setCurrentPresets(updated);

    if (vehicleNo) {
      const cleanV = vehicleNo.match(/(\d+호차)/)?.[1] || vehicleNo || '4호차';
      try {
        localStorage.setItem(`cockpit_presets_${cleanV}`, JSON.stringify(updated));
        localStorage.setItem(`cockpit_presets_order_${cleanV}`, JSON.stringify(updated.map((p) => p.id)));
      } catch (e) {}
    }

    onDeletePreset?.(id);
  };

  // Start editing a preset
  const handleStartEdit = (preset: LocationPreset) => {
    haptics.lightTap();
    setEditingItem(preset);
    setName(preset.name);
    setShortName(preset.shortName);
    setAddress(preset.address || '');
    setLat(preset.lat);
    setLng(preset.lng);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setIsAddFormOpen(true);
  };

  const handleCancelForm = () => {
    setEditingItem(null);
    setName('');
    setShortName('');
    setAddress('');
    setLat(null);
    setLng(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    if (!isHomeMode) {
      setIsAddFormOpen(false);
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

    // 1. Home Mode
    if (isHomeMode && onSaveHome) {
      onSaveHome({
        name: name.trim() || '자택',
        address: address.trim() || '자택 주소',
        lat,
        lng,
      });
      handleCancelForm();
      onClose();
      return;
    }

    // 2. Edit Preset
    if (editingItem && onUpdatePreset) {
      const updatedPreset: LocationPreset = {
        ...editingItem,
        name: name.trim(),
        shortName: shortName.trim(),
        address: address.trim() || '사용자 지정 거점',
        lat,
        lng,
      };
      onUpdatePreset(updatedPreset);
      setCurrentPresets((prev) =>
        prev.map((p) => (p.id === updatedPreset.id ? updatedPreset : p))
      );
    } else {
      // 3. New Preset
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
      setCurrentPresets((prev) => [...prev, newPreset]);
    }

    handleCancelForm();
    if (presetToEdit) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none overscroll-contain">
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90dvh] h-[90dvh] sm:h-auto sm:max-h-[85vh] animate-in slide-in-from-bottom-6 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* Modal Header                                              */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
              {isHomeMode ? '자택 주소 등록' : '거점 및 자주 가는 목적지 관리'}
            </h2>
            {!isHomeMode && (
              <span className="text-[10px] bg-blue-100 text-[#1E60F3] font-black px-2 py-0.5 rounded-full">
                {currentPresets.length}개
              </span>
            )}
            {isAdmin && !isHomeMode && (
              <span className="text-[10px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded">
                전사 공통 모드
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-all cursor-pointer"
            title="닫기"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================= */}
        {/* Modal Scrollable Body                                     */}
        {/* ========================================================= */}
        <div
          className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain touch-pan-y flex-1"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {/* ========================================================= */}
          {/* [태스크 1] 1. 새 거점 등록 접이식 토글 바 (isHomeMode 아닌 경우) */}
          {/* ========================================================= */}
          {!isHomeMode && (
            <div>
              {!isAddFormOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setIsAddFormOpen(true);
                  }}
                  className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-[#1E60F3]/40 bg-blue-50/40 hover:bg-blue-50 text-[#1E60F3] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>새 거점 추가 등록하기</span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/20 space-y-3.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between pb-1 border-b border-blue-100">
                    <span className="text-xs font-bold text-[#1E60F3] flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      <span>{editingItem ? '거점 정보 수정' : '새 거점 등록'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelForm}
                      className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      접기 닫기
                    </button>
                  </div>

                  {/* Autocomplete Search Bar */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      장소 검색 (실시간 추천)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="장소명 또는 주소 검색 (예: 인천공항, 신라호텔, 코엑스)"
                        className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:border-[#1E60F3] font-medium transition-colors"
                        autoFocus
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      {isSearching && (
                        <Loader2 className="w-4 h-4 text-[#1E60F3] animate-spin absolute right-3 top-2.5" />
                      )}
                    </div>

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && (
                      <div className="mt-2 border border-slate-200 rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 overscroll-contain">
                        <div className="p-2 text-[10px] font-bold text-slate-400 bg-slate-50 uppercase">
                          터치하여 거점 정보 자동 입력
                        </div>
                        {searchResults.map((poi, index) => (
                          <div
                            key={`${poi.id}-${index}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectPoi(poi)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectPoi(poi);
                              }
                            }}
                            className="w-full p-2.5 text-left hover:bg-blue-50/80 active:bg-blue-100 transition-colors flex items-start gap-2 cursor-pointer group"
                          >
                            <MapPin className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-900 truncate">{poi.name}</div>
                              <div className="text-[10px] text-slate-500 truncate mt-0.5">{poi.address}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchError && (
                      <p className="text-[11px] text-rose-500 font-semibold mt-1">{searchError}</p>
                    )}
                  </div>

                  {/* Input Fields */}
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        거점 전체 명칭
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="검색 결과에서 선택하거나 입력하세요"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-[#1E60F3]"
                      />
                    </div>

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
                        maxLength={12}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-[#1E60F3]"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCancelForm}
                        className="w-1/3 py-2.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 text-xs font-bold active:scale-95 transition cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        disabled={lat === null || !name.trim()}
                        className="w-2/3 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-[#1346D8] disabled:opacity-40 text-white text-xs font-black shadow-xs transition active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{editingItem ? '수정 완료' : '거점 저장'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* Home Mode View (Dedicated standalone home registration)   */}
          {/* ========================================================= */}
          {isHomeMode && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  장소 검색 (실시간 추천)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="장소명 또는 주소 검색 (예: 자택 아파트명, 도로명)"
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-medium transition-colors"
                    autoFocus
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  {isSearching && (
                    <Loader2 className="w-4 h-4 text-[#1E60F3] animate-spin absolute right-3 top-3" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-xl bg-white shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100 overscroll-contain">
                    <div className="p-2 text-[10px] font-bold text-slate-400 bg-slate-50 uppercase">
                      터치하여 자택 주소 입력
                    </div>
                    {searchResults.map((poi, index) => (
                      <div
                        key={`${poi.id}-${index}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectPoi(poi)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectPoi(poi);
                          }
                        }}
                        className="w-full p-2.5 text-left hover:bg-blue-50/80 active:bg-blue-100 transition-colors flex items-start space-x-2 cursor-pointer group"
                      >
                        <MapPin className="w-4 h-4 text-[#1E60F3] shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 truncate">{poi.name}</div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">{poi.address}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchError && (
                  <p className="text-[11px] text-rose-500 font-semibold mt-1.5">{searchError}</p>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    자택 명칭
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 자택, 우리집"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    자택 상세 주소
                  </label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="검색 결과에서 선택하거나 입력하세요"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div className="pt-2 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold active:scale-95 transition cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={lat === null || !name.trim()}
                    className="w-2/3 py-3 rounded-xl bg-[#1E60F3] hover:bg-[#1346D8] disabled:opacity-40 text-white text-xs font-black shadow-xs transition active:scale-[0.98] cursor-pointer"
                  >
                    자택 저장
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================= */}
          {/* [태스크 1] 2. 등록된 전체 거점 목록 & 순서 이동 (Reorder)   */}
          {/* ========================================================= */}
          {!isHomeMode && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#1E60F3]" />
                  <span>등록된 거점 목록 ({currentPresets.length + (homeLocation?.name ? 1 : 0)})</span>
                </span>
                <span className="text-[11px] font-normal text-slate-400">
                  ▲/▼ 버튼 또는 드래그 이동
                </span>
              </div>

              <div className="space-y-2">
                {/* 1. Home Card (Always Top Slot) */}
                <div className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Home className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          자택 {homeLocation?.name ? `(${homeLocation.name})` : ''}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          🏠 자택
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {homeLocation?.address || homeLocation?.name || '자택 미등록 (등록 시 퀵 선택에 노출)'}
                      </p>
                    </div>
                  </div>
                  {onOpenHomeModal && (
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        onOpenHomeModal();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-slate-600 transition cursor-pointer shrink-0"
                    >
                      {homeLocation?.name ? '주소 변경' : '등록'}
                    </button>
                  )}
                </div>

                {/* 2. Registered Presets List with Reorder & Delete */}
                {currentPresets.map((preset, idx) => {
                  const isHQ = !preset.vehicle_no && !preset.vehicleNo;

                  return (
                    <div
                      key={preset.id || idx}
                      draggable={true}
                      onDragStart={(e) => {
                        setDraggedIdx(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedIdx !== null && draggedIdx !== idx) {
                          handleMovePreset(draggedIdx, idx);
                          setDraggedIdx(null);
                        }
                      }}
                      onDragEnd={() => setDraggedIdx(null)}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 shadow-2xs group ${
                        draggedIdx === idx
                          ? 'border-[#1E60F3] bg-blue-50/50 scale-[0.98]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {/* Left: Drag Handle, Index & Info */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className="text-slate-400 hover:text-slate-700 p-0.5 cursor-grab active:cursor-grabbing shrink-0"
                          title="드래그하여 순서 이동"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 w-4 text-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                              {preset.shortName}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                                isHQ
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-blue-50 text-[#1E60F3] border border-blue-200/50'
                              }`}
                            >
                              {isHQ ? '🏢 공통 HQ' : '👤 개인 MY'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {preset.name} {preset.address && preset.address !== preset.name ? `· ${preset.address}` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Right: Reorder Up/Down & Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Move Up Button */}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMovePreset(idx, idx - 1)}
                          className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-600 cursor-pointer transition-colors"
                          title="위로 이동"
                          aria-label="위로 이동"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>

                        {/* Move Down Button */}
                        <button
                          type="button"
                          disabled={idx === currentPresets.length - 1}
                          onClick={() => handleMovePreset(idx, idx + 1)}
                          className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-600 cursor-pointer transition-colors"
                          title="아래로 이동"
                          aria-label="아래로 이동"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleStartEdit(preset)}
                          className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-blue-50 hover:text-[#1E60F3] hover:border-blue-200 active:scale-95 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
                          title="명칭 수정"
                          aria-label="명칭 수정"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>

                        {/* Delete Button (Personal or Admin) */}
                        {(!isHQ || isAdmin) && (
                          <button
                            type="button"
                            onClick={() => handleDeletePreset(preset.id, preset.shortName || preset.name)}
                            className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 active:scale-95 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
                            title="거점 삭제"
                            aria-label="거점 삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
