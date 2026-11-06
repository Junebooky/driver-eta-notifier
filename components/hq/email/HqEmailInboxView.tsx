'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  X,
} from 'lucide-react';
import { HqBooking } from '@/types/hq';
import {
  HqEmailSummary,
  HqEmailDetail,
  HqEmailExtractedDraft,
} from '@/types/emailHq';
import { buildEmailDispatchPlan } from '@/utils/emailDispatchPlan';
import type { ExistingEmailBookingCandidate } from '@/services/emailBookingMatchService';
import { prepareEmailRevisionDraft } from '@/utils/emailBookingRevision';
import { HqEmailRevisionMatchPanel } from './HqEmailRevisionMatchPanel';
import { HqEmailBatchRevisionPanel } from './HqEmailBatchRevisionPanel';
import {
  emailBatchNeedsReview, emailBatchRows, prepareEmailBatchRevisionDraft,
  buildEmailBatchRevisionApproval, type EmailBatchDecisions, type EmailBatchAssignments,
} from '@/utils/emailBatchRevision';
import { haptics } from '@/utils/haptics';
import { createRetryableJsonMutation } from '@/utils/retryableJsonMutation';
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
import { HqStep4BookingConfirmedView } from './HqStep4BookingConfirmedView';
import {
  HqDriverSelectModal,
  AvailableDriverItem,
} from './HqDriverSelectModal';
import { useHqDrivers } from '@/utils/useHqDrivers';
import type { AvailableDriverItem as FleetAvailableDriverItem } from '@/utils/availabilityEngine';
import { HqComposeEmailModal } from './HqComposeEmailModal';
import { HqEmailWorkflowStepper, WorkflowStepId } from './HqEmailWorkflowStepper';
import { parseVehicleSlotsFromRequestedClass } from '@/utils/vehicleSlotParser';
import { mapScheduleItemToHqBooking, getKstTodayDateStr } from '@/utils/dispatchConflictDetector';
import {
  saveEmailDraft,
  getEmailDraft,
  deleteEmailDraft,
  getEmailInboxCache,
  setEmailInboxCache,
  getCachedEmailDetail,
  getAllCachedEmailDetails,
  setCachedEmailDetail,
} from '@/utils/emailHqStorage';

export interface HqEmailInboxViewProps {
  onCreateBooking?: (booking: HqBooking) => void;
  onSavedServer?: () => Promise<void> | void;
}

