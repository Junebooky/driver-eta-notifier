'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, FileClock, GitCompareArrows, Info, Plus, Minus, ShieldCheck } from 'lucide-react';
import type { HqEmailExtractedDraft } from '@/types/emailHq';
import type { HqDriverSummary } from '@/types/driverHq';
import type { ExistingEmailBookingCandidate } from '@/services/emailBookingMatchService';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';
import {
  emailBatchRows,
  type EmailBatchDecisions,
  type EmailBatchAssignments,
  type EmailBatchSlot,
} from '@/utils/emailBatchRevision';

interface Props {
  draft: HqEmailExtractedDraft;
  slots: EmailBatchSlot[];
  candidates: ExistingEmailBookingCandidate[];
  decisions: EmailBatchDecisions;
  cancelIds: string[];
  cancelReasons: Record<string, string>;
  assignments: EmailBatchAssignments;
  drivers?: HqDriverSummary[];
  onSelect: (rowKey: string, selection: string) => void;
  onCancel: (scheduleId: string, checked: boolean) => void;
  onCancelReason: (scheduleId: string, reason: string) => void;
  onAssignment: (rowKey: string, assignment: EmailBatchAssignments[string]) => void;
  onAddVehicle?: () => void;
  onRemoveLastVehicle?: () => void;
  showAssignments?: boolean;
  isSubmitting?: boolean;
  onApprove?: () => void;
  onRequestUnassigned?: () => void;
}

