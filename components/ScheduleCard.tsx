'use client';

import React from 'react';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { Navigation, Clock, User, Plane, FileText, ChevronRight, Pencil, Check, CheckCircle2, AlertTriangle } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { sanitizePlaceName } from '@/utils/formatters';

interface ScheduleCardProps {
  item: ScheduleItem;
  onNavigate: (item: ScheduleItem) => void;
  onPredict: (item: ScheduleItem) => void;
  onSelectForCockpit?: (item: ScheduleItem) => void;
  onOpenFlight?: (flightId: string, type: 'arrival' | 'departure') => void;
  onEdit?: (item: ScheduleItem) => void;
  onAcknowledge?: (item: ScheduleItem) => void;
}

export const ScheduleCard: React.FC<ScheduleCardProps> = ({
  item,
  onNavigate,
  onPredict,
  onSelectForCockpit,
  onOpenFlight,
  onEdit,
  onAcknowledge,
}) => {
  const isDeparture =
    item.flightType === 'departure' ||
    (item.destination_name && (item.destination_name.includes('공항') || item.destination_name.toLowerCase().includes('airport'))) ||
    (item.destination_address && (item.destination_address.includes('공항') || item.destination_address.toLowerCase().includes('airport'))) ||
    (item.notes && /DEPARTURE|출국|샌딩|센딩/i.test(item.notes));

  const effectiveFlightType: 'arrival' | 'departure' = isDeparture ? 'departure' : 'arrival';

  // [태스크 3] 시간 표기 '픽업 HH:mm' 포맷으로 전면 일원화
  const formatPickupTimeBadge = (schedule: ScheduleItem): string => {
    const displayStr = schedule.time_display || '';
    const match = displayStr.match(/(\d{1,2}:\d{2})/);
    if (match) {
      return `픽업 ${match[1]}`;
    }
    if (schedule.pickup_time) {
      const timeMatch = schedule.pickup_time.match(/(\d{1,2}:\d{2})/);
      if (timeMatch) {
        return `픽업 ${timeMatch[1]}`;
      }
    }
    const sanitized = displayStr.replace(/착륙\s*영접|착륙|운행\s*시작|운행/g, '').trim();
    return sanitized ? `픽업 ${sanitized}` : '픽업';
  };

  const isStaleAck = Boolean(
    item.version && item.version > 1 && (!item.last_ack_version || item.last_ack_version < item.version)
  );

  return (
    <div className="w-full bg-white rounded-2xl p-4 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-md transition-all space-y-3.5 relative overflow-hidden">
      {/* Top Header: Date, Unified Pickup Time Badge, Status Badges & Edit Button */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-base font-bold text-slate-900 tracking-tight truncate">
            {item.dateLabel}
          </span>

          {/* Stale Ack: Re-ack Needed on Version Bump */}
          {isStaleAck && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
              배차 변경됨 (v{item.version})
            </span>
          )}

          {/* Unresolved Place Warning */}
          {item.place_verified === false && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>위치 확인 필요</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Pure Single Pickup Time Badge */}
          <div className="px-2.5 py-1 rounded-full text-sm font-black bg-slate-900 text-white tracking-tight shadow-xs">
            {formatPickupTimeBadge(item)}
          </div>

          {/* Edit Button */}
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                haptics.lightTap();
                onEdit(item);
              }}
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-[#1E60F3] hover:bg-blue-50 active:scale-90 flex items-center justify-center transition-all cursor-pointer"
              title="스케줄 정보 수정"
              aria-label="스케줄 수정"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Address Inline Layout: 2 Rows (출발 row 1, 도착 row 2 with inline street address) */}
      <div className="relative pl-6 py-0.5 space-y-2.5">
        {/* Left Vertical Route Connector Line */}
        <div className="absolute left-2.5 top-2.5 bottom-2.5 w-[2px] bg-slate-200" />

        {/* Row 1: Departure Origin Spot Name + Road Address Inline */}
        <div className="relative flex items-center gap-2 min-w-0">
          {/* Origin Dot */}
          <div className="absolute -left-[19px] w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-white" />
          <span className="w-8 h-5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0">
            출발
          </span>
          <span
            className="text-sm font-bold text-slate-900 tracking-tight min-w-0 max-w-[55%] truncate"
            title={item.origin_name}
          >
            {sanitizePlaceName(item.origin_name)}
          </span>
          {item.origin_address && (
            <span
              className="text-xs text-slate-400 font-normal min-w-0 flex-1 truncate max-w-[180px]"
              title={item.origin_address}
            >
              {item.origin_address}
            </span>
          )}
        </div>

        {/* Row 2: Arrival Destination Spot Name + Road Address Inline */}
        <div className="relative flex items-center gap-2 min-w-0">
          {/* Destination Dot (Cobalt Accent) */}
          <div className="absolute -left-[19px] w-2.5 h-2.5 rounded-full bg-[#1E60F3] ring-2 ring-white shadow-xs" />
          <span className="w-8 h-5 rounded text-[10px] font-bold bg-[#1E60F3] text-white border border-[#1E60F3] flex items-center justify-center shrink-0 shadow-xs">
            도착
          </span>
          <span
            className="text-sm font-bold text-slate-900 tracking-tight min-w-0 max-w-[55%] truncate"
            title={item.destination_name}
          >
            {sanitizePlaceName(item.destination_name)}
          </span>
          {item.destination_address && (
            <span
              className="text-xs text-slate-400 font-normal min-w-0 flex-1 truncate max-w-[180px]"
              title={item.destination_address}
            >
              {item.destination_address}
            </span>
          )}
        </div>
      </div>

      {/* Details Box: Passenger, Flight, Notes (Clickable to trigger Edit) */}
      <div
        onClick={() => {
          if (onEdit) {
            haptics.lightTap();
            onEdit(item);
          }
        }}
        className={`bg-slate-50/80 rounded-xl p-3 space-y-1.5 text-xs text-slate-700 border border-slate-100 transition-colors ${onEdit ? 'hover:bg-slate-100/90 cursor-pointer' : ''
          }`}
        title={onEdit ? '클릭하여 정보 수정' : undefined}
      >
        {/* Passenger */}
        <div className="flex items-center gap-1.5 font-medium min-w-0">
          <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
            <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-500 font-normal">승객:</span>
          </div>
          <span
            className="font-bold text-slate-900 min-w-0 flex-1 truncate"
            title={item.passenger}
          >
            {item.passenger}
          </span>
        </div>

        {/* Flight (Optional) */}
        {item.flight && (
          <div className="flex items-center gap-1.5 font-medium">
            <Plane className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-500 font-normal">항공편:</span>
            <span className="font-bold text-slate-900">{item.flight}</span>
          </div>
        )}

        {/* Notes */}
        {item.notes && (
          <div className="flex items-start gap-1.5 font-medium pt-0.5">
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="text-slate-600 leading-snug">{item.notes}</span>
          </div>
        )}
      </div>

      {/* Card Footer: Left Route Set / Ack Action & Right Multi-Action Floating Buttons */}
      <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
        {/* Left: Cockpit Route Bind & Driver Acknowledgment Button */}
        <div className="flex items-center gap-1.5 min-w-0">
          {onSelectForCockpit && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectForCockpit(item);
              }}
              className="text-xs font-bold text-slate-600 hover:text-[#1E60F3] flex items-center gap-0.5 cursor-pointer transition-colors py-1 px-1.5 rounded-lg hover:bg-slate-100 min-w-0 shrink-0"
              title="관제 대시보드에 출발/도착지 설정"
            >
              <span className="truncate">경로 적용</span>
              <ChevronRight className="w-3 h-3 shrink-0" />
            </button>
          )}

          {/* Driver Acknowledgment Primary Action */}
          {onAcknowledge && (
            item.isAcknowledged ? (
              <div
                className="py-1 px-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold text-xs flex items-center gap-1 shrink-0 shadow-2xs"
                title={`배차 확인 완료 (v${item.last_ack_version || item.version || 1})`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>배차 확인됨</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.successPulse();
                  onAcknowledge(item);
                }}
                className="py-1.5 px-3 rounded-xl bg-[#1E60F3] hover:bg-[#1650D6] active:scale-95 text-white font-extrabold text-xs shadow-sm shadow-blue-500/25 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                title="본사 배차 수신 확인"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>배차 확인</span>
              </button>
            )
          )}
        </div>

        {/* Right: Multi-Action Buttons (Conditional Flight + White Clock + Solid Blue Navigation) */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Action 1 (Conditional): Flight Modal Launcher Button (Dark Neutral Spec) */}
          {item.flight && onOpenFlight && (
            <button
              type="button"
              onClick={() => {
                haptics.mediumTap();
                const cleanId = item.flight!.split('(')[0].trim().toUpperCase();
                onOpenFlight(cleanId, effectiveFlightType);
              }}
              className="w-11 h-11 rounded-full bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200/90 shadow-2xs transition-colors active:scale-90 cursor-pointer shrink-0"
              title={`항공편(${item.flight}) 실시간 운항 정보 조회 (${effectiveFlightType === 'departure' ? '출국' : '입국'})`}
              aria-label="항공편 조회"
            >
              <Plane className="w-5 h-5 text-slate-700" />
            </button>
          )}

          {/* Action 2: Departure Time Picker Wheel Button (White Background & Dark Slate Icon) */}
          <button
            type="button"
            onClick={() => {
              haptics.mediumTap();
              onPredict(item);
            }}
            className="w-11 h-11 rounded-full bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200/90 shadow-2xs transition-colors active:scale-90 cursor-pointer shrink-0"
            title="출발 시간 예측 (휠 피커)"
            aria-label="출발 시간 예측"
          >
            <Clock className="w-5 h-5 text-slate-700" />
          </button>

          {/* Action 3: Solid Blue Circular Navigation Launch Button (w-11 h-11) */}
          <button
            type="button"
            onClick={() => {
              haptics.heavyTap();
              onNavigate(item);
            }}
            className="w-11 h-11 rounded-full bg-[#1E60F3] hover:bg-[#1650D6] active:scale-90 text-white shadow-lg shadow-blue-500/25 flex items-center justify-center transition-all cursor-pointer"
            title="길안내 내비 즉시 실행"
            aria-label="길안내 실행"
          >
            <Navigation className="w-5 h-5 fill-white text-white translate-x-px" />
          </button>
        </div>
      </div>
    </div>
  );
};