export type EmailWorkflowStep = 'step1_extract' | 'step4_booking_confirmed' | 'step2_booking_detail' | 'step4_dispatch_done';

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
  const [dispatchMutation] = useState(() => createRetryableJsonMutation('cockpit_pending_email_dispatch'));
  const searchParams = useSearchParams();
  const urlStep = searchParams?.get('step') as EmailWorkflowStep | null;
  const urlDriverModal = searchParams?.get('driverModal') === 'true';
  const urlEmailId = searchParams?.get('emailId');
  const urlDriverLang =
    searchParams?.get('lang') === 'english' || searchParams?.get('driverLang') === 'english'
      ? 'english'
      : 'any';
  const urlDemo = searchParams?.get('demo') === 'true';

  // 1. Live Inbox State (Hydrated from persistent cache to prevent flickering)
  const [emails, setEmails] = useState<HqEmailSummary[]>(() => {
    if (urlDemo) {
      return REFERENCE_EMAILS.map((e) => e.summary);
    }
    const cached = getEmailInboxCache();
    if (cached?.data?.emails && cached.data.emails.length > 0) {
      return cached.data.emails;
    }
    return [];
  });
  const [isLoadingInbox, setIsLoadingInbox] = useState<boolean>(() => {
    if (urlDemo) return false;
    const cached = getEmailInboxCache();
    return !(cached?.data?.emails && cached.data.emails.length > 0);
  });
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const lastAutoRefreshRef = useRef(0);
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
    const cached = getEmailInboxCache();
    if (cached?.data?.imapState) {
      return cached.data.imapState;
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
    const cached = getEmailInboxCache();
    if (cached?.data?.emails && cached.data.emails.length > 0) {
      return cached.data.emails[0].id;
    }
    return null;
  });

  // 4. Email Detail Cache (Read-Only, hydrated from memory/session cache)
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
    return getAllCachedEmailDetails();
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
  // Read-only match search runs only after the operator clicks AI extraction.
  const [matchesByEmail, setMatchesByEmail] = useState<Record<string, ExistingEmailBookingCandidate[]>>({});
  const [matchDecisionByEmail, setMatchDecisionByEmail] = useState<Record<string, string>>({});
  const [originalAiDraftByEmail, setOriginalAiDraftByEmail] = useState<Record<string, HqEmailExtractedDraft>>({});
  const [batchDecisionsByEmail, setBatchDecisionsByEmail] = useState<Record<string, EmailBatchDecisions>>({});
  const [batchCancelIdsByEmail, setBatchCancelIdsByEmail] = useState<Record<string, string[]>>({});
  const [batchCancelReasonsByEmail, setBatchCancelReasonsByEmail] = useState<Record<string, Record<string, string>>>({});
  const [batchAssignmentsByEmail, setBatchAssignmentsByEmail] = useState<Record<string, EmailBatchAssignments>>({});

  // 6. Filter tabs ('all' | 'unprocessed' | 'reviewing' | 'completed')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unprocessed' | 'reviewing' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 7. Real Supabase drivers
  const { drivers: hqDrivers } = useHqDrivers();

  // 8. Distinct review, confirmation (step 4), assignment (step 5) and dispatched states.
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
  const [modalDriverAvailability, setModalDriverAvailability] = useState<FleetAvailableDriverItem[] | undefined>(undefined);

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
  // Live Fetch Inbox via GET /api/email/inbox (with multi-tier caching)
  // =========================================================
  const fetchLiveInbox = useCallback(
    async (forceRefresh = false, silent = false) => {
      if (isDemoMode) return;

      // When not forcing refresh, use valid client cache if available
      if (!forceRefresh) {
        const cached = getEmailInboxCache();
        if (cached && !cached.isStale && cached.data.emails.length > 0) {
          setEmails(cached.data.emails);
          setImapState(cached.data.imapState);
          setIsLoadingInbox(false);
          return;
        }
      }

      if (forceRefresh) {
        if (!silent) setIsRefreshing(true);
      } else {
        // Only show full loading spinner if we don't have any cached emails to display
        setEmails((prev) => {
          if (prev.length === 0) {
            setIsLoadingInbox(true);
          }
          return prev;
        });
      }
      setInboxError(null);

      try {
        const url = forceRefresh ? '/api/email/inbox?refresh=true' : '/api/email/inbox';
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'same-origin',
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok) {
          const nextImapState: ImapConnectionState = {
            isConfigured: data.isConfigured ?? false,
            syncStatus: data.syncStatus || 'disconnected',
            totalCount: 0,
            accountEmail: data.accountEmail || '',
            lastSync: data.lastSync || '',
            error: data.error || 'NAVER 메일함 동기화 실패',
          };
          setImapState(nextImapState);
          setInboxError(data.error || '이메일 수신함 조회에 실패했습니다.');
          setEmails((prev) => {
            if (forceRefresh && prev.length > 0) return prev;
            return [];
          });
          if (!forceRefresh) {
            setSelectedEmailId(null);
          }
        } else {
          const liveEmails: HqEmailSummary[] = data.emails || [];
          const nextImapState: ImapConnectionState = {
            isConfigured: true,
            syncStatus: 'connected',
            totalCount: data.totalCount ?? liveEmails.length,
            accountEmail: data.accountEmail || 'NAVER 공식 계정',
            lastSync:
              data.lastSync ||
              new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          };
          setImapState(nextImapState);
          setEmails(liveEmails);
          setEmailInboxCache(liveEmails, nextImapState);

          if (liveEmails.length > 0) {
            setSelectedEmailId((prev) => prev && liveEmails.some(item => item.id === prev) ? prev : liveEmails[0].id);
          } else {
            setSelectedEmailId(null);
          }

          if (forceRefresh && !silent) {
            showToast('이메일 수신함이 최신 상태로 동기화되었습니다.');
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
      } finally {
        setIsLoadingInbox(false);
        setIsRefreshing(false);
      }
    },
    [isDemoMode]
  );

  useEffect(() => {
    if (!isDemoMode) {
      const cached = getEmailInboxCache();
      if (!cached || cached.isStale || cached.data.emails.length === 0) {
        fetchLiveInbox(false);
      }
    }
  }, [fetchLiveInbox, isDemoMode]);

  // Refresh the visible HQ email inbox quietly, without polling other tabs.
  useEffect(() => {
    if (isDemoMode || searchParams?.get('tab') !== 'emails') return;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible' || isLoadingInbox || isRefreshing) return;
      const now = Date.now();
      if (now - lastAutoRefreshRef.current < 75_000) return;
      lastAutoRefreshRef.current = now;
      void fetchLiveInbox(true, true);
    };
    refreshWhenVisible();
    const interval = window.setInterval(refreshWhenVisible, 90_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isDemoMode, searchParams, fetchLiveInbox, isLoadingInbox, isRefreshing]);

  // =========================================================
  // Fetch Email Detail via GET /api/email/[id] (with memory & session cache)
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

    // In Live Mode: check state and storage cache first
    if (emailDetails[selectedEmailId]) {
      return;
    }

    const cachedDetail = getCachedEmailDetail(selectedEmailId);
    if (cachedDetail) {
      setEmailDetails((prev) => ({
        ...prev,
        [selectedEmailId]: cachedDetail,
      }));
      const cachedDraft = getEmailDraft(selectedEmailId);
      if (cachedDraft && !draftsByEmailId[selectedEmailId]) {
        setDraftsByEmailId((prev) => ({
          ...prev,
          [selectedEmailId]: cachedDraft,
        }));
      }
      return;
    }

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
          setCachedEmailDetail(data.email);

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
  const handleOpenDriverModal = (
    slotIndex: number,
    requiredLanguage: 'any' | 'english' = 'any',
    availableDrivers?: FleetAvailableDriverItem[],
  ) => {
    haptics.lightTap();
    setActiveSlotIndex(slotIndex);
    setRequiredDriverLanguage(requiredLanguage);
    // Explicit [] means availability is unverified: never silently treat all drivers as available.
    setModalDriverAvailability(availableDrivers);
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

  const handleChooseBatchTarget = (rowKey: string, selection: string) => {
    if (!currentSummary || !currentDraft) return;
    const emailId = currentSummary.id;
    const candidates = matchesByEmail[emailId] || [];
    const next = { ...(batchDecisionsByEmail[emailId] || {}), [rowKey]: selection };
    setBatchDecisionsByEmail(prev => ({ ...prev, [emailId]: next }));
    setBatchAssignmentsByEmail(prev => ({
      ...prev, [emailId]: Object.fromEntries(Object.entries(prev[emailId] || {}).filter(([key]) => key !== rowKey)),
    }));
    if (selection && selection !== 'new') {
      setBatchCancelIdsByEmail(prev => ({ ...prev, [emailId]: (prev[emailId] || []).filter(id => id !== selection) }));
    }
    // Rebuild from the original AI extraction, not a previously-merged draft.
    // This prevents stop duplication and preserves old POIs across multiple choices.
    const baseline = originalAiDraftByEmail[emailId] || currentDraft;
    try {
      const prepared = prepareEmailBatchRevisionDraft(baseline, vehicleSlots, candidates, next);
      handleUpdateDraft(prepared);
    } catch (error) {
      // Do not discard the explicit choice, but require the operator to fix
      // an ambiguous partial route manually before publish.
      showToast(error instanceof Error ? error.message : '날짜별 경로를 확인해 주세요.');
    }
  };

  const handleBatchCancel = (scheduleId: string, checked: boolean) => {
    if (!currentSummary) return;
    const id = currentSummary.id;
    setBatchCancelIdsByEmail(prev => ({
      ...prev,
      [id]: checked ? [...new Set([...(prev[id] || []), scheduleId])] : (prev[id] || []).filter(v => v !== scheduleId),
    }));
  };

  const handleBatchCancelReason = (scheduleId: string, reason: string) => {
    if (!currentSummary) return;
    const id = currentSummary.id;
    setBatchCancelReasonsByEmail(prev => ({
      ...prev, [id]: { ...(prev[id] || {}), [scheduleId]: reason },
    }));
  };

  const handleAddBatchVehicle = () => {
    setVehicleSlots(prev => prev.length >= 12 ? prev : [
      ...prev, { slotIndex: prev.length, vehicleModel: '차량 미지정', driver: null, status: 'unassigned' },
    ]);
  };
  const handleRemoveBatchVehicle = () => {
    setVehicleSlots(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  };

  const handleBatchAssignment = (rowKey: string, assignment: EmailBatchAssignments[string]) => {
    if (!currentSummary) return;
    const id = currentSummary.id;
    setBatchAssignmentsByEmail(prev => ({
      ...prev, [id]: { ...(prev[id] || {}), [rowKey]: assignment },
    }));
  };

  const handleChooseRevision = (candidate: ExistingEmailBookingCandidate) => {
    if (!currentSummary || !currentDraft) return;
    const prepared = prepareEmailRevisionDraft(currentDraft, candidate);
    setMatchDecisionByEmail(prev => ({ ...prev, [currentSummary.id]: candidate.scheduleId }));
    handleUpdateDraft(prepared);
    setVehicleSlots([{
      slotIndex: 0,
      vehicleModel: candidate.vehicleModel || '차량 미지정',
      vehiclePlate: candidate.vehiclePlate || undefined,
      driver: candidate.driverId ? {
        id: candidate.driverId,
        name: candidate.driverName,
        phone: candidate.driverPhone,
        rating: 0, reviewCount: 0, flags: [], languages: ['ko'],
        affiliation: '', residence: '', isAvailable: true,
      } : null,
      status: candidate.driverId ? 'assigned' : 'unassigned',
    }]);
    showToast('기존 예약을 수정 대상으로 선택했습니다. 전체 경로와 TMAP 주소를 검토해 주세요.');
  };

  const handleChooseNewBooking = () => {
    if (!currentSummary || !currentDraft) return;
    setMatchDecisionByEmail(prev => ({ ...prev, [currentSummary.id]: 'new' }));
    handleUpdateDraft({ ...currentDraft, revisionMatchedScheduleId: undefined, revisionMatchedVersion: undefined });
    setVehicleSlots(parseVehicleSlotsFromRequestedClass(currentDraft.requestedVehicleClass));
  };

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
      } catch { }
    }

    if (!emailBody?.trim() && !currentSummary.id.startsWith('naver-')) {
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
      const matches: ExistingEmailBookingCandidate[] = Array.isArray(data.matches) ? data.matches : [];
      setOriginalAiDraftByEmail(prev => ({ ...prev, [currentSummary.id]: extracted }));
      setBatchDecisionsByEmail(prev => ({ ...prev, [currentSummary.id]: {} }));
      setBatchCancelIdsByEmail(prev => ({ ...prev, [currentSummary.id]: [] }));
      setBatchCancelReasonsByEmail(prev => ({ ...prev, [currentSummary.id]: {} }));
      setBatchAssignmentsByEmail(prev => ({ ...prev, [currentSummary.id]: {} }));
      setMatchesByEmail(prev => ({ ...prev, [currentSummary.id]: matches }));
      setMatchDecisionByEmail(prev => ({
        ...prev,
        [currentSummary.id]: matches.length || ['modification','cancellation'].includes(extracted.tripType) ? '' : 'new',
      }));
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
  const handleConfirmDispatch = async (status: 'published' | 'unassigned' = 'published') => {
    if (!currentSummary || !currentDraft || isDispatching) return;
    setIsDispatching(true); setDispatchError(null);
    try {
      if (currentDraft.savedScheduleIds) throw new Error('이미 저장된 요청입니다. 모바일·PC의 예약 목록에서 날짜별 배정을 진행해 주세요.');
      const decision = matchDecisionByEmail[currentSummary.id] || '';
      const candidates = matchesByEmail[currentSummary.id] || [];
      const batch = emailBatchNeedsReview(currentDraft, vehicleSlots.length, candidates.length);
      if (currentDraft.tripType === 'cancellation') throw new Error('취소 요청은 배차관리에서 해당 예약을 확인한 뒤 직접 처리해 주세요.');
      if (!batch && ((!decision && (candidates.length || currentDraft.tripType === 'modification')) ||
        (currentDraft.revisionMatchedScheduleId && decision !== currentDraft.revisionMatchedScheduleId))) {
        throw new Error('기존 예약 수정 여부를 먼저 확인해 주세요.');
      }
      const matched = candidates.find(c => c.scheduleId === decision);
      let items: Array<Record<string, unknown>>;
      if (batch) {
        const plan = buildEmailBatchRevisionApproval(
          currentDraft, vehicleSlots, candidates, batchDecisionsByEmail[currentSummary.id] || {},
          batchCancelIdsByEmail[currentSummary.id] || [],
          batchCancelReasonsByEmail[currentSummary.id] || {},
          batchAssignmentsByEmail[currentSummary.id] || {},
          status,
        );
        items = plan.items;
      } else {
        items = buildEmailDispatchPlan(currentDraft, vehicleSlots, status);
        if (matched) {
          if (items.length !== 1 || (matched.groupTotalVehicles || 1) > 1)
            throw new Error('여러 날짜·차량은 일괄 비교에서 날짜별 예약을 연결해 주세요.');
          if (matched.dispatchStatus === 'published' && status !== 'published')
            throw new Error('기사에게 배포된 기존 배차를 미배정으로 전환할 수 없습니다.');
          items = items.map(item => ({
            ...item,
            scheduleId: matched.scheduleId, expectedVersion: matched.version,
            bookingNo: matched.bookingNo || undefined, eventId: matched.eventId || item.eventId,
            groupId: matched.groupId || item.groupId,
            groupVehicleIndex: matched.groupVehicleIndex || 1,
            groupTotalVehicles: matched.groupTotalVehicles || 1,
          }));
        }
      }
      if (currentDraft.savedScheduleIds) throw new Error('이미 저장된 이메일 요청입니다. 배차관리에서 변경한 뒤 다시 분석해 주세요.');
      const approvedItems = items.map(item => ({
        ...item,
        sourceEmailId: currentSummary.id,
        sourceSenderEmail: currentDraft.sourceSenderEmail || currentSummary.from.address,
        sourceMessageId: currentDraft.sourceMessageId || undefined,
        sourceAttachmentHashes: (currentDraft.sourceAttachments || []).map(file => file.sha256),
      }));
      const response = await dispatchMutation.send('/api/schedules/dispatch', { items: approvedItems });
      const data = await response.json();
      if (!response.ok || !data.ok || data.schedules?.length !== items.length) throw new Error(data.error || '전체 일정 저장을 확인하지 못했습니다.');
      // Cancelled original rows are still in the atomic result, but must never
      // become the saved ID for a newly-added vehicle in the same date/slot.
      const nextSavedScheduleIds = Object.fromEntries(items.flatMap((item, index) =>
        item.dispatchStatus === 'cancelled' ? [] :
          [[`${String(item.date)}:${Number(item.groupVehicleIndex || 1) - 1}`, data.schedules[index].id]],
      ));
      const updated = { ...currentDraft, status: status === 'published' ? 'published' as const : 'saved' as const, associatedBookingId: data.schedules[0].id, savedScheduleIds: nextSavedScheduleIds };
      saveEmailDraft(updated); setDraftsByEmailId(previous => ({ ...previous, [currentSummary.id]: updated }));
      setDispatchedSchedule(data.schedules[0]);
      data.schedules.forEach((schedule: import('@/data/ferrariSchedules').ScheduleItem, index: number) => {
        if (items[index]?.dispatchStatus !== 'cancelled') onCreateBooking?.(mapScheduleItemToHqBooking(schedule, index));
      });
      await onSavedServer?.();
      if (status === 'published') setWorkflowStep('step4_dispatch_done');
      showToast((batch || matched) && status === 'published'
        ? '일괄 변경사항을 저장했습니다. 기사 재확인과 고객 안내 필요 여부를 확인해 주세요.'
        : status === 'published'
          ? `${items.length}건의 날짜별 배차가 저장되었습니다.`
          : '대표 모바일·PC의 미배정 배차 목록에 지정 요청이 저장되었습니다.');
    } catch (error) { setDispatchError(error instanceof Error ? error.message : '배차 저장에 실패했습니다.'); }
    finally { setIsDispatching(false); }
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

  // Step 3 → 4: confirm the reviewed draft, without prematurely submitting a dispatch.
  const handleProceedToBooking = () => {
    if (!currentSummary || !currentDraft) return;
    const decision = matchDecisionByEmail[currentSummary.id] || '';
    if (currentDraft.tripType === 'cancellation') {
      showToast('취소 요청은 배차관리에서 기존 예약을 확인하고 직접 처리해 주세요.');
      return;
    }
    const batch = emailBatchNeedsReview(currentDraft, vehicleSlots.length, (matchesByEmail[currentSummary.id] || []).length);
    if (batch) {
      const rows = emailBatchRows(currentDraft, vehicleSlots, matchesByEmail[currentSummary.id] || [], batchDecisionsByEmail[currentSummary.id] || {});
      if (!rows.length || rows.some(row => !row.selection) ||
        rows.filter(row => row.selection !== 'new').some(row => !row.previous) ||
        new Set(rows.map(row => row.previous?.scheduleId).filter(Boolean)).size !== rows.filter(row => Boolean(row.previous)).length) {
        showToast('날짜·호차별 기존 예약을 중복 없이 모두 선택해 주세요.');
        return;
      }
    } else if (!decision && ((matchesByEmail[currentSummary.id] || []).length || currentDraft.tripType === 'modification')) {
      showToast('기존 예약 후보를 선택하거나 신규 예약으로 처리할지 먼저 확인해 주세요.');
      return;
    }
    haptics.success();
    const confirmedDraft: HqEmailExtractedDraft = {
      ...currentDraft,
      status: currentDraft.status === 'published' ? 'published' : 'saved',
      updatedAt: new Date().toISOString(),
    };
    saveEmailDraft(confirmedDraft);
    setDraftsByEmailId((prev) => ({ ...prev, [currentSummary.id]: confirmedDraft }));
    if (!confirmedDraft.revisionMatchedScheduleId) setVehicleSlots(parseVehicleSlotsFromRequestedClass(confirmedDraft.requestedVehicleClass));
    setWorkflowStep('step4_booking_confirmed');
  };

  // Step 4 → 5: assigning a driver is a separate, intentional action.
  const handleProceedToAssignment = () => {
    if (!currentDraft || workflowStep !== 'step4_booking_confirmed') return;
    haptics.selection();
    setWorkflowStep('step2_booking_detail');
  };

  const handleBackToReview = () => {
    haptics.lightTap();
    if (currentDraft && currentDraft.status === 'saved' && !currentDraft.savedScheduleIds) {
      handleUpdateDraft({ ...currentDraft, status: 'draft' });
    }
    setWorkflowStep('step1_extract');
  };

  // 5-Step Workflow: 1 mail, 2 AI, 3 review, 4 confirmation, 5 assignment.
  const calculatedCurrentStep: WorkflowStepId = useMemo(() => {
    if (workflowStep === 'step4_dispatch_done') return 5;
    if (workflowStep === 'step2_booking_detail') return 5;
    if (workflowStep === 'step4_booking_confirmed') return 4;
    if (isExtractingAi) return 2;
    if (currentDraft) return 3;
    return 1;
  }, [workflowStep, isExtractingAi, currentDraft]);

  const handleStepperStepClick = (targetStep: WorkflowStepId) => {
    haptics.selection();
    if (targetStep === 1 || targetStep === 3) {
      handleBackToReview();
    } else if (targetStep === 2) {
      if (!currentDraft && !isExtractingAi) {
        void handleExtractWithAi();
      }
    } else if (targetStep === 4) {
      if (currentDraft && workflowStep === 'step2_booking_detail') {
        setWorkflowStep('step4_booking_confirmed');
      }
    } else if (targetStep === 5) {
      if (currentDraft && workflowStep === 'step2_booking_detail') {
        setWorkflowStep('step2_booking_detail');
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
      <div className="bg-white rounded-2xl border border-slate-200/80 px-4 py-3 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative group/naver flex items-center">
            <img
              src="/images/icons/icon_naver.png"
              alt="네이버 메일"
              className="w-8 h-8 sm:w-8 sm:h-8 object-contain shrink-0 transition-transform duration-150 group-hover/naver:scale-110 cursor-pointer"
            />

            {/* Hover Tooltip: 위로 향하는 실제 네이버 이메일 강조 말풍선 */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/naver:flex flex-col items-start pointer-events-none z-[100]">
              <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#03C75A] inline-block animate-pulse" />
                실제 네이버 이메일
              </span>
              <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 ml-3 shadow-xs" />
            </div>
          </div>
          <span className="text-xs font-bold text-slate-600 truncate">
            동기화: {imapState.lastSync || '방금 전'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => fetchLiveInbox(true)}
          disabled={isLoadingInbox || isRefreshing}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-transparent border-0 hover:bg-slate-100 active:bg-slate-200 active:scale-95 transition-all duration-150 cursor-pointer disabled:opacity-50 group"
          title={imapState.lastSync ? `최근 동기화: ${imapState.lastSync}` : '메일함 새로고침'}
          aria-label="메일함 새로고침"
        >
          <RefreshCw className={`w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-transform duration-150 group-hover:scale-110 active:scale-95 ${isRefreshing || isLoadingInbox ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Disconnected / Error Notice */}
      {!isDemoMode && !imapState.isConfigured && (
        <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-extrabold block">NAVER IMAP 연동 환경변수 미설정</span>
            <p className="text-amber-800 leading-relaxed font-normal">
              서버 환경에 <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">NAVER_USER</code> 및 <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">NAVER_APP_PASSWORD</code>가 등록되지 않았습니다. 실메일 대신 안전하게 공백 상태를 유지하고 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* Main 2-Section Layout */}
      <div className="flex flex-col md:flex-row items-start gap-5">
        {/* ========================================================= */}
        {/* Pinned Left Column: 이메일 목록                           */}
        {/* ========================================================= */}
        <div className="w-full md:w-80 lg:w-[320px] xl:w-[340px] shrink-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col min-h-[700px] md:sticky md:top-20 relative z-20">
          {/* Header Row */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white rounded-t-2xl">
            <div className="relative group/email flex items-center gap-2 cursor-pointer">
              <img
                src="/images/icons/eemail/icon_email.png"
                alt="이메일 아이콘"
                className="w-7 h-7 object-contain shrink-0 transition-transform duration-150 group-hover/email:scale-110"
              />
              <h2 className="text-sm font-extrabold text-slate-900">
                이메일
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                {counts.total}
              </span>

              {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 (최상단 레이어) */}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover/email:flex flex-col items-start pointer-events-none z-[100]">
                <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                  실제 관리자님에게 온 이메일 목록이에요
                </span>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 ml-[10px] shadow-xs" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setComposeTo('');
                setComposeSubject('');
                setComposeBody('');
                setIsComposeOpen(true);
              }}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95 flex items-center gap-1"
              title="새 이메일 작성"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.2] text-slate-500" />
              <span>메일 작성</span>
            </button>
          </div>

          {/* Status Filter Badges */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1.5 overflow-x-auto text-xs font-bold scrollbar-none">
            {[
              { id: 'all' as const, label: '전체', count: undefined },
              { id: 'unprocessed' as const, label: '미처리', count: counts.unprocessed },
              { id: 'reviewing' as const, label: '검토중', count: counts.reviewing },
              { id: 'completed' as const, label: '예약완료', count: counts.completed },
            ].map((tab) => {
              const isSelected = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setStatusFilter(tab.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${isSelected
                    ? 'bg-[#0050FF] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`text-[11px] ${isSelected
                        ? 'text-white/90 font-black'
                        : tab.count === 0
                          ? 'text-slate-400 font-medium'
                          : 'text-slate-500 font-extrabold'
                        }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="p-3 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="보낸 사람, 제목 또는 내용 검색"
                className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-[#0050FF] focus:ring-2 focus:ring-blue-100 transition-all duration-150"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setSearchQuery('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5 rounded-md hover:bg-slate-100 transition-colors"
                  title="검색어 지우기"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Email Cards List */}
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[580px] flex-1 rounded-b-2xl">
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
                    className={`p-3.5 transition-all cursor-pointer relative group ${isSelected
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
                            className={`text-xs truncate ${isSelected
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
                          className={`text-xs mt-0.5 line-clamp-1 leading-snug ${isSelected
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
          {dispatchMutation.hasPending && <button type="button" className="rounded-xl border border-blue-200 p-3 text-sm text-blue-700" onClick={async () => { try { const response = await dispatchMutation.retry(); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || '저장 결과를 확인하지 못했습니다.'); window.location.reload(); } catch (error) { setDispatchError(error instanceof Error ? error.message : '저장 결과를 확인하지 못했습니다.'); } }}>이전 배차 저장 결과 확인</button>}
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
              {workflowStep === 'step1_extract' && currentDraft && (
                emailBatchNeedsReview(currentDraft, vehicleSlots.length, (matchesByEmail[currentSummary.id] || []).length)
                  ? <HqEmailBatchRevisionPanel
                      draft={currentDraft}
                      slots={vehicleSlots}
                      candidates={matchesByEmail[currentSummary.id] || []}
                      decisions={batchDecisionsByEmail[currentSummary.id] || {}}
                      cancelIds={batchCancelIdsByEmail[currentSummary.id] || []}
                      cancelReasons={batchCancelReasonsByEmail[currentSummary.id] || {}}
                      assignments={batchAssignmentsByEmail[currentSummary.id] || {}}
                      onSelect={handleChooseBatchTarget}
                      onCancel={handleBatchCancel}
                      onCancelReason={handleBatchCancelReason}
                      onAssignment={handleBatchAssignment}
                      onAddVehicle={handleAddBatchVehicle}
                      onRemoveLastVehicle={handleRemoveBatchVehicle}
                    />
                  : <HqEmailRevisionMatchPanel
                      draft={currentDraft}
                      matches={matchesByEmail[currentSummary.id] || []}
                      decision={matchDecisionByEmail[currentSummary.id] || null}
                      onSelect={handleChooseRevision}
                      onNew={handleChooseNewBooking}
                    />
              )}
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

              {workflowStep === 'step4_booking_confirmed' && currentDraft && (
                <HqStep4BookingConfirmedView
                  emailSummary={currentSummary}
                  extractedDraft={currentDraft}
                  onProceedToAssignment={handleProceedToAssignment}
                  onBackToReview={handleBackToReview}
                />
              )}

              {workflowStep === 'step2_booking_detail' && (
                <HqStep2BookingDetailView
                  emailSummary={currentSummary}
                  emailDetail={currentDetail}
                  extractedDraft={currentDraft}
                  vehicleSlots={vehicleSlots}
                  onOpenDriverModal={handleOpenDriverModal}
                  onConfirmDispatch={() => void handleConfirmDispatch('published')}
                  onRequestAssignment={() => void handleConfirmDispatch('unassigned')}
                  onBackToStep1={() => setWorkflowStep('step4_booking_confirmed')}
                  onUpdateDraft={handleUpdateDraft}
                  onUpdateVehicleSlots={setVehicleSlots}
                  isDispatching={isDispatching}
                  dispatchError={dispatchError}
                  batchReview={currentDraft && emailBatchNeedsReview(currentDraft, vehicleSlots.length, (matchesByEmail[currentSummary.id] || []).length)
                    ? <HqEmailBatchRevisionPanel
                        draft={currentDraft}
                        slots={vehicleSlots}
                        candidates={matchesByEmail[currentSummary.id] || []}
                        decisions={batchDecisionsByEmail[currentSummary.id] || {}}
                        cancelIds={batchCancelIdsByEmail[currentSummary.id] || []}
                        cancelReasons={batchCancelReasonsByEmail[currentSummary.id] || {}}
                        assignments={batchAssignmentsByEmail[currentSummary.id] || {}}
                        drivers={hqDrivers}
                        onSelect={handleChooseBatchTarget}
                        onCancel={handleBatchCancel}
                        onCancelReason={handleBatchCancelReason}
                        onAssignment={handleBatchAssignment}
                        onAddVehicle={handleAddBatchVehicle}
                        onRemoveLastVehicle={handleRemoveBatchVehicle}
                        showAssignments
                        isSubmitting={isDispatching}
                        onApprove={() => void handleConfirmDispatch('published')}
                        onRequestUnassigned={() => void handleConfirmDispatch('unassigned')}
                      />
                    : undefined}
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
        drivers={hqDrivers.map((driver) => ({
          ...driver,
          isAvailable: modalDriverAvailability === undefined
            ? driver.isAvailable
            : modalDriverAvailability.some((candidate) => candidate.id === driver.id && candidate.isAvailable),
        }))}
        excludedDriverIds={vehicleSlots
          .filter((_, index) => index !== activeSlotIndex)
          .map((slot) => slot.driver?.id)
          .filter((id): id is string => Boolean(id))}
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
