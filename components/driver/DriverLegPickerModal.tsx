'use client';

import React from 'react';
import { ArrowRight, MapPin, X } from 'lucide-react';
import type { ScheduleItem } from '@/data/ferrariSchedules';
import { getEventRouteLegs, scheduleToEventRoute, type DriverEventLeg } from '@/utils/driverEventFavorites';

export type DriverLegAction = 'load' | 'navigate' | 'predict';

type Props = {
  schedule: ScheduleItem;
  action: DriverLegAction;
  onSelect: (leg: DriverEventLeg) => void;
  onClose: () => void;
};

const labels: Record<DriverLegAction, string> = {
  load: '이 구간 길안내',
  navigate: '이 구간 길안내',
  predict: '이 구간 예상시간',
};

/** Prevent a day-long VIP itinerary from being sent to the navigator as one continuous trip. */
export function DriverLegPickerModal({ schedule, action, onSelect, onClose }: Props) {
  const legs = getEventRouteLegs(scheduleToEventRoute(schedule));
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#17233B]/40 p-4 backdrop-blur-[3px] driver-modal-backdrop"
      role="presentation" onClick={onClose}>
      <div className="driver-modal-card flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-[18px] bg-[#F7F8FB] shadow-[0_16px_60px_rgba(35,49,78,0.13)]"
        role="dialog" aria-modal="true" aria-label="운행 구간 선택"
        onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between bg-white px-5 py-4">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight text-[#17233B]">운행 구간 선택</h2>
            <p className="mt-1 text-[12px] text-[#8290A5]">한 번에 하나의 출발지와 목적지만 선택하세요.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#F2F4F8] text-[#667993]">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="space-y-2.5 overflow-y-auto p-4">
          {legs.length === 0 && (
            <div role="status" className="rounded-[14px] bg-white p-5 text-[13px] leading-relaxed text-[#667993]">
              이전 예약의 전체 방문지와 좌표가 확인되지 않았습니다. 본사에서 해당 예약의 경유지 주소를 확정해야 구간별 길안내를 사용할 수 있습니다.
            </div>
          )}
          {legs.map((leg) => (
            <div key={leg.id} className="rounded-[14px] bg-white p-4 shadow-[0_3px_16px_rgba(35,49,78,0.04)]">
              <p className="text-[11px] font-semibold text-[#8290A5]">{leg.index + 1}구간</p>
              <div className="mt-2 flex items-center gap-2 text-[13px] font-bold text-[#25344D]">
                <MapPin className="h-4 w-4 shrink-0 text-[#8290A5]" />
                <span className="min-w-0 break-words">{leg.origin.name}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#A8B5C8]" />
                <span className="min-w-0 break-words">{leg.destination.name}</span>
              </div>
              {(leg.origin.time || leg.destination.time) && (
                <p className="mt-2 pl-6 text-[11px] text-[#8290A5]">
                  원본 일정 · {leg.origin.time || '시간 미정'} / {leg.destination.time || '시간 미정'}
                </p>
              )}
              <button type="button" disabled={!leg.ready} onClick={() => onSelect(leg)}
                className="mt-3 min-h-11 w-full rounded-[12px] bg-[#1E60F3] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#174BC4] disabled:cursor-not-allowed disabled:bg-[#E8EDF5] disabled:text-[#92A0B4]">
                {leg.samePlace ? '같은 장소 · 이동 불필요' : leg.ready ? labels[action] : '주소 확인 후 이용 가능'}
              </button>
            </div>
          ))}
          <p className="px-1 pb-1 text-[11px] leading-relaxed text-[#8290A5]">
            방문지의 일정 시간은 출발 시각이 아닐 수 있습니다. 실제 출발 시점은 기사님이 확인해 주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
