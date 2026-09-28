'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LocationPreset, HomeLocation } from '@/types';
import { Plus, Trash2, Pencil, Home as HomeIcon, ShieldAlert, X } from 'lucide-react';
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
  onOpenPresetModal?: () => void;
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
  onOpenPresetModal,
  onEditPreset,
  onDeleteCustomPreset,
  onReorderPresets,
}) => {
  const [isManageMode, setIsManageMode] = useState(false);
  const [managingPreset, setManagingPreset] = useState<LocationPreset | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  // Carousel Pagination State & Refs
  const PAGE_SIZE = 12;
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const totalPagesRef = useRef(1);
  const edgeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const edgeDirectionRef = useRef<'left' | 'right' | null>(null);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const carouselContainerRef = useRef<HTMLDivElement | null>(null);

  // Drag-and-Drop Gesture State
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDragging;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isLongPressActiveRef = useRef(false);
  const isScrollingRef = useRef(false);
  const scrollResetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeTouchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [activePressedIndex, setActivePressedIndex] = useState<number | 'home' | 'add' | null>(null);
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

  // Edge Auto-Paging & Dot Hover during Drag
  const checkEdgePaging = (clientX: number) => {
    const leftEdge = 45;
    const rightEdge = window.innerWidth - 45;
    const containerRect = carouselContainerRef.current?.getBoundingClientRect();
    const isLeftEdge = clientX <= leftEdge || (containerRect && clientX <= containerRect.left + 45);
    const isRightEdge = clientX >= rightEdge || (containerRect && clientX >= containerRect.right - 45);

    if (isLeftEdge) {
      if (edgeDirectionRef.current !== 'left') {
        if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
        edgeDirectionRef.current = 'left';
        edgeTimerRef.current = setTimeout(() => {
          if (currentPageRef.current > 0) {
            haptics.lightTap();
            setCurrentPage((prev) => {
              const next = Math.max(0, prev - 1);
              currentPageRef.current = next;
              return next;
            });
          }
          edgeDirectionRef.current = null;
        }, 300);
      }
    } else if (isRightEdge) {
      if (edgeDirectionRef.current !== 'right') {
        if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
        edgeDirectionRef.current = 'right';
        edgeTimerRef.current = setTimeout(() => {
          if (currentPageRef.current < totalPagesRef.current - 1) {
            haptics.lightTap();
            setCurrentPage((prev) => {
              const next = Math.min(totalPagesRef.current - 1, prev + 1);
              currentPageRef.current = next;
              return next;
            });
          }
          edgeDirectionRef.current = null;
        }, 300);
      }
    } else {
      if (edgeTimerRef.current) {
        clearTimeout(edgeTimerRef.current);
        edgeTimerRef.current = null;
      }
      edgeDirectionRef.current = null;
    }
  };

  const checkDotHover = (clientX: number, clientY: number) => {
    dotRefs.current.forEach((dotEl, dotIdx) => {
      if (!dotEl) return;
      const rect = dotEl.getBoundingClientRect();
      if (
        clientX >= rect.left - 12 &&
        clientX <= rect.right + 12 &&
        clientY >= rect.top - 12 &&
        clientY <= rect.bottom + 12
      ) {
        if (currentPageRef.current !== dotIdx) {
          haptics.lightTap();
          setCurrentPage(dotIdx);
          currentPageRef.current = dotIdx;
        }
      }
    });
  };

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
          const reindexed = updated.map((p, idx) => ({ ...p, order: idx }));
          itemsRef.current = reindexed;
          setItems(reindexed);
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
        checkEdgePaging(touch.clientX);
        checkDotHover(touch.clientX, touch.clientY);
      }
    };

    const handleTouchEnd = () => {
      endDrag();
    };

    const handleMouseMove = (e: MouseEvent) => {
      setPointerPos({ x: e.clientX, y: e.clientY });
      checkCenterPointHysteresis(e.clientX, e.clientY);
      checkEdgePaging(e.clientX);
      checkDotHover(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      endDrag();
    };

    const endDrag = () => {
      if (edgeTimerRef.current) {
        clearTimeout(edgeTimerRef.current);
        edgeTimerRef.current = null;
      }
      edgeDirectionRef.current = null;

      setIsDragging(false);
      setDragIndex(null);
      dragIndexRef.current = null;
      isLongPressActiveRef.current = false;
      prevRectsRef.current.clear();
      const finalItems = itemsRef.current.map((p, idx) => ({ ...p, order: idx }));
      setItems(finalItems);
      itemsRef.current = finalItems;
      onReorderPresets?.(finalItems);
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

  const scheduleScrollReset = () => {
    if (scrollResetTimerRef.current) {
      clearTimeout(scrollResetTimerRef.current);
    }
    scrollResetTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 100);
  };

  // Pointer start (350ms long press timer + 65ms active pressed feedback delay)
  const handlePointerStart = (index: number, e: React.TouchEvent | React.MouseEvent) => {
    if (isManageMode) return;

    isLongPressActiveRef.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };
    setPointerPos({ x: clientX, y: clientY });

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (activeTouchTimeoutRef.current) {
      clearTimeout(activeTouchTimeoutRef.current);
      activeTouchTimeoutRef.current = null;
    }

    // Delay active pressed visual feedback by 65ms so scroll/flick doesn't flash buttons
    activeTouchTimeoutRef.current = setTimeout(() => {
      if (!isScrollingRef.current) {
        setActivePressedIndex(index);
      }
    }, 65);

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

  // Pointer move to detect scrolling (Vertical gesture |deltaY| > 6px or Touch Slop >= 8px)
  const handlePointerMoveCheck = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartPosRef.current || isLongPressActiveRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaY = Math.abs(clientY - touchStartPosRef.current.y);
    const dist = Math.hypot(clientX - touchStartPosRef.current.x, clientY - touchStartPosRef.current.y);

    if (deltaY > 6 || dist >= 8) {
      isScrollingRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (activeTouchTimeoutRef.current) {
        clearTimeout(activeTouchTimeoutRef.current);
        activeTouchTimeoutRef.current = null;
      }
      setActivePressedIndex(null);
    }
  };

  // Pointer cancel (Touch Cancel)
  const handlePointerCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (activeTouchTimeoutRef.current) {
      clearTimeout(activeTouchTimeoutRef.current);
      activeTouchTimeoutRef.current = null;
    }
    setActivePressedIndex(null);
    isScrollingRef.current = true;
    scheduleScrollReset();
  };

  // Pointer end for normal tap with 3-Guard Verification (Touch Slop < 8px, Duration <= 300ms, Hit Test)
  const handlePointerEnd = (preset: LocationPreset, e: React.TouchEvent | React.MouseEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (activeTouchTimeoutRef.current) {
      clearTimeout(activeTouchTimeoutRef.current);
      activeTouchTimeoutRef.current = null;
    }
    setActivePressedIndex(null);

    if (isDragging) return;

    if (isLongPressActiveRef.current) {
      isLongPressActiveRef.current = false;
      return;
    }

    if (isScrollingRef.current || !touchStartPosRef.current) {
      scheduleScrollReset();
      return;
    }

    let releaseX = 0;
    let releaseY = 0;
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      releaseX = e.changedTouches[0].clientX;
      releaseY = e.changedTouches[0].clientY;
    } else if ('clientX' in e) {
      releaseX = e.clientX;
      releaseY = e.clientY;
    } else {
      releaseX = touchStartPosRef.current.x;
      releaseY = touchStartPosRef.current.y;
    }

    const duration = Date.now() - touchStartPosRef.current.time;
    const dist = Math.hypot(
      releaseX - touchStartPosRef.current.x,
      releaseY - touchStartPosRef.current.y
    );

    // 1. Touch Slop Guard: movement must be < 8px
    if (dist >= 8) {
      isScrollingRef.current = true;
      scheduleScrollReset();
      return;
    }

    // 2. Duration Guard: touch duration must be <= 300ms
    if (duration > 300) {
      scheduleScrollReset();
      return;
    }

    // 3. Bounding Rect Hit Test Guard: must release inside button boundaries
    if (e.currentTarget instanceof HTMLElement) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isInside =
        releaseX >= rect.left &&
        releaseX <= rect.right &&
        releaseY >= rect.top &&
        releaseY <= rect.bottom;
      if (!isInside) {
        scheduleScrollReset();
        return;
      }
    }

    // Deliberate tap validated!
    haptics.lightTap();
    if (isManageMode) {
      setManagingPreset(preset);
    } else {
      onSelectPreset(preset);
    }

    scheduleScrollReset();
  };

  // Home Slot Touch Handlers with same 3-Guard Verification
  const handleHomePointerStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };

    if (activeTouchTimeoutRef.current) {
      clearTimeout(activeTouchTimeoutRef.current);
    }
    activeTouchTimeoutRef.current = setTimeout(() => {
      if (!isScrollingRef.current) {
        setActivePressedIndex('home');
      }
    }, 65);
  };

  const handleHomePointerEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (activeTouchTimeoutRef.current) {
      clearTimeout(activeTouchTimeoutRef.current);
      activeTouchTimeoutRef.current = null;
    }
    setActivePressedIndex(null);

    if (isScrollingRef.current || !touchStartPosRef.current) {
      scheduleScrollReset();
      return;
    }

    let releaseX = 0;
    let releaseY = 0;
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      releaseX = e.changedTouches[0].clientX;
      releaseY = e.changedTouches[0].clientY;
    } else if ('clientX' in e) {
      releaseX = e.clientX;
      releaseY = e.clientY;
    } else {
      releaseX = touchStartPosRef.current.x;
      releaseY = touchStartPosRef.current.y;
    }

    const duration = Date.now() - touchStartPosRef.current.time;
    const dist = Math.hypot(
      releaseX - touchStartPosRef.current.x,
      releaseY - touchStartPosRef.current.y
    );

    if (dist >= 8 || duration > 300) {
      isScrollingRef.current = true;
      scheduleScrollReset();
      return;
    }

    if (e.currentTarget instanceof HTMLElement) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isInside =
        releaseX >= rect.left &&
        releaseX <= rect.right &&
        releaseY >= rect.top &&
        releaseY <= rect.bottom;
      if (!isInside) {
        scheduleScrollReset();
        return;
      }
    }

    haptics.lightTap();
    if (isHomeConfigured) {
      if (isManageMode) {
        onOpenHomeModal();
      } else {
        onSelectPreset(homePreset);
      }
    } else {
      onOpenHomeModal();
    }

    scheduleScrollReset();
  };

  // Add Slot Touch Handlers with 3-Guard Verification
  const handleAddPointerStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartPosRef.current = { x: clientX, y: clientY, time: Date.now() };

    if (activeTouchTimeoutRef.current) {
      clearTimeout(activeTouchTimeoutRef.current);
    }
    activeTouchTimeoutRef.current = setTimeout(() => {
      if (!isScrollingRef.current) {
        setActivePressedIndex('add');
      }
    }, 65);
  };

  const handleAddPointerEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (activeTouchTimeoutRef.current) {
      clearTimeout(activeTouchTimeoutRef.current);
      activeTouchTimeoutRef.current = null;
    }
    setActivePressedIndex(null);

    if (isScrollingRef.current || !touchStartPosRef.current) {
      scheduleScrollReset();
      return;
    }

    let releaseX = 0;
    let releaseY = 0;
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      releaseX = e.changedTouches[0].clientX;
      releaseY = e.changedTouches[0].clientY;
    } else if ('clientX' in e) {
      releaseX = e.clientX;
      releaseY = e.clientY;
    } else {
      releaseX = touchStartPosRef.current.x;
      releaseY = touchStartPosRef.current.y;
    }

    const duration = Date.now() - touchStartPosRef.current.time;
    const dist = Math.hypot(
      releaseX - touchStartPosRef.current.x,
      releaseY - touchStartPosRef.current.y
    );

    if (dist >= 8 || duration > 300) {
      isScrollingRef.current = true;
      scheduleScrollReset();
      return;
    }

    if (e.currentTarget instanceof HTMLElement) {
      const rect = e.currentTarget.getBoundingClientRect();
      const isInside =
        releaseX >= rect.left &&
        releaseX <= rect.right &&
        releaseY >= rect.top &&
        releaseY <= rect.bottom;
      if (!isInside) {
        scheduleScrollReset();
        return;
      }
    }

    haptics.lightTap();
    onOpenAddModal();
    scheduleScrollReset();
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

  type SlotItem =
    | { type: 'home' }
    | { type: 'preset'; preset: LocationPreset; index: number }
    | { type: 'add' };

  const allSlots: SlotItem[] = [
    { type: 'home' },
    ...items.map((preset, index) => ({ type: 'preset' as const, preset, index })),
    { type: 'add' },
  ];

  const totalPages = Math.max(1, Math.ceil(allSlots.length / PAGE_SIZE));
  totalPagesRef.current = totalPages;
  currentPageRef.current = currentPage;

  // Clamp current page when total pages shrink
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, currentPage]);

  const pages: SlotItem[][] = [];
  for (let i = 0; i < allSlots.length; i += PAGE_SIZE) {
    pages.push(allSlots.slice(i, i + PAGE_SIZE));
  }
  if (pages.length === 0) {
    pages.push([{ type: 'home' }, { type: 'add' }]);
  }

  // Horizontal swipe gesture for carousel
  const carouselTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleCarouselTouchStart = (e: React.TouchEvent) => {
    if (isDragging || isLongPressActiveRef.current) return;
    carouselTouchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleCarouselTouchEnd = (e: React.TouchEvent) => {
    if (!carouselTouchStartRef.current || isDragging || isLongPressActiveRef.current) {
      carouselTouchStartRef.current = null;
      return;
    }
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const dx = touchEndX - carouselTouchStartRef.current.x;
    const dy = touchEndY - carouselTouchStartRef.current.y;
    carouselTouchStartRef.current = null;

    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      isScrollingRef.current = true;
      scheduleScrollReset();
    }

    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && currentPage < totalPages - 1) {
        haptics.lightTap();
        setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1));
      } else if (dx > 0 && currentPage > 0) {
        haptics.lightTap();
        setCurrentPage((prev) => Math.max(prev - 1, 0));
      }
    }
  };

  const handleCarouselTouchMove = (e: React.TouchEvent) => {
    if (!carouselTouchStartRef.current || isDragging || isLongPressActiveRef.current) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - carouselTouchStartRef.current.x;
    const dy = currentY - carouselTouchStartRef.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      isScrollingRef.current = true;
    }
  };

  const handleCarouselTouchCancel = () => {
    carouselTouchStartRef.current = null;
    isScrollingRef.current = true;
    scheduleScrollReset();
  };

  // Slot Render Helpers
  const renderHomeSlot = () => {
    if (isHomeConfigured) {
      return (
        <div key="slot_home" className="relative select-none touch-pan-y h-full">
          <button
            type="button"
            onTouchStart={handleHomePointerStart}
            onTouchMove={handlePointerMoveCheck}
            onTouchEnd={handleHomePointerEnd}
            onTouchCancel={handlePointerCancel}
            onMouseDown={handleHomePointerStart}
            onMouseMove={handlePointerMoveCheck}
            onMouseUp={handleHomePointerEnd}
            onClick={(e) => {
              if (isScrollingRef.current) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            className={`w-full h-full min-h-[58px] px-2 py-2.5 rounded-xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-200 group select-none [-webkit-tap-highlight-color:transparent] ${activePressedIndex === 'home' ? 'scale-[0.97] bg-slate-100/90' : ''
              } ${isHomeDestination
                ? 'border-2 border-[#1E60F3] text-[#1E60F3] bg-white font-bold shadow-sm shadow-blue-500/10'
                : isHomeOrigin
                  ? 'bg-slate-50/80 text-slate-800 border-slate-300/90 ring-1 ring-slate-200/60 font-bold shadow-2xs'
                  : `bg-white border-slate-200 text-slate-700 font-semibold ${dynamicHoverClasses}`
              } ${isManageMode ? 'border-dashed border-[#1E60F3]/60' : ''}`}
            title={`${homePreset.name} (${homePreset.address})`}
          >
            <div className="flex items-center justify-center gap-1 w-full">
              <HomeIcon
                className={`w-3.5 h-3.5 shrink-0 transition-colors ${isHomeDestination
                  ? 'text-[#1E60F3]'
                  : isHomeOrigin
                    ? 'text-slate-600'
                    : isTargetDestination
                      ? 'text-slate-500 group-hover:text-[#1E60F3]'
                      : 'text-slate-500 group-hover:text-slate-700'
                  }`}
              />
              <span
                className={`text-sm tracking-tight truncate font-bold ${isHomeDestination
                  ? 'text-[#1E60F3]'
                  : isHomeOrigin
                    ? 'text-slate-900'
                    : `text-slate-800 ${dynamicTextHoverClass}`
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
                {isManageMode ? '수정' : '개인'}
              </span>
            )}
          </button>
        </div>
      );
    }

    return (
      <div key="slot_home" className="relative select-none touch-pan-y h-full">
        <button
          type="button"
          onTouchStart={handleHomePointerStart}
          onTouchMove={handlePointerMoveCheck}
          onTouchEnd={handleHomePointerEnd}
          onTouchCancel={handlePointerCancel}
          onMouseDown={handleHomePointerStart}
          onMouseMove={handlePointerMoveCheck}
          onMouseUp={handleHomePointerEnd}
          onClick={(e) => {
            if (isScrollingRef.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className={`w-full h-full min-h-[58px] py-2.5 px-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/80 ${dynamicHoverClasses} text-slate-800 flex flex-col justify-between items-center transition-all duration-200 cursor-pointer group select-none [-webkit-tap-highlight-color:transparent] ${activePressedIndex === 'home' ? 'scale-[0.97] bg-slate-100/90' : ''
            }`}
          title="자택 주소를 등록하세요"
        >
          <div className="flex items-center justify-center gap-1 w-full">
            <HomeIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0 transition-colors" />
            <span className="text-sm font-bold text-slate-600 group-hover:text-slate-800 tracking-tight transition-colors">
              자택
            </span>
          </div>

          <div className="flex items-center justify-center gap-0.5 w-full mt-0.5">
            <Plus className="w-3 h-3 text-[#1E60F3] stroke-[2.5] shrink-0" />
            <span className="text-[11px] font-semibold text-[#1E60F3] leading-none">
              주소 등록
            </span>
          </div>
        </button>
      </div>
    );
  };

  const renderPresetSlot = (preset: LocationPreset, index: number) => {
    const isOrigin = selectedOriginId === preset.id;
    const isDestination = selectedDestinationId === preset.id;
    const isThisItemDragging = isDragging && dragIndex === index;
    const isHQ = Boolean(preset.isCommon || preset.type === 'common' || preset.isGlobal || (!preset.vehicle_no && !preset.vehicleNo));
    const badgeLabel = isHQ ? '공통' : '개인';

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
        key={`${preset.id}-${index}`}
        ref={(el) => {
          itemRefs.current[index] = el;
        }}
        className="relative select-none touch-pan-y will-change-transform h-full"
      >
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
            onTouchEnd={(e) => handlePointerEnd(preset, e)}
            onTouchCancel={handlePointerCancel}
            onMouseDown={(e) => handlePointerStart(index, e)}
            onMouseMove={handlePointerMoveCheck}
            onMouseUp={(e) => handlePointerEnd(preset, e)}
            onClick={(e) => {
              if (isScrollingRef.current) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            className={`w-full h-full min-h-[58px] px-2 py-2.5 rounded-xl border text-center flex flex-col justify-between items-center cursor-pointer transition-all duration-200 group select-none [-webkit-tap-highlight-color:transparent] ${activePressedIndex === index ? 'scale-[0.97] bg-slate-100/90' : ''
              } ${stateClasses}`}
            title={`${preset.name} (길게 눌러 순서 변경)`}
          >
            <span
              className={`text-sm font-bold tracking-tight truncate w-full ${isDestination
                ? 'text-[#1E60F3]'
                : isOrigin
                  ? 'text-slate-900'
                  : `text-slate-800 ${dynamicTextHoverClass}`
                } transition-colors`}
            >
              {preset.shortName}
            </span>

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
  };

  const renderAddSlot = () => (
    <button
      key="slot_add"
      type="button"
      onTouchStart={handleAddPointerStart}
      onTouchMove={handlePointerMoveCheck}
      onTouchEnd={handleAddPointerEnd}
      onTouchCancel={handlePointerCancel}
      onMouseDown={handleAddPointerStart}
      onMouseMove={handlePointerMoveCheck}
      onMouseUp={handleAddPointerEnd}
      onClick={(e) => {
        if (isScrollingRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }}
      className={`w-full h-full min-h-[58px] py-2.5 px-2 rounded-xl border border-dashed border-slate-300 ${isTargetDestination
        ? 'hover:border-blue-300/80 hover:bg-blue-50/40 hover:text-[#1E60F3]'
        : 'hover:border-slate-400 hover:bg-slate-50/80 hover:text-slate-800'
        } bg-white hover:shadow-xs hover:-translate-y-0.5 text-slate-400 text-sm font-medium flex flex-col justify-between items-center transition-all duration-200 cursor-pointer select-none touch-pan-y [-webkit-tap-highlight-color:transparent] ${activePressedIndex === 'add' ? 'scale-[0.97] bg-slate-100/90' : ''
        }`}
      title="새 거점 검색 및 등록"
    >
      <div className="flex items-center justify-center gap-1 w-full">
        <Plus className="w-3.5 h-3.5" />
        <span className="font-bold">추가</span>
      </div>
      <span className="text-[10px] text-slate-400 leading-none mt-0.5">신규 거점</span>
    </button>
  );

  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] select-none space-y-3">
      {/* Header: '자주 가는 목적지' 헤더 영역은 좌측 타이틀 텍스트만 단정하게 유지 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 shrink-0">
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
          <h2 className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">자주 가는 목적지</h2>
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

      {/* 3-Column High-Density Grid with Horizontal Carousel Pagination (Max 4 rows per page) */}
      <div
        ref={carouselContainerRef}
        className="w-full overflow-hidden select-none touch-pan-y px-1 pt-1 pb-7 sm:pb-8"
        onClickCapture={(e) => {
          if (isScrollingRef.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onTouchStart={handleCarouselTouchStart}
        onTouchMove={handleCarouselTouchMove}
        onTouchEnd={handleCarouselTouchEnd}
        onTouchCancel={handleCarouselTouchCancel}
      >
        <div
          className="flex transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: `translateX(-${currentPage * 100}%)` }}
        >
          {pages.map((pageSlots, pageIdx) => (
            <div key={pageIdx} className="w-full shrink-0">
              <div
                className={`grid grid-cols-3 gap-2 content-start ${totalPages > 1 ? 'min-h-[268px]' : ''
                  }`}
              >
                {pageSlots.map((slot) => {
                  if (slot.type === 'home') return renderHomeSlot();
                  if (slot.type === 'preset') return renderPresetSlot(slot.preset, slot.index);
                  if (slot.type === 'add') return renderAddSlot();
                  return null;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Dots Pagination (Only visible when totalPages > 1 / next page exists) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2 pb-1 mt-2.5 sm:mt-3">
          {Array.from({ length: totalPages }).map((_, idx) => {
            const isActive = idx === currentPage;
            return (
              <button
                key={idx}
                ref={(el) => {
                  dotRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setCurrentPage(idx);
                }}
                onMouseEnter={() => {
                  if (isDraggingRef.current && currentPageRef.current !== idx) {
                    haptics.lightTap();
                    setCurrentPage(idx);
                    currentPageRef.current = idx;
                  }
                }}
                aria-label={`페이지 ${idx + 1}`}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer focus:outline-none ${isActive
                  ? 'w-6 bg-[#1E60F3] shadow-[0_2px_8px_rgba(30,96,243,0.35)]'
                  : 'w-2 bg-slate-300 hover:bg-slate-400'
                  }`}
              />
            );
          })}
        </div>
      )}

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
          <span className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">
            {draggedPreset.shortName}
          </span>
        </div>
      )}

      {/* Managing Single Preset Action Modal (Portaled directly to document.body to prevent stacking context overlap) */}
      {isMounted && managingPreset && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
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
                    className="w-full py-2.5 px-4 bg-[#1E60F3] hover:bg-[#1346D8] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.97] active:bg-[#0f3bb8] text-white font-bold rounded-xl text-sm flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs transition-all duration-150 ease-out"
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
                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 font-semibold rounded-xl text-sm flex items-center justify-center space-x-1.5 cursor-pointer active:translate-y-0 active:scale-[0.97] transition-all duration-150 ease-out"
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
                  className="w-full py-2.5 px-4 text-slate-400 hover:text-slate-600 font-medium text-sm flex items-center justify-center space-x-1.5 cursor-pointer transition-colors active:scale-95"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                  <span>닫기</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
  );
};
