'use client';

import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft } from 'lucide-react';
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
  const dailyRoutes = (extractedDraft.waypoints || []).reduce<
    Array<{ date: string; first: string; last: string; count: number }>
  >((days, waypoint) => {
    const date = waypoint.date?.trim() || extractedDraft.pickupDate || '날짜 미지정';
    const location = waypoint.location?.trim() || '장소 미지정';
    const current = days.find((day) => day.date === date);
    if (current) {
      current.last = location;
      current.count += 1;
    } else {
      days.push({ date, first: location, last: location, count: 1 });
    }
    return days;
  }, []).sort((left, right) => left.date.localeCompare(right.date));

  const routeLabel = [extractedDraft.pickupLocation, extractedDraft.dropoffLocation]
    .filter(Boolean).join(' → ') || '경로 미지정';

  return (
    <section
      aria-labelledby="booking-confirmed-title"
      className="rounded-[32px] bg-white px-5 py-10 sm:px-10 sm:py-14 border border-slate-100 shadow-sm"
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
          className="mt-4 text-[26px] sm:text-[30px] font-black tracking-tight text-slate-900"
        >
          예약 확정!
        </h2>
        <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-400">
          예약 내용을 확인했습니다. 배차 등록은 다음 단계에서 진행됩니다.
        </p>

        <div className="mt-8 w-full rounded-[28px] bg-slate-50/70 border border-slate-100 p-6 sm:p-7 text-left shadow-xs">
          <h3 className="mb-4 text-sm font-bold text-slate-900">예약 정보</h3>
          <dl className="space-y-3.5 text-xs">
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-400 font-medium">고객사</dt>
              <dd className="min-w-0 text-right font-bold text-slate-900">
                {extractedDraft.companyName || emailSummary.from.name || '미지정'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-400 font-medium">운행 기간</dt>
              <dd className="min-w-0 text-right font-bold text-slate-900">{dateLabel}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-400 font-medium">운행 경로</dt>
              <dd className="min-w-0 flex-1 text-right font-bold leading-relaxed text-slate-900">
                {dailyRoutes.length > 1 ? (
                  <div className="space-y-2">
                    {dailyRoutes.map((day) => (
                      <div key={day.date} className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium text-slate-400">
                          {day.date} · {day.count}곳
                        </span>
                        <span>{day.first} → {day.last}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span>{dailyRoutes.length === 1
                    ? `${dailyRoutes[0].first} → ${dailyRoutes[0].last}`
                    : routeLabel}</span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-400 font-medium">요청 차량</dt>
              <dd className="min-w-0 text-right font-bold text-slate-900">
                {extractedDraft.requestedVehicleClass || '미지정'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-400 font-medium">탑승 인원</dt>
              <dd className="min-w-0 text-right font-bold text-slate-900">
                {extractedDraft.passengerCount}명
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 w-full">
          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            기사님을 배정하시겠습니까?
          </h3>
          <p className="mt-1.5 text-xs font-medium text-slate-400">
            다음 단계에서 차량과 기사님을 선택할 수 있습니다.
          </p>

          <button
            type="button"
            onClick={onProceedToAssignment}
            className="cockpit-assignment-next group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1E60F3] px-5 py-4 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-600 active:scale-98 cursor-pointer"
          >
            <span>기사님 배정하기</span>
            <ArrowRight className="cockpit-assignment-arrow h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onBackToReview}
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-slate-400 transition-colors hover:text-slate-600 cursor-pointer"
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
