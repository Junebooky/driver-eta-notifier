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
  Loader2,
  Trash2,
} from 'lucide-react';
import { HqCustomer } from '@/types/customerHq';
import {
  getStoredCustomers,
  saveStoredCustomers,
  fetchHqCustomersFromDb,
  saveContactToCrmDb,
  updateHqCustomerInDb,
  deleteHqCustomerInDb,
  CRM_CUSTOMERS_UPDATE_EVENT,
  CRM_CUSTOMERS_STORAGE_KEY,
} from '@/utils/crmCustomerSync';
import { CustomerBrandLogo } from './CustomerBrandLogo';
import { HqCustomerRegisterModal } from './HqCustomerRegisterModal';
import { HqCustomerEditModal } from './HqCustomerEditModal';
import { HqCustomerAddContactModal, type NewCustomerContact } from './HqCustomerAddContactModal';
import {HqCustomerEditContactModal} from './HqCustomerEditContactModal';
import {updateContactDetails,type ContactChannelDraft} from '@/lib/customers/contactChannels';
import { HqComposeEmailModal } from '@/components/hq/email/HqComposeEmailModal';
import { haptics } from '@/utils/haptics';
import {
  getHqExpensesSnapshot,
  getHqExpensesServerSnapshot,
  subscribeHqExpenses,
} from '@/utils/expenseHqStorage';
import { HqExpenseRecord, HqExpenseStatus } from '@/types/expenseHq';
import { formatKRW } from '@/utils/expense';
import { HqSearchSelect } from '@/components/hq/ui/HqSearchSelect';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import { HqBadge, HqButton, HqCard, HqIconButton, HqSegmentedTabs } from '@/components/hq/ui';
import { HqCustomerOverview } from './HqCustomerOverview';
import { HqCustomerActivityPanels } from './HqCustomerActivityPanels';
import { HqCustomerContactMemoModal } from './HqCustomerContactMemoModal';
import { saveCustomerContactMemoInDb,saveCustomerContactDetailsInDb } from '@/utils/crmCustomerSync';
import { HqModal } from '@/components/hq/ui/HqModal';

export interface HqCustomersViewProps {
  initialSearchQuery?: string;
  onOpenBookingModal?: (customerName: string) => void;
  onOpenSettlementReport?: (customerId?: string) => void;
}

