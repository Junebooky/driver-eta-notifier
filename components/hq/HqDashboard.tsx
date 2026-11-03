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
import { HqDashboardOverview } from '@/components/hq/HqDashboardOverview';
import { HqMobileNav } from '@/components/hq/HqMobileNav';
import { HqHeader } from '@/components/hq/HqHeader';
import { HqKpiTiles } from '@/components/hq/HqKpiTiles';
import { HqDispatchTable, HqDispatchTabKey } from '@/components/hq/HqDispatchTable';
import { HqQuickDispatch } from '@/components/hq/HqQuickDispatch';
import { HqBookingDetailModal } from '@/components/hq/HqBookingDetailModal';
import { HqDriverVehicleInfoModal } from '@/components/hq/bookings/HqDriverVehicleInfoModal';
import { HqDrivingLogsView } from '@/components/hq/driving-logs/HqDrivingLogsView';
import { HqExpensesView } from '@/components/hq/expenses/HqExpensesView';
import { HqEmailInboxView } from '@/components/hq/email/HqEmailInboxView';
import { HqCustomersView } from '@/components/hq/customers/HqCustomersView';
import { HqReportsView } from '@/components/hq/reports/HqReportsView';
import { HqDriversView } from '@/components/hq/drivers/HqDriversView';
import { HqVehicleManagementView } from '@/components/hq/vehicles/HqVehicleManagementView';
import { HqFieldKnowledgeView } from '@/components/hq/knowledge/HqFieldKnowledgeView';
import { HqOperationsBoard } from '@/components/hq/operations/HqOperationsBoard';
import { HqQuoteModal } from '@/components/hq/quotes/HqQuoteModal';
import { HqOfficialPricingView } from '@/components/hq/quotes/HqOfficialPricingView';
import { VipChauffeurCardModal } from '@/components/cards/VipChauffeurCardModal';
import { HqUnconfirmedDispatchesCard } from '@/components/hq/dispatch/HqUnconfirmedDispatchesCard';
import { HqUnsentDraftsCard } from '@/components/hq/dispatch/HqUnsentDraftsCard';
import { HqDriverAllocationDonutCard } from '@/components/hq/dispatch/HqDriverAllocationDonutCard';
import HqDispatchAlertDrawer from '@/components/hq/dispatch/HqDispatchAlertDrawer';
import HqCustomerMessageModal from '@/components/hq/messages/HqCustomerMessageModal';
import { HqAdminLoginModal } from '@/components/hq/auth/HqAdminLoginModal';
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
import { ensureClientAuth } from '@/utils/cockpitClientAuth';
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

