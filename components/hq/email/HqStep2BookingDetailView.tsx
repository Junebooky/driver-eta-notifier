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
import { haptics } from '@/utils/haptics';
import { HqPlaceSearchInput, PoiResult } from '@/components/hq/HqPlaceSearchInput';
import { saveContactToCrm } from '@/utils/crmCustomerSync';
import { getVehicleImageForModel, STANDARD_FLEET_MODELS } from '@/utils/vehicleSlotParser';

export interface VehicleSlotAssignment {
  slotIndex: number;
  vehicleModel: string;
  driver: AvailableDriverItem | null;
  status: 'unassigned' | 'assigned';
}

export interface HqStep2BookingDetailViewProps {
  emailSummary: HqEmailSummary;
  emailDetail?: HqEmailDetail | null;
  extractedDraft?: HqEmailExtractedDraft | null;
  vehicleSlots: VehicleSlotAssignment[];
  onOpenDriverModal: (slotIndex: number, requiredLanguage?: 'any' | 'english') => void;
  onConfirmDispatch: () => void;
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
  onBackToStep1,
  onUpdateDraft,
  onUpdateVehicleSlots,
  isDispatching = false,
  dispatchError = null,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'assign' | 'schedule' | 'history'>('assign');
  const [selectedLanguage, setSelectedLanguage] = useState<'any' | 'english'>(() => {
    const sr = extractedDraft?.specialRequests || '';
    if (/영어|english|외국인/i.test(sr)) return 'english';
    return 'any';
  });
  const [isSavingCrm, setIsSavingCrm] = useState(false);
  const [crmSavedNotice, setCrmSavedNotice] = useState<string | null>(null);

  // Auto-sync language if draft specialRequests updates
  React.useEffect(() => {
    const sr = extractedDraft?.specialRequests || '';
    if (/영어|english|외국인/i.test(sr)) {
      setSelectedLanguage('english');
    }
  }, [extractedDraft?.specialRequests]);

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
  const hasAssignedDriver = vehicleSlots.some((slot) => slot.driver !== null);

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

