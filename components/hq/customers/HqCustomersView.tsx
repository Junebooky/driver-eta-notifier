'use client';

import React, { useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import Image from 'next/image';
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
  Receipt,
  CheckCircle2,
  Clock3,
  Eye,
  X,
  Building2,
} from 'lucide-react';
import { HqCustomer } from '@/types/customerHq';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import {
  getStoredCustomers,
  saveStoredCustomers,
  fetchHqCustomersFromDb,
  saveContactToCrmDb,
  updateHqCustomerInDb,
  CRM_CUSTOMERS_UPDATE_EVENT,
} from '@/utils/crmCustomerSync';
import { CustomerBrandLogo } from './CustomerBrandLogo';
import { HqCustomerRegisterModal } from './HqCustomerRegisterModal';
import { HqCustomerEditModal } from './HqCustomerEditModal';
import { HqComposeEmailModal } from '@/components/hq/email/HqComposeEmailModal';
import { haptics } from '@/utils/haptics';
import {
  getHqExpensesSnapshot,
  getHqExpensesServerSnapshot,
  subscribeHqExpenses,
} from '@/utils/expenseHqStorage';
import { HqExpenseRecord, HqExpenseStatus } from '@/types/expenseHq';
import { formatKRW } from '@/utils/expense';

export interface HqCustomersViewProps {
  initialSearchQuery?: string;
  onOpenBookingModal?: (customerName: string) => void;
  onOpenSettlementReport?: (customerId?: string) => void;
}

