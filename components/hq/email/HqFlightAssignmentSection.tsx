'use client';

import React, { useState } from 'react';
import { Plane } from 'lucide-react';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import { emailAssignableFlights, emailFlightAssignmentIssues, emailFlightKey } from '@/utils/emailDispatchPlan';
import { HqBadge, HqButton, HqCard, HqInput } from '@/components/hq/ui';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import { HqFlightInfoHint } from './HqFlightInfoHint';

type Slot = { assignedFlightKeys?: string[]; sharedRouteConfirmed?: boolean };

type Props<T extends Slot> = {
  draft: HqEmailExtractedDraft;
  slots: T[];
  onUpdateSlots?: (slots: T[]) => void;
  onUpdateDraft?: (draft: HqEmailExtractedDraft) => void;
  disabled?: boolean;
};

/** Same explicit assignment control in new and revision workflows. */
export function HqFlightAssignmentSection<T extends Slot>({
  draft, slots, onUpdateSlots, onUpdateDraft, disabled = false,
}: Props<T>) {
  const [editingPassengers, setEditingPassengers] = useState<Record<string, string>>({});
  const flights = emailAssignableFlights(draft);
  if (!flights.length) return null;
  const split = slots.length > 1;
  const issues = split ? emailFlightAssignmentIssues(draft, slots) : [];
  const assign = (key: string, owner: number) => {
    if (disabled || !onUpdateSlots) return;
    // Exactly one vehicle owns a flight. Clicking a different slot transfers it.
    onUpdateSlots(slots.map((slot, index) => ({
      ...slot,
      assignedFlightKeys: index === owner
        ? [...new Set([...(slot.assignedFlightKeys || []), key])]
        : (slot.assignedFlightKeys || []).filter(value => value !== key),
    })));
  };
  return (
    <HqCard className="space-y-3 p-4 sm:p-5" aria-label="항공편별 기사 배정">
      <div className="flex items-start gap-2.5">
        <Plane className="mt-0.5 h-4 w-4 shrink-0 text-[#59708F]" aria-hidden="true" />
        <div className="min-w-0">
          <h4 className="text-[13px] font-bold text-[#17233B]">항공편별 담당 차량 · 승객</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-[#73839D]">
            {split
              ? '각 항공편을 담당할 차량을 선택하세요. 다른 기사에게 승객·항공편이 함께 넘어가지 않습니다.'
              : '현재 한 대의 차량이 아래 항공편을 모두 담당합니다.'}
          </p>
        </div>
      </div>
      <div className="space-y-2.5">
        {flights.map(flight => {
          const key = emailFlightKey(flight);
          const owner = slots.findIndex(slot => (slot.assignedFlightKeys || []).includes(key));
          const passengers = (flight.passengers || []).join(', ');
          return (
            <HqCard key={key} tone="muted" className="space-y-2.5 p-3.5 border border-[#E1E7F0]/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-mono text-[13px] font-bold text-[#17233B]">{flight.flightNumber}</span>
                  <HqFlightInfoHint
                    flightNumber={flight.flightNumber}
                    date={flight.date}
                    role={flight.role}
                    originAirport={flight.originAirport}
                    destinationAirport={flight.destinationAirport}
                    scheduledArrival={flight.scheduledArrival}
                    scheduledDeparture={flight.scheduledDeparture}
                  />
                </div>
                <HqBadge tone="neutral" className="tabular-nums">
                  {flight.date}{flight.scheduledArrival ? ` · 도착 ${flight.scheduledArrival}` : ''}
                </HqBadge>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-[#61728A]">이 항공편 승객</span>
                <HqInput
                  type="text"
                  value={editingPassengers[key] ?? passengers}
                  disabled={disabled || !onUpdateDraft}
                  onChange={event => {
                    const value = event.target.value;
                    setEditingPassengers(previous => ({ ...previous, [key]: value }));
                    const names = value.split(/[,，;\n]+/).map(name => name.trim()).filter(Boolean);
                    onUpdateDraft?.({
                      ...draft,
                      flights: (draft.flights || []).map(row =>
                        emailFlightKey(row) === key ? { ...row, passengers: names } : row),
                    });
                  }}
                  onBlur={() => setEditingPassengers(previous => {
                    const next = { ...previous };
                    delete next[key];
                    return next;
                  })}
                  placeholder="승객 이름을 쉼표로 구분해 입력"
                  className="hq-compact-input min-h-10 text-xs placeholder:text-[11px] sm:placeholder:text-xs"
                  aria-label={flight.flightNumber + ' 탑승객 이름'}
                />
              </label>
              {split && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={flight.flightNumber + ' 담당 차량 선택'}>
                  {slots.map((_, index) => (
                    <HqButton
                      key={index}
                      variant={owner === index ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={owner === index}
                      disabled={disabled || !onUpdateSlots}
                      onClick={() => assign(key, index)}
                      className="min-h-9 px-3 text-[11px]"
                    >
                      {index + 1}호차
                    </HqButton>
                  ))}
                  {owner < 0 && <HqBadge tone="warning">담당 미지정</HqBadge>}
                </div>
              )}
            </HqCard>
          );
        })}
      </div>
      {split && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[14px] bg-[#FAFBFD] border border-[#E1E7F0]/60 px-3.5 py-3">
          <input
            type="checkbox"
            checked={slots.every(slot => slot.sharedRouteConfirmed === true)}
            disabled={disabled || !onUpdateSlots}
            onChange={event => onUpdateSlots?.(slots.map(slot => ({
              ...slot, sharedRouteConfirmed: event.target.checked,
            })))}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#1E60F3]"
          />
          <span className="text-[11px] leading-relaxed text-[#61728A]">
            <strong className="block text-[12px] text-[#17233B]">모든 차량이 동일한 경로를 운행합니다</strong>
            현재 날짜별 전체 경유지가 모든 차량에 공통으로 적용됩니다. 차량별 경로가 다르면 체크하지 않고 별도 예약으로 분리하세요.
          </span>
        </label>
      )}
      {issues.length > 0 && (
        <HqInlineFeedback
          tone="error"
          message={`${issues[0]}${issues.length > 1 ? ` · 추가 확인 ${issues.length - 1}건` : ''}`}
        />
      )}
    </HqCard>
  );
}
