'use client';
import { useReportingRefresh } from '@/hooks/useReportingRefresh';

import React, { useState, useMemo, useSyncExternalStore } from 'react';
import { Receipt, Search, Download, CheckCircle2, AlertCircle, XCircle, Clock, CreditCard, X, Fuel, Car, Utensils, Wrench, HelpCircle, Building2 } from 'lucide-react';
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

  const getStatusBadge = (status: HqExpenseStatus) => {
    switch (status) {
      case '검수 대기':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1 shadow-2xs">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>검수 대기</span>
          </span>
        );
      case '승인 완료':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1 shadow-2xs">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>승인 완료</span>
          </span>
        );
      case '금액 확인':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 flex items-center gap-1 shadow-2xs">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            <span>금액 확인</span>
          </span>
        );
      case '반려':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1 shadow-2xs">
            <XCircle className="w-3 h-3 text-slate-500" />
            <span>반려</span>
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getCategoryBadge = (categoryLabel: string) => {
    switch (categoryLabel) {
      case '주유비':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200">
            <Fuel className="w-3 h-3" />
            <span>주유비</span>
          </span>
        );
      case '통행료':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Car className="w-3 h-3" />
            <span>통행료</span>
          </span>
        );
      case '주차비':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="text-[10px] font-black">🅿️</span>
            <span>주차비</span>
          </span>
        );
      case '식비':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
            <Utensils className="w-3 h-3" />
            <span>식비</span>
          </span>
        );
      case '세차비':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
            <span className="text-[10px] font-black">🫧</span>
            <span>세차비</span>
          </span>
        );
      case '정비비':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Wrench className="w-3 h-3" />
            <span>정비비</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <HelpCircle className="w-3 h-3" />
            <span>{categoryLabel || '기타'}</span>
          </span>
        );
    }
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

      {/* 3. Filter Bar & Search */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {['전체', '검수 대기', '승인 완료', '금액 확인', '반려'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setSelectedStatus(status);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${selectedStatus === status
                    ? 'bg-[#1E60F3] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="기사명, 차량번호, 차종, 상호명 검색..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#1E60F3] focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 mr-1 shrink-0">항목:</span>
          {['전체', '주유비', '통행료', '주차비', '식비', '세차비', '정비비', '기타'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                haptics.selection();
                setSelectedCategory(cat);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Expenses list and receipt review workspace */}
      <div className="space-y-4">
        {/* Left: Expenses Table */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              제출 목록 ({filteredExpenses.length}건)
            </h3>
            <span className="text-xs text-slate-400">
              행을 선택하면 원본과 항목을 나란히 검수할 수 있습니다.
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs select-none">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-10 text-center">NO</th>
                  <th className="py-2.5 px-3">제출일시</th>
                  <th className="py-2.5 px-3">기사 / 차량</th>
                  <th className="py-2.5 px-3">고객사</th>
                  <th className="py-2.5 px-3">항목</th>
                  <th className="py-2.5 px-3">상호 / 가맹점</th>
                  <th className="py-2.5 px-3 text-right">금액</th>
                  <th className="py-2.5 px-3 text-center">영수증</th>
                  <th className="py-2.5 px-3 text-center">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((item) => {
                  const isSelected = selectedExpense?.id === item.id;

                  return (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${item.merchant} 영수증 검수`}
                      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedExpenseId(item.id); setReviewQueue(filteredExpenses.map(row => row.id)); } }}
                      onClick={() => {
                        haptics.lightTap();
                        setSelectedExpenseId(item.id);
                        setReviewQueue(filteredExpenses.map(row => row.id));
                      }}
                      className={`cursor-pointer transition-colors ${isSelected
                          ? 'bg-blue-50/80 font-bold'
                          : 'hover:bg-slate-50/80'
                        }`}
                    >
                      <td className="py-3 px-3 text-slate-400 text-center font-semibold text-[11px]">
                        {item.no}
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap text-[11px] font-medium">
                        {item.submittedAt}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{item.driverName}</div>
                        <div className="text-xs font-bold text-slate-800 tracking-tight">{item.vehiclePlate}</div>
                        <div className="text-[10px] text-slate-400 font-medium truncate max-w-[140px]" title={item.vehicleModel}>
                          {item.vehicleModel}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50/70 text-[#1E60F3] font-bold text-[11px] border border-blue-100 shadow-2xs">
                          <Building2 className="w-3 h-3 text-[#1E60F3] shrink-0" />
                          <span className="truncate max-w-[110px]">{item.customerName || '일반 / 미지정'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getCategoryBadge(item.categoryLabel)}
                      </td>
                      <td className="py-3 px-3 max-w-[160px] truncate">
                        <span className="font-bold text-slate-800">{item.merchant}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                        {formatKRW(item.amount)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {item.hasReceiptImage ? (
                          <span className="inline-block text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded font-bold border border-sky-200">
                            영수증 유
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {getStatusBadge(item.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
