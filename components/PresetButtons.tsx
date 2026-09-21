'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { LocationPreset } from '@/types';
import { Plus, Trash2, Pencil, SlidersHorizontal, MapPin } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface PresetButtonsProps {
  presets: LocationPreset[];
  selectedOriginId?: string;
  selectedDestinationId?: string;
  onSelectPreset: (preset: LocationPreset) => void;
  onOpenAddModal: () => void;
  onEditPreset?: (preset: LocationPreset) => void;
  onDeleteCustomPreset?: (id: string) => void;
  onReorderPresets?: (reordered: LocationPreset[]) => void;
}

export const PresetButtons: React.FC<PresetButtonsProps> = ({
  presets,
  selectedOriginId,
  selectedDestinationId,
  onSelectPreset,
  onOpenAddModal,
  onEditPreset,
  onDeleteCustomPreset,
  onReorderPresets,
}) => {
  const [isManageMode, setIsManageMode] = useState(false);
  const [managingPreset, setManagingPreset] = useState<LocationPreset | null>(null);

  // Local preset list for dynamic position swapping during drag
  const [items, setItems] = useState<LocationPreset[]>(presets);

  useEffect(() => {
    setItems(presets);
  }, [presets]);

  // Drag-and-Drop Gesture State
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
      // The currently dragged card follows finger tracking; other cards animate smoothly
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
            el.style.transition = 'transform 300ms cubic-bezier(0.2, 0, 0, 1)';
            el.style.transform = '';
          });
        }
      }
    });

    prevRectsRef.current.clear();
  }, [items]);

  // Window listeners for smooth, glitch-free dragging across viewport
  useEffect(() => {
    if (!isDragging) return;

    const checkHover = (clientX: number, clientY: number) => {
      const currentDrag = dragIndexRef.current;
      if (currentDrag === null) return;

      for (let i = 0; i < itemsRef.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          if (i !== currentDrag) {
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
          }
          break;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      if (touch && touchStartPosRef.current) {
        setDragOffset({
          x: touch.clientX - touchStartPosRef.current.x,
          y: touch.clientY - touchStartPosRef.current.y,
        });
        checkHover(touch.clientX, touch.clientY);
      }
    };

    const handleTouchEnd = () => {
      endDrag();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (touchStartPosRef.current) {
        setDragOffset({
          x: e.clientX - touchStartPosRef.current.x,
          y: e.clientY - touchStartPosRef.current.y,
        });
        checkHover(e.clientX, e.clientY);
      }
    };

    const handleMouseUp = () => {
      endDrag();
    };

    const endDrag = () => {
      setIsDragging(false);
      setDragIndex(null);
      dragIndexRef.current = null;
      isLongPressActiveRef.current = false;
      setDragOffset({ x: 0, y: 0 });
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

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      setIsDragging(true);
      setDragIndex(index);
      dragIndexRef.current = index;
      setDragOffset({ x: 0, y: 0 });

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      haptics.successPulse();
    }, 350);
  };

  // Pointer move before 350ms to detect scrolling
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

  // Pointer up (distinguish normal tap vs long press drag)
  const handlePointerEnd = (preset: LocationPreset) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isDragging) {
      return;
    }

    if (!isLongPressActiveRef.current) {
      // Normal Immediate Tap without any delay
      haptics.lightTap();
      if (isManageMode) {
        setManagingPreset(preset);
      } else {
        onSelectPreset(preset);
      }
    }
    isLongPressActiveRef.current = false;
  };

  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] select-none space-y-3">
      {/* Header: Upgraded White MapPin in Cobalt Badge on Left, 거점 관리 on Right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {/* Modern Round Square Cobalt Badge with White MapPin */}
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
          <span>관리(수정/삭제)할 거점을 탭하세요.</span>
          <button
            type="button"
            onClick={() => setIsManageMode(false)}
            className="text-[#1E60F3] font-extrabold hover:underline cursor-pointer"
          >
            완료
          </button>
        </div>
      )}

      {/* 3-Column High-Density Grid (Fluid Smartphone-like Drag Reordering) */}
      <div className="grid grid-cols-3 gap-2 relative">
        {items.map((preset, index) => {
          const isOrigin = selectedOriginId === preset.id;
          const isDestination = selectedDestinationId === preset.id;
          const isThisItemDragging = isDragging && dragIndex === index;

          let stateClasses =
            'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/80 text-slate-800 font-medium py-3.5';
          if (isDestination) {
            stateClasses =
              'bg-white border-emerald-300 ring-2 ring-emerald-50 text-slate-900 font-bold shadow-[0_2px_10px_rgba(16,185,129,0.08)] py-2.5';
          } else if (isOrigin) {
            stateClasses =
              'bg-white border-[#1E60F3]/40 ring-2 ring-[#1E60F3]/10 text-slate-900 font-bold shadow-[0_2px_10px_rgba(30,96,243,0.08)] py-2.5';
          }

          if (isManageMode) {
            stateClasses += ' border-dashed border-[#1E60F3]/60 hover:bg-blue-50/50';
          }

          if (isThisItemDragging) {
            stateClasses += ' shadow-2xl ring-2 ring-[#1E60F3] z-40 opacity-95 bg-white cursor-grabbing pointer-events-none';
          }

          return (
            <div
              key={preset.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="relative select-none touch-none will-change-transform"
              style={{
                zIndex: isThisItemDragging ? 40 : 1,
                transform: isThisItemDragging
                  ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) scale(1.06)`
                  : undefined,
                transition: isThisItemDragging ? 'none' : undefined,
              }}
            >
              <button
                type="button"
                onTouchStart={(e) => handlePointerStart(index, e)}
                onTouchMove={handlePointerMoveCheck}
                onTouchEnd={() => handlePointerEnd(preset)}
                onMouseDown={(e) => handlePointerStart(index, e)}
                onMouseMove={handlePointerMoveCheck}
                onMouseUp={() => handlePointerEnd(preset)}
                className={`w-full px-2 rounded-xl border text-center flex flex-col items-center justify-center min-h-[48px] cursor-pointer transition-shadow ${stateClasses}`}
                title={`${preset.name} (길게 눌러 순서 변경)`}
              >
                <span className="text-xs tracking-tight truncate w-full">
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
                {isManageMode && (
                  <span className="text-[9px] font-bold text-[#1E60F3] leading-none mt-0.5">
                    관리
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* Integrated '+ 추가' Button (Fixed, not draggable) */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenAddModal();
          }}
          className="w-full py-3.5 px-2 rounded-xl border border-dashed border-slate-300 hover:border-[#1E60F3] bg-white hover:bg-slate-50 text-slate-400 hover:text-[#1E60F3] text-xs font-medium flex items-center justify-center space-x-1 active:scale-95 transition-all duration-100 cursor-pointer min-h-[48px]"
          title="새 거점 검색 및 등록"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>추가</span>
        </button>
      </div>

      {/* Management Action Dialog Modal */}
      {managingPreset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 text-center space-y-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">거점 관리</span>
              <h3 className="text-sm font-black text-slate-900 truncate mt-0.5">
                [{managingPreset.shortName}]
              </h3>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {managingPreset.address || managingPreset.name}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onEditPreset?.(managingPreset);
                  setManagingPreset(null);
                  setIsManageMode(false);
                }}
                className="py-2.5 px-3 rounded-xl bg-[#1E60F3]/10 hover:bg-[#1E60F3]/20 text-[#1E60F3] text-xs font-bold flex items-center justify-center space-x-1.5 border border-[#1E60F3]/20 active:scale-95 transition-transform cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>수정</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  if (confirm(`'${managingPreset.shortName}' 거점을 삭제하시겠습니까?`)) {
                    onDeleteCustomPreset?.(managingPreset.id);
                    setManagingPreset(null);
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center space-x-1.5 border border-slate-200 active:scale-95 transition-transform cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                <span>삭제</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setManagingPreset(null)}
              className="w-full py-1.5 text-xs text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
