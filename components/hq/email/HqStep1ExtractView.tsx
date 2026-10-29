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
} from 'lucide-react';
import { HqEmailSummary, HqEmailDetail, HqEmailExtractedDraft } from '@/types/emailHq';
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
  const [crmSavedNotice, setCrmSavedNotice] = useState<string | null>(null);

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
  const requestedVehicleClass = extractedDraft?.requestedVehicleClass || '카니발 하이리무진';
  const specialRequests = extractedDraft?.specialRequests || '';

  // Handle explicit CRM Save (Requires verified company and contact)
  const handleSaveToCrm = () => {
    if (!extractedDraft) return;

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

    haptics.success();
    const result = saveContactToCrm({
      companyName: cleanCompany,
      contactName: cleanContact,
      contactPhone: extractedDraft.contactPhone || '',
      contactEmail: extractedDraft.contactEmail || '',
      notes: `이메일 접수 예약 수동 연동 (제목: ${subject})`,
      sourceDraftId: extractedDraft.id,
    });

    setCrmSavedNotice(result.message);

    if (result.success) {
      const updated: HqEmailExtractedDraft = {
        ...extractedDraft,
        clientId: result.clientId,
        contactId: result.contactId,
        isSavedToCrm: true,
      };
      onUpdateDraft?.(updated);
    }

    setTimeout(() => {
      setCrmSavedNotice(null);
    }, 4500);
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
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
                      extractedDraft.isSavedToCrm
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-blue-50 text-[#1E60F3] border-blue-200 hover:bg-blue-100'
                    }`}
                    title="고객 관리에 회사 및 담당자 정보를 저장하거나 연결합니다"
                  >
                    <BookmarkCheck className="w-3 h-3" />
                    <span>{extractedDraft.isSavedToCrm ? '고객 관리 연결됨' : '고객 관리에 저장'}</span>
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
                <div className="font-extrabold text-slate-900 text-right">
                  {pickupDate} {pickupTime}
                </div>
              </div>

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
              </div>

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
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1E60F3] border border-blue-200 text-[11px] font-bold">
                    {requestedVehicleClass}
                  </span>
                </div>
              </div>

              {/* 특이사항 */}
              <div className="py-2.5 flex items-start justify-between">
                <div className="flex items-center gap-2 text-slate-500 font-semibold w-28 shrink-0">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  <span>특이사항</span>
                </div>
                <div className="font-bold text-slate-800 text-right leading-snug">
                  {specialRequests || '특이사항 없음'}
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
