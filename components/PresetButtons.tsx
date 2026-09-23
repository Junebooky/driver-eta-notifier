'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { LocationPreset, HomeLocation } from '@/types';
import { Plus, Trash2, Pencil, SlidersHorizontal, Home as HomeIcon, ShieldAlert, Fuel, Plane, ClipboardCheck } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface PresetButtonsProps {
  presets: LocationPreset[];
  homeLocation?: HomeLocation | null;
  selectedOriginId?: string;
  selectedDestinationId?: string;
  selectionTarget?: 'origin' | 'destination';
  isAdmin?: boolean;
  onSelectPreset: (preset: LocationPreset) => void;
  onOpenAddModal: () => void;
  onOpenHomeModal: () => void;
  onOpenFlightModal?: () => void;
  onOpenGasModal?: () => void;
  onOpenInspectionModal?: () => void;
  onEditPreset?: (preset: LocationPreset) => void;
  onDeleteCustomPreset?: (id: string) => void;
  onReorderPresets?: (reordered: LocationPreset[]) => void;
}

export const PresetButtons: React.FC<PresetButtonsProps> = ({
  presets,
  homeLocation,
  selectedOriginId,
  selectedDestinationId,
  selectionTarget = 'destination',
  isAdmin = false,
  onSelectPreset,
  onOpenAddModal,
  onOpenHomeModal,
  onOpenFlightModal,
  onOpenGasModal,
  onOpenInspectionModal,
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

  const isTargetDestination = selectionTarget === 'destination';
  const dynamicHoverClasses = isTargetDestination
    ? 'hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/30 hover:shadow-xs hover:-translate-y-0.5'
    : 'hover:border-slate-400 hover:text-slate-800 hover:bg-slate-50/80 hover:shadow-xs hover:-translate-y-0.5';
  const dynamicTextHoverClass = isTargetDestination ? 'group-hover:text-[#1E60F3]' : 'group-hover:text-slate-800';

  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] select-none space-y-3">
      {/* Header: Classic Teardrop MapPin with Center Circular Cutout in Cobalt Badge on Left, 거점 관리 on Right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-[#1E60F3] flex items-center justify-center shadow-xs shrink-0">
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">자주 가는 목적지</h2>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenInspectionModal && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenInspectionModal();
              }}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-2xs text-slate-700 hover:bg-[#1E60F3] hover:text-white hover:border-[#1E60F3] active:scale-95 flex items-center justify-center transition-all cursor-pointer"
              title="차량 수령·반납 점검표"
              aria-label="차량 점검"
            >
              <ClipboardCheck className="w-4 h-4" />
            </button>
          )}

          {onOpenFlightModal && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenFlightModal();
              }}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-2xs text-slate-700 hover:bg-[#1E60F3] hover:text-white hover:border-[#1E60F3] active:scale-95 flex items-center justify-center transition-all cursor-pointer"
              title="인천공항 실시간 운항 관제"
              aria-label="항공편 조회"
            >
              <Plane className="w-4 h-4" />
            </button>
          )}

          {onOpenGasModal && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenGasModal();
              }}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-2xs text-slate-700 hover:bg-[#1E60F3] hover:text-white hover:border-[#1E60F3] active:scale-95 flex items-center justify-center transition-all cursor-pointer"
              title="실시간 주유소 추천"
              aria-label="주유소 추천"
            >
              <Fuel className="w-4 h-4" />
            </button>
          )}

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
              className={`w-full h-full min-h-[58px] px-2 py-2.5 rounded-xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-200 group ${
                isHomeDestination
                  ? 'border-2 border-[#1E60F3] text-[#1E60F3] bg-white font-bold shadow-sm shadow-blue-500/10'
                  : isHomeOrigin
                  ? 'bg-slate-50/80 text-slate-800 border-slate-300/90 ring-1 ring-slate-200/60 font-bold shadow-2xs'
                  : `bg-white border-slate-200 text-slate-700 font-semibold ${dynamicHoverClasses}`
              } ${isManageMode ? 'border-dashed border-[#1E60F3]/60' : ''}`}
              title={`${homePreset.name} (${homePreset.address})`}
            >
              <div className="flex items-center justify-center gap-1 w-full">
                <HomeIcon
                  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                    isHomeDestination
                      ? 'text-[#1E60F3]'
                      : isHomeOrigin
                      ? 'text-slate-600'
                      : isTargetDestination
                      ? 'text-slate-500 group-hover:text-[#1E60F3]'
                      : 'text-slate-500 group-hover:text-slate-700'
                  }`}
                />
                <span
                  className={`text-xs tracking-tight truncate font-bold ${
                    isHomeDestination
                      ? 'text-[#1E60F3]'
                      : isHomeOrigin
                      ? 'text-slate-900'
                      : `text-slate-700 ${dynamicTextHoverClass}`
                  } transition-colors`}
                >
                  자택
                </span>
              </div>

              {isHomeDestination && (
                <span className="text-[10px] font-bold text-[#1E60F3] flex items-center justify-center gap-1 mt-0.5 leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                  도착지
                </span>
              )}
              {isHomeOrigin && !isHomeDestination && (
                <span className="text-[10px] font-semibold text-slate-600 flex items-center justify-center gap-1 mt-0.5 leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  출발지
                </span>
              )}
              {!isHomeDestination && !isHomeOrigin && (
                <span className="text-[11px] font-medium tracking-wide text-slate-400 group-hover:text-slate-600 leading-none mt-0.5">
                  {isManageMode ? '수정' : 'MY'}
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
              className={`w-full h-full min-h-[58px] py-2.5 px-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/80 ${dynamicHoverClasses} text-slate-800 flex flex-col justify-between items-center active:scale-95 transition-all duration-200 cursor-pointer group`}
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
          const isHQ = !preset.vehicle_no && !preset.vehicleNo;
          const badgeLabel = isHQ ? 'HQ' : 'MY';

          let stateClasses = `bg-white border-slate-200 text-slate-700 font-medium ${dynamicHoverClasses}`;
          if (isDestination) {
            stateClasses =
              'border-2 border-[#1E60F3] text-[#1E60F3] bg-white font-bold shadow-sm shadow-blue-500/10';
          } else if (isOrigin) {
            stateClasses =
              'bg-slate-50/80 text-slate-800 border-slate-300/90 ring-1 ring-slate-200/60 font-bold shadow-2xs';
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
              {/* If this slot is currently being dragged, show exact-sized dashed placeholder to prevent jitter */}
              {isThisItemDragging ? (
                <div
                  className="w-full h-full min-h-[58px] border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50/20 flex items-center justify-center transition-all duration-200"
                  aria-hidden="true"
                />
              ) : (
                <button
                  type="button"
                  onTouchStart={(e) => handlePointerStart(index, e)}
                  onTouchMove={handlePointerMoveCheck}
                  onTouchEnd={() => handlePointerEnd(preset)}
                  onMouseDown={(e) => handlePointerStart(index, e)}
                  onMouseMove={handlePointerMoveCheck}
                  onMouseUp={() => handlePointerEnd(preset)}
                  className={`w-full h-full min-h-[58px] px-2 py-2.5 rounded-xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-200 group ${stateClasses}`}
                  title={`${preset.name} (길게 눌러 순서 변경)`}
                >
                  <span
                    className={`text-xs font-bold tracking-tight truncate w-full ${
                      isDestination
                        ? 'text-[#1E60F3]'
                        : isOrigin
                        ? 'text-slate-900'
                        : `text-slate-700 ${dynamicTextHoverClass}`
                    } transition-colors`}
                  >
                    {preset.shortName}
                  </span>

                  {/* Status Indicator Tag */}
                  {isDestination && (
                    <span className="text-[10px] font-bold text-[#1E60F3] flex items-center justify-center gap-1 mt-0.5 leading-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                      도착지
                    </span>
                  )}
                  {isOrigin && !isDestination && (
                    <span className="text-[10px] font-semibold text-slate-600 flex items-center justify-center gap-1 mt-0.5 leading-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      출발지
                    </span>
                  )}
                  {!isDestination && !isOrigin && (
                    <span className="text-[11px] font-medium tracking-wide text-slate-400 group-hover:text-slate-600 leading-none mt-0.5">
                      {isManageMode ? (isHQ ? '공통' : '관리') : badgeLabel}
                    </span>
                  )}
                </button>
              )}
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
          className={`w-full h-full min-h-[58px] py-2.5 px-2 rounded-xl border border-dashed border-slate-300 ${
            isTargetDestination
              ? 'hover:border-blue-300/80 hover:bg-blue-50/40 hover:text-[#1E60F3]'
              : 'hover:border-slate-400 hover:bg-slate-50/80 hover:text-slate-800'
          } bg-white hover:shadow-xs hover:-translate-y-0.5 text-slate-400 text-xs font-medium flex flex-col justify-between items-center active:scale-95 transition-all duration-200 cursor-pointer`}
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
      {/* FLOATING DRAG LAYER (z-50 pointer-events-none Compact Mini Chip) */}
      {/* ============================================================== */}
      {isDragging && draggedPreset && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 will-change-transform shadow-2xl rounded-2xl bg-white border-2 border-[#1E60F3] ring-2 ring-[#1E60F3] px-3.5 py-2 flex items-center justify-center scale-75 opacity-90 transition-transform duration-200 ease-out"
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

      {/* Management Action Dialog Modal */}
      {managingPreset && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] sm:items-center sm:pt-0 p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setManagingPreset(null);
            }
          }}
        >
          <div
            className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
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
                  className="w-full py-2.5 px-4 bg-[#1E60F3] hover:bg-[#1346D8] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.97] active:bg-[#0f3bb8] text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs transition-all duration-150 ease-out"
                >
                  <Pencil className="w-3.5 h-3.5 text-white" />
                  <span>수정</span>
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
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 font-semibold rounded-xl text-xs flex items-center justify-center space-x-1.5 cursor-pointer active:translate-y-0 active:scale-[0.97] transition-all duration-150 ease-out"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {managingPreset.isGlobal ? '공통 거점 삭제' : '삭제'}
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
