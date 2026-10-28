'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Mail,
  Search,
  RefreshCw,
  Plus,
  Send,
  ChevronDown,
  Sparkles,
  Inbox,
  Filter,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import { haptics } from '@/utils/haptics';
import {
  REFERENCE_EMAILS,
  ReferenceEmailItem,
} from './emailReferenceData';
import { HqStep1ExtractView } from './HqStep1ExtractView';
import {
  HqStep2BookingDetailView,
  VehicleSlotAssignment,
} from './HqStep2BookingDetailView';
import { HqStep4DispatchDoneView } from './HqStep4DispatchDoneView';
import {
  HqDriverSelectModal,
  SAMPLE_AVAILABLE_DRIVERS,
  AvailableDriverItem,
} from './HqDriverSelectModal';
import { HqComposeEmailModal } from './HqComposeEmailModal';
import { mapScheduleItemToHqBooking, getKstTodayDateStr } from '@/utils/dispatchConflictDetector';
import { saveEmailDraft } from '@/utils/emailHqStorage';

export interface HqEmailInboxViewProps {
  onCreateBooking?: (booking: HqBooking) => void;
  onSavedServer?: () => Promise<void> | void;
}

export type EmailWorkflowStep = 'step1_extract' | 'step2_booking_detail' | 'step4_dispatch_done';

