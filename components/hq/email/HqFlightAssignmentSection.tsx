'use client';

import React, { useState } from 'react';
import { AlertTriangle, Plane } from 'lucide-react';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import { emailAssignableFlights, emailFlightAssignmentIssues, emailFlightKey } from '@/utils/emailDispatchPlan';

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
  const [editingPassengers, setEditingPassengers] = useState<Record<string,string>>({});
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
    <section className="space-y-3 rounded-[16px] bg-white p-4 shadow-[0_4px_18px_rgba(35,49,78,0.045)]"
      aria-label="항공편별 기사 배정">
      <div className="flex items-start gap-2.5">
        <Plane className="mt-0.5 h-4 w-4 shrink-0 text-[#59708F]" aria-hidden="true"/>
        <div className="min-w-0">
          <h4 className="text-[13px] font-bold text-[#25344D]">항공편별 담당 차량 · 승객</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-[#8290A5]">
            {split
              ? '각 항공편을 담당할 차량을 선택하세요. 다른 기사에게 승객·항공편이 함께 넘어가지 않습니다.'
              : '현재 한 대의 차량이 아래 항공편을 모두 담당합니다.'}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {flights.map(flight => {
          const key = emailFlightKey(flight);
          const owner = slots.findIndex(slot => (slot.assignedFlightKeys || []).includes(key));
          const passengers = (flight.passengers || []).join(', ');
          return (
            <div key={key} className="space-y-2 rounded-[13px] bg-[#F6F8FC] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-[#25344D]">{flight.flightNumber}</span>
                <span className="text-[11px] tabular-nums text-[#8290A5]">
                  {flight.date}{flight.scheduledArrival ? ' · 도착 '+flight.scheduledArrival : ''}
                </span>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#59708F]">이 항공편 승객</span>
                <input type="text" value={editingPassengers[key] ?? passengers} disabled={disabled || !onUpdateDraft}
                  onChange={event => {
                    const value = event.target.value;
                    setEditingPassengers(previous => ({ ...previous, [key]: value }));
                    const names = value.split(/[,，;\n]+/).map(name => name.trim()).filter(Boolean);
                    onUpdateDraft?.({
                      ...draft, flights: (draft.flights || []).map(row =>
                        emailFlightKey(row) === key ? { ...row, passengers: names } : row),
                    });
                  }}
                  onBlur={() => setEditingPassengers(previous => {
                    const next = { ...previous };
                    delete next[key];
                    return next;
                  })}
                  placeholder="승객 이름을 쉼표로 구분해 입력"
                  className="min-h-10 w-full rounded-[11px] bg-white px-3 text-[12px] text-[#25344D] outline-none focus:ring-2 focus:ring-[#1E60F3]/15 disabled:text-[#8290A5]"
                  aria-label={flight.flightNumber+' 탑승객 이름'}
                />
              </label>
              {split && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={flight.flightNumber+' 담당 차량 선택'}>
                  {slots.map((_, index) => (
                    <button key={index} type="button" aria-pressed={owner === index}
                      disabled={disabled || !onUpdateSlots}
                      onClick={() => assign(key, index)}
                      className={`min-h-9 rounded-[10px] px-3 text-[11px] font-bold transition-colors ${owner === index
                        ? 'bg-[#1E60F3] text-white' : 'bg-white text-[#59708F] hover:bg-[#EDF2FA]'} disabled:opacity-50`}>
                      {index + 1}호차
                    </button>
                  ))}
                  {owner < 0 && <span className="self-center text-[11px] font-semibold text-[#9A6B30]">담당 미지정</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {split && <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] bg-[#F6F8FC] px-3 py-3">
        <input type="checkbox" checked={slots.every(slot=>slot.sharedRouteConfirmed===true)}
          disabled={disabled || !onUpdateSlots}
          onChange={event => onUpdateSlots?.(slots.map(slot=>({
            ...slot, sharedRouteConfirmed:event.target.checked,
          })))}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#1E60F3]"/>
        <span className="text-[11px] leading-relaxed text-[#59708F]">
          <strong className="block text-[12px] text-[#25344D]">모든 차량이 동일한 경로를 운행합니다</strong>
          현재 날짜별 전체 경유지가 모든 차량에 공통으로 적용됩니다. 차량별 경로가 다르면 체크하지 않고 별도 예약으로 분리하세요.
        </span>
      </label>}
      {issues.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-[11px] bg-[#FCF4E9] px-3 py-2.5 text-[11px] leading-relaxed text-[#9A6B30]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
          <span>{issues[0]}{issues.length>1?' · 추가 확인 '+(issues.length-1)+'건':''}</span>
        </div>
      )}
    </section>
  );
}
