'use client';

import React from 'react';
import { CalendarDays, Check, GitCompareArrows, Info, MailCheck, ShieldCheck } from 'lucide-react';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import type { ExistingEmailBookingCandidate } from '@/services/emailBookingMatchService';
import { emailRevisionDiff } from '@/utils/emailBookingRevision';

interface Props {
  draft: HqEmailExtractedDraft;
  matches: ExistingEmailBookingCandidate[];
  decision: string | null;
  onSelect: (candidate: ExistingEmailBookingCandidate) => void;
  onNew: () => void;
}

/** Only appears AFTER an explicit AI extraction. Never auto-applies a revision. */
export function HqEmailRevisionMatchPanel({ draft, matches, decision, onSelect, onNew }: Props) {
  if (!matches.length && draft.tripType !== 'modification' && draft.tripType !== 'cancellation') return null;
  const selected = matches.find(m => m.scheduleId === decision);
  const diffs = selected ? emailRevisionDiff(draft, selected) : [];
  return (
    <section aria-label="기존 예약 확인 및 수정본 비교" className="mb-4 space-y-3 rounded-[24px] bg-white p-4 shadow-[0_6px_22px_rgba(35,49,78,0.055)] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#F3F6FA]">
          <GitCompareArrows className="h-5 w-5 text-[#73839D]" strokeWidth={1.7}/>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-[#17233B]">기존 예약과 대조</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#73839D]">
            고객사·발신자·날짜·예약번호를 코드로 비교했습니다. 후보를 직접 선택해야 기존 예약이 변경됩니다.
          </p>
        </div>
      </div>
      {matches.length ? (
        <div className="space-y-2">
          {matches.map((candidate) => {
            const active = decision === candidate.scheduleId;
            return (
              <button key={candidate.scheduleId} type="button" onClick={() => onSelect(candidate)}
                aria-pressed={active}
                className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E60F3] ${active ? 'bg-[#EEF3FF]' : 'bg-[#F8FAFC] hover:bg-[#F1F4F8]'}`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${active ? 'bg-[#1E60F3] text-white' : 'border border-[#CDD6E2] bg-white'}`}>
                  {active && <Check className="h-3.5 w-3.5" strokeWidth={2}/>}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block break-words text-[13px] font-semibold text-[#17233B]">{candidate.customerName} · {candidate.pickupDate}</span>
                  <span className="block break-words text-[11px] text-[#73839D]">{candidate.pickupTime} {candidate.pickupLocation} → {candidate.destination}</span>
                  <span className="block text-[11px] text-[#95A3B9]">{candidate.bookingNo || '예약번호 없음'} · {candidate.vehiclePlate || '미배정'} · {candidate.driverName || '기사 미배정'}</span>
                  <span className="block text-[11px] text-[#64748B]">{candidate.reasons.join(' · ')}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-[#FAFBFD] p-3 text-xs leading-relaxed text-[#64748B]">
          수정 요청으로 추출됐지만 기존 예약을 특정하지 못했습니다. 이메일 원문과 기존 예약을 확인해 주세요.
        </p>
      )}
      {selected && (
        <div className="rounded-2xl bg-[#FAFBFD] p-3.5 sm:p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[#17233B]">
            <CalendarDays className="h-4 w-4 text-[#7B8BA0]"/> 변경사항 비교
          </div>
          {diffs.length ? (
            <div className="space-y-2.5">
              {diffs.map((diff) => (
                <div key={diff.label} className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-xs sm:grid-cols-[90px_1fr_1fr]">
                  <span className="font-medium text-[#73839D]">{diff.label}</span>
                  <span className="break-words text-[#94A3B8] line-through">{diff.previous || '없음'}</span>
                  <span className="col-start-2 break-words font-semibold text-[#17233B] sm:col-start-3">{diff.proposed || '미확인'}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-[#73839D]">확인된 필드 차이가 없습니다. 원문에 누락된 변경사항이 없는지 살펴보세요.</p>}
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#73839D]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
            수정본은 기존 예약 ID와 배차를 유지합니다. 관리자 최종 승인 전에는 원본 일정이 변경되지 않습니다.
          </p>
        </div>
      )}
      <button type="button" onClick={onNew} aria-pressed={decision === 'new'}
        className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium transition-colors ${decision === 'new' ? 'bg-[#EAF0FF] text-[#1E60F3]' : 'bg-[#F8FAFC] text-[#73839D] hover:bg-[#EFF3F7]'}`}>
        {decision === 'new' ? <Check className="h-3.5 w-3.5"/> : <Info className="h-3.5 w-3.5"/>}
        기존 예약과 관계없는 신규 예약으로 처리
      </button>
      {draft.tripType === 'cancellation' && (
        <p className="text-xs text-[#A16262]">취소 요청은 신규 일정 생성이나 자동 취소로 처리하지 않습니다. 관리자 배차관리에서 기존 예약을 직접 확인해 주세요.</p>
      )}
      {!decision && <p className="text-[11px] text-[#A16262]">기존 예약을 선택하거나 신규 예약임을 명시해야 다음 단계로 진행할 수 있습니다.</p>}
    </section>
  );
}
