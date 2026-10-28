'use client';

import React, { useState, useMemo, useEffect, useCallback, Suspense, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CalendarCheck,
  Clock,
  Mail,
  BarChart3,
  Building2,
  PhoneCall,
  CheckCircle2,
  BellRing,
  MessageSquareText,
  ShieldAlert,
} from 'lucide-react';
import { HqSidebar } from '@/components/hq/HqSidebar';
import { HqHeader } from '@/components/hq/HqHeader';
import { HqKpiTiles } from '@/components/hq/HqKpiTiles';
import { HqDispatchTable, HqDispatchTabKey } from '@/components/hq/HqDispatchTable';
import { HqQuickDispatch } from '@/components/hq/HqQuickDispatch';
import { HqBookingDetailModal } from '@/components/hq/HqBookingDetailModal';
import { HqDrivingLogsView } from '@/components/hq/driving-logs/HqDrivingLogsView';
import { HqExpensesView } from '@/components/hq/expenses/HqExpensesView';
import { HqEmailInboxView } from '@/components/hq/email/HqEmailInboxView';
import { HqCustomersView } from '@/components/hq/customers/HqCustomersView';
import { HqReportsView } from '@/components/hq/reports/HqReportsView';
import { HqOperationsBoard } from '@/components/hq/operations/HqOperationsBoard';
import { HqQuoteModal } from '@/components/hq/quotes/HqQuoteModal';
import { VipChauffeurCardModal } from '@/components/cards/VipChauffeurCardModal';
import { HqUnconfirmedDispatchesCard } from '@/components/hq/dispatch/HqUnconfirmedDispatchesCard';
import { HqUnsentDraftsCard } from '@/components/hq/dispatch/HqUnsentDraftsCard';
import { HqDriverAllocationDonutCard } from '@/components/hq/dispatch/HqDriverAllocationDonutCard';
import HqDispatchAlertDrawer from '@/components/hq/dispatch/HqDispatchAlertDrawer';
import HqCustomerMessageModal from '@/components/hq/messages/HqCustomerMessageModal';
import {
  CustomerNotificationTrigger,
  HqBooking,
  HqDriverAllocationStats,
  HqKpiMetric,
  HqUnconfirmedDispatchItem,
  HqUnsentDraftItem,
} from '@/types/hq';
import { ScheduleItem } from '@/data/ferrariSchedules';
import {
  annotateBookingsWithConflicts,
  cleanDriverIdentity,
  formatKoreanFullDateLabel,
  formatShortAckTime,
  getKstTodayDateStr,
  getKstTomorrowDateStr,
  mapScheduleItemToHqBooking,
} from '@/utils/dispatchConflictDetector';
import { DEFAULT_DRIVER_PROFILES } from '@/utils/settlementCalculator';
import { stripManufacturerName } from '@/utils/vehicleData';
import { evaluateDispatchEscalationAlerts, formatMinutesCountdown, parseKstPickupEpochMs } from '@/utils/unackAlertEngine';
import { getHqCustomersSnapshot, subscribeSettlementReports } from '@/utils/settlementStorage';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';

function formatElapsedWait(isoStr?: string): { label: string; isUrgent: boolean } {
  if (!isoStr) return { label: '확인 대기', isUrgent: true };
  const diffMs = Date.now() - new Date(isoStr).getTime();
  if (isNaN(diffMs) || diffMs < 0) return { label: '방금 발송', isUrgent: false };
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return { label: '방금 발송', isUrgent: false };
  if (mins < 60) return { label: `${mins}분 경과`, isUrgent: mins >= 20 };
  const hrs = Math.floor(mins / 60);
  return { label: `${hrs}시간 ${mins % 60}분 경과`, isUrgent: true };
}

function HqDashboardInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTabOverride, setActiveTabOverride] = useState<string | null>(null);
  const activeSidebarTab = activeTabOverride ?? tabParam ?? 'dispatch';

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mobileDispatchSubView, setMobileDispatchSubView] = useState<'list' | 'form'>('list');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeDispatchTab, setActiveDispatchTab] = useState<HqDispatchTabKey>('all');
  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(null);

  // Shared Live Server Schedules -> Annotated HqBookings
  const [bookings, setBookings] = useState<HqBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string>('');
  const [syncError, setSyncError] = useState<string | null>(null);

  // Selected Booking for detail / vehicle-driver assignment / edit / cancel modal
  const [selectedBooking, setSelectedBooking] = useState<HqBooking | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isChauffeurCardOpen, setIsChauffeurCardOpen] = useState(false);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState(false);
  const [customerMsgTarget, setCustomerMsgTarget] = useState<{
    booking: HqBooking;
    trigger?: CustomerNotificationTrigger;
  } | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const liveCustomers = useSyncExternalStore(
    subscribeSettlementReports,
    getHqCustomersSnapshot,
    () => INITIAL_HQ_CUSTOMERS
  );

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchSharedBookings = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch('/api/schedules?role=hq', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setSyncError(data.error || '서버 일정 목록을 불러오지 못했습니다.');
        return;
      }

      const items: ScheduleItem[] = Array.isArray(data.schedules) ? data.schedules : [];
      const todayIso = getKstTodayDateStr();
      const tomorrowIso = getKstTomorrowDateStr();

      // Sort: actionable items & today/recent items clearly ordered chronologically
      const sortedItems = [...items].sort((a, b) => {
        // Put today & future/recent dates in chronological order, newest created first on ties
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (a.pickup_time || '').localeCompare(b.pickup_time || '');
      });

      const mapped = sortedItems.map((item, idx) =>
        mapScheduleItemToHqBooking(item, idx, todayIso, tomorrowIso)
      );
      const annotated = annotateBookingsWithConflicts(mapped);

      setBookings(annotated);
      setSyncError(null);

      const nowTime = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date());
      setLastSyncedLabel(nowTime);

      // Keep open modal synced if viewing an existing booking
      setSelectedBooking((prev) => {
        if (!prev || !prev.scheduleId) return prev;
        const refreshed = annotated.find((b) => b.scheduleId === prev.scheduleId || b.id === prev.id);
        return refreshed || prev;
      });
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : '동기화 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoadingBookings(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load + automatic cross-device sync (focus, visibility, custom event, 8s interval)
  useEffect(() => {
    fetchSharedBookings(false);

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchSharedBookings(true);
      }
    };
    const onCustomSync = () => fetchSharedBookings(true);

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('vip_hq_schedules_updated', onCustomSync);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchSharedBookings(true);
      }
    }, 8000);

    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('vip_hq_schedules_updated', onCustomSync);
      clearInterval(interval);
    };
  }, [fetchSharedBookings]);

  // Live Operational Counts (Omission & Conflict Prevention)
  const operationalCounts = useMemo(() => {
    const active = bookings.filter((b) => b.dispatchStatus !== '취소');
    const todayBookings = active.filter((b) => b.isToday);
    const unassigned = active.filter((b) => b.dispatchStatus === '미배정');
    const unacked = active.filter((b) => b.driverAck === '미확인');
    const reconfirm = active.filter(
      (b) => b.dispatchStatus === '재확인 필요' || b.driverAck === '재확인 필요'
    );
    const conflicts = active.filter((b) => b.hasConflict);
    const drafts = active.filter((b) => b.dispatchStatus === '작성 중');
    const multiGroups = new Set(
      active
        .filter((b) => (b.groupTotalVehicles || 1) > 1 && b.groupId)
        .map((b) => b.groupId)
    ).size;

    const totalActionNeeded =
      unassigned.length + unacked.length + reconfirm.length + conflicts.length;

    return {
      todayTotal: todayBookings.length,
      todayAssigned: todayBookings.filter((b) => b.dispatchStatus === '배차 완료').length,
      unassignedCount: unassigned.length,
      unackedCount: unacked.length,
      reconfirmCount: reconfirm.length,
      conflictCount: conflicts.length,
      draftCount: drafts.length,
      multiGroupsCount: multiGroups,
      totalActionNeeded,
    };
  }, [bookings]);

  // Dynamic 7 KPI Tiles
  const liveKpiMetrics: HqKpiMetric[] = useMemo(
    () => [
      {
        id: 'kpi_today_total',
        title: '오늘 운행 예약',
        count: operationalCounts.todayTotal,
        subtext: `배차완료 ${operationalCounts.todayAssigned}건`,
        iconType: 'calendar',
        urgencyLevel: 'normal',
      },
      {
        id: 'kpi_unassigned',
        title: '미배정 (배차대기)',
        count: operationalCounts.unassignedCount,
        subtext: '사모님 접수 · 배차 필요',
        iconType: 'users',
        urgencyLevel: operationalCounts.unassignedCount > 0 ? 'warning' : 'normal',
      },
      {
        id: 'kpi_sent_unacknowledged',
        title: '기사 미확인',
        count: operationalCounts.unackedCount,
        subtext: '배차 확정 후 확인 대기',
        iconType: 'send',
        urgencyLevel: operationalCounts.unackedCount > 0 ? 'warning' : 'normal',
      },
      {
        id: 'kpi_reconfirm_needed',
        title: '재확인 필요',
        count: operationalCounts.reconfirmCount,
        subtext: '일정/차량 변경 (v2+)',
        iconType: 'refresh',
        urgencyLevel: operationalCounts.reconfirmCount > 0 ? 'urgent' : 'normal',
      },
      {
        id: 'kpi_schedule_conflict',
        title: '일정 충돌 경고',
        count: operationalCounts.conflictCount,
        subtext: '기사·차량 시간 중복',
        iconType: 'clipboard',
        urgencyLevel: operationalCounts.conflictCount > 0 ? 'urgent' : 'normal',
      },
      {
        id: 'kpi_drafts',
        title: '작성 중 초안',
        count: operationalCounts.draftCount,
        subtext: '미발송 임시 초안',
        iconType: 'document',
        urgencyLevel: 'normal',
      },
      {
        id: 'kpi_multi_vehicle',
        title: '복수 차량 행사',
        count: operationalCounts.multiGroupsCount,
        subtext: '다중 호차 그룹 배차',
        iconType: 'group',
        urgencyLevel: 'normal',
      },
    ],
    [operationalCounts]
  );

  // Auto-Tracked Unacknowledged Escalation & Customer Notification Alerts
  const escalationSummary = useMemo(
    () => evaluateDispatchEscalationAlerts(bookings, nowTick),
    [bookings, nowTick]
  );

  const handleSendDriverReminder = useCallback(
    async (scheduleId: string) => {
      try {
        const res = await fetch('/api/schedules/remind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduleId, remindedBy: '본사 관제' }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          return { ok: false, error: json.error || '재알림 전송 실패' };
        }
        await fetchSharedBookings(true);
        return { ok: true, reminderCount: json.reminderCount };
      } catch (err: any) {
        return { ok: false, error: err?.message || '네트워크 오류' };
      }
    },
    [fetchSharedBookings]
  );

  // Live Unconfirmed Dispatches Card Data (Sorted by pickup imminence!)
  const liveUnconfirmedItems: HqUnconfirmedDispatchItem[] = useMemo(() => {
    return bookings
      .filter(
        (b) =>
          b.dispatchStatus !== '취소' &&
          (b.driverAck === '미확인' || b.driverAck === '재확인 필요')
      )
      .sort((a, b) => {
        const msA = parseKstPickupEpochMs(a.pickupDate, a.pickupTime) ?? Number.MAX_SAFE_INTEGER;
        const msB = parseKstPickupEpochMs(b.pickupDate, b.pickupTime) ?? Number.MAX_SAFE_INTEGER;
        return msA - msB;
      })
      .slice(0, 6)
      .map((b) => {
        const wait = formatElapsedWait(b.publishedAt || b.updatedAt);
        const pMs = parseKstPickupEpochMs(b.pickupDate, b.pickupTime);
        const minsLeft = pMs !== null ? Math.round((pMs - nowTick) / 60000) : null;
        const isCritical = minsLeft !== null && minsLeft <= 60 && minsLeft >= -720;
        return {
          id: b.id,
          scheduleId: b.scheduleId || b.id,
          pickupTime: `${b.pickupDate.slice(5)} ${b.pickupTime}`,
          pickupCountdownLabel: minsLeft !== null ? formatMinutesCountdown(minsLeft) : undefined,
          customerName: b.customerName,
          driverName: b.driverName,
          driverPhone: b.driverPhone,
          vehicleModel: stripManufacturerName(b.vehicleModel),
          destination: b.destination,
          waitingTime: b.driverAck === '재확인 필요' ? `재확인(v${b.version})` : wait.label,
          isUrgent: isCritical || b.driverAck === '재확인 필요' || wait.isUrgent,
          severity: isCritical ? 'critical' : b.driverAck === '재확인 필요' ? 'urgent' : 'warning',
          reminderCount: b.reminderCount || 0,
        };
      });
  }, [bookings, nowTick]);

  // Live Unassigned Queue & Drafts Card Data
  const liveUnsentItems: HqUnsentDraftItem[] = useMemo(() => {
    return bookings
      .filter((b) => b.dispatchStatus === '미배정' || b.dispatchStatus === '작성 중')
      .slice(0, 6)
      .map((b) => ({
        id: b.id,
        createdAt: formatShortAckTime(b.createdAt || b.updatedAt) || b.pickupDate.slice(5),
        customerName: b.customerName,
        pickupTime: `${b.pickupDate.slice(5)} ${b.pickupTime}`,
        destination: b.destination,
        status: b.dispatchStatus === '미배정' ? '배차 대기(미배정)' : '임시 초안',
      }));
  }, [bookings]);

  // Live Driver Allocation Stats
  const liveDriverStats: HqDriverAllocationStats = useMemo(() => {
    const total = DEFAULT_DRIVER_PROFILES.length;
    const assignedTodaySet = new Set(
      bookings
        .filter((b) => b.isToday && b.dispatchStatus === '배차 완료')
        .map((b) => cleanDriverIdentity(b.driverName))
        .filter(Boolean)
    );
    const activeCount = Math.min(total, assignedTodaySet.size);
    const unassignedQueueCount = Math.min(total - activeCount, operationalCounts.unassignedCount);
    const standbyCount = Math.max(0, total - activeCount - unassignedQueueCount);

    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

    return {
      totalDrivers: total,
      active: {
        label: '오늘 배차 투입',
        count: activeCount,
        percentage: pct(activeCount),
        color: '#1E60F3',
      },
      standby: {
        label: '배차 가능 대기',
        count: standbyCount,
        percentage: pct(standbyCount),
        color: '#60A5FA',
      },
      offDuty: {
        label: '휴무 / 정비',
        count: 0,
        percentage: 0,
        color: '#94A3B8',
      },
      unassigned: {
        label: '미배정 예약건',
        count: operationalCounts.unassignedCount,
        percentage: pct(unassignedQueueCount),
        color: '#F59E0B',
      },
    };
  }, [bookings, operationalCounts.unassignedCount]);

  // Open Fast Phone Intake Modal (usable from Header or Table on both PC & Mobile)
  const handleOpenQuickPhoneBookingModal = useCallback(() => {
    const todayIso = getKstTodayDateStr();
    const dateCompact = todayIso.replace(/-/g, '').slice(2);
    setSelectedBooking({
      id: `new_${Date.now()}`,
      bookingNo: `#${dateCompact}-${String(Math.floor(100 + Math.random() * 900))}`,
      no: bookings.length + 1,
      customerName: '',
      pickupDate: todayIso,
      pickupTime: '09:00',
      pickupLocation: '',
      destination: '',
      driverName: '-',
      vehicleModel: '-',
      vehiclePlate: '미배정',
      dispatchStatus: '미배정',
      driverAck: '-',
      customerBrochure: '미발송',
      intakeSource: 'phone',
    });
    setIsDetailModalOpen(true);
  }, [bookings.length]);

  // KPI Tile click handler
  const handleSelectKpi = (metricId: string) => {
    if (activeKpiFilter === metricId) {
      setActiveKpiFilter(null);
      return;
    }
    setActiveKpiFilter(metricId);
    if (metricId === 'kpi_today_total') {
      setActiveDispatchTab('today');
    } else {
      setActiveDispatchTab('all');
    }
    setMobileDispatchSubView('list');
  };

  // Filtered Bookings passed to HqDispatchTable
  const kpiAndHeaderFilteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          b.customerName.toLowerCase().includes(q) ||
          b.bookingNo.toLowerCase().includes(q) ||
          b.driverName.toLowerCase().includes(q) ||
          (b.passengerName && b.passengerName.toLowerCase().includes(q)) ||
          b.vehicleModel.toLowerCase().includes(q) ||
          (b.vehiclePlate && b.vehiclePlate.toLowerCase().includes(q)) ||
          b.pickupLocation.toLowerCase().includes(q) ||
          b.destination.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (activeKpiFilter === 'kpi_unassigned') {
        return b.dispatchStatus === '미배정';
      }
      if (activeKpiFilter === 'kpi_sent_unacknowledged') {
        return b.dispatchStatus !== '취소' && b.driverAck === '미확인';
      }
      if (activeKpiFilter === 'kpi_reconfirm_needed') {
        return (
          b.dispatchStatus !== '취소' &&
          (b.dispatchStatus === '재확인 필요' || b.driverAck === '재확인 필요')
        );
      }
      if (activeKpiFilter === 'kpi_schedule_conflict') {
        return Boolean(b.hasConflict);
      }
      if (activeKpiFilter === 'kpi_drafts') {
        return b.dispatchStatus === '작성 중';
      }
      if (activeKpiFilter === 'kpi_multi_vehicle') {
        return (b.groupTotalVehicles || 1) > 1;
      }

      return true;
    });
  }, [bookings, searchQuery, activeKpiFilter]);

  const handleUpdateBooking = (updated: HqBooking) => {
    setBookings((prev) => {
      const exists = prev.some((b) => b.id === updated.id || (updated.scheduleId && b.scheduleId === updated.scheduleId));
      const next = exists
        ? prev.map((b) =>
            b.id === updated.id || (updated.scheduleId && b.scheduleId === updated.scheduleId)
              ? updated
              : b
          )
        : [updated, ...prev];
      return annotateBookingsWithConflicts(next);
    });
    setSelectedBooking(updated);
  };

  const todayFullLabel = formatKoreanFullDateLabel();

  return (
    <div className="min-h-dvh bg-[#F8FAFC] flex font-sans antialiased text-slate-800 pb-16 lg:pb-0">
      {/* 1. Desktop Sidebar + Mobile Slide-over Drawer */}
      <HqSidebar
        activeTab={activeSidebarTab}
        onSelectTab={setActiveTabOverride}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        dispatchActionBadgeCount={operationalCounts.totalActionNeeded}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <HqHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          unreadAlertsCount={Math.max(
            operationalCounts.totalActionNeeded,
            escalationSummary.alerts.length
          )}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          onRefresh={() => fetchSharedBookings(false)}
          isRefreshing={isRefreshing}
          lastSyncedLabel={lastSyncedLabel}
          onOpenQuickPhoneBooking={handleOpenQuickPhoneBookingModal}
          onOpenQuoteModal={() => setIsQuoteModalOpen(true)}
          onOpenChauffeurCard={() => setIsChauffeurCardOpen(true)}
          onOpenNotifications={() => setIsAlertDrawerOpen(true)}
          title={
            activeSidebarTab === 'operations'
              ? '실시간 행사 운영 보드'
              : activeSidebarTab === 'quotes'
              ? '가격표 견적기 및 견적서 관리'
              : activeSidebarTab === 'driving_logs'
              ? '운행일지 관리'
              : activeSidebarTab === 'expenses' || activeSidebarTab === 'receipts'
              ? '경비지출 · 영수증 검수'
              : activeSidebarTab === 'emails'
              ? '고객 이메일 · 예약 접수'
              : activeSidebarTab === 'customers'
              ? '고객 관리'
              : activeSidebarTab === 'reports'
              ? '정산 · 수익성 · 종합 리포트'
              : '예약 · 배차 통합 관제'
          }
          subtitle={
            activeSidebarTab === 'operations' ? (
              <span className="text-slate-500 font-medium">
                대표님 모바일·PC 다중 차량 5단계 운행 상태(준비·도착·탑승·이동·종료) 실시간 관제
              </span>
            ) : activeSidebarTab === 'quotes' ? (
              <span className="text-slate-500 font-medium">
                사모님 실시간 가격표 견적 산출 및 확정 견적 ➔ 배차 대기함 자동 전환
              </span>
            ) : activeSidebarTab === 'customers' ? (
              <span className="text-slate-500 font-medium">
                주요 고객사의 담당자, 계약 단가, 청구 내역을 한눈에 확인하고 관리합니다.
              </span>
            ) : activeSidebarTab === 'reports' ? (
              <span className="text-slate-500 font-medium">
                고객사 서비스 시간 기준 정산 · 기사 인건비 · 배차별 직접이익 분석 및 리포트
              </span>
            ) : activeSidebarTab === 'expenses' || activeSidebarTab === 'receipts' ? (
              <>
                <span className="font-bold text-slate-700">{todayFullLabel}</span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-400">기사 Cockpit 경비 및 영수증 실시간 대조 검수</span>
              </>
            ) : (
              <>
                <span className="font-bold text-slate-700">{todayFullLabel}</span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">
                  사모님(예약 접수) ↔ 대표님(차량·기사 배차 확정) ↔ 기사 Cockpit 실시간 연동
                </span>
              </>
            )
          }
          searchPlaceholder={
            activeSidebarTab === 'customers'
              ? '고객명, 담당자명, 행사명으로 검색하세요...'
              : activeSidebarTab === 'reports'
              ? '고객사, 행사명, 대행사, 기사명, 차량 검색...'
              : activeSidebarTab === 'expenses' || activeSidebarTab === 'receipts'
              ? '기사명, 차량번호, 상호명 검색...'
              : '고객사, 승객명, 예약번호, 기사명, 차량번호 검색...'
          }
        />

        {/* Scrollable Body */}
        <main className="flex-1 p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          {activeSidebarTab === 'operations' ? (
            <HqOperationsBoard
              onOpenCustomerMessageForSchedule={(scheduleId, trigger) => {
                const found = bookings.find(
                  (b) => b.scheduleId === scheduleId || b.id === scheduleId
                );
                if (found) {
                  setCustomerMsgTarget({ booking: found, trigger });
                }
              }}
            />
          ) : activeSidebarTab === 'quotes' ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4 text-white">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">가격표 기반 실시간 견적기</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                전화 응대 중 즉시 요금을 계산하고 고객사용 견적서 생성 및 대표님 배차 대기함으로 즉시 전환합니다.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuoteModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md transition"
                >
                  견적서 작성창 열기
                </button>
                <button
                  type="button"
                  onClick={() => setIsChauffeurCardOpen(true)}
                  className="px-4 py-2.5 rounded-xl border border-amber-500/30 bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-xs transition"
                >
                  VIP 의전 소개서 보기
                </button>
              </div>
            </div>
          ) : activeSidebarTab === 'driving_logs' ? (
            <HqDrivingLogsView initialSearchQuery={searchQuery} bookings={bookings} />
          ) : activeSidebarTab === 'expenses' || activeSidebarTab === 'receipts' ? (
            <HqExpensesView initialSearchQuery={searchQuery} bookings={bookings} />
          ) : activeSidebarTab === 'customers' ? (
            <HqCustomersView
              initialSearchQuery={searchQuery}
              onOpenSettlementReport={() => setActiveTabOverride('reports')}
            />
          ) : activeSidebarTab === 'reports' ? (
            <HqReportsView initialSearchQuery={searchQuery} />
          ) : (
            <>
              {/* Dedicated 고객 이메일 View - kept mounted for instant switching */}
              <div className={activeSidebarTab === 'emails' ? 'block' : 'hidden'}>
                <HqEmailInboxView
                  onSavedServer={() => fetchSharedBookings(true)}
                  onCreateBooking={() => {
                    fetchSharedBookings(true);
                    setActiveTabOverride('dispatch');
                  }}
                />
              </div>

              {/* Operations Reservation & Dispatch View */}
              {activeSidebarTab !== 'emails' && (
                <>
                  {/* Sync Error Banner (if any) */}
                  {syncError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-center justify-between gap-2">
                      <span>서버 동기화 안내: {syncError}</span>
                      <button
                        type="button"
                        onClick={() => fetchSharedBookings(false)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 font-bold cursor-pointer"
                      >
                        재시도
                      </button>
                    </div>
                  )}

                  {/* Omission, Imminent Unacknowledged Escalation & Customer Message Strip */}
                  {operationalCounts.totalActionNeeded > 0 ||
                  escalationSummary.pendingCustomerMsgCount > 0 ? (
                    <div
                      className={`p-3.5 rounded-2xl text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        escalationSummary.criticalCount > 0
                          ? 'bg-gradient-to-r from-rose-900 via-red-800 to-rose-900 ring-2 ring-rose-400/50'
                          : 'bg-gradient-to-r from-[#0B1E48] via-[#102A63] to-[#163880]'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            escalationSummary.criticalCount > 0
                              ? 'bg-white/20 border border-white/40 animate-pulse'
                              : 'bg-amber-400/20 border border-amber-300/40'
                          }`}
                        >
                          {escalationSummary.criticalCount > 0 ? (
                            <ShieldAlert className="w-4 h-4 text-white" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-300" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-black tracking-tight flex items-center gap-2 flex-wrap">
                            <span>
                              {escalationSummary.criticalCount > 0
                                ? `초긴급 픽업 임박 미확인·누락 경보 ${escalationSummary.criticalCount}건!`
                                : `배차 전달 누락 방지 점검 · 확인 필요 ${
                                    operationalCounts.totalActionNeeded +
                                    escalationSummary.pendingCustomerMsgCount
                                  }건`}
                            </span>
                          </div>
                          <p className="text-[11px] text-white/80 font-medium mt-0.5">
                            {escalationSummary.criticalCount > 0
                              ? '픽업 60분 이내인데 기사가 아직 배차를 확인하지 않았거나 미배정 상태입니다. 즉시 경보 센터에서 재알림·전화 확인하세요.'
                              : '미확인 배차 자동 추적 및 고객사 안내 메시지 발송 대기를 실시간으로 관리합니다.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setIsAlertDrawerOpen(true)}
                          className="px-3 py-1.5 rounded-xl bg-white text-slate-950 hover:bg-slate-100 text-xs font-black cursor-pointer transition-all flex items-center gap-1 shadow-xs"
                        >
                          <BellRing className="w-3.5 h-3.5 text-rose-600" />
                          <span>자동 추적 경보 센터 ({escalationSummary.alerts.length})</span>
                        </button>
                        {escalationSummary.pendingCustomerMsgCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const firstPending = bookings.find(
                                (b) => b.dispatchStatus !== '취소' && Boolean(b.pendingCustomerTrigger)
                              );
                              if (firstPending) {
                                setCustomerMsgTarget({
                                  booking: firstPending,
                                  trigger: firstPending.pendingCustomerTrigger || 'dispatch_confirmed',
                                });
                              } else {
                                setIsAlertDrawerOpen(true);
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black cursor-pointer transition-all flex items-center gap-1"
                          >
                            <MessageSquareText className="w-3.5 h-3.5" />
                            <span>고객 안내 준비됨 {escalationSummary.pendingCustomerMsgCount}건</span>
                          </button>
                        )}
                        {operationalCounts.unassignedCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveKpiFilter('kpi_unassigned');
                              setActiveDispatchTab('all');
                              setMobileDispatchSubView('list');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black cursor-pointer transition-all"
                          >
                            미배정 {operationalCounts.unassignedCount}건 배차하기
                          </button>
                        )}
                        {operationalCounts.unackedCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveKpiFilter('kpi_sent_unacknowledged');
                              setActiveDispatchTab('all');
                              setMobileDispatchSubView('list');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold cursor-pointer transition-all"
                          >
                            기사 미확인 {operationalCounts.unackedCount}건
                          </button>
                        )}
                        {operationalCounts.reconfirmCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveKpiFilter('kpi_reconfirm_needed');
                              setActiveDispatchTab('all');
                              setMobileDispatchSubView('list');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-black cursor-pointer transition-all"
                          >
                            재확인 필요 {operationalCounts.reconfirmCount}건
                          </button>
                        )}
                        {operationalCounts.conflictCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveKpiFilter('kpi_schedule_conflict');
                              setActiveDispatchTab('all');
                              setMobileDispatchSubView('list');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-300 text-white text-xs font-black cursor-pointer transition-all"
                          >
                            일정 충돌 {operationalCounts.conflictCount}건
                          </button>
                        )}
                        {activeKpiFilter && (
                          <button
                            type="button"
                            onClick={() => setActiveKpiFilter(null)}
                            className="px-2 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-blue-100 text-[11px] font-bold cursor-pointer"
                          >
                            필터 해제
                          </button>
                        )}
                      </div>
                    </div>
                  ) : !isLoadingBookings ? (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>모든 예약의 차량·기사 배정 및 기사 Cockpit 확인이 누락 없이 완료되었습니다.</span>
                    </div>
                  ) : null}

                  {/* Section 1: 7 Live KPI Metric Tiles */}
                  <section aria-label="운영 지표 현황">
                    <HqKpiTiles
                      metrics={liveKpiMetrics}
                      activeFilter={activeKpiFilter}
                      onSelectMetric={handleSelectKpi}
                    />
                  </section>

                  {/* Mobile / Tablet Quick Workspace Toggle (< xl) */}
                  <div className="flex xl:hidden items-center bg-slate-200/70 p-1 rounded-xl text-xs font-black text-slate-600">
                    <button
                      type="button"
                      onClick={() => setMobileDispatchSubView('list')}
                      className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        mobileDispatchSubView === 'list'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      <CalendarCheck className="w-3.5 h-3.5 text-[#1E60F3]" />
                      <span>배차 대기함 · 예약 목록 ({kpiAndHeaderFilteredBookings.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileDispatchSubView('form')}
                      className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        mobileDispatchSubView === 'form'
                          ? 'bg-white text-[#1E60F3] shadow-xs'
                          : 'hover:text-slate-900'
                      }`}
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>전화 예약 · 빠른 배차 생성</span>
                    </button>
                  </div>

                  {/* Section 2: Main Working Area (Left 8 Cols Table + Right 4 Cols Quick Dispatch) */}
                  <section
                    aria-label="예약 대기함 및 빠른 배차 작업 영역"
                    className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start"
                  >
                    <div
                      className={`xl:col-span-8 ${
                        mobileDispatchSubView !== 'list' ? 'hidden xl:block' : 'block'
                      }`}
                    >
                      <HqDispatchTable
                        bookings={kpiAndHeaderFilteredBookings}
                        allBookingsForCounts={bookings}
                        activeTab={activeDispatchTab}
                        onSelectTab={(tab) => {
                          setActiveKpiFilter(null);
                          setActiveDispatchTab(tab);
                        }}
                        onOpenNewBooking={handleOpenQuickPhoneBookingModal}
                        onViewBooking={(booking) => {
                          setSelectedBooking(booking);
                          setIsDetailModalOpen(true);
                        }}
                        onOpenCustomerMessage={(booking) => {
                          setCustomerMsgTarget({
                            booking,
                            trigger: booking.pendingCustomerTrigger || undefined,
                          });
                        }}
                        onRemindDriver={async (booking) => {
                          await handleSendDriverReminder(booking.scheduleId || booking.id);
                        }}
                      />
                    </div>

                    <div
                      className={`xl:col-span-4 ${
                        mobileDispatchSubView !== 'form' ? 'hidden xl:block' : 'block'
                      }`}
                    >
                      <HqQuickDispatch
                        existingBookings={bookings}
                        onSavedBookings={() => fetchSharedBookings(true)}
                      />
                    </div>
                  </section>

                  {/* Section 3: Live Bottom Summary Cards */}
                  <section
                    aria-label="미확인 배차, 배차 대기함 및 기사 배정 현황"
                    className="grid grid-cols-1 lg:grid-cols-3 gap-5"
                  >
                    <HqUnconfirmedDispatchesCard
                      items={liveUnconfirmedItems}
                      onViewAll={() => setIsAlertDrawerOpen(true)}
                      onSelectItem={(item) => {
                        const target = bookings.find((b) => b.id === item.id);
                        if (target) {
                          setSelectedBooking(target);
                          setIsDetailModalOpen(true);
                        }
                      }}
                      onRemindItem={async (item) => {
                        await handleSendDriverReminder(item.scheduleId || item.id);
                      }}
                    />

                    <HqUnsentDraftsCard
                      items={liveUnsentItems}
                      onViewAll={() => {
                        setActiveKpiFilter('kpi_unassigned');
                        setActiveDispatchTab('all');
                        setMobileDispatchSubView('list');
                      }}
                      onSelectItem={(item) => {
                        const target = bookings.find((b) => b.id === item.id);
                        if (target) {
                          setSelectedBooking(target);
                          setIsDetailModalOpen(true);
                        }
                      }}
                    />

                    <HqDriverAllocationDonutCard
                      stats={liveDriverStats}
                      onViewAll={() => {
                        setActiveKpiFilter(null);
                        setActiveDispatchTab('today');
                        setMobileDispatchSubView('list');
                      }}
                    />
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>

      {/* 3. Mobile Sticky Bottom Navigation (< lg) for 대표님 & 사모님 Smartphone Use */}
      <nav
        aria-label="모바일 하단 빠른 메뉴"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 grid grid-cols-5 gap-1 select-none"
      >
        <button
          type="button"
          onClick={() => {
            setActiveTabOverride('dispatch');
            setMobileDispatchSubView('list');
          }}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold cursor-pointer relative ${
            activeSidebarTab === 'dispatch' && mobileDispatchSubView === 'list'
              ? 'text-[#1E60F3] bg-blue-50/70'
              : 'text-slate-500'
          }`}
        >
          <CalendarCheck className="w-4 h-4 mb-0.5" />
          <span>예약·배차</span>
          {operationalCounts.totalActionNeeded > 0 && (
            <span className="absolute top-0.5 right-2 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
              {operationalCounts.totalActionNeeded}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTabOverride('dispatch');
            setMobileDispatchSubView('form');
          }}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold cursor-pointer ${
            activeSidebarTab === 'dispatch' && mobileDispatchSubView === 'form'
              ? 'text-[#1E60F3] bg-blue-50/70'
              : 'text-slate-500'
          }`}
        >
          <PhoneCall className="w-4 h-4 mb-0.5" />
          <span>빠른배차</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTabOverride('dispatch');
            setActiveKpiFilter('kpi_sent_unacknowledged');
            setActiveDispatchTab('all');
            setMobileDispatchSubView('list');
          }}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold cursor-pointer relative ${
            activeSidebarTab === 'dispatch' && activeKpiFilter === 'kpi_sent_unacknowledged'
              ? 'text-[#1E60F3] bg-blue-50/70'
              : 'text-slate-500'
          }`}
        >
          <Clock className="w-4 h-4 mb-0.5" />
          <span>미확인점검</span>
          {operationalCounts.unackedCount + operationalCounts.reconfirmCount > 0 && (
            <span className="absolute top-0.5 right-2 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
              {operationalCounts.unackedCount + operationalCounts.reconfirmCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTabOverride('emails')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold cursor-pointer ${
            activeSidebarTab === 'emails' ? 'text-[#1E60F3] bg-blue-50/70' : 'text-slate-500'
          }`}
        >
          <Mail className="w-4 h-4 mb-0.5" />
          <span>이메일</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTabOverride(activeSidebarTab === 'reports' ? 'customers' : 'reports')
          }
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold cursor-pointer ${
            activeSidebarTab === 'reports' || activeSidebarTab === 'customers'
              ? 'text-[#1E60F3] bg-blue-50/70'
              : 'text-slate-500'
          }`}
        >
          {activeSidebarTab === 'customers' ? (
            <Building2 className="w-4 h-4 mb-0.5" />
          ) : (
            <BarChart3 className="w-4 h-4 mb-0.5" />
          )}
          <span>정산·고객</span>
        </button>
      </nav>

      {/* 4. Interactive Booking Detail, Assignment, Edit & Cancel Modal */}
      <HqBookingDetailModal
        booking={selectedBooking}
        existingBookings={bookings}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onUpdateBooking={handleUpdateBooking}
        onSavedServer={() => fetchSharedBookings(true)}
        onOpenCustomerMessage={(booking) => {
          setCustomerMsgTarget({
            booking,
            trigger: booking.pendingCustomerTrigger || undefined,
          });
        }}
      />

      {/* 4-B. Unacknowledged Dispatch Escalation & Omission Alert Drawer */}
      <HqDispatchAlertDrawer
        isOpen={isAlertDrawerOpen}
        onClose={() => setIsAlertDrawerOpen(false)}
        alerts={escalationSummary.alerts}
        onSendReminder={handleSendDriverReminder}
        onOpenBookingDetail={(bookingId) => {
          const found = bookings.find((b) => b.id === bookingId || b.scheduleId === bookingId);
          if (found) {
            setSelectedBooking(found);
            setIsDetailModalOpen(true);
          }
        }}
        onOpenCustomerMessage={(bookingId, trigger) => {
          const found = bookings.find((b) => b.id === bookingId || b.scheduleId === bookingId);
          if (found) {
            setCustomerMsgTarget({ booking: found, trigger });
          }
        }}
      />

      {/* 4-C. Customer Auto-Prepared Notification Review & Send Modal */}
      <HqCustomerMessageModal
        isOpen={Boolean(customerMsgTarget)}
        booking={
          customerMsgTarget
            ? bookings.find(
                (b) =>
                  b.id === customerMsgTarget.booking.id ||
                  (b.scheduleId && b.scheduleId === customerMsgTarget.booking.scheduleId)
              ) || customerMsgTarget.booking
            : null
        }
        customers={liveCustomers}
        initialTrigger={customerMsgTarget?.trigger}
        onClose={() => setCustomerMsgTarget(null)}
        onSentSuccess={() => fetchSharedBookings(true)}
      />

      {/* 5. Realtime Pricing Calculator & Quotation Modal */}
      <HqQuoteModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        onBookingConverted={() => {
          fetchSharedBookings(true);
          setActiveTabOverride('dispatch');
        }}
      />

      {/* 6. VIP Chauffeur & Vehicle Introduction Card Modal */}
      <VipChauffeurCardModal
        isOpen={isChauffeurCardOpen}
        onClose={() => setIsChauffeurCardOpen(false)}
      />
    </div>
  );
}

export default function HqDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#F8FAFC] flex items-center justify-center text-slate-400 font-bold text-sm">
          HQ 운영 시스템 로딩 중...
        </div>
      }
    >
      <HqDashboardInner />
    </Suspense>
  );
}
