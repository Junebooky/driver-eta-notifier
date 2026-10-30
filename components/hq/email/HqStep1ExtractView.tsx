'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Paperclip,
  FileText,
  FileSpreadsheet,
  ArrowRight,
  Edit3,
  Calendar,
  Clock,
  MapPin,
  Plane,
  Users,
  Car,
  MessageSquare,
  Building2,
  RefreshCw,
  UserCheck,
  CheckCircle2,
  Phone,
  Mail,
  BookmarkCheck,
  GripVertical,
  Plus,
  X,
  RotateCcw,
} from 'lucide-react';
import { HqEmailSummary, HqEmailDetail, HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import { haptics } from '@/utils/haptics';
import { HqPlaceSearchInput, PoiResult } from '@/components/hq/HqPlaceSearchInput';
import { saveContactToCrm } from '@/utils/crmCustomerSync';

interface HqStep1ExtractViewProps {
  emailSummary: HqEmailSummary;
  emailDetail?: HqEmailDetail | null;
  extractedDraft?: HqEmailExtractedDraft | null;
  isLoadingDetail?: boolean;
  isExtractingAi?: boolean;
  onExtractWithAi: () => void;
  onProceedToBooking: () => void;
  onSaveModifiedDraft?: () => void;
  onUpdateDraft?: (updated: HqEmailExtractedDraft) => void;
}

export const HqStep1ExtractView: React.FC<HqStep1ExtractViewProps> = ({
  emailSummary,
  emailDetail,
  extractedDraft,
  isLoadingDetail,
  isExtractingAi,
  onExtractWithAi,
  onProceedToBooking,
  onSaveModifiedDraft,
  onUpdateDraft,
}) => {
  const subject = emailDetail?.subject || emailSummary.subject;
  const fromName = emailDetail?.from?.name || emailSummary.from.name;
  const fromAddress = emailDetail?.from?.address || emailSummary.from.address;
  const toList = emailDetail?.to || emailSummary.to;
  const bodyText = emailDetail?.bodyText || emailSummary.preview || '(본문 내용 없음)';

  // Editing mode toggle
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingCrm, setIsSavingCrm] = useState(false);
  const [crmSavedNotice, setCrmSavedNotice] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Field values with safe fallbacks
  const companyName = extractedDraft?.companyName || '';
  const contactName = extractedDraft?.contactName || '';
  const contactPhone = extractedDraft?.contactPhone || '';
  const contactEmail = extractedDraft?.contactEmail || fromAddress;
  const contactSource = extractedDraft?.contactSource || 'from';

  const passengerName = extractedDraft?.passengerName || '';
  const passengerPhone = extractedDraft?.passengerPhone || '';
  const passengerCount = extractedDraft?.passengerCount ?? 1;

  const pickupLocation = extractedDraft?.pickupLocation || '';
  const pickupDetailNotes = extractedDraft?.pickupDetailNotes || '';
  const isPickupPoiConfirmed = Boolean(extractedDraft?.isPickupPoiConfirmed);

  const dropoffLocation = extractedDraft?.dropoffLocation || '';
  const dropoffDetailNotes = extractedDraft?.dropoffDetailNotes || '';
  const isDropoffPoiConfirmed = Boolean(extractedDraft?.isDropoffPoiConfirmed);

  const pickupDate = extractedDraft?.pickupDate || '날짜 미지정';
  const pickupTime = extractedDraft?.pickupTime || '시간 미지정';
  const flightNumber = extractedDraft?.flightNumber || '';
  const requestedVehicleClass = extractedDraft?.requestedVehicleClass || '차량 미지정';
  const specialRequests = extractedDraft?.specialRequests || '';

  // Multi-destination waypoints check & Multi-day grouping
  const waypoints: RouteWaypointItem[] = extractedDraft?.waypoints || [];
  const hasMultipleWaypoints = waypoints.length > 2;

  // Extract unique dates for multi-day itineraries
  const waypointDates = waypoints
    .map((w) => (w.date || (pickupDate !== '날짜 미지정' ? pickupDate : '')).trim())
    .filter(Boolean);
  const uniqueDates = Array.from(new Set(waypointDates));
  const hasMultipleDates = uniqueDates.length > 1;

  // Count stops per date
  const dateStopCounts = waypoints.reduce<Record<string, number>>((acc, w) => {
    const d = (w.date || (pickupDate !== '날짜 미지정' ? pickupDate : '')).trim();
    if (d) acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});

  // Date formatting helper for dividers and badges
  const formatWaypointDate = (dateStr: string, dayIndex?: number): string => {
    if (!dateStr || dateStr === '날짜 미지정') return '날짜 미지정';
    const clean = dateStr.replace(/\s*\([^)]*\)/g, '').trim();
    const daySuffix = dayIndex ? ` [${dayIndex}일차]` : '';
    const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const dow = days[d.getDay()];
      return `${clean} (${dow})${daySuffix}`;
    }
    return `${dateStr}${daySuffix}`;
  };

  // Add a new waypoint in multi-destination mode
  const handleAddWaypoint = () => {
    if (!extractedDraft) return;
    haptics.lightTap();
    const fallbackDate = pickupDate !== '날짜 미지정' ? pickupDate : '';
    const currentWps = extractedDraft.waypoints && extractedDraft.waypoints.length > 0
      ? [...extractedDraft.waypoints]
      : [
          { id: 'wp-1', order: 1, date: fallbackDate, time: pickupTime !== '시간 미지정' ? pickupTime : '10:00', location: pickupLocation || '' },
          { id: 'wp-2', order: 2, date: fallbackDate, time: '', location: dropoffLocation || '' },
        ];
    
    const nextIdx = currentWps.length + 1;
    const lastDate = currentWps[currentWps.length - 1]?.date || fallbackDate;
    const newWp: RouteWaypointItem = {
      id: `wp-${Date.now()}-${nextIdx}`,
      order: nextIdx,
      date: lastDate,
      time: '',
      location: '',
    };
    const nextWps = [...currentWps, newWp];
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: nextWps,
      dropoffLocation: nextWps[nextWps.length - 1].location || extractedDraft.dropoffLocation,
    });
  };

  // Remove a waypoint
  const handleRemoveWaypoint = (wpId: string) => {
    if (!extractedDraft || !extractedDraft.waypoints || extractedDraft.waypoints.length <= 2) return;
    haptics.lightTap();
    const filtered = extractedDraft.waypoints.filter((w) => w.id !== wpId);
    const reordered = filtered.map((w, idx) => ({ ...w, order: idx + 1 }));
    const isStillMulti = reordered.length > 2;
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: isStillMulti ? reordered : undefined,
      pickupLocation: reordered[0]?.location || extractedDraft.pickupLocation,
      pickupTime: reordered[0]?.time || extractedDraft.pickupTime,
      pickupDate: reordered[0]?.date || extractedDraft.pickupDate,
      dropoffLocation: reordered[reordered.length - 1]?.location || extractedDraft.dropoffLocation,
    });
  };

  // Update waypoint date
  const handleUpdateWaypointDate = (wpId: string, newDate: string) => {
    if (!extractedDraft || !extractedDraft.waypoints) return;
    const updated = extractedDraft.waypoints.map((w) => (w.id === wpId ? { ...w, date: newDate } : w));
    const isFirst = updated[0]?.id === wpId;
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: updated,
      pickupDate: isFirst && newDate ? newDate : extractedDraft.pickupDate,
    });
  };

  // Update waypoint time
  const handleUpdateWaypointTime = (wpId: string, newTime: string) => {
    if (!extractedDraft || !extractedDraft.waypoints) return;
    const updated = extractedDraft.waypoints.map((w) => (w.id === wpId ? { ...w, time: newTime } : w));
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: updated,
      pickupTime: updated[0]?.id === wpId && newTime ? newTime : extractedDraft.pickupTime,
    });
  };

  // Update waypoint location
  const handleUpdateWaypointLocation = (wpId: string, newLoc: string) => {
    if (!extractedDraft || !extractedDraft.waypoints) return;
    const updated = extractedDraft.waypoints.map((w) => (w.id === wpId ? { ...w, location: newLoc } : w));
    const isFirst = updated[0]?.id === wpId;
    const isLast = updated[updated.length - 1]?.id === wpId;
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: updated,
      pickupLocation: isFirst ? newLoc : extractedDraft.pickupLocation,
      dropoffLocation: isLast ? newLoc : extractedDraft.dropoffLocation,
    });
  };

  // Convert single leg (pickup/dropoff) to multi-destination itinerary
  const handleConvertToMultiDestination = () => {
    if (!extractedDraft) return;
    haptics.lightTap();
    const fallbackDate = pickupDate !== '날짜 미지정' ? pickupDate : '';
    const newWaypoints: RouteWaypointItem[] = [
      {
        id: 'wp-1',
        order: 1,
        date: fallbackDate,
        time: pickupTime !== '시간 미지정' ? pickupTime : '10:00',
        location: pickupLocation || '인천공항 제1터미널 (T1)',
        isPoiConfirmed: isPickupPoiConfirmed,
      },
      {
        id: 'wp-2',
        order: 2,
        date: fallbackDate,
        time: '12:00',
        location: '중간 경유지 입력',
      },
      {
        id: 'wp-3',
        order: 3,
        date: fallbackDate,
        time: '14:00',
        location: dropoffLocation || '최종 목적지 입력',
        isPoiConfirmed: isDropoffPoiConfirmed,
      },
    ];
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: newWaypoints,
    });
  };

  // Reset multi-destination to single leg
  const handleResetToSingleLeg = () => {
    if (!extractedDraft) return;
    haptics.lightTap();
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: undefined,
    });
  };

  // HTML5 Drag and Drop handlers for Waypoint reordering
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex || !extractedDraft?.waypoints) return;
    const items = [...extractedDraft.waypoints];
    const [draggedItem] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, draggedItem);
    const reordered = items.map((it, idx) => ({ ...it, order: idx + 1 }));
    setDraggedIndex(targetIndex);
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: reordered,
      pickupLocation: reordered[0]?.location || extractedDraft.pickupLocation,
      pickupTime: reordered[0]?.time || extractedDraft.pickupTime,
      dropoffLocation: reordered[reordered.length - 1]?.location || extractedDraft.dropoffLocation,
    });
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Handle explicit CRM Save (Requires verified company and contact - Awaits server DB confirmation)
  const handleSaveToCrm = async () => {
    if (!extractedDraft || isSavingCrm) return;

    const cleanCompany = (extractedDraft.companyName || '').trim();
    const cleanContact = (extractedDraft.contactName || '').trim();

    if (!cleanCompany || cleanCompany === '확인 필요') {
      haptics.errorAlert();
      setCrmSavedNotice('고객사명이 확인되지 않았습니다. 원문 확인 후 고객사명을 먼저 입력한 후 저장해 주세요.');
      return;
    }

    if (!cleanContact || cleanContact === '확인 필요') {
      haptics.errorAlert();
      setCrmSavedNotice('예약 담당자명이 확인되지 않았습니다. 원문 확인 후 담당자명을 먼저 입력한 후 저장해 주세요.');
      return;
    }

    try {
      setIsSavingCrm(true);
      const result = await saveContactToCrm({
        companyName: cleanCompany,
        contactName: cleanContact,
        contactPhone: extractedDraft.contactPhone || '',
        contactEmail: extractedDraft.contactEmail || '',
        notes: `이메일 접수 예약 수동 연동 (제목: ${subject})`,
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

  const handleSelectPickupPoi = (poi: PoiResult) => {
    if (!extractedDraft) return;
    const updated: HqEmailExtractedDraft = {
      ...extractedDraft,
      pickupLocation: poi.name,
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
      dropoffLat: poi.lat,
      dropoffLng: poi.lng,
      isDropoffPoiConfirmed: true,
    };
    onUpdateDraft?.(updated);
  };

  const handleRegisterClick = () => {
    haptics.success();
    onProceedToBooking();
  };

  const handleSaveClick = () => {
    haptics.lightTap();
    setIsEditing(!isEditing);
    onSaveModifiedDraft?.();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* 1. Left Sub-Column: Original Safe Email Viewer */}
      <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col min-h-[640px]">
        {/* Email Header */}
        <div className="p-5 border-b border-slate-100 bg-white">
          <h2 className="text-base font-black text-slate-900 leading-snug">
            {subject}
          </h2>

          <div className="mt-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs uppercase">
              {fromName.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-900">
                  {fromName}
                </span>
                <span className="text-[11px] text-slate-400 truncate">
                  &lt;{fromAddress}&gt;
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                To: {toList.join(', ')}
              </div>
            </div>
          </div>
        </div>

        {/* Email Body */}
        <div className="p-5 flex-1 overflow-y-auto font-sans text-xs text-slate-700 leading-relaxed whitespace-pre-line selection:bg-blue-100">
          {isLoadingDetail ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-[#1E60F3]" />
              <p className="text-xs font-medium">이메일 본문 안전 로드 중 (PEEK Read-Only)...</p>
            </div>
          ) : (
            bodyText
          )}
        </div>

        {/* Attachments Section */}
        {emailDetail?.hasAttachments && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/70">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2.5">
              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
              <span>첨부 파일 (2)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-blue-400 transition-colors cursor-pointer group">
                <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                    Flight Itinerary.pdf
                  </div>
                  <div className="text-[9px] text-slate-400">1.2 MB</div>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-emerald-400 transition-colors cursor-pointer group">
                <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                    Guest List.xlsx
                  </div>
                  <div className="text-[9px] text-slate-400">850 KB</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Right Sub-Column: AI Extraction Card */}
      <div className="lg:col-span-6 bg-white rounded-2xl border border-blue-200/90 shadow-md p-5 flex flex-col justify-between min-h-[640px] relative overflow-hidden">
        {extractedDraft ? (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4 fill-[#1E60F3]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    AI가 추출한 예약 정보
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Gemini AI 원문 근거 구조화 완료 (수하물 제외)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onExtractWithAi}
                disabled={isExtractingAi}
                className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                title="Gemini AI로 다시 추출"
              >
                <RefreshCw className={`w-3 h-3 ${isExtractingAi ? 'animate-spin' : ''}`} />
                <span>재추출</span>
              </button>
            </div>

            {/* CRM Save Feedback Toast */}
            {crmSavedNotice && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{crmSavedNotice}</span>
              </div>
            )}

            {/* Key-Value Extracted Table */}
            <div className="mt-4 divide-y divide-slate-100 text-xs">
              {/* 고객사 & CRM 연동 */}
              <div className="py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-slate-500 font-semibold w-28 shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>고객사</span>
                </div>
                <div className="flex items-center gap-2 justify-end flex-1 min-w-0">
                  <span className="font-extrabold text-slate-900 truncate">
                    {companyName || '미지정 (확인 필요)'}
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveToCrm}
                    disabled={extractedDraft.isSavedToCrm || isSavingCrm}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border transition-colors shrink-0 flex items-center gap-1 ${
                      extractedDraft.isSavedToCrm
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
                        : extractedDraft.isSavedToCrm
                        ? '고객 관리 연결됨'
                        : '고객 관리에 저장'}
                    </span>
                  </button>
                </div>
              </div>

              {/* 예약 담당자 (발신자와 구분) */}
              <div className="py-2.5 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-slate-500 font-semibold w-28 shrink-0 mt-0.5">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>예약 담당자</span>
                </div>
                <div className="text-right flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900">
                    {contactName || '미지정 (확인 필요)'}
                    <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                      ({contactSource === 'signature' ? '서명' : contactSource === 'body' ? '본문' : '발신 헤더'})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 space-x-1.5 truncate">
                    {contactPhone && <span>📞 {contactPhone}</span>}
                    {contactEmail && <span>✉️ {contactEmail}</span>}
                  </div>
                </div>
              </div>

              {/* 탑승객 (담당자와 구분) */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>탑승객 / 연락처</span>
                </div>
                <div className="font-extrabold text-slate-900 text-right">
                  <span>{passengerName || '승객 미지정'}</span>
                  <span className="text-slate-400 font-normal ml-1">({passengerCount}명)</span>
                  {passengerPhone && (
                    <span className="block text-[11px] text-slate-500 font-medium">{passengerPhone}</span>
                  )}
                </div>
              </div>

              {/* 운행 날짜 & 시간 */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>운행 일시</span>
                </div>
                <div className="font-extrabold text-slate-900 text-right flex items-center gap-2 justify-end">
                  {hasMultipleDates ? (
                    <>
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#1E60F3] text-[10px] font-black border border-blue-200/60">
                        {uniqueDates.length}일간 일정
                      </span>
                      <span>
                        {uniqueDates[0]} ~ {uniqueDates[uniqueDates.length - 1]}
                      </span>
                    </>
                  ) : (
                    <span>{pickupDate}</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-slate-700 font-bold">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{pickupTime}</span>
                  </span>
                </div>
              </div>

              {/* ========================================================= */}
              {/* 운행 경로: 다중 목적지 vs 단일 구간 (사용자 지시 조건부 UI) */}
              {/* ========================================================= */}
              {hasMultipleWaypoints ? (
                /* 다중 목적지 UI (사용자 참조 이미지와 100% 일치) */
                <div className="py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <MapPin className="w-4 h-4 text-[#1E60F3] shrink-0" />
                      <span className="font-extrabold text-slate-900 text-xs whitespace-nowrap">
                        운행 경로 (여러 목적지)
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1E60F3] text-[11px] font-extrabold border border-blue-100 shrink-0">
                        {waypoints.length}개
                      </span>
                      {hasMultipleDates && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black border border-indigo-100 shrink-0">
                          {uniqueDates.length}일간 순회
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddWaypoint}
                      className="flex items-center gap-1 text-[11px] font-extrabold text-[#1E60F3] hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200/60 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>목적지 추가</span>
                    </button>
                  </div>

                  {/* Waypoint Rows with Intermediate Date Separators */}
                  <div className="space-y-1.5">
                    {waypoints.map((wp, index) => {
                      const currentDate = (wp.date || (pickupDate !== '날짜 미지정' ? pickupDate : '')).trim();
                      const prevDate = index > 0 ? (waypoints[index - 1].date || (pickupDate !== '날짜 미지정' ? pickupDate : '')).trim() : null;
                      const isDateChanged = index === 0 ? Boolean(currentDate) : Boolean(currentDate && currentDate !== prevDate);
                      const dayIdx = uniqueDates.indexOf(currentDate) >= 0 ? uniqueDates.indexOf(currentDate) + 1 : undefined;

                      return (
                        <React.Fragment key={wp.id}>
                          {/* Intermediate Date Divider (중간 날짜구분 헤더) */}
                          {isDateChanged && (
                            <div className={`flex items-center gap-2 ${index === 0 ? 'pt-1 pb-1.5' : 'pt-3.5 pb-1.5'} px-0.5`}>
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50/90 border border-blue-200/80 text-[#1E60F3] text-[11px] font-black tracking-tight shadow-2xs shrink-0">
                                <Calendar className="w-3.5 h-3.5 text-[#1E60F3]" />
                                <span>{formatWaypointDate(currentDate, hasMultipleDates ? dayIdx : undefined)}</span>
                              </div>
                              <div className="flex-1 h-px bg-gradient-to-r from-blue-200/80 via-slate-200 to-transparent" />
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60 shrink-0">
                                {dateStopCounts[currentDate] || 1}개 목적지
                              </span>
                            </div>
                          )}

                          <div
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center gap-1.5 group transition-all ${
                              draggedIndex === index ? 'opacity-40' : 'opacity-100'
                            }`}
                          >
                            {/* Drag handle (6 dots ⋮⋮) */}
                            <div
                              className="text-slate-300 group-hover:text-slate-500 cursor-grab px-0.5 shrink-0 flex items-center"
                              title="드래그하여 순서 변경"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>

                            {/* Number circle badge */}
                            <div className="w-5 h-5 rounded-full bg-[#1E60F3] text-white font-extrabold text-[11px] flex items-center justify-center shrink-0 shadow-2xs">
                              {index + 1}
                            </div>

                            {/* Date input pill */}
                            <div
                              className="flex items-center gap-1 px-1.5 py-1 rounded-lg border border-slate-200 bg-white shadow-2xs shrink-0 focus-within:border-blue-400"
                              title="경유지 날짜 (YYYY-MM-DD)"
                            >
                              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              <input
                                type="text"
                                value={wp.date || (index === 0 && pickupDate !== '날짜 미지정' ? pickupDate : '')}
                                onChange={(e) => handleUpdateWaypointDate(wp.id, e.target.value)}
                                placeholder="YYYY-MM-DD"
                                className="w-[74px] text-[11px] font-semibold text-slate-800 bg-transparent outline-none"
                              />
                            </div>

                            {/* Time input pill */}
                            <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg border border-slate-200 bg-white shadow-2xs shrink-0 focus-within:border-blue-400">
                              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                              <input
                                type="text"
                                value={wp.time || ''}
                                onChange={(e) => handleUpdateWaypointTime(wp.id, e.target.value)}
                                placeholder="10:00"
                                className="w-11 text-[11px] font-semibold text-slate-800 bg-transparent outline-none"
                              />
                            </div>

                            {/* Location text input */}
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={wp.location}
                                onChange={(e) => handleUpdateWaypointLocation(wp.id, e.target.value)}
                                placeholder={`목적지 ${index + 1} 입력`}
                                className="w-full px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-2xs transition-all"
                              />
                            </div>

                            {/* Delete button (✕) */}
                            <button
                              type="button"
                              onClick={() => handleRemoveWaypoint(wp.id)}
                              disabled={waypoints.length <= 2}
                              className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:hover:text-slate-300 transition-colors cursor-pointer shrink-0"
                              title={waypoints.length <= 2 ? '최소 2개(출발/도착) 이상의 장소가 필요합니다' : '목적지 삭제'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* 단일 구간 UI (장소 이동 1개일 때 기존 UI 100% 보존) */
                <>
                  {/* 픽업 위치 (TMAP POI 후보 연동) */}
                  <div className="py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                        <MapPin className="w-3.5 h-3.5 text-[#1E60F3]" />
                        <span>픽업 위치</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {pickupDetailNotes && `[${pickupDetailNotes}]`}
                      </span>
                    </div>
                    <HqPlaceSearchInput
                      value={pickupLocation}
                      onChange={(val) => {
                        if (!extractedDraft) return;
                        onUpdateDraft?.({
                          ...extractedDraft,
                          pickupLocation: val,
                          isPickupPoiConfirmed: false,
                        });
                      }}
                      onSelectPoi={handleSelectPickupPoi}
                      autoSearch={true}
                      isConfirmed={isPickupPoiConfirmed}
                      placeholder="TMAP 출발지 검색 및 후보 선택"
                      heightClass="h-10"
                    />
                  </div>

                  {/* 목적지 (TMAP POI 후보 연동) */}
                  <div className="py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>목적지</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {dropoffDetailNotes && `[${dropoffDetailNotes}]`}
                      </span>
                    </div>
                    <HqPlaceSearchInput
                      value={dropoffLocation}
                      onChange={(val) => {
                        if (!extractedDraft) return;
                        onUpdateDraft?.({
                          ...extractedDraft,
                          dropoffLocation: val,
                          isDropoffPoiConfirmed: false,
                        });
                      }}
                      onSelectPoi={handleSelectDropoffPoi}
                      autoSearch={true}
                      isConfirmed={isDropoffPoiConfirmed}
                      icon="flag"
                      placeholder="TMAP 도착지 검색 및 후보 선택"
                      heightClass="h-10"
                    />

                    {/* 여러 목적지 / 경유지 추가 버튼 */}
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleConvertToMultiDestination}
                        className="text-[11px] font-bold text-[#1E60F3] hover:text-blue-700 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50/70 hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>목적지 추가 (여러 목적지 모드)</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* 항공편명 */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                  <Plane className="w-3.5 h-3.5 text-slate-400" />
                  <span>항공편명</span>
                </div>
                <div className="font-extrabold text-blue-600 text-right">
                  {flightNumber || '정보 없음'}
                </div>
              </div>

              {/* 요청 차종 */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 font-semibold w-28">
                  <Car className="w-3.5 h-3.5 text-slate-400" />
                  <span>요청 차종</span>
                </div>
                <div className="flex items-center gap-1.5 justify-end flex-wrap">
                  <span className="px-2.5 py-1 rounded-md bg-blue-50 text-[#1E60F3] border border-blue-200 text-xs font-extrabold shadow-2xs">
                    {requestedVehicleClass}
                  </span>
                </div>
              </div>

              {/* 특이사항 (텍스트에어리어 박스 UI) */}
              <div className="py-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-500 font-semibold w-28 shrink-0 mt-2">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  <span>특이사항</span>
                </div>
                <div className="flex-1">
                  <textarea
                    value={specialRequests}
                    onChange={(e) => {
                      if (!extractedDraft) return;
                      onUpdateDraft?.({
                        ...extractedDraft,
                        specialRequests: e.target.value,
                      });
                    }}
                    rows={2}
                    className="w-full p-2.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none leading-relaxed shadow-2xs"
                    placeholder="특이사항 입력 (예: 기사 배정 시 차량번호 안내 요청)"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* On-Demand AI Extraction Callout (When not yet analyzed) */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1E60F3] flex items-center justify-center shadow-xs">
              <Sparkles className="w-7 h-7 fill-[#1E60F3]" />
            </div>
            <h4 className="text-base font-extrabold text-slate-900">
              AI 예약 정보 추출 대기 중
            </h4>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
              Gemini AI 모델이 본문 내용을 분석하여 고객사명, 담당자 연락처, 픽업 일시, TMAP 장소 후보 등을 안전하게 자동 구조화합니다.
            </p>
            <button
              type="button"
              onClick={onExtractWithAi}
              disabled={isExtractingAi || isLoadingDetail}
              className="mt-3 px-5 py-3 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isExtractingAi ? 'animate-spin' : ''}`} />
              <span>{isExtractingAi ? 'Gemini AI 실시간 분석 중...' : 'AI 예약 정보 추출 시작'}</span>
            </button>
            <p className="text-[11px] text-slate-400 pt-2">
              * 본사 관리자 명시 클릭 시에만 Gemini API가 호출됩니다.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {extractedDraft && (
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 z-10">
            <button
              type="button"
              onClick={handleSaveClick}
              className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
              <span>수정 후 저장</span>
            </button>

            <button
              type="button"
              onClick={handleRegisterClick}
              className="px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>예약으로 등록</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
