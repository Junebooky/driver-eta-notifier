'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Star,
  LayoutGrid,
  Users,
  Clock,
  Calendar,
  Heart,
  MessageSquare,
  AlertCircle,
  MapPin,
  Car,
  FileText,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { HqCustomer } from '@/types/customerHq';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import { CustomerBrandLogo } from './CustomerBrandLogo';
import { HqCustomerRegisterModal } from './HqCustomerRegisterModal';
import { HqCustomerEditModal } from './HqCustomerEditModal';
import { HqComposeEmailModal } from '@/components/hq/email/HqComposeEmailModal';
import { haptics } from '@/utils/haptics';

export interface HqCustomersViewProps {
  initialSearchQuery?: string;
  onOpenBookingModal?: (customerName: string) => void;
}

export const HqCustomersView: React.FC<HqCustomersViewProps> = ({
  initialSearchQuery = '',
}) => {
  // Customers State
  const [customers, setCustomers] = useState<HqCustomer[]>(INITIAL_HQ_CUSTOMERS);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    INITIAL_HQ_CUSTOMERS[0]?.id || ''
  );

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [tierFilter, setTierFilter] = useState<'all' | 'VIP' | '주요' | '일반' | 'favorite'>('all');

  // Pagination (8 per page, matching image "28개 중 1-8개")
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Active Detail Tab ('overview' | 'contacts' | 'history' | 'events' | 'requests' | 'communications')
  const [activeTab, setActiveTab] = useState<
    'overview' | 'contacts' | 'history' | 'events' | 'requests' | 'communications'
  >('overview');

  // Modals
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [editModalConfig, setEditModalConfig] = useState<{
    isOpen: boolean;
    mode: 'preferences' | 'notes';
  }>({ isOpen: false, mode: 'notes' });

  // Compose Email Modal integration
  const [composeModalState, setComposeModalState] = useState<{
    isOpen: boolean;
    to: string;
    subject: string;
  }>({
    isOpen: false,
    to: '',
    subject: '',
  });

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return (
      customers.find((c) => c.id === selectedCustomerId) ||
      customers[0] ||
      null
    );
  }, [customers, selectedCustomerId]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      // 1. Tier / Favorite filter
      if (tierFilter === 'favorite') {
        if (!cust.isFavorite) return false;
      } else if (tierFilter !== 'all') {
        if (cust.tier !== tierFilter) return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = cust.name.toLowerCase().includes(q);
        const matchesContact = cust.primaryContactName.toLowerCase().includes(q);
        const matchesSnippet = cust.recentSnippet.toLowerCase().includes(q);
        const matchesDepartment = cust.department.toLowerCase().includes(q);
        const matchesNextEvent = cust.nextEvent?.title.toLowerCase().includes(q);
        if (!matchesName && !matchesContact && !matchesSnippet && !matchesDepartment && !matchesNextEvent) {
          return false;
        }
      }

      return true;
    });
  }, [customers, tierFilter, searchQuery]);

  // Paginated customers
  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE) || 1;
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);

  // Toggle favorite status
  const handleToggleFavorite = (customerId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    haptics.selection();
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId ? { ...c, isFavorite: !c.isFavorite } : c
      )
    );
  };

  // Add new customer handler
  const handleRegisterCustomer = (newCustomer: HqCustomer) => {
    setCustomers((prev) => [newCustomer, ...prev]);
    setSelectedCustomerId(newCustomer.id);
    setCurrentPage(1);
    haptics.success();
  };

  // Update customer handler
  const handleUpdateCustomer = (updated: HqCustomer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  return (
    <div className="space-y-4">
      {/* Main 2-Column Workstation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: 고객사 목록 (Left 4.5 cols / ~38%)             */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden min-h-[760px]">
          {/* Header Bar */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                고객사 목록
              </h2>
              <span className="text-sm font-bold text-slate-500">
                ({filteredCustomers.length})
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setIsRegisterModalOpen(true);
              }}
              className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>고객 등록</span>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="고객명 또는 담당자명 검색..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Filter Dropdown */}
            <div className="relative">
              <select
                value={tierFilter}
                onChange={(e) => {
                  setTierFilter(e.target.value as 'all' | 'VIP' | '주요' | '일반' | 'favorite');
                  setCurrentPage(1);
                }}
                className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">전체</option>
                <option value="VIP">VIP</option>
                <option value="주요">주요 고객</option>
                <option value="일반">일반 고객</option>
                <option value="favorite">즐겨찾기 ⭐</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Customer Cards List */}
          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-[610px]">
            {paginatedCustomers.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">검색된 고객사가 없습니다.</p>
                <p className="text-[11px] text-slate-400 mt-1">검색어 또는 필터를 변경해보세요.</p>
              </div>
            ) : (
              paginatedCustomers.map((cust) => {
                const isSelected = cust.id === selectedCustomerId;

                return (
                  <div
                    key={cust.id}
                    onClick={() => {
                      haptics.lightTap();
                      setSelectedCustomerId(cust.id);
                    }}
                    className={`p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 group relative ${
                      isSelected
                        ? 'bg-blue-50/80 border-l-4 border-l-[#1E60F3]'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Left: Brand Logo + Company Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <CustomerBrandLogo
                        name={cust.name}
                        logoType={cust.logoType}
                        size="md"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-black text-slate-900 truncate">
                            {cust.name}
                          </h3>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-black shrink-0 ${
                              cust.tier === 'VIP'
                                ? 'bg-blue-100/80 text-[#1E60F3]'
                                : cust.tier === '주요'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {cust.tier}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                          {cust.primaryContactName}
                          {cust.contactCountExtra > 0 ? ` 외 ${cust.contactCountExtra}명` : ''}
                        </p>

                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {cust.recentSnippet}
                        </p>
                      </div>
                    </div>

                    {/* Right: Next Event Date & Favorite Star */}
                    <div className="flex items-center gap-2.5 shrink-0 text-right">
                      {cust.nextEventDate && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold">다음 행사</p>
                          <p className="text-xs font-bold text-[#1E60F3] mt-0.5">
                            {cust.nextEventDate}
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(cust.id, e)}
                        className="p-1 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                        title={cust.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                      >
                        <Star
                          className={`w-4 h-4 transition-colors ${
                            cust.isFavorite
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-300 hover:text-slate-400'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Pagination Bar (Matches image: < 1 2 3 4 5 ... > 28개 중 1-8개) */}
          <div className="p-3 border-t border-slate-100 bg-white flex items-center justify-between text-xs font-semibold text-slate-600">
            {/* Page numbers */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setCurrentPage((p) => Math.max(1, p - 1));
                }}
                disabled={currentPage === 1}
                className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-400 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setCurrentPage(pageNum);
                  }}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    currentPage === pageNum
                      ? 'bg-[#1E60F3] text-white shadow-xs'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}

              {totalPages > 5 && <span className="px-1 text-slate-400">...</span>}

              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                }}
                disabled={currentPage === totalPages}
                className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-400 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Total Range */}
            <span className="text-[11px] text-slate-400 font-medium">
              {filteredCustomers.length}개 중{' '}
              {filteredCustomers.length > 0
                ? `${(currentPage - 1) * ITEMS_PER_PAGE + 1}-${Math.min(
                    currentPage * ITEMS_PER_PAGE,
                    filteredCustomers.length
                  )}개`
                : '0개'}
            </span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: 상세 정보 워크스테이션 (Right 7 cols / ~62%)  */}
        {/* ========================================================= */}
        {selectedCustomer ? (
          <div className="lg:col-span-7 space-y-4">
            {/* Top Customer Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <CustomerBrandLogo
                    name={selectedCustomer.name}
                    logoType={selectedCustomer.logoType}
                    size="lg"
                  />

                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                        {selectedCustomer.name}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                          selectedCustomer.tier === 'VIP'
                            ? 'bg-blue-100 text-[#1E60F3]'
                            : selectedCustomer.tier === '주요'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {selectedCustomer.tier}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-2 flex-wrap">
                      <span>{selectedCustomer.primaryContactName}</span>
                      <span className="text-slate-300">•</span>
                      <span>{selectedCustomer.department}</span>
                      <span className="text-slate-300">•</span>
                      <span>{selectedCustomer.mainPhone}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-blue-600 font-medium">{selectedCustomer.mainEmail}</span>
                    </p>
                  </div>
                </div>

                {/* Star Favorite Button */}
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(selectedCustomer.id)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  title="즐겨찾기 토글"
                >
                  <Star
                    className={`w-5 h-5 ${
                      selectedCustomer.isFavorite
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              </div>

              {/* 6 Sub-Navigation Tabs with Active Blue Underline */}
              <div className="flex items-center gap-6 mt-6 border-b border-slate-100 text-xs font-bold text-slate-500 overflow-x-auto">
                {[
                  { id: 'overview', label: '개요', icon: LayoutGrid },
                  { id: 'contacts', label: '담당자', icon: Users },
                  { id: 'history', label: '예약 이력', icon: Clock },
                  { id: 'events', label: '행사', icon: Calendar },
                  { id: 'requests', label: '요청사항', icon: Heart },
                  { id: 'communications', label: '소통 기록', icon: MessageSquare },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setActiveTab(
                          tab.id as
                            | 'overview'
                            | 'contacts'
                            | 'history'
                            | 'events'
                            | 'requests'
                            | 'communications'
                        );
                      }}
                      className={`flex items-center gap-1.5 pb-2.5 transition-all cursor-pointer relative shrink-0 ${
                        isActive ? 'text-[#1E60F3]' : 'hover:text-slate-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                      {isActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TAB 1: 개요 (Overview) - 6 Modular Cards Grid (Matches Screenshot) */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. 최근 요청 사항 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
                          <AlertCircle className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-xs font-black text-slate-900">최근 요청 사항</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('requests')}
                        className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                      >
                        전체 보기
                      </button>
                    </div>

                    <div className="divide-y divide-slate-50 mt-1">
                      {selectedCustomer.recentRequests.length > 0 ? (
                        selectedCustomer.recentRequests.map((req) => (
                          <div key={req.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                              <span className="font-semibold text-slate-800 truncate">
                                {req.content}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                              {req.date}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 py-6 text-center">등록된 최근 요청사항이 없습니다.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. 다음 행사 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-xs font-black text-slate-900">다음 행사</h3>
                      </div>
                    </div>

                    {selectedCustomer.nextEvent ? (
                      <div className="mt-3 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">
                            {selectedCustomer.nextEvent.date}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#1E60F3] text-[10px] font-black">
                            {selectedCustomer.nextEvent.dDay}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{selectedCustomer.nextEvent.location}</span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 font-semibold pt-1">
                          <div className="flex items-center gap-1">
                            <Car className="w-3.5 h-3.5 text-slate-400" />
                            <span>{selectedCustomer.nextEvent.vehiclesRequired}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>{selectedCustomer.nextEvent.passengerCount}명</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{selectedCustomer.nextEvent.timeRange}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-6 text-center">예정된 다음 행사가 없습니다.</p>
                    )}
                  </div>
                </div>

                {/* 3. 주요 선호사항 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
                          <Heart className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-xs font-black text-slate-900">주요 선호사항</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          haptics.lightTap();
                          setEditModalConfig({ isOpen: true, mode: 'preferences' });
                        }}
                        className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                      >
                        수정
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {selectedCustomer.preferences.map((pref) => (
                        <span
                          key={pref}
                          className="px-2.5 py-1 rounded-lg bg-slate-100/90 text-slate-700 text-xs font-bold border border-slate-200/60"
                        >
                          {pref}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. 최근 운행 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-xs font-black text-slate-900">최근 운행</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('history')}
                        className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                      >
                        전체 보기
                      </button>
                    </div>

                    {selectedCustomer.recentTrip ? (
                      <div className="flex items-center gap-3 mt-3">
                        {/* Car Thumbnail */}
                        <div className="w-16 h-12 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center shrink-0 border border-slate-700 shadow-2xs">
                          <Car className="w-6 h-6 text-slate-300" />
                        </div>

                        <div className="min-w-0 flex-1 text-xs">
                          <p className="font-black text-slate-900">
                            {selectedCustomer.recentTrip.date}
                          </p>
                          <p className="font-semibold text-slate-700 mt-0.5 truncate">
                            {selectedCustomer.recentTrip.route}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {selectedCustomer.recentTrip.vehicleDetails}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-6 text-center">최근 운행 이력이 없습니다.</p>
                    )}
                  </div>
                </div>

                {/* 5. 담당자 (3) */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-xs font-black text-slate-900">
                          담당자 ({selectedCustomer.contacts.length})
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('contacts')}
                        className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                      >
                        전체 보기
                      </button>
                    </div>

                    <div className="divide-y divide-slate-50 mt-1">
                      {selectedCustomer.contacts.map((contact) => {
                        const initials = contact.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase();

                        return (
                          <div
                            key={contact.id}
                            className="py-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-blue-100 text-[#1E60F3] font-black text-[10px] flex items-center justify-center shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-900 truncate">
                                  {contact.name}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {contact.role}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={`tel:${contact.phone}`}
                                className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 text-blue-600 flex items-center justify-center transition-colors"
                                title="전화 걸기"
                              >
                                <Phone className="w-3 h-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  haptics.lightTap();
                                  setComposeModalState({
                                    isOpen: true,
                                    to: contact.email,
                                    subject: `[VIP LIMOUSINE] ${selectedCustomer.name} 의전 일정 안내`,
                                  });
                                }}
                                className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 text-blue-600 flex items-center justify-center transition-colors cursor-pointer"
                                title="이메일 작성"
                              >
                                <Mail className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 6. 메모 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <h3 className="text-xs font-black text-slate-900">메모</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          haptics.lightTap();
                          setEditModalConfig({ isOpen: true, mode: 'notes' });
                        }}
                        className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                      >
                        수정
                      </button>
                    </div>

                    <ul className="mt-3 space-y-1.5 text-xs text-slate-700 font-medium">
                      {selectedCustomer.notes.map((note, idx) => (
                        <li key={idx} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-slate-400 shrink-0 font-bold">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: 담당자 상세 탭 */}
            {activeTab === 'contacts' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">
                    전체 담당자 및 비서실 연락처 ({selectedCustomer.contacts.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => alert('신규 담당자 추가 모달을 호출합니다.')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-[#1E60F3] hover:bg-blue-100 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ 담당자 추가</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedCustomer.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-black text-slate-900 text-sm">{contact.name}</p>
                          <p className="text-slate-500 font-medium">{contact.role}</p>
                        </div>
                        {contact.isPrimary && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-[#1E60F3]">
                            대표 담당자
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 text-slate-600 font-medium pt-1 border-t border-slate-100">
                        <p className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{contact.phone}</span>
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-blue-600">{contact.email}</span>
                        </p>
                      </div>

                      <div className="pt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            haptics.lightTap();
                            setComposeModalState({
                              isOpen: true,
                              to: contact.email,
                              subject: `[VIP LIMOUSINE] ${selectedCustomer.name} 의전 안내`,
                            });
                          }}
                          className="flex-1 py-1.5 rounded-lg bg-[#1E60F3] hover:bg-blue-600 text-white font-bold text-center transition-all cursor-pointer"
                        >
                          메일 발송
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: 예약 이력 탭 */}
            {activeTab === 'history' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                <h3 className="text-sm font-black text-slate-900">
                  {selectedCustomer.name} 과거 및 진행 중 운행 이력
                </h3>

                <div className="divide-y divide-slate-100 text-xs">
                  {selectedCustomer.tripsHistory.length > 0 ? (
                    selectedCustomer.tripsHistory.map((trip) => (
                      <div key={trip.id} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
                            <Car className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-black text-slate-900">{trip.route}</p>
                            <p className="text-slate-400 text-[11px] mt-0.5">
                              {trip.date} • 배정: {trip.driverName} 기사 ({trip.vehicleModel})
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          운행 완료
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 py-8 text-center">기록된 운행 이력이 없습니다.</p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: 행사 탭 */}
            {activeTab === 'events' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                <h3 className="text-sm font-black text-slate-900">
                  {selectedCustomer.name} 전담 행사 및 VIP 프로젝트 타임라인
                </h3>

                <div className="space-y-3">
                  {selectedCustomer.eventsHistory.length > 0 ? (
                    selectedCustomer.eventsHistory.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-sm">{ev.title}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-[#1E60F3]">
                              {ev.dDay}
                            </span>
                          </div>
                          <span className="text-slate-500 font-semibold">{ev.date}</span>
                        </div>

                        <div className="flex items-center gap-4 text-slate-600 font-medium pt-1">
                          <span>장소: {ev.location}</span>
                          <span>차량: {ev.vehiclesRequired}</span>
                          <span>인원: {ev.passengerCount}명</span>
                          <span>시간: {ev.timeRange}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 py-8 text-center">등록된 행사 일정이 없습니다.</p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: 요청사항 탭 */}
            {activeTab === 'requests' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                <h3 className="text-sm font-black text-slate-900">
                  {selectedCustomer.name} 특별 요청사항 히스토리
                </h3>

                <div className="divide-y divide-slate-100 text-xs">
                  {selectedCustomer.recentRequests.map((req) => (
                    <div key={req.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-800">{req.content}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">접수 일시: {req.date}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700">
                        {req.status === 'resolved' ? '반영 완료' : '접수 확인'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 6: 소통 기록 탭 */}
            {activeTab === 'communications' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900">
                    {selectedCustomer.name} 의전 소통 및 연락 타임라인
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setComposeModalState({
                        isOpen: true,
                        to: selectedCustomer.mainEmail,
                        subject: `[VIP LIMOUSINE] ${selectedCustomer.name} 공식 업무 연락`,
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E60F3] text-white text-xs font-bold hover:bg-blue-600 transition-all cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>새 메일 작성</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {selectedCustomer.communications.length > 0 ? (
                    selectedCustomer.communications.map((comm) => (
                      <div key={comm.id} className="py-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            [{comm.channel.toUpperCase()}] {comm.sender}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {comm.date}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{comm.summary}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 py-8 text-center">기록된 소통 내역이 없습니다.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">고객사를 선택해주세요</p>
          </div>
        )}
      </div>

      {/* 1. Modal: 신규 고객사 등록 (+ 고객 등록) */}
      <HqCustomerRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onRegisterCustomer={handleRegisterCustomer}
      />

      {/* 2. Modal: 선호사항 / 메모 수정 */}
      {selectedCustomer && (
        <HqCustomerEditModal
          isOpen={editModalConfig.isOpen}
          onClose={() => setEditModalConfig({ isOpen: false, mode: 'notes' })}
          customer={selectedCustomer}
          mode={editModalConfig.mode}
          onSave={handleUpdateCustomer}
        />
      )}

      {/* 3. Modal: Compose & Send Email */}
      <HqComposeEmailModal
        isOpen={composeModalState.isOpen}
        onClose={() => setComposeModalState({ isOpen: false, to: '', subject: '' })}
        initialTo={composeModalState.to}
        initialSubject={composeModalState.subject}
      />
    </div>
  );
};