export const HqEmailInboxView: React.FC<HqEmailInboxViewProps> = ({
  onCreateBooking,
  onSavedServer,
}) => {
  const searchParams = useSearchParams();
  const urlStep = searchParams?.get('step') as EmailWorkflowStep | null;
  const urlDriverModal = searchParams?.get('driverModal') === 'true';

  // 1. Current selected email id
  const [selectedEmailId, setSelectedEmailId] = useState<string>(
    REFERENCE_EMAILS[0]?.summary.id || 'em-ref-ge-001'
  );

  // 2. Filter tabs ('all' | 'unprocessed' | 'reviewing' | 'completed')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unprocessed' | 'reviewing' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 3. Workflow step state for the right container ('step1_extract' | 'step2_booking_detail' | 'step4_dispatch_done')
  const [workflowStep, setWorkflowStep] = useState<EmailWorkflowStep>(() => {
    if (urlStep === 'step2_booking_detail' || urlStep === 'step4_dispatch_done') {
      return urlStep;
    }
    return 'step1_extract';
  });

  // 4. Vehicle Slot assignments (for Step 2 and Step 4)
  const [vehicleSlots, setVehicleSlots] = useState<VehicleSlotAssignment[]>(() => {
    if (urlStep === 'step4_dispatch_done') {
      return [
        {
          slotIndex: 0,
          vehicleModel: '스프린터 319 CDI',
          driver: SAMPLE_AVAILABLE_DRIVERS[0], // 김태훈
          status: 'assigned',
        },
        {
          slotIndex: 1,
          vehicleModel: 'G90 LWB',
          driver: SAMPLE_AVAILABLE_DRIVERS[1], // 이준호
          status: 'assigned',
        },
      ];
    }
    return [
      {
        slotIndex: 0,
        vehicleModel: '스프린터 319 CDI',
        driver: null,
        status: 'unassigned',
      },
      {
        slotIndex: 1,
        vehicleModel: 'G90 LWB',
        driver: null,
        status: 'unassigned',
      },
    ];
  });

  // 5. Driver Selection Modal (Step 3)
  const [isDriverModalOpen, setIsDriverModalOpen] = useState<boolean>(urlDriverModal);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);

  // 6. Compose / Customer Message Modal
  const [isComposeOpen, setIsComposeOpen] = useState<boolean>(false);
  const [composeTo, setComposeTo] = useState<string>('');
  const [composeSubject, setComposeSubject] = useState<string>('');
  const [composeBody, setComposeBody] = useState<string>('');

  // 7. Toast feedback message
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 8. Derived selected email item
  const selectedEmailItem = useMemo(() => {
    return (
      REFERENCE_EMAILS.find((e) => e.summary.id === selectedEmailId) ||
      REFERENCE_EMAILS[0]
    );
  }, [selectedEmailId]);

  // 9. KPI Counts for Left Column Header
  const counts = useMemo(() => {
    const unprocessed = REFERENCE_EMAILS.filter((e) => e.statusCategory === 'unprocessed').length;
    const reviewing = REFERENCE_EMAILS.filter((e) => e.statusCategory === 'reviewing').length;
    const completed = REFERENCE_EMAILS.filter((e) => e.statusCategory === 'completed').length;
    return {
      total: REFERENCE_EMAILS.length,
      unprocessed,
      reviewing,
      completed,
    };
  }, []);

  // 10. Filtered email list
  const filteredEmails = useMemo(() => {
    return REFERENCE_EMAILS.filter((item) => {
      if (statusFilter !== 'all' && item.statusCategory !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.summary.subject.toLowerCase().includes(q) ||
          item.summary.from.name.toLowerCase().includes(q) ||
          item.summary.from.address.toLowerCase().includes(q) ||
          item.summary.preview.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [statusFilter, searchQuery]);

  // Handle email click from left pinned list
  const handleSelectEmail = (emailId: string) => {
    haptics.lightTap();
    setSelectedEmailId(emailId);
    // When switching email, default to Step 1 view for that email
    setWorkflowStep('step1_extract');
  };

  // Open Step 3 Driver Modal for a specific vehicle slot
  const handleOpenDriverModal = (slotIndex: number) => {
    haptics.lightTap();
    setActiveSlotIndex(slotIndex);
    setIsDriverModalOpen(true);
  };

  // Handle selecting driver from Step 3 modal
  const handleSelectDriverFromModal = (driver: AvailableDriverItem) => {
    setVehicleSlots((prev) => {
      const next = [...prev];
      if (next[activeSlotIndex]) {
        next[activeSlotIndex] = {
          ...next[activeSlotIndex],
          driver,
          status: 'assigned',
        };
      }
      return next;
    });
    setIsDriverModalOpen(false);
    showToast(`${driver.name} 기사님이 ${vehicleSlots[activeSlotIndex]?.vehicleModel || '차량'}에 배정되었습니다.`);
  };

  // Advance from Step 2 to Step 4 (Confirm Dispatch)
  const handleConfirmDispatch = async () => {
    // If slots are not yet assigned, auto-assign default recommended drivers (Kim Tae-hoon & Lee Jun-ho) matching Panel 4
    let currentSlots = [...vehicleSlots];
    if (!currentSlots[0]?.driver) {
      currentSlots[0] = {
        ...currentSlots[0],
        driver: SAMPLE_AVAILABLE_DRIVERS[0], // 김태훈
        status: 'assigned',
      };
    }
    if (!currentSlots[1]?.driver) {
      currentSlots[1] = {
        ...currentSlots[1],
        driver: SAMPLE_AVAILABLE_DRIVERS[1], // 이준호
        status: 'assigned',
      };
    }
    setVehicleSlots(currentSlots);

    // Save dispatch to server/local storage
    try {
      const draft = selectedEmailItem.extractedDraft;
      const today = getKstTodayDateStr();

      const bookingPayload = {
        customerName: selectedEmailItem.detail.from.name || 'Global Events',
        intakeSource: 'email',
        date: draft.pickupDate || today,
        pickupTime: draft.pickupTime || '09:00',
        origin: draft.pickupLocation || '인천공항 T2',
        destination: draft.dropoffLocation || '신라호텔',
        passengerName: draft.passengerName || 'Sarah Kim',
        passengerPhone: draft.passengerPhone || '+82 10-1234-5678',
        passengerCount: draft.passengerCount || 3,
        flightNumber: draft.flightNumber || 'KE082',
        notes: draft.specialRequests || 'VIP 게스트 3인, 미팅보드 요청',
        driverId: currentSlots[0].driver?.id,
        driverName: currentSlots[0].driver?.name,
        driverPhone: currentSlots[0].driver?.phone,
        vehicleNo: currentSlots[0].driver?.plate,
        vehiclePlate: currentSlots[0].driver?.plate,
        vehicleModel: currentSlots[0].vehicleModel,
        dispatchStatus: 'published',
        allowUnverified: true,
        publishedBy: '본사 관리자 (배차 확정)',
      };

      const res = await fetch('/api/schedules/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload),
      });

      const data = await res.json().catch(() => ({}));
      if (data.ok && data.schedule) {
        const savedBooking = mapScheduleItemToHqBooking(data.schedule, 0);
        saveEmailDraft({
          ...draft,
          status: 'published',
          assignedDriver: currentSlots[0].driver?.name || null,
        });
        onCreateBooking?.(savedBooking);
        await onSavedServer?.();
      }
    } catch (err) {
      console.warn('Dispatch server sync warning (mock mode fallback active):', err);
    }

    setWorkflowStep('step4_dispatch_done');
    showToast('배차가 확정되어 기사님 Cockpit에 실시간 알림이 전송되었습니다.');
  };

  // Reset from Step 4 back to Step 1
  const handleResetToNewBooking = () => {
    haptics.lightTap();
    setWorkflowStep('step1_extract');
  };

  // Open Customer Message Modal
  const handleOpenCustomerMessage = () => {
    haptics.lightTap();
    const draft = selectedEmailItem.extractedDraft;
    setComposeTo(selectedEmailItem.detail.from.address || '');
    setComposeSubject(`[VIP LIMOUSINE] ${selectedEmailItem.detail.from.name} 의전 차량 배차 확정 안내`);
    setComposeBody(`안녕하세요, ${selectedEmailItem.detail.from.name} 담당자님.
VIP LIMOUSINE KOREA 관제팀입니다.

요청해주신 VIP 의전 차량 배차가 성공적으로 완료되었습니다.
• 일시: 2026. 10. 28. (수) 09:00
• 구간: 인천공항 T2 ➔ 신라호텔
• 편명: KE082 (도착)
• 1호차: 스프린터 319 CDI / 김태훈 기사 (010-3333-4444)
• 2호차: G90 LWB / 이준호 기사 (010-2222-3333)

감사합니다.
VIP LIMOUSINE KOREA`);
    setIsComposeOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#0B1E48] text-white px-4 py-3 rounded-2xl shadow-xl border border-blue-500/30 flex items-center gap-2.5 text-xs font-bold animate-slide-up">
          <span className="w-2 h-2 rounded-full bg-[#1E60F3] animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main 2-Section Layout:
          Left: Always Pinned Email List
          Right: Dynamic Multi-Step Workflow Container
      */}
      <div className="flex flex-col md:flex-row items-start gap-5">
        {/* ========================================================= */}
        {/* Pinned Left Column: 이메일 목록 (Always Fixed / Left-Pinned) */}
        {/* ========================================================= */}
        <div className="w-full md:w-80 lg:w-[320px] xl:w-[340px] shrink-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col min-h-[700px] md:sticky md:top-20">
          {/* Header Row: 이메일 (12) + Quick compose button */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#1E60F3]" />
              <h2 className="text-sm font-extrabold text-slate-900">
                이메일 ({counts.total})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setComposeTo('');
                setComposeSubject('');
                setComposeBody('');
                setIsComposeOpen(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E60F3] text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
              title="새 이메일 작성"
            >
              <Plus className="w-3 h-3" />
              <span>메일 작성</span>
            </button>
          </div>

          {/* Status Filter Badges: 미처리 5 / 검토중 3 / 예약완료 4 */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unprocessed')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                statusFilter === 'unprocessed'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-blue-50/70 border border-blue-200/60 text-[#1E60F3] hover:bg-blue-100'
              }`}
            >
              <span>미처리</span>
              <span className="font-black">{counts.unprocessed}</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('reviewing')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                statusFilter === 'reviewing'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>검토중</span>
              <span className="font-black">{counts.reviewing}</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('completed')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                statusFilter === 'completed'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <span>예약완료</span>
              <span className="font-black">{counts.completed}</span>
            </button>
          </div>

          {/* Search Input & Selectors */}
          <div className="p-3 border-b border-slate-100 bg-white space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이메일 검색..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600">
              <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
                <span>전체</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </div>
              <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
                <span>전체</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Scrollable Email Cards List */}
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[580px] flex-1">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-1">
                <Inbox className="w-7 h-7 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-500">검색 결과가 없습니다</p>
              </div>
            ) : (
              filteredEmails.map((item) => {
                const isSelected = item.summary.id === selectedEmailId;

                return (
                  <div
                    key={item.summary.id}
                    onClick={() => handleSelectEmail(item.summary.id)}
                    className={`p-3.5 transition-all cursor-pointer relative group ${
                      isSelected
                        ? 'bg-blue-50/90 border-l-4 border-l-[#1E60F3] shadow-2xs'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar Initials Badge */}
                      <div
                        className={`w-9 h-9 rounded-full ${item.avatarBg} ${item.avatarTextColor} font-black text-xs flex items-center justify-center shrink-0 shadow-2xs`}
                      >
                        {item.avatarInitials}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-xs truncate ${
                              isSelected
                                ? 'font-black text-[#0B1E48]'
                                : 'font-extrabold text-slate-800'
                            }`}
                          >
                            {item.summary.from.name}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                            {item.summary.receivedAt}
                          </span>
                        </div>

                        <h4
                          className={`text-xs mt-0.5 line-clamp-1 leading-snug ${
                            isSelected
                              ? 'font-extrabold text-blue-950'
                              : 'font-semibold text-slate-700'
                          }`}
                        >
                          {item.summary.subject}
                        </h4>

                        {item.summary.preview && (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 leading-relaxed">
                            {item.summary.preview}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* Dynamic Right Column: Sequential Multi-Step Workflow Card   */}
        {/* Step 1: 자동 추출 + 검토                                    */}
        {/* Step 2: 예약 상세 보기 (배차 전)                            */}
        {/* Step 4: 배차 완료 (기사 알림 및 스마트폰 목업 상태)          */}
        {/* ========================================================= */}
        <div className="flex-1 min-w-0 w-full">
          {workflowStep === 'step1_extract' && (
            <HqStep1ExtractView
              emailItem={selectedEmailItem}
              onProceedToBooking={() => setWorkflowStep('step2_booking_detail')}
              onSaveModifiedDraft={() => {
                showToast('수정된 예약 초안이 저장되었습니다.');
              }}
            />
          )}

          {workflowStep === 'step2_booking_detail' && (
            <HqStep2BookingDetailView
              emailItem={selectedEmailItem}
              vehicleSlots={vehicleSlots}
              onOpenDriverModal={handleOpenDriverModal}
              onConfirmDispatch={handleConfirmDispatch}
              onBackToStep1={() => setWorkflowStep('step1_extract')}
            />
          )}

          {workflowStep === 'step4_dispatch_done' && (
            <HqStep4DispatchDoneView
              emailItem={selectedEmailItem}
              vehicleSlots={vehicleSlots}
              onOpenDriverModal={handleOpenDriverModal}
              onResetToNewBooking={handleResetToNewBooking}
              onOpenCustomerMessage={handleOpenCustomerMessage}
            />
          )}
        </div>
      </div>

      {/* Step 3: 가용 기사 선택 모달 (Overlay) */}
      <HqDriverSelectModal
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
        onSelectDriver={handleSelectDriverFromModal}
        targetVehicleName={vehicleSlots[activeSlotIndex]?.vehicleModel || '스프린터 319 CDI'}
        targetDate="2026. 10. 28. (수)"
        targetTime="09:00"
        initialDriverId={activeSlotIndex === 0 ? 'drv-kim' : 'drv-lee'}
      />

      {/* Compose / Customer Notification Email Modal */}
      <HqComposeEmailModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        initialTo={composeTo}
        initialSubject={composeSubject}
        initialBody={composeBody}
        onSentSuccess={({ to }) => {
          showToast(`${to} 주소로 메일이 발송되었습니다.`);
          setIsComposeOpen(false);
        }}
      />
    </div>
  );
};
