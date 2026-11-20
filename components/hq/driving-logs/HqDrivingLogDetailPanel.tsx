'use client';

import React, { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MapPin,
  Car,
  Receipt,
  History,
  Check,
  Edit3,
  X,
} from 'lucide-react';
import { HqDrivingLog } from '@/types/drivingLogHq';
import { haptics } from '@/utils/haptics';
import { HqBadge, HqButton, HqCard, HqSectionTitle, HqTextarea } from '@/components/hq/ui';
import { HqModal } from '@/components/hq/ui/HqModal';

export interface HqDrivingLogDetailPanelProps {
  log: HqDrivingLog | null;
  onApprove: (logId: string) => void;
  onRequestRevision: (logId: string, reason: string) => void;
  onReject: (logId: string, reason: string) => void;
  onClose?: () => void;
  isModal?: boolean;
}

const renderLogStatusBadge = (status: HqDrivingLog['status']) => {
  switch (status) {
    case 'draft':
      return (
        <HqBadge tone="warning">
          <Clock className="size-3" />
          진행 중 (초안)
        </HqBadge>
      );
    case '검토 대기':
      return (
        <HqBadge tone="warning">
          <Clock className="size-3" />
          검토 대기
        </HqBadge>
      );
    case '검토 중':
      return (
        <HqBadge tone="neutral">
          <Clock className="size-3" />
          검토 중
        </HqBadge>
      );
    case '승인 완료':
      return (
        <HqBadge tone="selected">
          <CheckCircle2 className="size-3" />
          승인 완료
        </HqBadge>
      );
    case '보완 필요':
      return (
        <HqBadge tone="critical">
          <AlertTriangle className="size-3" />
          보완 필요
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

export const HqDrivingLogDetailPanel: React.FC<HqDrivingLogDetailPanelProps> = ({
  log,
  onApprove,
  onRequestRevision,
  onReject,
  onClose,
  isModal = false,
}) => {
  const [modalAction, setModalAction] = useState<'revision' | 'reject' | null>(null);
  const [reasonText, setReasonText] = useState('');

  if (!log) {
    if (isModal) return null;
    return (
      <HqCard className="space-y-2 p-8 text-center text-[#73839D] shadow-[0_6px_20px_rgba(35,49,78,0.055)]">
        <FileText className="mx-auto size-8 text-slate-300" />
        <p className="text-sm font-semibold">선택된 운행일지가 없습니다.</p>
        <p className="text-xs text-slate-400">목록에서 확인하고자 하는 운행일지를 클릭해주세요.</p>
      </HqCard>
    );
  }

  const handleConfirmAction = () => {
    if (!modalAction) return;
    haptics.success();

    if (modalAction === 'revision') {
      onRequestRevision(log.id, reasonText.trim() || '추가 확인이 필요하여 보완 요청을 보냈습니다.');
    } else if (modalAction === 'reject') {
      onReject(log.id, reasonText.trim() || '사유 미기재 반려');
    }

    setModalAction(null);
    setReasonText('');
  };

  const handleCloseModal = () => {
    haptics.lightTap();
    onClose?.();
  };

  const statusBadge = renderLogStatusBadge(log.status);
  const subtitle = `${log.submittedDate || log.drivingDate} · ${log.driverName} 기사 · No. ${log.no}`;

  const body = (
    <div className="space-y-4">
      {/* 1. 운행 요약 */}
      <HqCard className="space-y-3 p-4 sm:p-5">
        <HqSectionTitle>
          <FileText className="size-4 text-[#1E60F3]" />
          운행 요약
        </HqSectionTitle>

        <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[12px] font-medium text-[#73839D]">운행일</span>
              <span className="font-semibold text-[#17233B] tabular-nums">{log.submittedDate || log.drivingDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[12px] font-medium text-[#73839D]">제출일</span>
              <span className="font-medium text-[#4D607C] tabular-nums">{log.submittedAt}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[12px] font-medium text-[#73839D]">기사명</span>
              <span className="font-semibold text-[#17233B]">{log.driverName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[12px] font-medium text-[#73839D]">고객명</span>
              <span className="font-semibold text-[#17233B]">{log.customerName}</span>
            </div>
            {log.passengerName && (
              <div className="flex items-start gap-2">
                <span className="w-12 shrink-0 text-[12px] font-medium text-[#73839D]">승객명</span>
                <span className="min-w-0 break-words font-medium text-[#17233B]">
                  {log.passengerName}{log.passengerCount ? ` · ${log.passengerCount}명` : ''}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[12px] font-medium text-[#73839D]">차량</span>
              <span className="truncate font-medium text-[#4D607C]" title={`${log.vehicleModel} (${log.vehiclePlate})`}>
                {log.vehicleModel} ({log.vehiclePlate})
              </span>
            </div>
          </div>
        </div>
      </HqCard>

      {/* 2. 운행 경로 */}
      <HqCard className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <HqSectionTitle>
            <MapPin className="size-4 text-[#1E60F3]" />
            운행 경로
            <span className="text-[#1E60F3] tabular-nums">({log.stops.length}건)</span>
          </HqSectionTitle>
        </div>

        {log.stops.length === 0 ? (
          <p className="rounded-[14px] bg-[#FAFBFD] py-5 text-center text-[12px] text-[#8492A4]">
            등록된 운행 경로 일정이 없습니다.
          </p>
        ) : (
          <div className="relative flex flex-col pt-1">
            {log.stops.map((stop, index) => {
              const isFirst = index === 0;
              const isLast = index === log.stops.length - 1;

              return (
                <div
                  key={stop.id || index}
                  className="group relative flex items-start gap-2.5 text-[13px]"
                >
                  <div className="relative flex min-h-[34px] w-5 shrink-0 justify-center self-stretch">
                    <div
                      className={`pointer-events-none absolute left-1/2 w-[2px] -translate-x-1/2 bg-[#60A5FA] ${
                        isFirst
                          ? 'top-2 bottom-0'
                          : isLast
                            ? 'top-0 h-2'
                            : 'top-0 bottom-0'
                      }`}
                    />
                    <div className="relative z-10 mt-0.5 flex items-center justify-center">
                      {isFirst || isLast ? (
                        <div className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-blue-100 ring-2 ring-white">
                          <div className="size-2 rounded-full bg-[#1E60F3]" />
                        </div>
                      ) : (
                        <div className="size-2.5 shrink-0 rounded-full border-2 border-[#1E60F3] bg-white ring-2 ring-white" />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-baseline gap-2.5">
                        <span className="min-w-11 shrink-0 font-semibold text-[#17233B] tabular-nums">
                          {stop.time || (stop.departureTime ? `출발 ${stop.departureTime}` : '-')}
                        </span>
                        <span className="truncate font-medium text-[#17233B]" title={stop.place}>
                          {stop.place}
                        </span>
                      </div>
                      {stop.note && <HqBadge tone="neutral">{stop.note}</HqBadge>}
                    </div>

                    {stop.address && (
                      <div className="mt-0.5 truncate pl-13.5 text-[11px] text-[#8492A4]">
                        {stop.address}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </HqCard>

      {/* 3. 주행 거리 & 경비지출 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HqCard className="space-y-3 p-4">
          <HqSectionTitle>
            <Car className="size-4 text-[#1E60F3]" />
            주행 거리 정보
          </HqSectionTitle>

          <div className="grid grid-cols-3 gap-1 pt-0.5 text-center">
            <div>
              <div className="text-[11px] font-medium text-[#73839D]">시작 km</div>
              <div className="mt-0.5 text-[13px] font-semibold text-[#17233B] tabular-nums">{log.startKm}</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#73839D]">종료 km</div>
              <div className="mt-0.5 text-[13px] font-semibold text-[#17233B] tabular-nums">{log.endKm}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#1E60F3]">운행합</div>
              <div className="mt-0.5 text-[13px] font-bold text-[#1E60F3] tabular-nums">{log.distanceKm}</div>
            </div>
          </div>
        </HqCard>

        <HqCard className="space-y-3 p-4">
          <HqSectionTitle>
            <Receipt className="size-4 text-[#1E60F3]" />
            경비지출 정보
          </HqSectionTitle>

          <div className="grid grid-cols-2 gap-1 pt-0.5 text-center">
            <div>
              <div className="text-[11px] font-medium text-[#73839D]">지출 건수</div>
              <div className="mt-0.5 text-[13px] font-semibold text-[#17233B] tabular-nums">
                {log.expenseCount || (log.expenseAmount > 0 ? 1 : 0)}건
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-[#73839D]">지출 합계</div>
              <div className="mt-0.5 text-[13px] font-bold text-[#1E60F3] tabular-nums">
                {log.expenseAmount > 0 ? `${log.expenseAmount.toLocaleString()}원` : '0원'}
              </div>
            </div>
          </div>
        </HqCard>
      </div>

      {/* 4. 특이사항 */}
      <HqCard className="space-y-2.5 p-4 sm:p-5">
        <HqSectionTitle>
          <FileText className="size-4 text-[#1E60F3]" />
          특이사항
        </HqSectionTitle>
        <div className="min-h-[56px] whitespace-pre-line rounded-[14px] bg-[#FAFBFD] p-3 text-[13px] leading-relaxed text-[#4D607C]">
          {log.notes || '기재된 특이사항이 없습니다.'}
        </div>
      </HqCard>

      {/* 5. 검토 액션 (승인 / 보완 요청 / 반려) */}
      <div className="grid grid-cols-3 gap-2">
        <HqButton
          variant="primary"
          onClick={() => {
            haptics.success();
            onApprove(log.id);
          }}
        >
          <Check className="size-4" />
          승인
        </HqButton>

        <HqButton
          variant="secondary"
          onClick={() => {
            haptics.lightTap();
            setModalAction('revision');
            setReasonText('');
          }}
        >
          <Edit3 className="size-4" />
          보완 요청
        </HqButton>

        <HqButton
          variant="danger"
          onClick={() => {
            haptics.lightTap();
            setModalAction('reject');
            setReasonText('');
          }}
        >
          <X className="size-4" />
          반려
        </HqButton>
      </div>

      {/* 6. 최근 검토 이력 */}
      {log.reviewHistory.length > 0 && (
        <HqCard className="space-y-2.5 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <HqSectionTitle>
              <History className="size-4 text-[#1E60F3]" />
              최근 검토 이력
            </HqSectionTitle>
            <HqBadge tone="neutral">{log.reviewHistory.length}건</HqBadge>
          </div>

          <div className="space-y-1.5">
            {log.reviewHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-[12px] bg-[#FAFBFD] px-3 py-2 text-[12px] text-[#4D607C]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-1.5 shrink-0 rounded-full bg-[#1E60F3]" />
                  <span className="shrink-0 text-[11px] text-[#8492A4] tabular-nums">{item.time}</span>
                  <span className="truncate">{item.message}</span>
                </div>
                <HqBadge tone="neutral">{item.actor}</HqBadge>
              </div>
            ))}
          </div>
        </HqCard>
      )}
    </div>
  );

  const actionModal = (
    <HqModal
      isOpen={Boolean(modalAction)}
      onClose={() => setModalAction(null)}
      title={modalAction === 'revision' ? '운행일지 보완 요청' : '운행일지 반려 처리'}
      subtitle={
        modalAction === 'revision'
          ? '기사에게 전달할 보완 요청 사유를 입력해주세요.'
          : '운행일지 반려 사유를 입력해주세요.'
      }
      className="max-w-md"
      footer={
        <>
          <HqButton variant="subtle" onClick={() => setModalAction(null)}>
            취소
          </HqButton>
          <HqButton
            variant={modalAction === 'revision' ? 'primary' : 'danger'}
            onClick={handleConfirmAction}
          >
            {modalAction === 'revision' ? '보완 요청 전송' : '반려 확정'}
          </HqButton>
        </>
      }
    >
      <HqTextarea
        rows={3}
        value={reasonText}
        onChange={(e) => setReasonText(e.target.value)}
        placeholder="사유를 상세히 기재해주세요..."
      />
    </HqModal>
  );

  if (isModal) {
    return (
      <>
        <HqModal
          isOpen
          onClose={handleCloseModal}
          icon={
            <img
              src="/images/icons/driving-logs/icon_driving_log.png"
              alt="운행일지"
              className="size-10 shrink-0 select-none object-contain"
              draggable={false}
            />
          }
          title="운행일지 상세 정보"
          subtitle={subtitle}
          headerActions={statusBadge}
          className="max-w-2xl"
          footer={
            <HqButton variant="subtle" onClick={handleCloseModal}>
              닫기
            </HqButton>
          }
        >
          {body}
        </HqModal>
        {actionModal}
      </>
    );
  }

  return (
    <>
      <HqCard className="space-y-5 p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div className="flex items-center gap-3">
            <img
              src="/images/icons/driving-logs/icon_driving_log.png"
              alt="운행일지"
              className="size-10 shrink-0 select-none object-contain"
              draggable={false}
            />
            <div>
              <h3 className="text-[17px] font-bold tracking-[-0.03em] text-[#17233B]">
                운행일지 상세 정보
              </h3>
              <p className="mt-0.5 text-[12px] font-medium text-[#73839D]">{subtitle}</p>
            </div>
          </div>
          {statusBadge}
        </div>
        {body}
      </HqCard>
      {actionModal}
    </>
  );
};
