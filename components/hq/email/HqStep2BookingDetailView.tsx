'use client';

import React, { useState } from 'react';
import {
  Car,
  Copy,
  Edit,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  ChevronDown,
  Info,
  CheckCircle2,
  ArrowLeft,
  User,
  Plus,
  Layers,
  Star,
  AlertCircle,
  Loader2,
  Building2,
  UserCheck,
  BookmarkCheck,
} from 'lucide-react';
import { AvailableDriverItem, driverSupportsEnglish } from './HqDriverSelectModal';
import { HqEmailSummary, HqEmailDetail, HqEmailExtractedDraft } from '@/types/emailHq';
import { emailDispatchDays } from '@/utils/emailDispatchPlan';
import { normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';
import { useFleetAvailabilityWindows } from '@/hooks/useFleetAvailability';
import { VEHICLE_STATUS_LABELS } from '@/utils/fleetVehicleStatus';
import { haptics } from '@/utils/haptics';
import { HqPlaceSearchInput, PoiResult } from '@/components/hq/HqPlaceSearchInput';
import { saveContactToCrm } from '@/utils/crmCustomerSync';
import { HqStep5AssignmentPanel } from './HqStep5AssignmentPanel';
import { HqEmailVehicleRouteEditor } from './HqEmailVehicleRouteEditor';

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

function formatKoreanAmPmTime(time?: string | null): string {
  if (!time) return '';
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (!match) return time;
  const hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours < 12 ? '오전' : '오후';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${ampm} ${String(displayHours).padStart(2, '0')}:${minutes}`;
}

export interface HqStep2BookingDetailViewProps {
  emailSummary: HqEmailSummary;
  emailDetail?: HqEmailDetail | null;
  extractedDraft?: HqEmailExtractedDraft | null;
  vehicleSlots: VehicleSlotAssignment[];
  onOpenDriverModal: (slotIndex: number, requiredLanguage?: 'any' | 'english', availableDrivers?: import('@/utils/availabilityEngine').AvailableDriverItem[]) => void;
  onConfirmDispatch: () => void;
  onRequestAssignment?:()=>void;
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
  emailDetail,
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
  try {
    if (extractedDraft) availabilityWindows = emailDispatchDays(extractedDraft).map(day => ({ startDate: day.date, startTime: day.start.time || '', endDate: day.date, endTime: day.endTime }));
  } catch { /* The date editor below shows the validation error. */ }
  // A revised reservation must not conflict with its own vehicle and driver.
  // All *other* bookings remain part of the server-side availability check.
  const fleet = useFleetAvailabilityWindows(availabilityWindows, extractedDraft?.revisionMatchedScheduleId);
  const [activeSubTab, setActiveSubTab] = useState<'assign' | 'schedule' | 'history'>('assign');
  const [selectedLanguage, setSelectedLanguage] = useState<'any' | 'english'>(() => {
    if (extractedDraft?.requestedLanguage) return extractedDraft.requestedLanguage === 'en' ? 'english' : 'any';
    return /영어|english|외국인/i.test(extractedDraft?.specialRequests || '') ? 'english' : 'any';
  });
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

  const changeDriverLanguage = (value:'any'|'english') => {
    setSelectedLanguage(value);
    if (extractedDraft) onUpdateDraft?.({...extractedDraft, requestedLanguage:value==='english'?'en':'ko'});
  };

  // Vehicle slot manipulation handlers
  const handleAddVehicleSlot = () => {
    haptics.lightTap();
    const next: VehicleSlotAssignment[] = [
      ...vehicleSlots,
      {
        slotIndex: vehicleSlots.length,
        vehicleModel: '차량 미지정',
        driver: null,
        status: 'unassigned',
      },
    ];
    onUpdateVehicleSlots?.(next);
  };

  const handleRemoveVehicleSlot = (indexToRemove: number) => {
    if (vehicleSlots.length <= 1) return;
    haptics.lightTap();
    const next = vehicleSlots
      .filter((_, idx) => idx !== indexToRemove)
      .map((slot, idx) => ({ ...slot, slotIndex: idx }));
    onUpdateVehicleSlots?.(next);
  };

  const handleUpdateSlotModel = (index: number, newModel: string) => {
    const next = [...vehicleSlots];
    if (next[index]) {
      next[index] = { ...next[index], vehicleModel: newModel };
      onUpdateVehicleSlots?.(next);
    }
  };

  // Disambiguated Customer & Contact Entities
  const companyName = extractedDraft?.companyName || '미등록 고객사';
  const contactName = extractedDraft?.contactName || '담당자 미지정';
  const contactPhone = extractedDraft?.contactPhone || '연락처 미등록';
  const contactEmail = extractedDraft?.contactEmail || emailSummary?.from?.address || '이메일 미등록';
  const contactSource = extractedDraft?.contactSource || 'from';

  const bookingDate = extractedDraft?.pickupDate || '날짜 미지정';
  const bookingTime = extractedDraft?.pickupTime || '시간 미지정';

  const pickupLocation = extractedDraft?.pickupLocation || '';
  const pickupDetailNotes = extractedDraft?.pickupDetailNotes || '';
  const isPickupPoiConfirmed = Boolean(extractedDraft?.isPickupPoiConfirmed);

  const dropoffLocation = extractedDraft?.dropoffLocation || '';
  const dropoffDetailNotes = extractedDraft?.dropoffDetailNotes || '';
  const isDropoffPoiConfirmed = Boolean(extractedDraft?.isDropoffPoiConfirmed);

  const specialRequests = extractedDraft?.specialRequests || '특이사항 없음';

  const passengerName = extractedDraft?.passengerName || '탑승객 미입력';
  const passengerPhone = extractedDraft?.passengerPhone || '연락처 미입력'; // Strictly phone or empty, NEVER email!
  const passengerCount = extractedDraft?.passengerCount ?? 1;
  const flightNumber = extractedDraft?.flightNumber || '항공편 없음';

  const bookingCode = extractedDraft?.id
    ? `BK-${(extractedDraft.pickupDate || '20261028').replace(/-/g, '')}-${extractedDraft.id.slice(-3).toUpperCase()}`
    : `BK-${(emailSummary?.id || 'REF01').slice(-6).toUpperCase()}`;

  // Check if at least one driver is assigned
  const hasAssignedDriver = vehicleSlots.length > 0 && vehicleSlots.every((slot) => slot.driver !== null);

  // Handle Save To CRM (#21) - Requires verified company & contact (Awaits server DB confirmation)
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

  const updateDraftRoute = (updated: HqEmailExtractedDraft) => {
    const points = updated.waypoints || [];
    const first = points[0], last = points[points.length - 1];
    onUpdateDraft?.(
      first && last
        ? {
            ...updated,
            pickupTime: first.time || updated.pickupTime,
            pickupLocation: first.location,
            pickupLat: first.lat,
            pickupLng: first.lng,
            isPickupPoiConfirmed: first.isPoiConfirmed,
            dropoffLocation: last.location,
            dropoffLat: last.lat,
            dropoffLng: last.lng,
            isDropoffPoiConfirmed: last.isPoiConfirmed,
          }
        : updated
    );
  };
  const handleSelectPickupPoi = (poi: PoiResult) => {
    if (!extractedDraft) return;
    const updated: HqEmailExtractedDraft = {
      ...extractedDraft,
      pickupLocation: poi.name,
      waypoints:extractedDraft.waypoints?.map((point,index)=>index===0?{...point,location:poi.name,lat:poi.lat,lng:poi.lng,isPoiConfirmed:true}:point),
      pickupLat: poi.lat,
      pickupLng: poi.lng,
      isPickupPoiConfirmed: true,
    };
    onUpdateDraft?.(updated);
  };

  const handleSelectDropoffPoi = (poi: PoiResult) => {
    if (!extractedDraft) return;
    const updated: HqEmailExtractedDraft = {
      ...extractedDraft,
      dropoffLocation: poi.name,
      waypoints:extractedDraft.waypoints?.map((point,index)=>index===(extractedDraft.waypoints?.length || 0)-1?{...point,location:poi.name,lat:poi.lat,lng:poi.lng,isPoiConfirmed:true}:point),
      dropoffLat: poi.lat,
      dropoffLng: poi.lng,
      isDropoffPoiConfirmed: true,
    };
    onUpdateDraft?.(updated);
  };

  const handleConfirm = () => {
    if (!hasAssignedDriver) {
      haptics.errorAlert();
      return;
    }
    haptics.success();
    onConfirmDispatch();
  };

  return (
    <div className="bg-slate-50/60 rounded-[28px] border border-slate-200/80 p-5 sm:p-6 space-y-5">
      {/* Step 5: assignment-focused mobile-first header */}
      <div className="flex items-center gap-3 pb-1">
        <button
          type="button"
          onClick={onBackToStep1}
          aria-label="예약 확정 화면으로 돌아가기"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-slate-200/80 text-slate-500 hover:bg-slate-50 hover:text-slate-800 shadow-2xs transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900">기사님 배정</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">차량과 기사님을 선택하고 배차를 확정하세요.</p>
        </div>
      </div>

      {/* CRM Notice Feedback */}
      {crmSavedNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{crmSavedNotice}</span>
        </div>
      )}

      {/* Dispatch Error Notification */}
      {dispatchError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-800 text-xs font-bold animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <div className="flex-1">
            <span className="font-extrabold block">배차 등록 오류</span>
            <span className="font-normal text-rose-700">{dispatchError}</span>
            {/주소|좌표|경유지|위치|POI|TMAP/i.test(dispatchError) && (
              <a href="#email-route-place-verification" className="mt-1.5 inline-block text-xs font-medium underline underline-offset-2 text-rose-700">
                아래 운행 경로에서 주소 확인하기
              </a>
            )}
          </div>
        </div>
      )}

      {batchReview || (
      <HqStep5AssignmentPanel
        slots={vehicleSlots}
        draft={extractedDraft}
        onUpdateDraft={onUpdateDraft}
        vehicles={fleet.data?.vehicles}
        loading={fleet.loading}
        fleetError={fleet.error}
        language={selectedLanguage}
        onLanguageChange={changeDriverLanguage}
        onUpdateSlots={onUpdateVehicleSlots}
        onSelectDriver={(slotIndex, requiredLanguage) => onOpenDriverModal(slotIndex, requiredLanguage, fleet.data?.drivers || [])}
        onRequestHelp={onRequestAssignment}
        onConfirm={handleConfirm}
        isDispatching={isDispatching}
      />
      )}

      {/* Section 1: 날짜별 장소·종료시간 확인 (Reference 1) */}
      <details className="group rounded-[28px] bg-white border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-5 sm:p-6 transition-all" open>
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm sm:text-base font-bold text-slate-900 marker:hidden">
          <span className="group-open:hidden">날짜별 일정·종료시간 다시 확인</span>
          <span className="hidden group-open:inline">날짜별 장소·종료시간 확인</span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        {extractedDraft && (
          <section className="mt-4 space-y-6">
            {(() => {
              try {
                if (extractedDraft.vehicleRoutes?.length) {
                  return <HqEmailVehicleRouteEditor draft={extractedDraft} onUpdateDraft={onUpdateDraft} compact />;
                }
                return emailDispatchDays(extractedDraft).map((day) => (
                  <div key={day.date} className="space-y-3">
                    <p className="text-sm font-bold text-slate-900">{day.date}</p>
                    <div className="space-y-2.5">
                      {day.points.map((point) => (
                        <div key={point.id} className="flex items-center gap-2.5 sm:gap-3">
                          {/* Time Picker Pill */}
                          <div className="relative flex h-12 w-32 sm:w-36 shrink-0 items-center justify-between rounded-2xl bg-white border border-slate-200/80 px-3.5 hover:border-blue-400 focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-blue-100 transition-all cursor-pointer group">
                            <span className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
                              {formatKoreanAmPmTime(point.time) || '시간 선택'}
                            </span>
                            <Clock className="h-4 w-4 text-slate-400 group-hover:text-slate-600 shrink-0" strokeWidth={1.8} />
                            <input
                              aria-label={`${day.date} 경유 시간`}
                              type="time"
                              value={normalizeTimeHHmm(point.time) || point.time || ''}
                              onChange={(event) =>
                                updateDraftRoute({
                                  ...extractedDraft,
                                  waypoints: emailDispatchDays(extractedDraft)
                                    .flatMap((d) => d.points)
                                    .map((p) => (p.id === point.id ? { ...p, time: event.target.value } : p)),
                                })
                              }
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          </div>

                          {/* Place Search Input */}
                          <HqPlaceSearchInput
                            value={point.location}
                            isConfirmed={point.isPoiConfirmed}
                            containerClassName="flex-1 min-w-0"
                            heightClass="h-12 rounded-2xl"
                            icon="mapPin"
                            placeholder="경유지 또는 목적지 입력"
                            onChange={(location) =>
                              updateDraftRoute({
                                ...extractedDraft,
                                waypoints: emailDispatchDays(extractedDraft)
                                  .flatMap((d) => d.points)
                                  .map((p) => (p.id === point.id ? { ...p, location, isPoiConfirmed: false } : p)),
                              })
                            }
                            onSelectPoi={(poi) =>
                              updateDraftRoute({
                                ...extractedDraft,
                                waypoints: emailDispatchDays(extractedDraft)
                                  .flatMap((d) => d.points)
                                  .map((p) =>
                                    p.id === point.id
                                      ? { ...p, location: poi.name, lat: poi.lat, lng: poi.lng, isPoiConfirmed: true }
                                      : p
                                  ),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>

                    {/* 실제 종료 시간 */}
                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-xs sm:text-sm font-bold text-slate-500 shrink-0">
                        실제 종료 시간
                      </span>
                      <div className="relative flex h-11 w-32 sm:w-36 shrink-0 items-center justify-between rounded-2xl bg-white border border-slate-200/80 px-3.5 hover:border-blue-400 focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-blue-100 transition-all cursor-pointer group">
                        <span className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
                          {formatKoreanAmPmTime(day.endTime) || '시간 선택'}
                        </span>
                        <Clock className="h-4 w-4 text-slate-400 group-hover:text-slate-600 shrink-0" strokeWidth={1.8} />
                        <input
                          type="time"
                          aria-label={`${day.date} 실제 종료 시간`}
                          value={normalizeTimeHHmm(day.endTime) || day.endTime || ''}
                          onChange={(event) =>
                            onUpdateDraft?.({
                              ...extractedDraft,
                              dayEndTimes: { ...extractedDraft.dayEndTimes, [day.date]: event.target.value },
                            })
                          }
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                    </div>
                  </div>
                ));
              } catch (error) {
                return <p role="alert" className="text-xs text-rose-600">{error instanceof Error ? error.message : '날짜를 확인해 주세요.'}</p>;
              }
            })()}
          </section>
        )}
      </details>

      {/* Section 2: 예약 기본 정보·추가 정보 (Reference 2) */}
      <details className="group rounded-[28px] bg-white border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-5 sm:p-6 transition-all" open>
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm sm:text-base font-bold text-slate-900 marker:hidden">
          <span>예약 기본 정보·추가 정보</span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 space-y-4">
          {/* Card 1: 기본 정보 */}
          <div className="rounded-[24px] bg-white border border-slate-100/90 shadow-2xs p-5 sm:p-6 space-y-3.5">
            <div className="flex items-center justify-between pb-1">
              <h3 className="text-sm font-bold text-slate-900">기본 정보</h3>
              <button
                type="button"
                onClick={handleSaveToCrm}
                disabled={extractedDraft?.isSavedToCrm || isSavingCrm}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  extractedDraft?.isSavedToCrm
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : isSavingCrm
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-blue-50 text-[#1E60F3] hover:bg-blue-100 border border-blue-200/60'
                }`}
                title="고객 관리에 회사 및 담당자 정보를 저장하거나 연결합니다"
              >
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>
                  {isSavingCrm
                    ? '저장 중...'
                    : extractedDraft?.isSavedToCrm
                    ? '고객 관리 연결됨'
                    : '고객 관리에 저장'}
                </span>
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">예약 번호</span>
                <span className="font-bold text-slate-900">{bookingCode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">고객사</span>
                <span className="font-bold text-slate-900">{companyName}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="hq-booking-event-title" className="shrink-0 font-medium text-slate-400">행사명</label>
                <input id="hq-booking-event-title" type="text" maxLength={160}
                  aria-label="행사명 수정"
                  value={extractedDraft?.eventName || ''}
                  onChange={(e) => extractedDraft && onUpdateDraft?.({ ...extractedDraft, eventName: e.target.value })}
                  placeholder="행사명 입력 (미입력 시 고객사명 사용)"
                  className="h-9 w-[68%] rounded-[12px] bg-[#F6F7FA] px-3 text-right text-[12px] font-semibold text-[#17233B] outline-none placeholder:text-[#9BA9BA] focus:bg-white focus:ring-1 focus:ring-[#1E60F3]/35"
                />
              </div>
              <div className="flex items-start justify-between">
                <span className="text-slate-400 font-medium pt-0.5">예약 담당자</span>
                <div className="text-right">
                  <div className="font-bold text-slate-900">
                    {contactName}
                    <span className="text-slate-400 font-normal ml-1">
                      ({contactSource === 'signature' ? '서명' : contactSource === 'body' ? '변신 메디' : '발신 헤더'})
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-slate-400 font-medium">
                    <span>📞 {contactPhone || '연락처 미등록'}</span>
                    <span>|</span>
                    <span>✉️ {contactEmail || '이메일 없음'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-xs pt-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">운행 날짜</span>
                <span className="font-bold text-slate-900">{bookingDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">픽업 시간</span>
                <span className="font-bold text-slate-900">{bookingTime}</span>
              </div>

              {/* 운행 경로: 다중 목적지 vs 단일 구간 */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#1E60F3]" />
                    <span>운행 경로 (여러 목적지)</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1E60F3] font-bold text-xs border border-blue-100">
                    {extractedDraft?.waypoints?.length || 4}개 구간
                  </span>
                </div>

                <div className="mb-2.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50/70 border border-blue-100 text-[#1E60F3] font-bold text-xs">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{bookingDate}</span>
                  </span>
                </div>

                <div className="space-y-2">
                  {extractedDraft?.waypoints && extractedDraft.waypoints.length > 0 ? (
                    extractedDraft.waypoints.map((wp, idx) => (
                      <div
                        key={wp.id}
                        className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100/90 shadow-2xs text-xs"
                      >
                        <span className="w-6 h-6 rounded-full bg-[#1E60F3] text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-600 shrink-0 w-12 text-center">
                          {wp.time || bookingTime}
                        </span>
                        <span className="font-bold text-slate-900 truncate flex-1">
                          {wp.location}
                        </span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100/90 shadow-2xs text-xs">
                        <span className="w-6 h-6 rounded-full bg-[#1E60F3] text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
                        <span className="font-bold text-slate-600 shrink-0 w-12 text-center">{bookingTime}</span>
                        <span className="font-bold text-slate-900 truncate flex-1">{pickupLocation}</span>
                      </div>
                      <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-100/90 shadow-2xs text-xs">
                        <span className="w-6 h-6 rounded-full bg-[#1E60F3] text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                        <span className="font-bold text-slate-600 shrink-0 w-12 text-center">--:--</span>
                        <span className="font-bold text-slate-900 truncate flex-1">{dropoffLocation}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="pt-2 text-xs">
                <span className="text-slate-400 font-medium block mb-1">요청 사항</span>
                <p className="font-bold text-slate-800 leading-snug">
                  {specialRequests || '요청 사항 없음'}
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: 추가 정보 */}
          <div className="rounded-[24px] bg-white border border-slate-100/90 shadow-2xs p-5 sm:p-6 space-y-3.5">
            <h3 className="text-sm font-bold text-slate-900">추가 정보</h3>

            {/* 기사 언어 조건 */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500 font-medium">기사 언어 조건</span>
              <div className="flex items-center gap-2 flex-1 max-w-xs sm:max-w-sm ml-auto">
                <button
                  type="button"
                  onClick={() => changeDriverLanguage('any')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                    selectedLanguage === 'any'
                      ? 'border-blue-200/80 bg-blue-100/70 text-[#1E60F3]'
                      : 'border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  무관
                </button>
                <button
                  type="button"
                  onClick={() => changeDriverLanguage('english')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                    selectedLanguage === 'english'
                      ? 'border-blue-200/80 bg-blue-100/70 text-[#1E60F3]'
                      : 'border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  영어 가능
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2.5 text-xs pt-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객 수</span>
                <span className="font-bold text-slate-900">{passengerCount}명</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객명</span>
                <span className="font-bold text-slate-900">{passengerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객 연락처</span>
                <span className="font-medium text-slate-400">{passengerPhone || '연락처 미입력'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">항공편명</span>
                <span className="font-bold text-[#1E60F3]">{flightNumber || '항공편 없음'}</span>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
};
