'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { LocationPreset, HomeLocation } from '@/types';
import { Plus, Trash2, Pencil, SlidersHorizontal, MapPin, Home as HomeIcon, ShieldAlert } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface PresetButtonsProps {
  presets: LocationPreset[];
  homeLocation?: HomeLocation | null;
  selectedOriginId?: string;
  selectedDestinationId?: string;
  isAdmin?: boolean;
  onSelectPreset: (preset: LocationPreset) => void;
  onOpenAddModal: () => void;
  onOpenHomeModal: () => void;
  onEditPreset?: (preset: LocationPreset) => void;
  onDeleteCustomPreset?: (id: string) => void;
  onReorderPresets?: (reordered: LocationPreset[]) => void;
}

export const PresetButtons: React.FC<PresetButtonsProps> = ({
  presets,
  homeLocation,
  selectedOriginId,
  selectedDestinationId,
  isAdmin = false,
  onSelectPreset,
  onOpenAddModal,
  onOpenHomeModal,
  onEditPreset,
  onDeleteCustomPreset,
  onReorderPresets,
}) => {
  const [isManageMode, setIsManageMode] = useState(false);
  const [managingPreset, setManagingPreset] = useState<LocationPreset | null>(null);

  // Local preset list for dynamic position swapping during drag (excluding Home slot)
  const [items, setItems] = useState<LocationPreset[]>(presets);

  useEffect(() => {
    setItems(presets);
  }, [presets]);

  // Construct Home Preset object
  const homePreset: LocationPreset = {
    id: 'slot_home',
    name: homeLocation?.name || '자택',
    shortName: '자택',
    lat: homeLocation?.lat ?? 37.5000,
    lng: homeLocation?.lng ?? 127.0350,
    category: 'HOME',
    address: homeLocation?.address || '',
  };

  // Drag-and-Drop Gesture State
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressActiveRef = useRef(false);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  const dragIndexRef = useRef<number | null>(null);
  dragIndexRef.current = dragIndex;
  const itemsRef = useRef<LocationPreset[]>(items);
  itemsRef.current = items;

  // FLIP (First, Last, Invert, Play) Layout Animation for fluid app-icon displacement
  useLayoutEffect(() => {
    if (prevRectsRef.current.size === 0) return;

    items.forEach((item, idx) => {
      // The currently dragged card is in floating layer; neighbor cards glide smoothly
      if (idx === dragIndexRef.current) return;

      const prev = prevRectsRef.current.get(item.id);
      const el = itemRefs.current[idx];
      if (prev && el) {
        const cur = el.getBoundingClientRect();
        const dx = prev.left - cur.left;
        const dy = prev.top - cur.top;
        if (dx !== 0 || dy !== 0) {
          el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
          el.style.transition = 'none';

          requestAnimationFrame(() => {
            el.style.transition = 'transform 250ms cubic-bezier(0.2, 0, 0, 1)';
            el.style.transform = '';
          });
        }
      }
    });

    prevRectsRef.current.clear();
  }, [items]);

  // Window listeners for Center-Point Hysteresis drag tracking
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

        // Center-Point Hysteresis:
        // Only trigger position swap if dragged center is within 45% radius of target slot's center
        const thresholdX = rect.width * 0.45;
        const thresholdY = rect.height * 0.45;

        if (
          Math.abs(clientX - slotCenterX) < thresholdX &&
          Math.abs(clientY - slotCenterY) < thresholdY
        ) {
          // 1. Capture previous bounding rects of all items for FLIP animation
          prevRectsRef.current.clear();
          itemsRef.current.forEach((item, idx) => {
            const cardEl = itemRefs.current[idx];
            if (cardEl) {
              prevRectsRef.current.set(item.id, cardEl.getBoundingClientRect());
            }
          });

          // 2. Reorder array
          const updated = [...itemsRef.current];
          const [movedItem] = updated.splice(currentDrag, 1);
          updated.splice(i, 0, movedItem);

          // 3. Update local state
          itemsRef.current = updated;
          setItems(updated);
          setDragIndex(i);
          dragIndexRef.current = i;

          // Micro-haptic feedback on slot switch
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
      prevRectsRef.current.clear();
      onReorderPresets?.(itemsRef.current);
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
  }, [isDragging, onReorderPresets]);

  // Pointer start (350ms long press timer)
  const handlePointerStart = (index: number, e: React.TouchEvent | React.MouseEvent) => {
    if (isManageMode) return;

    isLongPressActiveRef.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartPosRef.current = { x: clientX, y: clientY };
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
        navigator.vibrate(50);
      }
      haptics.successPulse();
    }, 350);
  };

  // Pointer move before 350ms to detect normal scrolling cancel
  const handlePointerMoveCheck = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartPosRef.current || isLongPressActiveRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const dist = Math.hypot(clientX - touchStartPosRef.current.x, clientY - touchStartPosRef.current.y);
    if (dist > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  // Pointer end for normal tap
  const handlePointerEnd = (preset: LocationPreset) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isDragging) return;

    if (!isLongPressActiveRef.current) {
      haptics.lightTap();
      if (isManageMode) {
        setManagingPreset(preset);
      } else {
        onSelectPreset(preset);
      }
    }
    isLongPressActiveRef.current = false;
  };

  const isHomeConfigured = !!homeLocation?.address;
  const isHomeOrigin = selectedOriginId === 'slot_home';
  const isHomeDestination = selectedDestinationId === 'slot_home';

  const draggedPreset = dragIndex !== null ? items[dragIndex] : null;

  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] select-none space-y-3">
      {/* Header: Upgraded White MapPin in Cobalt Badge on Left, 거점 관리 on Right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-[#1E60F3] flex items-center justify-center shadow-xs">
            <MapPin className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">자주 가는 목적지</h2>
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setIsManageMode(!isManageMode);
          }}
          className={`text-xs flex items-center space-x-1 py-1 px-2.5 rounded-lg transition-colors cursor-pointer ${
            isManageMode
              ? 'bg-[#1E60F3] text-white font-bold shadow-[0_4px_12px_rgba(30,96,243,0.25)]'
              : 'text-slate-400 hover:text-slate-600 font-medium'
          }`}
          title="거점 수정 및 삭제 관리"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{isManageMode ? '관리 완료' : '거점 관리'}</span>
        </button>
      </div>

      {/* Management Mode Guidance Bar */}
      {isManageMode && (
        <div className="px-3 py-1.5 rounded-xl bg-blue-50/90 border border-blue-200 text-[#1E60F3] text-[11px] font-bold flex items-center justify-between animate-fade-in">
          <span>{isAdmin ? '관리자 모드: 전사 공통 거점 관리 중' : '관리할 거점을 탭하세요.'}</span>
          <button
            type="button"
            onClick={() => setIsManageMode(false)}
            className="text-[#1E60F3] font-extrabold hover:underline cursor-pointer"
          >
            완료
          </button>
        </div>
      )}

      {/* 3-Column High-Density Grid */}
      <div className="grid grid-cols-3 gap-2 relative">
        {/* ============================================================== */}
        {/* SLOT #1: Fixed '자택(Home)' Slot (Row 1, Col 1)                 */}
        {/* ============================================================== */}
        {isHomeConfigured ? (
          <div className="relative select-none touch-none h-full">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                if (isManageMode) {
                  onOpenHomeModal();
                } else {
                  onSelectPreset(homePreset);
                }
              }}
              className={`w-full h-full min-h-[58px] px-2 py-2.5 rounded-xl border text-center flex flex-col justify-between items-center cursor-pointer transition-shadow ${
                isHomeDestination
                  ? 'bg-white border-emerald-300 ring-2 ring-emerald-50 text-slate-900 font-bold shadow-[0_2px_10px_rgba(16,185,129,0.08)]'
                  : isHomeOrigin
                  ? 'bg-white border-[#1E60F3]/40 ring-2 ring-[#1E60F3]/10 text-slate-900 font-bold shadow-[0_2px_10px_rgba(30,96,243,0.08)]'
                  : 'bg-blue-50/40 hover:bg-blue-50/80 border-blue-200/70 text-slate-900 font-semibold'
              } ${isManageMode ? 'border-dashed border-[#1E60F3]/60' : ''}`}
              title={`${homePreset.name} (${homePreset.address})`}
            >
              <div className="flex items-center justify-center gap-1 w-full">
                <HomeIcon className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                <span className="text-xs tracking-tight truncate font-bold text-slate-900">
                  자택
                </span>
              </div>

              {isHomeDestination && (
                <span className="text-[10px] font-semibold text-emerald-600 flex items-center justify-center gap-1 mt-0.5 leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  도착지
                </span>
              )}
              {isHomeOrigin && !isHomeDestination && (
                <span className="text-[10px] font-semibold text-[#1E60F3] flex items-center justify-center gap-1 mt-0.5 leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                  출발지
                </span>
              )}
              {!isHomeDestination && !isHomeOrigin && (
                <span className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
                  {isManageMode ? '수정' : '거점'}
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="relative select-none h-full">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenHomeModal();
              }}
              className="w-full h-full min-h-[58px] py-2.5 px-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/80 hover:bg-slate-100/90 text-slate-800 flex flex-col justify-between items-center active:scale-95 transition-all cursor-pointer group"
              title="자택 주소를 등록하세요"
            >
              {/* 상단 1열: 단정한 집(Home) 아이콘과 차분한 '자택' 텍스트 */}
              <div className="flex items-center justify-center gap-1 w-full">
                <HomeIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0 transition-colors" />
                <span className="text-xs font-bold text-slate-600 group-hover:text-slate-800 tracking-tight transition-colors">
                  자택
                </span>
              </div>

              {/* 하단 2열: 정갈한 플러스 아이콘과 코발트 블루 포인트 컬러의 + 주소 등록 */}
              <div className="flex items-center justify-center gap-0.5 w-full mt-0.5">
                <Plus className="w-3 h-3 text-[#1E60F3] stroke-[2.5] shrink-0" />
                <span className="text-[11px] font-semibold text-[#1E60F3] leading-none">
                  주소 등록
                </span>
              </div>
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* DRAGGABLE PRESET SLOTS (Slots 2..N)                            */}
        {/* ============================================================== */}
        {items.map((preset, index) => {
          const isOrigin = selectedOriginId === preset.id;
          const isDestination = selectedDestinationId === preset.id;
          const isThisItemDragging = isDragging && dragIndex === index;

          let stateClasses =
            'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80 text-slate-800 font-medium';
          if (isDestination) {
            stateClasses =
              'bg-white border-emerald-300 ring-2 ring-emerald-50 text-slate-900 font-bold shadow-[0_2px_10px_rgba(16,185,129,0.08)]';
          } else if (isOrigin) {
            stateClasses =
              'bg-white border-[#1E60F3]/40 ring-2 ring-[#1E60F3]/10 text-slate-900 font-bold shadow-[0_2px_10px_rgba(30,96,243,0.08)]';
          }

          if (isManageMode) {
            stateClasses += ' border-dashed border-[#1E60F3]/60 hover:bg-blue-50/50';
          }

          return (
            <div
              key={preset.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="relative select-none touch-none will-change-transform h-full"
            >
              {/* If this slot is currently being dragged, show subtle placeholder in grid */}
              <button
                type="button"
                onTouchStart={(e) => handlePointerStart(index, e)}
                onTouchMove={handlePointerMoveCheck}
                onTouchEnd={() => handlePointerEnd(preset)}
                onMouseDown={(e) => handlePointerStart(index, e)}
                onMouseMove={handlePointerMoveCheck}
                onMouseUp={() => handlePointerEnd(preset)}
                className={`w-full h-full min-h-[58px] px-2 py-2.5 rounded-xl border text-center flex flex-col justify-between items-center cursor-pointer transition-shadow ${stateClasses} ${
                  isThisItemDragging ? 'opacity-20 border-dashed border-[#1E60F3]' : ''
                }`}
                title={`${preset.name} (길게 눌러 순서 변경)`}
              >
                <span className="text-xs font-bold tracking-tight truncate w-full text-slate-900">
                  {preset.shortName}
                </span>

                {/* Status Indicator Tag */}
                {isDestination && (
                  <span className="text-[10px] font-semibold text-emerald-600 flex items-center justify-center gap-1 mt-0.5 leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    도착지
                  </span>
                )}
                {isOrigin && !isDestination && (
                  <span className="text-[10px] font-semibold text-[#1E60F3] flex items-center justify-center gap-1 mt-0.5 leading-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                    출발지
                  </span>
                )}
                {!isDestination && !isOrigin && (
                  <span className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
                    {isManageMode ? (preset.isGlobal ? '공통' : '관리') : '거점'}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* ============================================================== */}
        {/* FIXED '+ 추가' BUTTON (Always at the end, not draggable)        */}
        {/* ============================================================== */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenAddModal();
          }}
          className="w-full h-full min-h-[58px] py-2.5 px-2 rounded-xl border border-dashed border-slate-300 hover:border-[#1E60F3] bg-white hover:bg-slate-50 text-slate-400 hover:text-[#1E60F3] text-xs font-medium flex flex-col justify-between items-center active:scale-95 transition-all duration-100 cursor-pointer"
          title="새 거점 검색 및 등록"
        >
          <div className="flex items-center justify-center gap-1 w-full">
            <Plus className="w-3.5 h-3.5" />
            <span className="font-bold">추가</span>
          </div>
          <span className="text-[10px] text-slate-400 leading-none mt-0.5">신규 거점</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* FLOATING DRAG LAYER (z-50 pointer-events-none 1:1 Tracking)     */}
      {/* ============================================================== */}
      {isDragging && draggedPreset && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 will-change-transform shadow-2xl rounded-2xl bg-white border-2 border-[#1E60F3] px-4 py-3 flex flex-col items-center justify-center min-w-[100px] scale-110"
          style={{
            left: `${pointerPos.x}px`,
            top: `${pointerPos.y}px`,
          }}
        >
          <span className="text-xs font-bold text-slate-900 tracking-tight">
            {draggedPreset.shortName}
          </span>
          <span className="text-[10px] text-[#1E60F3] font-semibold mt-0.5">
            이동 중...
          </span>
        </div>
      )}

      {/* Management Action Dialog Modal */}
      {managingPreset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 text-center space-y-4">
            <div>
              <div className="flex items-center justify-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {managingPreset.isGlobal ? '전사 공통 거점 관리' : '개인 거점 관리'}
                </span>
                {managingPreset.isGlobal && (
                  <span className="text-[9px] bg-blue-50 text-[#1E60F3] font-bold px-1.5 py-0.5 rounded">
                    공통
                  </span>
                )}
              </div>
              <h3 className="text-sm font-black text-slate-900 truncate mt-0.5">
                [{managingPreset.shortName}]
              </h3>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {managingPreset.address || managingPreset.name}
              </p>
            </div>

            <div className="space-y-2">
              {onEditPreset && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    const p = managingPreset;
                    setManagingPreset(null);
                    onEditPreset(p);
                  }}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 cursor-pointer active:scale-98 transition-all"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>거점 명칭 수정</span>
                </button>
              )}

              {/* Delete button: permitted for personal presets, or for global presets IF admin */}
              {onDeleteCustomPreset && (!managingPreset.isGlobal || isAdmin) && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.errorAlert();
                    const idToDelete = managingPreset.id;
                    setManagingPreset(null);
                    onDeleteCustomPreset(idToDelete);
                  }}
                  className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 cursor-pointer active:scale-98 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {managingPreset.isGlobal ? '공통 거점 삭제 (관리자)' : '거점 삭제'}
                  </span>
                </button>
              )}

              {managingPreset.isGlobal && !isAdmin && (
                <p className="text-[10px] text-slate-400">
                  전사 공통 거점은 관리자 모드(PIN: 1010)에서만 삭제할 수 있습니다.
                </p>
              )}

              <button
                type="button"
                onClick={() => setManagingPreset(null)}
                className="w-full py-2 text-slate-400 hover:text-slate-600 font-medium text-xs cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
