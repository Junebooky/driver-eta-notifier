'use client';

import React, { useState, useEffect, useRef } from 'react';
import { LocationPreset } from '@/types';
import {
  X,
  Search,
  MapPin,
  Loader2,
  Home,
  Check,
  Plus,
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
  // Local Presets State for Dynamic Position Swapping (Excluding Home slot)
  const [items, setItems] = useState<LocationPreset[]>(presets || []);
  const itemsRef = useRef<LocationPreset[]>(items);
  itemsRef.current = items;

  // Edit Target State
  const [editingItem, setEditingItem] = useState<LocationPreset | null>(null);

  // Search & Autocomplete State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PoiResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // Drag-and-Drop Gesture State
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  dragIndexRef.current = dragIndex;
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isLongPressActiveRef = useRef(false);
  const isScrollingRef = useRef(false);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Sync presets from props or vehicle localStorage
  useEffect(() => {
    if (presets && presets.length > 0) {
      setItems(presets);
    } else if (vehicleNo) {
      const cleanV = vehicleNo.match(/(\d+호차)/)?.[1] || vehicleNo || '4호차';
      try {
        const cached = localStorage.getItem(`cockpit_presets_${cleanV}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setItems(parsed);
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
      }
    }
  }, [isOpen, presetToEdit]);

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

  // Touch Move / Drag Window Listeners for Mobile Drag & Drop
  useEffect(() => {
    if (!isDragging) return;

    const checkCenterPointHysteresis = (clientX: number, clientY: number) => {
      const currentDrag = dragIndexRef.current;
      if (currentDrag === null) return;

      for (let i = 0; i < itemsRef.current.length; i++) {
        if (i === currentDrag) continue;
        const el = itemRefs.current[i];
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        const slotCenterX = rect.left + rect.width / 2;
        const slotCenterY = rect.top + rect.height / 2;

        const thresholdX = rect.width * 0.45;
        const thresholdY = rect.height * 0.45;

        if (
          Math.abs(clientX - slotCenterX) < thresholdX &&
          Math.abs(clientY - slotCenterY) < thresholdY
        ) {
          const updated = [...itemsRef.current];
          const [movedItem] = updated.splice(currentDrag, 1);
          updated.splice(i, 0, movedItem);

          itemsRef.current = updated;
          setItems(updated);
          setDragIndex(i);
          dragIndexRef.current = i;

          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(20);
          }
          break;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        setPointerPos({ x: touch.clientX, y: touch.clientY });
        checkCenterPointHysteresis(touch.clientX, touch.clientY);
      }
    };

    const handleTouchEnd = () => {
      endDrag();
    };

    const handleMouseMove = (e: MouseEvent) => {
      setPointerPos({ x: e.clientX, y: e.clientY });
      checkCenterPointHysteresis(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      endDrag();
    };

    const endDrag = () => {
      setIsDragging(false);
      setDragIndex(null);
      dragIndexRef.current = null;
      isLongPressActiveRef.current = false;
      commitReorder(itemsRef.current);
      haptics.lightTap();
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  // Persist reordered array to localStorage and notify parent
  const commitReorder = (newItems: LocationPreset[]) => {
    if (vehicleNo) {
      const cleanV = vehicleNo.match(/(\d+호차)/)?.[1] || vehicleNo || '4호차';
      try {
        localStorage.setItem(`cockpit_presets_${cleanV}`, JSON.stringify(newItems));
        localStorage.setItem(`cockpit_presets_order_${cleanV}`, JSON.stringify(newItems.map((p) => p.id)));
      } catch (e) {
        console.warn('Failed to save ordered presets to vehicle storage:', e);
      }
    }
    onReorderPresets?.(newItems);
  };

  // Pointer start for touch drag
  const handlePointerStart = (index: number, e: React.TouchEvent | React.MouseEvent) => {
    isLongPressActiveRef.current = false;
    isScrollingRef.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };
    setPointerPos({ x: clientX, y: clientY });

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      setIsDragging(true);
      setDragIndex(index);
      dragIndexRef.current = index;

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(40);
      }
      haptics.successPulse();
    }, 280);
  };

  const handlePointerMoveCheck = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartPosRef.current || isLongPressActiveRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaY = Math.abs(clientY - touchStartPosRef.current.y);
    const dist = Math.hypot(clientX - touchStartPosRef.current.x, clientY - touchStartPosRef.current.y);

    if (deltaY > 8 || dist >= 10) {
      isScrollingRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handlePointerCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // HTML5 Drag & Drop handlers for desktop
  const handleHtmlDragStart = (index: number, e: React.DragEvent) => {
    setDragIndex(index);
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleHtmlDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleHtmlDrop = (targetIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    const sourceIdx = dragIndexRef.current;
    if (sourceIdx !== null && sourceIdx !== targetIdx) {
      const updated = [...itemsRef.current];
      const [movedItem] = updated.splice(sourceIdx, 1);
      updated.splice(targetIdx, 0, movedItem);

      itemsRef.current = updated;
      setItems(updated);
      commitReorder(updated);
      haptics.lightTap();
    }
    setDragIndex(null);
    dragIndexRef.current = null;
  };

  const handleHtmlDragEnd = () => {
    setDragIndex(null);
    dragIndexRef.current = null;
  };

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

  // Delete a personal preset
  const handleDeletePreset = (id: string, presetName: string) => {
    if (!confirm(`'${presetName}' 거점을 목록에서 삭제하시겠습니까?`)) return;
    haptics.warningPulse();

    const updated = items.filter((p) => p.id !== id);
    setItems(updated);
    itemsRef.current = updated;
    commitReorder(updated);
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
  };

  // Reset top input form
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
  };

  // Save new preset or update existing
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
      const updatedList = items.map((p) => (p.id === updatedPreset.id ? updatedPreset : p));
      setItems(updatedList);
      itemsRef.current = updatedList;
      commitReorder(updatedList);
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
      const updatedList = [...items, newPreset];
      setItems(updatedList);
      itemsRef.current = updatedList;
      commitReorder(updatedList);
    }

    handleCancelForm();
    if (presetToEdit) {
      onClose();
    }
  };

  const draggedPreset = dragIndex !== null ? items[dragIndex] : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none overscroll-contain">
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92dvh] h-[92dvh] sm:h-auto sm:max-h-[88vh] animate-in slide-in-from-bottom-6 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================= */}
        {/* Modal Header (Fixed at top)                               */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
              {isHomeMode ? '자택 주소 등록' : '거점 및 자주 가는 목적지 관리'}
            </h2>
            {!isHomeMode && (
              <span className="text-[10px] bg-blue-100 text-[#1E60F3] font-black px-2 py-0.5 rounded-full">
                {items.length}개
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
          {/* [태스크 1] 상단: '장소 등록' 폼 상시 노출 배치             */}
          {/* ========================================================= */}
          {!isHomeMode ? (
            <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-[#1E60F3] stroke-[2.5]" />
                  <span>{editingItem ? '거점 정보 수정' : '장소 등록'}</span>
                </span>
                {editingItem && (
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    수정 취소
                  </button>
                )}
              </div>

              {/* 1. Real-time Autocomplete Search Bar */}
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
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:border-[#1E60F3] transition-colors"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  {isSearching && (
                    <Loader2 className="w-4 h-4 text-[#1E60F3] animate-spin absolute right-3 top-2.5" />
                  )}
                </div>

                {/* Autocomplete Results Dropdown */}
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

              {/* 2 & 3. Name Inputs & Action Bar */}
              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      거점 전체 명칭
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="검색 결과에서 거점을 선택하거나 입력하세요"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs font-bold focus:outline-none focus:border-[#1E60F3]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
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
                </div>

                {/* 4. Action Bar */}
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
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{editingItem ? '수정 완료' : '거점 저장'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Home Mode Standalone Registration Form */
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
          {/* [태스크 2] 하단: 기존 '자주 가는 목적지 그리드 카드 UI'     */}
          {/* 및 드래그 앤 드롭 완전 복원 (PresetButtons.tsx 기반)        */}
          {/* ========================================================= */}
          {!isHomeMode && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#1E60F3]" />
                  <span>자주 가는 목적지 순서 변경 ({items.length + (homeLocation?.name ? 1 : 0)})</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  카드를 길게 눌러 드래그
                </span>
              </div>

              {/* 3-Column Original Grid Cards */}
              <div className="grid grid-cols-3 gap-2 pt-1 select-none">
                {/* 1. Home Slot (Pinned at Slot 1) */}
                <div
                  onClick={() => {
                    if (onOpenHomeModal) {
                      haptics.lightTap();
                      onOpenHomeModal();
                    }
                  }}
                  className="min-h-[64px] p-2.5 rounded-2xl border text-center flex flex-col justify-between items-center transition-all duration-150 active:scale-95 group shadow-2xs bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 cursor-pointer"
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
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 bg-emerald-50 text-emerald-600">
                    자택
                  </span>
                </div>

                {/* 2..N Presets Cards with Drag & Drop */}
                {items.map((preset, index) => {
                  const isHQ = !preset.vehicle_no && !preset.vehicleNo;
                  const isBeingDragged = isDragging && dragIndex === index;

                  return (
                    <div
                      key={`${preset.id}-${index}`}
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      draggable={true}
                      onDragStart={(e) => handleHtmlDragStart(index, e)}
                      onDragOver={(e) => handleHtmlDragOver(index, e)}
                      onDrop={(e) => handleHtmlDrop(index, e)}
                      onDragEnd={handleHtmlDragEnd}
                      onTouchStart={(e) => handlePointerStart(index, e)}
                      onTouchMove={handlePointerMoveCheck}
                      onTouchEnd={handlePointerEnd}
                      onTouchCancel={handlePointerCancel}
                      onMouseDown={(e) => handlePointerStart(index, e)}
                      onClick={() => handleStartEdit(preset)}
                      className={`relative min-h-[64px] p-2.5 rounded-2xl border text-center flex flex-col justify-between items-center transition-all select-none group shadow-2xs cursor-grab active:cursor-grabbing will-change-transform ${
                        isBeingDragged
                          ? 'opacity-30 border-2 border-dashed border-[#1E60F3] bg-blue-50/40 scale-95'
                          : 'bg-white border-slate-200 hover:border-[#1E60F3]/60 hover:bg-blue-50/20 active:scale-95'
                      }`}
                      title={`${preset.name} (길게 눌러 드래그 / 탭하여 수정)`}
                    >
                      {/* Delete Button (Personal MY or Admin mode) */}
                      {(!isHQ || isAdmin) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePreset(preset.id, preset.shortName || preset.name);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-400 border border-slate-200 shadow-2xs flex items-center justify-center transition-all cursor-pointer z-10"
                          title="거점 삭제"
                          aria-label="거점 삭제"
                        >
                          <X className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      )}

                      {/* Preset ShortName */}
                      <span className="text-xs font-bold tracking-tight text-slate-800 group-hover:text-[#1E60F3] truncate w-full transition-colors">
                        {preset.shortName}
                      </span>

                      {/* Badge: 공통 vs 개인 */}
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                          isHQ
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-blue-50 text-[#1E60F3]'
                        }`}
                      >
                        {isHQ ? '공통' : '개인'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* Floating Drag Chip (Follows pointer during touch drag)   */}
        {/* ========================================================= */}
        {isDragging && draggedPreset && (
          <div
            className="fixed z-[150] pointer-events-none -translate-x-1/2 -translate-y-1/2 will-change-transform shadow-2xl rounded-2xl bg-white border-2 border-[#1E60F3] ring-2 ring-[#1E60F3]/40 px-3.5 py-2 flex items-center justify-center scale-95 opacity-95 transition-transform duration-100 ease-out"
            style={{
              left: `${pointerPos.x}px`,
              top: `${pointerPos.y}px`,
            }}
          >
            <span className="text-xs font-bold text-slate-900 tracking-tight whitespace-nowrap">
              {draggedPreset.shortName}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
