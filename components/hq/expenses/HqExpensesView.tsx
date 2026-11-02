'use client';
import { useReportingRefresh } from '@/hooks/useReportingRefresh';

import React, { useState, useMemo, useSyncExternalStore } from 'react';
import {
  Receipt,
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  CreditCard,
  X,
  Fuel,
  Car,
  Utensils,
  Wrench,
  ReceiptText,
  FileText,
  FileX,
  Check,
  ChevronRight,
  SlidersHorizontal,
  SquareParking,
  Sparkles,
} from 'lucide-react';
import { HqExpenseStatus } from '@/types/expenseHq';
import {
  subscribeHqExpenses,
  getHqExpensesSnapshot,
  getHqExpensesServerSnapshot,
  getHqExpenseKpiSummary,
  getHqExpenses,
  fetchHqExpensesFromDb,
  exportExpensesToCsv,
} from '@/utils/expenseHqStorage';
import { formatKRW } from '@/utils/expense';
import { haptics } from '@/utils/haptics';
import { nextPendingReceiptId } from '@/utils/expenseReview';
import HqReceiptReviewWorkspace from './HqReceiptReviewWorkspace';
import { HqBooking } from '@/types/hq';
import HqHipassImportModal from './HqHipassImportModal';

export interface HqExpensesViewProps {
  initialSearchQuery?: string;
  bookings?: HqBooking[];
}