  const handleConfirm = () => {
    if (!hasAssignedDriver) {
      haptics.errorAlert();
      return;
    }
    haptics.success();
    onConfirmDispatch();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-5">
      {/* 1. Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToStep1}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-all active:scale-95"
            title="이메일 메일함으로 돌아가기"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center">
              <Car className="w-4 h-4" />
            </div>
            <h2 className="text-base font-black text-slate-900">예약 상세</h2>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200">
              신규
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
              hasAssignedDriver
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {hasAssignedDriver ? '기사 배정 진행중' : '배차 필요'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>복사</span>
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>수정</span>
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            <span>삭제</span>
          </button>
        </div>
      </div>

      {/* 2. Navigation Sub-Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveSubTab('assign')}
          className={`pb-2.5 transition-all relative cursor-pointer ${
            activeSubTab === 'assign'
              ? 'text-[#1E60F3] font-black'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          차량·기사 배정
          {activeSubTab === 'assign' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('schedule')}
          className={`pb-2.5 transition-all relative cursor-pointer ${
            activeSubTab === 'schedule'
              ? 'text-[#1E60F3] font-black'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          운행 일정
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`pb-2.5 transition-all relative cursor-pointer ${
            activeSubTab === 'history'
              ? 'text-[#1E60F3] font-black'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          히스토리
        </button>
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
          </div>
        </div>
      )}

      {/* 3. Main 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* Left Sub-Column: 기본 정보 + 추가 정보                    */}
        {/* ========================================================= */}
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
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1E60F3] font-extrabold text-[10px] border border-blue-200/50">
                      {extractedDraft.waypoints.length}개 구간
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {extractedDraft.waypoints.map((wp, idx) => (
                      <div key={wp.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-xs">
                        <span className="w-5 h-5 rounded-full bg-[#1E60F3] text-white font-extrabold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                          {idx + 1}
                        </span>
                        {wp.time && (
                          <span className="text-slate-500 font-bold shrink-0 text-[11px] px-1.5 py-0.5 bg-white rounded border border-slate-200">
                            {wp.time}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 truncate flex-1">
                          {wp.location}
                        </span>
                      </div>
                    ))}
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
                  onClick={() => setSelectedLanguage('any')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedLanguage === 'any'
                      ? 'border-[#1E60F3] bg-blue-50/80 text-[#1E60F3] shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>🇰🇷</span>
                  <span>무관</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLanguage('english')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedLanguage === 'english'
                      ? 'border-[#1E60F3] bg-blue-50/80 text-[#1E60F3] shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>🇺🇸</span>
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
        {/* Right Sub-Column: 요청 차량 리스트                        */}
        {/* ========================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">
              요청 차량 ({vehicleSlots.length}대)
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold shadow-2xs hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Layers className="w-3 h-3" />
                <span>차등 배정</span>
              </button>
              <button
                type="button"
                onClick={handleAddVehicleSlot}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 active:scale-95 shadow-2xs"
                title="요청 차량 슬롯 추가"
              >
                <Plus className="w-3 h-3 text-[#1E60F3]" />
                <span>차량 추가</span>
              </button>
            </div>
          </div>

          {/* Vehicle Slots List */}
          <div className="space-y-3.5">
            {vehicleSlots.map((slot, idx) => {
              const isAssigned = Boolean(slot.driver);
              const isEnglishCapable = driverSupportsEnglish(slot.driver);
              const isLanguageMismatch = selectedLanguage === 'english' && isAssigned && !isEnglishCapable;
              const vehicleImg = getVehicleImageForModel(slot.vehicleModel);

              return (
                <div
                  key={slot.slotIndex}
                  className={`rounded-2xl border p-4 transition-all ${
                    isAssigned
                      ? isLanguageMismatch
                        ? 'border-amber-300 bg-amber-50/20 shadow-xs'
                        : 'border-blue-300 bg-blue-50/20 shadow-xs'
                      : 'border-slate-200/90 bg-white shadow-2xs'
                  }`}
                >
                  {/* Top Bar inside Slot */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      {/* Vehicle Model Selector */}
                      <div className="relative inline-flex items-center">
                        <select
                          value={slot.vehicleModel}
                          onChange={(e) => handleUpdateSlotModel(idx, e.target.value)}
                          className="text-xs font-black text-slate-900 bg-slate-50 hover:bg-white border border-slate-200 rounded-lg px-2 py-1 pr-6 hover:border-slate-300 focus:outline-hidden focus:border-[#1E60F3] cursor-pointer appearance-none shadow-2xs transition-colors"
                        >
                          {STANDARD_FLEET_MODELS.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                          {!STANDARD_FLEET_MODELS.includes(slot.vehicleModel as any) && (
                            <option value={slot.vehicleModel}>{slot.vehicleModel}</option>
                          )}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isAssigned
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {isAssigned ? '기사 지정됨' : '기사 미배정'}
                      </span>

                      {/* Remove slot button if multiple slots exist */}
                      {vehicleSlots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVehicleSlot(idx)}
                          className="w-6 h-6 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600 transition-colors flex items-center justify-center cursor-pointer active:scale-95"
                          title="차량 슬롯 삭제"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Body: Vehicle Image + Driver Selector */}
                  <div className="mt-3.5 flex items-center justify-between gap-4">
                    {/* Left: Vehicle Image */}
                    <div className="w-28 sm:w-36 h-20 bg-slate-50 rounded-xl flex items-center justify-center p-2 shrink-0 border border-slate-100">
                      <img
                        src={vehicleImg}
                        alt={slot.vehicleModel}
                        className="max-h-full max-w-full object-contain drop-shadow-sm"
                      />
                    </div>

                    {/* Right: Driver Slot Button or Profile */}
                    <div className="flex-1 min-w-0">
                      {isAssigned && slot.driver ? (
                        <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={slot.driver.avatarUrl}
                              alt={slot.driver.name}
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-extrabold text-slate-900 truncate">
                                  {slot.driver.name} 기사
                                </span>
                                <div className="flex items-center text-amber-500 text-[11px] font-bold">
                                  <Star className="w-3 h-3 fill-amber-400" />
                                  <span>{slot.driver.rating}</span>
                                </div>
                                {isEnglishCapable && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200">
                                    🇺🇸 영어 가능
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {slot.driver.plate || '차량 미지정'} · {slot.driver.residence}
                              </div>
                              {isLanguageMismatch && (
                                <div className="text-[10px] text-amber-700 font-bold mt-0.5">
                                  ⚠️ 영어 불가 기사 (재배정 권장)
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenDriverModal(slot.slotIndex, selectedLanguage)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer shrink-0 active:scale-95 shadow-2xs"
                          >
                            변경
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenDriverModal(slot.slotIndex, selectedLanguage)}
                            className="w-full py-2.5 px-3 rounded-xl border border-blue-300 hover:border-blue-500 bg-blue-50/30 hover:bg-blue-50/60 text-[#1E60F3] text-xs font-extrabold transition-all flex items-center justify-between cursor-pointer active:scale-98 shadow-2xs"
                          >
                            <span>
                              {selectedLanguage === 'english' ? '🇺🇸 영어 가능 기사 선택' : '가용 기사 선택'}
                            </span>
                            <ChevronDown className="w-4 h-4 text-blue-500" />
                          </button>
                          <p className="text-[10px] text-slate-500">
                            * 배차 확정을 위해 {selectedLanguage === 'english' ? '영어 가능 ' : ''}가용 기사를 반드시 직접 지정해야 합니다.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footnote */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>배정 시 기사에게 실시간 모바일 Cockpit 알림이 전송됩니다.</span>
          </div>

          {/* Driver Unassigned Warning */}
          {!hasAssignedDriver && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>배차를 확정하려면 1호차 가용 기사를 먼저 직접 선택해 주세요.</span>
            </div>
          )}

          {/* Big Confirm Dispatch Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!hasAssignedDriver || isDispatching}
              className="w-full py-3.5 px-4 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-98 text-white text-sm font-black shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDispatching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>배차 확정 및 기사 알림 전송 중...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>배차 확정 (서버 등록)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
