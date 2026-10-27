'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HqSidebar } from '@/components/hq/HqSidebar';
import { HqHeader } from '@/components/hq/HqHeader';
import { HqKpiTiles } from '@/components/hq/HqKpiTiles';
import { HqDispatchTable } from '@/components/hq/HqDispatchTable';
import { HqQuickDispatch } from '@/components/hq/HqQuickDispatch';
import { HqBookingDetailModal } from '@/components/hq/HqBookingDetailModal';
import { HqDrivingLogsView } from '@/components/hq/driving-logs/HqDrivingLogsView';
import { HqExpensesView } from '@/components/hq/expenses/HqExpensesView';
import { HqEmailInboxView } from '@/components/hq/email/HqEmailInboxView';
import { HqUnconfirmedDispatchesCard } from '@/components/hq/dispatch/HqUnconfirmedDispatchesCard';
import { HqUnsentDraftsCard } from '@/components/hq/dispatch/HqUnsentDraftsCard';
import { HqDriverAllocationDonutCard } from '@/components/hq/dispatch/HqDriverAllocationDonutCard';
import {
  HQ_KPI_METRICS,
  INITIAL_HQ_BOOKINGS,
  HQ_UNCONFIRMED_DISPATCHES,
  HQ_UNSENT_DRAFTS,
  HQ_DRIVER_ALLOCATION,
} from '@/utils/hqData';
import { HqBooking } from '@/types/hq';

function HqDashboardInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTabOverride, setActiveTabOverride] = useState<string | null>(null);
  const activeSidebarTab = activeTabOverride ?? tabParam ?? 'dispatch';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDispatchTab, setActiveDispatchTab] = useState<'today' | 'target' | 'tomorrow'>('today');
  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(null);

  // Live editable/created bookings list
  const [bookings, setBookings] = useState<HqBooking[]>(INITIAL_HQ_BOOKINGS);

  // Selected Booking for detail inspection drawer
  const [selectedBooking, setSelectedBooking] = useState<HqBooking | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Handle clicking KPI tile
  const handleSelectKpi = (metricId: string) => {
    if (activeKpiFilter === metricId) {
      setActiveKpiFilter(null);
    } else {
      setActiveKpiFilter(metricId);
      if (metricId === 'kpi_today_total' || metricId === 'kpi_unassigned') {
        setActiveDispatchTab('today');
      }
    }
  };

  // Filter Bookings based on Tab, Search, and KPI Filter
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          b.customerName.toLowerCase().includes(q) ||
          b.bookingNo.toLowerCase().includes(q) ||
          b.driverName.toLowerCase().includes(q) ||
          b.vehicleModel.toLowerCase().includes(q) ||
          (b.vehiclePlate && b.vehiclePlate.toLowerCase().includes(q)) ||
          b.destination.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 2. KPI Filter (if active)
      if (activeKpiFilter === 'kpi_unassigned') {
        return b.dispatchStatus === '미배정';
      }
      if (activeKpiFilter === 'kpi_reconfirm_needed') {
        return b.customerBrochure === '재발송 필요' || b.driverAck === '재확인 필요';
      }
      if (activeKpiFilter === 'kpi_sent_unacknowledged') {
        return b.driverAck === '미확인';
      }

      // 3. Tab filter
      if (activeDispatchTab === 'today') {
        return b.isToday !== false;
      }
      if (activeDispatchTab === 'target') {
        return b.isDispatchTarget === true;
      }
      if (activeDispatchTab === 'tomorrow') {
        return b.isTomorrow === true;
      }

      return true;
    });
  }, [bookings, searchQuery, activeDispatchTab, activeKpiFilter]);

  // Create new booking from Quick Dispatch panel
  const handleCreateBooking = (newBookingData: Partial<HqBooking>, isDraft: boolean) => {
    const newBooking: HqBooking = {
      id: `b-${Date.now()}`,
      bookingNo: `#241024-${String(bookings.length + 1).padStart(3, '0')}`,
      no: bookings.length + 1,
      customerName: newBookingData.customerName || '신규 고객',
      pickupTime: newBookingData.pickupTime || '14:00',
      pickupDate: newBookingData.pickupDate || '2024. 10. 24',
      pickupLocation: newBookingData.pickupLocation || '서울 강남',
      destination: newBookingData.destination || '인천공항 T1',
      driverName: newBookingData.driverName || '-',
      driverPhone: newBookingData.driverPhone,
      vehicleModel: newBookingData.vehicleModel || '차량 미지정',
      vehiclePlate: newBookingData.vehiclePlate || '미배정',
      dispatchStatus: newBookingData.dispatchStatus || (isDraft ? '미배정' : '배차 완료'),
      driverAck: newBookingData.driverAck || (isDraft ? '-' : '미확인'),
      customerBrochure: '미발송',
      isToday: true,
      isDispatchTarget: true,
    };

    setBookings((prev) => [newBooking, ...prev]);
  };

  // Update existing booking from modal
  const handleUpdateBooking = (updated: HqBooking) => {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setSelectedBooking(updated);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans antialiased text-slate-800">
      {/* 1. Left Sidebar Navigation */}
      <HqSidebar
        activeTab={activeSidebarTab}
        onSelectTab={setActiveTabOverride}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Sticky Header */}
        <HqHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          unreadAlertsCount={5}
          title={
            activeSidebarTab === 'driving_logs'
              ? '운행일지 관리'
              : activeSidebarTab === 'expenses'
              ? '경비지출 관리'
              : activeSidebarTab === 'emails'
              ? '고객 이메일'
              : '예약·배차 관리'
          }
          subtitle={
            activeSidebarTab === 'dispatch' || activeSidebarTab === 'dashboard' ? (
              <>
                <span className="font-bold text-slate-700">2026년 10월 26일 (월)</span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-400">업무 현황 · 예약 및 배차 관리</span>
              </>
            ) : undefined
          }
          searchPlaceholder="고객명, 예약번호, 기사명, 차량번호 검색..."
        />

        {/* Dashboard Scrollable Body */}
        <main className="flex-1 p-5 lg:p-6 space-y-5 overflow-y-auto">
          {activeSidebarTab === 'driving_logs' ? (
            /* Dedicated 운행일지 관리 View */
            <HqDrivingLogsView initialSearchQuery={searchQuery} />
          ) : activeSidebarTab === 'expenses' || activeSidebarTab === 'receipts' ? (
            /* Dedicated 경비지출 관리 & 영수증 검수 View */
            <HqExpensesView initialSearchQuery={searchQuery} />
          ) : activeSidebarTab === 'emails' ? (
            /* Dedicated 고객 이메일 (AI) View */
            <HqEmailInboxView
              onCreateBooking={(newBooking) => {
                setBookings((prev) => [newBooking, ...prev]);
                setActiveTabOverride('dispatch');
              }}
            />
          ) : (
            /* Operations Reservation & Dispatch View */
            <>
              {/* Section 1: 7 Top KPI Metric Tiles */}
              <section aria-label="운영 지표 현황">
                <HqKpiTiles
                  metrics={HQ_KPI_METRICS}
                  activeFilter={activeKpiFilter}
                  onSelectMetric={handleSelectKpi}
                />
              </section>

              {/* Section 2: Main Working Area (Left 8 Cols Table + Right 4 Cols Quick Dispatch in 12-col grid) */}
              <section
                aria-label="오늘 및 내일 배차 작업 영역"
                className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start"
              >
                {/* Left ~65% (8 cols): 예약 목록 */}
                <div className="xl:col-span-8">
                  <HqDispatchTable
                    bookings={filteredBookings}
                    activeTab={activeDispatchTab}
                    onSelectTab={setActiveDispatchTab}
                    onOpenNewBooking={() => {
                      setSelectedBooking({
                        id: `new_${Date.now()}`,
                        bookingNo: `#261026-${String(bookings.length + 1).padStart(3, '0')}`,
                        no: bookings.length + 1,
                        customerName: '',
                        pickupTime: '14:00',
                        pickupDate: '2026. 10. 26',
                        pickupLocation: '',
                        destination: '',
                        driverName: '-',
                        vehicleModel: '-',
                        vehiclePlate: '미배정',
                        dispatchStatus: '미배정',
                        driverAck: '-',
                        customerBrochure: '미발송',
                      });
                      setIsDetailModalOpen(true);
                    }}
                    onViewBooking={(booking) => {
                      setSelectedBooking(booking);
                      setIsDetailModalOpen(true);
                    }}
                    onAssignDriver={(booking) => {
                      setSelectedBooking(booking);
                      setIsDetailModalOpen(true);
                    }}
                    onResendBrochure={(booking) => {
                      setSelectedBooking(booking);
                      setIsDetailModalOpen(true);
                    }}
                  />
                </div>

                {/* Right ~35% (4 cols): 빠른 배차 생성 */}
                <div className="xl:col-span-4">
                  <HqQuickDispatch
                    onCreateBooking={handleCreateBooking}
                    onOpenGroupDispatchModal={() => {
                      alert('그룹 배차 관리 드로어가 실행됩니다. (공통 고객/일정/목적지 1회 입력 후 개별 탑승자·기사 다건 추가)');
                    }}
                    onOpenLoadBookingModal={() => {
                      alert('등록된 예약 목록에서 기존 고객 데이터(픽업지, 목적지, 인원)를 불러옵니다.');
                    }}
                  />
                </div>
              </section>

              {/* Section 3: Bottom Panels (3 Cards: 미확인 배차 + 미발송 초안 + 오늘 기사 배정 현황) */}
              <section
                aria-label="미확인 배차, 미발송 초안 및 기사 배정 현황"
                className="grid grid-cols-1 lg:grid-cols-3 gap-5"
              >
                <HqUnconfirmedDispatchesCard
                  items={HQ_UNCONFIRMED_DISPATCHES}
                  onViewAll={() => setActiveDispatchTab('target')}
                  onSelectItem={(item) => {
                    const target = bookings.find((b) => b.customerName === item.customerName);
                    if (target) {
                      setSelectedBooking(target);
                      setIsDetailModalOpen(true);
                    }
                  }}
                />

                <HqUnsentDraftsCard
                  items={HQ_UNSENT_DRAFTS}
                  onViewAll={() => setActiveDispatchTab('target')}
                  onSelectItem={(item) => {
                    const target = bookings.find((b) => b.customerName === item.customerName);
                    if (target) {
                      setSelectedBooking(target);
                      setIsDetailModalOpen(true);
                    }
                  }}
                />

                <HqDriverAllocationDonutCard
                  stats={HQ_DRIVER_ALLOCATION}
                  onViewAll={() => setActiveTabOverride('drivers')}
                />
              </section>
            </>
          )}
        </main>
      </div>

      {/* 3. Interactive Booking Detail & Communication Drawer */}
      <HqBookingDetailModal
        booking={selectedBooking}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onUpdateBooking={handleUpdateBooking}
      />
    </div>
  );
}

export default function HqDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-slate-400 font-bold text-sm">
          HQ 운영 시스템 로딩 중...
        </div>
      }
    >
      <HqDashboardInner />
    </Suspense>
  );
}
