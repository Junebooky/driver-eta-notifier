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

export interface VehicleSlotAssignment {
  slotIndex: number;
  vehicleModel: string;
  vehiclePlate?: string;
  driver: AvailableDriverItem | null;
  status: 'unassigned' | 'assigned';
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
}) => {
  let availabilityWindows: Array<{ startDate: string; startTime: string; endDate: string; endTime: string }> = [];
  try {
    if (extractedDraft) availabilityWindows = emailDispatchDays(extractedDraft).map(day => ({ startDate: day.date, startTime: day.start.time || '', endDate: day.date, endTime: day.endTime }));
  } catch { /* The date editor below shows the validation error. */ }
  const fleet = useFleetAvailabilityWindows(availabilityWindows);
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
    <div className="bg-white rounded-2xl p-5 sm:p-6 space-y-6">
      {/* Step 5: assignment-focused mobile-first header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBackToStep1}
          aria-label="예약 확정 화면으로 돌아가기"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">기사님 배정</h2>
          <p className="mt-0.5 text-xs text-slate-500">차량과 기사님을 선택하고 배차를 확정하세요.</p>
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

      <details className="group rounded-2xl bg-slate-50/50 px-4 py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-600 marker:hidden">
          <span>날짜별 일정·종료시간 다시 확인</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
      {extractedDraft && <section className="mt-3 space-y-4">
        <h3 className="text-sm font-bold">날짜별 경로·종료시간 확인</h3>
        {(()=>{try{return emailDispatchDays(extractedDraft).map(day=><div key={day.date} className="space-y-2 border-t border-blue-100 pt-3"><p className="text-sm font-bold text-slate-800">{day.date}</p>
          {day.points.map(point=><div key={point.id} className="grid grid-cols-[135px_1fr] gap-2 items-center"><input aria-label={`${day.date} 경유 시간`} type="time" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1E60F3] shadow-2xs transition-colors cursor-pointer" value={normalizeTimeHHmm(point.time) || point.time || ''} onChange={event=>updateDraftRoute({...extractedDraft,waypoints:emailDispatchDays(extractedDraft).flatMap(d=>d.points).map(p=>p.id===point.id?{...p,time:event.target.value}:p)})}/><HqPlaceSearchInput value={point.location} isConfirmed={point.isPoiConfirmed} heightClass="h-10" onChange={location=>updateDraftRoute({...extractedDraft,waypoints:emailDispatchDays(extractedDraft).flatMap(d=>d.points).map(p=>p.id===point.id?{...p,location,isPoiConfirmed:false}:p)})} onSelectPoi={poi=>updateDraftRoute({...extractedDraft,waypoints:emailDispatchDays(extractedDraft).flatMap(d=>d.points).map(p=>p.id===point.id?{...p,location:poi.name,lat:poi.lat,lng:poi.lng,isPoiConfirmed:true}:p)})}/></div>)}
          <label className="flex items-center text-xs font-bold text-slate-700">실제 종료 시간<input type="time" aria-label={`${day.date} 실제 종료 시간`} className="ml-3 h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#1E60F3] shadow-2xs transition-colors cursor-pointer" value={normalizeTimeHHmm(day.endTime) || day.endTime || ''} onChange={event=>onUpdateDraft?.({...extractedDraft,dayEndTimes:{...extractedDraft.dayEndTimes,[day.date]:event.target.value}})}/></label>
        </div>);}catch(error){return <p role="alert" className="text-xs text-rose-600">{error instanceof Error?error.message:'날짜를 확인해 주세요.'}</p>;}})()}
      </section>}

      </details>
      <details className="group rounded-2xl bg-slate-50/50 px-4 py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-600 marker:hidden">
          <span>예약 기본 정보·추가 정보</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4">
        <div className="lg:col-span-5 space-y-4">
          {/* Card 1: 기본 정보 */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900">기본 정보</h3>
              <button
                type="button"
                onClick={handleSaveToCrm}
                disabled={extractedDraft?.isSavedToCrm || isSavingCrm}
                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border transition-colors flex items-center gap-1 ${
                  extractedDraft?.isSavedToCrm
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 cursor-default'
                    : isSavingCrm
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-blue-50 text-[#1E60F3] border-blue-200 hover:bg-blue-100 cursor-pointer'
                }`}
                title="고객 관리에 회사 및 담당자 정보를 저장하거나 연결합니다"
              >
                <BookmarkCheck className="w-3 h-3" />
                <span>
                  {isSavingCrm
                    ? '저장 중...'
                    : extractedDraft?.isSavedToCrm
                    ? '고객 관리 연결됨'
                    : '고객 관리에 저장'}
                </span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">예약 번호</span>
                <span className="font-mono font-bold text-slate-800">{bookingCode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">고객사</span>
                <span className="font-extrabold text-slate-900">{companyName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">예약 담당자</span>
                <div className="text-right">
                  <span className="font-bold text-slate-800">{contactName}</span>
                  <span className="text-[10px] text-slate-400 font-normal ml-1">
                    ({contactSource === 'signature' ? '서명' : contactSource === 'body' ? '본문' : '발신 헤더'})
                  </span>
                  <div className="text-[10px] text-slate-500">
                    {contactPhone && <span>📞 {contactPhone} </span>}
                    {contactEmail && <span>✉️ {contactEmail}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-200 my-2" />

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">운행 날짜</span>
                <span className="font-bold text-slate-900">{bookingDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">픽업 시간</span>
                <span className="font-bold text-slate-900">{bookingTime}</span>
              </div>

              {/* 운행 경로: 다중 목적지 vs 단일 구간 */}
              {extractedDraft?.waypoints && extractedDraft.waypoints.length > 2 ? (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 font-bold flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#1E60F3]" />
                      <span>운행 경로 (여러 목적지)</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const uniqueWpDates = Array.from(
                          new Set(extractedDraft.waypoints.map((w) => (w.date || bookingDate || '').trim()).filter(Boolean))
                        );
                        return uniqueWpDates.length > 1 ? (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-extrabold text-[10px] border border-indigo-200/50">
                            {uniqueWpDates.length}일간 순회
                          </span>
                        ) : null;
                      })()}
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1E60F3] font-extrabold text-[10px] border border-blue-200/50">
                        {extractedDraft.waypoints.length}개 구간
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {(() => {
                      const uniqueWpDates = Array.from(
                        new Set(extractedDraft.waypoints.map((w) => (w.date || bookingDate || '').trim()).filter(Boolean))
                      );
                      const hasMultiDays = uniqueWpDates.length > 1;

                      return extractedDraft.waypoints.map((wp, idx) => {
                        const curDate = (wp.date || bookingDate || '').trim();
                        const prevDate = idx > 0 ? (extractedDraft.waypoints![idx - 1].date || bookingDate || '').trim() : null;
                        const isDateChanged = idx === 0 ? Boolean(curDate) : Boolean(curDate && curDate !== prevDate);
                        const dayIdx = uniqueWpDates.indexOf(curDate) >= 0 ? uniqueWpDates.indexOf(curDate) + 1 : undefined;

                        return (
                          <React.Fragment key={wp.id}>
                            {isDateChanged && (
                              <div className={`flex items-center gap-1.5 ${idx === 0 ? 'pb-1' : 'pt-2.5 pb-1'}`}>
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-[#1E60F3] text-[10px] font-black">
                                  <Calendar className="w-3 h-3 text-[#1E60F3]" />
                                  <span>{curDate} {hasMultiDays && dayIdx ? `[${dayIdx}일차]` : ''}</span>
                                </div>
                                <div className="flex-1 h-px bg-slate-200" />
                              </div>
                            )}
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-xs">
                              <span className="w-5 h-5 rounded-full bg-[#1E60F3] text-white font-extrabold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                                {idx + 1}
                              </span>
                              {wp.date && hasMultiDays && (
                                <span className="text-slate-500 font-bold shrink-0 text-[10px] px-1.5 py-0.5 bg-white rounded border border-slate-200">
                                  {wp.date}
                                </span>
                              )}
                              {wp.time && (
                                <span className="text-slate-500 font-bold shrink-0 text-[11px] px-1.5 py-0.5 bg-white rounded border border-slate-200">
                                  {wp.time}
                                </span>
                              )}
                              <span className="font-bold text-slate-900 truncate flex-1">
                                {wp.location}
                              </span>
                            </div>
                          </React.Fragment>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : (
                <>
                  {/* 픽업 위치 (TMAP 후보 검색 및 선택) */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 font-medium">픽업 위치</span>
                      {pickupDetailNotes && (
                        <span className="text-[10px] text-slate-400">[{pickupDetailNotes}]</span>
                      )}
                    </div>
                    <HqPlaceSearchInput
                      value={pickupLocation}
                      onChange={(val) => {
                        if (!extractedDraft) return;
                        onUpdateDraft?.({
                          ...extractedDraft,
                          pickupLocation: val,
                          waypoints:extractedDraft.waypoints?.map((point,index)=>index===0?{...point,location:val,isPoiConfirmed:false}:point),
                          isPickupPoiConfirmed: false,
                        });
                      }}
                      onSelectPoi={handleSelectPickupPoi}
                      autoSearch={true}
                      isConfirmed={isPickupPoiConfirmed}
                      placeholder="TMAP 출발지 검색 및 후보 선택"
                      heightClass="h-9"
                    />
                  </div>

                  {/* 목적지 (TMAP 후보 검색 및 선택) */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 font-medium">목적지</span>
                      {dropoffDetailNotes && (
                        <span className="text-[10px] text-slate-400">[{dropoffDetailNotes}]</span>
                      )}
                    </div>
                    <HqPlaceSearchInput
                      value={dropoffLocation}
                      onChange={(val) => {
                        if (!extractedDraft) return;
                        onUpdateDraft?.({
                          ...extractedDraft,
                          dropoffLocation: val,
                          waypoints:extractedDraft.waypoints?.map((point,index)=>index===(extractedDraft.waypoints?.length || 0)-1?{...point,location:val,isPoiConfirmed:false}:point),
                          isDropoffPoiConfirmed: false,
                        });
                      }}
                      onSelectPoi={handleSelectDropoffPoi}
                      autoSearch={true}
                      isConfirmed={isDropoffPoiConfirmed}
                      icon="flag"
                      placeholder="TMAP 목적지 검색 및 후보 선택"
                      heightClass="h-9"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="h-px bg-slate-200 my-2" />

            <div className="text-xs">
              <span className="text-slate-400 font-medium block mb-1">요청 사항</span>
              <p className="font-bold text-slate-800 leading-snug">
                {specialRequests}
              </p>
            </div>
          </div>

          {/* Card 2: 추가 정보 */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <h3 className="text-xs font-black text-slate-900">추가 정보</h3>

            {/* 기사 언어 조건 */}
            <div>
              <span className="text-slate-400 font-medium text-xs block mb-1.5">
                기사 언어 조건
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => changeDriverLanguage('any')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedLanguage === 'any'
                      ? 'border-[#1E60F3] bg-blue-50/80 text-[#1E60F3] shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>무관</span>
                </button>
                <button
                  type="button"
                  onClick={() => changeDriverLanguage('english')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedLanguage === 'english'
                      ? 'border-[#1E60F3] bg-blue-50/80 text-[#1E60F3] shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>영어 가능</span>
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-xs pt-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객 수</span>
                <span className="font-bold text-slate-800">{passengerCount}명</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객명</span>
                <span className="font-bold text-slate-800">
                  {passengerName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">탑승객 연락처</span>
                <span className="font-bold text-slate-800">
                  {passengerPhone || '연락처 미입력'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">항공편명</span>
                <span className="font-bold text-blue-600">{flightNumber}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}

        </div>
      </details>
    </div>
  );
};
