'use client';

import { useReportingRefresh } from '@/hooks/useReportingRefresh';
import React, { useState, useMemo, useSyncExternalStore } from 'react';
import {
  HqDrivingLogStatus,
} from '@/types/drivingLogHq';
import {
  subscribeHqDrivingLogs,
  getHqDrivingLogsSnapshot,
  getHqDrivingLogsServerSnapshot,
  updateHqDrivingLogStatus,
  updateHqDrivingLogStatusDb,
  fetchHqDrivingLogsFromDb,
  exportDrivingLogsToCsv,
} from '@/utils/drivingLogHqStorage';
import { HqDrivingLogsKpi } from './HqDrivingLogsKpi';
import { HqDrivingLogsFilterBar } from './HqDrivingLogsFilterBar';
import { HqDrivingLogsTable } from './HqDrivingLogsTable';
import { HqDrivingLogDetailPanel } from './HqDrivingLogDetailPanel';
import { CheckCircle2, CreditCard, AlertCircle, RotateCw } from 'lucide-react';
import { HqBooking } from '@/types/hq';
import HqHipassImportModal from '../expenses/HqHipassImportModal';

export interface HqDrivingLogsViewProps {
  initialSearchQuery?: string;
  bookings?: HqBooking[];
}

export const HqDrivingLogsView: React.FC<HqDrivingLogsViewProps> = ({
  initialSearchQuery = '',
  bookings = [],
}) => {
  const [isHipassModalOpen, setIsHipassModalOpen] = useState(false);
  // Master logs list via useSyncExternalStore (SSR and Hydration safe)
  const logs = useSyncExternalStore(
    subscribeHqDrivingLogs,
    getHqDrivingLogsSnapshot,
    getHqDrivingLogsServerSnapshot
  );
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const {error:dbError,refreshing:isRefreshing,refresh:handleRefreshLogs}=useReportingRefresh(fetchHqDrivingLogsFromDb);

  // Filters
  const [dateRange] = useState('전체 기간');
  const [selectedDriver, setSelectedDriver] = useState<string>('전체');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('전체');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('전체');
  const [selectedStatus, setSelectedStatus] = useState<HqDrivingLogStatus | '전체'>('전체');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);

  // Pagination
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Derived filter options
  const driverOptions = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.driverName))).filter(Boolean);
  }, [logs]);

  const vehicleOptions = useMemo(() => {
    return Array.from(
      new Set(logs.map((l) => (l.vehiclePlate ? `${l.vehiclePlate} · ${l.vehicleModel}` : l.vehicleModel)))
    ).filter(Boolean);
  }, [logs]);

  const customerOptions = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.customerName))).filter(Boolean);
  }, [logs]);

  // Dynamic KPI counts
  const kpiCounts = useMemo(() => {
    const inProgressDrafts = logs.filter((l) => l.status === 'draft').length;
    const pending = logs.filter((l) => l.status === '검토 대기').length;
    const approved = logs.filter((l) => l.status === '승인 완료').length;
    const revision = logs.filter((l) => l.status === '보완 필요').length;
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const totalToday = logs.filter(log=>log.rawDate===today && log.status!=='draft').length;

    return {
      totalToday,
      inProgressDrafts,
      pending,
      approved,
      revision,
    };
  }, [logs]);

  // Filter logs based on user selections
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Status Filter
      if (selectedStatus !== '전체' && log.status !== selectedStatus) {
        return false;
      }

      // 2. Driver Filter
      if (selectedDriver !== '전체' && log.driverName !== selectedDriver) {
        return false;
      }

      // 3. Vehicle Filter
      if (selectedVehicle !== '전체') {
        const matchesV =
          log.vehicleModel === selectedVehicle ||
          log.vehiclePlate === selectedVehicle ||
          `${log.vehiclePlate} · ${log.vehicleModel}` === selectedVehicle ||
          selectedVehicle.includes(log.vehiclePlate);
        if (!matchesV) return false;
      }

      // 4. Customer Filter
      if (selectedCustomer !== '전체' && log.customerName !== selectedCustomer) {
        return false;
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          log.driverName.toLowerCase().includes(q) ||
          log.customerName.toLowerCase().includes(q) ||
          log.vehicleModel.toLowerCase().includes(q) ||
          log.vehiclePlate.toLowerCase().includes(q) ||
          log.stops.some((s) => s.place.toLowerCase().includes(q) || (s.note && s.note.toLowerCase().includes(q)));
        if (!matches) return false;
      }

      return true;
    });
  }, [logs, selectedStatus, selectedDriver, selectedVehicle, selectedCustomer, searchQuery]);

  // Paginated logs
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Selected Log Object
  const selectedLog = useMemo(() => {
    return logs.find((l) => l.id === selectedLogId) || filteredLogs[0] || null;
  }, [logs, selectedLogId, filteredLogs]);

  // Status Action Handlers (strictly syncs to DB)
  const handleApprove = async (logId: string) => {
    const ok = await updateHqDrivingLogStatusDb(logId, '승인 완료');
    if (!ok) {
      updateHqDrivingLogStatus(logId, '승인 완료');
    }
    const target = logs.find((l) => l.id === logId);
    showToast(`${target?.driverName || '해당'} 기사의 운행일지가 승인 완료되었습니다.`);
  };

  const handleRequestRevision = async (logId: string, reason: string) => {
    const ok = await updateHqDrivingLogStatusDb(logId, '보완 필요', reason);
    if (!ok) {
      updateHqDrivingLogStatus(logId, '보완 필요', reason);
    }
    const target = logs.find((l) => l.id === logId);
    showToast(`${target?.driverName || '해당'} 기사에게 보완 요청을 전송했습니다.`);
  };

  const handleReject = async (logId: string, reason: string) => {
    const ok = await updateHqDrivingLogStatusDb(logId, '반려', reason);
    if (!ok) {
      updateHqDrivingLogStatus(logId, '반려', reason);
    }
    const target = logs.find((l) => l.id === logId);
    showToast(`${target?.driverName || '해당'} 기사의 운행일지가 반려 처리되었습니다.`);
  };

  const handleExportExcel = () => {
    exportDrivingLogsToCsv(filteredLogs);
    showToast(`총 ${filteredLogs.length}건의 운행일지 데이터가 엑셀로 다운로드되었습니다.`);
  };

  return (
    <div className="space-y-5">
      {/* DB Connection / Query Failure Banner */}
      {dbError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-800 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>운행일지 실시간 DB 조회 실패: {dbError}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleRefreshLogs();
            }}
            className="text-xs font-bold text-rose-700 bg-white border border-rose-200 px-3 py-1.5 rounded-xl hover:bg-rose-100 transition shrink-0 cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Real-time Status & Manual Refresh Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">
            실시간 연동 운행일지 ({logs.length}건)
          </span>
          {kpiCounts.inProgressDrafts > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              진행 중 초안 {kpiCounts.inProgressDrafts}건
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefreshLogs}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-50"
          title="Supabase 실시간 운행일지 새로고침"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1E60F3]' : 'text-slate-500'}`} />
          <span>새로고침</span>
        </button>
      </div>

      {/* Hi-Pass Auto-Link Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3">
        <div className="text-xs text-slate-700">
          <span className="font-extrabold text-emerald-900">하이패스 통행료 자동 연결:</span>{' '}
          차량별 하이패스 CSV·엑셀 내역을 불러오면 해당 날짜 운행일지의 지출 합계와 경비 내역에 자동 반영됩니다.
        </div>
        <button
          type="button"
          onClick={() => setIsHipassModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs cursor-pointer"
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>하이패스 통행료 가져오기</span>
        </button>
      </div>

      {/* 1. Top 4 KPI Metric Cards */}
      <HqDrivingLogsKpi
        todaySubmittedCount={kpiCounts.totalToday}
        pendingCount={kpiCounts.pending}
        approvedCount={kpiCounts.approved}
        revisionNeededCount={kpiCounts.revision}
        activeStatusFilter={selectedStatus}
        onSelectStatusFilter={(status) => {
          setSelectedStatus(status);
          setCurrentPage(1);
        }}
      />

      {/* 2. Filter Bar */}
      <HqDrivingLogsFilterBar
        dateRange={dateRange}
        driverOptions={driverOptions}
        selectedDriver={selectedDriver}
        onSelectDriver={(d) => {
          setSelectedDriver(d);
          setCurrentPage(1);
        }}
        vehicleOptions={vehicleOptions}
        selectedVehicle={selectedVehicle}
        onSelectVehicle={(v) => {
          setSelectedVehicle(v);
          setCurrentPage(1);
        }}
        customerOptions={customerOptions}
        selectedCustomer={selectedCustomer}
        onSelectCustomer={(c) => {
          setSelectedCustomer(c);
          setCurrentPage(1);
        }}
        selectedStatus={selectedStatus}
        onSelectStatus={(s) => {
          setSelectedStatus(s);
          setCurrentPage(1);
        }}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setCurrentPage(1);
        }}
        onExportExcel={handleExportExcel}
      />

      {/* 3. Main Working Area: Left Table (60-65%) + Right Detail Panel (35-40%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left Column: 운행일지 목록 Table */}
        <div className="xl:col-span-8">
          <HqDrivingLogsTable
            logs={paginatedLogs}
            totalCount={filteredLogs.length}
            selectedLogId={selectedLog?.id || null}
            onSelectLog={(log) => setSelectedLogId(log.id)}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        </div>

        {/* Right Column: 선택된 운행일지 상세 정보 Panel */}
        <div className="xl:col-span-4 sticky top-20">
          <HqDrivingLogDetailPanel
            log={selectedLog}
            onApprove={handleApprove}
            onRequestRevision={handleRequestRevision}
            onReject={handleReject}
          />
        </div>
      </div>

      <HqHipassImportModal
        isOpen={isHipassModalOpen}
        bookings={bookings}
        onClose={() => setIsHipassModalOpen(false)}
        onImported={(summary) => {
          showToast(
            `하이패스 통행료 ${summary.addedCount}건(₩${summary.totalAmount.toLocaleString()})이 운행일지·경비에 연결되었습니다.`
          );
        }}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/90 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
