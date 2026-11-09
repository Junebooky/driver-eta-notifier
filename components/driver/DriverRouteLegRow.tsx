'use client';

import React from 'react';
import { ArrowRight, MapPin, Navigation, Clock3, AlertTriangle } from 'lucide-react';
import type { DriverEventLeg } from '@/utils/driverEventFavorites';
import { RouteForecastChip } from '@/components/driver/RouteForecastChip';

type Props = {
  leg: DriverEventLeg;
  pickupTime?: string;
  onNavigate?: (leg: DriverEventLeg) => void;
  onPredict?: (leg: DriverEventLeg) => void;
  disabled?: boolean;
  compact?: boolean;
};

/**
 * One immutable dispatch leg = one client-defined origin → destination.
 * Both the full operational schedule and compact event favorites use this row.
 * Intermediate-stop timestamps are itinerary times, not verified departure times.
 */
export function DriverRouteLegRow({
  leg, pickupTime, onNavigate, onPredict, disabled = false, compact = false,
}: Props) {
  const allowed = leg.ready && !leg.samePlace && !disabled;
  const time = leg.samePlace ? (leg.destination.time || leg.origin.time) :
    leg.index === 0 ? (pickupTime || leg.origin.time) : leg.origin.time;
  const assumedDeparture = leg.index > 0 || !pickupTime;

  return (
    <div className={`rounded-[13px] bg-[#F6F8FC] ${compact ? 'px-3 py-3' : 'px-3.5 py-3.5'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#8290A5]">
            <span>{leg.samePlace ? '체류 일정' : `${leg.index + 1}구간`}</span>
            {time && <span>· {time} {leg.samePlace ? '일정' : assumedDeparture ? '일정 시각' : '출발'}</span>}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-bold leading-relaxed text-[#25344D]">
            {leg.samePlace ? (
              <span className="break-words">{leg.destination.name || '장소 미지정'} · 이동 없음</span>
            ) : (
              <>
                <span className="break-words">{leg.origin.name || '장소 미지정'}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#A8B5C8]" aria-hidden="true" />
                <span className="break-words">{leg.destination.name || '장소 미지정'}</span>
              </>
            )}
          </div>
        </div>
        {onNavigate && !leg.samePlace && (
          <button
            type="button"
            disabled={!allowed}
            onClick={() => onNavigate(leg)}
            aria-label={`${leg.index + 1}구간 ${leg.origin.name}에서 ${leg.destination.name}까지 길안내`}
            title={allowed ? '길안내 실행 · 선택 구간 단톡방 보고서 복사 시도' : '위치 확인 후 길안내를 이용할 수 있습니다'}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-[11px] bg-[#1E60F3] px-3 text-[12px] font-bold text-white transition-colors hover:bg-[#1852D5] disabled:cursor-not-allowed disabled:bg-[#E8EDF5] disabled:text-[#8290A5]"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
            {leg.ready ? '길안내' : '위치 확인'}
          </button>
        )}
      </div>

      {(!leg.origin.isPoiConfirmed || !leg.destination.isPoiConfirmed) && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-[9px] bg-[#FCF4E9] px-2.5 py-1.5 text-[11px] font-semibold text-[#9A6B30]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          관리자의 TMAP 위치 확정이 필요합니다.
        </p>
      )}
      {(leg.origin.notes || leg.destination.notes) && (
        <p className="mt-2 break-words text-[11px] leading-relaxed text-[#6E809B]">
          {(leg.samePlace ? [leg.destination.notes] : [leg.origin.notes, leg.destination.notes]).filter(Boolean).join(' · ')}
        </p>
      )}
      {!leg.samePlace && (leg.origin.address || leg.destination.address) && (
        <p className="mt-1.5 flex items-start gap-1 break-words text-[11px] leading-relaxed text-[#8290A5]">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {[leg.origin.address, leg.destination.address].filter(Boolean).join(' → ')}
        </p>
      )}
      {!leg.samePlace && !leg.origin.address && !leg.destination.address && leg.ready && (
        <p className="mt-1.5 text-[11px] text-[#8290A5]">TMAP 위치 확정 · 상세 주소 미등록</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {leg.ready && !leg.samePlace && (
          <RouteForecastChip
            date={leg.date}
            time={time}
            origin={{ name: leg.origin.name, lat: leg.origin.lat, lng: leg.origin.lng }}
            destination={{ name: leg.destination.name, lat: leg.destination.lat, lng: leg.destination.lng }}
            confirmed={leg.ready}
            assumedDeparture={assumedDeparture}
          />
        )}
        {onPredict && !disabled && !leg.samePlace && (
          <button
            type="button"
            onClick={() => onPredict(leg)}
            disabled={!leg.ready}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[11px] bg-white px-2.5 text-[11px] font-semibold text-[#59708F] disabled:opacity-50"
          >
            <Clock3 className="h-3.5 w-3.5" />
            시간별 예측
          </button>
        )}
      </div>
    </div>
  );
}
