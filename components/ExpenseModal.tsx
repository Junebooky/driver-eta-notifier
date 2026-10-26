'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Store,
  ChevronDown,
  Trash2,
  Plus,
  Sparkles,
  RotateCcw,
  MapPin,
  PieChart,
  X,
  CheckCircle2,
  Camera,
  ReceiptText,
  Send,
  Loader2,
} from 'lucide-react';
import { submitDriverExpensesToHq } from '@/utils/expenseHqStorage';
import {
  ExpenseItem,
  ExpenseSortOption,
  EXPENSE_CATEGORIES,
  REFERENCE_DEMO_EXPENSES,
  calculateTotalExpense,
  filterExpensesByDate,
  formatKRW,
  formatExpenseHeaderDate,
  formatExpenseItemDateTime,
  shiftDateIso,
  sortExpenses,
  loadExpenses,
  saveExpenses,
} from '@/utils/expense';
import { AddExpenseModal, renderCategoryIcon } from './AddExpenseModal';
import { haptics } from '@/utils/haptics';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ExpenseModalContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const scrollContainerRef = useRef<HTMLElement>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);

  // Purely initialized states
  const [{ items: initialItems, isDemo: initialIsDemo }] = useState(loadExpenses);
  const [expenseList, setExpenseList] = useState<ExpenseItem[]>(initialItems);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(initialIsDemo);

  // Date navigation: default to 2026-10-24 matching reference screenshot
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-24');
  const [viewScope, setViewScope] = useState<'selected_date' | 'all'>(() =>
    initialIsDemo ? 'all' : 'selected_date'
  );

  // Sorting
  const [sortOption, setSortOption] = useState<ExpenseSortOption>('newest');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | undefined>(undefined);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // HQ Dashboard Submission State
  const [isSubmittingToHq, setIsSubmittingToHq] = useState(false);
  const [hqSubmitSuccessToast, setHqSubmitSuccessToast] = useState<string | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  };

  // Scroll to top on mount
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, []);

  // Sync to localStorage
  const updateExpenseList = (newItems: ExpenseItem[], isDemo: boolean = false) => {
    setExpenseList(newItems);
    setIsDemoMode(isDemo);
    saveExpenses(newItems, isDemo);
  };

  // Switch between Reference Demo Fixture and Fresh Draft
  const handleResetToRealDraft = () => {
    haptics.warningPulse();
    updateExpenseList([], false);
    showToast('실제 빈 경비지출 내역으로 전환되었습니다.');
  };

  const handleLoadDemoFixture = () => {
    haptics.success();
    updateExpenseList(REFERENCE_DEMO_EXPENSES, true);
    setSelectedDate('2026-10-24');
    showToast('레퍼런스 샘플 지출 내역(164,800원)을 불러왔습니다.');
  };

  // Filtered and sorted items
  const displayedItems = sortExpenses(
    viewScope === 'selected_date'
      ? filterExpensesByDate(expenseList, selectedDate)
      : expenseList,
    sortOption
  );

  // Total calculation
  const totalAmount = calculateTotalExpense(displayedItems);

  // Today check (comparison with 2026-10-24 or real local today)
  const isSelectedDateOct24 = selectedDate === '2026-10-24';

  // Add / Edit save handler
  const handleSaveExpense = (savedItem: ExpenseItem) => {
    haptics.success();
    const existingIndex = expenseList.findIndex((i) => i.id === savedItem.id);
    let updated: ExpenseItem[];
    if (existingIndex >= 0) {
      updated = [...expenseList];
      updated[existingIndex] = savedItem;
      showToast('지출 내역이 수정되었습니다.');
    } else {
      updated = [savedItem, ...expenseList];
      showToast('새 지출 내역이 등록되었습니다.');
    }
    updateExpenseList(updated, false);
    setIsAddModalOpen(false);
    setEditingItem(null);
    setUploadedReceiptUrl(undefined);
  };

  // Delete item handler
  const handleDeleteConfirm = () => {
    if (!deletingItemId) return;
    haptics.mediumTap();
    const updated = expenseList.filter((i) => i.id !== deletingItemId);
    updateExpenseList(updated, false);
    setDeletingItemId(null);
    showToast('지출 내역이 삭제되었습니다.');
  };

  // Submit all currently displayed items to HQ Dashboard
  const handleSubmitAllToHq = () => {
    if (displayedItems.length === 0 || isSubmittingToHq) return;
    haptics.success();
    setIsSubmittingToHq(true);

    const result = submitDriverExpensesToHq(
      displayedItems,
      '윤태준',
      '116허 1514',
      '카니발 하이리무진'
    );

    const nowIso = new Date().toISOString();
    const updated = expenseList.map((item) => {
      if (displayedItems.some((d) => d.id === item.id)) {
        return {
          ...item,
          hqStatus: '검수 대기' as const,
          submittedToHqAt: nowIso,
        };
      }
      return item;
    });

    updateExpenseList(updated, isDemoMode);
    setIsSubmittingToHq(false);
    setHqSubmitSuccessToast(
      `본사(HQ) 대시보드로 ${result.count}건 (총 ${formatKRW(result.totalAmount)})이 성공적으로 전송되었습니다!`
    );
    setTimeout(() => setHqSubmitSuccessToast(null), 4000);
  };

  // Quick photo upload from top action card
  const handleQuickPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.selection();
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadedReceiptUrl(result);
      setEditingItem(null);
      setIsAddModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in select-none overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92dvh] h-[92dvh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-6 sm:animate-scale-up duration-300 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shadow-xs shrink-0">
              <ReceiptText className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">경비지출</h2>
                {isDemoMode ? (
                  <span className="text-[10px] bg-blue-50 text-[#1E60F3] font-semibold px-1.5 py-0.2 rounded border border-blue-100">
                    샘플
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-1.5 py-0.2 rounded">
                    임시저장
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-normal">
                VIP 의전 경비 정산 내역
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {/* Demo fixture toggle */}
            {isDemoMode ? (
              <button
                type="button"
                onClick={handleResetToRealDraft}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
                title="실제 빈 지출 내역으로 전환"
              >
                <RotateCcw className="w-4 h-4 stroke-[2]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoadDemoFixture}
                className="p-1.5 text-blue-500 hover:text-blue-700 rounded-full hover:bg-blue-50"
                title="레퍼런스 샘플 불러오기"
              >
                <Sparkles className="w-4 h-4 stroke-[2]" />
              </button>
            )}

            {/* Calendar icon button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setIsDatePickerOpen(true);
              }}
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100"
              title="날짜 선택"
            >
              <CalendarIcon className="w-4 h-4 stroke-[2]" />
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-500 cursor-pointer transition-all"
              aria-label="닫기"
            >
              <X className="w-4 h-4 stroke-[2.2]" />
            </button>
          </div>
        </div>

        {/* Main Scrollable Content (Pure White Background) */}
        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-4 w-full pb-6 bg-white"
        >
        {/* Notice for Reference Demo vs Fresh Draft */}
        {isDemoMode && (
          <div className="bg-blue-50/70 border border-blue-100 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-blue-700">
            <span className="font-medium">레퍼런스 스크린샷 시연 모드입니다.</span>
            <button
              type="button"
              onClick={handleResetToRealDraft}
              className="underline text-[11px] font-bold hover:text-blue-900"
            >
              빈 내역으로 시작
            </button>
          </div>
        )}

        {/* 2. Date Navigator Bar (Directly on white background per reference mock) */}
        <section className="flex items-center justify-between gap-2 py-1 px-0.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setSelectedDate((prev) => shiftDateIso(prev, -1));
              }}
              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
              aria-label="이전 날짜"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.2]" />
            </button>

            <span className="text-sm sm:text-base font-bold text-slate-900 px-2 tracking-tight">
              {formatExpenseHeaderDate(selectedDate)}
            </span>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setSelectedDate((prev) => shiftDateIso(prev, 1));
              }}
              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
              aria-label="다음 날짜"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.2]" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setSelectedDate('2026-10-24');
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              isSelectedDateOct24
                ? 'border-slate-200 text-slate-800 bg-slate-50'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            오늘
          </button>
        </section>

        {/* 3. Top Action Card: "영수증 찍고 바로 등록하기" */}
        <section
          role="button"
          tabIndex={0}
          onClick={() => {
            haptics.selection();
            setUploadedReceiptUrl('/images/receipt_sample_fuel.jpg');
            setEditingItem(null);
            setIsAddModalOpen(true);
          }}
          className="relative bg-gradient-to-b from-[#F2F7FF] via-[#EBF3FF] to-[#E3EFFF] border border-[#D5E5FE] hover:border-blue-300 rounded-2xl p-5 text-center shadow-xs cursor-pointer active:scale-99 transition-all group overflow-hidden"
        >
          {/* Subtle soft gradient highlight */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-200/30 rounded-full blur-2xl pointer-events-none" />

          {/* 3D Receipt Upload Illustration */}
          <div className="relative w-16 h-16 sm:w-18 sm:h-18 mx-auto mb-2 flex items-center justify-center">
            <Image
              src="/images/receipt_upload_icon.png"
              alt="영수증 업로드 아이콘"
              width={72}
              height={72}
              className="object-contain drop-shadow-sm group-hover:scale-105 transition-transform duration-200"
            />
          </div>

          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight group-hover:text-[#1E60F3] transition-colors">
            영수증 찍고 바로 등록하기
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            사진을 올리면 지출 내역을 빠르게 정리해 드려요
          </p>

          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                quickFileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/90 hover:bg-white text-slate-700 hover:text-[#1E60F3] border border-blue-200/80 rounded-full text-[11px] font-bold shadow-2xs transition-all"
            >
              <Camera className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>사진 직접 촬영 / 앨범</span>
            </button>
          </div>

          <input
            ref={quickFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleQuickPhotoUpload}
          />
        </section>

        {/* 4. Hero Summary Card: "오늘 총 지출" */}
        <section className="bg-gradient-to-r from-[#EBF3FF] via-[#F1F6FF] to-[#E6F0FF] border border-[#D6E5FE] rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xs">
          {/* Background coins and receipt illustration */}
          <div className="absolute right-2 -bottom-1 w-24 h-20 opacity-80 pointer-events-none sm:w-28 sm:h-22">
            <Image
              src="/images/expense_hero_coins.png"
              alt="지출 코인 그래픽"
              width={95}
              height={70}
              className="object-contain object-bottom"
            />
          </div>

          <div className="relative z-10">
            {/* Top Store Icon & Label */}
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
              <Store className="w-4 h-4 text-[#1E60F3]" />
              <span>
                {viewScope === 'all'
                  ? '전체 총 지출'
                  : isSelectedDateOct24
                  ? '오늘 총 지출'
                  : '선택일 총 지출'}
              </span>
            </div>

            {/* Big Bold Amount with Chevron Button */}
            <div className="flex items-center gap-2.5">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {formatKRW(totalAmount)}
              </span>

              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsBreakdownOpen(true);
                }}
                className="w-7 h-7 rounded-full bg-white border border-blue-200 flex items-center justify-center text-[#1E60F3] hover:bg-blue-50 active:scale-95 shadow-2xs transition-all"
                aria-label="항목별 지출 분석 보기"
                title="항목별 분석 보기"
              >
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </section>

        {/* 5. Expense List Section */}
        <section className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">지출 내역</h3>

            {/* Sort & Scope Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSortDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                <span>
                  {sortOption === 'newest'
                    ? '최신순'
                    : sortOption === 'oldest'
                    ? '오래된순'
                    : sortOption === 'highest_amount'
                    ? '금액높은순'
                    : '금액낮은순'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isSortDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 divide-y divide-slate-100">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSortOption('newest');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 ${
                        sortOption === 'newest' ? 'text-[#1E60F3]' : 'text-slate-700'
                      }`}
                    >
                      최신순
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOption('oldest');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 ${
                        sortOption === 'oldest' ? 'text-[#1E60F3]' : 'text-slate-700'
                      }`}
                    >
                      오래된순
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOption('highest_amount');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 ${
                        sortOption === 'highest_amount' ? 'text-[#1E60F3]' : 'text-slate-700'
                      }`}
                    >
                      금액높은순
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOption('lowest_amount');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 ${
                        sortOption === 'lowest_amount' ? 'text-[#1E60F3]' : 'text-slate-700'
                      }`}
                    >
                      금액낮은순
                    </button>
                  </div>
                  <div className="py-1 bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => {
                        setViewScope('all');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 ${
                        viewScope === 'all' ? 'text-[#1E60F3]' : 'text-slate-600'
                      }`}
                    >
                      전체 내역 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewScope('selected_date');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 ${
                        viewScope === 'selected_date' ? 'text-[#1E60F3]' : 'text-slate-600'
                      }`}
                    >
                      선택일만 보기
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {displayedItems.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto">
                <Store className="w-6 h-6 stroke-[1.8]" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">등록된 지출 내역이 없습니다.</p>
                <p className="text-xs text-slate-400">
                  영수증 사진을 올리거나 아래 버튼을 눌러 직접 등록해 보세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setEditingItem(null);
                  setUploadedReceiptUrl(undefined);
                  setIsAddModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-[#1E60F3] font-bold text-xs rounded-xl border border-blue-200/80 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.2]" />
                <span>지출 직접 등록하기</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedItems.map((item) => {
                const catMeta = EXPENSE_CATEGORIES[item.category] || EXPENSE_CATEGORIES.other;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      haptics.lightTap();
                      setEditingItem(item);
                      setIsAddModalOpen(true);
                    }}
                    className="bg-white border border-[#E9EFF7] hover:border-blue-200 rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center justify-between gap-3 cursor-pointer group active:scale-99 transition-all"
                  >
                    {/* Left: Category Icon Badge */}
                    <div
                      className={`w-11 h-11 rounded-full ${catMeta.badgeBg} ${catMeta.badgeTextColor} border ${catMeta.badgeBorder} flex items-center justify-center shrink-0 shadow-2xs`}
                    >
                      {renderCategoryIcon(catMeta.iconName, 'w-5 h-5')}
                    </div>

                    {/* Middle: Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {catMeta.label}
                        </span>
                        {item.receiptUrl && (
                          <span className="text-[10px] bg-sky-50 text-sky-600 px-1.5 py-0.2 rounded border border-sky-100 font-semibold">
                            영수증
                          </span>
                        )}
                        {item.hqStatus ? (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${
                              item.hqStatus === '승인 완료'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : item.hqStatus === '검수 대기'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : item.hqStatus === '금액 확인'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {item.hqStatus === '검수 대기'
                              ? '본사 검수 대기'
                              : item.hqStatus === '승인 완료'
                              ? '본사 승인 완료'
                              : item.hqStatus}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded font-medium border border-slate-200">
                            미전송
                          </span>
                        )}
                      </div>

                      {/* Date & Time */}
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5 truncate">
                        <CalendarIcon className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{formatExpenseItemDateTime(item.date, item.time)}</span>
                      </div>

                      {/* Location / Merchant */}
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{item.merchant}</span>
                      </div>
                    </div>

                    {/* Right: Amount & Delete Button */}
                    <div className="text-right shrink-0 flex flex-col items-end justify-between h-12">
                      <div className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                        {formatKRW(item.amount)}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          haptics.lightTap();
                          setDeletingItemId(item.id);
                        }}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label="삭제"
                        title="삭제하기"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Sticky Bottom Submission Bar */}
      <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-white shrink-0">
        <button
          type="button"
          onClick={handleSubmitAllToHq}
          disabled={isSubmittingToHq || displayedItems.length === 0}
          className="w-full py-3.5 bg-[#1E60F3] hover:bg-blue-600 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm sm:text-base shadow-[0_4px_16px_rgba(30,96,243,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmittingToHq ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>본사 대시보드로 전송 중...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>
                {displayedItems.length > 0
                  ? `본사(HQ) 대시보드로 경비 제출하기 (${displayedItems.length}건 · ${formatKRW(totalAmount)})`
                  : '본사(HQ) 대시보드로 경비 제출하기'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Floating Success Toast */}
      {hqSubmitSuccessToast && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-60 bg-slate-900/95 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{hqSubmitSuccessToast}</span>
        </div>
      )}
      </div>

      {/* Add / Edit Expense Modal (Right Screen) */}
      <AddExpenseModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingItem(null);
          setUploadedReceiptUrl(undefined);
        }}
        onSave={handleSaveExpense}
        editingItem={editingItem}
        initialPhotoUrl={uploadedReceiptUrl}
        defaultDate={selectedDate}
      />

      {/* Date Picker Modal */}
      {isDatePickerOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="absolute inset-0" onClick={() => setIsDatePickerOpen(false)} />
          <div
            className="relative w-full max-w-xs bg-white rounded-2xl shadow-2xl p-5 z-10 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">조회 날짜 선택</h3>
              <button
                type="button"
                onClick={() => setIsDatePickerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setIsDatePickerOpen(false);
                }
              }}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
            />
          </div>
        </div>
      )}

      {/* Category Breakdown Modal */}
      {isBreakdownOpen && (
        <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150">
          <div className="absolute inset-0" onClick={() => setIsBreakdownOpen(false)} />
          <div
            className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 z-10 max-h-[80vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-[#1E60F3]" />
                <h3 className="text-base font-bold text-slate-900">지출 항목별 분석</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBreakdownOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {(Object.keys(EXPENSE_CATEGORIES) as (keyof typeof EXPENSE_CATEGORIES)[]).map((catKey) => {
                const catMeta = EXPENSE_CATEGORIES[catKey];
                const catItems = displayedItems.filter((i) => i.category === catKey);
                const catSum = calculateTotalExpense(catItems);
                if (catSum === 0) return null;
                const percent = Math.round((catSum / (totalAmount || 1)) * 100);

                return (
                  <div
                    key={catKey}
                    className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-full ${catMeta.badgeBg} ${catMeta.badgeTextColor} border ${catMeta.badgeBorder} flex items-center justify-center`}
                      >
                        {renderCategoryIcon(catMeta.iconName, 'w-4 h-4')}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">{catMeta.label}</div>
                        <div className="text-[10px] text-slate-400">{catItems.length}건 ({percent}%)</div>
                      </div>
                    </div>
                    <div className="text-xs font-extrabold text-slate-900">
                      {formatKRW(catSum)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-600">총 합계</span>
              <span className="text-sm font-black text-[#1E60F3]">{formatKRW(totalAmount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingItemId && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div
            className="w-full max-w-xs bg-white rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-1.5">
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 text-red-500 flex items-center justify-center mx-auto">
                <Trash2 className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">지출 내역 삭제</h4>
              <p className="text-xs text-slate-500">
                선택하신 지출 내역을 삭제하시겠습니까? 삭제된 내역은 복구할 수 없습니다.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeletingItemId(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-colors"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-60 bg-slate-900/90 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg backdrop-blur-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return <ExpenseModalContent onClose={onClose} />;
};