export const HqCustomersView: React.FC<HqCustomersViewProps> = ({
  initialSearchQuery = '',
  onOpenSettlementReport,
}) => {
  // Customers State (Synchronized with live cockpit.customers DB)
  const [customers, setCustomers] = useState<HqCustomer[]>(() => getStoredCustomers());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    INITIAL_HQ_CUSTOMERS[0]?.id || ''
  );

  // Sync stored customers when updated from email intake or other tabs, and fetch fresh from DB
  useEffect(() => {
    fetchHqCustomersFromDb().then((dbCustomers) => {
      if (dbCustomers && dbCustomers.length > 0) {
        setCustomers(dbCustomers);
      }
    });

    const handleUpdate = () => {
      setCustomers(getStoredCustomers());
    };
    window.addEventListener(CRM_CUSTOMERS_UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(CRM_CUSTOMERS_UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [tierFilter, setTierFilter] = useState<'all' | 'VIP' | '주요' | '일반' | 'favorite'>('all');

  // Pagination (8 per page, matching image "28개 중 1-8개")
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Active Detail Tab ('overview' | 'billing' | 'contacts' | 'history' | 'events' | 'requests' | 'communications')
  const [activeTab, setActiveTab] = useState<
    'overview' | 'billing' | 'contacts' | 'history' | 'events' | 'requests' | 'communications'
  >('overview');

  // Live HQ Expenses subscription
  const allExpenses = useSyncExternalStore(
    subscribeHqExpenses,
    getHqExpensesSnapshot,
    getHqExpensesServerSnapshot
  );

  // Receipt preview modal state
  const [previewReceipt, setPreviewReceipt] = useState<HqExpenseRecord | null>(null);

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

  // Filter expenses belonging to selected customer
  const customerExpenses = useMemo(() => {
    if (!selectedCustomer) return [];
    const custNameLower = selectedCustomer.name.toLowerCase();
    const custId = selectedCustomer.id;

    return allExpenses.filter((e) => {
      if (e.customerId && e.customerId === custId) return true;
      if (e.customerName) {
        const expCustLower = e.customerName.toLowerCase();
        if (expCustLower.includes(custNameLower) || custNameLower.includes(expCustLower)) {
          return true;
        }
      }
      return false;
    });
  }, [allExpenses, selectedCustomer]);

  // Billing statistics
  const billingStats = useMemo(() => {
    const total = customerExpenses.reduce((sum, item) => sum + (item.amount || 0), 0);
    const approved = customerExpenses
      .filter((item) => item.status === '승인 완료')
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const pending = customerExpenses
      .filter((item) => item.status === '검수 대기' || item.status === '금액 확인')
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const receiptCount = customerExpenses.filter((item) => item.hasReceiptImage).length;

    return {
      total,
      approved,
      pending,
      count: customerExpenses.length,
      receiptCount,
    };
  }, [customerExpenses]);

  // Category badge helper
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case '주유비':
        return <span className="px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-700 border border-amber-200">주유비</span>;
      case '통행료':
        return <span className="px-2 py-0.5 rounded-md font-bold bg-blue-50 text-blue-700 border border-blue-200">통행료</span>;
      case '주차비':
        return <span className="px-2 py-0.5 rounded-md font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">주차비</span>;
      case '세차비':
        return <span className="px-2 py-0.5 rounded-md font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">세차비</span>;
      case '식대':
        return <span className="px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">식대</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-700 border border-slate-200">{category}</span>;
    }
  };

  // Status badge helper
  const getStatusBadge = (status: HqExpenseStatus) => {
    switch (status) {
      case '승인 완료':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            승인 완료
          </span>
        );
      case '반려':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" />
            반려
          </span>
        );
      case '금액 확인':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3 h-3" />
            금액 확인
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <Clock3 className="w-3 h-3" />
            검수 대기
          </span>
        );
    }
  };

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
    setCustomers((prev) => {
      const next = prev.map((c) =>
        c.id === customerId ? { ...c, isFavorite: !c.isFavorite } : c
      );
      saveStoredCustomers(next);
      const target = next.find((c) => c.id === customerId);
      if (target) {
        updateHqCustomerInDb(target).catch(() => {});
      }
      return next;
    });
  };

  // Add new customer handler
  const handleRegisterCustomer = (newCustomer: HqCustomer) => {
    setCustomers((prev) => {
      const next = [newCustomer, ...prev];
      saveStoredCustomers(next);
      return next;
    });
    // Persist new customer to Supabase DB
    saveContactToCrmDb({
      companyName: newCustomer.name,
      contactName: newCustomer.primaryContactName || newCustomer.contacts[0]?.name || '담당자',
      contactPhone: newCustomer.mainPhone || newCustomer.contacts[0]?.phone || '',
      contactEmail: newCustomer.mainEmail || newCustomer.contacts[0]?.email || '',
      department: newCustomer.department,
      notes: newCustomer.notes?.[0] || '',
    }).catch(() => {});

    setSelectedCustomerId(newCustomer.id);
    setCurrentPage(1);
    haptics.success();
  };

  // Update customer handler
  const handleUpdateCustomer = (updated: HqCustomer) => {
    setCustomers((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? updated : c));
      saveStoredCustomers(next);
      return next;
    });
    updateHqCustomerInDb(updated).catch(() => {});
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

              {/* Sub-Navigation Tabs with Active Blue Underline */}
              <div className="flex items-center gap-6 mt-6 border-b border-slate-100 text-xs font-bold text-slate-500 overflow-x-auto">
                {[
                  { id: 'overview', label: '개요', icon: LayoutGrid },
                  { id: 'billing', label: '청구 내역', icon: Receipt },
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
                            | 'billing'
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
                      {tab.id === 'billing' && customerExpenses.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-100 text-[#1E60F3]">
                          {customerExpenses.length}
                        </span>
                      )}
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

                {/* 7. 배차 경비 청구 요약 카드 (Full width) */}
                <div className="md:col-span-2 bg-gradient-to-r from-blue-50/80 via-white to-slate-50/80 rounded-2xl border border-blue-100 shadow-xs p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black text-slate-900">
                          {selectedCustomer.name} 배차 경비 청구 요약
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-[#1E60F3]">
                          {billingStats.count}건 제출
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        기사가 제출한 유류비/통행료/주차비 영수증이 고객사 배차 스케줄과 자동 맵핑됩니다.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-medium">총 청구 금액</div>
                      <div className="text-base font-black text-[#1E60F3]">
                        {formatKRW(billingStats.total)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setActiveTab('billing');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-blue-50 text-[#1E60F3] border border-blue-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <span>청구 내역 전체보기</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: 청구 내역 (Billing & Dispatched Expenses) */}
            {activeTab === 'billing' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900">
                        {selectedCustomer.name} 배차 경비 청구 내역
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-[#1E60F3]">
                        자동 맵핑 완료
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      배차된 스케줄 및 기사 운행 내역을 기반으로 자동 분류된 영수증과 경비 지출 명세입니다.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-slate-500 font-medium">
                      총 <strong className="text-slate-900">{customerExpenses.length}</strong>건
                    </span>
                    {onOpenSettlementReport && (
                      <button
                        type="button"
                        onClick={() => {
                          haptics.lightTap();
                          onOpenSettlementReport(selectedCustomer.id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <span>행사 종합 정산·수익성 리포트</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70">
                    <span className="text-[11px] font-bold text-slate-400">총 청구 금액</span>
                    <p className="text-base font-black text-slate-900 mt-1">
                      {formatKRW(billingStats.total)}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-100">
                    <span className="text-[11px] font-bold text-emerald-600">승인 완료 금액</span>
                    <p className="text-base font-black text-emerald-700 mt-1">
                      {formatKRW(billingStats.approved)}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-100">
                    <span className="text-[11px] font-bold text-amber-600">검수 대기 금액</span>
                    <p className="text-base font-black text-amber-700 mt-1">
                      {formatKRW(billingStats.pending)}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100">
                    <span className="text-[11px] font-bold text-[#1E60F3]">첨부 영수증 증빙</span>
                    <p className="text-base font-black text-blue-700 mt-1">
                      {billingStats.receiptCount}건 <span className="text-xs font-normal text-slate-400">/ {billingStats.count}건</span>
                    </p>
                  </div>
                </div>

                {/* Table of Dispatched Expenses for Customer */}
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-xs select-none">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3 w-10 text-center">NO</th>
                        <th className="py-2.5 px-3">일시</th>
                        <th className="py-2.5 px-3">기사 / 차량</th>
                        <th className="py-2.5 px-3">항목</th>
                        <th className="py-2.5 px-3">상호 / 가맹점</th>
                        <th className="py-2.5 px-3 text-right">청구 금액</th>
                        <th className="py-2.5 px-3 text-center">영수증</th>
                        <th className="py-2.5 px-3 text-center">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerExpenses.length > 0 ? (
                        customerExpenses.map((item, idx) => (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-3 px-3 text-slate-400 text-center font-semibold text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-3 px-3 text-slate-600 whitespace-nowrap text-[11px] font-medium">
                              {item.submittedAt}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="font-bold text-slate-900">{item.driverName}</div>
                              <div className="text-[11px] text-slate-500 font-medium">{item.vehiclePlate}</div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {getCategoryBadge(item.categoryLabel)}
                            </td>
                            <td className="py-3 px-3 max-w-[140px] truncate">
                              <span className="font-bold text-slate-800">{item.merchant}</span>
                            </td>
                            <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                              {formatKRW(item.amount)}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {item.receiptUrl ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    haptics.lightTap();
                                    setPreviewReceipt(item);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-[#1E60F3] hover:bg-blue-100 px-2 py-0.5 rounded font-bold border border-blue-200 transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>확인</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-300">-</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {getStatusBadge(item.status)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="font-bold text-slate-600">배차 경비 청구 내역이 없습니다</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              기사가 영수증을 등록하거나 배차가 완료되면 자동으로 이곳에 매핑되어 집계됩니다.
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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

      {/* 4. Modal: 영수증 사진 및 증빙 상세 확인 */}
      {previewReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#1E60F3]" />
                <h3 className="font-black text-sm text-slate-900">영수증 원본 증빙</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {previewReceipt.receiptUrl ? (
                <div className="relative w-full h-[360px] bg-slate-900/5 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center">
                  <Image
                    src={previewReceipt.receiptUrl}
                    alt="영수증 원본"
                    fill
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="object-contain p-2"
                  />
                </div>
              ) : (
                <div className="h-48 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 text-xs">
                  첨부된 영수증 사진이 없습니다.
                </div>
              )}

              <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/70 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">고객사</span>
                  <span className="font-bold text-[#1E60F3] bg-blue-50 px-2 py-0.5 rounded border border-blue-100/80">
                    {previewReceipt.customerName || selectedCustomer?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">가맹점 상호</span>
                  <span className="font-bold text-slate-800">{previewReceipt.merchant}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">기사 / 차량</span>
                  <span className="font-medium text-slate-700">
                    {previewReceipt.driverName} ({previewReceipt.vehiclePlate})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">제출 일시</span>
                  <span className="font-medium text-slate-700">{previewReceipt.submittedAt}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/60 items-center">
                  <span className="text-slate-500 font-bold">청구 금액</span>
                  <span className="text-sm font-black text-[#1E60F3]">
                    {formatKRW(previewReceipt.amount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-all cursor-pointer"
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
