'use client';

import React, { useState, useMemo, useSyncExternalStore } from 'react';
import {
  HqDrivingLogStatus,
} from '@/types/drivingLogHq';
import {
  subscribeHqDrivingLogs,
  getHqDrivingLogsSnapshot,
  getHqDrivingLogsServerSnapshot,
  updateHqDrivingLogStatus,
  exportDrivingLogsToCsv,
} from '@/utils/drivingLogHqStorage';
import { HqDrivingLogsKpi } from './HqDrivingLogsKpi';
import { HqDrivingLogsFilterBar } from './HqDrivingLogsFilterBar';
import { HqDrivingLogsTable } from './HqDrivingLogsTable';
import { HqDrivingLogDetailPanel } from './HqDrivingLogDetailPanel';
import { CheckCircle2 } from 'lucide-react';

export interface HqDrivingLogsViewProps {
  initialSearchQuery?: string;
}

export const HqDrivingLogsView: React.FC<HqDrivingLogsViewProps> = ({
  initialSearchQuery = '',
}) => {
  // Master logs list via useSyncExternalStore (SSR and Hydration safe)
  const logs = useSyncExternalStore(
    subscribeHqDrivingLogs,
    getHqDrivingLogsSnapshot,
    getHqDrivingLogsServerSnapshot
  );
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Filters
  const [dateRange] = useState('2024. 10. 24 (목) ~ 2024. 10. 24 (목)');
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
    return Array.from(new Set(logs.map((l) => l.vehicleModel))).filter(Boolean);
  }, [logs]);

  const customerOptions = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.customerName))).filter(Boolean);
  }, [logs]);

  // Dynamic KPI counts
  const kpiCounts = useMemo(() => {
    const pending = logs.filter((l) => l.status === '검토 대기').length;
    const approved = logs.filter((l) => l.status === '승인 완료').length;
    const revision = logs.filter((l) => l.status === '보완 필요').length;
    const totalToday = logs.length;

    return {
      totalToday,
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
      if (selectedVehicle !== '전체' && log.vehicleModel !== selectedVehicle) {
        return false;
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

  // Status Action Handlers
  const handleApprove = (logId: string) => {
    const updated = updateHqDrivingLogStatus(logId, '승인 완료');
    const target = updated.find((l) => l.id === logId);
    showToast(`${target?.driverName || '해당'} 기사의 운행일지가 승인 완료되었습니다.`);
  };

  const handleRequestRevision = (logId: string, reason: string) => {
    const updated = updateHqDrivingLogStatus(logId, '보완 필요', reason);
    const target = updated.find((l) => l.id === logId);
    showToast(`${target?.driverName || '해당'} 기사에게 보완 요청을 전송했습니다.`);
  };

  const handleReject = (logId: string, reason: string) => {
    const updated = updateHqDrivingLogStatus(logId, '반려', reason);
    const target = updated.find((l) => l.id === logId);
    showToast(`${target?.driverName || '해당'} 기사의 운행일지가 반려 처리되었습니다.`);
  };

  const handleExportExcel = () => {
    exportDrivingLogsToCsv(filteredLogs);
    showToast(`총 ${filteredLogs.length}건의 운행일지 데이터가 엑셀로 다운로드되었습니다.`);
  };

  return (
    <div className="space-y-5">
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
