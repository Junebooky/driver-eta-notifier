'use client';

import React from 'react';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { Navigation, Clock, User, Plane, FileText, ChevronRight, Pencil, Check, AlertTriangle, Building2, Phone, Users } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { sanitizePlaceName } from '@/utils/formatters';
import { DispatchRouteTimeline } from '@/components/common/DispatchRouteTimeline';
import { RouteForecastChip } from '@/components/driver/RouteForecastChip';
import { DriverRouteLegRow } from '@/components/driver/DriverRouteLegRow';
import { DriverDispatchShell } from '@/components/driver/DriverDispatchShell';
import type { DriverEventLeg } from '@/utils/driverEventFavorites';
import { scheduleToEventRoute, getEventRouteLegs } from '@/utils/driverEventFavorites';

interface ScheduleCardProps {
  item: ScheduleItem;
  onNavigate: (item: ScheduleItem) => void;
  onPredict: (item: ScheduleItem) => void;
  onNavigateLeg?: (leg: DriverEventLeg) => void;
  onPredictLeg?: (leg: DriverEventLeg) => void;
  onSelectForCockpit?: (item: ScheduleItem) => void;
  onOpenFlight?: (flightId: string, type: 'arrival' | 'departure') => void;
  onEdit?: (item: ScheduleItem) => void;
  onAcknowledge?: (item: ScheduleItem) => void;
}

