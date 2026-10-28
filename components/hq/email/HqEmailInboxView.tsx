'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  Mail,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  User,
  MapPin,
  Shield,
  FileCheck,
  Send,
  Eye,
  Plus,
  Reply,
} from 'lucide-react';
import {
  HqEmailSummary,
  HqEmailDetail,
  HqEmailExtractedDraft,
} from '@/types/emailHq';
import { HqBooking } from '@/types/hq';
import {
  subscribeEmailStorage,
  getEmailDraftsSnapshot,
  getEmailDraftsServerSnapshot,
  saveEmailDraft,
  getEmailSettings,
  saveEmailSettings,
  setEmailStatusOverride,
} from '@/utils/emailHqStorage';
import { haptics } from '@/utils/haptics';
import { HqComposeEmailModal } from './HqComposeEmailModal';
import { HqPlaceSearchInput } from '../HqPlaceSearchInput';
import { DEFAULT_DRIVER_PROFILES } from '@/utils/settlementCalculator';
import { VIP_REAL_VEHICLES, stripManufacturerName } from '@/utils/vehicleData';
import { getKstTodayDateStr, mapScheduleItemToHqBooking } from '@/utils/dispatchConflictDetector';

export interface HqEmailInboxViewProps {
  onCreateBooking?: (booking: HqBooking) => void;
  onSavedServer?: () => Promise<void> | void;
}

const AVAILABLE_DRIVERS = DEFAULT_DRIVER_PROFILES.map((d) => ({
  id: d.id,
  name: d.name,
  phone: d.phone,
  vehicle: d.defaultVehicleRaw,
  plate: d.plate,
  isEnglishVerified: d.isEnglishVerified,
}));

// Module-level client cache container to eliminate tab-switch latency and provide 0ms instant display
interface ClientEmailStore {
  emails: HqEmailSummary[];
  totalServerCount: number;
  lastSync: string;
  isConnected: boolean;
  selectedEmailId: string | null;
  detailMap: Map<string, HqEmailDetail>;
}

const clientEmailStore: ClientEmailStore = {
  emails: [],
  totalServerCount: 0,
  lastSync: '',
  isConnected: true,
  selectedEmailId: null,
  detailMap: new Map(),
};

function setStoreEmailData(
  emails: HqEmailSummary[],
  total: number,
  lastSync: string,
  isConnected: boolean
) {
  clientEmailStore.emails = emails;
  clientEmailStore.totalServerCount = total;
  clientEmailStore.lastSync = lastSync;
  clientEmailStore.isConnected = isConnected;
}

function setStoreSelectedEmailId(id: string | null) {
  clientEmailStore.selectedEmailId = id;
}

function setStoreEmailDetail(id: string, detail: HqEmailDetail) {
  clientEmailStore.detailMap.set(id, detail);
}

