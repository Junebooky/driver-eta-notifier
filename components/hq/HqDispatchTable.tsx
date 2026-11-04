'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Calendar,
  Plus,
  Search,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  FileText,
  RotateCcw,
  Users,
  PhoneCall,
  Mail,
  Ban,
  MessageSquareText,
  Send,
  ChevronLeft,
  ChevronRight,
  History,
} from 'lucide-react';
import { HqMobileBookingList } from './HqMobileBookingList';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';
import { VIP_REAL_VEHICLES, stripManufacturerName } from '@/utils/vehicleData';
import { DEFAULT_DRIVER_PROFILES } from '@/utils/settlementCalculator';
import { isBookingInPast } from '@/utils/dispatchConflictDetector';

export type HqDispatchTabKey = 'action' | 'today' | 'tomorrow' | 'all' | 'past';

export interface HqDispatchTableProps {
  bookings: HqBooking[];
  allBookingsForCounts?: HqBooking[];
  activeTab: HqDispatchTabKey;
  onSelectTab: (tab: HqDispatchTabKey) => void;
  onOpenNewBooking: () => void;
  onViewBooking: (booking: HqBooking) => void;
  onAssignDriver?: (booking: HqBooking) => void;
  onResendBrochure?: (booking: HqBooking) => void;
  onOpenCustomerMessage?: (booking: HqBooking) => void;
  onRemindDriver?: (booking: HqBooking) => void;
}