export const HqExpensesView: React.FC<HqExpensesViewProps> = ({
  initialSearchQuery = '',
  bookings = [],
}) => {
  const [isHipassModalOpen, setIsHipassModalOpen] = useState(false);
  const {error:dbError,refresh}=useReportingRefresh(fetchHqExpensesFromDb);

  // Live master expenses list via useSyncExternalStore (SSR and Hydration safe)
  const expenses = useSyncExternalStore(
    subscribeHqExpenses,
    getHqExpensesSnapshot,
    getHqExpensesServerSnapshot
  );

  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedStatus, setSelectedStatus] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const selectedExpense = expenses.find(row => row.id === selectedExpenseId) || null;

  // KPI Summary
  const kpi = useMemo(() => {
    return getHqExpenseKpiSummary(expenses);
  }, [expenses]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.driverName.toLowerCase().includes(q) ||
          item.vehiclePlate.toLowerCase().includes(q) ||
          item.vehicleModel.toLowerCase().includes(q) ||
          item.merchant.toLowerCase().includes(q) ||
          (Boolean(item.customerName) && item.customerName!.toLowerCase().includes(q)) ||
          (item.memo && item.memo.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 2. Category filter
      if (selectedCategory !== '전체') {
        if (item.categoryLabel !== selectedCategory && item.category !== selectedCategory) {
          return false;
        }
      }

      // 3. Status filter
      if (selectedStatus !== '전체') {
        if (item.status !== selectedStatus) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, searchQuery, selectedCategory, selectedStatus]);

  // CSV Export
  const handleExportCsv = () => {
    haptics.selection();
    const csv = exportExpensesToCsv(filteredExpenses);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HQ_경비지출_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('경비 지출 내역 CSV 다운로드가 완료되었습니다.');
  };

  const formatSubmittedAt = (val?: string) => {
    if (!val) return '-';
    if (val.includes('/') && val.includes(':')) return val;
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${mm}/${dd} ${hh}:${min}`;
    }
    return val;
  };

  const getCategoryIcon = (categoryLabel: string) => {
    switch (categoryLabel) {
      case '주유비':
        return <Fuel className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      case '통행료':
        return <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      case '주차비':
        return <SquareParking className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      case '식비':
        return <Utensils className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      case '세차비':
        return <Sparkles className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      case '정비비':
        return <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      default:
        return <Receipt className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  const renderStatusBadge = (status: HqExpenseStatus) => {
    switch (status) {
      case '검수 대기':
        return (
          <div
            className="w-7 h-7 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-500 shadow-2xs mx-auto"
            title="검수 대기"
          >
            <Clock className="w-3.5 h-3.5 stroke-[2]" />
          </div>
        );
      case '승인 완료':
        return (
          <div
            className="w-7 h-7 rounded-full border border-slate-300 bg-white flex items-center justify-center text-slate-700 shadow-2xs mx-auto"
            title="승인 완료"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
        );
      case '반려':
        return (
          <div
            className="w-7 h-7 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 shadow-2xs mx-auto"
            title="반려"
          >
            <X className="w-3.5 h-3.5 stroke-[2]" />
          </div>
        );
      case '금액 확인':
        return (
          <div
            className="w-7 h-7 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-400 shadow-2xs mx-auto"
            title="금액 확인"
          >
            <AlertCircle className="w-3.5 h-3.5 stroke-[2]" />
          </div>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  const renderReceiptBadge = (hasReceipt: boolean) => {
    if (hasReceipt) {
      return (
        <div
          className="w-8 h-8 rounded-xl border border-slate-200/80 bg-white flex items-center justify-center text-slate-400 shadow-2xs mx-auto"
          title="영수증 원본 있음"
        >
          <FileText className="w-4 h-4 stroke-[1.8]" />
        </div>
      );
    }
    return (
      <div
        className="w-8 h-8 rounded-xl border border-slate-200/50 bg-slate-50/70 flex items-center justify-center text-slate-300 shadow-2xs mx-auto"
        title="영수증 없음"
      >
        <FileX className="w-4 h-4 stroke-[1.8]" />
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200 select-none">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] border border-blue-200/60 flex items-center justify-center shadow-2xs">
              <Receipt className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              경비지출 관리 및 영수증 검수
            </h2>
            <span className="text-xs bg-blue-50 text-[#1E60F3] font-bold px-2.5 py-0.5 rounded-full border border-blue-200/70">
              실시간 연동
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            기사 Cockpit 앱에서 제출된 법인카드, 주유, 통행료, 주차비 영수증을 Vision AI 판독 결과와 함께 대조 검수합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setIsHipassModalOpen(true);
            }}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>하이패스 통행료 자동 정산</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV 내보내기</span>
          </button>
        </div>
      </div>

      {/* DB Connection / Query Failure Banner */}
      {dbError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-800 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>경비지출 실시간 DB 조회 실패: {dbError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            className="text-xs font-bold text-rose-700 bg-white border border-rose-200 px-3 py-1.5 rounded-xl hover:bg-rose-100 transition shrink-0 cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 2. Top 4 KPI Metric Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 오늘 총 지출 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
            <span>오늘 총 지출</span>
            <CreditCard className="w-4 h-4 text-[#1E60F3]" />
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight">
            {formatKRW(kpi.todayTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">
            전체 등록: {kpi.totalCount}건
          </div>
        </div>

        {/* 검수 대기 */}
        <div
          onClick={() => {
            haptics.selection();
            setSelectedStatus(selectedStatus === '검수 대기' ? '전체' : '검수 대기');
          }}
          className={`border rounded-2xl p-4 shadow-xs cursor-pointer transition-all ${selectedStatus === '검수 대기'
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/20'
              : 'bg-white border-slate-200/80 hover:border-amber-300'
            }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-700 font-bold mb-1">
            <span>검수 대기</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 tracking-tight">
            {kpi.pendingCount}건
          </div>
          <div className="text-[11px] text-amber-600/80 mt-1 font-medium">
            영수증 확인 및 승인 대기
          </div>
        </div>

        {/* 승인 완료 */}
        <div
          onClick={() => {
            haptics.selection();
            setSelectedStatus(selectedStatus === '승인 완료' ? '전체' : '승인 완료');
          }}
          className={`border rounded-2xl p-4 shadow-xs cursor-pointer transition-all ${selectedStatus === '승인 완료'
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-white border-slate-200/80 hover:border-emerald-300'
            }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-700 font-bold mb-1">
            <span>승인 완료</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 tracking-tight">
            {kpi.approvedCount}건
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1 font-medium">
            정상 승인 처리 완료
          </div>
        </div>

        {/* 확인 필요 / 반려 */}
        <div
          onClick={() => {
            haptics.selection();
            setSelectedStatus(selectedStatus === '금액 확인' ? '전체' : '금액 확인');
          }}
          className={`border rounded-2xl p-4 shadow-xs cursor-pointer transition-all ${selectedStatus === '금액 확인'
              ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-400/20'
              : 'bg-white border-slate-200/80 hover:border-rose-300'
            }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-700 font-bold mb-1">
            <span>확인 필요 / 반려</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700 tracking-tight">
            {kpi.actionNeededCount}건
          </div>
          <div className="text-[11px] text-rose-600/80 mt-1 font-medium">
            금액 재확인 또는 보완 요청
          </div>
        </div>
      </div>

      {/* 3. Expenses List & Review Workspace Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl shadow-xs overflow-hidden p-5 sm:p-6 space-y-4">
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Icon + Title + Count */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shrink-0 shadow-xs">
              <ReceiptText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              경비지출 제출 목록
            </h3>
            <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full text-xs">
              {filteredExpenses.length}건
            </span>
          </div>

          {/* Right: Search + Filter button */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="기사 · 차량 · 거래처 검색"
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-[#1E60F3] focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setIsFilterOpen((prev) => !prev);
              }}
              className={`px-3 py-1.5 border rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                isFilterOpen || selectedStatus !== '전체' || selectedCategory !== '전체'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>필터</span>
              {(selectedStatus !== '전체' || selectedCategory !== '전체') && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
              )}
            </button>
          </div>
        </div>

        {/* Subheader: Guide & Counters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs border-b border-slate-100 pb-3">
          <div className="text-slate-400 font-medium">
            행을 선택하면 영수증 원본과 지출 내역을 확인하고 검수할 수 있습니다.
          </div>
          <div className="flex items-center gap-3 text-slate-500 font-medium shrink-0">
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setSelectedStatus(selectedStatus === '검수 대기' ? '전체' : '검수 대기');
              }}
              className={`flex items-center gap-1 transition-colors cursor-pointer ${
                selectedStatus === '검수 대기' ? 'text-[#1E60F3] font-bold' : 'hover:text-slate-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>검수 대기 {kpi.pendingCount}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setSelectedStatus(selectedStatus === '승인 완료' ? '전체' : '승인 완료');
              }}
              className={`flex items-center gap-1 transition-colors cursor-pointer ${
                selectedStatus === '승인 완료' ? 'text-emerald-600 font-bold' : 'hover:text-slate-700'
              }`}
            >
              <Check className="w-3.5 h-3.5 text-slate-400" />
              <span>승인 완료 {kpi.approvedCount}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Filter Bar */}
        {isFilterOpen && (
          <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3 space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-400 mr-1 shrink-0">상태:</span>
              {['전체', '검수 대기', '승인 완료', '금액 확인', '반려'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setSelectedStatus(status);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedStatus === status
                      ? 'bg-[#1E60F3] text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-200/50">
              <span className="text-[11px] font-bold text-slate-400 mr-1 shrink-0">항목:</span>
              {['전체', '주유비', '통행료', '주차비', '식비', '세차비', '정비비', '기타'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setSelectedCategory(cat);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs select-none">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-medium text-slate-400">
                <th className="py-3 px-3 w-12 text-center font-medium">NO</th>
                <th className="py-3 px-3 font-medium">제출일시</th>
                <th className="py-3 px-3 font-medium">기사 / 차량</th>
                <th className="py-3 px-3 font-medium">고객사</th>
                <th className="py-3 px-3 font-medium">항목</th>
                <th className="py-3 px-3 font-medium">상호 / 가맹점</th>
                <th className="py-3 px-3 font-medium">금액</th>
                <th className="py-3 px-3 text-center font-medium w-16">영수증</th>
                <th className="py-3 px-3 text-center font-medium w-16">상태</th>
                <th className="py-3 px-2 w-8 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-xs font-medium">
                    조건에 맞는 경비지출 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((item, index) => {
                  const isSelected = selectedExpense?.id === item.id;
                  const rowNumber = String(index + 1).padStart(2, '0');
                  const hasReceipt = Boolean(item.hasReceiptImage || item.receiptUrl);

                  return (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${item.merchant} 영수증 검수`}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedExpenseId(item.id);
                          setReviewQueue(filteredExpenses.map((row) => row.id));
                        }
                      }}
                      onClick={() => {
                        haptics.lightTap();
                        setSelectedExpenseId(item.id);
                        setReviewQueue(filteredExpenses.map((row) => row.id));
                      }}
                      className={`group cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-3 text-slate-400 text-center font-medium text-xs">
                        {rowNumber}
                      </td>
                      <td className="py-3.5 px-3 text-slate-500 whitespace-nowrap text-xs font-medium">
                        {formatSubmittedAt(item.submittedAt)}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                          {item.driverName}
                        </div>
                        <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                          {item.vehiclePlate}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap text-xs text-slate-600 font-normal">
                        {item.customerName || '일반 / 미지정'}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                          {getCategoryIcon(item.categoryLabel)}
                          <span>{item.categoryLabel || '기타'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-extrabold text-slate-900 text-xs sm:text-sm whitespace-nowrap">
                        {item.merchant}
                      </td>
                      <td className="py-3.5 px-3 font-extrabold text-slate-900 text-xs sm:text-sm whitespace-nowrap">
                        {formatKRW(item.amount)}
                      </td>
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {renderReceiptBadge(hasReceipt)}
                      </td>
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {renderStatusBadge(item.status)}
                      </td>
                      <td className="py-3.5 px-2 text-right whitespace-nowrap">
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors inline-block" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selectedExpense && <HqReceiptReviewWorkspace key={selectedExpense.id} expense={selectedExpense} expenses={expenses} bookings={bookings}
        onClose={() => setSelectedExpenseId(null)} onRefresh={refresh}
        onApproved={async approved => {
          const refreshed = await fetchHqExpensesFromDb();
          if (!refreshed.ok) throw new Error('현재 영수증은 승인되었습니다. 다음 목록을 불러오지 못했으니 최신 내역을 다시 확인해 주세요.');
          const next = nextPendingReceiptId(reviewQueue, approved.id, getHqExpenses());
          setSelectedExpenseId(next);
          if (!next) showToast('현재 검수 목록을 모두 확인했습니다.');
        }}/>}

      {/* Hi-Pass Toll Auto-Reconciliation Modal */}
      <HqHipassImportModal
        isOpen={isHipassModalOpen}
        bookings={bookings}
        onClose={() => setIsHipassModalOpen(false)}
        onImported={(summary) => {
          showToast(
            `하이패스 통행료 ${summary.addedCount}건(₩${summary.totalAmount.toLocaleString()}) 정산 연결 완료`
          );
        }}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div role="status" className="fixed bottom-6 right-6 z-60 bg-slate-900/95 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default HqExpensesView;
