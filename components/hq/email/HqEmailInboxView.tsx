'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  AlertCircle,
  CheckCircle2,
  Lock,
  Layers,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import {
  HqEmailSummary,
  HqEmailDetail,
  HqEmailExtractedDraft,
} from '@/types/emailHq';
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
  AvailableDriverItem,
} from './HqDriverSelectModal';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { HqComposeEmailModal } from './HqComposeEmailModal';
import { HqEmailWorkflowStepper, WorkflowStepId } from './HqEmailWorkflowStepper';
import { parseVehicleSlotsFromRequestedClass } from '@/utils/vehicleSlotParser';
import { mapScheduleItemToHqBooking, getKstTodayDateStr } from '@/utils/dispatchConflictDetector';
import { saveEmailDraft, getEmailDraft, deleteEmailDraft } from '@/utils/emailHqStorage';

export interface HqEmailInboxViewProps {
  onCreateBooking?: (booking: HqBooking) => void;
  onSavedServer?: () => Promise<void> | void;
}

export type EmailWorkflowStep = 'step1_extract' | 'step2_booking_detail' | 'step4_dispatch_done';

interface ImapConnectionState {
  isConfigured: boolean;
  syncStatus: 'connected' | 'disconnected' | 'syncing' | 'error';
  totalCount: number;
  unreadCount?: number;
  accountEmail?: string;
  lastSync?: string;
  error?: string;
}