export function truncateLocation(text?: string | null, maxChars: number = 13): string {
  if (!text) return '-';
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

export const HqDispatchTable: React.FC<HqDispatchTableProps> = ({
  bookings,
  allBookingsForCounts,
  activeTab,
  onSelectTab,
  onOpenNewBooking,
  onViewBooking,
  onAssignDriver,
  onOpenCustomerMessage,
  onRemindDriver,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [dispatchIconError, setDispatchIconError] = useState(false);

  const handleClockClick = async (e: React.MouseEvent, b: HqBooking) => {
    e.stopPropagation();
    haptics.mediumTap();
    if (!onRemindDriver || remindingId === b.id) return;
    setRemindingId(b.id);
    try {
      await onRemindDriver(b);
    } finally {
      setRemindingId(null);
    }
  };

  const sourceForCounts = allBookingsForCounts || bookings;

  const tabCounts = useMemo(() => {
    const activeNonCancelled = sourceForCounts.filter((b) => b.dispatchStatus !== '취소');
    const upcomingNonCancelled = activeNonCancelled.filter((b) => !isBookingInPast(b));
    const pastBookings = sourceForCounts.filter((b) => isBookingInPast(b));

    return {
      action: upcomingNonCancelled.filter(
        (b) =>
          b.dispatchStatus === '미배정' ||
          b.dispatchStatus === '작성 중' ||
          b.dispatchStatus === '재확인 필요' ||
          b.driverAck === '미확인' ||
          b.driverAck === '재확인 필요' ||
          b.hasConflict
      ).length,
      today: sourceForCounts.filter((b) => b.isToday).length,
      tomorrow: sourceForCounts.filter((b) => b.isTomorrow).length,
      all: sourceForCounts.filter((b) => !isBookingInPast(b)).length,
      past: pastBookings.length,
    };
  }, [sourceForCounts]);

  const driverOptions = useMemo(() => {
    const names = new Set<string>(DEFAULT_DRIVER_PROFILES.map((d) => d.name));
    sourceForCounts.forEach((b) => {
      if (b.driverName && b.driverName !== '-' && b.driverName !== '미배정') {
        names.add(b.driverName.replace(/\s*기사$/, '').trim());
      }
    });
    return Array.from(names);
  }, [sourceForCounts]);

  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    sourceForCounts.forEach((b) => {
      if (b.customerName) names.add(b.customerName);
    });
    return Array.from(names);
  }, [sourceForCounts]);

  const handleResetFilters = () => {
    haptics.lightTap();
    setSearchQuery('');
    setStatusFilter('all');
    setDriverFilter('all');
    setVehicleFilter('all');
    setCustomerFilter('all');
  };

  const filteredList = useMemo(() => {
    return bookings.filter((b) => {
      const isPast = isBookingInPast(b);

      if (activeTab === 'past') {
        if (!isPast) return false;
      } else {
        // Active operational tabs ('action', 'today', 'tomorrow', 'all') only show current & upcoming dispatches
        if (isPast) return false;

        if (activeTab === 'today' && !b.isToday) return false;
        if (activeTab === 'tomorrow' && !b.isTomorrow) return false;
        if (activeTab === 'action') {
          const needsAction =
            b.dispatchStatus !== '취소' &&
            (b.dispatchStatus === '미배정' ||
              b.dispatchStatus === '작성 중' ||
              b.dispatchStatus === '재확인 필요' ||
              b.driverAck === '미확인' ||
              b.driverAck === '재확인 필요' ||
              Boolean(b.hasConflict));
          if (!needsAction) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          b.customerName.toLowerCase().includes(q) ||
          b.bookingNo.toLowerCase().includes(q) ||
          b.destination.toLowerCase().includes(q) ||
          b.pickupLocation.toLowerCase().includes(q) ||
          b.driverName.toLowerCase().includes(q) ||
          (b.passengerName && b.passengerName.toLowerCase().includes(q)) ||
          b.vehicleModel.toLowerCase().includes(q) ||
          (b.vehiclePlate && b.vehiclePlate.toLowerCase().includes(q));
        if (!matches) return false;
      }

      if (statusFilter === 'conflict') {
        if (!b.hasConflict) return false;
      } else if (statusFilter === 'unacked') {
        if (b.driverAck !== '미확인' && b.driverAck !== '재확인 필요') return false;
      } else if (statusFilter !== 'all' && b.dispatchStatus !== statusFilter) {
        return false;
      }

      if (driverFilter !== 'all') {
        const cleanDrv = b.driverName.replace(/\s*기사$/, '').trim();
        if (cleanDrv !== driverFilter) return false;
      }

      if (vehicleFilter !== 'all') {
        const matchesVehicle =
          b.vehiclePlate === vehicleFilter ||
          b.vehicleModel === vehicleFilter ||
          b.vehicleModel.includes(vehicleFilter);
        if (!matchesVehicle) return false;
      }

      if (customerFilter !== 'all' && b.customerName !== customerFilter) return false;

      return true;
    });
  }, [bookings, activeTab, searchQuery, statusFilter, driverFilter, vehicleFilter, customerFilter]);

  // Horizontal Table Scroll Management & Centered Navigation
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = tableContainerRef.current;
    if (!el) return;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => checkScroll());
      resizeObserver.observe(el);
    }

    window.addEventListener('resize', checkScroll);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, filteredList]);

  const scrollTable = (direction: 'left' | 'right') => {
    haptics.lightTap();
    if (!tableContainerRef.current) return;
    const offset = direction === 'left' ? -340 : 340;
    tableContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(checkScroll, 320);
  };

  return (
    <div className="w-full bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
      {/* 1. Header */}
      <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* 배차 관리 목록 아이콘 & 마우스 호버 툴팁 */}
          <div className="relative group/dispatch inline-flex items-center justify-center cursor-pointer shrink-0">
            {!dispatchIconError ? (
              <img
                src="/images/icons/reservations/icon_reservation.png"
                alt="배차 관리 목록"
                onError={() => setDispatchIconError(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0 transition-transform duration-150 group-hover/dispatch:scale-110"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#1E60F3] flex items-center justify-center shrink-0 transition-transform duration-150 group-hover/dispatch:scale-110 shadow-2xs">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            )}

            {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/dispatch:flex flex-col items-start pointer-events-none z-50">
              <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                실시간 예약 접수와 기사님 배정 일정을 관리해요
              </span>
              <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 ml-3.5 shadow-xs" />
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate">
              배차 관리 목록
            </h2>
            <p className="text-[11px] text-slate-400 font-medium truncate">
              예약을 누르면 기사님 배정과 고객 안내를 바로 처리할 수 있어요.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenNewBooking();
          }}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>새 예약 등록</span>
        </button>
      </div>

      {/* 2. Operational Tabs (with real live counts) */}
      <div className="pt-3 flex items-center justify-between gap-2 overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onSelectTab('action');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'action'
                ? 'bg-[#0B1E48] text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80'
            }`}
          >
            <span>확인 필요</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'action' ? 'bg-[#1E60F3] text-white' : 'bg-slate-900 text-white'
              }`}
            >
              {tabCounts.action}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onSelectTab('today');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'today'
                ? 'bg-[#1E60F3] text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <span>오늘 출발</span>
            <span className="font-black">{tabCounts.today}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onSelectTab('tomorrow');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'tomorrow'
                ? 'bg-[#1E60F3] text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <span>내일 출발</span>
            <span className="font-black">{tabCounts.tomorrow}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onSelectTab('all');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'all'
                ? 'bg-[#1E60F3] text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
            title="오늘 및 향후 모든 배차 일정"
          >
            <span>전체 예정</span>
            <span className="font-black">{tabCounts.all}</span>
          </button>
        </div>

        {/* Past Records Tab */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onSelectTab('past');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'past'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
            }`}
            title="출발 일시가 오늘 이전인 과거 배차 기록 (정산용 데이터 보존)"
          >
            <History className="w-3.5 h-3.5" />
            <span>지난 일정</span>
            <span className="font-bold text-[11px] opacity-80">{tabCounts.past}</span>
          </button>
        </div>
      </div>

      {/* Notice Banner when viewing Past Records */}
      {activeTab === 'past' && (
        <div className="mt-2.5 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/90 text-xs text-slate-600 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
            <span className="truncate">
              출발 일시가 오늘 이전인 과거 배차 기록입니다. 정산 및 리포트 통계에 안전하게 보존되어 있어요.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('all')}
            className="text-[11px] font-bold text-[#1E60F3] hover:underline shrink-0 cursor-pointer"
          >
            현재 배차 목록 보기 →
          </button>
        </div>
      )}

      {/* 3. Filter Row */}
      <div className="pt-2.5 pb-1 flex flex-wrap items-center gap-2 text-xs">
        <div className="relative flex-1 min-w-[160px] sm:min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="고객사, 승객명, 목적지로 찾아보세요"
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 font-medium focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">전체 상태</option>
          <option value="미배정">미배정 (배차대기)</option>
          <option value="unacked">확인 대기 / 재확인</option>
          <option value="재확인 필요">변경 재확인 필요</option>
          <option value="conflict">일정 충돌 경고</option>
          <option value="배차 완료">배차 완료</option>
          <option value="작성 중">임시 초안</option>
          <option value="취소">취소됨</option>
        </select>

        <select
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">전체 기사</option>
          {driverOptions.map((name) => (
            <option key={name} value={name}>
              {name} 기사
            </option>
          ))}
        </select>

        <select
          value={vehicleFilter}
          onChange={(e) => setVehicleFilter(e.target.value)}
          className="hidden sm:block px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[170px]"
        >
          <option value="all">전체 차량</option>
          {VIP_REAL_VEHICLES.map((v) => (
            <option key={v.id} value={v.plate}>
              {v.plate} · {v.modelShort}
            </option>
          ))}
        </select>

        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="hidden md:block px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[160px]"
        >
          <option value="all">전체 고객사</option>
          {customerOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleResetFilters}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg font-bold transition-all cursor-pointer"
        >
          <RotateCcw className="w-3 h-3 text-slate-400" />
          <span>초기화</span>
        </button>
      </div>

      <HqMobileBookingList bookings={filteredList} onView={onViewBooking} onAssign={onAssignDriver || onViewBooking} />
      <div className="hidden lg:block">
        {/* 5. Container-Query Semantic Data Table with Floating Centered Navigation Arrows */}
        <div className="relative group/table-scroll mt-2">
        {/* Floating Centered Left Navigation Arrow */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollTable('left')}
            aria-label="이전 컬럼으로 이동"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_8px_24px_rgba(15,23,42,0.18)] text-slate-700 hover:text-[#1E60F3] hover:border-[#1E60F3] hover:scale-110 active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
            title="이전 컬럼으로 이동"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Floating Centered Right Navigation Arrow */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollTable('right')}
            aria-label="다음 컬럼으로 이동"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md border border-blue-200 shadow-[0_8px_24px_rgba(30,96,243,0.22)] text-[#1E60F3] hover:bg-blue-50 hover:scale-110 active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none animate-pulse-subtle"
            title="다음 컬럼으로 이동 (배차 상태 · 기사 확인 · 안내)"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Smooth Edge Fade Gradients */}
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white via-white/80 to-transparent z-20 transition-opacity" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white via-white/80 to-transparent z-20 transition-opacity" />
        )}

        <div
          ref={tableContainerRef}
          onScroll={checkScroll}
          tabIndex={0}
          role="region"
          aria-labelledby="hq-dispatch-table-caption"
          className="hq-responsive-table-wrapper w-full overflow-x-auto"
        >
          <table className="w-full table-fixed text-left select-none min-w-[760px]">
            <caption id="hq-dispatch-table-caption" className="sr-only">
              예약 접수 및 기사 배차 확인 현황 목록
            </caption>
            <colgroup><col className="w-[14%] min-w-[95px]" /><col className="w-[11%] min-w-[75px]" /><col className="w-[8%] min-w-[65px]" /><col className="w-[9%] min-w-[70px]" /><col className="w-[11%] min-w-[80px]" /><col className="w-[16%] min-w-[100px]" /><col className="w-[17%] min-w-[110px]" /><col className="w-[4%] min-w-[45px]" /><col className="w-[5%] min-w-[55px]" /><col className="w-[5%] min-w-[55px]" /></colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 bg-slate-50">
                <th scope="col" className="py-2.5 px-2 bg-slate-50">고객사</th>
                <th scope="col" className="py-2.5 px-2 bg-slate-50">승객</th>
                <th scope="col" className="py-2.5 px-2 bg-slate-50">출발 일시</th>
                <th scope="col" className="py-2.5 px-2 bg-slate-50">담당 기사님</th>
                <th scope="col" className="py-2.5 px-2 bg-slate-50">배정 차량</th>
                <th scope="col" className="py-2.5 px-2 bg-slate-50">출발지</th>
                <th scope="col" className="py-2.5 px-2 bg-slate-50">도착지</th>
                <th scope="col" className="py-2.5 px-1 bg-slate-50 text-center">배차</th>
                <th scope="col" className="py-2.5 px-1 bg-slate-50 text-center">기사 확인</th>
                <th scope="col" className="py-2.5 px-1 bg-slate-50 text-center">고객 안내</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 text-xs">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                    <p>현재 조건에 해당하는 예약/배차 내역이 없습니다.</p>
                    {activeTab !== 'past' && tabCounts.past > 0 && (
                      <p className="mt-2 text-xs text-slate-400">
                        출발 일시가 지난 일정은{' '}
                        <button
                          type="button"
                          onClick={() => onSelectTab('past')}
                          className="font-bold text-[#1E60F3] hover:underline cursor-pointer"
                        >
                          지난 일정 ({tabCounts.past}건)
                        </button>
                        에서 확인할 수 있어요.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredList.map((b) => {
                  const isAssigned = b.dispatchStatus === '배차 완료' || b.dispatchStatus === '운행 완료';
                  const isUnassigned = b.dispatchStatus === '미배정';
                  const isDraft = b.dispatchStatus === '작성 중';
                  const isReconfirm = b.dispatchStatus === '재확인 필요';
                  const isCancelled = b.dispatchStatus === '취소';

                  return (
                    <tr
                      key={b.id}
                      onClick={() => onViewBooking(b)}
                      className={`transition-colors group cursor-pointer ${
                        isCancelled
                          ? 'opacity-60 bg-slate-50/40 hover:bg-slate-50'
                          : b.hasConflict
                          ? 'bg-slate-100/60 hover:bg-slate-100'
                          : isUnassigned
                          ? 'bg-blue-50/25 hover:bg-blue-50/50'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Col 1 (Row Header <th>): 고객사 · 그룹 · 접수채널 */}
                      <th scope="row" className="py-3 px-2 text-left font-bold text-slate-900 align-middle">
                        <div className="flex items-center justify-between sm:justify-start gap-1 flex-wrap">
                          <span className="group-hover:text-[#1E60F3] transition-colors font-black truncate max-w-[110px]" title={b.customerName}>
                            {b.customerName}
                          </span>

                          {b.intakeSource === 'phone' && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70 shrink-0" title="전화 접수">
                              <PhoneCall className="w-2.5 h-2.5" />
                              전화
                            </span>
                          )}
                          {b.intakeSource === 'email' && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shrink-0" title="메일 접수">
                              <Mail className="w-2.5 h-2.5" />
                              메일
                            </span>
                          )}

                          {b.groupTotalVehicles && b.groupTotalVehicles > 1 && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200 shrink-0" title={`복수 차량: ${b.groupVehicleIndex || 1}호차 / 총 ${b.groupTotalVehicles}대`}>
                              <Users className="w-2.5 h-2.5" />
                              {b.groupVehicleIndex || 1}호차
                            </span>
                          )}

                          {b.version && b.version > 1 && (
                            <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1 py-0.2 rounded border border-purple-200 shrink-0" title={`수정 버전: v${b.version}`}>
                              v{b.version}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Col 2: 승객 */}
                      <td className="py-3 px-2 text-slate-700 align-middle font-medium truncate" title={b.passengerName || '미지정'}>
                        <div className="truncate font-bold text-slate-900 text-xs">
                          {b.passengerName || '-'}
                        </div>
                        {b.passengerCount && b.passengerCount > 1 ? (
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                            총 {b.passengerCount}명
                          </div>
                        ) : b.passengerPhone ? (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {b.passengerPhone}
                          </div>
                        ) : null}
                      </td>

                      {/* Col 3: 출발 일시 */}
                      <td className="py-3 px-2 whitespace-nowrap">
                        <div className="font-black text-slate-900">{b.pickupTime || '-'}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{b.pickupDate}</div>
                      </td>

                      {/* Col 4: 담당 기사님 */}
                      <td className="py-3 px-2 whitespace-nowrap">
                        {isUnassigned || b.driverName === '-' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[#1E60F3] font-black text-[11px]">
                            기사님 지정
                          </span>
                        ) : (
                          <span className="font-bold text-slate-800">{b.driverName}</span>
                        )}
                      </td>

                      {/* Col 5: 배정 차량 */}
                      <td className="py-3 px-2 whitespace-nowrap">
                        {b.vehicleModel === '-' && (!b.vehiclePlate || b.vehiclePlate === '미배정') ? (
                          <span className="text-slate-400 font-medium text-[11px]">차량 미선정</span>
                        ) : (
                          <div>
                            <div className="font-bold text-slate-900 text-xs tracking-tight">
                              {b.vehiclePlate && b.vehiclePlate !== '미배정' ? b.vehiclePlate : '-'}
                            </div>
                            <div
                              className="text-[11px] text-slate-500 font-medium truncate max-w-[130px]"
                              title={b.vehicleModel}
                            >
                              {stripManufacturerName(b.vehicleModel)}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Col 6: 출발지 */}
                      <td className="py-3 px-2 text-slate-700 font-medium truncate" title={b.pickupLocation}>
                        <span className="truncate block" title={b.pickupLocation}>
                          {truncateLocation(b.pickupLocation, 12)}
                        </span>
                      </td>

                      {/* Col 7: 도착지 */}
                      <td className="py-3 px-2 text-slate-700 font-medium truncate" title={`${b.destination}${b.flightNumber ? ` (${b.flightNumber})` : ''}`}>
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate" title={b.destination}>
                            {truncateLocation(b.destination, b.flightNumber ? 10 : 13)}
                          </span>
                          {b.flightNumber && (
                            <span className="shrink-0 text-[10px] font-mono font-bold text-[#1E60F3]">
                              ({b.flightNumber})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Col 8: 배차 */}
                      <td className="py-3 px-1 text-center whitespace-nowrap align-middle">
                        <div className="flex items-center justify-center gap-1">
                          {isAssigned ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-[#1E60F3] shadow-xs"
                              title={`배차 완료${b.version && b.version > 1 ? ` (v${b.version})` : ''}`}
                            />
                          ) : isUnassigned ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-amber-400"
                              title="미배정 (기사님 지정 필요)"
                            />
                          ) : isDraft ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-slate-400"
                              title="작성 중"
                            />
                          ) : isReconfirm ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-pulse"
                              title={`재확인 필요 (v${b.version || 2})`}
                            />
                          ) : isCancelled ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-slate-300"
                              title="배차 취소"
                            />
                          ) : (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-[#1E60F3]"
                              title={b.dispatchStatus}
                            />
                          )}

                          {b.hasConflict && (
                            <span title={(b.conflictMessages || []).join('\n')} className="inline-flex items-center">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Col 9: 기사 확인 */}
                      <td className="py-3 px-1 text-center whitespace-nowrap align-middle">
                        <div className="flex items-center justify-center">
                          {b.driverAck === '확인완료' ? (
                            <div
                              className="w-8 h-8 rounded-xl bg-blue-50/90 text-[#1E60F3] border border-blue-100/80 flex items-center justify-center shadow-2xs"
                              title={`기사님 확인 완료${b.driverAckTime ? ` (${b.driverAckTime})` : ''}`}
                            >
                              <Check className="w-4 h-4 stroke-[2.8]" />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleClockClick(e, b)}
                              className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200/90 text-slate-500 hover:bg-blue-50 hover:text-[#1E60F3] hover:border-blue-200 active:scale-95 flex items-center justify-center shadow-2xs transition-all cursor-pointer group/clock"
                              title={
                                onRemindDriver
                                  ? `확인 대기 · 클릭하면 기사님께 다시 알림을 전송해요${
                                      (b.reminderCount || 0) > 0 ? ` (재알림 ${b.reminderCount}회)` : ''
                                    }`
                                  : '확인 대기'
                              }
                              aria-label="기사님께 다시 알리기"
                            >
                              {remindingId === b.id ? (
                                <Clock className="w-4 h-4 animate-spin text-[#1E60F3]" />
                              ) : (
                                <Clock className="w-4 h-4 text-slate-500 group-hover/clock:text-[#1E60F3] transition-colors" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Col 10: 고객 안내 */}
                      <td className="py-3 px-1 text-center whitespace-nowrap align-middle">
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              haptics.lightTap();
                              onOpenCustomerMessage?.(b);
                            }}
                            className={`w-8 h-8 rounded-xl bg-blue-50/90 border border-blue-100/80 text-[#1E60F3] hover:bg-blue-100 active:scale-95 flex items-center justify-center shadow-2xs transition-all cursor-pointer relative ${
                              isCancelled ? 'opacity-40 pointer-events-none' : ''
                            }`}
                            title={
                              b.pendingCustomerTrigger
                                ? '고객 안내 준비됨 (클릭하여 문자 발송)'
                                : '고객 안내문자 보내기'
                            }
                            aria-label="고객 안내문자 보내기"
                          >
                            <Send className="w-4 h-4 text-[#1E60F3]" />
                            {b.pendingCustomerTrigger && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
};
