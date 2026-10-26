'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  Receipt,
  Search,
  Download,
  RotateCw,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  CreditCard,
  X,
  ZoomIn,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { HqExpenseRecord, HqExpenseStatus } from '@/types/expenseHq';
import {
  getHqExpenses,
  getHqExpenseKpiSummary,
  updateHqExpenseStatus,
  exportExpensesToCsv,
  HQ_EXPENSE_UPDATE_EVENT,
} from '@/utils/expenseHqStorage';
import { EXPENSE_CATEGORIES, formatKRW } from '@/utils/expense';
import { renderCategoryIcon } from '@/components/AddExpenseModal';
import { rotateImageDataUrl } from '@/utils/imageRotate';
import { haptics } from '@/utils/haptics';

export interface HqExpensesViewProps {
  initialSearchQuery?: string;
}

export const HqExpensesView: React.FC<HqExpensesViewProps> = ({
  initialSearchQuery = '',
}) => {
  const [expenses, setExpenses] = useState<HqExpenseRecord[]>(() => getHqExpenses());
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(() => {
    const list = getHqExpenses();
    return list[0]?.id || null;
  });

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedStatus, setSelectedStatus] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);

  // Review notes map per expense ID
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Receipt rotation & zoom in inspection drawer
  const [isRotating, setIsRotating] = useState(false);
  const [isReceiptZoomOpen, setIsReceiptZoomOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const refreshExpenses = useCallback(() => {
    const loaded = getHqExpenses();
    setExpenses(loaded);
  }, []);

  useEffect(() => {
    window.addEventListener(HQ_EXPENSE_UPDATE_EVENT, refreshExpenses);
    window.addEventListener('storage', refreshExpenses);
    return () => {
      window.removeEventListener(HQ_EXPENSE_UPDATE_EVENT, refreshExpenses);
      window.removeEventListener('storage', refreshExpenses);
    };
  }, [refreshExpenses]);

  // Selected item
  const selectedExpense = useMemo(() => {
    return expenses.find((e) => e.id === selectedExpenseId) || expenses[0] || null;
  }, [expenses, selectedExpenseId]);

  const currentReviewNotes = selectedExpense
    ? (reviewNotesMap[selectedExpense.id] ?? selectedExpense.reviewNotes ?? '')
    : '';

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
          item.merchant.toLowerCase().includes(q) ||
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

  // Handle Review Status Change
  const handleUpdateStatus = (newStatus: HqExpenseStatus) => {
    if (!selectedExpense) return;
    haptics.success();
    const updated = updateHqExpenseStatus(
      selectedExpense.id,
      newStatus,
      currentReviewNotes.trim() || undefined,
      '본사 관리자'
    );
    if (updated) {
      refreshExpenses();
      showToast(`${selectedExpense.driverName} 기사님의 경비 상태가 '${newStatus}'(으)로 변경되었습니다.`);
    }
  };

  // Rotate receipt inside inspection drawer
  const handleRotateCurrentReceipt = async (degrees: number = 90) => {
    if (!selectedExpense?.receiptUrl || isRotating) return;
    haptics.selection();
    setIsRotating(true);
    try {
      const rotated = await rotateImageDataUrl(selectedExpense.receiptUrl, degrees);
      const updatedList = expenses.map((e) =>
        e.id === selectedExpense.id ? { ...e, receiptUrl: rotated } : e
      );
      setExpenses(updatedList);
      showToast('영수증 사진이 90° 회전되었습니다.');
    } catch (err) {
      console.error('Failed to rotate receipt in inspection drawer:', err);
    } finally {
      setIsRotating(false);
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    haptics.selection();
    const csv = exportExpensesToCsv(filteredExpenses);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HQ_경비지출관리_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('경비 지출 내역 CSV 다운로드가 완료되었습니다.');
  };

  const getStatusBadge = (status: HqExpenseStatus) => {
    switch (status) {
      case '검수 대기':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>검수 대기</span>
          </span>
        );
      case '승인 완료':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>승인 완료</span>
          </span>
        );
      case '금액 확인':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            <span>금액 확인</span>
          </span>
        );
      case '반려':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1">
            <XCircle className="w-3 h-3 text-slate-500" />
            <span>반려</span>
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center shadow-2xs">
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

        <div className="flex items-center gap-2">
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

      {/* 2. KPI Summary Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 오늘 총 지출 */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
            <span>오늘 총 지출</span>
            <CreditCard className="w-4 h-4 text-[#1E60F3]" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {formatKRW(kpi.todayTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium">
            전체 등록: {kpi.totalCount}건
          </div>
        </div>

        {/* 검수 대기 */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === '검수 대기' ? '전체' : '검수 대기')}
          className={`border rounded-2xl p-4 shadow-xs cursor-pointer transition-all ${
            selectedStatus === '검수 대기'
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/20'
              : 'bg-white border-slate-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-700 font-bold mb-1">
            <span>검수 대기</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-700 tracking-tight">
            {kpi.pendingCount}건
          </div>
          <div className="text-[11px] text-amber-600/80 mt-1 font-medium">
            영수증 확인 및 승인 대기
          </div>
        </div>

        {/* 승인 완료 */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === '승인 완료' ? '전체' : '승인 완료')}
          className={`border rounded-2xl p-4 shadow-xs cursor-pointer transition-all ${
            selectedStatus === '승인 완료'
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-white border-slate-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-700 font-bold mb-1">
            <span>승인 완료</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">
            {kpi.approvedCount}건
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1 font-medium">
            정산 승인 처리 완료
          </div>
        </div>

        {/* 금액 확인 / 반려 */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === '금액 확인' ? '전체' : '금액 확인')}
          className={`border rounded-2xl p-4 shadow-xs cursor-pointer transition-all ${
            selectedStatus === '금액 확인'
              ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-400/20'
              : 'bg-white border-slate-200/80 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-700 font-bold mb-1">
            <span>확인 필요 / 반려</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-700 tracking-tight">
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedStatus === status
                    ? 'bg-[#1E60F3] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="기사명, 차량번호, 상호명 검색..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#1E60F3] focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-100">
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
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Main Working Layout: Left Table + Right Slide-over / Detail Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Expenses Table (7 Cols on desktop) */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              제출 목록 ({filteredExpenses.length}건)
            </h3>
            <span className="text-xs text-slate-400">
              행을 클릭하면 우측 검수창에서 영수증을 확인하고 승인할 수 있습니다.
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs select-none">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">제출일시</th>
                  <th className="py-2.5 px-3">기사 / 차량</th>
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
                  const catMeta = EXPENSE_CATEGORIES[item.category] || EXPENSE_CATEGORIES.other;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        haptics.lightTap();
                        setSelectedExpenseId(item.id);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/80 font-bold'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-3 text-slate-400 text-[11px]">{item.no}</td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                        {item.submittedAt}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{item.driverName}</div>
                        <div className="text-[10px] text-slate-400">{item.vehiclePlate}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${catMeta.badgeBg} ${catMeta.badgeTextColor} border ${catMeta.badgeBorder}`}
                        >
                          {renderCategoryIcon(catMeta.iconName, 'w-3 h-3')}
                          <span>{item.categoryLabel}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-[140px] truncate">
                        <span className="font-semibold text-slate-800">{item.merchant}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                        {formatKRW(item.amount)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {item.hasReceiptImage ? (
                          <span className="inline-block text-[10px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-bold border border-sky-200">
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

        {/* Right: Selected Expense Inspection & Verification Panel (5 Cols on desktop) */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          {selectedExpense ? (
            <div className="space-y-4">
              {/* Inspection Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    영수증 검수 및 승인
                  </h3>
                  <span className="text-xs text-slate-400 font-semibold">#{selectedExpense.no}</span>
                </div>
                {getStatusBadge(selectedExpense.status)}
              </div>

              {/* Receipt Photograph with Zoom & 90-degree Rotation */}
              {selectedExpense.receiptUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>영수증 원본 사진</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRotateCurrentReceipt(90)}
                        disabled={isRotating}
                        className="text-[11px] text-[#1E60F3] hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                        title="90° 시계방향 세우기"
                      >
                        {isRotating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCw className="w-3.5 h-3.5" />
                        )}
                        <span>90° 세우기</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsReceiptZoomOpen(true)}
                        className="text-[11px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-full font-semibold flex items-center gap-1"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>확대</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative w-full h-52 bg-slate-900/5 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center group shadow-2xs">
                    <Image
                      src={selectedExpense.receiptUrl}
                      alt="검수 영수증 원본"
                      fill
                      sizes="(max-width: 768px) 100vw, 400px"
                      className="object-contain p-2 cursor-pointer transition-transform duration-200 group-hover:scale-[1.01]"
                      onClick={() => setIsReceiptZoomOpen(true)}
                    />
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 z-10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRotateCurrentReceipt(-90);
                        }}
                        disabled={isRotating}
                        className="bg-black/70 hover:bg-black text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-xs cursor-pointer"
                        title="좌 90° 회전"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>좌회전</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRotateCurrentReceipt(90);
                        }}
                        disabled={isRotating}
                        className="bg-[#1E60F3]/90 hover:bg-[#1E60F3] text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 backdrop-blur-xs cursor-pointer"
                        title="90° 세우기"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>90° 세우기</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-32 bg-slate-50 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-1">
                  <Receipt className="w-6 h-6 stroke-[1.8]" />
                  <span className="text-xs font-semibold">첨부된 영수증 사진 없음</span>
                </div>
              )}

              {/* Vision AI OCR Recognition Badge */}
              {selectedExpense.ocrExtracted && (
                <div className="bg-blue-50/80 border border-blue-200/90 rounded-xl p-3 text-xs flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[#1E60F3] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-[#1E60F3] flex items-center gap-1.5">
                      <span>Vision AI 판독 완료</span>
                      <span className="text-[10px] font-normal text-blue-600">Gemini 3.8 Flash</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {selectedExpense.ocrSummary || `${selectedExpense.merchant} · ${formatKRW(selectedExpense.amount)}`}
                    </p>
                  </div>
                </div>
              )}

              {/* Expense Detailed Specs */}
              <div className="space-y-2 text-xs bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400 font-medium">제출 기사 / 차량</span>
                  <span className="font-bold text-slate-800">
                    {selectedExpense.driverName} ({selectedExpense.vehiclePlate})
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400 font-medium">지출 항목</span>
                  <span className="font-bold text-slate-800">{selectedExpense.categoryLabel}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400 font-medium">가맹점 상호</span>
                  <span className="font-bold text-slate-800 truncate max-w-[200px]">
                    {selectedExpense.merchant}
                  </span>
                </div>
                {selectedExpense.address && (
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400 font-medium">소재지 주소</span>
                    <span className="font-medium text-slate-600 truncate max-w-[200px]">
                      {selectedExpense.address}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400 font-medium">결제 수단</span>
                  <span className="font-bold text-slate-800">{selectedExpense.paymentMethodLabel}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400 font-medium">결제 금액</span>
                  <span className="text-sm font-black text-[#1E60F3]">
                    {formatKRW(selectedExpense.amount)}
                  </span>
                </div>
              </div>

              {/* Review Notes Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">검수 의견 / 메모</label>
                <textarea
                  value={currentReviewNotes}
                  onChange={(e) => {
                    if (selectedExpense) {
                      setReviewNotesMap((prev) => ({
                        ...prev,
                        [selectedExpense.id]: e.target.value,
                      }));
                    }
                  }}
                  placeholder="승인 또는 반려 사유를 입력하세요."
                  rows={2}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#1E60F3] resize-none"
                />
              </div>

              {/* Action Buttons for HQ Admin */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('승인 완료')}
                    className="py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>승인 완료</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('금액 확인')}
                    className="py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>금액 확인</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('반려')}
                    className="py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>반려</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              선택된 지출 항목이 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* Full Receipt Zoom Modal in Inspection View */}
      {isReceiptZoomOpen && selectedExpense?.receiptUrl && (
        <div className="fixed inset-0 z-70 flex flex-col items-center justify-between bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl flex items-center justify-between text-white py-2 px-1 z-20">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">영수증 원본 확대 및 방향 조정</span>
              <span className="text-xs text-white/50">{selectedExpense.driverName} 기사</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRotateCurrentReceipt(-90)}
                disabled={isRotating}
                className="bg-white/15 hover:bg-white/25 active:scale-95 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-xs transition-all cursor-pointer"
                title="반시계방향 90° 회전"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>좌 90°</span>
              </button>
              <button
                type="button"
                onClick={() => handleRotateCurrentReceipt(90)}
                disabled={isRotating}
                className="bg-[#1E60F3] hover:bg-blue-600 active:scale-95 disabled:opacity-40 text-white text-xs font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                title="시계방향 90° 세우기"
              >
                {isRotating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5" />
                )}
                <span>90° 세우기</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptZoomOpen(false)}
                className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-1"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative w-full max-w-2xl flex-1 my-2">
            <Image
              src={selectedExpense.receiptUrl}
              alt="확대 영수증 원본"
              fill
              sizes="(max-width: 768px) 100vw, 900px"
              className="object-contain"
            />
          </div>

          <div className="text-center text-white/50 text-xs py-1">
            누운 영수증은 상단 &apos;90° 세우기&apos; 버튼으로 올바른 방향으로 회전할 수 있습니다.
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-60 bg-slate-900/95 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