export const HqEmailInboxView: React.FC<HqEmailInboxViewProps> = ({ onCreateBooking, onSavedServer }) => {
  // Sync email drafts from external store (SSR and hydration safe)
  const storedDrafts = useSyncExternalStore(
    subscribeEmailStorage,
    getEmailDraftsSnapshot,
    getEmailDraftsServerSnapshot
  );

  // Email inbox state - initialized from module cache for 0ms instant render
  const [emails, setEmails] = useState<HqEmailSummary[]>(() => clientEmailStore.emails);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(() => clientEmailStore.selectedEmailId);
  const [emailDetail, setEmailDetail] = useState<HqEmailDetail | null>(() => {
    if (clientEmailStore.selectedEmailId && clientEmailStore.detailMap.has(clientEmailStore.selectedEmailId)) {
      return clientEmailStore.detailMap.get(clientEmailStore.selectedEmailId)!;
    }
    return null;
  });
  const [isLoadingInbox, setIsLoadingInbox] = useState(() => clientEmailStore.emails.length === 0);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);

  // Mobile / Tablet pane view switch ('list' | 'detail' | 'draft')
  const [mobileActivePane, setMobileActivePane] = useState<'list' | 'detail' | 'draft'>('list');

  // Detail viewer format toggle ('text' | 'html')
  const [bodyDisplayMode, setBodyDisplayMode] = useState<'text' | 'html'>('text');

  // Filters & Settings
  const [selectedProvider, setSelectedProvider] = useState<'all' | 'naver' | 'gmail'>('all');
  const [selectedAiFilter, setSelectedAiFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState(getEmailSettings);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);

  // Compose & Reply Email Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  // In-progress user edits overlay for the currently selected draft
  const [draftEdits, setDraftEdits] = useState<Partial<HqEmailExtractedDraft> | null>(null);

  // Active draft derived from storedDrafts + in-memory user edits
  const activeDraft: HqEmailExtractedDraft | null = useMemo(() => {
    if (!selectedEmailId) return null;
    const base = storedDrafts[selectedEmailId];
    if (!base && !draftEdits) return null;
    if (!base && draftEdits) return draftEdits as HqEmailExtractedDraft;
    return { ...base, ...draftEdits } as HqEmailExtractedDraft;
  }, [selectedEmailId, storedDrafts, draftEdits]);

  const updateDraft = (updates: Partial<HqEmailExtractedDraft>) => {
    setDraftEdits((prev) => ({ ...prev, ...updates }));
  };

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Connection metadata - initialized from module cache
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => clientEmailStore.lastSync);
  const [totalServerCount, setTotalServerCount] = useState<number>(() => clientEmailStore.totalServerCount);
  const [isConnected, setIsConnected] = useState<boolean>(() => clientEmailStore.isConnected);

  // Initial fetch on mount (uses cached data immediately if present)
  useEffect(() => {
    let ignore = false;
    const loadInitial = async () => {
      // If we don't have client-side cached emails yet, show loader
      if (clientEmailStore.emails.length === 0) {
        setIsLoadingInbox(true);
      }
      try {
        const res = await fetch('/api/email/inbox');
        const data = await res.json();
        if (!ignore && data.ok && Array.isArray(data.emails)) {
          const total = data.totalCount || data.emails.length;
          const syncTime = data.lastSync || new Date().toLocaleTimeString();
          const connStatus = data.status?.ok ?? true;

          setStoreEmailData(data.emails, total, syncTime, connStatus);

          setEmails(data.emails);
          setTotalServerCount(total);
          setLastSyncTime(syncTime);
          setIsConnected(connStatus);

          setSelectedEmailId((prev) => {
            if (prev) return prev;
            const candidate =
              data.emails.find((e: HqEmailSummary) => e.candidateClassification === 'booking_candidate') ||
              data.emails[0];
            const chosenId = candidate ? candidate.id : null;
            setStoreSelectedEmailId(chosenId);
            return chosenId;
          });
        }
      } catch (err) {
        console.error('Failed to load email inbox:', err);
      } finally {
        if (!ignore) setIsLoadingInbox(false);
      }
    };

    loadInitial();
    return () => {
      ignore = true;
    };
  }, []);

  // Fetch single email detail when selection changes (with client memory cache)
  useEffect(() => {
    if (!selectedEmailId) return;
    setStoreSelectedEmailId(selectedEmailId);

    let ignore = false;
    const loadDetail = async () => {
      const cached = clientEmailStore.detailMap.get(selectedEmailId);
      if (cached) {
        if (!ignore) {
          setEmailDetail(cached);
          setIsLoadingDetail(false);
        }
        return;
      }

      setIsLoadingDetail(true);
      try {
        const res = await fetch(`/api/email/${selectedEmailId}`);
        const data = await res.json();
        if (!ignore && data.ok && data.email) {
          setStoreEmailDetail(selectedEmailId, data.email);
          setEmailDetail(data.email);
        }
      } catch (err) {
        console.error('Failed to load email detail:', err);
      } finally {
        if (!ignore) setIsLoadingDetail(false);
      }
    };

    loadDetail();
    return () => {
      ignore = true;
    };
  }, [selectedEmailId]);

  // Handle selecting an email card
  const handleSelectEmail = (emailId: string) => {
    haptics.lightTap();
    setSelectedEmailId(emailId);
    setStoreSelectedEmailId(emailId);
    setDraftEdits(null);
    setMobileActivePane('detail'); // On mobile/tablet, immediately jump to detail view
    const cached = clientEmailStore.detailMap.get(emailId);
    if (cached) {
      setEmailDetail(cached);
    }
  };

  // Manual refresh trigger - explicitly calls server with ?refresh=true
  const handleManualRefresh = async () => {
    setIsLoadingInbox(true);
    try {
      const res = await fetch('/api/email/inbox?refresh=true');
      const data = await res.json();
      if (data.ok && Array.isArray(data.emails)) {
        const total = data.totalCount || data.emails.length;
        const syncTime = data.lastSync || new Date().toLocaleTimeString();
        const connStatus = data.status?.ok ?? true;

        setStoreEmailData(data.emails, total, syncTime, connStatus);

        setEmails(data.emails);
        setTotalServerCount(total);
        setLastSyncTime(syncTime);
        setIsConnected(connStatus);
        showToast('네이버 메일함과 최신 동기화되었습니다.');
      }
    } catch (err) {
      console.error('Failed to sync inbox:', err);
      showToast('메일함 동기화에 실패했습니다.');
    } finally {
      setIsLoadingInbox(false);
    }
  };

  // Open blank compose email to anyone
  const handleOpenNewCompose = () => {
    haptics.lightTap();
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
    setIsComposeOpen(true);
  };

  // Reply to the currently selected email
  const handleReplyEmail = () => {
    if (!emailDetail) return;
    haptics.lightTap();
    setComposeTo(emailDetail.from.address || '');
    setComposeCc('');
    setComposeSubject(
      emailDetail.subject.startsWith('Re:')
        ? emailDetail.subject
        : `Re: ${emailDetail.subject}`
    );
    const quote = `\n\n\n----- Original Message -----\n보낸 사람: ${emailDetail.from.name} <${emailDetail.from.address}>\n수신 일시: ${emailDetail.receivedAt}\n제목: ${emailDetail.subject}\n\n${emailDetail.bodyText || ''}`;
    setComposeBody(quote);
    setIsComposeOpen(true);
  };

  // Send customer dispatch confirmation notification email
  const handleSendBookingNotificationEmail = () => {
    if (!activeDraft) return;
    haptics.selection();
    const recipient = emailDetail?.from.address || '';
    setComposeTo(recipient);
    setComposeCc('');
    setComposeSubject(`[VIP LIMOUSINE] ${activeDraft.passengerName || '고객'}님 의전 차량 배차 확정 안내`);

    const assignedDriverInfo = activeDraft.assignedDriver
      ? AVAILABLE_DRIVERS.find((d) => d.name === activeDraft.assignedDriver)
      : null;

    const notificationBody = `안녕하세요, VIP LIMOUSINE KOREA 종합관제팀입니다.
요청해주신 VIP 의전 차량 배차가 성공적으로 확정되었습니다.

[운행 일정 상세]
• 승객/고객명: ${activeDraft.passengerName || '미지정'} (탑승 ${activeDraft.passengerCount}명 / 수하물 ${activeDraft.luggageCount}개)
• 운행 일자: ${activeDraft.pickupDate}
• 픽업 시간: ${activeDraft.pickupTime}
• 픽업 장소: ${activeDraft.pickupLocation}
• 도착 목적지: ${activeDraft.dropoffLocation}
${activeDraft.flightNumber ? `• 항공편명: ${activeDraft.flightNumber}\n` : ''}• 배차 차량: ${activeDraft.assignedVehicle || activeDraft.requestedVehicleClass}${activeDraft.assignedVehiclePlate ? ` (${activeDraft.assignedVehiclePlate})` : ''}
• 담당 기사: ${activeDraft.assignedDriver ? `${activeDraft.assignedDriver} 기사 (${assignedDriverInfo?.phone || '010-8842-1920'})` : '배정 진행 중'}
${activeDraft.specialRequests ? `• 요청 및 특이사항: ${activeDraft.specialRequests}\n` : ''}
기사님이 픽업 예정 시간 20분 전 현장에 도착하여 대기할 예정이며, 차량 내부에는 VIP 전용 생수 및 편의용품이 완비되어 있습니다.
일정 변경 또는 문의사항이 있으시면 언제든지 본 메일 또는 관제센터로 회신 부탁드립니다.

감사합니다.
VIP LIMOUSINE KOREA 종합관제팀 드림`;

    setComposeBody(notificationBody);
    setIsComposeOpen(true);
  };

  // Selected email summary object
  const selectedEmailSummary = useMemo(() => {
    return emails.find((e) => e.id === selectedEmailId) || null;
  }, [emails, selectedEmailId]);

  // Derived KPI Counts
  const kpiCounts = useMemo(() => {
    const total = emails.length;
    const candidates = emails.filter((e) => e.candidateClassification === 'booking_candidate').length;
    const drafts = Object.keys(storedDrafts).length;
    const needsReview = emails.filter((e) => e.candidateClassification === 'uncertain').length;
    const unread = emails.filter((e) => e.isUnread).length;
    return { total, candidates, drafts, needsReview, unread };
  }, [emails, storedDrafts]);

  // Filtered emails
  const filteredEmails = useMemo(() => {
    return emails.filter((email) => {
      // 1. Provider
      if (selectedProvider !== 'all' && email.provider !== selectedProvider) return false;

      // 2. AI Status Filter
      if (selectedAiFilter !== 'all') {
        if (selectedAiFilter === 'candidate' && email.candidateClassification !== 'booking_candidate') return false;
        if (selectedAiFilter === 'draft' && !storedDrafts[email.id]) return false;
        if (selectedAiFilter === 'uncertain' && email.candidateClassification !== 'uncertain') return false;
        if (selectedAiFilter === 'unrelated' && email.candidateClassification !== 'unrelated') return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          email.subject.toLowerCase().includes(q) ||
          email.from.name.toLowerCase().includes(q) ||
          email.from.address.toLowerCase().includes(q) ||
          email.preview.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [emails, selectedProvider, selectedAiFilter, searchQuery, storedDrafts]);

  // Handle AI Analysis Trigger
  const handleTriggerAiAnalysis = async (emailIdToAnalyze?: string) => {
    const targetId = emailIdToAnalyze || selectedEmailId;
    if (!targetId) return;

    let targetDetail = emailDetail;
    if (!targetDetail || targetDetail.id !== targetId) {
      try {
        setIsLoadingDetail(true);
        const res = await fetch(`/api/email/${targetId}`);
        const data = await res.json();
        if (data.ok && data.email) {
          targetDetail = data.email;
          setEmailDetail(data.email);
        }
      } catch (err) {
        console.error('Failed to pre-fetch email detail for AI:', err);
      } finally {
        setIsLoadingDetail(false);
      }
    }

    if (!targetDetail || !targetDetail.bodyText) {
      showToast('메일 본문을 먼저 불러온 후 AI 분석을 진행해주세요.');
      return;
    }

    haptics.selection();
    setIsAnalyzingAi(true);

    try {
      const res = await fetch('/api/email/extract-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId: targetId,
          subject: targetDetail.subject,
          sender: targetDetail.from.address,
          bodyText: targetDetail.bodyText,
        }),
      });

      const data = await res.json();
      if (data.ok && data.draft) {
        saveEmailDraft(data.draft);
        setDraftEdits(null);
        setEmailStatusOverride(targetId, 'draft_generated');
        setMobileActivePane('draft'); // On mobile, automatically show the draft!
        haptics.success();
        showToast('Gemini AI가 이메일에서 정형화된 예약 초안을 성공적으로 추출했습니다.');
      } else {
        showToast(`AI 분석 알림: ${data.error || '초안 생성 완료'}`);
      }
    } catch (err) {
      console.error('Failed to run AI extraction:', err);
      showToast('AI 분석 요청 실패: 네트워크 상태를 확인해주세요.');
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // Handle Manual Draft Creation (Fallback if admin wants to type draft directly)
  const handleCreateManualDraft = () => {
    if (!selectedEmailId) return;
    const target = emails.find((e) => e.id === selectedEmailId);
    const today = getKstTodayDateStr();
    const blankDraft: HqEmailExtractedDraft = {
      id: `draft_${Date.now()}`,
      emailId: selectedEmailId,
      passengerName: target?.from.name || '',
      passengerPhone: '',
      passengerCount: 1,
      luggageCount: 1,
      pickupDate: today,
      pickupTime: '09:00',
      pickupLocation: '',
      dropoffLocation: '',
      flightNumber: '',
      requestedVehicleClass: '카니발 하이리무진',
      specialRequests: '',
      tripType: 'single',
      confidence: 0.9,
      warnings: ['관리자가 수동으로 초안을 생성했습니다.'],
      assignedDriver: null,
      assignedVehicle: null,
      assignedVehiclePlate: null,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };
    saveEmailDraft(blankDraft);
    setDraftEdits(null);
    setMobileActivePane('draft');
    haptics.success();
    showToast('수동 배차 초안이 생성되었습니다. 우측에서 정보를 입력해주세요.');
  };

  // Handle Save Draft (Local email draft workspace)
  const handleSaveDraft = () => {
    if (!activeDraft) return;
    haptics.selection();
    saveEmailDraft(activeDraft);
    setDraftEdits(null);
    showToast('예약 초안이 안전하게 저장되었습니다.');
  };

  // Persist Email Booking to Shared Server Dispatch Storage ('unassigned' intake OR 'published' confirmation)
  const handlePersistEmailBooking = async (mode: 'unassigned' | 'published') => {
    if (!activeDraft) return;

    if (!activeDraft.pickupDate || !activeDraft.pickupTime || !activeDraft.pickupLocation?.trim() || !activeDraft.dropoffLocation?.trim()) {
      alert('운행 일자, 픽업 시간, 출발지, 도착지 정보를 모두 확인해주세요.');
      return;
    }

    if (mode === 'published' && (!activeDraft.assignedDriver || !activeDraft.assignedVehiclePlate)) {
      alert('즉시 배차 확정을 위해 담당 기사와 배차 차량을 선택해주세요.\n사모님이 먼저 예약만 접수하시려면 [배차 대기함 등록(미배정)] 버튼을 눌러주세요.');
      return;
    }

    const matchedDriver = activeDraft.assignedDriver
      ? AVAILABLE_DRIVERS.find((d) => d.name === activeDraft.assignedDriver)
      : undefined;
    const matchedVehicle = activeDraft.assignedVehiclePlate
      ? VIP_REAL_VEHICLES.find((v) => v.plate === activeDraft.assignedVehiclePlate)
      : undefined;

    const inferredCustomer =
      emailDetail?.from.name?.trim() ||
      activeDraft.passengerName?.trim() ||
      '이메일 예약 고객';

    try {
      const res = await fetch('/api/schedules/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: inferredCustomer,
          intakeSource: 'email',
          date: activeDraft.pickupDate,
          pickupTime: activeDraft.pickupTime,
          origin: activeDraft.pickupLocation.trim(),
          destination: activeDraft.dropoffLocation.trim(),
          passengerName: activeDraft.passengerName?.trim() || inferredCustomer,
          passengerPhone: activeDraft.passengerPhone?.trim() || undefined,
          passengerCount: activeDraft.passengerCount || 1,
          flightNumber: activeDraft.flightNumber?.trim() || undefined,
          notes: activeDraft.specialRequests?.trim() || `[이메일 접수] ${emailDetail?.subject || ''}`.trim(),
          driverId: mode === 'published' ? matchedDriver?.id : undefined,
          driverName: mode === 'published' ? activeDraft.assignedDriver : undefined,
          driverPhone: mode === 'published' ? matchedDriver?.phone : undefined,
          vehicleNo: mode === 'published' ? activeDraft.assignedVehiclePlate : undefined,
          vehiclePlate: mode === 'published' ? activeDraft.assignedVehiclePlate : undefined,
          vehicleModel: mode === 'published' ? matchedVehicle?.model || activeDraft.assignedVehicle : undefined,
          dispatchStatus: mode,
          allowUnverified: true,
          publishedBy: mode === 'unassigned' ? '사모님(이메일접수)' : '대표님(배차확정)',
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.schedule) {
        alert(data.error || '서버 배차 등록에 실패했습니다. 일정 충돌 또는 입력값을 확인해주세요.');
        haptics.errorAlert();
        return;
      }

      const savedBooking = mapScheduleItemToHqBooking(data.schedule, 0);
      haptics.success();

      const updatedDraft = { ...activeDraft, status: 'published' as const };
      saveEmailDraft(updatedDraft);
      setDraftEdits(null);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vip_hq_schedules_updated'));
      }
      await onSavedServer?.();
      onCreateBooking?.(savedBooking);

      showToast(
        mode === 'unassigned'
          ? `이메일 예약 [${savedBooking.bookingNo}]이 배차 대기함(미배정)에 공유 등록되었습니다!`
          : `이메일 예약 [${savedBooking.bookingNo}]이 배차 확정되어 ${activeDraft.assignedDriver} 기사님 Cockpit에 전송되었습니다!`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '네트워크 오류';
      alert(`서버 저장 중 오류가 발생했습니다: ${msg}`);
      haptics.errorAlert();
    }
  };

  // Toggle Auto AI Candidate Analysis
  const handleToggleAutoAi = () => {
    haptics.selection();
    if (!settings.autoAiCandidateExtraction && !settings.hasAcceptedAiNotice) {
      setIsNoticeModalOpen(true);
    } else {
      const updated = saveEmailSettings({
        autoAiCandidateExtraction: !settings.autoAiCandidateExtraction,
      });
      setSettings(updated);
    }
  };

  const handleConfirmNotice = () => {
    const updated = saveEmailSettings({
      autoAiCandidateExtraction: true,
      hasAcceptedAiNotice: true,
    });
    setSettings(updated);
    setIsNoticeModalOpen(false);
    haptics.success();
    showToast('예약 메일 자동 후보 분석 기능이 활성화되었습니다.');
  };

  return (
    <div className="space-y-5">
      {/* 1. Header & Live IMAP Connection Status Banner */}
      <div className="bg-gradient-to-r from-[#0B1E48] via-[#0E2864] to-[#123485] rounded-2xl p-5 text-white shadow-md relative overflow-hidden border border-blue-900/40">
        <div className="absolute right-0 top-0 w-80 h-full bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600/40 border border-blue-400/40 flex items-center justify-center">
                <Mail className="w-4 h-4 text-blue-300" />
              </div>
              <h1 className="text-xl font-black tracking-tight">고객 이메일 · AI 배차 어시스턴트</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1.5 ${isConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {isConnected ? 'NAVER IMAP 읽기 전용 연결됨' : 'NAVER IMAP 오프라인'}
              </span>
            </div>
            <p className="text-xs text-blue-200/80 mt-1.5 font-medium">
              네이버 메일함의 원본 플래그(\Seen)를 변경하지 않고 안전하게 동기화하며, 예약 후보 메일만 선별하여 Gemini AI 일정 초안을 생성합니다.
            </p>
          </div>

          {/* Quick Stats, Compose & Sync Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-3.5 py-2 border border-white/10 text-right">
              <p className="text-[10px] text-blue-200 font-semibold uppercase tracking-wider">최근 동기화</p>
              <p className="text-xs font-bold text-white">{lastSyncTime || '확인 중...'}</p>
            </div>

            {/* Compose Email to Anyone Button */}
            <button
              type="button"
              onClick={handleOpenNewCompose}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white text-[#0B1E48] hover:bg-blue-50 active:scale-95 text-xs font-black shadow-sm transition-all cursor-pointer"
              title="어떤 수신인에게든 이메일을 직접 작성하여 발송합니다."
            >
              <Plus className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>+ 메일 쓰기</span>
            </button>

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isLoadingInbox}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInbox ? 'animate-spin' : ''}`} />
              <span>{isLoadingInbox ? '동기화 중...' : 'IMAP 동기화'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top 4 KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">전체 수신 메일</span>
            <Mail className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-slate-900">{kpiCounts.total}</span>
            <span className="text-[11px] font-semibold text-slate-400">건 (보관함: {totalServerCount})</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1E60F3]">AI 예약 후보 메일</span>
            <Sparkles className="w-4 h-4 text-[#1E60F3]" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-[#1E60F3]">{kpiCounts.candidates}</span>
            <span className="text-[11px] font-semibold text-blue-500">건 감지됨</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600">예약 초안 생성 완료</span>
            <FileCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-emerald-700">{kpiCounts.drafts}</span>
            <span className="text-[11px] font-semibold text-emerald-600">건 작성됨</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600">수동 확인 필요</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-amber-700">{kpiCounts.needsReview}</span>
            <span className="text-[11px] font-semibold text-amber-600">건 보류</span>
          </div>
        </div>
      </div>

      {/* 3. Filter & Options Bar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Provider & AI Status Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Provider Selector */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => setSelectedProvider('all')}
              className={`px-2.5 py-1 rounded-md transition-all ${selectedProvider === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                }`}
            >
              전체 제공자
            </button>
            <button
              type="button"
              onClick={() => setSelectedProvider('naver')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${selectedProvider === 'naver' ? 'bg-white text-emerald-600 shadow-xs' : 'hover:text-slate-900'
                }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              NAVER
            </button>
            <button
              type="button"
              onClick={() => setSelectedProvider('gmail')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${selectedProvider === 'gmail' ? 'bg-white text-rose-600 shadow-xs' : 'hover:text-slate-900'
                }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              Gmail
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* AI Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
            {[
              { id: 'all', label: '전체' },
              { id: 'candidate', label: '예약 후보' },
              { id: 'draft', label: '초안 완료' },
              { id: 'uncertain', label: '검토 필요' },
              { id: 'unrelated', label: '기타/스팸' },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setSelectedAiFilter(pill.id)}
                className={`px-2.5 py-1 rounded-lg transition-all ${selectedAiFilter === pill.id
                    ? 'bg-[#0B1E48] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Search & Auto AI Toggle */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="제목, 발신자, 내용 검색"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Auto AI Toggle */}
          <button
            type="button"
            onClick={handleToggleAutoAi}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${settings.autoAiCandidateExtraction
                ? 'bg-blue-50 border-blue-300 text-[#1E60F3]'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            title="수신되는 예약 메일 후보를 백그라운드에서 자동 분석할지 여부"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 자동 분석: {settings.autoAiCandidateExtraction ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Segmented Navigation (< xl) */}
      <div className="flex xl:hidden items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
        <button
          type="button"
          onClick={() => setMobileActivePane('list')}
          className={`flex-1 py-2 rounded-lg transition-all text-center ${mobileActivePane === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
            }`}
        >
          1. 수신 메일함 ({filteredEmails.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileActivePane('detail')}
          className={`flex-1 py-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${mobileActivePane === 'detail' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-900'
            }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>2. 원본 본문</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileActivePane('draft')}
          className={`flex-1 py-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${mobileActivePane === 'draft' ? 'bg-white text-purple-600 shadow-xs' : 'hover:text-slate-900'
            }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>3. AI 배차 초안</span>
          {activeDraft && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
        </button>
      </div>

      {/* 4. Main 3-Pane Workstation: 
          Pane 1: Email List (xl:col-span-4)
          Pane 2: Original Email Viewer (xl:col-span-4)
          Pane 3: AI Booking Assistant & Dispatch Editor (xl:col-span-4)
      */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* ========================================================= */}
        {/* PANE 1: 수신 메일 목록 (Inbox List)                         */}
        {/* ========================================================= */}
        <div className={`xl:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col min-h-[720px] ${mobileActivePane !== 'list' ? 'hidden xl:flex' : 'flex'
          }`}>
          {/* List Header */}
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-black text-slate-800">수신 메일 목록</h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-[10px] font-bold text-slate-600">
                {filteredEmails.length}건
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">클릭 시 본문 자동 표시</span>
          </div>

          {/* Email Cards List */}
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[660px]">
            {filteredEmails.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Mail className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold">조건에 맞는 이메일이 없습니다.</p>
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = email.id === selectedEmailId;
                const hasDraft = Boolean(storedDrafts[email.id]);
                const isCandidate = email.candidateClassification === 'booking_candidate';

                return (
                  <div
                    key={email.id}
                    onClick={() => handleSelectEmail(email.id)}
                    className={`p-3.5 transition-all cursor-pointer relative group ${isSelected
                        ? 'bg-blue-50/90 border-l-4 border-l-[#1E60F3] shadow-xs'
                        : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${email.provider === 'naver' ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          title={email.provider.toUpperCase()}
                        />
                        <span className={`text-xs truncate ${isSelected ? 'font-black text-blue-900' : 'font-bold text-slate-800'}`}>
                          {email.from.name || email.from.address}
                        </span>
                      </div>

                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {email.receivedAt}
                      </span>
                    </div>

                    <h4 className={`text-xs mt-1.5 line-clamp-1 ${isSelected ? 'font-black text-slate-900' : 'font-semibold text-slate-800'}`}>
                      {email.subject}
                    </h4>

                    {email.preview && (
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {email.preview}
                      </p>
                    )}

                    {/* Status Badges & Keywords */}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {isCandidate && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-[#1E60F3]">
                          ✨ 예약 후보
                        </span>
                      )}
                      {hasDraft && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          초안 작성됨
                        </span>
                      )}
                      {email.candidateClassification === 'uncertain' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                          검토 필요
                        </span>
                      )}
                      {email.candidateClassification === 'unrelated' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-400">
                          비관련
                        </span>
                      )}

                      {email.matchedKeywords?.slice(0, 2).map((kw) => (
                        <span
                          key={kw}
                          className="px-1 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-500"
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* PANE 2: 선택된 메일 원본 본문 뷰어 (Original Safe Viewer)    */}
        {/* ========================================================= */}
        <div className={`xl:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col min-h-[720px] ${mobileActivePane !== 'detail' ? 'hidden xl:flex' : 'flex'
          }`}>
          {/* Viewer Header */}
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-black text-slate-800">원본 이메일 본문</h2>
            </div>

            <div className="flex items-center gap-1.5">
              {emailDetail?.bodyHtmlSanitized && (
                <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-[10px] font-bold text-slate-600">
                  <button
                    type="button"
                    onClick={() => setBodyDisplayMode('text')}
                    className={`px-2 py-0.5 rounded transition-all ${bodyDisplayMode === 'text' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                      }`}
                  >
                    텍스트
                  </button>
                  <button
                    type="button"
                    onClick={() => setBodyDisplayMode('html')}
                    className={`px-2 py-0.5 rounded transition-all ${bodyDisplayMode === 'html' ? 'bg-white text-emerald-600 shadow-xs' : 'hover:text-slate-900'
                      }`}
                  >
                    서식(HTML)
                  </button>
                </div>
              )}

              {/* Mobile Back to List Button */}
              <button
                type="button"
                onClick={() => setMobileActivePane('list')}
                className="xl:hidden px-2 py-1 rounded-md text-[11px] font-bold text-slate-500 hover:bg-slate-200"
              >
                ← 목록
              </button>
            </div>
          </div>

          {/* Email Content Area */}
          <div className="p-4 flex-1 flex flex-col justify-between overflow-y-auto max-h-[660px]">
            {isLoadingDetail ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="w-7 h-7 mx-auto animate-spin text-blue-500" />
                <p className="text-xs font-bold text-slate-600">이메일 본문 불러오는 중...</p>
                <div className="max-w-xs mx-auto space-y-2 pt-4">
                  <div className="h-3 bg-slate-100 rounded animate-pulse" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-5/6 mx-auto" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-4/6 mx-auto" />
                </div>
              </div>
            ) : emailDetail ? (
              <div className="space-y-3.5">
                {/* Mail Header Details */}
                <div className="border border-slate-200/80 rounded-xl p-3 space-y-1.5 text-xs bg-slate-50/40">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 font-medium shrink-0">보낸 사람</span>
                    <span className="font-bold text-slate-900 text-right truncate">
                      {emailDetail.from.name} &lt;{emailDetail.from.address}&gt;
                    </span>
                  </div>
                  {emailDetail.to && emailDetail.to.length > 0 && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-slate-400 font-medium shrink-0">받는 사람</span>
                      <span className="text-slate-600 text-right truncate text-[11px]">
                        {emailDetail.to.join(', ')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 font-medium shrink-0">수신 일시</span>
                    <span className="text-slate-600 font-medium">{emailDetail.receivedAt}</span>
                  </div>
                  <div className="pt-1 border-t border-slate-200/60">
                    <h3 className="font-black text-slate-900 text-sm leading-snug">
                      {emailDetail.subject}
                    </h3>
                  </div>
                </div>

                {/* Body Content */}
                {bodyDisplayMode === 'html' && emailDetail.bodyHtmlSanitized ? (
                  <div
                    className="border border-slate-200 rounded-xl p-3.5 bg-white text-xs overflow-x-auto min-h-[300px] max-h-[460px] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: emailDetail.bodyHtmlSanitized }}
                  />
                ) : (
                  <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 text-xs font-sans whitespace-pre-wrap leading-relaxed text-slate-700 min-h-[300px] max-h-[460px] overflow-y-auto selection:bg-blue-100">
                    {emailDetail.bodyText || '(본문 텍스트가 없습니다)'}
                  </div>
                )}

                {/* Quick Action in Middle Viewer */}
                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleReplyEmail}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                      title="보낸 사람에게 회신(답장) 메일을 작성합니다."
                    >
                      <Reply className="w-3.5 h-3.5 text-slate-600" />
                      <span>답장</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEmailStatusOverride(emailDetail.id, 'skipped');
                        showToast('해당 이메일이 비관련 메일로 분류되었습니다.');
                      }}
                      className="px-2.5 py-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all"
                    >
                      비관련 분류
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTriggerAiAnalysis()}
                    disabled={isAnalyzingAi}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-all"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingAi ? 'animate-spin' : ''}`} />
                    <span>{isAnalyzingAi ? 'Gemini AI 분석 진행 중...' : '✨ 이 메일 AI 예약 분석'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Mail className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-600">좌측 목록에서 이메일을 선택해주세요.</p>
                <p className="text-[11px] text-slate-400">선택된 이메일의 본문과 헤더 정보가 이곳에 안전하게 표시됩니다.</p>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* PANE 3: AI 예약 어시스턴트 & 초안 편집기 (AI Draft & Dispatch) */}
        {/* ========================================================= */}
        <div className={`xl:col-span-4 bg-white rounded-2xl border border-blue-200/80 shadow-md p-4 flex flex-col justify-between min-h-[720px] ${mobileActivePane !== 'draft' ? 'hidden xl:flex' : 'flex'
          }`}>
          {activeDraft ? (
            <div className="space-y-3.5">
              {/* Draft Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#1E60F3] flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-900">AI 예약 초안 · 배차 지정</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Gemini 3.8 Flash 구조화 추출</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200">
                    신뢰도 {Math.round(activeDraft.confidence * 100)}%
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeDraft.tripType === 'modification'
                        ? 'bg-amber-100 text-amber-800'
                        : activeDraft.tripType === 'group'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                  >
                    {activeDraft.tripType === 'modification'
                      ? '일정 변경/지연'
                      : activeDraft.tripType === 'group'
                        ? '그룹 다중차량'
                        : '단일 운행'}
                  </span>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs max-h-[440px] overflow-y-auto pr-1">
                {/* 1. Passenger Name */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">승객/고객명</label>
                  <input
                    type="text"
                    value={activeDraft.passengerName}
                    onChange={(e) => updateDraft({ passengerName: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 2. Phone */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">연락처</label>
                  <input
                    type="text"
                    value={activeDraft.passengerPhone}
                    onChange={(e) => updateDraft({ passengerPhone: e.target.value })}
                    placeholder="미기재 시 직접 입력"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 3. Date */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">운행 일자</label>
                  <input
                    type="date"
                    value={activeDraft.pickupDate}
                    onChange={(e) => updateDraft({ pickupDate: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 4. Time */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">픽업 시간</label>
                  <input
                    type="time"
                    value={activeDraft.pickupTime}
                    onChange={(e) => updateDraft({ pickupTime: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* 5. Pickup Location */}
                <div className="col-span-2">
                  <HqPlaceSearchInput
                    label="출발지 (픽업 장소)"
                    value={activeDraft.pickupLocation}
                    onChange={(val) => updateDraft({ pickupLocation: val })}
                    placeholder="위치 검색 또는 입력"
                    heightClass="h-9"
                    icon="mapPin"
                  />
                </div>

                {/* 6. Dropoff Location */}
                <div className="col-span-2">
                  <HqPlaceSearchInput
                    label="도착지 (목적지)"
                    value={activeDraft.dropoffLocation}
                    onChange={(val) => updateDraft({ dropoffLocation: val })}
                    placeholder="목적지 검색 또는 입력"
                    heightClass="h-9"
                    icon="flag"
                  />
                </div>

                {/* 7. Flight & Vehicle Class */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">항공편명</label>
                  <input
                    type="text"
                    value={activeDraft.flightNumber}
                    onChange={(e) => updateDraft({ flightNumber: e.target.value })}
                    placeholder="예: KE082"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">희망 차량 등급</label>
                  <select
                    value={activeDraft.requestedVehicleClass}
                    onChange={(e) => updateDraft({ requestedVehicleClass: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="카니발 하이리무진">카니발 하이리무진</option>
                    <option value="벤츠 S클래스">벤츠 S클래스</option>
                    <option value="제네시스 G90">제네시스 G90</option>
                    <option value="스프린터 15인승">스프린터 15인승</option>
                  </select>
                </div>

                {/* 8. Counts */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">탑승 인원 (명)</label>
                  <input
                    type="number"
                    min="1"
                    value={activeDraft.passengerCount}
                    onChange={(e) => updateDraft({ passengerCount: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">수하물 (개)</label>
                  <input
                    type="number"
                    min="0"
                    value={activeDraft.luggageCount}
                    onChange={(e) => updateDraft({ luggageCount: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Special Requests */}
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">요청 및 특이사항</label>
                  <textarea
                    rows={2}
                    value={activeDraft.specialRequests}
                    onChange={(e) => updateDraft({ specialRequests: e.target.value })}
                    placeholder="피켓 요청, 외국어 응대, VIP 경호 등"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* ⚠️ Mandatory Admin Assignment Box */}
              <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/70 border-2 border-blue-300 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#0B1E48]">
                    <User className="w-4 h-4 text-[#1E60F3]" />
                    <span>차량 · 기사 배정 (선택 시 즉시 배차 / 미선택 시 대기함 등록)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">담당 기사 선택</label>
                    <select
                      value={activeDraft.assignedDriver || ''}
                      onChange={(e) => {
                        const selected = AVAILABLE_DRIVERS.find((d) => d.name === e.target.value);
                        updateDraft({
                          assignedDriver: selected?.name || null,
                          assignedVehicle: selected?.vehicle || activeDraft.assignedVehicle,
                          assignedVehiclePlate: selected?.plate || activeDraft.assignedVehiclePlate,
                        });
                      }}
                      className="w-full px-2 py-1.5 bg-white border border-blue-300 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- 미배정 (배차 대기함 등록) --</option>
                      {AVAILABLE_DRIVERS.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.isEnglishVerified ? '[영어] ' : '[국문] '}
                          {d.name} 기사 ({d.plate} · {stripManufacturerName(d.vehicle)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">투입 차량 선택</label>
                    <select
                      value={activeDraft.assignedVehiclePlate || ''}
                      onChange={(e) => {
                        const veh = VIP_REAL_VEHICLES.find((v) => v.plate === e.target.value);
                        updateDraft({
                          assignedVehiclePlate: e.target.value || null,
                          assignedVehicle: veh?.model || activeDraft.assignedVehicle,
                        });
                      }}
                      className="w-full px-2 py-1.5 bg-white border border-blue-300 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- 차량 미선정 --</option>
                      {VIP_REAL_VEHICLES.map((v) => (
                        <option key={v.id} value={v.plate}>
                          {v.plate} · {stripManufacturerName(v.model)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 leading-tight">
                  * 사모님은 차량·기사 선택 없이 <strong>[배차 대기함 등록(미배정)]</strong>을 누르면 대표님 스마트폰 대기함에 바로 공유됩니다.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handlePersistEmailBooking('unassigned')}
                  className="w-full py-2 px-3 rounded-xl border-2 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 text-xs font-black transition-all cursor-pointer"
                >
                  배차 대기함 등록 · 미배정 (사모님 이메일 접수)
                </button>

                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleTriggerAiAnalysis()}
                    disabled={isAnalyzingAi}
                    className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>AI 재분석</span>
                  </button>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={handleSendBookingNotificationEmail}
                      className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E60F3] border border-blue-200 text-xs font-bold transition-all cursor-pointer"
                      title="고객에게 배차 확정 안내 메일을 작성하여 발송합니다."
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>고객 안내</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      초안 저장
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePersistEmailBooking('published')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-black shadow-md transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>배차 확정 · 기사 전송</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Empty Draft State: Prompt user to analyze */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1E60F3] flex items-center justify-center shadow-xs">
                <Sparkles className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {selectedEmailSummary?.candidateClassification === 'booking_candidate'
                    ? '예약 후보 메일 감지됨'
                    : '이메일 AI 분석 대기 중'}
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
                  {selectedEmailSummary?.candidateClassification === 'booking_candidate'
                    ? '사전 키워드 필터를 통해 예약 관련 이메일로 분류되었습니다. Gemini AI를 실행하여 픽업 일정, 장소, 고객 정보를 구조화하세요.'
                    : '이메일을 선택하고 AI 분석을 시작하면 기사 배정 및 운행에 필요한 초안이 자동으로 생성됩니다.'}
                </p>
              </div>

              {selectedEmailSummary && (
                <div className="space-y-2 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => handleTriggerAiAnalysis()}
                    disabled={isAnalyzingAi}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`w-4 h-4 ${isAnalyzingAi ? 'animate-spin' : ''}`} />
                    <span>{isAnalyzingAi ? 'Gemini AI 추출 진행 중...' : 'Gemini AI로 예약 정보 자동 추출'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateManualDraft}
                    className="w-full px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-all cursor-pointer"
                  >
                    + 수동으로 배차 초안 작성
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/90 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* AI Data Use / Privacy Consent Modal per spec */}
      {isNoticeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-blue-700 font-black text-base">
              <Shield className="w-5 h-5 text-blue-600" />
              <span>예약 메일 자동 후보 분석 동의 안내</span>
            </div>

            <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <p className="font-semibold text-slate-800">
                본 기능은 인입되는 이메일 중 예약 후보로 감지된 메일 본문만을 안전하게 선별하여 Gemini 모델로 전송합니다.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-500">
                <li>스팸, 광고, 일반 뉴스레터 본문은 전송되지 않습니다.</li>
                <li>추출된 데이터는 초안으로만 저장되며, 기사 및 차량은 절대 자동 배정되지 않습니다.</li>
                <li>네이버 메일의 읽음(\Seen) 플래그나 메일함 상태는 전혀 변경되지 않습니다.</li>
              </ul>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNoticeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmNotice}
                className="px-4 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-bold"
              >
                동의 및 활성화
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compose & Send Email to Anyone Modal */}
      <HqComposeEmailModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        initialTo={composeTo}
        initialCc={composeCc}
        initialSubject={composeSubject}
        initialBody={composeBody}
        onSentSuccess={({ to }) => {
          showToast(`메일 발송 완료: ${to}`);
        }}
      />
    </div>
  );
};