function HqDashboardInner({ representativeMode }: { representativeMode: boolean }) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTabOverride, setActiveTabOverride] = useState<string | null>(null);
  const activeSidebarTab = activeTabOverride ?? tabParam ?? 'dashboard';

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mobileDispatchSubView, setMobileDispatchSubView] = useState<'list' | 'form'>('list');
  const [isQuickDispatchModalOpen, setIsQuickDispatchModalOpen] = useState(false);
  const [quickDispatchBooking, setQuickDispatchBooking] = useState<HqBooking | null>(null);
  const [infoModalBooking, setInfoModalBooking] = useState<HqBooking | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeDispatchTab, setActiveDispatchTab] = useState<HqDispatchTabKey>(()=>searchParams.get('view')==='action' || representativeMode ? 'action':'all');
  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(() => {
    const f = searchParams.get('filter');
    return f && f !== 'today' ? f : null;
  });

  // Sync activeTabOverride when tabParam changes (e.g. browser navigation or external link)
  useEffect(() => {
    if (tabParam) {
      setActiveTabOverride(tabParam);
      try {
        sessionStorage.setItem('hq_active_tab', tabParam);
      } catch {}
    }
  }, [tabParam]);

  // Restore saved tab from session if URL has no tab param on fresh load
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const urlTab = url.searchParams.get('tab');
      const savedTab = sessionStorage.getItem('hq_active_tab');

      if (!urlTab && savedTab) {
        setActiveTabOverride(savedTab);
        url.searchParams.set('tab', savedTab);
        window.history.replaceState(null, '', url.pathname + url.search);
      } else if (urlTab) {
        sessionStorage.setItem('hq_active_tab', urlTab);
      }
    } catch {}
  }, []);

  // Listen to popstate for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      try {
        const url = new URL(window.location.href);
        const currentTab = url.searchParams.get('tab') || 'dashboard';
        const currentFilter = url.searchParams.get('filter');
        setActiveTabOverride(currentTab);
        setActiveKpiFilter(currentFilter && currentFilter !== 'today' ? currentFilter : null);
        sessionStorage.setItem('hq_active_tab', currentTab);
      } catch {}
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Shared Live Server Schedules -> Annotated HqBookings
  const [bookings, setBookings] = useState<HqBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string>('');
  const [syncError, setSyncError] = useState<string | null>(null);

  // Selected Booking for detail / vehicle-driver assignment / edit / cancel modal
  const [selectedBooking, setSelectedBooking] = useState<HqBooking | null>(null);
  const [bookingModalSection, setBookingModalSection] = useState<'details' | 'assignment'>('details');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(() => searchParams.get('quoteModal') === 'true');
  const [selectedQuoteVehicleCode, setSelectedQuoteVehicleCode] = useState<string | undefined>();
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
      await ensureClientAuth('hq');
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
        const refreshed = annotated.find((b: HqBooking) => b.scheduleId === prev.scheduleId || b.id === prev.id);
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
        label: '운행 중',
        count: activeCount,
        percentage: pct(activeCount),
        color: '#1E60F3',
      },
      standby: {
        label: '배차 가능',
        count: standbyCount,
        percentage: pct(standbyCount),
        color: '#60A5FA',
      },
      offDuty: {
        label: '휴무·정비',
        count: 0,
        percentage: 0,
        color: '#94A3B8',
      },
      unassigned: {
        label: '대기 중인 예약',
        count: operationalCounts.unassignedCount,
        percentage: pct(unassignedQueueCount),
        color: '#F59E0B',
      },
    };
  }, [bookings, operationalCounts.unassignedCount]);

  // Open Fast Phone Intake Modal (usable from Header or Table on both PC & Mobile)
  const handleOpenQuickPhoneBookingModal = useCallback(() => {
    setQuickDispatchBooking(null);
    setIsQuickDispatchModalOpen(true);
  }, []);

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

  const openAssignment = (booking: HqBooking) => {
    setSelectedBooking(booking); setBookingModalSection('assignment'); setIsDetailModalOpen(true);
  };
  const navigateWorkspace = (tab: string, filter?: string) => {
    setActiveTabOverride(tab);
    setSearchQuery('');
    setActiveKpiFilter(filter && filter !== 'today' ? filter : null);
    setActiveDispatchTab(filter === 'today' ? 'today' : filter ? 'all' : representativeMode ? 'action' : 'all');
    setMobileDispatchSubView('list');
    window.scrollTo({ top: 0 });

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('hq_active_tab', tab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        if (filter && filter !== 'today') {
          url.searchParams.set('filter', filter);
        } else {
          url.searchParams.delete('filter');
        }
        window.history.replaceState(null, '', url.pathname + url.search);
      } catch (err) {
        console.error('Failed to sync tab to URL:', err);
      }
    }
  };

  const todayFullLabel = formatKoreanFullDateLabel();

  return (
    <div className="hq-app min-h-dvh bg-[#F8FAFC] flex font-sans antialiased text-slate-800 pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0">
      {/* 1. Desktop Sidebar + Mobile Slide-over Drawer */}
      <HqSidebar
        activeTab={activeSidebarTab}
        onSelectTab={navigateWorkspace}
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
          onOpenAdminLogin={() => setIsAdminLoginOpen(true)}
          onOpenNotifications={() => setIsAlertDrawerOpen(true)}
          title={
            activeSidebarTab === 'dashboard' ? '운영 대시보드' : activeSidebarTab === 'operations'
              ? '실시간 행사 운영 보드'
              : activeSidebarTab === 'quotes'
                ? '가격표 견적기 및 견적서 관리'
                : activeSidebarTab === 'field_knowledge'
                  ? '현장 지식'
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
                            : activeSidebarTab === 'vehicles'
                              ? '차량 관리'
                              : activeSidebarTab === 'drivers'
                                ? '기사 관리'
                                : '실시간 배차 관제'
          }
          subtitle={
            activeSidebarTab === 'operations' ? (
              <span className="text-slate-500 font-medium">
                진행 중인 행사의 차량 위치와 운행 상태를 실시간으로 확인해요
              </span>
            ) : activeSidebarTab === 'quotes' ? (
              <span className="text-slate-500 font-medium">
                사모님 실시간 가격표 견적 산출 및 확정 견적 ➔ 배차 대기함 자동 전환
              </span>
            ) : activeSidebarTab === 'field_knowledge' ? (
              <span className="text-slate-500 font-medium">
                VIP 의전 현장 특이사항, 호텔·공항 진입 동선 및 거점 정보를 관리하고 기사 앱에 실시간 공유합니다.
              </span>
            ) : activeSidebarTab === 'customers' ? (
              <span className="text-slate-500 font-medium">
                주요 고객사의 담당자, 계약 단가, 청구 내역을 한눈에 확인하고 관리합니다.
              </span>
            ) : activeSidebarTab === 'reports' ? (
              <span className="text-slate-500 font-medium">
                고객사 서비스 시간 기준 정산 · 기사 인건비 · 배차별 직접이익 분석 및 리포트
              </span>
            ) : activeSidebarTab === 'vehicles' ? (
              <span className="text-slate-500 font-medium">
                총 20대의 차량이 등록되어 있어요
              </span>
            ) : activeSidebarTab === 'drivers' ? (
              <span className="text-slate-500 font-medium">
                기사 정보를 관리하고, 프로필과 운행 일정을 확인할 수 있습니다.
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
                  예약 접수부터 기사님 배정까지 실시간으로 연결돼요
                </span>
              </>
            )
          }
          searchPlaceholder={
            activeSidebarTab === 'field_knowledge'
              ? '검색어를 입력하세요...'
              : activeSidebarTab === 'customers'
                ? '고객명, 담당자명, 행사명으로 검색하세요...'
                : activeSidebarTab === 'reports'
                  ? '고객사, 행사명, 대행사, 기사명, 차량 검색...'
                  : activeSidebarTab === 'vehicles'
                    ? '차량명이나 번호로 검색'
                    : activeSidebarTab === 'drivers'
                      ? '기사명, 연락처, 거주지 검색...'
                      : activeSidebarTab === 'expenses' || activeSidebarTab === 'receipts'
                      ? '기사명, 차량번호, 상호명 검색...'
                      : activeSidebarTab === 'operations'
                        ? '기사님, 차량번호, 장소로 찾아보세요'
                        : '고객사, 승객명, 예약번호, 기사명, 차량번호 검색...'
          }
        />


        {/* Scrollable Body */}
        <main className="flex-1 p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          {/* Dedicated 고객 이메일 View - persistently mounted for instant switching without re-fetch */}
          <div className={activeSidebarTab === 'emails' ? 'block' : 'hidden'}>
            <HqEmailInboxView
              onSavedServer={() => fetchSharedBookings(true)}
              onCreateBooking={() => {
                fetchSharedBookings(true);
                navigateWorkspace('dispatch');
              }}
            />
          </div>

          {activeSidebarTab === 'emails' ? null : activeSidebarTab === 'dashboard' ? (
            <HqDashboardOverview bookings={bookings} loading={isLoadingBookings} error={syncError} representative={representativeMode} onNavigate={navigateWorkspace} onAssign={openAssignment} />
          ) : activeSidebarTab === 'operations' ? (
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
            <HqOfficialPricingView
              onOpenQuoteModal={(code) => {
                if (code) setSelectedQuoteVehicleCode(code);
                setIsQuoteModalOpen(true);
              }}
              onOpenChauffeurCard={() => setIsChauffeurCardOpen(true)}
            />
          ) : activeSidebarTab === 'field_knowledge' ? (
            <HqFieldKnowledgeView initialSearchQuery={searchQuery} />
          ) : activeSidebarTab === 'driving_logs' ? (
            <HqDrivingLogsView initialSearchQuery={searchQuery} bookings={bookings} />
          ) : activeSidebarTab === 'expenses' || activeSidebarTab === 'receipts' ? (
            <HqExpensesView initialSearchQuery={searchQuery} bookings={bookings} />
          ) : activeSidebarTab === 'customers' ? (
            <HqCustomersView
              initialSearchQuery={searchQuery}
              onOpenSettlementReport={() => navigateWorkspace('reports')}
            />
          ) : activeSidebarTab === 'reports' ? (
            <HqReportsView initialSearchQuery={searchQuery} />
          ) : activeSidebarTab === 'drivers' ? (
            <HqDriversView initialSearchQuery={searchQuery} />
          ) : activeSidebarTab === 'vehicles' ? (
            <HqVehicleManagementView initialSearchQuery={searchQuery} bookings={bookings} />
          ) : (
            <>
              {/* Operations Reservation & Dispatch View */}
              {/* Sync Error Banner (if any) */}
              {syncError && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-white flex items-center justify-between gap-2 shadow-sm">
                      <span>서버 동기화 안내: {syncError}</span>
                      <button
                        type="button"
                        onClick={() => fetchSharedBookings(false)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
                      >
                        재시도
                      </button>
                    </div>
                  )}



                  {/* Main Working Area (Full-width Dispatch Table) */}
                  <section
                    aria-label="예약 대기함 및 배차 확인 현황"
                    className="w-full"
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
                      onAssignDriver={(booking) => {
                        setQuickDispatchBooking(booking);
                        setIsQuickDispatchModalOpen(true);
                      }}
                      onViewBooking={(booking) => {
                        setQuickDispatchBooking(booking);
                        setIsQuickDispatchModalOpen(true);
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
                  </section>

                  {/* Section 3: Live Bottom Summary Cards */}
                  <section
                    aria-label="미확인 배차, 배차 대기함 및 기사 배정 현황"
                    className="hidden lg:grid grid-cols-1 lg:grid-cols-3 gap-5"
                  >
                    <HqUnconfirmedDispatchesCard
                      items={liveUnconfirmedItems}
                      onViewAll={() => setIsAlertDrawerOpen(true)}
                      onSelectItem={(item) => {
                        const target = bookings.find((b) => b.id === item.id);
                        if (target) {
                          setQuickDispatchBooking(target);
                          setIsQuickDispatchModalOpen(true);
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
                      }}
                      onSelectItem={(item) => {
                        const target = bookings.find((b) => b.id === item.id);
                        if (target) {
                          setQuickDispatchBooking(target);
                          setIsQuickDispatchModalOpen(true);
                        }
                      }}
                    />

                    <HqDriverAllocationDonutCard
                      stats={liveDriverStats}
                      onViewAll={() => {
                        setActiveKpiFilter(null);
                        setActiveDispatchTab('today');
                      }}
                    />
                  </section>
                </>
              )}
        </main>
      </div>

      <HqMobileNav activeTab={activeSidebarTab} formOpen={isQuickDispatchModalOpen} actionCount={operationalCounts.totalActionNeeded}
        onNavigate={navigateWorkspace} onQuickBooking={handleOpenQuickPhoneBookingModal} onMenu={() => setIsMobileSidebarOpen(true)} />

      {/* 4-A. Fast Booking & Quick Dispatch Modal (New Booking or Row-Click Edit / Assignment) */}
      {isQuickDispatchModalOpen && (
        <HqQuickDispatch
          isModal
          isOpen={isQuickDispatchModalOpen}
          initialBooking={quickDispatchBooking}
          existingBookings={bookings}
          onClose={() => {
            setIsQuickDispatchModalOpen(false);
            setQuickDispatchBooking(null);
          }}
          onSavedBookings={async () => {
            await fetchSharedBookings(true);
          }}
          onRemindDriver={async (booking) => {
            await handleSendDriverReminder(booking.scheduleId || booking.id);
          }}
          onOpenCustomerMessage={(booking) => {
            setCustomerMsgTarget({
              booking,
              trigger: booking.pendingCustomerTrigger || undefined,
            });
          }}
          onOpenDriverVehicleInfo={(booking) => {
            setInfoModalBooking(booking);
          }}
          onOpenDetailModal={(booking) => {
            setSelectedBooking(booking);
            setBookingModalSection('details');
            setIsDetailModalOpen(true);
          }}
        />
      )}

      {/* 4-A2. Driver & Vehicle Info Modal opened directly from Quick Dispatch */}
      {infoModalBooking && (
        <HqDriverVehicleInfoModal
          key={`${infoModalBooking.scheduleId || infoModalBooking.id}:${infoModalBooking.version}`}
          isOpen={Boolean(infoModalBooking)}
          booking={infoModalBooking}
          onClose={() => setInfoModalBooking(null)}
          onDispatchRecorded={(_status, _synced) => {
            fetchSharedBookings(true);
          }}
        />
      )}

      {/* 4. Interactive Booking Detail, Assignment, Edit & Cancel Modal */}
      <HqBookingDetailModal
        booking={selectedBooking}
        initialSection={bookingModalSection}
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
            setQuickDispatchBooking(found);
            setIsQuickDispatchModalOpen(true);
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
        initialVehicleProductCode={selectedQuoteVehicleCode}
        onClose={() => {
          setIsQuoteModalOpen(false);
          setSelectedQuoteVehicleCode(undefined);
        }}
        onBookingConverted={() => {
          fetchSharedBookings(true);
          navigateWorkspace('dispatch');
        }}
      />

      {/* 6. VIP Chauffeur & Vehicle Introduction Card Modal */}
      <VipChauffeurCardModal
        isOpen={isChauffeurCardOpen}
        onClose={() => setIsChauffeurCardOpen(false)}
      />

      {/* 7. HQ Admin Login Modal (for Preview and Production Auth) */}
      <HqAdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        onLoginSuccess={() => {
          setIsAdminLoginOpen(false);
          fetchSharedBookings(true);
        }}
      />
    </div>
  );
}

export function HqDashboard({ representativeMode = false }: { representativeMode?: boolean }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#F8FAFC] flex items-center justify-center text-slate-400 font-bold text-sm">
          HQ 운영 시스템 로딩 중...
        </div>
      }
    >
      <HqDashboardInner representativeMode={representativeMode} />
    </Suspense>
  );
}