/** Mirrors the White First / borderless HQ email design. No implicit matches or cancellations. */
export function HqEmailBatchRevisionPanel({
  draft, slots, candidates, decisions, cancelIds, cancelReasons, assignments,
  drivers = [], onSelect, onCancel, onCancelReason, onAssignment, onAddVehicle, onRemoveLastVehicle, showAssignments = false,
  isSubmitting = false, onApprove, onRequestUnassigned,
}: Props) {
  const rows = useMemo(() => {
    try { return emailBatchRows(draft, slots, candidates, decisions, assignments); }
    catch { return []; }
  }, [draft, slots, candidates, decisions, assignments]);
  const selectedIds = new Set(rows.map(row => row.previous?.scheduleId).filter(Boolean));
  const selectedEvents = new Set(rows.map(row => row.previous?.eventId).filter(Boolean));
  const eligibleRemovals = candidates.filter(item =>
    !selectedIds.has(item.scheduleId) && Boolean(item.eventId && selectedEvents.has(item.eventId))
  );
  const pending = rows.filter(row => !row.selection).length;
  const additions = rows.filter(row => row.action === 'new').length;
  const updates = rows.filter(row => row.action === 'update').length;
  const unchanged = rows.filter(row => row.action === 'unchanged').length;
  const skipped = rows.filter(row => row.action === 'skip').length;
  const [cancelAcknowledged, setCancelAcknowledged] = useState(false);
  const approvalSignature = [
    JSON.stringify(decisions), JSON.stringify(cancelIds), JSON.stringify(cancelReasons),
    JSON.stringify(assignments), JSON.stringify(draft.waypoints), slots.length,
  ].join('|');
  useEffect(() => { setCancelAcknowledged(false); }, [approvalSignature]);

  const canSubmit = !pending && rows.length > 0 && rows.length <= 80 && rows.length > skipped &&
    (!cancelIds.length || (cancelAcknowledged && cancelIds.every(id => (cancelReasons[id] || '').trim().length >= 2)));

  return (
    <section aria-label="다중 날짜 및 차량 수정본 일괄 비교" className="mb-4 rounded-[28px] bg-white px-4 py-5 shadow-[0_5px_22px_rgba(31,49,76,0.045)] sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[#19283C]">
            <GitCompareArrows className="h-4.5 w-4.5 text-[#8290A1]" strokeWidth={1.7} />
            일정 일괄 비교
          </h3>
          <p className="text-[12px] leading-relaxed text-[#8A97A7]">
            날짜·차량별 기존 예약을 직접 연결합니다. 같은 송신자라도 자동으로 덮어쓰지 않습니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[#F7F9FC] px-3 py-1.5 text-[11px] font-medium tabular-nums text-[#64748B]">{rows.length}건 검토</span>
          {onRemoveLastVehicle && slots.length > 1 && (
            <button type="button" disabled={isSubmitting} onClick={onRemoveLastVehicle}
              className="flex min-h-9 items-center gap-1 text-[11px] font-medium text-[#8492A4] hover:text-[#475569] disabled:opacity-40">
              <Minus className="h-3.5 w-3.5"/>호차 제거
            </button>
          )}
          {onAddVehicle && slots.length < 12 && (
            <button type="button" disabled={isSubmitting} onClick={onAddVehicle}
              className="flex min-h-9 items-center gap-1 text-[11px] font-medium text-[#52647A] hover:text-[#253449] disabled:opacity-40">
              <Plus className="h-3.5 w-3.5"/>호차 추가
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-y border-[#F1F3F7] py-3 text-[12px] text-[#64748B]">
        <span>신규 <strong className="font-semibold text-[#243449]">{additions}</strong></span>
        <span>수정 <strong className="font-semibold text-[#243449]">{updates}</strong></span>
        <span>변경 없음 <strong className="font-semibold text-[#243449]">{unchanged}</strong></span>
        {skipped > 0 && <span>운행 없음 <strong className="font-semibold text-[#243449]">{skipped}</strong></span>
        <span>미선택 <strong className="font-semibold text-[#243449]">{pending}</strong></span>
        {cancelIds.length > 0 && <span>취소 예정 <strong className="font-semibold text-[#243449]">{cancelIds.length}</strong></span>}
      </div>

      <div className="divide-y divide-[#F0F3F7]">
        {rows.map(row => {
          const previous = row.previous;
          const alreadyUsed = new Set(rows.filter(other => other.key !== row.key).map(other => other.previous?.scheduleId));
          const assignment = assignments[row.key] || {};
          const selectedPlate = assignment.vehiclePlate ?? previous?.vehiclePlate ?? slots[row.index]?.vehiclePlate ?? '';
          const selectedDriverId = assignment.driver !== undefined
            ? assignment.driver?.id || ''
            : previous?.driverId || slots[row.index]?.driver?.id || '';
          const originalDriver = previous?.driverId && !drivers.some(driver => driver.id === previous.driverId);
          return (
            <div key={row.key} className="space-y-3 py-4 first:pt-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-[13px] font-semibold text-[#243449]">{row.date} <span className="ml-1 font-normal text-[#94A1B2]">· {row.index + 1}호차</span></p>
                  <p className="break-words text-[11px] leading-relaxed text-[#758296]">
                    {row.startTime || '시간 미정'} {row.start || '출발지 미정'} → {row.destination || '도착지 미정'}
                  </p>
                  <p className="text-[10px] text-[#9DA8B6]">전체 경유 {row.stops.length}곳 · {row.endTime || '종료 시간 확인 필요'}</p>
                </div>
                <span className="rounded-lg bg-[#F7F9FC] px-2 py-1 text-[10px] font-medium text-[#627185]">
                  {row.action === 'new' ? '신규' : row.action === 'update' ? '수정' : row.action === 'unchanged' ? '변경 없음' : row.action === 'skip' ? '운행 없음' : '선택 필요'}
                </span>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium text-[#8491A3]">연결할 기존 예약</span>
                <div className="relative">
                  <select
                    value={row.selection}
                    onChange={e => onSelect(row.key, e.target.value)}
                    disabled={isSubmitting}
                    aria-label={`${row.date} ${row.index + 1}호차 기존 예약`}
                    className="h-12 w-full appearance-none rounded-2xl bg-[#FAFBFD] px-4 pr-9 text-[12px] font-medium text-[#253449] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 disabled:opacity-55"
                  >
                    <option value="">연결할 예약을 선택해 주세요</option>
                    <option value="new">+ 신규 예약으로 추가</option>
                    <option value="skip">— 이 날짜에는 차량 운행 없음</option>
                    {candidates.map(item => (
                      <option key={item.scheduleId} value={item.scheduleId} disabled={alreadyUsed.has(item.scheduleId)}>
                        {item.pickupDate} · {item.groupVehicleIndex || 1}호차 · {item.vehiclePlate || '차량 미정'} · {item.driverName || item.customerName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-4 h-4 w-4 text-[#94A1B2]"/>
                </div>
                {previous && <span className="block text-[10px] text-[#95A1AF]">연결 근거: {previous.reasons.join(' · ') || '관리자 선택'} · 버전 v{previous.version}</span>}
              </label>

              {previous && (
                <details className="group rounded-2xl bg-[#FAFBFD] px-3.5 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium text-[#5C697D] marker:hidden">
                    <span>기존·수정 일정 비교 {row.changes.length > 0 ? `(${row.changes.length}개 항목)` : '(변경 없음)'}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-[#9BA7B6] transition-transform group-open:rotate-180"/>
                  </summary>
                  <div className="mt-3 space-y-3">
                    {row.changes.length ? row.changes.map(change => (
                      <div key={change.label} className="grid grid-cols-[65px_1fr] gap-x-2 gap-y-1 text-[11px] leading-relaxed sm:grid-cols-[80px_1fr_1fr]">
                        <span className="font-medium text-[#93A1B2]">{change.label}</span>
                        <span className="min-w-0 break-words text-[#9CA8B7] line-through">{change.previous || '없음'}</span>
                        <span className="col-start-2 min-w-0 break-words font-medium text-[#243449] sm:col-start-3">{change.next || '미정'}</span>
                      </div>
                    )) : <p className="text-[11px] text-[#8491A3]">일정 정보가 동일합니다. 차량·기사 변경 여부도 확인해 주세요.</p>}
                  </div>
                </details>
              )}

              {row.action === 'skip' && (
                <p className="rounded-xl bg-[#F8FAFC] px-3.5 py-2.5 text-[11px] leading-relaxed text-[#718095]">
                  이 날짜의 {row.index + 1}호차는 배차하지 않습니다. 다른 날짜의 동일 호차 일정은 유지됩니다.
                </p>
              )}
              {showAssignments && row.selection && row.selection !== 'skip' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#8491A3]">이 날짜에 사용할 차량</span>
                    <select
                      value={selectedPlate}
                      onChange={e => onAssignment(row.key, { ...assignment, vehiclePlate: e.target.value })}
                      disabled={isSubmitting}
                      aria-label={`${row.date} ${row.index + 1}호차 차량 배정`}
                      className="h-11 w-full rounded-xl bg-[#FAFBFD] px-3 text-[11px] font-medium text-[#334155] outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25"
                    >
                      <option value="">차량 선택</option>
                      {VIP_REAL_VEHICLES.map(vehicle => (
                        <option key={vehicle.id} value={vehicle.plate}>{vehicle.plate} · {vehicle.modelShort}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#8491A3]">이 날짜의 담당 기사</span>
                    <select
                      value={selectedDriverId}
                      onChange={e => {
                        const chosen = drivers.find(driver => driver.id === e.target.value);
                        onAssignment(row.key, {
                          ...assignment,
                          driver: chosen ? { id: chosen.id, name: chosen.name, phone: chosen.phone, languages: chosen.languages, englishAvailable: chosen.englishAvailable } : null,
                        });
                      }}
                      disabled={isSubmitting}
                      aria-label={`${row.date} ${row.index + 1}호차 기사 배정`}
                      className="h-11 w-full rounded-xl bg-[#FAFBFD] px-3 text-[11px] font-medium text-[#334155] outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25"
                    >
                      <option value="">기사 선택</option>
                      {originalDriver && <option value={previous!.driverId}>{previous!.driverName} · 기존 담당자</option>}
                      {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name} · {driver.carNumber || '차량 미정'}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {eligibleRemovals.length > 0 && (
        <div className="mt-3 rounded-2xl bg-[#F8FAFC] p-3.5 sm:p-4">
          <div className="flex items-center gap-2">
            <FileClock className="h-4 w-4 text-[#8391A3]" strokeWidth={1.7}/>
            <h4 className="text-[12px] font-semibold text-[#334155]">수정본에 연결되지 않은 기존 일정</h4>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#7E8B9D]">
            파일에서 누락된 일정은 자동 취소하지 않습니다. 취소하려는 일정만 직접 선택해 주세요.
          </p>
          <div className="mt-3 space-y-3">
            {eligibleRemovals.map(item => {
              const checked = cancelIds.includes(item.scheduleId);
              return (
                <div key={item.scheduleId} className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" checked={checked} disabled={isSubmitting}
                      onChange={e => onCancel(item.scheduleId, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-[#1E60F3]"/>
                    <span className="text-[11px] leading-relaxed text-[#46566C]">
                      <strong className="font-semibold">{item.pickupDate} · {item.groupVehicleIndex || 1}호차</strong>
                      {' '} {item.vehiclePlate || '미배정'} · {item.pickupTime} {item.pickupLocation}
                    </span>
                  </label>
                  {checked && (
                    <input type="text" maxLength={240} value={cancelReasons[item.scheduleId] || ''}
                      onChange={e => onCancelReason(item.scheduleId, e.target.value)}
                      placeholder="취소 사유를 직접 입력해 주세요"
                      aria-label={`${item.pickupDate} ${item.groupVehicleIndex || 1}호차 취소 사유`}
                      className="h-11 w-full rounded-xl bg-white px-3.5 text-[12px] text-[#334155] shadow-[0_2px_8px_rgba(31,49,76,0.035)] outline-none placeholder:text-[#9AA6B6] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAssignments && (
        <div className="mt-5 space-y-3">
          <div className="flex items-start gap-2 text-[11px] leading-relaxed text-[#8090A2]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
            <p>승인하면 모든 날짜·차량 변경이 한 번에 저장됩니다. 저장 중 충돌·버전 변경이 발견되면 전체를 취소하고 원본을 유지합니다. 기사에게 자동 메시지를 보내지 않습니다.</p>
          </div>
          {cancelIds.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#F8FAFC] p-3 text-[11px] leading-relaxed text-[#334155]">
              <input type="checkbox" checked={cancelAcknowledged}
                onChange={e => setCancelAcknowledged(e.target.checked)}
                disabled={isSubmitting}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#1E60F3]"/>
              선택한 {cancelIds.length}건의 기존 배차가 취소되며, 담당 기사 화면에 취소 상태가 반영되는 것을 확인했습니다.
            </label>
          )}
          {pending > 0 && <p role="status" className="text-[11px] font-medium text-[#718096]">연결할 예약을 모두 선택해야 일괄 승인할 수 있습니다.</p>}
          <button type="button" onClick={onApprove} disabled={!canSubmit || isSubmitting}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1E60F3] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1954D5] disabled:cursor-not-allowed disabled:bg-[#DCE3EC] disabled:text-[#7D8B9D]">
            {isSubmitting ? '일괄 저장 중…' : `${rows.length - skipped}건 배차 · 일괄 승인`}
            {!isSubmitting && <ArrowRight className="h-4 w-4" strokeWidth={1.8}/>}
          </button>
          {onRequestUnassigned && <button type="button" onClick={onRequestUnassigned} disabled={!canSubmit || isSubmitting}
            className="min-h-10 w-full text-[12px] font-medium text-[#7D8B9D] transition-colors hover:text-[#334155] disabled:opacity-40">
            미배정으로 저장 요청
          </button>}
        </div>
      )}
      {!showAssignments && (
        <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-[#8492A4]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6}/>
          <p>연결 대상을 선택한 후 아래 원본 경로·날짜·TMAP 주소를 확인해 주세요. 마지막 단계에서 차량·기사도 날짜별로 조정할 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}
