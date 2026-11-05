'use client';

import React, { useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronLeft } from 'lucide-react';
import { HqEmailExtractedDraft, HqEmailSummary } from '@/types/emailHq';

interface HqStep4BookingConfirmedViewProps {
  emailSummary: HqEmailSummary;
  extractedDraft: HqEmailExtractedDraft;
  onProceedToAssignment: () => void;
  onBackToReview: () => void;
}

export const HqStep4BookingConfirmedView: React.FC<HqStep4BookingConfirmedViewProps> = ({
  emailSummary,
  extractedDraft,
  onProceedToAssignment,
  onBackToReview,
}) => {
  const [checkImageFailed, setCheckImageFailed] = useState(false);
  const dates = Array.from(
    new Set((extractedDraft.waypoints || []).map((wp) => wp.date?.trim()).filter((d): d is string => Boolean(d)))
  );
  const firstDate = dates[0] || extractedDraft.pickupDate;
  const lastDate = dates[dates.length - 1];
  const dateLabel = dates.length > 1
    ? `${firstDate} ~ ${lastDate} · ${dates.length}일`
    : firstDate || '날짜 미지정';
  const routeLabel = [extractedDraft.pickupLocation, extractedDraft.dropoffLocation]
    .filter(Boolean)
    .join(' → ') || '경로 미지정';

  return (
    <section
      aria-labelledby="booking-confirmed-title"
      className="rounded-2xl bg-white px-5 py-10 sm:px-10 sm:py-14"
    >
      <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
        {checkImageFailed ? (
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-slate-50">
            <CheckCircle2 className="h-20 w-20 text-[#1E60F3]" strokeWidth={1.6} aria-hidden="true" />
          </div>
        ) : (
          <img
            src="/images/icons/common/icon_check.png"
            alt=""
            width={128}
            height={128}
            className="h-32 w-32 object-contain"
            onError={() => setCheckImageFailed(true)}
          />
        )}

        <h2
          id="booking-confirmed-title"
          className="mt-3 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]"
        >
          예약 확정!
        </h2>
        <p className="mt-2 text-sm font-normal leading-relaxed text-slate-500">
          예약 내용을 확인했습니다. 이제 기사님을 배정할 수 있어요.
        </p>

        <div className="mt-8 w-full rounded-2xl bg-slate-50/70 px-5 py-5 text-left sm:px-6">
          <h3 className="mb-4 text-xs font-semibold text-slate-800">예약 정보</h3>
          <dl className="space-y-3.5 text-[13px]">
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500">고객사</dt>
              <dd className="min-w-0 text-right font-medium text-slate-800">
                {extractedDraft.companyName || emailSummary.from.name || '미지정'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500">운행 기간</dt>
              <dd className="min-w-0 text-right font-medium text-slate-800">{dateLabel}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500">운행 경로</dt>
              <dd className="min-w-0 text-right font-medium leading-relaxed text-slate-800">{routeLabel}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500">요청 차량</dt>
              <dd className="min-w-0 text-right font-medium text-slate-800">
                {extractedDraft.requestedVehicleClass || '미지정'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500">탑승 인원</dt>
              <dd className="min-w-0 text-right font-medium text-slate-800">
                {extractedDraft.passengerCount}명
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 w-full">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            기사님을 배정하시겠습니까?
          </h3>
          <p className="mt-1.5 text-xs text-slate-500">
            다음 단계에서 차량과 기사님을 선택할 수 있습니다.
          </p>

          <button
            type="button"
            onClick={onProceedToAssignment}
            className="cockpit-assignment-next group mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E60F3] px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#1855DB] active:bg-[#164AC1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E60F3]"
          >
            <span>기사님 배정하기</span>
            <ArrowRight className="cockpit-assignment-arrow h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onBackToReview}
            className="mt-4 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            예약 내용 다시 보기
          </button>
        </div>
      </div>
      <style>{`
        @keyframes cockpit-assignment-arrow-nudge {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(6px); }
        }
        .cockpit-assignment-next:hover .cockpit-assignment-arrow {
          animation: cockpit-assignment-arrow-nudge 800ms ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cockpit-assignment-next:hover .cockpit-assignment-arrow { animation: none; }
        }
      `}</style>
    </section>
  );
};
