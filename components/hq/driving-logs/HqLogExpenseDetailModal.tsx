'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  X,
  Receipt,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  CreditCard,
  Building,
  Image as ImageIcon,
  ZoomIn,
} from 'lucide-react';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { HqExpenseRecord, HqExpenseStatus } from '@/types/expenseHq';
import {
  subscribeHqExpenses,
  getHqExpensesSnapshot,
  getHqExpensesServerSnapshot,
} from '@/utils/expenseHqStorage';
import { EXPENSE_CATEGORIES } from '@/utils/expense';
import { haptics } from '@/utils/haptics';

export interface HqLogExpenseDetailModalProps {
  log: HqDrivingLog;
  onClose: () => void;
  onNavigateToExpenses?: () => void;
}

const renderStatusBadge = (status: HqExpenseStatus) => {
  switch (status) {
    case '승인 완료':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          승인 완료
        </span>
      );
    case '검수 대기':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <Clock className="w-3 h-3 text-blue-600" />
          검수 대기
        </span>
      );
    case '금액 확인':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          금액 확인
        </span>
      );
    case '반려':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="w-3 h-3 text-rose-600" />
          반려됨
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
          {status}
        </span>
      );
  }
};

export const HqLogExpenseDetailModal: React.FC<HqLogExpenseDetailModalProps> = ({
  log,
  onClose,
  onNavigateToExpenses,
}) => {
  const allExpenses = useSyncExternalStore(
    subscribeHqExpenses,
    getHqExpensesSnapshot,
    getHqExpensesServerSnapshot
  );

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Filter expenses strictly belonging or correlated to this driving log
  const matchingExpenses = useMemo(() => {
    return allExpenses.filter((e) => {
      // 1. Direct FK match
      if (e.drivingLogId && e.drivingLogId === log.id) return true;
      // 2. Schedule Booking ID match
      if (log.bookingId && e.bookingId && e.bookingId === log.bookingId) return true;
      // 3. Driver Name and Date match
      const logRawDate = log.rawDate || log.drivingDate;
      if (e.driverName === log.driverName && (e.rawDate === logRawDate || e.rawDate === log.drivingDate)) {
        return true;
      }
      // 4. Vehicle Plate and Date match
      if (log.vehiclePlate && e.vehiclePlate === log.vehiclePlate && e.rawDate === logRawDate) {
        return true;
      }
      return false;
    });
  }, [allExpenses, log]);

  const totalAmount = useMemo(() => {
    return matchingExpenses
      .filter((e) => e.status !== '반려')
      .reduce((sum, e) => sum + e.amount, 0);
  }, [matchingExpenses]);

  const approvedCount = useMemo(() => {
    return matchingExpenses.filter((e) => e.status === '승인 완료').length;
  }, [matchingExpenses]);

  const pendingCount = useMemo(() => {
    return matchingExpenses.filter((e) => e.status === '검수 대기').length;
  }, [matchingExpenses]);

  const handleOpenReceipt = (url: string) => {
    haptics.selection();
    setPreviewImage(url);
  };

  const handleGoToExpensesTab = () => {
    haptics.selection();
    onClose();
    if (onNavigateToExpenses) {
      onNavigateToExpenses();
    } else {
      window.location.assign('/hq?tab=expenses');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-100/80 text-[#1E60F3] flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>운행 경비 지출 상세</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#1E60F3] border border-blue-200/60">
                  {matchingExpenses.length}건
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                {log.driverName} 기사 · {log.drivingDate} 운행 · {log.vehiclePlate || log.vehicleModel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full hover:bg-slate-200/80 text-slate-400 hover:text-slate-600 flex items-center justify-center transition cursor-pointer"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Metric Ribbon */}
        <div className="px-5 sm:px-6 py-3.5 bg-gradient-to-r from-blue-50/80 via-slate-50 to-indigo-50/50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div>
            <div className="text-[11px] text-slate-500 font-semibold">총 승인/검수 대상 경비</div>
            <div className="text-xl font-black text-[#1E60F3] tracking-tight">
              {totalAmount.toLocaleString()}원
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="px-2.5 py-1 rounded-xl bg-white/90 border border-slate-200/80 text-slate-700 font-medium">
              승인 완료 <strong className="text-emerald-700 font-bold ml-1">{approvedCount}건</strong>
            </div>
            <div className="px-2.5 py-1 rounded-xl bg-white/90 border border-slate-200/80 text-slate-700 font-medium">
              검수 대기 <strong className="text-blue-700 font-bold ml-1">{pendingCount}건</strong>
            </div>
          </div>
        </div>

        {/* Expense List Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 divide-y divide-slate-100">
          {matchingExpenses.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-2.5">
                <Receipt className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">연결된 경비 지출 내역이 없습니다.</p>
              <p className="text-xs text-slate-400 mt-1">
                기사님이 제출한 경비가 없거나 날짜·예약 매칭 전 상태입니다.
              </p>
            </div>
          ) : (
            matchingExpenses.map((exp) => {
              const catMeta = (EXPENSE_CATEGORIES as any)[exp.category] || {
                label: exp.categoryLabel || '기타',
                badgeBg: 'bg-slate-100',
                badgeTextColor: 'text-slate-700',
                badgeBorder: 'border-slate-200',
              };

              return (
                <div key={exp.id} className="pt-3.5 first:pt-0 flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${catMeta.badgeBg} ${catMeta.badgeTextColor} ${catMeta.badgeBorder}`}
                      >
                        {catMeta.label}
                      </span>
                      {renderStatusBadge(exp.status)}
                      <span className="text-[11px] text-slate-400 font-medium">
                        {exp.submittedAt || `${exp.rawDate} ${exp.time}`}
                      </span>
                    </div>

                    {/* Merchant & Address */}
                    <div>
                      <h4 className="text-sm font-black text-slate-900 leading-snug truncate">
                        {exp.merchant || '상호 미기재'}
                      </h4>
                      {exp.address && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{exp.address}</p>
                      )}
                    </div>

                    {/* Payment info & memo */}
                    <div className="flex items-center gap-3 text-xs text-slate-600 font-medium flex-wrap pt-0.5">
                      <div className="flex items-center gap-1 text-slate-500">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                        <span>{exp.paymentMethodLabel || '회사 카드'}</span>
                      </div>
                      {exp.memo && (
                        <div className="text-slate-500 truncate max-w-[280px]">
                          메모: <span className="text-slate-700 font-normal">{exp.memo}</span>
                        </div>
                      )}
                    </div>

                    {/* OCR Summary if available */}
                    {exp.ocrSummary && (
                      <div className="mt-1 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/60 text-[11px] text-slate-600 font-medium">
                        💡 {exp.ocrSummary}
                      </div>
                    )}
                  </div>

                  {/* Right side: Amount and receipt preview */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-base font-black text-slate-900 font-mono tracking-tight">
                      {exp.amount.toLocaleString()}원
                    </span>

                    {exp.receiptUrl || exp.hasReceiptImage ? (
                      <button
                        type="button"
                        onClick={() => handleOpenReceipt(exp.receiptUrl || '/images/receipt_sample_cu.jpg')}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-bold transition cursor-pointer"
                        title="영수증 원본 사진 보기"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-[#1E60F3]" />
                        <span>영수증 보기</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">영수증 없음</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleGoToExpensesTab}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E60F3] text-xs font-bold transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>경비 관리 탭에서 전체 확인</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-bold transition cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>

      {/* Lightbox Receipt Image Zoom Modal */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-xl max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center cursor-pointer transition"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewImage}
              alt="영수증 원본 사진"
              className="max-h-[80vh] w-auto mx-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

