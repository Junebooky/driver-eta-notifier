'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Paperclip,
  FileText,
  Download,
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
  Compass,
  User,
  ListOrdered,
  Bookmark,
} from 'lucide-react';
import { HqEmailSummary, HqEmailDetail, HqEmailExtractedDraft, RouteWaypointItem } from '@/types/emailHq';
import { haptics } from '@/utils/haptics';
import { HqBadge } from '@/components/hq/ui';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import { HqSourceText } from '@/components/hq/ui/HqSourceText';
import { findEmailSourceRanges } from '@/utils/emailWorkflowReview';
import { HqPlaceSearchInput, PoiResult } from '@/components/hq/HqPlaceSearchInput';
import { saveContactToCrm } from '@/utils/crmCustomerSync';
import { HqEmailAddressCandidate } from './HqEmailAddressCandidate';
import { buildAirportArrivalPickupGroups } from '@/utils/emailBookingEvidence';
import { confirmEmailRouteStop, changeEmailRouteStopName, getUnconfirmedEmailRouteStops, isVerifiedEmailRouteStop } from '@/utils/emailRoutePlaceVerification';

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
  const attachmentFiles = emailDetail?.attachments || (extractedDraft?.sourceAttachments || []).map(file => ({ filename: file.filename, contentType: file.kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 0 }));

  const [sourceEvidence, setSourceEvidence] = useState({ emailId: '', query: '', message: '', revision: 0 });
  const locateSource = (address: string) => {
    const fullBody = emailDetail?.bodyText || '';
    const matches = !isLoadingDetail ? findEmailSourceRanges(fullBody, address) : [];
    setSourceEvidence(previous => ({ emailId: emailSummary.id, query: matches.length ? address : '', revision: previous.revision + 1,
      message: isLoadingDetail ? '이메일 원문을 불러온 뒤 다시 확인해 주세요.' : matches.length
        ? `고객 제공 주소와 일치하는 원문 ${matches.length}곳을 표시했습니다. TMAP 위치 확정과는 별도입니다.`
        : '이메일 본문에서 일치하는 주소를 찾지 못했습니다. 첨부 파일이나 다른 표현으로 제공됐는지 확인해 주세요.',
    }));
  };
  const currentEvidence = sourceEvidence.emailId === emailSummary.id ? sourceEvidence : null;

  // Editing mode toggle
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingCrm, setIsSavingCrm] = useState(false);
  const [crmSavedNotice, setCrmSavedNotice] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Field values with safe fallbacks
  const companyName = extractedDraft?.companyName || '';
  const eventName = extractedDraft?.eventName || '';
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
  const flights = extractedDraft?.flights || [];
  const arrivalGroups = buildAirportArrivalPickupGroups(flights);
  const requestedVehicleClass = extractedDraft?.requestedVehicleClass || '차량 미지정';
  const specialRequests = extractedDraft?.specialRequests || '';

  // Multi-destination waypoints check & Multi-day grouping
  const waypoints: RouteWaypointItem[] = extractedDraft?.waypoints || [];
  const hasMultipleWaypoints = waypoints.length > 2;
  const unconfirmedPlaces = extractedDraft ? getUnconfirmedEmailRouteStops(extractedDraft).length : 0;

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
      selectedPoi:
        wp.address && typeof wp.lat === 'number' && typeof wp.lng === 'number'
          ? {
            id: wp.id,
            name: wp.location,
            address: wp.address,
            lat: wp.lat,
            lng: wp.lng,
          }
          : null,
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
      <div className="lg:col-span-6 flex min-h-[640px] flex-col overflow-hidden rounded-[23px] bg-white shadow-[0_6px_20px_rgba(35,49,78,0.055)]">
        {/* Email Header */}
        <div className="bg-white p-5">
          <h2 className="text-[18px] font-bold leading-snug tracking-[-0.02em] text-[#17233B]">
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

        <HqInlineFeedback message={currentEvidence?.message} tone="info" className="mx-5" />
        {/* Email Body */}
        <div className="flex-1 overflow-y-auto p-5 font-sans text-[13px] text-[#4D607C] leading-relaxed whitespace-pre-line selection:bg-blue-100">
          {isLoadingDetail ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-[#1E60F3]" />
              <p className="text-xs font-medium">이메일 본문 안전 로드 중 (PEEK Read-Only)...</p>
            </div>
          ) : (
            <HqSourceText text={bodyText} query={currentEvidence?.query || ''} revision={currentEvidence?.revision} />
          )}
        </div>

        {/* Real attachment metadata from read-only IMAP, never fictitious demo names. */}
        {(emailDetail?.hasAttachments || attachmentFiles.length > 0) && (
          <div className="bg-[#FAFBFD] p-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Paperclip className="h-3.5 w-3.5 text-slate-500" />
              <span>첨부 파일{attachmentFiles.length ? ` (${attachmentFiles.length})` : ''}</span>
            </div>
            {attachmentFiles.length ? (
              <div className="flex flex-wrap gap-2">
                {attachmentFiles.map((file, index) => {
                  const lower = (file.filename || '').toLowerCase();
                  const isPdf = lower.endsWith('.pdf');
                  const isExcel = lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv');
                  const isWord = lower.endsWith('.docx') || lower.endsWith('.doc');

                  const visual = isPdf
                    ? { bg: 'bg-rose-50 text-rose-600 border border-rose-100', icon: <FileText className="h-4 w-4 shrink-0 text-rose-600" strokeWidth={1.8} /> }
                    : isExcel
                      ? { bg: 'bg-emerald-50 text-emerald-600 border border-emerald-100', icon: <img src="/images/icons/icon_excel.png" alt="Excel" className="w-4 h-4 object-contain shrink-0" /> }
                      : isWord
                        ? { bg: 'bg-blue-50 text-[#1E60F3] border border-blue-100', icon: <FileText className="h-4 w-4 shrink-0 text-[#1E60F3]" strokeWidth={1.8} /> }
                        : { bg: 'bg-slate-100 text-slate-600 border border-slate-200', icon: <FileText className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.8} /> };

                  const emailId = emailDetail?.id || emailSummary.id;
                  const downloadUrl = `/api/email/${encodeURIComponent(emailId)}/attachment?filename=${encodeURIComponent(file.filename)}&index=${index}`;

                  return (
                    <a
                      key={`${file.filename}-${index}`}
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={file.filename}
                      className="group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[15px] bg-white px-3 py-3 shadow-[0_4px_14px_rgba(35,49,78,0.045)] transition-shadow hover:shadow-[0_5px_16px_rgba(35,49,78,0.07)] active:scale-[0.99]"
                      title={`${file.filename} 다운로드 / 열기`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${visual.bg}`}>
                        {visual.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="max-w-[210px] truncate text-[11px] font-bold text-slate-800 group-hover:text-[#1E60F3] transition-colors" title={file.filename}>
                          {file.filename}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                          <span>{file.size ? `${(file.size / 1024).toFixed(0)} KB` : '메일 원본 첨부파일'}</span>
                          <span className="text-[#1E60F3] font-semibold inline-flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                            <Download className="w-2.5 h-2.5 stroke-[2.5]" />
                            열기
                          </span>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">첨부파일이 있습니다. 메일을 불러온 뒤 파일명을 확인해 주세요.</p>
            )}
            <p className="mt-2 text-[11px] text-slate-500">지원되는 Excel·PDF 일정표는 ‘AI로 분석하기’를 누를 때만 읽습니다.</p>
          </div>
        )}
      </div>

      {/* 2. Right Sub-Column: AI Extraction Card */}
      <div className="relative lg:col-span-6 flex min-h-[640px] flex-col justify-between overflow-visible rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055)] sm:p-6">
        {extractedDraft ? (
          <div className="space-y-4">
            {/* Header: Sparkles + Title + Refresh Button */}
            <div className="flex items-center justify-between gap-3 pb-4">
              <div className="flex items-center gap-2.5">
                <img
                  src="/images/icons/ai_email.png"
                  alt="AI가 추출한 예약 정보"
                  className="w-8 h-8 object-contain shrink-0 select-none"
                  draggable={false}
                />
                <h3 className="text-[17px] font-bold tracking-[-0.03em] text-[#17233B] sm:text-[20px]">
                  AI가 추출한 예약 정보
                </h3>
              </div>

              <button
                type="button"
                onClick={onExtractWithAi}
                disabled={isExtractingAi}
                className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[13px] bg-white px-3.5 text-[12px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.055)] transition-colors hover:bg-[#F5F8FF]"
                title="Gemini AI로 다시 추출"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isExtractingAi ? 'animate-spin' : ''}`} />
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
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.03)] space-y-3.5">
              {/* 고객사 & CRM 연동 */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 font-semibold shrink-0">고객사</span>
                  <span className="text-sm font-black text-slate-900 truncate ml-1">
                    {companyName || '미지정'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveToCrm}
                  disabled={extractedDraft.isSavedToCrm || isSavingCrm}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors shrink-0 flex items-center gap-1.5 ${extractedDraft.isSavedToCrm
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
                    : isSavingCrm
                      ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/80 cursor-pointer shadow-2xs'
                    }`}
                  title="고객 관리에 회사 및 담당자 정보를 저장하거나 연결합니다"
                >
                  <Bookmark className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {isSavingCrm
                      ? '저장 중...'
                      : extractedDraft.isSavedToCrm
                        ? '고객 관리 연결됨'
                        : '고객 관리에 저장'}
                  </span>
                </button>
              </div>

              {/* Event title is edited independently of the customer's CRM company. */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label htmlFor="hq-extracted-event-name" className="flex shrink-0 items-center gap-2 text-xs font-semibold text-[#6E809B]">
                  <Calendar className="h-4 w-4 text-[#94A3B8]" /> 행사명
                </label>
                <input id="hq-extracted-event-name" type="text" value={eventName}
                  onChange={(e) => extractedDraft && onUpdateDraft?.({ ...extractedDraft, eventName: e.target.value })}
                  maxLength={160} placeholder={companyName ? `행사명 입력 (고객사: ${companyName})` : '고객사 이메일의 행사명 입력'}
                  className="h-10 w-full rounded-[12px] bg-[#F6F7FA] px-3.5 text-[13px] font-semibold text-[#17233B] outline-none placeholder:text-[#A8B5C8] focus:bg-white focus:ring-1 focus:ring-[#1E60F3]/35 sm:max-w-[65%]"
                />
              </div>

              {/* 예약 담당자 */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>예약 담당자</span>
                </div>
                <div className="text-right min-w-0 flex items-center gap-1">
                  <span className="font-black text-slate-900">
                    {contactName || '미지정'}
                  </span>
                  {(contactPhone || contactEmail) && (
                    <span className="text-slate-500 font-normal text-xs ml-1">
                      ({contactPhone || contactEmail})
                    </span>
                  )}
                </div>
              </div>

              {/* 대표 탑승객 */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0">
                  <Users className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>대표 탑승객</span>
                </div>
                <div className="text-right min-w-0 flex flex-col items-end gap-0.5">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <span className="font-black text-slate-900">{passengerName || '승객 미지정'}</span>
                    <span className="text-slate-500 font-normal text-xs ml-1">(총 {passengerCount}명)</span>
                    {passengerPhone && <span className="text-slate-500 font-normal text-xs ml-1">({passengerPhone})</span>}
                  </div>
                  {(extractedDraft?.passengerNames?.length || 0) > 1 && (
                    <span className="text-[11px] text-slate-500 break-words">
                      전체 탑승객 · {extractedDraft!.passengerNames!.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 블록 2: 배차 조건 요약 */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-4 sm:p-5 space-y-3.5">
              {/* 운행 기간 */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>운행 기간</span>
                </div>
                <div className="flex items-center gap-1 font-bold text-slate-900">
                  {hasMultipleDates ? (
                    <>
                      <span>
                        {uniqueDates[0]} ~ {uniqueDates[uniqueDates.length - 1]}
                      </span>
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        ({uniqueDates.length}일간)
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{pickupDate}</span>
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2 mr-1" />
                      <span>{pickupTime}</span>
                    </>
                  )}
                </div>
              </div>

              {/* 요청 차종 */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0">
                  <Car className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>요청 차종</span>
                </div>
                <span className="font-bold text-slate-900">
                  {requestedVehicleClass}
                </span>
              </div>

              {/* 모든 항공편: 도착·출발 및 환승 구간을 구분하여 표시 */}
              <div className="flex items-start justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0 pt-0.5">
                  <Plane className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>항공편</span>
                </div>
                <div className="min-w-0 text-right space-y-1">
                  {flights.length > 0 ? flights.map((flight, index) => {
                    const arrivalGroup = flight.role === 'arrival' ?
                      arrivalGroups.find(group => group.date === flight.date && group.flightNumber === flight.flightNumber) : undefined;
                    const roleLabel = arrivalGroup?.totalGroups && arrivalGroup.totalGroups > 1
                      ? `${arrivalGroup.sequence}차 입국 그룹`
                      : flight.role === 'arrival' ? '입국' : flight.role === 'departure' ? '출국' : flight.role === 'connection' ? '환승' : '';
                    const shownClock = flight.role === 'arrival' ? flight.scheduledArrival
                      : flight.scheduledDeparture;
                    return (
                      <div key={flight.date + flight.flightNumber + index} className="font-medium text-slate-900 leading-relaxed">
                        <span className="font-mono font-bold">{flight.flightNumber}</span>
                        <span className="text-slate-500 ml-1.5">{flight.date.slice(5)} · {flight.originAirport || '?'}-{flight.destinationAirport || '?'}</span>
                        {roleLabel && <span className="ml-1.5 text-slate-500">({roleLabel})</span>}
                        {shownClock && <span className="ml-1.5 text-slate-500">· {flight.role === 'arrival' ? '도착' : '출발'} {shownClock}</span>}
                        {flight.passengers?.length ? <span className="block text-[10px] text-slate-500">{flight.passengers.join(', ')} · {flight.passengers.length}명</span> : null}
                      </div>
                    );
                  }) : flightNumber ? (
                    <span className="font-mono font-bold text-slate-900">{flightNumber}</span>
                  ) : (
                    <span className="font-medium text-slate-600">미정 (출국 전 확인 필요)</span>
                  )}
                </div>
              </div>

              {/* 필수 조건 */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-semibold shrink-0">
                  <ListOrdered className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>필수 조건</span>
                </div>
                <span className="font-bold text-slate-900">
                  {isEnglishRequired
                    ? '영어 가능 기사'
                    : hasMultipleDates
                      ? `동일 기사 ${uniqueDates.length}일 전담`
                      : specialRequests || '특이사항 없음'}
                </span>
              </div>
            </div>

            {/* 블록 3: 상세 이동 경로 */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 min-w-0 pt-1 pb-0.5">
                <Compass className="w-4.5 h-4.5 text-slate-800 shrink-0" />
                <span className="text-sm font-black text-slate-900 shrink-0">운행 경로 (상세 일정)</span>
                <span className="text-xs font-normal text-slate-400 truncate">
                  총 {waypoints.length > 0 ? waypoints.length : 2}개 경유지
                  {hasMultipleDates && ` · ${uniqueDates.length}일간`}
                </span>
                {unconfirmedPlaces > 0 && (
                  <HqBadge tone="warning" className="ml-auto shrink-0">주소 {unconfirmedPlaces}곳 확인 필요</HqBadge>
                )}
              </div>

              {unconfirmedPlaces > 0 && (
                <p className="text-[11px] leading-relaxed text-slate-500">
                  경유지를 누른 뒤 TMAP 검색 결과에서 실제 주소를 선택해 주세요. 확인한 주소는 일정 아래에 표시됩니다.
                </p>
              )}

              {/* Multi-destination Timeline Accordion */}
              {hasMultipleWaypoints ? (
                <div className="space-y-3">
                  {dayGroups.map((group) => {
                    const isCollapsed = isDayCollapsed(group.date);
                    return (
                      <div
                        key={group.date}
                        className={`relative rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-4 sm:p-5 overflow-visible ${waypointEdit && group.items.some((wp) => wp.id === waypointEdit.id) ? 'z-30' : 'z-0'}`}
                      >
                        {/* Day Group Header Accordion Trigger */}
                        <div
                          onClick={() => toggleDayCollapse(group.date)}
                          className="flex items-center justify-between cursor-pointer select-none pb-1"
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-sm font-black text-slate-900">
                              {formatWaypointDate(group.date, hasMultipleDates ? group.dayIndex : undefined)} · {group.items.length}곳
                            </span>
                          </div>

                          <div className="flex items-center text-slate-400 hover:text-slate-600">
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </div>
                        </div>

                        {/* Timeline List (Expanded) */}
                        {!isCollapsed && (
                          <div className="pt-3">
                            <div className="space-y-4 pt-1">
                              {group.items.map((wp, wIdx) => {
                                const isFirst = wIdx === 0;
                                const isLast = wIdx === group.items.length - 1 && group.items.length > 1;
                                const isEditingThis = waypointEdit?.id === wp.id;
                                const activeAddress =
                                  (isEditingThis && waypointEdit ? waypointEdit.selectedPoi?.address : null) ||
                                  wp.address ||
                                  '';
                                const displayRoadAddress = activeAddress
                                  ? activeAddress.replace(/\s*\(.*?\)/g, '').trim()
                                  : '';
                                const displayFullAddress = activeAddress || '';

                                return (
                                  <div
                                    key={wp.id}
                                    className="relative flex items-start gap-3.5 group/node"
                                  >
                                    {/* Timeline Column with seamless, unbreakable continuous rail */}
                                    <div className="relative flex flex-col items-center self-stretch shrink-0 w-5">
                                      {/* Connector Line to next node */}
                                      {!isLast && (
                                        <div className="absolute top-5 -bottom-4 w-[2px] bg-slate-200" />
                                      )}
                                      {/* Node Icon */}
                                      <div className="relative z-10 mt-3 flex h-5 w-5 items-center justify-center">
                                        {isFirst ? (
                                          <img
                                            src="/images/icons/driver_ui/icon_origin.png"
                                            alt="출발"
                                            className="h-6 w-6 object-contain"
                                          />
                                        ) : isLast ? (
                                          <img
                                            src="/images/icons/driver_ui/icon_destination.png"
                                            alt="종료"
                                            className="h-6 w-6 object-contain"
                                          />
                                        ) : (
                                          <div
                                            aria-hidden="true"
                                            className="h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-white"
                                          />
                                        )}
                                      </div>
                                    </div>

                                    {/* Content (Edit Card or Standard Row) */}
                                    <div className="flex-1 min-w-0">
                                      {isEditingThis && waypointEdit ? (
                                        <div
                                          ref={waypointEditorRef}
                                          className="rounded-[24px] bg-white border border-slate-200/90 shadow-sm p-3.5 sm:p-4 space-y-3 animate-in fade-in zoom-in-98 duration-150"
                                          onKeyDown={(event) => {
                                            if (event.key === 'Escape') {
                                              event.stopPropagation();
                                              setWaypointEdit(null);
                                            }
                                          }}
                                        >
                                          {/* Top Row: Time pill + Location Search Input */}
                                          <div className="flex items-center gap-2.5 sm:gap-3">
                                            {/* Time Pill */}
                                            <div className="flex h-11 w-24 sm:w-28 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-200/80 px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                                              <input
                                                type="text"
                                                value={waypointEdit.time}
                                                onChange={(event) =>
                                                  setWaypointEdit((draft) =>
                                                    draft ? { ...draft, time: event.target.value } : draft
                                                  )
                                                }
                                                onKeyDown={(event) => {
                                                  if (event.key === 'Enter') saveWaypointEdit();
                                                }}
                                                placeholder="11:00"
                                                aria-label="경유지 시간"
                                                className="w-full bg-transparent text-center text-sm font-black text-slate-900 outline-none placeholder:text-slate-400"
                                              />
                                            </div>

                                            {/* Location Search Input */}
                                            <div className="flex-1 min-w-0">
                                              <HqPlaceSearchInput
                                                key={wp.id}
                                                value={waypointEdit.location}
                                                onChange={(location) =>
                                                  setWaypointEdit((draft) =>
                                                    draft
                                                      ? {
                                                        ...draft,
                                                        location,
                                                        selectedPoi: null,
                                                        isPoiConfirmed: false,
                                                      }
                                                      : draft
                                                  )
                                                }
                                                onSelectPoi={(poi) =>
                                                  setWaypointEdit((draft) =>
                                                    draft
                                                      ? {
                                                        ...draft,
                                                        location: poi.name,
                                                        selectedPoi: poi,
                                                        isPoiConfirmed: true,
                                                      }
                                                      : draft
                                                  )
                                                }
                                                onConfirmStateChange={(confirmed) =>
                                                  setWaypointEdit((draft) =>
                                                    draft ? { ...draft, isPoiConfirmed: confirmed } : draft
                                                  )
                                                }
                                                isConfirmed={waypointEdit.isPoiConfirmed}
                                                addressHint={wp.clientAddress}
                                                placeholder="TMAP 장소 검색"
                                                heightClass="h-11 rounded-2xl"
                                                icon="mapPin"
                                                autoSearch
                                              />
                                            </div>
                                          </div>

                                          {/* Bottom Row: Address Confirmation & Action Buttons */}
                                          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                                            <div className="min-w-0 flex-1">
                                              <p className="text-sm font-bold text-slate-900 truncate">
                                                {displayRoadAddress || waypointEdit.location || '상세 주소를 선택해 주세요'}
                                              </p>
                                              <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
                                                {displayFullAddress ||
                                                  (waypointEdit.selectedPoi
                                                    ? 'TMAP 좌표 확인됨'
                                                    : 'TMAP 검색 결과에서 장소를 선택해 주세요')}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              <button
                                                type="button"
                                                onClick={saveWaypointEdit}
                                                disabled={!waypointEdit.location.trim()}
                                                className="px-4 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                              >
                                                완료
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setWaypointEdit(null)}
                                                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors cursor-pointer"
                                                aria-label="수정 취소"
                                              >
                                                <X className="h-4 w-4" />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div
                                          onClick={() => beginWaypointEdit(wp)}
                                          className="flex items-start justify-between p-2.5 rounded-2xl hover:bg-slate-50/80 transition-colors cursor-pointer select-none group/item"
                                        >
                                          <div className="flex min-w-0 flex-col gap-0.5">
                                            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                              <span className="w-12 shrink-0 text-xs font-black tabular-nums text-slate-900">
                                                {wp.time || '--:--'}
                                              </span>
                                              <span className="min-w-0 text-xs font-black text-slate-900">
                                                {wp.location || '장소 미지정'}
                                              </span>
                                              {isFirst && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-100/80">
                                                  출발
                                                </span>
                                              )}
                                              {isLast && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                                  종료
                                                </span>
                                              )}
                                            </div>
                                            <div className="pl-14 mt-1 space-y-1">
                                              {wp.address && <p className="break-words text-[11px] text-slate-500">{wp.address}</p>}
                                              {!isVerifiedEmailRouteStop({ ...wp, date: wp.date || pickupDate, time: wp.time || '', isPoiConfirmed: Boolean(wp.isPoiConfirmed) }) && (
                                                <HqBadge tone="warning">주소 미확정 · 눌러서 TMAP 검색 결과 선택</HqBadge>
                                              )}
                                            </div>
                                            {wp.notes && (
                                              <p className="pl-14 mt-0.5 text-[11px] text-slate-400 break-words">{wp.notes}</p>
                                            )}
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
                                      {!isEditingThis && wp.clientAddress && (
                                        <HqEmailAddressCandidate
                                          onLocateInSource={locateSource}
                                          sourceAddress={wp.clientAddress}
                                          placeName={wp.location}
                                          isPoiConfirmed={Boolean(wp.isPoiConfirmed)}
                                          onPick={(poi) => extractedDraft && onUpdateDraft?.(confirmEmailRouteStop(extractedDraft, wp.id, poi))}
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Add Stop Button per day */}
                            <div className="pt-3 flex justify-start pl-8">
                              <button
                                type="button"
                                onClick={() => handleAddWaypointForDay(group.date)}
                                className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5 text-slate-500" />
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
                <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-4 sm:p-5">
                  <div className="relative pl-7 py-2 space-y-4">
                    <div className="absolute left-[7px] top-3 bottom-3 w-[1.5px] bg-slate-200" />

                    {/* Pickup */}
                    <div className="relative flex items-center justify-between">
                      <img
                        src="/images/icons/driver_ui/icon_origin.png"
                        alt="출발"
                        className="absolute -left-[16px] top-1 w-4 h-4 object-contain z-10 shrink-0"
                      />
                      <div className="flex-1 min-w-0 pl-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs tabular-nums font-black text-slate-900">{pickupTime}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-100/80">
                            출발
                          </span>
                        </div>
                        <HqPlaceSearchInput
                          value={pickupLocation}
                          addressHint={extractedDraft?.pickupProvidedAddress}
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
                        <div className="mt-1.5 space-y-1">
                          {extractedDraft?.pickupAddress && <p className="break-words text-[11px] text-slate-500">{extractedDraft.pickupAddress}</p>}
                          {!isPickupPoiConfirmed && <HqBadge tone="warning">주소 미확정 · TMAP 검색 결과 선택 필요</HqBadge>}
                          {extractedDraft?.pickupProvidedAddress && <HqEmailAddressCandidate className="" sourceAddress={extractedDraft.pickupProvidedAddress} placeName={pickupLocation} isPoiConfirmed={isPickupPoiConfirmed} onPick={handleSelectPickupPoi} onLocateInSource={locateSource} />}
                        </div>
                      </div>
                    </div>

                    {/* Dropoff */}
                    <div className="relative flex items-center justify-between pt-2">
                      <img
                        src="/images/icons/driver_ui/icon_destination.png"
                        alt="종료"
                        className="absolute -left-[16px] top-1 w-4 h-4 object-contain z-10 shrink-0"
                      />
                      <div className="flex-1 min-w-0 pl-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            종료
                          </span>
                        </div>
                        <HqPlaceSearchInput
                          value={dropoffLocation}
                          addressHint={extractedDraft?.dropoffProvidedAddress}
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
                        <div className="mt-1.5 space-y-1">
                          {extractedDraft?.dropoffAddress && <p className="break-words text-[11px] text-slate-500">{extractedDraft.dropoffAddress}</p>}
                          {!isDropoffPoiConfirmed && <HqBadge tone="warning">주소 미확정 · TMAP 검색 결과 선택 필요</HqBadge>}
                          {extractedDraft?.dropoffProvidedAddress && <HqEmailAddressCandidate className="" sourceAddress={extractedDraft.dropoffProvidedAddress} placeName={dropoffLocation} isPoiConfirmed={isDropoffPoiConfirmed} onPick={handleSelectDropoffPoi} onLocateInSource={locateSource} />}
                        </div>
                      </div>
                    </div>

                    {/* Single-leg card also gets its own per-day add control. */}
                    <button
                      type="button"
                      onClick={handleConvertToMultiDestination}
                      className="ml-1 flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 pt-2 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-500" />
                      <span>경유지 추가</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* On-Demand AI Extraction Callout (When not yet analyzed) */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="group relative flex flex-col items-center cursor-pointer">
              {/* Speech Bubble - reveals on hover */}
              <div className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[12px] bg-white px-3 py-2 text-[11px] font-medium text-[#4D607C] shadow-[0_8px_22px_rgba(35,49,78,0.1)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 flex items-center gap-1.5 z-20">
                <span>⚡ 3초만에 스케줄링 해드릴게요!</span>
                <div className="absolute -bottom-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-white" />
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

        {/* Action Buttons: 임시 저장 & 예약 확정 */}
        {extractedDraft && (
          <div className="pt-4 flex items-center justify-between gap-3 z-10">
            {/* 임시 저장 */}
            <button
              type="button"
              onClick={handleSaveClick}
              className="px-6 py-3.5 rounded-2xl border border-slate-200/90 bg-white hover:bg-slate-50 active:scale-95 text-slate-800 text-sm font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-2"
            >
              <Save className="w-4 h-4 text-slate-400" />
              <span>임시 저장</span>
            </button>

            {/* 예약 확정 */}
            <button
              type="button"
              onClick={handleRegisterClick}
              className="px-8 py-3.5 rounded-2xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-sm font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 flex-1"
            >
              <span>예약 확정</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