export const ScheduleCard: React.FC<ScheduleCardProps> = ({
  item,
  onNavigate,
  onPredict,
  onNavigateLeg,
  onPredictLeg,
  onSelectForCockpit,
  onOpenFlight,
  onEdit,
  onAcknowledge,
}) => {
  const [operationOverride, setOperationOverride] = React.useState<{ id: string; status: string; sourceStatus: typeof item.operation_status } | null>(null);
  const currentOpStatus = operationOverride?.id === item.id && operationOverride.sourceStatus === item.operation_status
    ? operationOverride.status : item.operation_status || 'ready';
  const [isUpdatingOp, setIsUpdatingOp] = React.useState(false);
  const [operationError, setOperationError] = React.useState<string | null>(null);

  const handleUpdateOpStatus = async (nextStatus: 'ready' | 'arrived_pickup' | 'boarded' | 'in_transit' | 'completed') => {
    setIsUpdatingOp(true);
    setOperationError(null);
    haptics.selection();
    try {
      const res = await fetch('/api/schedules/operation-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: item.id,
          status: nextStatus,
          changedBy: item.driver_name || '기사님',
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setOperationOverride({ id: item.id, status: nextStatus, sourceStatus: item.operation_status });
        window.dispatchEvent(new CustomEvent('vip_hq_schedules_updated'));
        haptics.success();
      } else {
        setOperationError(data.error || '운행 상태 보고에 실패했습니다. 다시 시도해 주세요.');
        haptics.errorAlert();
      }
    } catch (e) {
      setOperationError('연결에 실패했습니다. 운행 상태를 다시 선택해 주세요.');
      haptics.errorAlert();
      console.error(e);
    } finally {
      setIsUpdatingOp(false);
    }
  };

  const isDeparture =
    item.flightType === 'departure' ||
    (item.destination_name && (item.destination_name.includes('공항') || item.destination_name.toLowerCase().includes('airport'))) ||
    (item.destination_address && (item.destination_address.includes('공항') || item.destination_address.toLowerCase().includes('airport'))) ||
    (item.notes && /DEPARTURE|출국|샌딩|센딩/i.test(item.notes));

  const effectiveFlightType: 'arrival' | 'departure' = isDeparture ? 'departure' : 'arrival';

  // [태스크 3] 시간 표기 '픽업 HH:mm' 포맷으로 전면 일원화
  const extractPickupTimeValue = (schedule: ScheduleItem): string => {
    const displayStr = schedule.time_display || '';
    const match = displayStr.match(/(\d{1,2}:\d{2})/);
    if (match) {
      return match[1].padStart(5, '0');
    }
    if (schedule.pickup_time) {
      const timeMatch = schedule.pickup_time.match(/(\d{1,2}:\d{2})/);
      if (timeMatch) {
        return timeMatch[1].padStart(5, '0');
      }
    }
    const sanitized = displayStr.replace(/픽업|착륙\s*영접|착륙|운행\s*시작|운행/g, '').trim();
    return sanitized;
  };

  const formatCardDateLabel = (schedule: ScheduleItem): string => {
    const parts = (schedule.date || '').split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      if (!isNaN(dt.getTime())) {
        const dow = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
        return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${dow})`;
      }
    }
    return schedule.dateLabel;
  };

  const parseNotesRow = (rawNotes?: string): { label: string; value: string } | null => {
    if (!rawNotes || !rawNotes.trim()) return null;
    const trimmed = rawNotes.trim();
    const picketMatch = trimmed.match(/^공항\s*피켓\s*[:·-]?\s*(.*)$/);
    if (picketMatch) {
      return {
        label: '공항 피켓',
        value: picketMatch[1]?.trim() || '영접 요청',
      };
    }
    return {
      label: '특이사항',
      value: trimmed,
    };
  };

  const pickupTimeValue = extractPickupTimeValue(item);
  const parsedNotes = parseNotesRow(item.notes);
  const forecastLegs = item.routeWaypoints && item.routeWaypoints.length >= 2
    ? getEventRouteLegs(scheduleToEventRoute(item))
    : [];

  const isCancelled = item.dispatch_status === 'cancelled' || item.status === 'cancelled';
  const isStaleAck = Boolean(
    !isCancelled &&
      item.version &&
      item.version > 1 &&
      (!item.last_ack_version || item.last_ack_version < item.version)
  );
  const hasHqReminder = Boolean(!isCancelled && !item.isAcknowledged && (item.reminder_count || 0) > 0);
  const isGroupDispatch = Boolean(item.group_total_vehicles && item.group_total_vehicles > 1);
  const hasDistinctCustomerOrEvent = Boolean(
    (item.customer_name && item.customer_name !== item.passenger) || item.event_name
  );

  return (
    <DriverDispatchShell
      title={item.event_name || item.group_name || item.customer_name || '확정 의전 배차'}
      meta={`${formatCardDateLabel(item)} · ${pickupTimeValue ? `픽업 ${pickupTimeValue}` : '시각 미정'}`}
      subtitle={`${item.customer_name && item.customer_name !== item.event_name ? item.customer_name + ' · ' : ''}차량 ${item.vehicle_plate || item.vehicle_no || '미지정'}`}
    >
      {/* HQ Urgent Reminder Banner */}
      {hasHqReminder && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-rose-600 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-xs">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" />
            <span>본사 긴급 배차 확인 요청 수신 ({item.reminder_count}회) — 즉시 아래 [배차 확인]을 눌러주세요!</span>
          </div>
        </div>
      )}

      {/* Shared A-style heading above; keep lifecycle warnings and edit access visible. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#59708F]">
          {isGroupDispatch && <span className="rounded-[9px] bg-[#F2F5F9] px-2 py-1">그룹 {item.group_vehicle_index || 1}/{item.group_total_vehicles}대</span>}
          {isCancelled && <span className="rounded-[9px] bg-[#F9EFF0] px-2 py-1 text-[#A15A66]">배차 취소</span>}
          {isStaleAck && <span className="rounded-[9px] bg-[#FCF4E9] px-2 py-1 text-[#9A6B30]">변경 배차 · 재확인 필요 (v{item.version})</span>}
          {item.place_verified === false && <span className="rounded-[9px] bg-[#F2F5F9] px-2 py-1">위치 확인 필요</span>}
        </div>
        {onEdit && !isCancelled && (
          <button type="button" onClick={() => { haptics.lightTap(); onEdit(item); }}
            className="inline-flex items-center gap-1.5 rounded-[11px] bg-[#F2F5F9] px-2.5 py-2 text-[11px] font-semibold text-[#59708F]"
            aria-label="스케줄 수정"><Pencil className="h-3.5 w-3.5" /> 수정</button>
        )}
      </div>

      {/* Flight is a first-class driver action, not a hidden footer icon. */}
      {item.flight && onOpenFlight && !isCancelled && (
        <button type="button" onClick={() => {
          haptics.mediumTap();
          onOpenFlight(item.flight!.split('(')[0].trim().toUpperCase(), effectiveFlightType);
        }} className="flex w-full items-center gap-3 rounded-[13px] bg-[#F6F8FC] px-3.5 py-3 text-left"
          aria-label={`항공편 ${item.flight} 조회`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white">
            <Plane className="h-5 w-5 text-[#59708F]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium text-[#8290A5]">항공편 · {effectiveFlightType === 'arrival' ? '입국' : '출국'}</span>
            <span className="block truncate text-[13px] font-bold text-[#25344D]">{item.flight}</span>
          </span>
          <span className="shrink-0 text-[12px] font-bold text-[#1E60F3]">실시간 조회</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#8290A5]" />
        </button>
      )}

      {/* All adjacent itinerary stops are separate drives; a single leg never
          sends the whole day's intermediate stops to navigation. */}
      <section className="space-y-2" aria-label="운행 구간">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-bold text-[#25344D]">이동 일정</h4>
          <span className="text-[11px] text-[#8290A5]">{forecastLegs.length || 1}개 구간</span>
        </div>
        {forecastLegs.length > 0 ? (
          forecastLegs.map((leg) => (
            <DriverRouteLegRow
              key={leg.id}
              leg={leg}
              pickupTime={item.pickup_time}
              onNavigate={onNavigateLeg}
              onPredict={onPredictLeg}
              disabled={isCancelled}
            />
          ))
        ) : (
          <div className="rounded-[13px] bg-[#F6F8FC] px-3.5 py-3.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-bold text-[#25344D]">
              <span className="break-words">{sanitizePlaceName(item.origin_name)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#A8B5C8]" />
              <span className="break-words">{sanitizePlaceName(item.destination_name)}</span>
            </div>
            {(item.origin_address || item.destination_address) && (
              <p className="mt-1.5 break-words text-[11px] text-[#8290A5]">
                {[item.origin_address, item.destination_address].filter(Boolean).join(' → ')}
              </p>
            )}
            {!isCancelled && <div className="mt-2.5"><RouteForecastChip
              date={item.date}
              time={item.pickup_time}
              origin={{ name: item.origin_name, lat: item.origin_lat, lng: item.origin_lng }}
              destination={{ name: item.destination_name, lat: item.destination_lat, lng: item.destination_lng }}
              confirmed={item.place_verified === true && item.intake_source !== 'seed' &&
                !((item.origin_lat === 37.5042 && item.origin_lng === 127.0425) ||
                  (item.destination_lat === 37.4495 && item.destination_lng === 126.4512))}
            /></div>}
          </div>
        )}
      </section>
      {/* Details Box: Aligned 2-Column Info Table */}
      <div
        onClick={() => {
          if (onEdit && !isCancelled) {
            haptics.lightTap();
            onEdit(item);
          }
        }}
        className={`bg-[#F6F8FC] rounded-2xl p-4 space-y-2.5 text-xs sm:text-[13px] text-slate-700 transition-colors ${
          onEdit && !isCancelled ? 'hover:bg-[#EEF3FA] cursor-pointer' : ''
        }`}
        title={onEdit && !isCancelled ? '클릭하여 정보 수정' : undefined}
      >
        {/* Customer / Event */}
        {hasDistinctCustomerOrEvent && (
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-20 sm:w-22 shrink-0 flex items-center gap-2 text-slate-500 font-medium">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[1.9]" />
              <span>고객사</span>
            </div>
            <span
              className="font-extrabold text-[#0F172A] min-w-0 flex-1 truncate"
              title={`${item.customer_name || ''}${item.event_name ? ` · ${item.event_name}` : ''}`}
            >
              {item.customer_name || item.event_name}
              {item.customer_name && item.event_name && item.event_name !== item.customer_name
                ? ` · ${item.event_name}`
                : ''}
            </span>
          </div>
        )}

        {/* Passenger */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-20 sm:w-22 shrink-0 flex items-center gap-2 text-slate-500 font-medium">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[1.9]" />
            <span>승객</span>
          </div>
          <span
            className="font-extrabold text-[#0F172A] min-w-0 flex-1 truncate"
            title={item.passenger}
          >
            {item.passenger}
          </span>
        </div>

        {/* Contact Phone */}
        {item.passenger_phone && (
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-20 sm:w-22 shrink-0 flex items-center gap-2 text-slate-500 font-medium">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[1.9]" />
              <span>연락처</span>
            </div>
            <a
              href={`tel:${item.passenger_phone}`}
              onClick={(e) => e.stopPropagation()}
              className="font-extrabold text-[#0F172A] hover:text-[#1E60F3] transition-colors tabular-nums truncate"
              title={`승객/담당자 통화 (${item.passenger_phone})`}
            >
              {item.passenger_phone}
            </a>
          </div>
        )}

        {/* Flight (Optional) */}
        {item.flight && (
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-20 sm:w-22 shrink-0 flex items-center gap-2 text-slate-500 font-medium">
              <Plane className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[1.9]" />
              <span>항공편</span>
            </div>
            <span className="font-extrabold text-[#0F172A] min-w-0 flex-1 truncate">
              {item.flight}
            </span>
          </div>
        )}

        {/* Airport Picket / Notes */}
        {parsedNotes && (
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-20 sm:w-22 shrink-0 flex items-center gap-2 text-slate-500 font-medium">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[1.9]" />
              <span>{parsedNotes.label}</span>
            </div>
            <span className="font-extrabold text-[#0F172A] min-w-0 flex-1 leading-snug">
              {parsedNotes.value}
            </span>
          </div>
        )}

        {/* Cancellation Reason */}
        {isCancelled && item.cancel_reason && (
          <div className="flex items-start gap-2 font-bold pt-1.5 text-rose-700 border-t border-rose-200/70">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-snug">취소 안내: {item.cancel_reason}</span>
          </div>
        )}
      </div>

      {/* Card Footer: Left Route Set / Ack Status & Right Volumetric Circular Action Buttons */}
      <div className="flex items-center justify-between pt-0.5 gap-2 flex-wrap">
        {/* Left: Cockpit Route Bind & Driver Acknowledgment */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onSelectForCockpit && !isCancelled && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectForCockpit(item);
              }}
              className="text-xs sm:text-[13px] font-bold text-slate-600 hover:text-[#1E60F3] flex items-center gap-0.5 cursor-pointer transition-colors py-1 px-1 rounded-lg min-w-0 shrink-0"
              title="관제 대시보드에 출발/도착지 설정"
            >
              <span className="truncate">경로 적용</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            </button>
          )}

          {/* Driver Acknowledgment Status / Action */}
          {isCancelled ? (
            <div className="py-1.5 px-3 rounded-full bg-rose-100/80 text-rose-800 font-bold text-xs flex items-center gap-1 shrink-0">
              <span>본사 배차 취소</span>
            </div>
          ) : (
            onAcknowledge &&
            (item.isAcknowledged ? (
              <div
                className="py-1.5 px-3.5 rounded-full bg-[#EEF1F6] text-slate-600 font-bold text-xs flex items-center shrink-0"
                title={`배차 확인 완료 (v${item.last_ack_version || item.version || 1})`}
              >
                <span>
                  배차 확인됨
                  {item.version && item.version > 1 ? ` (v${item.version})` : ''}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.successPulse();
                  onAcknowledge(item);
                }}
                className={`py-1.5 px-3.5 rounded-full active:scale-95 text-white font-extrabold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  isStaleAck
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/25'
                    : 'bg-[#1E60F3] hover:bg-[#1852D5] shadow-none'
                }`}
                title={isStaleAck ? '변경된 배차 내역 재확인' : '본사 배차 수신 확인'}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>{isStaleAck ? `배차 재확인 (v${item.version})` : '배차 확인'}</span>
              </button>
            ))
          )}
        </div>

        {/* Right: Circular Volumetric Action Buttons (Flight + Clock + Navigation) */}
        <div className="flex items-center gap-2.5 ml-auto shrink-0">
          {!isCancelled && forecastLegs.length === 0 && (
            <button
              type="button"
              onClick={() => {
                haptics.mediumTap();
                onPredict(item);
              }}
              className="w-11 h-11 rounded-[12px] bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-100/90 shadow-[0_4px_14px_rgba(15,23,42,0.06)] transition-all active:scale-90 cursor-pointer shrink-0"
              title="출발 시간별 소요 시간 예측"
              aria-label="출발 시간 예측"
            >
              <Clock className="w-5 h-5 text-slate-700 stroke-[1.8]" />
            </button>
          )}

          {forecastLegs.length === 0 && <button
            type="button"
            disabled={isCancelled}
            onClick={() => {
              if (isCancelled) return;
              haptics.heavyTap();
              onNavigate(item);
            }}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
              isCancelled
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-[#1E60F3] hover:bg-[#1852D5] active:scale-90 text-white shadow-none cursor-pointer'
            }`}
            title={isCancelled ? '취소된 배차는 길안내를 실행할 수 없습니다' : '길안내 내비 즉시 실행'}
            aria-label="길안내 실행"
          >
            <Navigation
              className={`w-5 h-5 translate-x-px ${
                isCancelled ? 'fill-slate-400 text-slate-400' : 'fill-white text-white'
              }`}
            />
          </button>}
        </div>
      </div>

      {/* 5-Stage Live Operation Status Control (Visible when dispatch is confirmed) */}
      {item.isAcknowledged && !isCancelled && (
        <div className="pt-1 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="text-slate-500 font-semibold">실시간 운행 단계</span>
            <span className="font-extrabold text-[#1E60F3]">
              {currentOpStatus === 'ready' && '1단계: 운행 준비'}
              {currentOpStatus === 'arrived_pickup' && '2단계: 픽업지 도착'}
              {currentOpStatus === 'boarded' && '3단계: 승객 탑승'}
              {currentOpStatus === 'in_transit' && '4단계: 이동 중 (운행 중)'}
              {currentOpStatus === 'completed' && '5단계: 운행 종료'}
            </span>
          </div>
          {operationError && <p role="alert" className="rounded-[10px] bg-[#F9EFF0] px-3 py-2 text-[11px] font-medium text-[#A15A66]">{operationError}</p>}
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { key: 'ready', label: '1.준비' },
              { key: 'arrived_pickup', label: '2.도착' },
              { key: 'boarded', label: '3.탑승' },
              { key: 'in_transit', label: '4.이동' },
              { key: 'completed', label: '5.종료' },
            ].map((stage) => {
              const isActive = currentOpStatus === stage.key;
              return (
                <button
                  key={stage.key}
                  type="button"
                  disabled={isUpdatingOp}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpdateOpStatus(stage.key as any);
                  }}
                  className={`py-2.5 px-1 text-xs rounded-xl transition-all text-center cursor-pointer ${
                    isActive
                      ? 'bg-[#1E60F3] text-white font-extrabold shadow-none'
                      : 'bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-100/90 shadow-[0_2px_8px_rgba(15,23,42,0.04)]'
                  }`}
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </DriverDispatchShell>
  );
};
