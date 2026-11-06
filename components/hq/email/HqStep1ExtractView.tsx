'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Paperclip,
  FileText,
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
  ChevronDown,
  ChevronUp,
  Save,
  Check,
} from 'lucide-react';
import { HqEmailSummary, HqEmailDetail, HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import { haptics } from '@/utils/haptics';
import { HqPlaceSearchInput, PoiResult } from '@/components/hq/HqPlaceSearchInput';
import { saveContactToCrm } from '@/utils/crmCustomerSync';
import { confirmEmailRouteStop, changeEmailRouteStopName, isVerifiedEmailRouteStop } from '@/utils/emailRoutePlaceVerification';

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

type WaypointEditDraft = {
  id: string;
  time: string;
  location: string;
  selectedPoi: PoiResult | null;
  isPoiConfirmed: boolean;
};

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

  // Group waypoints by unique date
  const dayGroups = (uniqueDates.length > 0 ? uniqueDates : [pickupDate !== '날짜 미지정' ? pickupDate : '']).map(
    (date, idx) => {
      const items = waypoints.filter(
        (w) => (w.date || (pickupDate !== '날짜 미지정' ? pickupDate : '')).trim() === date
      );
      return {
        date: date || '날짜 미지정',
        dayIndex: idx + 1,
        items: items.length > 0 ? items : waypoints,
      };
    }
  );

  // Accordion state for day groups (default: all open)
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const isDayCollapsed = (key: string) => Boolean(collapsedDays[key]);
  const toggleDayCollapse = (key: string) => {
    haptics.lightTap();
    setCollapsedDays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Changes remain local until explicitly saved.
  const [waypointEdit, setWaypointEdit] = useState<WaypointEditDraft | null>(null);
  const waypointEditorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!waypointEdit) return;
    const discardOnOutsideClick = (event: PointerEvent) => {
      if (!waypointEditorRef.current?.contains(event.target as Node)) {
        setWaypointEdit(null);
      }
    };
    document.addEventListener('pointerdown', discardOnOutsideClick);
    return () => document.removeEventListener('pointerdown', discardOnOutsideClick);
  }, [waypointEdit?.id]);

  const beginWaypointEdit = (wp: RouteWaypointItem) => {
    setWaypointEdit({
      id: wp.id,
      time: wp.time || '',
      location: wp.location,
      selectedPoi: null,
      isPoiConfirmed: Boolean(wp.isPoiConfirmed && Number.isFinite(wp.lat) && Number.isFinite(wp.lng)),
    });
  };

  const saveWaypointEdit = () => {
    if (!waypointEdit || !extractedDraft?.waypoints) return;
    const original = extractedDraft.waypoints.find((wp) => wp.id === waypointEdit.id);
    const location = waypointEdit.location.trim();
    if (!original || !location) return;

    const changedLocation = location !== original.location;
    const poi = waypointEdit.selectedPoi;
    const confirmed = poi ? true : Boolean(!changedLocation && waypointEdit.isPoiConfirmed && original.isPoiConfirmed);
    const lat = poi?.lat ?? (confirmed ? original.lat : undefined);
    const lng = poi?.lng ?? (confirmed ? original.lng : undefined);
    const address = poi?.address ?? (confirmed ? original.address : undefined);
    const time = waypointEdit.time.trim();
    const updated = extractedDraft.waypoints.map((wp) =>
      wp.id === waypointEdit.id ? { ...wp, time, location, address, lat, lng, isPoiConfirmed: confirmed } : wp
    );
    const isFirst = updated[0]?.id === waypointEdit.id;
    const isLast = updated[updated.length - 1]?.id === waypointEdit.id;

    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: updated,
      pickupTime: isFirst && time ? time : extractedDraft.pickupTime,
      pickupLocation: isFirst ? location : extractedDraft.pickupLocation,
      pickupLat: isFirst ? lat : extractedDraft.pickupLat,
      pickupLng: isFirst ? lng : extractedDraft.pickupLng,
      pickupAddress: isFirst ? address : extractedDraft.pickupAddress,
      isPickupPoiConfirmed: isFirst ? confirmed : extractedDraft.isPickupPoiConfirmed,
      dropoffLocation: isLast ? location : extractedDraft.dropoffLocation,
      dropoffLat: isLast ? lat : extractedDraft.dropoffLat,
      dropoffLng: isLast ? lng : extractedDraft.dropoffLng,
      dropoffAddress: isLast ? address : extractedDraft.dropoffAddress,
      isDropoffPoiConfirmed: isLast ? confirmed : extractedDraft.isDropoffPoiConfirmed,
    });
    setWaypointEdit(null);
  };

  // English driver requirement check
  const isEnglishRequired = Boolean(
    subject?.includes('영어') ||
    bodyText?.includes('영어') ||
    specialRequests?.includes('영어') ||
    extractedDraft?.specialRequests?.includes('영어')
  );

  // Count stops per date
  const dateStopCounts = waypoints.reduce<Record<string, number>>((acc, w) => {
    const d = (w.date || (pickupDate !== '날짜 미지정' ? pickupDate : '')).trim();
    if (d) acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});

  // Date formatting helper for dividers and badges (2026. 11. 09 (월) [1일차])
  const formatWaypointDate = (dateStr: string, dayIndex?: number): string => {
    if (!dateStr || dateStr === '날짜 미지정') return '날짜 미지정';
    const clean = dateStr.replace(/\s*\([^)]*\)/g, '').trim();
    const daySuffix = dayIndex ? ` [${dayIndex}일차]` : '';
    const m = clean.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const dow = days[d.getDay()];
      return `${m[1]}. ${m[2]}. ${m[3]} (${dow})${daySuffix}`;
    }
    return `${clean}${daySuffix}`;
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
    const newWpId = `wp-${Date.now()}-${nextIdx}`;
    const newWp: RouteWaypointItem = {
      id: newWpId,
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
    setWaypointEdit({
      id: newWpId,
      time: newWp.time || '',
      location: newWp.location,
      selectedPoi: null,
      isPoiConfirmed: false,
    });
  };

  // Add a new waypoint specifically for a day
  const handleAddWaypointForDay = (targetDate: string) => {
    if (!extractedDraft) return;
    haptics.lightTap();
    const fallbackDate = targetDate || (pickupDate !== '날짜 미지정' ? pickupDate : '');
    const currentWps = extractedDraft.waypoints && extractedDraft.waypoints.length > 0
      ? [...extractedDraft.waypoints]
      : [];

    const newWpId = `wp-${Date.now()}-${currentWps.length + 1}`;
    const newWp: RouteWaypointItem = {
      id: newWpId,
      order: currentWps.length + 1,
      date: fallbackDate,
      time: '',
      location: '',
      isPoiConfirmed: false,
    };

    const lastIdxOfDate = currentWps.map((w) => (w.date || '').trim()).lastIndexOf(fallbackDate);
    const insertAt = lastIdxOfDate >= 0 ? lastIdxOfDate + 1 : currentWps.length;
    currentWps.splice(insertAt, 0, newWp);

    const reordered = currentWps.map((w, idx) => ({ ...w, order: idx + 1 }));
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: reordered,
      dropoffLocation: reordered[reordered.length - 1]?.location || extractedDraft.dropoffLocation,
    });
    setWaypointEdit({
      id: newWpId,
      time: newWp.time || '',
      location: newWp.location,
      selectedPoi: null,
      isPoiConfirmed: false,
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
        address: extractedDraft.pickupAddress,
        lat: extractedDraft.pickupLat,
        lng: extractedDraft.pickupLng,
      },
      {
        id: 'wp-2',
        order: 2,
        date: fallbackDate,
        time: '',
        location: '',
      },
      {
        id: 'wp-3',
        order: 3,
        date: fallbackDate,
        time: '14:00',
        location: dropoffLocation || '최종 목적지 입력',
        isPoiConfirmed: isDropoffPoiConfirmed,
        address: extractedDraft.dropoffAddress,
        lat: extractedDraft.dropoffLat,
        lng: extractedDraft.dropoffLng,
      },
    ];
    onUpdateDraft?.({
      ...extractedDraft,
      waypoints: newWaypoints,
    });
    beginWaypointEdit(newWaypoints[1]);
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
    const first = [...(extractedDraft.waypoints || [])].sort((a, b) => a.order - b.order)[0];
    onUpdateDraft?.(confirmEmailRouteStop(extractedDraft, first?.id || 'pickup', poi));
  };

  const handleSelectDropoffPoi = (poi: PoiResult) => {
    if (!extractedDraft) return;
    const last = [...(extractedDraft.waypoints || [])].sort((a, b) => a.order - b.order).at(-1);
    onUpdateDraft?.(confirmEmailRouteStop(extractedDraft, last?.id || 'dropoff', poi));
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

              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-emerald-400 transition-colors cursor-pointer group active:scale-95">
                <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                  <img
                    src="/images/icons/icon_excel.png"
                    alt="Excel"
                    className="w-4 h-4 object-contain shrink-0 transition-transform duration-150 group-hover:scale-110"
                  />
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
      <div className="lg:col-span-6 bg-white rounded-2xl border border-blue-200/90 shadow-md p-5 flex flex-col justify-between min-h-[640px] relative overflow-visible">
        {extractedDraft ? (
          <div className="space-y-4">
            {/* Header: Sparkles + Title + Refresh Button (Clean, no dev subtitle) */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <img
                  src="/images/icons/ai_email.png"
                  alt="AI가 추출한 예약 정보"
                  className="w-8 h-8 object-contain shrink-0 select-none"
                  draggable={false}
                />
                <h3 className="text-sm font-black text-slate-900">
                  AI가 추출한 예약 정보
                </h3>
              </div>

              <button
                type="button"
                onClick={onExtractWithAi}
                disabled={isExtractingAi}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Gemini AI로 다시 추출"
              >
                <RefreshCw className={`w-3 h-3 ${isExtractingAi ? 'animate-spin' : ''}`} />
                <span>재추출</span>
              </button>
            </div>

            {/* CRM Save Feedback Toast */}
            {crmSavedNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{crmSavedNotice}</span>
              </div>
            )}

            {/* 블록 1: 고객사 및 탑승객 정보 */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2.5">
              {/* 고객사 & CRM 연동 (가벼운 회색 칩) */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 font-semibold shrink-0">고객사</span>
                  <span className="text-xs font-black text-slate-900 truncate">
                    {companyName || '미지정'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveToCrm}
                  disabled={extractedDraft.isSavedToCrm || isSavingCrm}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors shrink-0 flex items-center gap-1 ${
                    extractedDraft.isSavedToCrm
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 cursor-default'
                      : isSavingCrm
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 cursor-pointer shadow-2xs'
                  }`}
                  title="고객 관리에 회사 및 담당자 정보를 저장하거나 연결합니다"
                >
                  <BookmarkCheck className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {isSavingCrm
                      ? '저장 중...'
                      : extractedDraft.isSavedToCrm
                      ? '고객 관리 연결됨'
                      : '고객 관리에 저장'}
                  </span>
                </button>
              </div>

              {/* 예약 담당자 (출처 괄호 태그 완전 삭제) */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0">
                  <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>예약 담당자</span>
                </div>
                <div className="text-right min-w-0 flex items-center gap-2">
                  <span className="font-extrabold text-slate-900">
                    {contactName || '미지정'}
                  </span>
                  {(contactPhone || contactEmail) && (
                    <span className="text-slate-500 font-medium text-[11px]">
                      ({contactPhone || contactEmail})
                    </span>
                  )}
                </div>
              </div>

              {/* 대표 탑승객 & 연락처 */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0">
                  <Users className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>대표 탑승객</span>
                </div>
                <div className="text-right min-w-0 flex items-center gap-2">
                  <span className="font-extrabold text-slate-900">
                    {passengerName || '승객 미지정'}
                  </span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    (총 {passengerCount}명)
                  </span>
                  {passengerPhone && (
                    <span className="text-slate-500 font-medium text-[11px]">
                      ({passengerPhone})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 블록 2: 배차 조건 요약 */}
            <div className="rounded-xl bg-slate-50/70 p-4 space-y-3">
              {/* 운행 기간 */}
              <div className="flex items-start justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-medium shrink-0">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>운행 기간</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 min-w-0 text-right font-semibold text-slate-800">
                  {hasMultipleDates ? (
                    <>
                      <span>
                        {uniqueDates[0]} ~ {uniqueDates[uniqueDates.length - 1]}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">
                        {uniqueDates.length}일간
                      </span>
                    </>
                  ) : (
                    <span>{pickupDate}</span>
                  )}
                  {!hasMultipleDates && (
                    <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{pickupTime}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* 요청 차종 */}
              <div className="flex items-start justify-between gap-3 text-xs pt-3 border-t border-slate-200/40">
                <div className="flex items-center gap-2 text-slate-500 font-medium shrink-0">
                  <Car className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>요청 차종</span>
                </div>
                <span className="text-right font-semibold text-slate-800">
                  {requestedVehicleClass}
                </span>
              </div>

              {/* 항공편명 (정보 없음 ➔ 미정 출국 전 확인 필요) */}
              <div className="flex items-start justify-between gap-3 text-xs pt-3 border-t border-slate-200/40">
                <div className="flex items-center gap-2 text-slate-500 font-medium shrink-0">
                  <Plane className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>항공편명</span>
                </div>
                {flightNumber ? (
                  <span className="text-right font-mono font-semibold text-slate-800">{flightNumber}</span>
                ) : (
                  <span className="text-right text-[11px] font-medium text-slate-600">
                    미정 (출국 전 확인 필요)
                  </span>
                )}
              </div>

              {/* 필수 조건 (영어 가능 기사, 동일 기사 3일 전담) */}
              <div className="flex items-start justify-between gap-3 text-xs pt-3 border-t border-slate-200/40">
                <div className="text-slate-500 font-medium shrink-0">
                  <span>필수 조건</span>
                </div>
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 min-w-0 text-right text-[11px] font-medium text-slate-700">
                  {isEnglishRequired && (
                    <span>영어 가능 기사</span>
                  )}
                  {hasMultipleDates && (
                    <span>동일 기사 {uniqueDates.length}일 전담</span>
                  )}
                  {specialRequests && !specialRequests.includes('영어') && !specialRequests.includes('동일 기사') && (
                    <span>{specialRequests}</span>
                  )}
                  {!isEnglishRequired && !hasMultipleDates && !specialRequests && (
                    <span className="text-slate-400">특이사항 없음</span>
                  )}
                </div>
              </div>
            </div>

            {/* 블록 3: 상세 이동 경로 */}
            <div className="rounded-xl bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center gap-2 min-w-0 pb-2">
                <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 shrink-0">운행 경로 (상세 일정)</span>
                <span className="text-[11px] font-normal text-slate-500 truncate">
                  총 {waypoints.length > 0 ? waypoints.length : 2}개 경유지
                  {hasMultipleDates && ` · ${uniqueDates.length}일간`}
                </span>
              </div>

              {/* Multi-destination Timeline Accordion */}
              {hasMultipleWaypoints ? (
                <div className="space-y-3">
                  {dayGroups.map((group) => {
                    const isCollapsed = isDayCollapsed(group.date);
                    return (
                      <div
                        key={group.date}
                        className={`relative rounded-xl bg-white overflow-visible ${waypointEdit && group.items.some((wp) => wp.id === waypointEdit.id) ? 'z-30' : 'z-0'}`}
                      >
                        {/* Day Group Header Accordion Trigger */}
                        <div
                          onClick={() => toggleDayCollapse(group.date)}
                          className="px-3.5 py-2.5 rounded-t-xl bg-slate-100/70 hover:bg-slate-100 flex items-center justify-between cursor-pointer transition-colors select-none"
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-semibold text-slate-900">
                              {formatWaypointDate(group.date, hasMultipleDates ? group.dayIndex : undefined)}
                            </span>
                            <span className="text-[11px] font-medium text-slate-400">
                              · {group.items.length}곳
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-slate-400 hover:text-slate-600">
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </div>
                        </div>

                        {/* Timeline List (Expanded) */}
                        {!isCollapsed && (
                          <div className="p-3">
                            <div className="relative pl-6 py-1 space-y-2.5">
                              {/* Vertical Rail Line */}
                              <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-200" />

                              {group.items.map((wp, wIdx) => {
                                const isFirst = wIdx === 0;
                                const isLast = wIdx === group.items.length - 1 && group.items.length > 1;
                                const isEditingThis = waypointEdit?.id === wp.id;

                                return (
                                  <div
                                    key={wp.id}
                                    className="relative flex items-center justify-between group/node"
                                  >
                                    {/* Timeline Node Bullet */}
                                    <div
                                      aria-hidden="true"
                                      className={`absolute -left-[16px] w-2.5 h-2.5 rounded-full z-10 ${
                                        isFirst ? 'bg-slate-600' : isLast ? 'bg-slate-800' : 'bg-slate-300'
                                      }`}
                                    />

                                    {/* TMAP POI autocomplete with draft-only edits. */}
                                    {isEditingThis && waypointEdit ? (
                                      <div
                                        ref={waypointEditorRef}
                                        className="relative z-30 flex flex-1 min-w-0 flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2"
                                        onKeyDown={(event) => {
                                          if (event.key === 'Escape') {
                                            event.stopPropagation();
                                            setWaypointEdit(null);
                                          }
                                        }}
                                      >
                                        <input
                                          type="text"
                                          value={waypointEdit.time}
                                          onChange={(event) =>
                                            setWaypointEdit((draft) => draft ? { ...draft, time: event.target.value } : draft)
                                          }
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter') saveWaypointEdit();
                                          }}
                                          placeholder="10:00"
                                          aria-label="경유지 시간"
                                          className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-xs tabular-nums font-medium text-slate-800 outline-none focus:border-slate-400"
                                        />
                                        <div className="min-w-[150px] flex-[1_1_180px]">
                                          <HqPlaceSearchInput
                                            key={wp.id}
                                            value={waypointEdit.location}
                                            onChange={(location) =>
                                              setWaypointEdit((draft) => draft ? {
                                                ...draft, location, selectedPoi: null, isPoiConfirmed: false,
                                              } : draft)
                                            }
                                            onSelectPoi={(poi) =>
                                              setWaypointEdit((draft) => draft ? {
                                                ...draft, location: poi.name, selectedPoi: poi, isPoiConfirmed: true,
                                              } : draft)
                                            }
                                            onConfirmStateChange={(confirmed) =>
                                              setWaypointEdit((draft) => draft ? { ...draft, isPoiConfirmed: confirmed } : draft)
                                            }
                                            isConfirmed={waypointEdit.isPoiConfirmed}
                                            placeholder="TMAP 장소 검색"
                                            heightClass="h-9"
                                            tone="neutral"
                                            autoSearch
                                          />
                                        </div>
                                        {waypointEdit.selectedPoi?.address && (
                                          <p className="w-full break-words px-1 text-[11px] text-slate-500">{waypointEdit.selectedPoi.address}</p>
                                        )}
                                        <button
                                          type="button"
                                          onClick={saveWaypointEdit}
                                          disabled={!waypointEdit.location.trim()}
                                          className="h-9 rounded-lg bg-slate-800 px-2.5 text-[11px] font-medium text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                        >
                                          완료
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setWaypointEdit(null)}
                                          className="flex h-9 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                                          aria-label="수정 취소"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div
                                        onClick={() => beginWaypointEdit(wp)}
                                        className="flex-1 flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer select-none group/item"
                                      >
                                        <div className="flex min-w-0 flex-col gap-1">
                                          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                                            <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-slate-600">
                                              {wp.time || '--:--'}
                                            </span>
                                            <span className="min-w-0 text-xs font-medium text-slate-800">
                                              {wp.location || '장소 미지정'}
                                            </span>
                                            {isFirst && <span className="shrink-0 text-[10px] text-slate-500">출발</span>}
                                            {isLast && <span className="shrink-0 text-[10px] text-slate-500">종료</span>}
                                          </div>
                                          <p className="pl-[60px] text-[11px] leading-relaxed text-slate-500">
                                            {wp.address || (isVerifiedEmailRouteStop({
                                              id: wp.id, date: wp.date || pickupDate, time: wp.time || '',
                                              location: wp.location, lat: wp.lat, lng: wp.lng,
                                              isPoiConfirmed: Boolean(wp.isPoiConfirmed),
                                            }) ? 'TMAP 좌표 확인됨 · 상세 주소 재검색 가능'
                                              : '주소 미확정 · 눌러서 TMAP 검색 결과 선택')}
                                          </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 transition-opacity">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              beginWaypointEdit(wp);
                                            }}
                                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                                            aria-label="경유지 수정"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                          {waypoints.length > 2 && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveWaypoint(wp.id);
                                              }}
                                              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                                              aria-label="경유지 삭제"
                                            >
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Add Stop Button per day */}
                            <div className="pt-2 flex justify-start pl-5">
                              <button
                                type="button"
                                onClick={() => handleAddWaypointForDay(group.date)}
                                className="text-[11px] font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>경유지 추가</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Single Leg Timeline View with POI search */
                <div className="relative pl-6 py-2 space-y-3">
                  <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-200" />

                  {/* Pickup */}
                  <div className="relative flex items-center justify-between">
                    <div aria-hidden="true" className="absolute -left-[16px] w-2.5 h-2.5 rounded-full bg-slate-600 z-10" />
                    <div className="flex-1 min-w-0 pl-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs tabular-nums font-medium text-slate-600">{pickupTime}</span>
                        <span className="text-[10px] font-medium text-slate-500">
                          출발
                        </span>
                      </div>
                      <HqPlaceSearchInput
                        value={pickupLocation}
                        onChange={(val) => {
                          if (!extractedDraft) return;
                          const first = [...(extractedDraft.waypoints || [])].sort((a, b) => a.order - b.order)[0];
                          onUpdateDraft?.(changeEmailRouteStopName(extractedDraft, first?.id || 'pickup', val));
                        }}
                        onSelectPoi={handleSelectPickupPoi}
                        autoSearch={true}
                        isConfirmed={isPickupPoiConfirmed}
                        placeholder="TMAP 출발지 검색 및 후보 선택"
                        heightClass="h-9"
                      />
                      <p className="mt-1.5 break-words text-[11px] leading-relaxed text-slate-500">
                        {extractedDraft?.pickupAddress || '상세 주소 미확정 · TMAP 검색 결과를 선택해 주세요.'}
                      </p>
                    </div>
                  </div>

                  {/* Dropoff */}
                  <div className="relative flex items-center justify-between pt-2">
                    <div aria-hidden="true" className="absolute -left-[16px] w-2.5 h-2.5 rounded-full bg-slate-800 z-10" />
                    <div className="flex-1 min-w-0 pl-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-medium text-slate-500">
                          종료
                        </span>
                      </div>
                      <HqPlaceSearchInput
                        value={dropoffLocation}
                        onChange={(val) => {
                          if (!extractedDraft) return;
                          const last = [...(extractedDraft.waypoints || [])].sort((a, b) => a.order - b.order).at(-1);
                          onUpdateDraft?.(changeEmailRouteStopName(extractedDraft, last?.id || 'dropoff', val));
                        }}
                        onSelectPoi={handleSelectDropoffPoi}
                        autoSearch={true}
                        isConfirmed={isDropoffPoiConfirmed}
                        icon="flag"
                        placeholder="TMAP 도착지 검색 및 후보 선택"
                        heightClass="h-9"
                      />
                      <p className="mt-1.5 break-words text-[11px] leading-relaxed text-slate-500">
                        {extractedDraft?.dropoffAddress || '상세 주소 미확정 · TMAP 검색 결과를 선택해 주세요.'}
                      </p>
                    </div>
                  </div>
                  {/* Single-leg card also gets its own per-day add control. */}
                  <button
                    type="button"
                    onClick={handleConvertToMultiDestination}
                    className="ml-1 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    <span>경유지 추가</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* On-Demand AI Extraction Callout (When not yet analyzed) */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="group relative flex flex-col items-center cursor-pointer">
              {/* Speech Bubble - reveals on hover */}
              <div className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-white text-[11px] font-extrabold px-3 py-1.5 rounded-full shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 flex items-center gap-1.5 z-20">
                <span>⚡ 3초만에 스케줄링 해드릴게요!</span>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-slate-900 rotate-45" />
              </div>

              {/* AI Email Icon with hover scale */}
              <div className="transition-transform duration-200 group-hover:scale-110">
                <img
                  src="/images/icons/ai_email.png"
                  alt="AI 예약 정보 추출"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-md select-none"
                />
              </div>
            </div>

            <h4 className="text-base font-extrabold text-slate-900">
              메일에서 예약 정보를 찾아낼까요?
            </h4>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
              고객사, 담당자 연락처, 픽업 일정부터 목적지까지 AI가 한눈에 보기 쉽게 정리해 드려요.
            </p>
            <button
              type="button"
              onClick={onExtractWithAi}
              disabled={isExtractingAi || isLoadingDetail}
              className="mt-3 px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 hover:-translate-y-0.5 hover:shadow-md hover:shadow-blue-500/15 active:translate-y-0 active:scale-98 text-white text-sm font-extrabold shadow-2xs transition-all duration-150 cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isExtractingAi ? 'animate-spin' : ''}`} />
              <span>{isExtractingAi ? '예약 내용을 꼼꼼히 읽고 있어요...' : '3초 만에 예약 정보 채우기'}</span>
            </button>
            <p className="text-[11px] text-slate-400 pt-2">
              * 직접 누르실 때만 안전하게 분석이 시작됩니다.
            </p>
          </div>
        )}

        {/* Action Buttons: 예약 정보 확인 후 4단계 확정 화면으로 이동 */}
        {extractedDraft && (
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 z-10">
            {/* 보조 버튼 (좌측) */}
            <button
              type="button"
              onClick={handleSaveClick}
              className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <Save className="w-3.5 h-3.5 text-slate-400" />
              <span>임시 저장</span>
            </button>

            {/* 메인 액션 (우측) */}
            <button
              type="button"
              onClick={handleRegisterClick}
              className="px-6 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-[#1855DB] active:scale-95 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2"
            >
              <span>예약 확정</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
