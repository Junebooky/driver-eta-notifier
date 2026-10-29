'use client';

import React, { useState, useMemo, useEffect, useSyncExternalStore } from 'react';
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
  ZoomOut,
  Loader2,
  Sparkles,
  Maximize2,
  AlertTriangle,
  Fuel,
  Car,
  Utensils,
  Wrench,
  HelpCircle,
  Building2,
} from 'lucide-react';
import { HqExpenseStatus, HqExpenseRecord } from '@/types/expenseHq';
import {
  subscribeHqExpenses,
  getHqExpensesSnapshot,
  getHqExpensesServerSnapshot,
  getHqExpenseKpiSummary,
  updateHqExpenseStatus,
  updateHqExpenseStatusDb,
  fetchHqExpensesFromDb,
  saveHqExpenses,
  exportExpensesToCsv,
  mergeServerHipassTollsIntoExpenses,
} from '@/utils/expenseHqStorage';
import { formatKRW } from '@/utils/expense';
import { rotateImageDataUrl } from '@/utils/imageRotate';
import { haptics } from '@/utils/haptics';
import { checkDuplicateReceipt } from '@/utils/settlementCalculator';
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
  const [dbError, setDbError] = useState<string | null>(null);

  // Hydrate server-synced expenses & Hi-Pass tolls from Supabase DB
  useEffect(() => {
    let cancelled = false;
    fetchHqExpensesFromDb().then((result) => {
      if (!cancelled) {
        if (!result.ok && result.error) {
          setDbError(result.error);
        } else {
          setDbError(null);
        }
      }
    });

    fetch('/api/expenses/hipass-sync')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.ok && Array.isArray(json.tolls) && json.tolls.length > 0) {
          mergeServerHipassTollsIntoExpenses(json.tolls);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
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

  // Inspector Sub-tab ('photo' = 사진, 'details' = 영수증 정보)
  const [inspectorTab, setInspectorTab] = useState<'photo' | 'details'>('photo');

  // Review notes map per expense ID
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Receipt rotation & zoom in inspection drawer
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [isRotating, setIsRotating] = useState(false);
  const [isReceiptZoomOpen, setIsReceiptZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState<number>(1);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Selected item
  const selectedExpense: HqExpenseRecord | null = useMemo(() => {
    if (selectedExpenseId) {
      const found = expenses.find((e) => e.id === selectedExpenseId);
      if (found) return found;
    }
    return expenses[0] || null;
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

  // Handle Review Status Change (strictly syncs to DB)
  const handleUpdateStatus = async (newStatus: HqExpenseStatus) => {
    if (!selectedExpense) return;
    haptics.success();
    const ok = await updateHqExpenseStatusDb(
      selectedExpense.id,
      newStatus,
      currentReviewNotes.trim() || undefined,
      '본사 관리자'
    );
    if (!ok) {
      updateHqExpenseStatus(
        selectedExpense.id,
        newStatus,
        currentReviewNotes.trim() || undefined,
        '본사 관리자'
      );
    }
    showToast(`${selectedExpense.driverName} 기사님의 경비 상태가 '${newStatus}'(으)로 변경되었습니다.`);
  };

  // Rotate receipt 90 degrees
  const handleRotateCurrentReceipt = async (degrees: number = 90) => {
    if (!selectedExpense?.receiptUrl || isRotating) return;
    haptics.selection();
    setIsRotating(true);
    setRotationAngle((prev) => (prev + degrees) % 360);

    try {
      const rotated = await rotateImageDataUrl(selectedExpense.receiptUrl, degrees);
      const updatedList = expenses.map((e) =>
        e.id === selectedExpense.id ? { ...e, receiptUrl: rotated } : e
      );
      saveHqExpenses(updatedList);
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

  const getMerchantBrandBadge = (merchant: string) => {
    if (merchant.includes('CU')) {
      return (
        <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-black text-xs flex items-center justify-center shrink-0">
          CU
        </span>
      );
    }
    if (merchant.includes('GS')) {
      return (
        <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-black text-xs flex items-center justify-center shrink-0">
          GS
        </span>
      );
    }
    if (merchant.includes('고속도로') || merchant.includes('영업소')) {
      return (
        <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-black text-[11px] flex items-center justify-center shrink-0">
          하이
        </span>
      );
    }
    if (merchant.includes('호텔') || merchant.includes('코엑스')) {
      return (
        <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-black text-xs flex items-center justify-center shrink-0">
          호텔
        </span>
      );
    }
    if (merchant.includes('만남의광장')) {
      return (
        <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-black text-xs flex items-center justify-center shrink-0">
          EX
        </span>
      );
    }
    if (merchant.includes('식당')) {
      return (
        <span className="w-8 h-8 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 font-black text-xs flex items-center justify-center shrink-0">
          식음
        </span>
      );
    }
    if (merchant.includes('세차')) {
      return (
        <span className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 font-black text-xs flex items-center justify-center shrink-0">
          세차
        </span>
      );
    }
    if (merchant.includes('주차장') || merchant.includes('파크원')) {
      return (
        <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-xs flex items-center justify-center shrink-0">
          🅿️
        </span>
      );
    }
    return (
      <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-black text-xs flex items-center justify-center shrink-0">
        VIP
      </span>
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
              setDbError(null);
              fetchHqExpensesFromDb().then((result) => {
                if (!result.ok && result.error) setDbError(result.error);
              });
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
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Split Workstation Layout: Left Table (~65%) + Right Inspector (~35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Expenses Table */}
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
                      onClick={() => {
                        haptics.lightTap();
                        setSelectedExpenseId(item.id);
                        setRotationAngle(0);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
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

        {/* Right: Selected Expense Inspection Workstation (~35%) */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 sticky top-6">
          {selectedExpense ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    영수증 검수 및 승인
                  </h3>
                  <span className="text-xs text-slate-400 font-bold">#{selectedExpense.no}</span>
                </div>
                {getStatusBadge(selectedExpense.status)}
              </div>

              {/* Sub-Tabs: 사진 vs 영수증 정보 */}
              <div className="flex items-center border-b border-slate-100 gap-6">
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setInspectorTab('photo');
                  }}
                  className={`pb-2.5 text-xs font-bold transition-all relative cursor-pointer ${
                    inspectorTab === 'photo'
                      ? 'text-[#1E60F3] font-black'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span>사진</span>
                  {inspectorTab === 'photo' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setInspectorTab('details');
                  }}
                  className={`pb-2.5 text-xs font-bold transition-all relative cursor-pointer ${
                    inspectorTab === 'details'
                      ? 'text-[#1E60F3] font-black'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span>영수증 정보</span>
                  {inspectorTab === 'details' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
                  )}
                </button>
              </div>

              {/* Sub-tab 1: 사진 (Photo Viewer) - Enlarged inspection view with compact floating controls */}
              {inspectorTab === 'photo' && (
                <div>
                  {/* Duplicate Receipt Alert if detected */}
                  {(() => {
                    const dupCheck = checkDuplicateReceipt(selectedExpense, expenses);
                    if (!dupCheck.isDuplicate) return null;
                    return (
                      <div className="mb-2.5 p-2.5 rounded-xl bg-rose-50 border border-rose-300 flex items-start gap-2 text-[11px] text-rose-800 font-bold">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>[중복 청구 방지 경고] {dupCheck.reason}</span>
                      </div>
                    );
                  })()}

                  {/* Photo Container - Enlarged without fixed toolbar */}
                  {selectedExpense.receiptUrl ? (
                    <div className="relative w-full h-[680px] lg:h-[760px] xl:h-[820px] bg-slate-900/5 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center group shadow-2xs">
                      {/* Compact Floating Overlay Controls (No fixed bar height taken) */}
                      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleRotateCurrentReceipt(90)}
                          disabled={isRotating}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900/75 hover:bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-xs cursor-pointer"
                          title="90° 회전"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>90°</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsReceiptZoomOpen(true)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900/75 hover:bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-xs cursor-pointer"
                          title="원본 크게 확대"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>확대</span>
                        </button>
                      </div>

                      {/* Receipt Image - Maximum display area */}
                      <div
                        className="relative w-full h-full p-2 pb-16 flex items-center justify-center transition-transform duration-300"
                        style={{
                          transform: `rotate(${rotationAngle}deg)`,
                        }}
                      >
                        <Image
                          src={selectedExpense.receiptUrl}
                          alt="검수 영수증 원본"
                          fill
                          sizes="(max-width: 768px) 100vw, 800px"
                          className="object-contain p-2 pb-16"
                        />
                      </div>

                      {/* Integrated Bottom Summary Bar */}
                      <div className="absolute bottom-2 left-2 right-2 z-20 bg-white/95 backdrop-blur-md rounded-xl p-2.5 border border-slate-200 shadow-md flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getMerchantBrandBadge(selectedExpense.merchant)}
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 truncate">
                              {selectedExpense.merchant}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 flex-wrap">
                              {selectedExpense.customerName && (
                                <span className="inline-flex items-center gap-0.5 text-[#1E60F3] font-bold">
                                  <Building2 className="w-3 h-3" />
                                  {selectedExpense.customerName}
                                </span>
                              )}
                              <span>•</span>
                              <span>
                                {selectedExpense.submittedDate} {selectedExpense.time} | {selectedExpense.categoryLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right pl-2 shrink-0">
                          <div className="text-sm font-black text-[#1E60F3]">
                            {formatKRW(selectedExpense.amount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 bg-slate-50 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-2">
                      <Receipt className="w-8 h-8 stroke-[1.8]" />
                      <span className="text-xs font-semibold">첨부된 영수증 사진 없음</span>
                    </div>
                  )}

                  {/* Billable vs Company Direct Cost Classification Toggle */}
                  <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] font-bold text-slate-700">
                      정산 반영 구분 (중복 가산·차감 방지)
                    </span>
                    <div className="inline-flex bg-white border border-slate-200 rounded-lg p-0.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = expenses.map((e) =>
                            e.id === selectedExpense.id ? { ...e, billableToCustomer: true } : e
                          );
                          saveHqExpenses(updated);
                          showToast('고객사 실비 재청구 대상으로 설정되었습니다.');
                        }}
                        className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                          selectedExpense.billableToCustomer !== false
                            ? 'bg-[#1E60F3] text-white'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        고객사 실비 청구
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = expenses.map((e) =>
                            e.id === selectedExpense.id ? { ...e, billableToCustomer: false } : e
                          );
                          saveHqExpenses(updated);
                          showToast('회사 자체 부담 직접비로 분류되었습니다.');
                        }}
                        className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                          selectedExpense.billableToCustomer === false
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        회사 부담 직접비
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: 영수증 정보 (Vision AI OCR Information & Items) */}
              {inspectorTab === 'details' && (
                <div className="space-y-3 text-xs">
                  {/* Vision AI OCR Recognition Badge */}
                  <div className="bg-blue-50/80 border border-blue-200/90 rounded-xl p-3 text-xs flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-[#1E60F3] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-[#1E60F3] flex items-center gap-1.5">
                        <span>Vision AI 판독 완료</span>
                        <span className="text-[10px] font-normal text-blue-600 bg-white/60 px-1.5 py-0.2 rounded border border-blue-200/50">Gemini 3.8 Flash</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 font-medium">
                        {selectedExpense.ocrSummary || `${selectedExpense.merchant} · ${formatKRW(selectedExpense.amount)}`}
                      </p>
                    </div>
                  </div>

                  {/* Discrepancy Alert if applicable */}
                  {selectedExpense.ocrDetails && selectedExpense.ocrDetails.total && selectedExpense.ocrDetails.total !== selectedExpense.amount && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-[11px] text-amber-800">
                        <span className="font-bold">금액 불일치 감지:</span> 영수증 합계({formatKRW(selectedExpense.ocrDetails.total)})와 기사 청구 금액({formatKRW(selectedExpense.amount)})에 차액 {formatKRW(Math.abs(selectedExpense.amount - selectedExpense.ocrDetails.total))}이 있습니다.
                      </div>
                    </div>
                  )}

                  {/* Merchant & Payment Specs */}
                  <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/80 space-y-1.5">
                    <div className="flex justify-between py-1 border-b border-slate-200/60 items-center">
                      <span className="text-slate-400 font-medium flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-[#1E60F3]" />
                        배차 고객사
                      </span>
                      <span className="font-bold text-slate-800 bg-blue-50 text-[#1E60F3] px-2 py-0.5 rounded border border-blue-100/80 text-[11px]">
                        {selectedExpense.customerName || '일반 / 미지정'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-400 font-medium">가맹점 상호</span>
                      <span className="font-bold text-slate-800">{selectedExpense.merchant}</span>
                    </div>
                    {selectedExpense.ocrDetails?.bizNo && (
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-400 font-medium">사업자등록번호</span>
                        <span className="font-bold text-slate-700">{selectedExpense.ocrDetails.bizNo}</span>
                      </div>
                    )}
                    {selectedExpense.address && (
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-400 font-medium">소재지 주소</span>
                        <span className="font-medium text-slate-700 text-right truncate max-w-[200px]">
                          {selectedExpense.address}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-400 font-medium">제출 기사 / 차량</span>
                      <span className="font-bold text-slate-800 text-right">
                        {selectedExpense.driverName} ({selectedExpense.vehiclePlate} · {selectedExpense.vehicleModel})
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-400 font-medium">결제 수단</span>
                      <span className="font-bold text-slate-800">{selectedExpense.paymentMethodLabel}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400 font-medium">청구 금액</span>
                      <span className="text-sm font-black text-[#1E60F3]">
                        {formatKRW(selectedExpense.amount)}
                      </span>
                    </div>
                  </div>

                  {/* OCR Itemized List if available */}
                  {selectedExpense.ocrDetails?.items && selectedExpense.ocrDetails.items.length > 0 && (
                    <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 pb-1 border-b border-slate-100">
                        <span>영수증 품목 내역</span>
                        <span>{selectedExpense.ocrDetails.items.length}개 상품</span>
                      </div>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {selectedExpense.ocrDetails.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] text-slate-600">
                            <span className="truncate max-w-[160px]">{item.name}</span>
                            <span className="text-slate-400 font-medium">{item.qty}개</span>
                            <span className="font-bold text-slate-800">{formatKRW(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex justify-between text-xs font-black text-slate-900">
                        <span>영수증 합계</span>
                        <span className="text-[#1E60F3]">{formatKRW(selectedExpense.ocrDetails.total || selectedExpense.amount)}</span>
                      </div>
                    </div>
                  )}

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
                </div>
              )}

              {/* 3 Bottom Action Buttons in a Single Row */}
              <div className="pt-2">
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
          <div className="w-full max-w-3xl flex items-center justify-between text-white py-2 px-1 z-20">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">영수증 원본 확대 및 방향 조정</span>
              <span className="text-xs text-white/50">{selectedExpense.driverName} 기사 · {selectedExpense.merchant}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.max(0.8, prev - 0.2))}
                className="bg-white/15 hover:bg-white/25 active:scale-95 text-white text-xs font-semibold px-2.5 py-1.5 rounded-full flex items-center gap-1 backdrop-blur-xs transition-all cursor-pointer"
                title="축소"
              >
                <ZoomOut className="w-3.5 h-3.5" />
                <span>축소</span>
              </button>
              <button
                type="button"
                onClick={() => setZoomScale((prev) => Math.min(2.5, prev + 0.2))}
                className="bg-white/15 hover:bg-white/25 active:scale-95 text-white text-xs font-semibold px-2.5 py-1.5 rounded-full flex items-center gap-1 backdrop-blur-xs transition-all cursor-pointer"
                title="확대"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>확대</span>
              </button>
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
                onClick={() => {
                  setIsReceiptZoomOpen(false);
                  setZoomScale(1);
                }}
                className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-1 cursor-pointer"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="relative w-full max-w-3xl flex-1 my-2 overflow-hidden flex items-center justify-center">
            <div
              className="relative w-full h-full transition-transform duration-200"
              style={{
                transform: `rotate(${rotationAngle}deg) scale(${zoomScale})`,
              }}
            >
              <Image
                src={selectedExpense.receiptUrl}
                alt="확대 영수증 원본"
                fill
                sizes="(max-width: 768px) 100vw, 900px"
                className="object-contain"
              />
            </div>
          </div>

          <div className="text-center text-white/50 text-xs py-1">
            누운 영수증은 상단 &apos;90° 세우기&apos; 버튼으로 올바른 방향으로 회전할 수 있습니다.
          </div>
        </div>
      )}

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
        <div className="fixed bottom-6 right-6 z-60 bg-slate-900/95 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default HqExpensesView;
