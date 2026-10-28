'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Car,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  MapPin,
  User,
  History,
  X,
  ShieldAlert,
} from 'lucide-react';
import { OperationStatus } from '@/app/api/schedules/operation-status/route';

interface ScheduleOperationItem {
  id: string;
  eventName: string;
  customerName: string;
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  startDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  pickupLocation: string;
  dropoffLocation: string;
  operationStatus: OperationStatus;
  operationUpdatedAt?: string;
  operationHistory?: Array<{
    fromStatus: string;
    toStatus: string;
    timestamp: string;
    changedBy: string;
    note?: string;
  }>;
  groupId?: string;
  groupName?: string;
  groupTotalVehicles?: number;
  groupVehicleIndex?: number;
}

const STATUS_LABELS: Record<OperationStatus, { label: string; badgeClass: string; step: number }> = {
  ready: { label: '운행 준비', badgeClass: 'bg-slate-700/80 text-slate-200 border-slate-600', step: 1 },
  arrived_pickup: { label: '픽업지 도착', badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40', step: 2 },
  boarded: { label: '승객 탑승', badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', step: 3 },
  in_transit: { label: '이동 중', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse', step: 4 },
  completed: { label: '운행 종료', badgeClass: 'bg-slate-800 text-slate-400 border-slate-700', step: 5 },
};

export const HqOperationsBoard: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleOperationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleOperationItem | null>(null);

  const fetchOperations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/schedules/dispatch?onlyDispatched=true');
      const data = await res.json();
      if (data.ok && Array.isArray(data.schedules)) {
        const mapped: ScheduleOperationItem[] = data.schedules.map((s: any) => ({
          id: s.id,
          eventName: s.event_name || s.eventName || 'VIP 의전 행사',
          customerName: s.customer_name || s.customerName || '고객사',
          driverName: s.driver_name || s.driverName || '미지정',
          driverPhone: s.driver_phone || s.driverPhone || '',
          vehiclePlate: s.vehicle_plate || s.vehiclePlate || '배정 대기',
          vehicleModel: s.vehicle_model || s.vehicleModel || 'Mercedes-Benz Sprinter',
          startDate: s.start_date || s.startDate || '',
          startTime: s.start_time || s.startTime || '09:00',
          endDate: s.end_date || s.endDate || '',
          endTime: s.end_time || s.endTime || '19:00',
          pickupLocation: s.pickup_location || s.pickupLocation || '픽업지',
          dropoffLocation: s.dropoff_location || s.dropoffLocation || '목적지',
          operationStatus: (s.operation_status || s.operationStatus || 'ready') as OperationStatus,
          operationUpdatedAt: s.operation_updated_at || s.operationUpdatedAt,
          operationHistory: s.operation_history || s.operationHistory || [],
          groupId: s.group_id || s.groupId,
          groupName: s.group_name || s.groupName,
          groupTotalVehicles: s.group_total_vehicles || s.groupTotalVehicles || 1,
          groupVehicleIndex: s.group_vehicle_index || s.groupVehicleIndex || 1,
        }));
        setSchedules(mapped);
      }
    } catch (err) {
      console.warn('[HqOperationsBoard] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperations();
    const interval = setInterval(fetchOperations, 20000); // 20s auto-refresh
    return () => clearInterval(interval);
  }, []);

  // Check alert conditions
  const getAlertStatus = (item: ScheduleOperationItem) => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // If today and past pickup time by 15 mins while still 'ready'
    if (item.startDate === todayStr && item.operationStatus === 'ready') {
      const [h, m] = item.startTime.split(':').map(Number);
      const pickupDate = new Date();
      pickupDate.setHours(h || 9, m || 0, 0, 0);
      if (now.getTime() > pickupDate.getTime() + 15 * 60 * 1000) {
        return { type: 'danger', message: '픽업 지연 주의 (아직 미도착)' };
      }
    }

    // If 'in_transit' without update for > 60 mins
    if (item.operationStatus === 'in_transit' && item.operationUpdatedAt) {
      const updatedTime = new Date(item.operationUpdatedAt).getTime();
      if (now.getTime() - updatedTime > 60 * 60 * 1000) {
        return { type: 'warning', message: '장시간 미갱신 (1시간 이상)' };
      }
    }

    return null;
  };

  // Group by event / group
  const groupedEvents: Record<string, ScheduleOperationItem[]> = {};
  schedules.forEach((s) => {
    const key = s.groupId || s.eventName || '기타 운행';
    if (!groupedEvents[key]) groupedEvents[key] = [];
    groupedEvents[key].push(s);
  });

  return (
    <div className="space-y-4">
      {/* Board Header */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              실시간 행사 운영 보드
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                {schedules.length}대 운행 현황
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              대표님 모바일·PC 동시 모니터링 • 기사 5단계 상태 실시간 동기화
            </p>
          </div>
        </div>

        <button
          onClick={fetchOperations}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* Events List */}
      <div className="space-y-4">
        {Object.entries(groupedEvents).map(([groupKey, groupSchedules]) => {
          const first = groupSchedules[0];
          return (
            <div
              key={groupKey}
              className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg"
            >
              {/* Event Header */}
              <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {first.customerName}
                  </span>
                  <h4 className="text-sm font-bold text-white">{first.eventName}</h4>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {first.startDate} ({first.startTime} ~ {first.endTime || '종료시'})
                  </span>
                  <span className="font-semibold text-amber-300">
                    총 {groupSchedules.length}대 배차
                  </span>
                </div>
              </div>

              {/* Vehicles Rows */}
              <div className="divide-y divide-slate-800/80">
                {groupSchedules.map((item, idx) => {
                  const alert = getAlertStatus(item);
                  const statusInfo = STATUS_LABELS[item.operationStatus] || STATUS_LABELS.ready;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedSchedule(item)}
                      className="p-4 hover:bg-slate-800/50 transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      {/* Driver & Vehicle */}
                      <div className="flex items-start md:items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-amber-400 shrink-0">
                          #{item.groupVehicleIndex || idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100 text-sm truncate">
                              {item.driverName} 기사
                            </span>
                            <span className="text-xs text-slate-400 truncate">
                              ({item.vehiclePlate})
                            </span>
                            <span className="text-[11px] text-slate-500 hidden sm:inline truncate">
                              {item.vehicleModel}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="text-slate-300">{item.pickupLocation}</span>
                            <span className="text-slate-600">➔</span>
                            <span className="text-slate-300">{item.dropoffLocation}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Progress Bar & Alerts */}
                      <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end">
                        {/* Alert Pill if any */}
                        {alert && (
                          <div
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 border ${
                              alert.type === 'danger'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {alert.message}
                          </div>
                        )}

                        {/* 5-Step Status Pill */}
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${statusInfo.badgeClass}`}
                          >
                            {statusInfo.label}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {item.operationUpdatedAt
                              ? `${new Date(item.operationUpdatedAt).toLocaleTimeString('ko-KR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })} 갱신`
                              : '대기 중'}
                          </span>
                        </div>

                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {schedules.length === 0 && (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-sm">
            현재 운행 중이거나 확정 배차된 행사가 없습니다.
          </div>
        )}
      </div>

      {/* History Drawer Modal */}
      {selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <div>
                  <h4 className="text-base font-bold text-slate-100">
                    {selectedSchedule.driverName} 기사 운행 상태 이력
                  </h4>
                  <p className="text-xs text-slate-400">
                    {selectedSchedule.vehiclePlate} • {selectedSchedule.eventName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSchedule(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Timeline */}
            <div className="space-y-3 py-2 max-h-80 overflow-y-auto">
              {selectedSchedule.operationHistory && selectedSchedule.operationHistory.length > 0 ? (
                selectedSchedule.operationHistory.map((hist, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs">
                    <div className="w-2 h-2 rounded-full bg-amber-400 mt-1 shrink-0" />
                    <div className="flex-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between items-center text-slate-400 mb-1">
                        <span className="font-semibold text-amber-300">
                          {STATUS_LABELS[hist.toStatus as OperationStatus]?.label || hist.toStatus}
                        </span>
                        <span>{new Date(hist.timestamp).toLocaleTimeString('ko-KR')}</span>
                      </div>
                      <p className="text-slate-300">변경 주체: {hist.changedBy}</p>
                      {hist.note && <p className="text-slate-400 mt-1">{hist.note}</p>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 py-6 text-xs">
                  아직 기록된 상태 변경 이력이 없습니다. 기사 Cockpit에서 운행 상태를 변경하면 실시간 기록됩니다.
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedSchedule(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
