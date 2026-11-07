'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Calendar,
  LayoutList,
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
  ChevronDown,
  History,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { HqMobileBookingList } from './HqMobileBookingList';
import { HqDispatchCalendar } from './HqDispatchCalendar';
import { getCustomerDotColor } from '@/utils/customerDotColor';
import { getDriverProfileImage } from './HqQuickDispatch';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';
import { VIP_REAL_VEHICLES, VipRealVehicle, stripManufacturerName } from '@/utils/vehicleData';
import { isBookingInPast, cleanVehicleIdentity } from '@/utils/dispatchConflictDetector';
import { useHqDrivers } from '@/utils/useHqDrivers';
import {
  fetchHqCustomersFromDb,
  getStoredCustomers,
  CRM_CUSTOMERS_UPDATE_EVENT,
} from '@/utils/crmCustomerSync';
import { HqCustomer } from '@/types/customerHq';

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
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'status' | 'driver' | 'vehicle' | 'customer' | null>(null);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const filterRowRef = useRef<HTMLDivElement>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [dispatchIconError, setDispatchIconError] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>(() =>
    activeTab === 'all' ? 'calendar' : 'list'
  );
  useEffect(() => {
    // External KPI/deep-link filters must keep their actionable list semantics.
    if (activeTab !== 'all') setViewMode('list');
  }, [activeTab]);
  const selectOperationalTab = (tab: HqDispatchTabKey) => {
    onSelectTab(tab);
    setViewMode(tab === 'all' ? 'calendar' : 'list');
  };

  const hasActiveFilter =
    statusFilter !== 'all' ||
    driverFilter !== 'all' ||
    vehicleFilter !== 'all' ||
    customerFilter !== 'all';

  const toggleDropdown = (key: 'status' | 'driver' | 'vehicle' | 'customer') => {
    haptics.lightTap();
    setDropdownSearch('');
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterRowRef.current && !filterRowRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setDropdownSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 1. Live DB Drivers (synchronized 1:1 with 기사 관리 via useHqDrivers)
  const { drivers: hqDrivers } = useHqDrivers();

  // 2. Live DB Customers (synchronized 1:1 with 고객 관리 via /api/hq/customers)
  const [dbCustomers, setDbCustomers] = useState<HqCustomer[]>(() => getStoredCustomers());

  useEffect(() => {
    let mounted = true;
    fetchHqCustomersFromDb()
      .then((res) => {
        if (mounted && res.ok) {
          setDbCustomers(res.customers);
        }
      })
      .catch(() => { });

    const handleCustomersUpdate = () => {
      if (mounted) {
        setDbCustomers(getStoredCustomers());
      }
    };
    window.addEventListener(CRM_CUSTOMERS_UPDATE_EVENT, handleCustomersUpdate);
    return () => {
      mounted = false;
      window.removeEventListener(CRM_CUSTOMERS_UPDATE_EVENT, handleCustomersUpdate);
    };
  }, []);

  // 3. Live Fleet Vehicles (synchronized with 차량 관리 custom & deleted vehicles)
  const [customVehicles, setCustomVehicles] = useState<VipRealVehicle[]>([]);
  const [deletedVehicleIds, setDeletedVehicleIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const storedCustom = localStorage.getItem('vip_hq_custom_vehicles');
      if (storedCustom) {
        const parsed = JSON.parse(storedCustom);
        if (Array.isArray(parsed)) setCustomVehicles(parsed);
      }
      const storedDeleted = localStorage.getItem('vip_hq_deleted_vehicle_ids');
      if (storedDeleted) {
        const parsedDeleted = JSON.parse(storedDeleted);
        if (Array.isArray(parsedDeleted)) setDeletedVehicleIds(parsedDeleted);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const vehicleOptions = useMemo(() => {
    const customPlates = new Set(customVehicles.map((v) => v.plate.trim().replace(/\s+/g, '')));
    const activeDeletedSet = new Set(
      deletedVehicleIds
        .map((id) => String(id).trim().replace(/\s+/g, ''))
        .filter((cleanId) => !customPlates.has(cleanId))
    );
    const isNotDeleted = (v: VipRealVehicle) => {
      const cleanPlate = v.plate.trim().replace(/\s+/g, '');
      const cleanId = v.id.trim().replace(/\s+/g, '');
      return !activeDeletedSet.has(cleanPlate) && !activeDeletedSet.has(cleanId);
    };
    const validCustom = customVehicles.filter(isNotDeleted);
    const validDefault = VIP_REAL_VEHICLES.filter(
      (v) => isNotDeleted(v) && !customPlates.has(v.plate.trim().replace(/\s+/g, ''))
    );
    return [...validCustom, ...validDefault];
  }, [customVehicles, deletedVehicleIds]);

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
    const names = new Set<string>();
    if (hqDrivers.length > 0) {
      // 기사 관리 탭(cockpit.drivers)과 1:1로 동일하게 동기화
      hqDrivers.forEach((d) => {
        const cleanName = (d.name || '').replace(/\s*기사$/, '').trim();
        if (cleanName && cleanName !== '-' && cleanName !== '미배정') {
          names.add(cleanName);
        }
      });
      return Array.from(names);
    }
    sourceForCounts.forEach((b) => {
      if (b.driverName && b.driverName !== '-' && b.driverName !== '미배정') {
        names.add(b.driverName.replace(/\s*기사$/, '').trim());
      }
    });
    return Array.from(names);
  }, [hqDrivers, sourceForCounts]);

  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    dbCustomers.forEach((c) => {
      if (c.name && c.name.trim()) {
        names.add(c.name.trim());
      }
    });
    if (dbCustomers.length === 0) {
      sourceForCounts.forEach((b) => {
        if (b.customerName && b.customerName.trim() && b.customerName !== '-') {
          names.add(b.customerName.trim());
        }
      });
    }
    return Array.from(names);
  }, [dbCustomers, sourceForCounts]);

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: '전체 상태', dotClass: 'bg-slate-400' },
      { value: '미배정', label: '미배정 (배차대기)', dotClass: 'bg-amber-500' },
      { value: 'unacked', label: '확인 대기 / 재확인', dotClass: 'bg-orange-500' },
      { value: '재확인 필요', label: '변경 재확인 필요', dotClass: 'bg-rose-500' },
      { value: 'conflict', label: '일정 충돌 경고', dotClass: 'bg-red-600' },
      { value: '배차 완료', label: '배차 완료', dotClass: 'bg-[#1E60F3]' },
      { value: '작성 중', label: '임시 초안', dotClass: 'bg-slate-400' },
      { value: '취소', label: '취소됨', dotClass: 'bg-slate-300' },
    ],
    []
  );

  const selectedStatusLabel = useMemo(() => {
    return statusOptions.find((o) => o.value === statusFilter)?.label || '전체 상태';
  }, [statusOptions, statusFilter]);

  const selectedVehicleLabel = useMemo(() => {
    if (vehicleFilter === 'all') return '전체 차량';
    const found = vehicleOptions.find((v) => v.plate === vehicleFilter);
    return found ? `${found.plate} · ${found.modelShort}` : vehicleFilter;
  }, [vehicleOptions, vehicleFilter]);

  const selectedDriverObj = useMemo(() => {
    if (driverFilter === 'all') return null;
    return (
      hqDrivers.find((d) => (d.name || '').replace(/\s*기사$/, '').trim() === driverFilter) || null
    );
  }, [hqDrivers, driverFilter]);

  const filteredStatusOptions = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();
    if (!q) return statusOptions;
    return statusOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [statusOptions, dropdownSearch]);

  const filteredDriverOptions = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();
    if (!q) return driverOptions;
    return driverOptions.filter((name) => {
      const drvObj = hqDrivers.find(
        (d) => (d.name || '').replace(/\s*기사$/, '').trim() === name
      );
      const phone = (drvObj?.phone || '').toLowerCase();
      return name.toLowerCase().includes(q) || phone.includes(q);
    });
  }, [driverOptions, hqDrivers, dropdownSearch]);

  const filteredVehicleOptions = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();
    if (!q) return vehicleOptions;
    return vehicleOptions.filter(
      (v) =>
        v.plate.toLowerCase().includes(q) ||
        v.modelShort.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q)
    );
  }, [vehicleOptions, dropdownSearch]);

  const filteredCustomerOptions = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();
    if (!q) return customerOptions;
    return customerOptions.filter((c) => c.toLowerCase().includes(q));
  }, [customerOptions, dropdownSearch]);

  const handleResetFilters = () => {
    haptics.lightTap();
    setSearchQuery('');
    setStatusFilter('all');
    setDriverFilter('all');
    setVehicleFilter('all');
    setCustomerFilter('all');
    setOpenDropdown(null);
    setDropdownSearch('');
  };

  // Shared search and modal filters apply to the calendar and the legacy list.
  // Calendar includes past records for any selected month, unlike the operational all-list.
  const matchesSharedFilters = useCallback((b: HqBooking) => {
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLocaleLowerCase();
      const fields = [
        b.customerName, b.bookingNo, b.pickupLocation, b.destination,
        b.driverName, b.passengerName, b.vehicleModel, b.vehiclePlate,
        ...(b.routeWaypoints || []).map((point) => point.location),
      ];
      if (!fields.some((field) => (field || '').toLocaleLowerCase().includes(query))) return false;
    }
    if (statusFilter === 'conflict') {
      if (!b.hasConflict) return false;
    } else if (statusFilter === 'unacked') {
      if (b.driverAck !== '미확인' && b.driverAck !== '재확인 필요') return false;
    } else if (statusFilter !== 'all' && b.dispatchStatus !== statusFilter) return false;
    if (driverFilter !== 'all' && b.driverName.replace(/\\s*기사$/, '').trim() !== driverFilter) return false;
    if (vehicleFilter !== 'all') {
      const target = cleanVehicleIdentity(vehicleFilter);
      const plate = cleanVehicleIdentity(b.vehiclePlate);
      const model = cleanVehicleIdentity(b.vehicleModel);
      if (!(b.vehiclePlate === vehicleFilter || b.vehicleModel === vehicleFilter ||
        b.vehicleModel.includes(vehicleFilter) || (target && (plate === target || model.includes(target))))) return false;
    }
    return customerFilter === 'all' || b.customerName === customerFilter;
  }, [searchQuery, statusFilter, driverFilter, vehicleFilter, customerFilter]);
  const calendarFilteredList = useMemo(() => bookings.filter(matchesSharedFilters), [bookings, matchesSharedFilters]);
  const filteredList = useMemo(() => calendarFilteredList.filter((b) => {
    const past = isBookingInPast(b);
    if (activeTab === 'past') return past;
    if (past) return false;
    if (activeTab === 'today') return Boolean(b.isToday);
    if (activeTab === 'tomorrow') return Boolean(b.isTomorrow);
    if (activeTab === 'action') {
      return b.dispatchStatus !== '취소' && (
        ['미배정', '작성 중', '재확인 필요'].includes(b.dispatchStatus) ||
        b.driverAck === '미확인' || b.driverAck === '재확인 필요' || Boolean(b.hasConflict)
      );
    }
    return true;
  }), [calendarFilteredList, activeTab]);

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
  }, [checkScroll, filteredList, viewMode]);

  const scrollTable = (direction: 'left' | 'right') => {
    haptics.lightTap();
    if (!tableContainerRef.current) return;
    const offset = direction === 'left' ? -340 : 340;
    tableContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(checkScroll, 320);
  };

  return (
    <div className="w-full min-h-[640px] bg-white rounded-[26px] p-4 sm:p-6 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] flex flex-col justify-start">
      {/* 1. Header */}
      <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* 배차 관리 목록 아이콘 & 마우스 호버 툴팁 */}
          <div className="relative group/dispatch inline-flex items-center justify-center cursor-pointer shrink-0">
            {!dispatchIconError ? (
              <img
                src="/images/icons/reservations/icon_reservations.png"
                alt="배차 관리 목록"
                onError={() => setDispatchIconError(true)}
                className="w-12 h-12 sm:w-12 sm:h-12 object-contain shrink-0 transition-transform duration-150 group-hover/dispatch:scale-110"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#1E60F3] flex items-center justify-center shrink-0 transition-transform duration-150 group-hover/dispatch:scale-110 shadow-2xs">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            )}

            {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 (최상단 레이어) */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/dispatch:flex flex-col items-start pointer-events-none z-[100]">
              <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                실시간 예약 접수와 기사님 배정 일정을 관리해요
              </span>
              <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 ml-3.5 shadow-xs" />
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-base sm:text-base font-black text-slate-900 tracking-tight truncate">
              배차 관리
            </h2>
            <p className="hidden sm:block text-[11px] text-slate-400 font-medium truncate">
              예약을 누르면 기사님 배정과 고객 안내를 바로 처리할 수 있어요.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setOpenDropdown(null);
            setDropdownSearch('');
            onOpenNewBooking();
          }}
          aria-label="예약 추가"
          className="w-9 h-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs shrink-0 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-5 h-5 sm:hidden stroke-[2.5]" />
          <span className="hidden sm:inline">+ 예약 추가</span>
        </button>
      </div>

      {/* 2. Operational Tabs (Horizontal Scroll Chip Rail on Mobile / Split End on Desktop) */}
      <div
        className="pt-3.5 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 flex items-center flex-nowrap gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* 1) 전체 예정 (기본 Active 탭, 맨 좌측 배치) */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('all');
          }}
          className={`rounded-full px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${activeTab === 'all'
            ? 'bg-[#0050FF] text-white font-bold shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium'
            }`}
          title="오늘 및 향후 모든 배차 일정"
        >
          <span>{viewMode === 'calendar' ? '전체 일정' : '전체 예정'}</span>
        </button>

        {/* 2) 오늘 출발 */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('today');
          }}
          className={`rounded-full px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${activeTab === 'today'
            ? 'bg-[#0050FF] text-white font-bold shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium'
            }`}
        >
          <span>오늘 출발</span>
        </button>

        {/* 3) 내일 출발 */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('tomorrow');
          }}
          className={`rounded-full px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${activeTab === 'tomorrow'
            ? 'bg-[#0050FF] text-white font-bold shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium'
            }`}
        >
          <span>내일 출발</span>
        </button>

        {/* 4) 확인 필요 */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('action');
          }}
          className={`rounded-full px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${activeTab === 'action'
            ? 'bg-[#0050FF] text-white font-bold shadow-sm'
            : tabCounts.action > 0
              ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100/70 font-semibold'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium'
            }`}
        >
          <span>확인 필요</span>
        </button>

        {/* 5) 지난 일정 (모바일에서는 5번째 인라인 스크롤 칩, 데스크톱 md 이상에서는 우측 끝 정렬) */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectTab('past');
          }}
          className={`md:ml-auto rounded-full px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${activeTab === 'past'
            ? 'bg-[#0050FF] text-white font-bold shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium'
            }`}
          title="출발 일시가 오늘 이전인 과거 배차 기록 (정산용 데이터 보존)"
        >
          <History className="w-3.5 h-3.5 shrink-0" />
          <span>지난 일정</span>
        </button>
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

      {/* 3. Search Bar (White Background) + Filter Icon Button */}
      <div className="pt-3 pb-2 flex items-center gap-2 text-xs">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="고객사, 승객, 목적지 검색"
            className="h-12 w-full rounded-[16px] border border-[#E1E7F0]/25 bg-white pl-10 pr-4 text-[14px] font-medium text-[#17233B] placeholder:text-[#95A3B9] shadow-[0_5px_16px_rgba(35,49,78,0.045),0_2px_5px_rgba(35,49,78,0.02)] outline-none transition-shadow hover:shadow-[0_6px_18px_rgba(35,49,78,0.06)] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setOpenDropdown(null);
            setDropdownSearch('');
            setIsFilterModalOpen(true);
          }}
          aria-label="배차 필터 열기"
          title="배차 필터"
          className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-2xs relative ${hasActiveFilter
            ? 'bg-[#EBF3FF]/80 border-[#1E60F3]/40 text-[#1E60F3]'
            : 'bg-white border-slate-200/90 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {hasActiveFilter && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#1E60F3] ring-2 ring-white" />
          )}
        </button>
      </div>

      {/* Filter Modal (Opens when clicking the SlidersHorizontal filter icon button) */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            setIsFilterModalOpen(false);
            setOpenDropdown(null);
            setDropdownSearch('');
          }}
        >
          <div
            ref={filterRowRef}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-w-md p-5 space-y-4 animate-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <img
                  src="/images/icons/reservations/icon_reservations.png"
                  alt="배차 조건 필터"
                  className="w-9 h-9 object-contain shrink-0 select-none"
                  draggable={false}
                />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">배차 조건 필터</h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    상태, 기사, 차량, 고객사별로 일정을 빠르게 좁혀보세요
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsFilterModalOpen(false);
                  setOpenDropdown(null);
                  setDropdownSearch('');
                }}
                className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="필터 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 4 Filter Selectors inside Modal */}
            <div className="space-y-3 text-xs">
              {/* 3-1. 전체 상태 드롭다운 */}
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">배차 상태</label>
                <button
                  type="button"
                  onClick={() => toggleDropdown('status')}
                  className={`w-full px-3.5 py-2.5 rounded-xl border font-bold flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs ${statusFilter !== 'all' || openDropdown === 'status'
                    ? 'bg-[#EBF3FF]/60 border-[#1E60F3]/40 text-[#1E60F3]'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 text-slate-700'
                    }`}
                >
                  <span className="truncate">{selectedStatusLabel}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${openDropdown === 'status' ? 'rotate-180 text-[#1E60F3]' : 'text-slate-400'
                      }`}
                  />
                </button>

                {openDropdown === 'status' && (
                  <div className="mt-1.5 w-full bg-white rounded-2xl border border-slate-200/90 shadow-lg p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                    <div className="pb-2 mb-1 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={dropdownSearch}
                          onChange={(e) => setDropdownSearch(e.target.value)}
                          placeholder="상태 검색..."
                          autoFocus
                          className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3]"
                        />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1">
                      {filteredStatusOptions.length === 0 ? (
                        <div className="py-4 text-center text-xs font-medium text-slate-400">
                          검색 결과가 없습니다
                        </div>
                      ) : (
                        filteredStatusOptions.map((opt) => {
                          const isSelected = statusFilter === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                haptics.lightTap();
                                setStatusFilter(opt.value);
                                setOpenDropdown(null);
                                setDropdownSearch('');
                              }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${isSelected
                                ? 'bg-[#EBF3FF] text-[#1E60F3] border border-blue-200/70 shadow-2xs'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border border-transparent'
                                }`}
                            >
                              <span className="flex items-center gap-2 truncate">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotClass}`} />
                                <span className="truncate">{opt.label}</span>
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3-2. 전체 기사 드롭다운 (기사 관리 DB 1:1 연동 + 검색 + 프로필 사진) */}
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">담당 기사</label>
                <button
                  type="button"
                  onClick={() => toggleDropdown('driver')}
                  className={`w-full px-3.5 py-2.5 rounded-xl border font-bold flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs ${driverFilter !== 'all' || openDropdown === 'driver'
                    ? 'bg-[#EBF3FF]/60 border-[#1E60F3]/40 text-[#1E60F3]'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 text-slate-700'
                    }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {driverFilter !== 'all' && (
                      <img
                        src={
                          selectedDriverObj?.avatarUrl ||
                          getDriverProfileImage(selectedDriverObj || { name: driverFilter })
                        }
                        alt={driverFilter}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/images/driver_kim.png';
                        }}
                        className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    )}
                    <span className="truncate">
                      {driverFilter === 'all' ? '전체 기사' : `${driverFilter} 기사`}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${openDropdown === 'driver' ? 'rotate-180 text-[#1E60F3]' : 'text-slate-400'
                      }`}
                  />
                </button>

                {openDropdown === 'driver' && (
                  <div className="mt-1.5 w-full bg-white rounded-2xl border border-slate-200/90 shadow-lg p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                    <div className="pb-2 mb-1 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={dropdownSearch}
                          onChange={(e) => setDropdownSearch(e.target.value)}
                          placeholder="기사명 또는 연락처 검색..."
                          autoFocus
                          className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3]"
                        />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[210px] overflow-y-auto space-y-1">
                      {!dropdownSearch.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            haptics.lightTap();
                            setDriverFilter('all');
                            setOpenDropdown(null);
                            setDropdownSearch('');
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${driverFilter === 'all'
                            ? 'bg-[#EBF3FF] text-[#1E60F3] border border-blue-200/70 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border border-transparent'
                            }`}
                        >
                          <span>전체 기사</span>
                          {driverFilter === 'all' && (
                            <Check className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                          )}
                        </button>
                      )}
                      {filteredDriverOptions.length === 0 ? (
                        <div className="py-4 text-center text-xs font-medium text-slate-400">
                          일치하는 기사님이 없습니다
                        </div>
                      ) : (
                        filteredDriverOptions.map((name) => {
                          const isSelected = driverFilter === name;
                          const drvObj = hqDrivers.find(
                            (d) => (d.name || '').replace(/\s*기사$/, '').trim() === name
                          );
                          const isEmployed = drvObj ? drvObj.affiliationType === 'employed' : true;
                          const avatarSrc =
                            drvObj?.avatarUrl || getDriverProfileImage(drvObj || { name });
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => {
                                haptics.lightTap();
                                setDriverFilter(name);
                                setOpenDropdown(null);
                                setDropdownSearch('');
                              }}
                              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${isSelected
                                ? 'bg-[#EBF3FF] text-[#1E60F3] border border-blue-200/70 shadow-2xs'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border border-transparent'
                                }`}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <img
                                  src={avatarSrc}
                                  alt={name}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src =
                                      '/images/driver_kim.png';
                                  }}
                                  className="w-6 h-6 rounded-full object-cover border border-slate-200/90 bg-slate-100 shrink-0 shadow-2xs"
                                />
                                <span className="truncate font-extrabold text-slate-900">
                                  {name} 기사
                                </span>
                                {drvObj && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shrink-0 ${isEmployed
                                      ? 'bg-blue-50 text-[#1E60F3]'
                                      : 'bg-slate-100 text-slate-500'
                                      }`}
                                  >
                                    {isEmployed ? '소속' : '프리랜서'}
                                  </span>
                                )}
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3-3. 전체 차량 드롭다운 (차량 관리 1:1 연동 + 검색) */}
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">배정 차량</label>
                <button
                  type="button"
                  onClick={() => toggleDropdown('vehicle')}
                  className={`w-full px-3.5 py-2.5 rounded-xl border font-bold flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs ${vehicleFilter !== 'all' || openDropdown === 'vehicle'
                    ? 'bg-[#EBF3FF]/60 border-[#1E60F3]/40 text-[#1E60F3]'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 text-slate-700'
                    }`}
                >
                  <span className="truncate">{selectedVehicleLabel}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${openDropdown === 'vehicle' ? 'rotate-180 text-[#1E60F3]' : 'text-slate-400'
                      }`}
                  />
                </button>

                {openDropdown === 'vehicle' && (
                  <div className="mt-1.5 w-full bg-white rounded-2xl border border-slate-200/90 shadow-lg p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                    <div className="pb-2 mb-1 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={dropdownSearch}
                          onChange={(e) => setDropdownSearch(e.target.value)}
                          placeholder="차량번호 또는 차종 검색..."
                          autoFocus
                          className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3]"
                        />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[210px] overflow-y-auto space-y-1">
                      {!dropdownSearch.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            haptics.lightTap();
                            setVehicleFilter('all');
                            setOpenDropdown(null);
                            setDropdownSearch('');
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${vehicleFilter === 'all'
                            ? 'bg-[#EBF3FF] text-[#1E60F3] border border-blue-200/70 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border border-transparent'
                            }`}
                        >
                          <span>전체 차량</span>
                          {vehicleFilter === 'all' && (
                            <Check className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                          )}
                        </button>
                      )}
                      {filteredVehicleOptions.length === 0 ? (
                        <div className="py-4 text-center text-xs font-medium text-slate-400">
                          일치하는 차량이 없습니다
                        </div>
                      ) : (
                        filteredVehicleOptions.map((v) => {
                          const isSelected = vehicleFilter === v.plate;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                haptics.lightTap();
                                setVehicleFilter(v.plate);
                                setOpenDropdown(null);
                                setDropdownSearch('');
                              }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${isSelected
                                ? 'bg-[#EBF3FF] text-[#1E60F3] border border-blue-200/70 shadow-2xs'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border border-transparent'
                                }`}
                            >
                              <span className="flex flex-col min-w-0">
                                <span className="truncate font-extrabold text-slate-900">
                                  {v.plate}
                                </span>
                                <span className="truncate text-[11px] font-medium text-slate-500">
                                  {v.modelShort}
                                </span>
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3-4. 전체 고객사 드롭다운 (고객 관리 DB 1:1 연동 + 검색) */}
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">고객사</label>
                <button
                  type="button"
                  onClick={() => toggleDropdown('customer')}
                  className={`w-full px-3.5 py-2.5 rounded-xl border font-bold flex items-center justify-between gap-2 transition-all cursor-pointer shadow-2xs ${customerFilter !== 'all' || openDropdown === 'customer'
                    ? 'bg-[#EBF3FF]/60 border-[#1E60F3]/40 text-[#1E60F3]'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 text-slate-700'
                    }`}
                >
                  <span className="truncate">
                    {customerFilter === 'all' ? '전체 고객사' : customerFilter}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${openDropdown === 'customer' ? 'rotate-180 text-[#1E60F3]' : 'text-slate-400'
                      }`}
                  />
                </button>

                {openDropdown === 'customer' && (
                  <div className="mt-1.5 w-full bg-white rounded-2xl border border-slate-200/90 shadow-lg p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                    <div className="pb-2 mb-1 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={dropdownSearch}
                          onChange={(e) => setDropdownSearch(e.target.value)}
                          placeholder="고객사명 검색..."
                          autoFocus
                          className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3]"
                        />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[210px] overflow-y-auto space-y-1">
                      {!dropdownSearch.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            haptics.lightTap();
                            setCustomerFilter('all');
                            setOpenDropdown(null);
                            setDropdownSearch('');
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${customerFilter === 'all'
                            ? 'bg-[#EBF3FF] text-[#1E60F3] border border-blue-200/70 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border border-transparent'
                            }`}
                        >
                          <span>전체 고객사</span>
                          {customerFilter === 'all' && (
                            <Check className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                          )}
                        </button>
                      )}
                      {filteredCustomerOptions.length === 0 ? (
                        <div className="py-4 text-center text-xs font-medium text-slate-400">
                          일치하는 고객사가 없습니다
                        </div>
                      ) : (
                        filteredCustomerOptions.map((c) => {
                          const isSelected = customerFilter === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                haptics.lightTap();
                                setCustomerFilter(c);
                                setOpenDropdown(null);
                                setDropdownSearch('');
                              }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${isSelected
                                ? 'bg-[#EBF3FF] text-[#1E60F3] border border-blue-200/70 shadow-2xs'
                                : 'bg-white hover:bg-slate-50 text-slate-700 border border-transparent'
                                }`}
                            >
                              <span className="truncate">{c}</span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer: Confirm Button Only (초기화 기능 제거) */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsFilterModalOpen(false);
                  setOpenDropdown(null);
                  setDropdownSearch('');
                }}
                className="w-full py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-[0.99] text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A-style live calendar is the default. Keep the old operational list as an option. */}
      <div className="mt-2 flex items-center justify-between gap-2 py-2">
        <span className="text-xs font-medium text-[#73839D]">
          {viewMode === 'calendar' ? '월간 배차 일정' : '예약·배차 목록'}
        </span>
        <div role="group" aria-label="배차 보기 방식" className="inline-flex gap-1 rounded-xl bg-[#F7F9FC] p-1">
          <button type="button" aria-pressed={viewMode === 'calendar'}
            onClick={() => { haptics.lightTap(); onSelectTab('all'); setViewMode('calendar'); }}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all ${viewMode === 'calendar' ? 'bg-white text-[#17233B] shadow-[0_2px_6px_rgba(35,49,78,0.08)]' : 'text-[#73839D] hover:text-[#17233B]'}`}>
            <Calendar className="h-3.5 w-3.5" strokeWidth={1.8} /> 달력
          </button>
          <button type="button" aria-pressed={viewMode === 'list'}
            onClick={() => { haptics.lightTap(); setViewMode('list'); }}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-white text-[#17233B] shadow-[0_2px_6px_rgba(35,49,78,0.08)]' : 'text-[#73839D] hover:text-[#17233B]'}`}>
            <LayoutList className="h-3.5 w-3.5" strokeWidth={1.8} /> 목록
          </button>
        </div>
      </div>
      {viewMode === 'calendar' ? (
        <HqDispatchCalendar bookings={calendarFilteredList} onViewBooking={onViewBooking} onOpenNewBooking={onOpenNewBooking} />
      ) : (
        <>
          <HqMobileBookingList bookings={filteredList} onView={onViewBooking} onAssign={onAssignDriver || onViewBooking} />
      <div className="hidden lg:flex lg:flex-1 lg:flex-col">
        {filteredList.length === 0 ? (
          <div className="flex-1 min-h-[420px] mt-2 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 p-6 text-center">
            <img
              src="/images/icons/reservations/icon_no_schedule.png"
              alt="일정 없음"
              className="w-14 h-14 object-contain select-none"
              draggable={false}
            />
            <p className="text-xs sm:text-sm font-semibold text-slate-500">
              선택한 조건의 일정이 없습니다.
            </p>
            {activeTab !== 'past' && tabCounts.past > 0 && (
              <p className="text-xs text-slate-400">
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
          </div>
        ) : (
        /* 5. Container-Query Semantic Data Table with Floating Centered Navigation Arrows */
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
                {filteredList.map((b) => {
                    const isAssigned = b.dispatchStatus === '배차 완료' || b.dispatchStatus === '운행 완료';
                    const isUnassigned = b.dispatchStatus === '미배정';
                    const isDraft = b.dispatchStatus === '작성 중';
                    const isReconfirm = b.dispatchStatus === '재확인 필요';
                    const isCancelled = b.dispatchStatus === '취소';

                    return (
                      <tr
                        key={b.id}
                        onClick={() => onViewBooking(b)}
                        className={`transition-colors group cursor-pointer ${isCancelled
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
                            <span className="inline-flex min-w-0 max-w-[140px] items-center gap-1.5" title={b.customerName}>
                              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: getCustomerDotColor(b.customerId, b.customerName) }} />
                              <span className="truncate font-semibold text-slate-900">{b.customerName}</span>
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
                          {b.routeWaypoints && b.routeWaypoints.length > 2 && (
                            <span
                              className="mt-1 inline-block max-w-full truncate rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                              title={b.routeWaypoints.slice(1, -1).map(p => `${p.time || '--:--'} ${p.location}`).join(' → ')}
                            >
                              중간 경유 {b.routeWaypoints.length - 2}곳 · 상세 보기
                            </span>
                          )}
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
                                    ? `확인 대기 · 클릭하면 기사님께 다시 알림을 전송해요${(b.reminderCount || 0) > 0 ? ` (재알림 ${b.reminderCount}회)` : ''
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
                              className={`w-8 h-8 rounded-xl bg-blue-50/90 border border-blue-100/80 text-[#1E60F3] hover:bg-blue-100 active:scale-95 flex items-center justify-center shadow-2xs transition-all cursor-pointer relative ${isCancelled ? 'opacity-40 pointer-events-none' : ''
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
                  })}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
        </>
      )}
    </div>
  );
};