export const HqEmailInboxView: React.FC<HqEmailInboxViewProps> = ({
  onCreateBooking,
  onSavedServer,
}) => {
  const searchParams = useSearchParams();
  const urlStep = searchParams?.get('step') as EmailWorkflowStep | null;
  const urlDriverModal = searchParams?.get('driverModal') === 'true';
  const urlEmailId = searchParams?.get('emailId');
  const urlDriverLang =
    searchParams?.get('lang') === 'english' || searchParams?.get('driverLang') === 'english'
      ? 'english'
      : 'any';
  const urlDemo = searchParams?.get('demo') === 'true';

  // 1. Live Inbox State
  const [emails, setEmails] = useState<HqEmailSummary[]>(() => {
    if (urlDemo) {
      return REFERENCE_EMAILS.map((e) => e.summary);
    }
    return [];
  });
  const [isLoadingInbox, setIsLoadingInbox] = useState<boolean>(!urlDemo);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [imapState, setImapState] = useState<ImapConnectionState>(() => {
    if (urlDemo) {
      return {
        isConfigured: true,
        syncStatus: 'connected',
        totalCount: REFERENCE_EMAILS.length,
        accountEmail: 'demo@viplimousine.kr (데모 모드)',
        lastSync: '데모 샘플',
      };
    }
    return {
      isConfigured: false,
      syncStatus: 'syncing',
      totalCount: 0,
    };
  });

  // 2. Demo Mode Toggle (Only explicitly active in local development)
  const [isDemoMode, setIsDemoMode] = useState<boolean>(urlDemo);

  // 3. Current Selected Email
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(() => {
    if (urlEmailId) return urlEmailId;
    if (urlDemo) {
      return REFERENCE_EMAILS[0]?.summary.id || null;
    }
    return null;
  });

  // 4. Email Detail Cache (Read-Only)
  const [emailDetails, setEmailDetails] = useState<Record<string, HqEmailDetail>>(() => {
    if (urlDemo) {
      const initialDetails: Record<string, HqEmailDetail> = {};
      for (const item of REFERENCE_EMAILS) {
        initialDetails[item.summary.id] = {
          ...item.summary,
          bodyText: item.detail.bodyText,
          to: item.detail.to,
          headers: item.detail.headers,
          extractedDraft: item.extractedDraft,
        };
      }
      return initialDetails;
    }
    return {};
  });
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // 5. AI Extracted Drafts per Email
  const [draftsByEmailId, setDraftsByEmailId] = useState<Record<string, HqEmailExtractedDraft>>(() => {
    if (urlDemo) {
      const initialDrafts: Record<string, HqEmailExtractedDraft> = {};
      for (const item of REFERENCE_EMAILS) {
        if (item.extractedDraft) {
          initialDrafts[item.summary.id] = item.extractedDraft;
        }
      }
      return initialDrafts;
    }
    return {};
  });
  const [isExtractingAi, setIsExtractingAi] = useState<boolean>(false);

  // 6. Filter tabs ('all' | 'unprocessed' | 'reviewing' | 'completed')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unprocessed' | 'reviewing' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 7. Real Supabase drivers
  const { drivers: hqDrivers } = useHqDrivers();

  // 8. Workflow Step state ('step1_extract' | 'step2_booking_detail' | 'step4_dispatch_done')
  const [workflowStep, setWorkflowStep] = useState<EmailWorkflowStep>(() => {
    if (urlStep === 'step2_booking_detail' || urlStep === 'step4_dispatch_done') {
      return urlStep;
    }
    return 'step1_extract';
  });

  // 9. Vehicle Slot assignments (for Step 2 and Step 4) - Dynamically linked to AI draft!
  const [vehicleSlots, setVehicleSlots] = useState<VehicleSlotAssignment[]>(() => {
    // Check initial draft if demo or existing
    if (urlDemo && REFERENCE_EMAILS[0]?.extractedDraft?.requestedVehicleClass) {
      return parseVehicleSlotsFromRequestedClass(REFERENCE_EMAILS[0].extractedDraft.requestedVehicleClass);
    }
    // Strictly NO dummy fallback ([319 CDI, G90 LWB])!
    // Initialize empty/unassigned default slot
    return [
      {
        slotIndex: 0,
        vehicleModel: '차량 미지정',
        driver: null,
        status: 'unassigned',
      },
    ];
  });

  // 9. Driver Selection Modal (Step 3) & Language Condition Filtering
  const [isDriverModalOpen, setIsDriverModalOpen] = useState<boolean>(urlDriverModal);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(0);
  const [requiredDriverLanguage, setRequiredDriverLanguage] = useState<'any' | 'english'>(urlDriverLang);

  // 10. Compose Modal
  const [isComposeOpen, setIsComposeOpen] = useState<boolean>(false);
  const [composeTo, setComposeTo] = useState<string>('');
  const [composeSubject, setComposeSubject] = useState<string>('');
  const [composeBody, setComposeBody] = useState<string>('');

  // 11. Dispatch State
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchedSchedule, setDispatchedSchedule] = useState<any | null>(null);

  // 12. Toast Feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // =========================================================
  // Live Fetch Inbox via GET /api/email/inbox
  // =========================================================
  const fetchLiveInbox = useCallback(async () => {
    if (isDemoMode) return;
    setIsLoadingInbox(true);
    setInboxError(null);

    try {
      const res = await fetch('/api/email/inbox', {
        method: 'GET',
        headers: { credentials: 'include' },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setImapState({
          isConfigured: data.isConfigured ?? false,
          syncStatus: data.syncStatus || 'disconnected',
          totalCount: 0,
          accountEmail: data.accountEmail || '',
          lastSync: data.lastSync || '',
          error: data.error || 'NAVER 메일함 동기화 실패',
        });
        setInboxError(data.error || '이메일 수신함 조회에 실패했습니다.');
        setEmails([]);
        setSelectedEmailId(null);
      } else {
        const liveEmails: HqEmailSummary[] = data.emails || [];
        setImapState({
          isConfigured: true,
          syncStatus: 'connected',
          totalCount: data.totalCount ?? liveEmails.length,
          accountEmail: data.accountEmail || 'NAVER 공식 계정',
          lastSync: data.lastSync || new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        });
        setEmails(liveEmails);
        if (liveEmails.length > 0) {
          setSelectedEmailId((prev) => prev || liveEmails[0].id);
        } else {
          setSelectedEmailId(null);
        }
      }
    } catch (err: any) {
      setInboxError(err.message || '네트워크 연결 오류가 발생했습니다.');
      setImapState({
        isConfigured: false,
        syncStatus: 'error',
        totalCount: 0,
        error: err.message,
      });
      setEmails([]);
      setSelectedEmailId(null);
    } finally {
      setIsLoadingInbox(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    if (!isDemoMode) {
      fetchLiveInbox();
    }
  }, [fetchLiveInbox, isDemoMode]);

  // =========================================================
  // Fetch Email Detail via GET /api/email/[id]
  // =========================================================
  useEffect(() => {
    if (!selectedEmailId) return;

    // In Demo Mode: load from local reference data
    if (isDemoMode) {
      const demoItem = REFERENCE_EMAILS.find((e) => e.summary.id === selectedEmailId);
      if (demoItem) {
        setEmailDetails((prev) => ({
          ...prev,
          [selectedEmailId]: {
            ...demoItem.summary,
            bodyText: demoItem.detail.bodyText,
            to: demoItem.detail.to,
            headers: demoItem.detail.headers,
            extractedDraft: demoItem.extractedDraft,
          },
        }));
        if (demoItem.extractedDraft && !draftsByEmailId[selectedEmailId]) {
          setDraftsByEmailId((prev) => ({
            ...prev,
            [selectedEmailId]: demoItem.extractedDraft,
          }));
        }
      }
      return;
    }

    // In Live Mode: check cache first
    if (emailDetails[selectedEmailId]) return;

    let active = true;
    setIsLoadingDetail(true);

    fetch(`/api/email/${encodeURIComponent(selectedEmailId)}`, {
      method: 'GET',
      headers: { credentials: 'include' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.ok && data.email) {
          setEmailDetails((prev) => ({
            ...prev,
            [selectedEmailId]: data.email,
          }));
          // Check if previously saved draft exists in localStorage
          const cachedDraft = getEmailDraft(selectedEmailId);
          if (cachedDraft && !draftsByEmailId[selectedEmailId]) {
            setDraftsByEmailId((prev) => ({
              ...prev,
              [selectedEmailId]: cachedDraft,
            }));
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch live email detail:', err);
      })
      .finally(() => {
        if (active) setIsLoadingDetail(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEmailId, isDemoMode, emailDetails, draftsByEmailId]);

  // Toggle Demo Mode (for local development preview only)
  const handleToggleDemoMode = () => {
    if (!isDemoMode) {
      setIsDemoMode(true);
      const demoSummaries = REFERENCE_EMAILS.map((e) => e.summary);
      setEmails(demoSummaries);
      setSelectedEmailId(demoSummaries[0]?.id || null);
      setImapState({
        isConfigured: true,
        syncStatus: 'connected',
        totalCount: demoSummaries.length,
        accountEmail: 'demo@viplimousine.kr (데모 모드)',
        lastSync: '데모 샘플',
      });
      showToast('데모 샘플 메일함으로 전환되었습니다.');
    } else {
      setIsDemoMode(false);
      setEmails([]);
      setSelectedEmailId(null);
      fetchLiveInbox();
      showToast('실제 NAVER 메일함 동기화 모드로 전환되었습니다.');
    }
  };

  // Active email summary & detail
  const currentSummary: HqEmailSummary | null = useMemo(() => {
    if (!selectedEmailId) return null;
    return emails.find((e) => e.id === selectedEmailId) || null;
  }, [emails, selectedEmailId]);

  const currentDetail: HqEmailDetail | null = useMemo(() => {
    if (!selectedEmailId) return null;
    return emailDetails[selectedEmailId] || null;
  }, [emailDetails, selectedEmailId]);

  const currentDraft: HqEmailExtractedDraft | null = useMemo(() => {
    if (!selectedEmailId) return null;
    return draftsByEmailId[selectedEmailId] || currentDetail?.extractedDraft || null;
  }, [draftsByEmailId, currentDetail, selectedEmailId]);

  // Sync vehicle slots whenever email changes or workflow moves to step2 if slots are uninitialized
  useEffect(() => {
    if (workflowStep === 'step2_booking_detail' && vehicleSlots.length === 1 && vehicleSlots[0].vehicleModel === '차량 미지정' && currentDraft?.requestedVehicleClass) {
      setVehicleSlots(parseVehicleSlotsFromRequestedClass(currentDraft.requestedVehicleClass));
    }
  }, [workflowStep, currentDraft?.requestedVehicleClass]);

  // Derived KPI counts
  const counts = useMemo(() => {
    const total = emails.length;
    let unprocessed = 0;
    let reviewing = 0;
    let completed = 0;

    for (const e of emails) {
      const draft = draftsByEmailId[e.id];
      if (draft?.status === 'published' || e.draftId) {
        completed += 1;
      } else if (draft || e.aiStatus === 'draft_generated' || e.aiStatus === 'needs_review') {
        reviewing += 1;
      } else {
        unprocessed += 1;
      }
    }

    return { total, unprocessed, reviewing, completed };
  }, [emails, draftsByEmailId]);

  // Filtered emails
  const filteredEmails = useMemo(() => {
    return emails.filter((item) => {
      const draft = draftsByEmailId[item.id];
      const category =
        draft?.status === 'published' || item.draftId
          ? 'completed'
          : draft || item.aiStatus === 'draft_generated'
          ? 'reviewing'
          : 'unprocessed';

      if (statusFilter !== 'all' && category !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.subject.toLowerCase().includes(q) ||
          item.from.name.toLowerCase().includes(q) ||
          item.from.address.toLowerCase().includes(q) ||
          item.preview.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [emails, statusFilter, searchQuery, draftsByEmailId]);

  // Handle email click from left pinned list
  const handleSelectEmail = (emailId: string) => {
    haptics.lightTap();
    setSelectedEmailId(emailId);
    setWorkflowStep('step1_extract');
    setDispatchError(null);

    // Sync vehicle slots dynamically from draft of selected email (no dummy default!)
    const targetDraft = draftsByEmailId[emailId];
    if (targetDraft?.requestedVehicleClass) {
      setVehicleSlots(parseVehicleSlotsFromRequestedClass(targetDraft.requestedVehicleClass));
    } else {
      setVehicleSlots([
        {
          slotIndex: 0,
          vehicleModel: '차량 미지정',
          driver: null,
          status: 'unassigned',
        },
      ]);
    }
  };

  // Open Step 3 Driver Modal for a specific vehicle slot with optional language condition
  const handleOpenDriverModal = (slotIndex: number, requiredLanguage: 'any' | 'english' = 'any') => {
    haptics.lightTap();
    setActiveSlotIndex(slotIndex);
    setRequiredDriverLanguage(requiredLanguage);
    setIsDriverModalOpen(true);
  };

  // Handle selecting driver from Step 3 modal
  const handleSelectDriverFromModal = (driver: AvailableDriverItem | any) => {
    setVehicleSlots((prev) => {
      const next = [...prev];
      if (next[activeSlotIndex]) {
        next[activeSlotIndex] = {
          ...next[activeSlotIndex],
          driver: {
            ...driver,
            rating: driver.rating ?? 0,
            avatarUrl: driver.avatarUrl || '',
            recentTrips: driver.recentTrips || [],
          },
          status: 'assigned',
        };
      }
      return next;
    });
    setIsDriverModalOpen(false);
    showToast(`${driver.name} 기사님이 ${vehicleSlots[activeSlotIndex]?.vehicleModel || '차량'}에 배정되었습니다.`);
  };

  // Update draft helper
  const handleUpdateDraft = useCallback((updated: HqEmailExtractedDraft) => {
    if (!currentSummary) return;
    setDraftsByEmailId((prev) => ({
      ...prev,
      [currentSummary.id]: updated,
    }));
    saveEmailDraft(updated);
  }, [currentSummary]);

  // =========================================================
  // On-Demand AI Extraction Trigger (Strict Body Validation)
  // =========================================================
  const handleExtractWithAi = async () => {
    if (!currentSummary) return;

    // 1. Ensure bodyText is fully loaded before allowing AI extraction
    let emailBody = currentDetail?.bodyText;
    if (!emailBody && !isLoadingDetail) {
      try {
        const detailRes = await fetch(`/api/email/${encodeURIComponent(currentSummary.id)}`);
        const detailData = await detailRes.json();
        if (detailData.ok && detailData.email?.bodyText) {
          emailBody = detailData.email.bodyText;
          setEmailDetails((prev) => ({ ...prev, [currentSummary.id]: detailData.email }));
        }
      } catch {}
    }

    if (!emailBody?.trim()) {
      showToast('이메일 본문이 아직 로드되지 않았습니다. 본문이 화면에 표시된 후 다시 시도해 주세요.');
      haptics.errorAlert();
      return;
    }

    haptics.mediumTap();
    setIsExtractingAi(true);

    try {
      // Invalidate any previous false-success or empty draft
      deleteEmailDraft(currentSummary.id);

      const res = await fetch('/api/email/extract-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailText: emailBody,
          emailSubject: currentSummary.subject,
          emailFrom: currentSummary.from.address,
          senderName: currentSummary.from.name,
          emailId: currentSummary.id,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok || !data.draft) {
        throw new Error(data.error || 'Gemini AI 예약 정보 추출에 실패했습니다.');
      }

      if (data.draft.confidence === 0) {
        throw new Error(data.error || 'Gemini AI가 유효한 예약 정보를 감지하지 못했습니다. 수동 입력을 진행해 주세요.');
      }

      const extracted: HqEmailExtractedDraft = data.draft;
      setDraftsByEmailId((prev) => ({
        ...prev,
        [currentSummary.id]: extracted,
      }));
      saveEmailDraft(extracted);

      // Dynamically initialize vehicle slots based on AI extracted vehicle request (NO dummy vehicles!)
      const newSlots = parseVehicleSlotsFromRequestedClass(extracted.requestedVehicleClass);
      setVehicleSlots(newSlots);

      const metricsText = data.metrics?.totalMs ? ` (${(data.metrics.totalMs / 1000).toFixed(1)}초)` : '';
      showToast(`Gemini AI가 이메일에서 예약 정보를 성공적으로 추출했습니다${metricsText}.`);
    } catch (err: any) {
      showToast(`AI 추출 실패: ${err.message}`);
      haptics.errorAlert();
    } finally {
      setIsExtractingAi(false);
    }
  };

  // =========================================================
  // Step 2 -> Step 4 Dispatch Confirmation (Server Real Sync)
  // =========================================================
  const handleConfirmDispatch = async () => {
    if (!currentSummary) return;

    // P0 Requirement: Administrator MUST explicitly assign a driver.
    const assignedSlots = vehicleSlots.filter((slot) => slot.driver !== null);
    if (assignedSlots.length === 0) {
      setDispatchError('배차 확정을 진행하려면 1명 이상의 가용 기사를 직접 선택해야 합니다.');
      haptics.errorAlert();
      return;
    }

    const primaryDriver = assignedSlots[0]?.driver;
    if (!primaryDriver) {
      setDispatchError('배차할 1호차 기사를 선택해 주세요.');
      return;
    }

    // Dynamic Draft Values - Strict Validation (No Arbitrary Defaults or allowUnverified Bypass)
    const draft = currentDraft;
    if (!draft) {
      setDispatchError('예약 정보가 없습니다. 먼저 이메일 AI 추출 또는 수동 입력을 진행해 주세요.');
      haptics.errorAlert();
      return;
    }

    const pickupDate = draft.pickupDate?.trim();
    if (!pickupDate) {
      setDispatchError('운행 일자가 지정되지 않았습니다. 예약 일자를 먼저 확인/입력해 주세요.');
      haptics.errorAlert();
      return;
    }

    const pickupTime = draft.pickupTime?.trim();
    if (!pickupTime) {
      setDispatchError('픽업 시간이 지정되지 않았습니다. 픽업 시간을 먼저 확인/입력해 주세요.');
      haptics.errorAlert();
      return;
    }

    const passengerName = draft.passengerName?.trim();
    if (!passengerName) {
      setDispatchError('탑승객명이 지정되지 않았습니다. 탑승객명을 먼저 확인/입력해 주세요.');
      haptics.errorAlert();
      return;
    }

    const origin = draft.pickupLocation?.trim();
    const destination = draft.dropoffLocation?.trim();
    if (!origin || !destination) {
      setDispatchError('출발지(픽업 위치)와 목적지는 필수 입력 항목입니다.');
      haptics.errorAlert();
      return;
    }

    // TMAP POI candidate confirmation enforcement with coordinates (Issue #33)
    if (
      !draft.isPickupPoiConfirmed ||
      typeof draft.pickupLat !== 'number' ||
      typeof draft.pickupLng !== 'number'
    ) {
      setDispatchError('출발지의 TMAP 위치 후보를 직접 클릭하여 좌표를 확정해야 배차를 최종 등록할 수 있습니다.');
      haptics.errorAlert();
      return;
    }

    if (
      !draft.isDropoffPoiConfirmed ||
      typeof draft.dropoffLat !== 'number' ||
      typeof draft.dropoffLng !== 'number'
    ) {
      setDispatchError('목적지의 TMAP 위치 후보를 직접 클릭하여 좌표를 확정해야 배차를 최종 등록할 수 있습니다.');
      haptics.errorAlert();
      return;
    }

    setIsDispatching(true);
    setDispatchError(null);

    try {
      // Disambiguate passenger phone: NEVER allow an email address!
      const rawPassengerPhone = draft.passengerPhone?.trim() || '';
      const safePassengerPhone = rawPassengerPhone.includes('@') ? '' : rawPassengerPhone;

      const bookingPayload = {
        customerName: draft.companyName?.trim() || '미등록 고객사',
        contactName: draft.contactName?.trim() || '',
        contactPhone: draft.contactPhone?.trim() || '',
        contactEmail: draft.contactEmail?.trim() || '',
        clientId: draft.clientId || null,
        contactId: draft.contactId || null,
        intakeSource: 'email',
        date: pickupDate,
        pickupTime: pickupTime,
        origin: origin,
        originAddress: origin,
        originLat: draft.pickupLat,
        originLng: draft.pickupLng,
        destination: destination,
        destinationAddress: destination,
        destinationLat: draft.dropoffLat,
        destinationLng: draft.dropoffLng,
        placeVerified: true,
        allowUnverified: false, // STRICTLY FALSE: Unverified dispatches are blocked!
        passengerName: passengerName,
        passengerPhone: safePassengerPhone,
        passengerCount: typeof draft.passengerCount === 'number' && draft.passengerCount > 0 ? draft.passengerCount : 1,
        flightNumber: draft.flightNumber?.trim() || '',
        notes: draft.specialRequests || `이메일 접수 (편명: ${draft.flightNumber || '미지정'})`,
        driverId: primaryDriver.id,
        driverName: primaryDriver.name,
        driverPhone: primaryDriver.phone,
        vehicleNo: primaryDriver.plate,
        vehiclePlate: primaryDriver.plate,
        vehicleModel: assignedSlots[0].vehicleModel,
        dispatchStatus: 'published',
        publishedBy: '대표/관리자 (이메일 배차 확정)',
      };

      const res = await fetch('/api/schedules/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload),
      });

      const data = await res.json().catch(() => ({}));

      // STRICT VALIDATION: Do NOT show fake success or advance if API failed
      if (!res.ok || !data.ok || !data.schedule) {
        throw new Error(data.error || '배차 저장 API가 정상 응답을 반환하지 않았습니다.');
      }

      // True Success Handlers
      setDispatchedSchedule(data.schedule);
      const savedBooking = mapScheduleItemToHqBooking(data.schedule, 0);

      if (draft) {
        const updatedDraft: HqEmailExtractedDraft = {
          ...draft,
          status: 'published',
          assignedDriver: primaryDriver.name,
          assignedVehicle: assignedSlots[0]?.vehicleModel || null,
          assignedVehiclePlate: primaryDriver.plate || null,
        };
        saveEmailDraft(updatedDraft);
        setDraftsByEmailId((prev) => ({
          ...prev,
          [currentSummary.id]: updatedDraft,
        }));
      }

      onCreateBooking?.(savedBooking);
      await onSavedServer?.();

      setWorkflowStep('step4_dispatch_done');
      showToast(`${primaryDriver.name} 기사님 Cockpit에 배차 알림이 실시간 전송되었습니다.`);
    } catch (err: any) {
      console.error('Dispatch confirmation failed:', err);
      setDispatchError(err.message || '서버 통신 실패로 배차 확정이 중단되었습니다.');
      haptics.errorAlert();
    } finally {
      setIsDispatching(false);
    }
  };

  // Reset to Step 1
  const handleResetToNewBooking = () => {
    haptics.lightTap();
    setWorkflowStep('step1_extract');
    setDispatchError(null);
    if (currentDraft?.requestedVehicleClass) {
      setVehicleSlots(parseVehicleSlotsFromRequestedClass(currentDraft.requestedVehicleClass));
    }
  };

  // Proceed from Step 1 to Step 2 Booking Detail (Register booking)
  const handleProceedToBooking = () => {
    haptics.success();
    // Synchronize vehicle slots dynamically from current draft (STRICT: no dummy vehicles!)
    const targetSlots = parseVehicleSlotsFromRequestedClass(currentDraft?.requestedVehicleClass);
    setVehicleSlots(targetSlots);
    setWorkflowStep('step2_booking_detail');
  };

  // 5-Step Workflow: 1: 이메일 확인, 2: AI 추출, 3: 정보 검토/수정, 4: 예약 등록, 5: 차량/기사 배정
  const calculatedCurrentStep: WorkflowStepId = useMemo(() => {
    if (workflowStep === 'step4_dispatch_done') return 5;
    if (workflowStep === 'step2_booking_detail') return 5;
    if (isExtractingAi) return 2;
    if (currentDraft) return 3;
    return 1;
  }, [workflowStep, isExtractingAi, currentDraft]);

  const handleStepperStepClick = (targetStep: WorkflowStepId) => {
    haptics.selection();
    if (targetStep === 1) {
      setWorkflowStep('step1_extract');
    } else if (targetStep === 2) {
      if (!currentDraft && !isExtractingAi) {
        handleExtractWithAi();
      }
    } else if (targetStep === 3) {
      setWorkflowStep('step1_extract');
    } else if (targetStep === 4 || targetStep === 5) {
      if (currentDraft) {
        handleProceedToBooking();
      }
    }
  };

  // Open Compose Modal
  const handleOpenCustomerMessage = () => {
    haptics.lightTap();
    if (!currentSummary) return;

    setComposeTo(currentSummary.from.address || '');
    setComposeSubject(`[VIP LIMOUSINE] ${currentSummary.from.name} 의전 차량 배차 확정 안내`);
    setComposeBody(`안녕하세요, ${currentSummary.from.name} 담당자님.
VIP LIMOUSINE KOREA 종합관제팀입니다.

요청해주신 VIP 의전 차량 배차가 정상적으로 확정되었습니다.
• 운행 일시: ${currentDraft?.pickupDate || '일정 확인 필요'} ${currentDraft?.pickupTime || ''}
• 운행 구간: ${currentDraft?.pickupLocation || '출발지'} ➔ ${currentDraft?.dropoffLocation || '도착지'}
• 탑승 승객: ${currentDraft?.passengerName || currentSummary.from.name}
• 배정 차량: ${vehicleSlots[0]?.vehicleModel || '의전 차량'}
• 배정 기사: ${vehicleSlots[0]?.driver?.name || '담당기사'} (${vehicleSlots[0]?.driver?.phone || '연락처'})

감사합니다.
VIP LIMOUSINE KOREA 관제팀 드림`);
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

      {/* Live Connection / IMAP Status Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
            imapState.syncStatus === 'connected'
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              : 'bg-amber-50 text-amber-600 border border-amber-200'
          }`}>
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900">
                {isDemoMode ? '데모 샘플 메일함' : 'NAVER 공식 메일함'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                imapState.syncStatus === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${imapState.syncStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span>{imapState.syncStatus === 'connected' ? '실시간 동기화 (PEEK Read-Only)' : '미연결 / 설정 확인'}</span>
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span>계정: {imapState.accountEmail || '미설정'}</span>
              {imapState.lastSync && (
                <>
                  <span>•</span>
                  <span>동기화: {imapState.lastSync}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Explicit Localhost Demo Switch */}
          <button
            type="button"
            onClick={handleToggleDemoMode}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              isDemoMode
                ? 'bg-blue-50 border-blue-300 text-[#1E60F3]'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
            title="개발/테스트용 데모 데이터 토글"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isDemoMode ? '실메일 모드로 복귀' : '데모 샘플 메일함 전환'}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchLiveInbox}
            disabled={isLoadingInbox || isDemoMode}
            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="메일함 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoadingInbox ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* Disconnected / Error Notice */}
      {!isDemoMode && !imapState.isConfigured && (
        <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-extrabold block">NAVER IMAP 연동 환경변수 미설정</span>
            <p className="text-amber-800 leading-relaxed font-normal">
              서버 환경에 <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">NAVER_USER</code> 및 <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">NAVER_APP_PASSWORD</code>가 등록되지 않았습니다. 실메일 대신 안전하게 공백 상태를 유지하고 있으며, 테스트가 필요하신 경우 우측 상단의 <strong>[데모 샘플 메일함 전환]</strong> 버튼을 이용하세요.
            </p>
          </div>
        </div>
      )}

      {/* Main 2-Section Layout */}
      <div className="flex flex-col md:flex-row items-start gap-5">
        {/* ========================================================= */}
        {/* Pinned Left Column: 이메일 목록                           */}
        {/* ========================================================= */}
        <div className="w-full md:w-80 lg:w-[320px] xl:w-[340px] shrink-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col min-h-[700px] md:sticky md:top-20">
          {/* Header Row */}
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

          {/* Status Filter Badges */}
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

          {/* Search Input */}
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
          </div>

          {/* Scrollable Email Cards List */}
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[580px] flex-1">
            {isLoadingInbox ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-7 h-7 mx-auto animate-spin text-[#1E60F3]" />
                <p className="text-xs font-bold text-slate-600">이메일 수신함 동기화 중...</p>
                <p className="text-[11px] text-slate-400">NAVER 메일 서버에서 안전하게 읽기 전용으로 로드합니다.</p>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="p-10 text-center text-slate-400 space-y-2">
                <Inbox className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-700">수신된 이메일이 없습니다</p>
                <p className="text-[11px] text-slate-400">
                  {imapState.isConfigured
                    ? '새로운 메일이 도착하면 실시간으로 목록에 반영됩니다.'
                    : 'NAVER 자격증명이 없으시면 상단 데모 모드로 전환하여 테스트하세요.'}
                </p>
              </div>
            ) : (
              filteredEmails.map((item) => {
                const isSelected = item.id === selectedEmailId;
                const draft = draftsByEmailId[item.id];
                const isAnalyzed = Boolean(draft || item.aiStatus === 'draft_generated');

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectEmail(item.id)}
                    className={`p-3.5 transition-all cursor-pointer relative group ${
                      isSelected
                        ? 'bg-blue-50/90 border-l-4 border-l-[#1E60F3] shadow-2xs'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar Initials Badge */}
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-[#1E60F3] font-black text-xs flex items-center justify-center shrink-0 shadow-2xs uppercase">
                        {(item.from.name || item.from.address || 'EM').slice(0, 2)}
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
                            {item.from.name || item.from.address}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                            {item.receivedAt}
                          </span>
                        </div>

                        <h4
                          className={`text-xs mt-0.5 line-clamp-1 leading-snug ${
                            isSelected
                              ? 'font-extrabold text-blue-950'
                              : 'font-semibold text-slate-700'
                          }`}
                        >
                          {item.subject}
                        </h4>

                        {item.preview && (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 leading-relaxed">
                            {item.preview}
                          </p>
                        )}

                        {/* Status chip */}
                        <div className="mt-2 flex items-center gap-1.5">
                          {draft?.status === 'published' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              배차 완료
                            </span>
                          ) : isAnalyzed ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200">
                              초안 생성됨
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                              AI 분석 대기
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* Dynamic Right Column: Sequential Multi-Step Workflow Card */}
        {/* ========================================================= */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          {currentSummary && (
            <div className="rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
              <HqEmailWorkflowStepper
                currentStep={calculatedCurrentStep}
                isExtractingAi={isExtractingAi}
                hasDraft={Boolean(currentDraft)}
                isDispatchDone={workflowStep === 'step4_dispatch_done'}
                onStepClick={handleStepperStepClick}
              />
            </div>
          )}

          {!currentSummary ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-12 text-center text-slate-400 space-y-3">
              <Mail className="w-10 h-10 mx-auto text-slate-300" />
              <h3 className="text-base font-extrabold text-slate-800">
                선택된 이메일이 없습니다
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                좌측 이메일 수신함에서 처리할 예약 요청 메일을 선택해 주세요.
              </p>
            </div>
          ) : (
            <div key={workflowStep} className="animate-step-slide">
              {workflowStep === 'step1_extract' && (
                <HqStep1ExtractView
                  emailSummary={currentSummary}
                  emailDetail={currentDetail}
                  extractedDraft={currentDraft}
                  isLoadingDetail={isLoadingDetail}
                  isExtractingAi={isExtractingAi}
                  onExtractWithAi={handleExtractWithAi}
                  onProceedToBooking={handleProceedToBooking}
                  onSaveModifiedDraft={() => {
                    showToast('수정된 예약 초안이 저장되었습니다.');
                  }}
                  onUpdateDraft={handleUpdateDraft}
                />
              )}

              {workflowStep === 'step2_booking_detail' && (
                <HqStep2BookingDetailView
                  emailSummary={currentSummary}
                  emailDetail={currentDetail}
                  extractedDraft={currentDraft}
                  vehicleSlots={vehicleSlots}
                  onOpenDriverModal={handleOpenDriverModal}
                  onConfirmDispatch={handleConfirmDispatch}
                  onBackToStep1={() => setWorkflowStep('step1_extract')}
                  onUpdateDraft={handleUpdateDraft}
                  onUpdateVehicleSlots={setVehicleSlots}
                  isDispatching={isDispatching}
                  dispatchError={dispatchError}
                />
              )}

              {workflowStep === 'step4_dispatch_done' && (
                <HqStep4DispatchDoneView
                  emailSummary={currentSummary}
                  emailDetail={currentDetail}
                  extractedDraft={currentDraft}
                  vehicleSlots={vehicleSlots}
                  onOpenDriverModal={handleOpenDriverModal}
                  onResetToNewBooking={handleResetToNewBooking}
                  onOpenCustomerMessage={handleOpenCustomerMessage}
                  dispatchedSchedule={dispatchedSchedule}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Step 3: 가용 기사 선택 모달 (Overlay) */}
      <HqDriverSelectModal
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
        onSelectDriver={handleSelectDriverFromModal}
        targetVehicleName={vehicleSlots[activeSlotIndex]?.vehicleModel || '차량 미지정'}
        targetDate={currentDraft?.pickupDate || '2026. 10. 28. (수)'}
        targetTime={currentDraft?.pickupTime || '09:00'}
        initialDriverId={vehicleSlots[activeSlotIndex]?.driver?.id || ''}
        requiredLanguage={requiredDriverLanguage}
        drivers={hqDrivers}
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
