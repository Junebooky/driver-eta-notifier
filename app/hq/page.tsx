'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HqSidebar } from '@/components/hq/HqSidebar';
import { HqHeader } from '@/components/hq/HqHeader';
import { HqKpiTiles } from '@/components/hq/HqKpiTiles';
import { HqDispatchTable } from '@/components/hq/HqDispatchTable';
import { HqQuickDispatch } from '@/components/hq/HqQuickDispatch';
import { HqDrivingLogCard } from '@/components/hq/HqDrivingLogCard';
import { HqExpenseCard } from '@/components/hq/HqExpenseCard';
import { HqFleetCard } from '@/components/hq/HqFleetCard';
import { HqDriverStatusCard } from '@/components/hq/HqDriverStatusCard';
import { HqAlertsCard } from '@/components/hq/HqAlertsCard';
import { HqBookingDetailModal } from '@/components/hq/HqBookingDetailModal';
import { HqDrivingLogsView } from '@/components/hq/driving-logs/HqDrivingLogsView';
import { HqExpensesView } from '@/components/hq/expenses/HqExpensesView';
import { HqCustomersView } from '@/components/hq/clients/HqCustomersView';
import { getHqExpenses, getHqExpenseKpiSummary, HQ_EXPENSE_UPDATE_EVENT } from '@/utils/expenseHqStorage';
import { HqExpenseRecord } from '@/types/expenseHq';
import {
  HQ_KPI_METRICS,
  INITIAL_HQ_BOOKINGS,
  HQ_DRIVING_LOGS,
  HQ_EXPENSES,
  HQ_VEHICLE_CLASSES,
  HQ_ALERTS,
} from '@/utils/hqData';
import { HqBooking } from '@/types/hq';

function HqDashboardInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTabOverride, setActiveTabOverride] = useState<string | null>(null);
  const activeSidebarTab = activeTabOverride ?? tabParam ?? 'dashboard';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDispatchTab, setActiveDispatchTab] = useState<'today' | 'target' | 'tomorrow'>('today');
  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(null);

  // Live editable/created bookings list
  const [bookings, setBookings] = useState<HqBooking[]>(INITIAL_HQ_BOOKINGS);

  // Selected Booking for detail inspection drawer
  const [selectedBooking, setSelectedBooking] = useState<HqBooking | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Dynamic live HQ Expenses from storage
  const [hqExpenses, setHqExpenses] = useState<HqExpenseRecord[]>(() => getHqExpenses());
  useEffect(() => {
    const handleUpdate = () => {
      setHqExpenses(getHqExpenses());
    };
    window.addEventListener(HQ_EXPENSE_UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(HQ_EXPENSE_UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const hqExpenseKpi = useMemo(() => getHqExpenseKpiSummary(hqExpenses), [hqExpenses]);

  const mappedExpensesForCard = useMemo(() => {
    return hqExpenses.slice(0, 4).map((e) => ({
      id: e.id,
      submittedAt: e.submittedAt,
      driverName: e.driverName,
      category: (['주유비', '통행료', '주차비', '식비'].includes(e.categoryLabel)
        ? e.categoryLabel
        : '기타') as HqBooking extends never ? never : '주유비' | '통행료' | '주차비' | '식비' | '기타',
      amount: e.amount,
      status: e.status,
      hasReceiptImage: e.hasReceiptImage,
    }));
  }, [hqExpenses]);

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
        onSelectTab={(tab) => {
          setSearchQuery('');
          setActiveTabOverride(tab);
        }}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Sticky Header */}
        <HqHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          unreadAlertsCount={12}
          title={activeSidebarTab === 'clients' ? '고객 관리' : activeSidebarTab === 'driving_logs' ? '운행일지 관리' : '운영 대시보드'}
          subtitle={
            activeSidebarTab === 'driving_logs' ? (
              <>
                <span className="font-bold text-slate-700">2024년 10월 24일 (목)</span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">기사별 운행일지를 확인하고 검토·승인할 수 있습니다.</span>
              </>
            ) : undefined
          }
          searchPlaceholder={
            activeSidebarTab === 'clients'
              ? '고객사·담당자·예약번호 검색'
              : activeSidebarTab === 'driving_logs'
                ? '고객명, 기사명, 차량번호로 검색하세요...'
                : '고객명, 예약번호, 기사명, 차량번호로...'
          }
        />

        {/* Dashboard Scrollable Body */}
        <main className="flex-1 p-5 lg:p-6 space-y-5 overflow-y-auto">
          {activeSidebarTab === 'clients' ? (
            /* Customer 360 CRM UI shell — no real client data, email or backend linkage */
            <HqCustomersView search={searchQuery} onSearchChange={setSearchQuery} />
          ) : activeSidebarTab === 'driving_logs' ? (
            /* Dedicated 운행일지 관리 View */
            <HqDrivingLogsView initialSearchQuery={searchQuery} />
          ) : activeSidebarTab === 'expenses' || activeSidebarTab === 'receipts' ? (
            /* Dedicated 경비지출 관리 & 영수증 검수 View */
            <HqExpensesView initialSearchQuery={searchQuery} />
          ) : (
            /* Operations Dashboard View */
            <>
              {/* Section 1: 7 Top KPI Metric Tiles */}
              <section aria-label="운영 지표 현황">
                <HqKpiTiles
                  metrics={HQ_KPI_METRICS}
                  activeFilter={activeKpiFilter}
                  onSelectMetric={handleSelectKpi}
                />
              </section>

              {/* Section 2: Main Working Area (Left ~2/3 Table + Right ~1/3 Quick Dispatch) */}
              <section
                aria-label="오늘 및 내일 배차 작업 영역"
                className="grid grid-cols-1 xl:grid-cols-3 gap-5"
              >
                {/* Left 2 Columns: 오늘 / 내일 배차 현황 */}
                <div className="xl:col-span-2">
                  <HqDispatchTable
                    bookings={filteredBookings.slice(0, 8)}
                    activeTab={activeDispatchTab}
                    onSelectTab={setActiveDispatchTab}
                    onOpenNewBooking={() => {
                      setSelectedBooking({
                        id: `new_${Date.now()}`,
                        bookingNo: `#241024-${String(bookings.length + 1).padStart(3, '0')}`,
                        no: bookings.length + 1,
                        customerName: '',
                        pickupTime: '14:00',
                        pickupDate: '2024. 10. 24',
                        pickupLocation: '',
                        destination: '',
                        driverName: '-',
                        vehicleModel: 'S클래스',
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

                {/* Right 1 Column: 빠른 배차 생성 */}
                <div className="xl:col-span-1">
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

              {/* Section 3: Lower Panels (3 Cards: 운행일지 검토 + 경비지출/영수증 + 차량 운영 현황) */}
              <section
                aria-label="검토 및 자산 운영 현황"
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
              >
                <HqDrivingLogCard
                  logs={HQ_DRIVING_LOGS}
                  onViewAll={() => setActiveTabOverride('driving_logs')}
                  onSelectLog={(log) => {
                    setActiveTabOverride('driving_logs');
                    setSearchQuery(log.driverName);
                  }}
                />

                <HqExpenseCard
                  expenses={mappedExpensesForCard.length > 0 ? mappedExpensesForCard : HQ_EXPENSES}
                  todayTotalExpense={hqExpenseKpi.todayTotal}
                  monthTotalExpense={hqExpenseKpi.monthTotal}
                  pendingReceiptsCount={hqExpenseKpi.pendingCount}
                  onViewAll={() => setActiveTabOverride('expenses')}
                  onSelectExpense={(item) => {
                    setActiveTabOverride('expenses');
                    setSearchQuery(item.driverName);
                  }}
                />

                <HqFleetCard
                  vehicleClasses={HQ_VEHICLE_CLASSES}
                  onViewAll={() => setActiveTabOverride('vehicles')}
                  onSelectClass={(v) => {
                    alert(`${v.className} 차고지 현황: ${v.activeCount}/${v.totalCount}대 운행 중 (예약 가능: ${v.availableCount}대)`);
                  }}
                />
              </section>

              {/* Section 4: Bottom Panels (2 Cards: 기사 현황 + 알림/후속 조치) */}
              <section
                aria-label="기사 상태 및 알림 후속 조치"
                className="grid grid-cols-1 lg:grid-cols-2 gap-5"
              >
                <HqDriverStatusCard
                  onViewAll={() => setActiveTabOverride('drivers')}
                />

                <HqAlertsCard
                  alerts={HQ_ALERTS}
                  onViewAll={() => setActiveTabOverride('settings')}
                  onAction={(alertItem) => {
                    const targetBooking = bookings.find((b) => b.bookingNo === alertItem.bookingNo);
                    if (targetBooking) {
                      setSelectedBooking(targetBooking);
                      setIsDetailModalOpen(true);
                    } else {
                      alert(`알림 조치: ${alertItem.message}`);
                    }
                  }}
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