export const HqCustomersView: React.FC<HqCustomersViewProps> = ({
  initialSearchQuery = '',
  onOpenSettlementReport,
}) => {
  // Customers State (Strictly synchronized with live cockpit.customers DB, never flashing demo fixtures)
  const [customers, setCustomers] = useState<HqCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [operationFeedbackTone, setOperationFeedbackTone] = useState<'error' | 'info' | 'success'>('error');
  const [deleteTargetCustomer, setDeleteTargetCustomer] = useState<HqCustomer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [contactMemoTarget, setContactMemoTarget] = useState<{customerId:string;contactId:string}|null>(null);
  const [contactEditTarget, setContactEditTarget] = useState<{customerId:string;contactId:string}|null>(null);

  const isFetchingRef = React.useRef(false);

  const loadAuthoritativeCustomers = React.useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoadingDb(true);
    setDbErrorMessage(null);
    try {
      const res = await fetchHqCustomersFromDb();
      if (res.ok) {
        setCustomers(res.customers);
        if (res.customers.length > 0) {
          setSelectedCustomerId((prev) =>
            res.customers.some((c) => c.id === prev) ? prev : res.customers[0].id
          );
        } else {
          setSelectedCustomerId('');
        }
      } else {
        setDbErrorMessage(res.error || '고객사 데이터를 불러오지 못했습니다.');
      }
    } catch (err: any) {
      setDbErrorMessage(err.message || '고객사 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoadingDb(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Sync stored customers when updated from email intake or other tabs, and fetch fresh from DB
  useEffect(() => {
    loadAuthoritativeCustomers();

    const handleUpdate = () => {
      loadAuthoritativeCustomers();
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === CRM_CUSTOMERS_STORAGE_KEY) {
        loadAuthoritativeCustomers();
      }
    };

    window.addEventListener(CRM_CUSTOMERS_UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(CRM_CUSTOMERS_UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadAuthoritativeCustomers]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [tierFilter, setTierFilter] = useState<'all' | 'VIP' | '주요' | '일반' | 'favorite'>('all');

  // Pagination (8 per page, matching image "28개 중 1-8개")
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Focused four-section layout. Contacts and individual notes live in Overview.
  const [activeTab, setActiveTab] = useState<'overview'|'operations'|'billing'|'conversations'>('overview');

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
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
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

  // Consistent neutral HQ badges rather than one-off colored labels.
  const getCategoryBadge = (category:string) => <HqBadge>{category}</HqBadge>;
  const getStatusBadge = (status:HqExpenseStatus) => <HqBadge tone={status==='반려'?'critical':status==='금액 확인'||status==='검수 대기'?'warning':'neutral'}>{status}</HqBadge>;

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
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCustomers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCustomers, currentPage]);

  // Toggle favorite status
  // Toggle favorite status - strictly awaits DB update
  const handleToggleFavorite = async (customerId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const currentTarget = customers.find((c) => c.id === customerId);
    if (!currentTarget || isTogglingFavorite) return;

    setIsTogglingFavorite(true);
    setOperationFeedbackTone('error');
    setOperationMessage(null);
    const updated = { ...currentTarget, isFavorite: !currentTarget.isFavorite };

    try {
      const ok = await updateHqCustomerInDb(updated);
      if (ok) {
        haptics.selection();
        setCustomers((prev) => {
          const next = prev.map((c) => (c.id === customerId ? updated : c));
          saveStoredCustomers(next, false);
          return next;
        });
      } else {
        setOperationMessage('즐겨찾기 상태를 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } catch (err: any) {
      setOperationMessage(`즐겨찾기 변경 오류: ${err instanceof Error ? err.message : '서버 연결을 확인해 주세요.'}`);
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  // Add new customer handler - strictly awaits DB insertion and binds server-confirmed row/ID
  const handleRegisterCustomer = async (newCustomerDraft: HqCustomer): Promise<boolean> => {
    setIsLoadingDb(true);
    setDbErrorMessage(null);
    setOperationFeedbackTone('error');
    setOperationMessage(null);

    try {
      const res = await saveContactToCrmDb({
        companyName: newCustomerDraft.name,
        contactName: newCustomerDraft.primaryContactName || newCustomerDraft.contacts[0]?.name || '담당자',
        contactPhone: newCustomerDraft.mainPhone || newCustomerDraft.contacts[0]?.phone || '',
        contactEmail: newCustomerDraft.mainEmail || newCustomerDraft.contacts[0]?.email || '',
        role: newCustomerDraft.contacts[0]?.role || '담당자',
        department: newCustomerDraft.department,
        notes: newCustomerDraft.notes?.[0] || '',
        notesList: newCustomerDraft.notes,
        tier: newCustomerDraft.tier,
        preferences: newCustomerDraft.preferences,
        isFavorite: newCustomerDraft.isFavorite,
        nextEvent: newCustomerDraft.nextEvent,
      });

      if (!res.success || !res.clientId) {
        setOperationMessage(`고객사 등록 실패: ${res.message || '서버 저장에 실패했습니다.'}`);
        return false;
      }

      // Re-fetch authoritative customer list from DB to bind confirmed server row
      const refreshRes = await fetchHqCustomersFromDb();
      if (refreshRes.ok) {
        setCustomers(refreshRes.customers);
        setSelectedCustomerId(res.clientId);
        setCurrentPage(1);
        haptics.success();
        return true;
      } else {
        // The server confirmed the new customer. Do not keep the form open:
        // retrying the POST here could create a duplicate customer.
        setOperationMessage('고객사는 서버에 등록됐지만 목록 갱신에 실패했습니다. 새로고침으로 확인해 주세요.');
        return true;
      }
    } catch (err: any) {
      setOperationMessage(`고객사 등록 중 네트워크 오류가 발생했습니다: ${err instanceof Error ? err.message : '서버 연결을 확인해 주세요.'}`);
      return false;
    } finally {
      setIsLoadingDb(false);
    }
  };

  // Update customer handler - strictly awaits DB update
  const handleUpdateCustomer = async (updated: HqCustomer): Promise<boolean> => {
    setIsLoadingDb(true);
    setOperationFeedbackTone('error');
    setOperationMessage(null);
    try {
      const ok = await updateHqCustomerInDb(updated);
      if (!ok) {
        setOperationMessage('고객사 정보를 서버에 저장하지 못했습니다. 변경사항을 확인한 뒤 다시 시도해 주세요.');
        return false;
      }
      setCustomers((prev) => {
        const next = prev.map((c) => (c.id === updated.id ? updated : c));
        saveStoredCustomers(next, false);
        return next;
      });
      return true;
    } catch (err: any) {
      setOperationMessage(`고객사 정보 저장 중 오류가 발생했습니다: ${err instanceof Error ? err.message : '서버 연결을 확인해 주세요.'}`);
      return false;
    } finally {
      setIsLoadingDb(false);
    }
  };

  const handleAddContact = async (draft: NewCustomerContact): Promise<string | null> => {
    if (!selectedCustomer) return '저장할 고객사를 먼저 선택해 주세요.';
    const result = await saveContactToCrmDb({
      companyName: selectedCustomer.name,
      contactName: draft.name.trim(),
      contactPhone: draft.phone.trim(),
      contactEmail: draft.email.trim(),
      contactPhones: draft.phones,
      contactEmails: draft.emails,
      role: draft.role.trim() || '예약 담당자',
      department: draft.department.trim() || '의전예약',
    });
    if (!result.success) return result.message || '서버에 담당자를 저장하지 못했습니다.';

    const refreshed = await fetchHqCustomersFromDb();
    if (!refreshed.ok) {
      setDbErrorMessage('담당자는 DB에 저장됐지만 목록 갱신에 실패했습니다. 새로고침해 주세요.');
      // The server already persisted the contact; don't retry POST and create duplicates.
      return null;
    }
    setCustomers(refreshed.customers);
    setSelectedCustomerId(result.clientId);
    setActiveTab('overview');
    setDbErrorMessage(null);
    return null;
  };

  const handleEditContact=async(contactId:string,details:ContactChannelDraft):Promise<string|null>=>{
    if(!selectedCustomer||contactEditTarget?.customerId!==selectedCustomer.id||
       contactEditTarget.contactId!==contactId)return '현재 선택한 담당자가 달라졌습니다. 다시 열어 주세요.';
    const customerId=selectedCustomer.id;
    const result=await saveCustomerContactDetailsInDb(customerId,contactId,details);
    if(!result.ok)return result.error||'담당자 정보 수정에 실패했습니다.';
    const refreshed=await fetchHqCustomersFromDb();
    if(refreshed.ok){
      setCustomers(refreshed.customers);
      setDbErrorMessage(null);
    }else{
      // DB write already succeeded: reflect edited values without submitting
      // a second write and creating duplicate records.
      setCustomers(previous=>previous.map(customer=>{
        if(customer.id!==customerId)return customer;
        const updated=updateContactDetails(customer.contacts,contactId,details);
        const person=customer.contacts.find(p=>p.id===contactId);
        const primary=person?.isPrimary||
          (person?.name===customer.primaryContactName&&!customer.contacts.some(p=>p.isPrimary));
        return {...customer,contacts:updated.contacts,
          ...(primary?{primaryContactName:details.name,mainPhone:details.phones[0]||'',
            mainEmail:details.emails[0]||''}:{})};
      }));
      setDbErrorMessage('담당자 정보는 저장됐지만 목록 새로고침에 실패했습니다. 다시 열면 최신 정보가 표시됩니다.');
    }
    setOperationFeedbackTone('success');
    setOperationMessage('담당자 이름·연락처·이메일 변경사항이 저장되었습니다.');
    return null;
  };

  const handleSaveContactMemo=async(contactId:string,memo:string):Promise<string|null>=>{
    if(!selectedCustomer||contactMemoTarget?.customerId!==selectedCustomer.id||
      contactMemoTarget.contactId!==contactId)return '선택된 담당자가 변경됐습니다. 다시 열어 주세요.';
    const id=selectedCustomer.id;
    const result=await saveCustomerContactMemoInDb(id,contactId,memo);
    if(!result.ok)return result.error||'메모 저장 실패';
    setCustomers(previous=>previous.map(customer=>customer.id!==id?customer:{
      ...customer,contacts:customer.contacts.map(person=>
        person.id===contactId?{...person,memo}:person),
    }));
    setOperationFeedbackTone('success');
    setOperationMessage('담당자 개인 메모가 저장되었습니다.');
    return null;
  };

  const openDeleteCustomerModal = (customer: HqCustomer, e?: React.MouseEvent) => {
    e?.stopPropagation();
    haptics.lightTap();
    setDeleteError(null);
    setDeleteTargetCustomer(customer);
  };

  const closeDeleteCustomerModal = () => {
    if (isDeletingCustomer) return;
    setDeleteTargetCustomer(null);
    setDeleteError(null);
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!deleteTargetCustomer || isDeletingCustomer) return;
    const target = deleteTargetCustomer;
    setIsDeletingCustomer(true);
    setDeleteError(null);
    try {
      const res = await deleteHqCustomerInDb(target.id);
      if (!res.ok) {
        haptics.errorAlert();
        setDeleteError(res.error || '고객사를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      haptics.mediumTap();
      const nextCustomers = customers.filter((c) => c.id !== target.id);
      setCustomers(nextCustomers);
      saveStoredCustomers(nextCustomers, false);
      if (selectedCustomerId === target.id) {
        setSelectedCustomerId(nextCustomers[0]?.id || '');
      }
      setDeleteTargetCustomer(null);
      setDeleteError(null);
      setOperationFeedbackTone('success');
      setOperationMessage(`'${target.name}' 고객사를 삭제했습니다.`);
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  return (
    <div className="hq-customer-a space-y-5">
      {/* Main 2-Column Workstation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: 고객사 목록 (Left 4.5 cols / ~38%)             */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 flex min-h-[760px] flex-col rounded-[23px] bg-white shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)]">
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <div className="flex items-center gap-1.5">
              <div className="relative group/clients inline-flex items-center justify-center cursor-pointer shrink-0">
                <img
                  src="/images/icons/clients/icon_clients.png"
                  alt="고객관리 아이콘"
                  className="w-12 h-12 object-contain transition-transform duration-150 group-hover/clients:scale-110"
                />

                {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 (아이콘 근접 시에만 노출, 최상단 레이어) */}
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover/clients:flex flex-col items-start pointer-events-none z-[100]">
                  <span className="whitespace-nowrap rounded-[12px] bg-white px-3 py-2 text-[11px] font-medium text-[#4D607C] shadow-[0_8px_22px_rgba(35,49,78,0.1)] animate-in fade-in-50 duration-150">
                    주요 고객사의 계약 단가와 예약 이력을 관리해요
                  </span>
                  <div className="-mt-1 ml-5 size-2 rotate-45 bg-white" />
                </div>
              </div>

              <h2 className="text-[18px] font-bold tracking-[-0.03em] text-[#17233B]">
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
              className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[14px] bg-[#1E60F3] px-4 text-[12px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-colors hover:bg-[#1757DC] active:scale-[0.99]"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>고객 등록</span>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex items-center gap-2 px-5 pb-4 sm:px-6">
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
                className="h-11 w-full rounded-[14px] bg-white pl-9 pr-3 text-[13px] font-medium text-[#17233B] placeholder:text-[#95A3B9] shadow-[0_4px_14px_rgba(35,49,78,0.045)] outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
              />
            </div>

            <div className="min-w-[148px]">
              <HqSearchSelect
                label="고객사 등급 필터"
                size="sm"
                value={tierFilter}
                onChange={(next) => {
                  setTierFilter(next as 'all' | 'VIP' | '주요' | '일반' | 'favorite');
                  setCurrentPage(1);
                }}
                placeholder="전체 고객"
                options={[
                  { value: 'all', label: '전체 고객' },
                  { value: 'VIP', label: 'VIP' },
                  { value: '주요', label: '주요 고객' },
                  { value: '일반', label: '일반 고객' },
                  { value: 'favorite', label: '즐겨찾기' },
                ]}
              />
            </div>
          </div>

          <HqInlineFeedback
            message={operationMessage}
            tone={operationFeedbackTone}
            onDismiss={() => setOperationMessage(null)}
            className="mx-5 mb-3 sm:mx-6"
          />

          {/* Customer Cards List */}
          <div className="max-h-[610px] flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 pb-3">
            {isLoadingDb && customers.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Loader2 className="w-8 h-8 mx-auto mb-2 text-[#1E60F3] animate-spin" />
                <p className="text-xs font-bold text-slate-700">실시간 고객사 데이터를 불러오는 중...</p>
                <p className="text-[11px] text-slate-400 mt-1">Supabase DB에서 최신 데이터를 동기화하고 있습니다.</p>
              </div>
            ) : dbErrorMessage ? (
              <div className="p-12 text-center text-rose-500">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
                <p className="text-xs font-bold text-rose-700">고객사 데이터를 불러오지 못했습니다.</p>
                <p className="text-[11px] text-rose-400 mt-1">{dbErrorMessage}</p>
                <button
                  type="button"
                  onClick={loadAuthoritativeCustomers}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer transition-colors"
                >
                  다시 시도
                </button>
              </div>
            ) : paginatedCustomers.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">
                  {customers.length === 0 ? '등록된 고객사가 없습니다.' : '검색된 고객사가 없습니다.'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {customers.length === 0
                    ? "우측 상단의 '고객 등록' 버튼으로 새 고객사를 추가해 보세요."
                    : '검색어 또는 필터를 변경해보세요.'}
                </p>
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
                    className={`group relative flex cursor-pointer items-center justify-between gap-3 rounded-[17px] p-3.5 transition-colors ${isSelected
                      ? 'bg-[#F3F7FF] shadow-[0_3px_12px_rgba(35,49,78,0.055)]'
                      : 'hover:bg-[#FAFBFD]'
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
                            className={`px-1.5 py-0.2 rounded text-[10px] font-black shrink-0 ${cust.tier === 'VIP'
                              ? 'bg-[#EEF3FF] text-[#31598F]'
                              : cust.tier === '주요'
                                ? 'bg-[#F7F9FC] text-[#73839D]'
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
                          className={`w-4 h-4 transition-colors ${cust.isFavorite
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300 hover:text-slate-400'
                            }`}
                        />
                      </button>

                      <HqIconButton
                        variant="ghost"
                        size="sm"
                        aria-label={`${cust.name} 고객사 삭제`}
                        title="고객사 삭제"
                        onClick={(e) => openDeleteCustomerModal(cust, e)}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </HqIconButton>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Pagination Bar (Matches image: < 1 2 3 4 5 ... > 28개 중 1-8개) */}
          <div className="flex items-center justify-between bg-white p-4 text-[12px] font-medium text-[#61728A]">
            {/* Page numbers */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setCurrentPage((p) => Math.max(1, p - 1));
                }}
                disabled={currentPage === 1}
                className="flex size-9 cursor-pointer items-center justify-center rounded-[12px] bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6] disabled:cursor-not-allowed disabled:opacity-40"
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
                  className={`flex size-9 cursor-pointer items-center justify-center rounded-[12px] text-[12px] font-semibold transition-colors ${currentPage === pageNum
                    ? 'bg-[#EEF3FF] text-[#1E60F3]'
                    : 'bg-white text-[#73839D] hover:bg-[#F7F9FC]'
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
                className="flex size-9 cursor-pointer items-center justify-center rounded-[12px] bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6] disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <CustomerBrandLogo
                    name={selectedCustomer.name}
                    logoType={selectedCustomer.logoType}
                    size="lg"
                  />

                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[23px] font-bold tracking-[-0.035em] text-[#17233B]">
                        {selectedCustomer.name}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-black ${selectedCustomer.tier === 'VIP'
                          ? 'bg-[#EEF3FF] text-[#31598F]'
                          : selectedCustomer.tier === '주요'
                            ? 'bg-[#F7F9FC] text-[#73839D]'
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

                {/* Star Favorite & Delete Actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleFavorite(selectedCustomer.id)}
                    className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                    title="즐겨찾기 토글"
                  >
                    <Star
                      className={`w-5 h-5 ${selectedCustomer.isFavorite
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-300'
                        }`}
                    />
                  </button>
                  <HqButton
                    variant="subtle"
                    size="sm"
                    onClick={() => openDeleteCustomerModal(selectedCustomer)}
                    aria-label={`${selectedCustomer.name} 고객사 삭제`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>삭제</span>
                  </HqButton>
                </div>
              </div>

              <HqSegmentedTabs aria-label="고객사 상세 정보 탭"
                className="mt-5 w-full overflow-x-auto" value={activeTab}
                onValueChange={value=>setActiveTab(value as typeof activeTab)}
                tabs={[
                  {id:'overview',label:'개요'},
                  {id:'operations',label:'운행·행사'},
                  {id:'billing',label:'경비·정산',count:customerExpenses.length||undefined},
                  {id:'conversations',label:'요청·소통'},
                ]}/>

            </div>

            {activeTab==='overview'&&<HqCustomerOverview
              customer={selectedCustomer}
              expenseCount={billingStats.count} expenseTotal={billingStats.total}
              onAddContact={()=>setIsAddContactOpen(true)}
              onEditContactMemo={person=>setContactMemoTarget({customerId:selectedCustomer.id,contactId:person.id})}
              onEditContact={person=>setContactEditTarget({customerId:selectedCustomer.id,contactId:person.id})}
              onEditCompanyNotes={()=>setEditModalConfig({isOpen:true,mode:'notes'})}
              onEditPreferences={()=>setEditModalConfig({isOpen:true,mode:'preferences'})}
              onComposeEmail={email=>setComposeModalState({isOpen:true,to:email,
                subject:'[VIP LIMOUSINE] '+selectedCustomer.name+' 의전 안내'})}
              onNavigate={setActiveTab}
            />}

            {/* TAB: 청구 내역 (Billing & Dispatched Expenses) */}
            {activeTab === 'billing' && (
              <HqCard className="min-w-0 space-y-5 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900">
                        {selectedCustomer.name} 배차 경비 내역
                      </h3>
                      <HqBadge>연결된 경비 내역</HqBadge>
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
                      <HqButton variant="primary" size="sm"
                        onClick={()=>onOpenSettlementReport(selectedCustomer.id)}>
                        행사 종합 정산 리포트 <ChevronRight className="size-4"/>
                      </HqButton>
                    )}
                  </div>
                </div>

                {/* KPI blocks share the neutral HQ card component. */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[
                    {label:'총 제출 경비',value:formatKRW(billingStats.total)},
                    {label:'승인 완료',value:formatKRW(billingStats.approved)},
                    {label:'검수 대기',value:formatKRW(billingStats.pending)},
                    {label:'증빙 영수증',value:billingStats.receiptCount+' / '+billingStats.count+'건'},
                  ].map(metric=><HqCard key={metric.label} tone="muted" className="min-w-0 p-3.5">
                    <p className="text-[11px] text-[#8190A4]">{metric.label}</p>
                    <p className="mt-1 break-words text-[14px] font-semibold tabular-nums text-[#243750]">{metric.value}</p>
                  </HqCard>)}
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
                        <th className="py-2.5 px-3 text-right">제출 경비</th>
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
                                  className="hq-ui-button text-[11px]"
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
                            <p className="font-bold text-slate-600">배차 경비 내역이 없습니다</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              기사가 영수증을 등록하거나 배차가 완료되면 자동으로 이곳에 매핑되어 집계됩니다.
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </HqCard>
            )}

            {(activeTab==='operations'||activeTab==='conversations')&&
              <HqCustomerActivityPanels customer={selectedCustomer} tab={activeTab}
                onComposeEmail={email=>setComposeModalState({isOpen:true,to:email,
                  subject:'[VIP LIMOUSINE] '+selectedCustomer.name+' 업무 연락'})}/>
            }

          </div>
        ) : (
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400">
            {isLoadingDb ? (
              <>
                <Loader2 className="w-10 h-10 mx-auto mb-2 text-[#1E60F3] animate-spin" />
                <p className="text-sm font-bold text-slate-700">고객사 정보를 불러오는 중입니다...</p>
              </>
            ) : (
              <>
                <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-bold text-slate-700">고객사를 선택해주세요</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* 1. Modal: 신규 고객사 등록 (+ 고객 등록) */}
      <HqCustomerRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onRegisterCustomer={handleRegisterCustomer}
      />

      {/* 1-A. Server-persisted customer contact creation */}
      <HqCustomerAddContactModal
        isOpen={isAddContactOpen && Boolean(selectedCustomer)}
        companyName={selectedCustomer?.name || ''}
        onClose={() => setIsAddContactOpen(false)}
        onSave={handleAddContact}
      />

      {/* Edit an EXISTING contact by stable ID; do not create a duplicate. */}
      {contactEditTarget&&selectedCustomer?.id===contactEditTarget.customerId&&
        selectedCustomer.contacts.find(person=>person.id===contactEditTarget.contactId)&&(
          <HqCustomerEditContactModal isOpen
            key={contactEditTarget.customerId+':'+contactEditTarget.contactId}
            companyName={selectedCustomer.name}
            contact={selectedCustomer.contacts.find(person=>person.id===contactEditTarget.contactId)!}
            onClose={()=>setContactEditTarget(null)}
            onSave={handleEditContact}
          />
        )}

      {/* Contact-specific note, separate from company-wide memo. */}
      {contactMemoTarget&&selectedCustomer?.id===contactMemoTarget.customerId&&
        selectedCustomer.contacts.find(person=>person.id===contactMemoTarget.contactId)&&(
          <HqCustomerContactMemoModal isOpen
            customerName={selectedCustomer.name}
            contactId={contactMemoTarget.contactId}
            contactName={selectedCustomer.contacts.find(person=>person.id===contactMemoTarget.contactId)!.name}
            initialMemo={selectedCustomer.contacts.find(person=>person.id===contactMemoTarget.contactId)!.memo||''}
            onClose={()=>setContactMemoTarget(null)}
            onSave={handleSaveContactMemo}
          />
        )}

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

      {/* 3-A. Modal: 고객사 영구 삭제 확인 */}
      <HqModal
        isOpen={Boolean(deleteTargetCustomer)}
        title="고객사를 삭제할까요?"
        subtitle="삭제된 고객사와 담당자 정보는 복구할 수 없어요."
        icon={
          <img
            src="/images/icons/clients/icon_clients.png"
            alt="고객관리 아이콘"
            draggable={false}
            className="size-11 shrink-0 object-contain"
          />
        }
        onClose={closeDeleteCustomerModal}
        footer={
          <>
            <HqButton variant="subtle" onClick={closeDeleteCustomerModal} disabled={isDeletingCustomer}>
              취소
            </HqButton>
            <HqButton
              variant="danger"
              loading={isDeletingCustomer}
              onClick={() => void handleConfirmDeleteCustomer()}
            >
              {isDeletingCustomer ? '삭제 중...' : '삭제하기'}
            </HqButton>
          </>
        }
      >
        {deleteTargetCustomer && (
          <div className="space-y-4">
            <HqCard tone="muted" className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-bold text-[#17233B]">{deleteTargetCustomer.name}</span>
                <HqBadge tone={deleteTargetCustomer.tier === 'VIP' ? 'selected' : 'neutral'}>
                  {deleteTargetCustomer.tier}
                </HqBadge>
              </div>
              <p className="text-[12px] text-[#60728A]">
                {deleteTargetCustomer.primaryContactName
                  ? `대표 담당자 · ${deleteTargetCustomer.primaryContactName}${deleteTargetCustomer.contacts.length > 1 ? ` 외 ${deleteTargetCustomer.contacts.length - 1}명` : ''}`
                  : `등록된 담당자 ${deleteTargetCustomer.contacts.length}명`}
              </p>
            </HqCard>

            <p className="text-[12px] leading-relaxed text-[#60728A]">
              기존 배차, 운행일지, 경비 기록은 삭제되지 않고 남아요.
            </p>

            <HqInlineFeedback message={deleteError} onDismiss={() => setDeleteError(null)} />
          </div>
        )}
      </HqModal>

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
