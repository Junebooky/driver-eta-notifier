'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Receipt,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  CreditCard,
  Image as ImageIcon,
} from 'lucide-react';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { HqExpenseStatus } from '@/types/expenseHq';
import {
  subscribeHqExpenses,
  getHqExpensesSnapshot,
  getHqExpensesServerSnapshot,
} from '@/utils/expenseHqStorage';
import { EXPENSE_CATEGORIES } from '@/utils/expense';
import { haptics } from '@/utils/haptics';
import { HqBadge, HqButton, HqCard } from '@/components/hq/ui';
import { HqModal } from '@/components/hq/ui/HqModal';

export interface HqLogExpenseDetailModalProps {
  log: HqDrivingLog;
  onClose: () => void;
}

const renderStatusBadge = (status: HqExpenseStatus) => {
  switch (status) {
    case '승인 완료':
      return (
        <HqBadge tone="selected">
          <CheckCircle2 className="size-3" />
          승인 완료
        </HqBadge>
      );
    case '검수 대기':
      return (
        <HqBadge tone="warning">
          <Clock className="size-3" />
          검수 대기
        </HqBadge>
      );
    case '금액 확인':
      return (
        <HqBadge tone="warning">
          <AlertTriangle className="size-3" />
          금액 확인
        </HqBadge>
      );
    case '반려':
      return (
        <HqBadge tone="critical">
          <XCircle className="size-3" />
          반려
        </HqBadge>
      );
    default:
      return <HqBadge tone="neutral">{status}</HqBadge>;
  }
};

export const HqLogExpenseDetailModal: React.FC<HqLogExpenseDetailModalProps> = ({
  log,
  onClose,
}) => {
  const allExpenses = useSyncExternalStore(
    subscribeHqExpenses,
    getHqExpensesSnapshot,
    getHqExpensesServerSnapshot
  );

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const matchingExpenses = useMemo(() => {
    return allExpenses.filter((e) => {
      if (e.drivingLogId && e.drivingLogId === log.id) return true;
      if (log.bookingId && e.bookingId && e.bookingId === log.bookingId) return true;
      const logRawDate = log.rawDate || log.drivingDate;
      if (e.driverName === log.driverName && (e.rawDate === logRawDate || e.rawDate === log.drivingDate)) {
        return true;
      }
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

  const handleClose = () => {
    haptics.lightTap();
    onClose();
  };

  return (
    <>
      <HqModal
        isOpen
        onClose={handleClose}
        icon={
          <img
            src="/images/icons/driver_ui/icon_expense.png"
            alt=""
            aria-hidden="true"
            className="size-10 shrink-0 select-none object-contain"
            draggable={false}
          />
        }
        title="운행 경비 지출 상세"
        subtitle={`${log.driverName} 기사 · ${log.drivingDate} · ${log.vehiclePlate || log.vehicleModel}`}
        className="max-w-2xl"
        footer={
          <HqButton variant="subtle" onClick={handleClose}>
            닫기
          </HqButton>
        }
      >
        <div className="space-y-4">
          <HqCard className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <div>
              <p className="text-[12px] font-medium text-[#73839D]">총 경비</p>
              <p className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-[#17233B] tabular-nums">
                {totalAmount.toLocaleString()}원
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <HqBadge tone="neutral">전체 {matchingExpenses.length}건</HqBadge>
              <HqBadge tone="selected">승인 {approvedCount}건</HqBadge>
              <HqBadge tone="warning">검수 {pendingCount}건</HqBadge>
            </div>
          </HqCard>

          {matchingExpenses.length === 0 ? (
            <HqCard className="py-12 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-[15px] bg-[#F6F8FA] text-[#73839D]">
                <Receipt className="size-5" />
              </div>
              <p className="text-[14px] font-semibold text-[#17233B]">연결된 경비 지출 내역이 없습니다.</p>
            </HqCard>
          ) : (
            <HqCard className="divide-y divide-[#F0F3F6] overflow-hidden p-0">
              {matchingExpenses.map((exp) => {
                const catMeta = (EXPENSE_CATEGORIES as any)[exp.category] || {
                  label: exp.categoryLabel || '기타',
                };

                return (
                  <div key={exp.id} className="flex items-start justify-between gap-3 p-4 sm:px-5">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <HqBadge tone="neutral">{catMeta.label}</HqBadge>
                        {renderStatusBadge(exp.status)}
                        <span className="text-[11px] font-medium text-[#8492A4] tabular-nums">
                          {exp.submittedAt || `${exp.rawDate} ${exp.time}`}
                        </span>
                      </div>

                      <div>
                        <h4 className="truncate text-[14px] font-semibold leading-snug text-[#17233B]">
                          {exp.merchant || '상호 미기재'}
                        </h4>
                        {exp.address && (
                          <p className="mt-0.5 truncate text-[12px] text-[#73839D]">{exp.address}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[12px] text-[#60728C]">
                        <span className="inline-flex items-center gap-1">
                          <CreditCard className="size-3.5 text-[#8492A4]" />
                          {exp.paymentMethodLabel || '회사 카드'}
                        </span>
                        {exp.memo && (
                          <span className="max-w-[280px] truncate text-[#73839D]">
                            {exp.memo}
                          </span>
                        )}
                      </div>

                      {exp.ocrSummary && (
                        <p className="rounded-[12px] bg-[#FAFBFD] px-3 py-2 text-[12px] text-[#60728C]">
                          {exp.ocrSummary}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-[15px] font-semibold tracking-[-0.02em] text-[#17233B] tabular-nums">
                        {exp.amount.toLocaleString()}원
                      </span>

                      {(exp.receiptUrl || exp.hasReceiptImage) && (
                        <HqButton
                          variant="subtle"
                          size="sm"
                          onClick={() => handleOpenReceipt(exp.receiptUrl || '/images/receipt_sample_cu.jpg')}
                        >
                          <ImageIcon className="size-3.5 text-[#1E60F3]" />
                          영수증 보기
                        </HqButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </HqCard>
          )}
        </div>
      </HqModal>

      <HqModal
        isOpen={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title="영수증 원본 사진"
        className="max-w-xl"
        footer={
          <HqButton variant="subtle" onClick={() => setPreviewImage(null)}>
            닫기
          </HqButton>
        }
      >
        {previewImage && (
          <div className="flex items-center justify-center rounded-[16px] bg-white p-2">
            <img
              src={previewImage}
              alt="영수증 원본 사진"
              className="mx-auto max-h-[70dvh] w-auto rounded-[12px] object-contain"
            />
          </div>
        )}
      </HqModal>
    </>
  );
};

