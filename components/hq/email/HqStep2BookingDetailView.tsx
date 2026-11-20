'use client';

import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  ArrowLeft,
  BookmarkCheck,
  Search,
  CheckCircle2,
  X,
} from 'lucide-react';
import { AvailableDriverItem } from './HqDriverSelectModal';
import { HqEmailSummary, HqEmailDetail, HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import { emailDispatchDays } from '@/utils/emailDispatchPlan';
import { normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';
import { useFleetAvailabilityWindows } from '@/hooks/useFleetAvailability';
import { haptics } from '@/utils/haptics';
import { HqPlaceSearchInput, PoiResult } from '@/components/hq/HqPlaceSearchInput';
import {
  HqBadge,
  HqButton,
  HqCard,
  HqIconButton,
  HqInput,
  HqSegmentedTabs,
  type HqTabOption,
} from '@/components/hq/ui';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import { saveContactToCrm } from '@/utils/crmCustomerSync';
import {
  changeEmailRouteStopName,
  confirmEmailRouteStop,
  getEmailRouteStops,
  isVerifiedEmailRouteStop,
} from '@/utils/emailRoutePlaceVerification';
import {
  flightFromOriginal,
  syncActiveVehicleScheduleWaypoints,
} from '@/utils/emailCalendarGrid';
import { normalizeFlightCode } from '@/utils/emailFlightHint';
import { HqFlightInfoHint } from './HqFlightInfoHint';
import { HqStep5AssignmentPanel } from './HqStep5AssignmentPanel';

export interface VehicleSlotAssignment {
  slotIndex: number;
  vehicleModel: string;
  vehiclePlate?: string;
  driver: AvailableDriverItem | null;
  status: 'unassigned' | 'assigned';
  /** Explicit, date-scoped flight codes assigned to this vehicle. */
  assignedFlightKeys?: string[];
  sharedRouteConfirmed?: boolean;
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatIsoDayWithWeekday(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '날짜 미지정';
  const parsed = new Date(`${iso}T00:00:00Z`);
  const wd = Number.isNaN(parsed.getTime()) ? '' : ` (${WEEKDAYS_KO[parsed.getUTCDay()]})`;
  return `${iso}${wd}`;
}

function formatCompactMonthDay(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '날짜';
  const parsed = new Date(`${iso}T00:00:00Z`);
  const wd = Number.isNaN(parsed.getTime()) ? '' : `(${WEEKDAYS_KO[parsed.getUTCDay()]})`;
  return `${iso.slice(5)}${wd}`;
}

export interface HqStep2BookingDetailViewProps {
  emailSummary: HqEmailSummary;
  emailDetail?: HqEmailDetail | null;
  extractedDraft?: HqEmailExtractedDraft | null;
  vehicleSlots: VehicleSlotAssignment[];
  onOpenDriverModal: (slotIndex: number, requiredLanguage?: 'any' | 'english', availableDrivers?: import('@/utils/availabilityEngine').AvailableDriverItem[]) => void;
  onConfirmDispatch: () => void;
  onRequestAssignment?: () => void;
  onBackToStep1: () => void;
  onUpdateDraft?: (updated: HqEmailExtractedDraft) => void;
  onUpdateVehicleSlots?: (slots: VehicleSlotAssignment[]) => void;
  isDispatching?: boolean;
  dispatchError?: string | null;
  /** Multi-date/vehicle comparison replaces only the assignment action area. */
  batchReview?: React.ReactNode;
  // Backward compatibility
  emailItem?: any;
}

export const HqStep2BookingDetailView: React.FC<HqStep2BookingDetailViewProps> = ({
  emailSummary,
  extractedDraft,
  vehicleSlots,
  onOpenDriverModal,
  onConfirmDispatch,
  onRequestAssignment,
  onBackToStep1,
  onUpdateDraft,
  onUpdateVehicleSlots,
  isDispatching = false,
  dispatchError = null,
  batchReview,
}) => {
  let availabilityWindows: Array<{ startDate: string; startTime: string; endDate: string; endTime: string }> = [];
  let availabilityPlanError: string | undefined;
  let dispatchDays: ReturnType<typeof emailDispatchDays> = [];
  let dispatchDaysError: string | undefined;

  try {
    if (extractedDraft) {
      dispatchDays = emailDispatchDays(extractedDraft);
      availabilityWindows = dispatchDays.map(day => ({
        startDate: day.date,
        startTime: day.start.time || '',
        endDate: day.date,
        endTime: day.endTime,
      }));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '일정 날짜를 확인해 주세요.';
    availabilityPlanError = msg;
    dispatchDaysError = msg;
  }

  // A revised reservation must not conflict with its own vehicle and driver.
  // All *other* bookings remain part of the server-side availability check.
  const fleet = useFleetAvailabilityWindows(availabilityWindows, extractedDraft?.revisionMatchedScheduleId);
  const [selectedLanguage, setSelectedLanguage] = useState<'any' | 'english'>(() => {
    if (extractedDraft?.requestedLanguage) return extractedDraft.requestedLanguage === 'en' ? 'english' : 'any';
    return /영어|english|외국인/i.test(extractedDraft?.specialRequests || '') ? 'english' : 'any';
  });
  const [selectedRouteDate, setSelectedRouteDate] = useState<string>('all');
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [isSavingCrm, setIsSavingCrm] = useState(false);
  const [crmSavedNotice, setCrmSavedNotice] = useState<string | null>(null);

  // Auto-sync language if draft specialRequests updates
  React.useEffect(() => {
    if (extractedDraft?.requestedLanguage) {
      setSelectedLanguage(extractedDraft.requestedLanguage === 'en' ? 'english' : 'any');
      return;
    }
    setSelectedLanguage(/영어|english|외국인/i.test(extractedDraft?.specialRequests || '') ? 'english' : 'any');
  }, [extractedDraft?.requestedLanguage, extractedDraft?.specialRequests]);

  React.useEffect(() => {
    if (selectedRouteDate !== 'all' && !dispatchDays.some(d => d.date === selectedRouteDate)) {
      setSelectedRouteDate('all');
    }
  }, [dispatchDays, selectedRouteDate]);

  const changeDriverLanguage = (value: 'any' | 'english') => {
    setSelectedLanguage(value);
    if (extractedDraft) onUpdateDraft?.({ ...extractedDraft, requestedLanguage: value === 'english' ? 'en' : 'ko' });
  };

  // Disambiguated Customer & Contact Entities
  const companyName = extractedDraft?.companyName || '미등록 고객사';
  const contactName = extractedDraft?.contactName || '담당자 미지정';
  const contactPhone = extractedDraft?.contactPhone || '연락처 미등록';
  const contactEmail = extractedDraft?.contactEmail || emailSummary?.from?.address || '이메일 미등록';
  const contactSource = extractedDraft?.contactSource || 'from';

  const bookingDate = extractedDraft?.pickupDate || '날짜 미지정';
  const bookingTime = extractedDraft?.pickupTime || '시간 미지정';
  const specialRequests = extractedDraft?.specialRequests || '특이사항 없음';

  const passengerDisplayName =
    extractedDraft?.passengerNames && extractedDraft.passengerNames.length > 0
      ? extractedDraft.passengerNames.join(', ')
      : extractedDraft?.passengerName || '탑승객 미입력';
  const passengerPhone = extractedDraft?.passengerPhone || '연락처 미입력';
  const passengerCount = extractedDraft?.passengerCount ?? 1;
  const flightNumber = extractedDraft?.flightNumber || '';
  const hasMultipleDates = dispatchDays.length > 1;
  const servicePeriodLabel = hasMultipleDates
    ? `${dispatchDays[0].date} ~ ${dispatchDays[dispatchDays.length - 1].date} (${dispatchDays.length}일)`
    : bookingDate;

  const bookingCode = extractedDraft?.id
    ? `BK-${(extractedDraft.pickupDate || '20261028').replace(/-/g, '')}-${extractedDraft.id.slice(-3).toUpperCase()}`
    : `BK-${(emailSummary?.id || 'REF01').slice(-6).toUpperCase()}`;

  const stopLookup = useMemo(() => {
    if (!extractedDraft) return new Map<string, ReturnType<typeof getEmailRouteStops>[number]>();
    return new Map(getEmailRouteStops(extractedDraft).map(stop => [stop.id, stop]));
  }, [extractedDraft]);

  const totalStopCount = useMemo(
    () => dispatchDays.reduce((sum, day) => sum + day.points.length, 0),
    [dispatchDays],
  );

  const unconfirmedCount = useMemo(
    () => [...stopLookup.values()].filter(stop => !isVerifiedEmailRouteStop(stop)).length,
    [stopLookup],
  );

  const dateFilterTabs: HqTabOption[] = useMemo(() => [
    { id: 'all', label: '전체', count: dispatchDays.length },
    ...dispatchDays.map(day => ({
      id: day.date,
      label: formatCompactMonthDay(day.date),
      count: day.points.length,
    })),
  ], [dispatchDays]);

  const visibleDays = useMemo(
    () => (selectedRouteDate === 'all' ? dispatchDays : dispatchDays.filter(d => d.date === selectedRouteDate)),
    [dispatchDays, selectedRouteDate],
  );

  const hasAssignedDriver = vehicleSlots.length > 0 && vehicleSlots.every((slot) => slot.driver !== null);

  // Handle Save To CRM - Requires verified company & contact (Awaits server DB confirmation)
  const handleSaveToCrm = async () => {
    if (!extractedDraft || isSavingCrm) return;

    const cleanCompany = (extractedDraft.companyName || '').trim();
    const cleanContact = (extractedDraft.contactName || '').trim();

    if (!cleanCompany || cleanCompany === '확인 필요' || cleanCompany === '미등록 고객사') {
      haptics.errorAlert();
      setCrmSavedNotice('고객사명이 확인되지 않았습니다. 원문 확인 후 고객사명을 먼저 입력해 주세요.');
      return;
    }

    if (!cleanContact || cleanContact === '확인 필요' || cleanContact === '담당자 미지정') {
      haptics.errorAlert();
      setCrmSavedNotice('예약 담당자명이 확인되지 않았습니다. 원문 확인 후 담당자명을 먼저 입력해 주세요.');
      return;
    }

    try {
      setIsSavingCrm(true);
      const result = await saveContactToCrm({
        companyName: cleanCompany,
        contactName: cleanContact,
        contactPhone: extractedDraft.contactPhone || '',
        contactEmail: extractedDraft.contactEmail || '',
        notes: `예약 상세 화면에서 CRM 수동 저장 (예약번호: ${bookingCode})`,
        sourceDraftId: extractedDraft.id,
      });

      if (result.success) {
        haptics.success();
        setCrmSavedNotice(result.message);
        const updated: HqEmailExtractedDraft = {
          ...extractedDraft,
          clientId: result.clientId,
          contactId: result.contactId,
          isSavedToCrm: true,
        };
        onUpdateDraft?.(updated);
      } else {
        haptics.errorAlert();
        setCrmSavedNotice(result.message || '고객 관리에 저장하지 못했습니다.');
      }
    } catch (err: any) {
      haptics.errorAlert();
      setCrmSavedNotice(err.message || '고객 관리에 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingCrm(false);
      setTimeout(() => {
        setCrmSavedNotice(null);
      }, 4500);
    }
  };

  const applyStopLocationName = (stopId: string, location: string) => {
    if (!extractedDraft) return;
    const next = changeEmailRouteStopName(extractedDraft, stopId, location);
    onUpdateDraft?.(syncActiveVehicleScheduleWaypoints(next, next.waypoints || []));
  };

  const applyStopPoi = (stopId: string, poi: PoiResult) => {
    if (!extractedDraft) return;
    const next = confirmEmailRouteStop(extractedDraft, stopId, poi);
    onUpdateDraft?.(syncActiveVehicleScheduleWaypoints(next, next.waypoints || []));
    setEditingStopId(null);
  };

  const applyStopTime = (stopId: string, nextTime: string) => {
    if (!extractedDraft) return;
    if (extractedDraft.waypoints && extractedDraft.waypoints.length >= 2) {
      const sorted = [...extractedDraft.waypoints].sort((a, b) => a.order - b.order);
      const firstId = sorted[0].id;
      const updatedWaypoints = sorted.map(wp => (wp.id === stopId ? { ...wp, time: nextTime } : wp));
      const next: HqEmailExtractedDraft = {
        ...extractedDraft,
        waypoints: updatedWaypoints,
        ...(stopId === firstId ? { pickupTime: nextTime } : {}),
      };
      onUpdateDraft?.(syncActiveVehicleScheduleWaypoints(next, updatedWaypoints));
      return;
    }
    if (stopId === 'pickup') {
      onUpdateDraft?.({ ...extractedDraft, pickupTime: nextTime });
    } else if (stopId === 'dropoff') {
      onUpdateDraft?.({
        ...extractedDraft,
        dayEndTimes: { ...extractedDraft.dayEndTimes, [extractedDraft.pickupDate]: nextTime },
      });
    }
  };

  const handleConfirm = () => {
    if (!hasAssignedDriver) {
      haptics.errorAlert();
      return;
    }
    haptics.success();
    onConfirmDispatch();
  };

  const findStopFlightHintProps = (point: RouteWaypointItem, dayDate: string) => {
    const raw = [point.notes, point.location].filter(Boolean).join('\n');
    const parsedFromNotes = flightFromOriginal(raw);
    const matchingFlight = (extractedDraft?.flights || []).find(f =>
      f.date === dayDate &&
      (parsedFromNotes?.flightNumber
        ? f.flightNumber.replace(/[\s-]/g, '').toUpperCase() === parsedFromNotes.flightNumber
        : /공항|airport|GMP|ICN/i.test(point.location))
    );
    if (matchingFlight) {
      return {
        flightNumber: matchingFlight.flightNumber,
        date: matchingFlight.date,
        role: matchingFlight.role,
        originAirport: matchingFlight.originAirport,
        destinationAirport: matchingFlight.destinationAirport,
        scheduledArrival: matchingFlight.scheduledArrival,
        scheduledDeparture: matchingFlight.scheduledDeparture,
      };
    }
    if (parsedFromNotes?.flightNumber) {
      return {
        flightNumber: parsedFromNotes.flightNumber,
        date: dayDate,
        role: parsedFromNotes.role,
        originAirport: parsedFromNotes.originAirport,
        destinationAirport: parsedFromNotes.destinationAirport,
        scheduledArrival: parsedFromNotes.role === 'arrival' ? point.time : undefined,
        scheduledDeparture: parsedFromNotes.role === 'departure' ? point.time : undefined,
      };
    }
    return null;
  };

  const normalizedDraftFlights = (extractedDraft?.flights || []).filter(f => normalizeFlightCode(f.flightNumber));
  const fallbackFlightCode = normalizeFlightCode(flightNumber);

  return (
    <div className="space-y-5">
      {/* Step 5: assignment-focused mobile-first header */}
      <div className="flex items-center gap-3 pb-1">
        <HqIconButton
          variant="secondary"
          size="sm"
          onClick={onBackToStep1}
          aria-label="예약 확정 화면으로 돌아가기"
        >
          <ArrowLeft className="h-4 w-4 text-[#61728A]" />
        </HqIconButton>
        <div>
          <h2 className="text-lg font-black tracking-tight text-[#17233B]">기사님 배정</h2>
          <p className="mt-0.5 text-xs font-medium text-[#61728A]">차량과 기사님을 선택하고 운행 일정을 확인한 뒤 배차를 확정하세요.</p>
        </div>
      </div>

      {/* CRM Notice Feedback */}
      {crmSavedNotice && <HqInlineFeedback message={crmSavedNotice} tone="info" />}

      {/* Dispatch Error Notification */}
      {dispatchError && (
        <div className="space-y-1.5">
          <HqInlineFeedback message={`배차 등록 오류: ${dispatchError}`} tone="error" />
          {/주소|좌표|경유지|위치|POI|TMAP/i.test(dispatchError) && (
            <a href="#email-route-place-verification" className="inline-block pl-1 text-xs font-semibold underline underline-offset-2 text-[#1E60F3]">
              아래 운행 경로에서 TMAP 주소 확인하기
            </a>
          )}
        </div>
      )}

      {batchReview || (
        <HqStep5AssignmentPanel
          slots={vehicleSlots}
          draft={extractedDraft}
          onUpdateDraft={onUpdateDraft}
          vehicles={fleet.data?.vehicles}
          loading={fleet.loading}
          fleetError={availabilityPlanError || fleet.error}
          fleetNotice={!availabilityPlanError ? fleet.notice : undefined}
          language={selectedLanguage}
          onLanguageChange={changeDriverLanguage}
          onUpdateSlots={onUpdateVehicleSlots}
          onSelectDriver={(slotIndex, requiredLanguage) => onOpenDriverModal(slotIndex, requiredLanguage, fleet.data?.drivers || [])}
          onRequestHelp={onRequestAssignment}
          onConfirm={handleConfirm}
          isDispatching={isDispatching}
        />
      )}

      {/* Unified Booking Summary + Date-Grouped TMAP-Editable Schedule */}
      <HqCard className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E1E7F0]/50">
          <div>
            <h3 className="text-[15px] font-bold text-[#17233B]">예약 기본 정보 · 운행 일정</h3>
            <p className="mt-0.5 text-[11px] font-medium text-[#73839D]">
              날짜별 일정을 확인하고 TMAP 검색으로 출발·방문 장소를 바로 수정할 수 있습니다.
            </p>
          </div>
          <HqButton
            variant={extractedDraft?.isSavedToCrm ? 'subtle' : 'secondary'}
            size="sm"
            onClick={handleSaveToCrm}
            disabled={extractedDraft?.isSavedToCrm || isSavingCrm}
            title="고객 관리에 회사 및 담당자 정보를 저장하거나 연결합니다"
            className={extractedDraft?.isSavedToCrm ? 'text-emerald-700 bg-emerald-50' : 'text-[#1E60F3]'}
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>
              {isSavingCrm
                ? '저장 중...'
                : extractedDraft?.isSavedToCrm
                ? '고객 관리 연결됨'
                : '고객 관리에 저장'}
            </span>
          </HqButton>
        </div>

        {/* Basic Info Grid */}
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#73839D] font-medium">예약 번호</span>
            <span className="font-mono font-bold text-[#17233B]">{bookingCode}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#73839D] font-medium">고객사</span>
            <span className="font-bold text-[#17233B] text-right">{companyName}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="hq-booking-event-title" className="shrink-0 font-medium text-[#73839D]">행사명</label>
            <HqInput
              id="hq-booking-event-title"
              type="text"
              maxLength={160}
              aria-label="행사명 수정"
              value={extractedDraft?.eventName || ''}
              onChange={(e) => extractedDraft && onUpdateDraft?.({ ...extractedDraft, eventName: e.target.value })}
              placeholder="행사명 입력 (미입력 시 고객사명)"
              className="hq-compact-input min-h-9 w-[66%] sm:w-[68%] bg-[#F7F9FC] text-right text-xs font-semibold placeholder:text-[11px] sm:placeholder:text-xs"
            />
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[#73839D] font-medium pt-0.5 shrink-0">예약 담당자</span>
            <div className="text-right min-w-0">
              <div className="font-bold text-[#17233B]">
                {contactName}
                <span className="text-[#73839D] font-normal ml-1">
                  ({contactSource === 'signature' ? '서명' : contactSource === 'body' ? '본문' : '발신 헤더'})
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[11px] text-[#73839D] font-medium">
                <span>{contactPhone || '연락처 미등록'}</span>
                <span aria-hidden="true">·</span>
                <span className="break-all">{contactEmail || '이메일 없음'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#73839D] font-medium">운행 기간</span>
            <span className="font-bold text-[#17233B]">{servicePeriodLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#73839D] font-medium">첫 픽업 시간</span>
            <span className="font-bold text-[#17233B] tabular-nums">{bookingTime}</span>
          </div>
        </div>

        {/* Date-grouped Schedule Timeline with inline TMAP Search Editing */}
        <section id="email-route-place-verification" className="space-y-3 pt-2 border-t border-[#E1E7F0]/50" aria-label="날짜별 운행 경로">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#1E60F3] shrink-0" />
              <h4 className="text-[13px] font-bold text-[#17233B]">운행 경로</h4>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <HqBadge tone="selected">
                {dispatchDays.length || 1}일 · {totalStopCount}개 일정
              </HqBadge>
              <HqBadge tone={unconfirmedCount > 0 ? 'warning' : 'selected'}>
                {unconfirmedCount > 0 ? `TMAP 미확정 ${unconfirmedCount}곳` : '전 구간 확정'}
              </HqBadge>
            </div>
          </div>

          {dispatchDays.length > 1 && (
            <div className="overflow-x-auto pb-0.5">
              <HqSegmentedTabs
                aria-label="운행 날짜 선택"
                value={selectedRouteDate}
                onValueChange={setSelectedRouteDate}
                tabs={dateFilterTabs}
                className="w-max min-w-full sm:w-auto"
              />
            </div>
          )}

          {dispatchDaysError ? (
            <HqInlineFeedback message={dispatchDaysError} tone="error" />
          ) : (
            <div className="space-y-3">
              {visibleDays.map((day) => {
                const startClock = normalizeTimeHHmm(day.start.time);
                const endClock = normalizeTimeHHmm(day.endTime);
                const endTimeInvalid = !endClock || (Boolean(startClock) && endClock <= startClock);

                return (
                  <HqCard key={day.date} tone="muted" className="p-3.5 sm:p-4 space-y-3 border border-[#E1E7F0]/70">
                    {/* Day Header + Compact End Time Control */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E1E7F0]/60">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF3FF] px-3 py-1 text-xs font-bold text-[#1E60F3]">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>{formatIsoDayWithWeekday(day.date)}</span>
                        </span>
                        <HqBadge tone="neutral">{day.points.length}개</HqBadge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#E1E7F0] px-2.5 py-1.5 text-[11px] font-semibold text-[#61728A] hover:border-[#1E60F3]/40 transition-colors cursor-pointer">
                          <span>종료</span>
                          <Clock className="h-3 w-3 text-[#8FA0B8]" />
                          <input
                            type="time"
                            aria-label={`${day.date} 실제 종료 시간`}
                            value={endClock || day.endTime || ''}
                            onChange={(event) => {
                              if (!extractedDraft) return;
                              onUpdateDraft?.({
                                ...extractedDraft,
                                dayEndTimes: { ...extractedDraft.dayEndTimes, [day.date]: event.target.value },
                              });
                            }}
                            className="bg-transparent text-xs font-bold text-[#17233B] outline-none tabular-nums cursor-pointer"
                          />
                        </label>
                        {endTimeInvalid && <HqBadge tone="warning">종료 시간 확인</HqBadge>}
                      </div>
                    </div>

                    {/* Stops Timeline */}
                    <ol className="space-y-2.5">
                      {day.points.map((point, pointIdx) => {
                        const stopMeta = stopLookup.get(point.id);
                        const isConfirmed = stopMeta ? isVerifiedEmailRouteStop(stopMeta) : Boolean(point.isPoiConfirmed);
                        const isEditing = editingStopId === point.id;
                        const stopFlight = findStopFlightHintProps(point, day.date);
                        const stopClock = normalizeTimeHHmm(point.time) || point.time || '';

                        return (
                          <li
                            key={point.id}
                            className="rounded-[16px] bg-white border border-[#E1E7F0]/70 p-3 shadow-[0_2px_8px_rgba(35,49,78,0.03)] space-y-2.5 transition-colors"
                          >
                            <div className="flex items-start gap-2.5">
                              {/* Timeline Index Badge */}
                              <span
                                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                  isConfirmed
                                    ? 'bg-[#1E60F3] text-white'
                                    : 'bg-[#EEF3FF] text-[#1E60F3] border border-[#1E60F3]/25'
                                }`}
                              >
                                {pointIdx + 1}
                              </span>

                              {/* Stop Content */}
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                                    <label className="inline-flex items-center gap-1 rounded-lg bg-[#F7F9FC] px-2 py-0.5 text-[11px] font-bold text-[#59708F] hover:bg-[#EDF2FA] cursor-pointer">
                                      <Clock className="h-3 w-3 text-[#8FA0B8] shrink-0" />
                                      <input
                                        type="time"
                                        aria-label={`${day.date} ${pointIdx + 1}번째 일정 시간`}
                                        value={stopClock}
                                        onChange={(e) => applyStopTime(point.id, e.target.value)}
                                        className="bg-transparent text-[11px] font-bold text-[#17233B] outline-none tabular-nums cursor-pointer"
                                      />
                                    </label>
                                    <span className="text-[13px] font-bold text-[#17233B] break-words">
                                      {point.location || '장소 미입력'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <HqBadge tone={isConfirmed ? 'selected' : 'warning'}>
                                      {isConfirmed ? (
                                        <>
                                          <CheckCircle2 className="h-3 w-3" />
                                          <span>TMAP 확정</span>
                                        </>
                                      ) : (
                                        <span>TMAP 미확정</span>
                                      )}
                                    </HqBadge>
                                    <HqButton
                                      variant={isEditing ? 'secondary' : 'subtle'}
                                      size="sm"
                                      onClick={() => setEditingStopId(isEditing ? null : point.id)}
                                      disabled={isDispatching || !onUpdateDraft}
                                      className="min-h-8 px-2.5 text-[11px]"
                                    >
                                      {isEditing ? (
                                        <>
                                          <X className="h-3 w-3" />
                                          <span>닫기</span>
                                        </>
                                      ) : (
                                        <>
                                          <Search className="h-3 w-3" />
                                          <span>{isConfirmed ? '변경' : 'TMAP 검색'}</span>
                                        </>
                                      )}
                                    </HqButton>
                                  </div>
                                </div>

                                {/* Address or Client Hint */}
                                {isConfirmed && stopMeta?.address ? (
                                  <p className="text-[11px] font-medium text-[#61728A] break-words">
                                    {stopMeta.address}
                                  </p>
                                ) : (stopMeta?.clientAddress || point.clientAddress) ? (
                                  <p className="text-[11px] font-medium text-[#73839D] break-words">
                                    원본 기재: {stopMeta?.clientAddress || point.clientAddress}
                                  </p>
                                ) : null}

                                {/* Flight Info API Hint beside airport stops */}
                                {stopFlight && (
                                  <div className="pt-0.5">
                                    <HqFlightInfoHint
                                      flightNumber={stopFlight.flightNumber}
                                      date={stopFlight.date}
                                      role={stopFlight.role}
                                      originAirport={stopFlight.originAirport}
                                      destinationAirport={stopFlight.destinationAirport}
                                      scheduledArrival={stopFlight.scheduledArrival}
                                      scheduledDeparture={stopFlight.scheduledDeparture}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Inline TMAP Place Search Editor */}
                            {isEditing && extractedDraft && (
                              <div className="pt-2 border-t border-[#E1E7F0]/60 space-y-1.5">
                                <HqPlaceSearchInput
                                  value={point.location}
                                  isConfirmed={isConfirmed}
                                  autoSearch={!isConfirmed}
                                  disabled={isDispatching || !onUpdateDraft}
                                  addressHint={stopMeta?.clientAddress || point.clientAddress}
                                  heightClass="h-11 rounded-[12px]"
                                  icon="mapPin"
                                  placeholder="TMAP 장소명 또는 도로명 주소 검색"
                                  onChange={(loc) => applyStopLocationName(point.id, loc)}
                                  onSelectPoi={(poi) => applyStopPoi(point.id, poi)}
                                />
                                {(stopMeta?.clientAddress || point.clientAddress) && (
                                  <p className="text-[11px] text-[#73839D] pl-1">
                                    검색 힌트: {stopMeta?.clientAddress || point.clientAddress}
                                  </p>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </HqCard>
                );
              })}
            </div>
          )}
        </section>

        <div className="pt-1 text-xs">
          <span className="text-[#73839D] font-medium block mb-1">요청 사항</span>
          <p className="font-bold text-[#17233B] leading-snug break-words">
            {specialRequests || '요청 사항 없음'}
          </p>
        </div>
      </HqCard>

      {/* Card 2: 추가 정보 */}
      <HqCard className="p-4 sm:p-6 space-y-3.5">
        <h3 className="text-[15px] font-bold text-[#17233B]">추가 정보</h3>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-0.5">
          <span className="text-[#61728A] font-medium">기사 언어 조건</span>
          <HqSegmentedTabs
            aria-label="추가 정보 기사 언어 조건"
            value={selectedLanguage}
            onValueChange={(value) => changeDriverLanguage(value as 'any' | 'english')}
            tabs={[
              { id: 'any', label: '무관' },
              { id: 'english', label: '영어 가능' },
            ]}
          />
        </div>

        <div className="space-y-2.5 text-xs pt-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#73839D] font-medium">탑승객 수</span>
            <span className="font-bold text-[#17233B]">{passengerCount}명</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#73839D] font-medium">탑승객명</span>
            <span className="font-bold text-[#17233B] text-right">{passengerDisplayName}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#73839D] font-medium">탑승객 연락처</span>
            <span className="font-medium text-[#61728A]">{passengerPhone || '연락처 미입력'}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[#73839D] font-medium shrink-0 pt-0.5">항공편명</span>
            <div className="min-w-0 text-right space-y-1">
              {normalizedDraftFlights.length > 0 ? (
                normalizedDraftFlights.map((flight, index) => (
                  <div key={`${flight.date}-${flight.flightNumber}-${index}`} className="flex flex-wrap items-center justify-end gap-1.5">
                    <span className="font-mono font-bold text-[#1E60F3]">{flight.flightNumber}</span>
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
                ))
              ) : fallbackFlightCode ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <span className="font-mono font-bold text-[#1E60F3]">{fallbackFlightCode}</span>
                  <HqFlightInfoHint flightNumber={fallbackFlightCode} date={bookingDate} />
                </div>
              ) : (
                <span className="font-medium text-[#73839D]">항공편 없음</span>
              )}
            </div>
          </div>
        </div>
      </HqCard>
    </div>
  );
};
