'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Car,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MapPin,
  History,
  X,
  Send,
  Calendar,
  Users,
  Play,
  Check,
  ExternalLink,
  Filter,
  Search,
} from 'lucide-react';
import { OperationStatus } from '@/app/api/schedules/operation-status/route';
import { CustomerNotificationTrigger } from '@/types/hq';
import { ensureClientAuth } from '@/utils/cockpitClientAuth';
import { haptics } from '@/utils/haptics';

export interface HqOperationsBoardProps {
  onOpenCustomerMessageForSchedule?: (
    scheduleId: string,
    trigger?: CustomerNotificationTrigger
  ) => void;
}

export interface ScheduleOperationItem {
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
  pendingCustomerTrigger?: CustomerNotificationTrigger | null;
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

export interface EventGroup {
  id: string;
  customerTag: string;
  eventName: string;
  dateDisplay: string;
  timeDisplay: string;
  routeSummary: string;
  schedules: ScheduleOperationItem[];
}

const STATUS_CONFIG: Record<
  OperationStatus,
  { label: string; badgeClass: string; icon: React.FC<{ className?: string }> }
> = {
  ready: {
    label: '운행 준비',
    badgeClass: 'bg-blue-50/70 text-blue-600 border-blue-200/80',
    icon: Play,
  },
  arrived_pickup: {
    label: '픽업지 도착',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/80',
    icon: MapPin,
  },
  boarded: {
    label: '승객 탑승',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    icon: Users,
  },
  in_transit: {
    label: '운행 중',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    icon: Car,
  },
  completed: {
    label: '운행 종료',
    badgeClass: 'bg-slate-100 text-slate-500 border-slate-200/80',
    icon: Check,
  },
};

// Clean duplicate driver titles (e.g. 'QA 테스트 기사 기사' -> 'QA 테스트 기사')
export function formatDriverTitle(name?: string): string {
  if (!name || name === '미지정') return '미지정 기사';
  const trimmed = name.trim();
  if (trimmed.endsWith('기사')) return trimmed;
  return `${trimmed} 기사`;
}

// Reference events data matching official VIP Limousine Korea real operational structure
const DEFAULT_OPERATIONAL_EVENTS: EventGroup[] = [
  {
    id: 'grp-vip-event',
    customerTag: '고객사',
    eventName: 'VIP 의전 행사',
    dateDisplay: '2026-09-17 (목)',
    timeDisplay: '09:50 ~ 19:00',
    routeSummary: '인천공항 T1 · T2 / 조선팰리스 강남 / 인제스피디움 호텔 외',
    schedules: [
      {
        id: 'sch-vip-01',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '윤태준',
        driverPhone: '010-8842-1920',
        vehiclePlate: '142호 7811',
        vehicleModel: 'Mercedes-Benz Sprinter',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '인천공항 T1',
        dropoffLocation: '조선팰리스 강남',
        operationStatus: 'ready',
        operationUpdatedAt: '오후 03:34',
        groupVehicleIndex: 1,
      },
      {
        id: 'sch-vip-02',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '배선만',
        driverPhone: '010-3341-2940',
        vehiclePlate: '142호 7814',
        vehicleModel: 'Mercedes-Benz Sprinter',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '인천공항 T2',
        dropoffLocation: '인제스피디움 호텔',
        operationStatus: 'ready',
        operationUpdatedAt: '오후 03:34',
        groupVehicleIndex: 2,
      },
      {
        id: 'sch-vip-03',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '민성호',
        driverPhone: '010-5542-1928',
        vehiclePlate: '142호 7815',
        vehicleModel: 'Mercedes-Benz Sprinter',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '조선팰리스 강남',
        dropoffLocation: '인제스피디움 호텔',
        operationStatus: 'ready',
        operationUpdatedAt: '오후 03:34',
        groupVehicleIndex: 3,
      },
      {
        id: 'sch-vip-04',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '윤태준',
        driverPhone: '010-8842-1920',
        vehiclePlate: '142호 7811',
        vehicleModel: 'Mercedes-Benz Sprinter',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '조선팰리스 강남',
        dropoffLocation: '인제스피디움 호텔',
        operationStatus: 'ready',
        operationUpdatedAt: '오후 03:34',
        groupVehicleIndex: 4,
      },
      {
        id: 'sch-vip-05',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '미지정',
        driverPhone: '',
        vehiclePlate: '6호차',
        vehicleModel: 'Mercedes-Benz Sprinter',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '안다즈 서울 강남 (ANDAZ SEOUL GANGNAM)',
        dropoffLocation: '인제스피디움 호텔',
        operationStatus: 'ready',
        operationUpdatedAt: '오후 03:34',
        groupVehicleIndex: 5,
      },
      {
        id: 'sch-vip-06',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '김민수',
        driverPhone: '010-3829-4821',
        vehiclePlate: '01호 3343',
        vehicleModel: '벤츠 S560',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '인천공항 T1',
        dropoffLocation: '포시즌스 호텔 서울',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 03:30',
        groupVehicleIndex: 6,
      },
      {
        id: 'sch-vip-07',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '이재훈',
        driverPhone: '010-9182-3746',
        vehiclePlate: '193호 5336',
        vehicleModel: '기아 카니발 하이리무진',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '김포공항',
        dropoffLocation: '신라호텔 서울',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 03:25',
        groupVehicleIndex: 7,
      },
      {
        id: 'sch-vip-08',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '박서연',
        driverPhone: '010-7281-9304',
        vehiclePlate: '102부 4280',
        vehicleModel: '제네시스 G90 리무진',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '그랜드 하얏트 서울',
        dropoffLocation: '코엑스 인터컨티넨탈',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 03:20',
        groupVehicleIndex: 8,
      },
      {
        id: 'sch-vip-09',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '정태훈',
        driverPhone: '010-5542-1928',
        vehiclePlate: '703서 2658',
        vehicleModel: '벤츠 스프린터 519 CDI',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '인천공항 T2',
        dropoffLocation: '파라다이스시티',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 03:15',
        groupVehicleIndex: 9,
      },
      {
        id: 'sch-vip-10',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '최영식',
        driverPhone: '010-2341-9876',
        vehiclePlate: '125호 9982',
        vehicleModel: '벤츠 스프린터 투어러',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '롯데호텔 월드',
        dropoffLocation: '워커힐 호텔',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 03:10',
        groupVehicleIndex: 10,
      },
      {
        id: 'sch-vip-11',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '이준호',
        driverPhone: '010-8831-2940',
        vehiclePlate: '203호 5947',
        vehicleModel: '제네시스 GV80',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '여의도 콘래드',
        dropoffLocation: '판교 테크노밸리',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 03:05',
        groupVehicleIndex: 11,
      },
      {
        id: 'sch-vip-12',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '한지훈',
        driverPhone: '010-4491-8832',
        vehiclePlate: '116허 1514',
        vehicleModel: '현대 스타리아 리무진',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '서울역',
        dropoffLocation: '파크 하얏트 서울',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 03:00',
        groupVehicleIndex: 12,
      },
      {
        id: 'sch-vip-13',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '강동원',
        driverPhone: '010-7712-4411',
        vehiclePlate: '105호 8821',
        vehicleModel: '벤츠 스프린터 319 CDI',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '인천공항 T1',
        dropoffLocation: '동대문 DDP',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 02:55',
        groupVehicleIndex: 13,
      },
      {
        id: 'sch-vip-14',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '송중기',
        driverPhone: '010-9921-3310',
        vehiclePlate: '112호 4492',
        vehicleModel: '제네시스 G90',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '코엑스',
        dropoffLocation: '인천공항 T2',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 02:50',
        groupVehicleIndex: 14,
      },
      {
        id: 'sch-vip-15',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '조인성',
        driverPhone: '010-8812-7744',
        vehiclePlate: '118호 7731',
        vehicleModel: '벤츠 S560',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '신라호텔',
        dropoffLocation: '김포공항 비즈니스 터미널',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 02:45',
        groupVehicleIndex: 15,
      },
      {
        id: 'sch-vip-16',
        eventName: 'VIP 의전 행사',
        customerName: '고객사',
        driverName: '공유',
        driverPhone: '010-6644-2211',
        vehiclePlate: '124호 6653',
        vehicleModel: '현대 스타리아 라운지',
        startDate: '2026-09-17',
        startTime: '09:50',
        endDate: '2026-09-17',
        endTime: '19:00',
        pickupLocation: '인제스피디움',
        dropoffLocation: '인천공항 T1',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 02:40',
        groupVehicleIndex: 16,
      },
    ],
  },
  {
    id: 'grp-chanel-event',
    customerTag: 'CHANEL',
    eventName: 'CHANEL VIP 의전',
    dateDisplay: '2026-11-04 (화)',
    timeDisplay: '09:00 ~ 21:00',
    routeSummary: '인천국제공항 제1여객터미널 입국장 ➔ 뜨락 신관',
    schedules: [
      {
        id: 'sch-chanel-01',
        eventName: 'CHANEL VIP 의전',
        customerName: 'CHANEL',
        driverName: 'QA 테스트 기사',
        driverPhone: '010-3342-9910',
        vehiclePlate: '116호 1336',
        vehicleModel: '제네시스 G90L',
        startDate: '2026-11-04',
        startTime: '09:00',
        endDate: '2026-11-04',
        endTime: '21:00',
        pickupLocation: '인천국제공항 제1여객터미널 입국장',
        dropoffLocation: '뜨락 신관',
        operationStatus: 'in_transit',
        operationUpdatedAt: '오후 07:17',
        groupVehicleIndex: 1,
      },
    ],
  },
];

export const HqOperationsBoard: React.FC<HqOperationsBoardProps> = ({
  onOpenCustomerMessageForSchedule,
}) => {
  const [eventGroups, setEventGroups] = useState<EventGroup[]>(DEFAULT_OPERATIONAL_EVENTS);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState('09:58');
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleOperationItem | null>(null);
  const [selectedEventInfo, setSelectedEventInfo] = useState<EventGroup | null>(null);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<'all' | 'running' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Accordion open/collapse states (keyed by eventGroup id)
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({
    'grp-vip-event': true,
    'grp-chanel-event': true,
  });

  // Progressive disclosure: show all vehicles toggle for large events
  const [showAllVehicles, setShowAllVehicles] = useState<Record<string, boolean>>({});

  const fetchOperations = async () => {
    setIsLoading(true);
    try {
      await ensureClientAuth('hq');
      const res = await fetch('/api/schedules/dispatch?onlyDispatched=true');
      const data = await res.json();

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      setLastUpdatedTime(timeStr);

      if (data.ok && Array.isArray(data.schedules) && data.schedules.length > 0) {
        // Map server schedules to ScheduleOperationItem
        const serverMapped: ScheduleOperationItem[] = data.schedules.map((s: any, idx: number) => ({
          id: s.id,
          eventName: s.event_name || s.eventName || 'VIP 의전 행사',
          customerName: s.customer_name || s.customerName || '고객사',
          driverName: s.driver_name || s.driverName || '미지정',
          driverPhone: s.driver_phone || s.driverPhone || '',
          vehiclePlate: s.vehicle_plate || s.vehiclePlate || '배정 대기',
          vehicleModel: s.vehicle_model || s.vehicleModel || 'Mercedes-Benz Sprinter',
          startDate: s.date || s.start_date || s.startDate || '2026-11-03',
          startTime: s.pickup_time || s.start_time || s.startTime || '09:00',
          endDate: s.end_date || s.endDate || s.date || '',
          endTime: s.end_time || s.endTime || '19:00',
          pickupLocation: s.origin_name || s.origin || s.pickup_location || s.pickupLocation || '출발지',
          dropoffLocation: s.destination_name || s.destination || s.dropoff_location || s.dropoffLocation || '도착지',
          operationStatus: (s.operation_status || s.operationStatus || 'ready') as OperationStatus,
          operationUpdatedAt: s.operation_updated_at ? new Date(s.operation_updated_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '오후 03:34',
          pendingCustomerTrigger: s.pending_customer_trigger ?? null,
          operationHistory: s.operation_history || s.operationHistory || [],
          groupId: s.group_id || s.groupId,
          groupName: s.group_name || s.groupName,
          groupTotalVehicles: s.group_total_vehicles || s.groupTotalVehicles || 1,
          groupVehicleIndex: s.group_vehicle_index || s.groupVehicleIndex || idx + 1,
        }));

        // Group server schedules by event
        const groupsMap: Record<string, ScheduleOperationItem[]> = {};
        serverMapped.forEach((item) => {
          const key = item.groupId || item.eventName || '기타 행사';
          if (!groupsMap[key]) groupsMap[key] = [];
          groupsMap[key].push(item);
        });

        const newGroups: EventGroup[] = Object.entries(groupsMap).map(([key, items]) => {
          const first = items[0];
          return {
            id: key,
            customerTag: first.customerName || '고객사',
            eventName: first.eventName,
            dateDisplay: first.startDate,
            timeDisplay: `${first.startTime} ~ ${first.endTime || '종료시'}`,
            routeSummary: `${first.pickupLocation} ➔ ${first.dropoffLocation}`,
            schedules: items,
          };
        });

        if (newGroups.length > 0) {
          setEventGroups(newGroups);
        }
      }
    } catch (err) {
      console.warn('[HqOperationsBoard] Live sync notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperations();
    const interval = setInterval(fetchOperations, 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute 5-KPI metrics from current event groups
  const allSchedules = useMemo(() => {
    return eventGroups.flatMap((g) => g.schedules);
  }, [eventGroups]);

  const kpiStats = useMemo(() => {
    const totalEvents = eventGroups.length;
    const totalVehicles = allSchedules.length;
    const inTransit = allSchedules.filter((s) => s.operationStatus === 'in_transit').length;
    const ready = allSchedules.filter((s) => s.operationStatus === 'ready').length;
    const completed = allSchedules.filter((s) => s.operationStatus === 'completed').length;
    const progressRate = totalVehicles > 0 ? Math.round((inTransit / totalVehicles) * 100) : 0;

    return {
      totalEvents,
      totalVehicles,
      inTransit,
      ready,
      completed,
      progressRate,
    };
  }, [eventGroups, allSchedules]);

  // Filtered event groups
  const filteredGroups = useMemo(() => {
    return eventGroups
      .map((grp) => {
        // Tab filter
        const hasRunning = grp.schedules.some(
          (s) => s.operationStatus === 'in_transit' || s.operationStatus === 'ready' || s.operationStatus === 'boarded'
        );
        if (activeTab === 'running' && !hasRunning) return null;
        if (activeTab === 'closed' && hasRunning) return null;

        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const matchesEvent =
            grp.eventName.toLowerCase().includes(q) ||
            grp.customerTag.toLowerCase().includes(q) ||
            grp.routeSummary.toLowerCase().includes(q);

          const matchedSchedules = grp.schedules.filter((s) => {
            return (
              (s.driverName && s.driverName.toLowerCase().includes(q)) ||
              (s.vehiclePlate && s.vehiclePlate.toLowerCase().includes(q)) ||
              (s.vehicleModel && s.vehicleModel.toLowerCase().includes(q)) ||
              s.pickupLocation.toLowerCase().includes(q) ||
              s.dropoffLocation.toLowerCase().includes(q)
            );
          });

          if (!matchesEvent && matchedSchedules.length === 0) return null;

          return {
            ...grp,
            schedules: matchesEvent ? grp.schedules : matchedSchedules,
          };
        }

        return grp;
      })
      .filter((g): g is EventGroup => g !== null);
  }, [eventGroups, activeTab, searchQuery]);

  const toggleEventAccordion = (eventId: string) => {
    haptics.lightTap();
    setExpandedEvents((prev) => ({
      ...prev,
      [eventId]: prev[eventId] === undefined ? false : !prev[eventId],
    }));
  };

  const handleSendArrivalNotice = (e: React.MouseEvent, item: ScheduleOperationItem) => {
    e.stopPropagation();
    haptics.selection();
    if (onOpenCustomerMessageForSchedule) {
      onOpenCustomerMessageForSchedule(item.id, 'arrived_pickup');
    } else {
      alert(`[${formatDriverTitle(item.driverName)} · ${item.vehiclePlate}] 고객 도착 안내 메시지를 발송했습니다.`);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-black tracking-wider text-slate-400 uppercase">
              OPERATIONS
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              실시간 행사 운영 보드
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              진행 중인 행사의 차량 위치와 운행 상태를 실시간으로 확인해요
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {/* Live Indicator Badge */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>실시간 운영 중</span>
            </span>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                fetchOperations();
              }}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200/70 text-slate-600 border border-slate-200/80 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span>업데이트 {lastUpdatedTime}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top 5-Card KPI Summary Widget */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: 운영 중인 행사 (Active Blue Highlight) */}
        <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200/80 shadow-2xs flex items-center gap-3.5">
          <img
            src="/images/icons/live_dashboard/active_events.png"
            alt="운영 중인 행사"
            className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs"
          />
          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-bold">운영 중인 행사</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">
              {kpiStats.totalEvents}건
            </div>
          </div>
        </div>

        {/* Card 2: 전체 배차 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <img
            src="/images/icons/live_dashboard/total_dispatch.png"
            alt="전체 배차"
            className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs"
          />
          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-bold">전체 배차</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">
              {kpiStats.totalVehicles}대
            </div>
          </div>
        </div>

        {/* Card 3: 운행 중 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <img
            src="/images/icons/live_dashboard/in_operation.png"
            alt="운행 중"
            className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs"
          />
          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-bold">운행 중</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">
              {kpiStats.inTransit}대
            </div>
          </div>
        </div>

        {/* Card 4: 완료 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
          <img
            src="/images/icons/live_dashboard/completed.png"
            alt="완료"
            className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs"
          />
          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-bold">완료</div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5">
              {kpiStats.completed}대
            </div>
          </div>
        </div>

        {/* Card 5: 운영 진행률 */}
        <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src="/images/icons/live_dashboard/operation_progress.png"
              alt="운영 진행률"
              className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs"
            />

            <div className="min-w-0">
              <div className="text-xs text-slate-500 font-bold">운영 진행률</div>
              <div className="text-lg sm:text-xl font-black text-slate-900 mt-0.5 flex items-baseline gap-1">
                <span>{kpiStats.progressRate}%</span>
                <span className="text-[11px] text-slate-400 font-semibold truncate">
                  ({kpiStats.inTransit}/{kpiStats.totalVehicles}대)
                </span>
              </div>
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-2 sm:p-2.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        {/* Left Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('all');
            }}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'all'
              ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs font-extrabold'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:text-slate-900'
              }`}
          >
            <span>전체 행사 </span>
            <span className="font-black">{eventGroups.length}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('running');
            }}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'running'
              ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs font-extrabold'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:text-slate-900'
              }`}
          >
            <span>운영 중 </span>
            <span className="font-black">{eventGroups.length}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('closed');
            }}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'closed'
              ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs font-extrabold'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:text-slate-900'
              }`}
          >
            <span>대기·종료 </span>
            <span className="font-black">0</span>
          </button>
        </div>

        {/* Right Search Input & Filter Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="기사님, 차량번호, 장소로 찾아보세요"
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1E60F3] focus:bg-white transition-all shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={() => haptics.lightTap()}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0"
          >
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>필터</span>
          </button>
        </div>
      </div>

      {/* 4. Event Cards (Independent Accordions) */}
      <div className="space-y-4">
        {filteredGroups.map((group) => {
          const isExpanded = expandedEvents[group.id] !== false;
          const isShowingAll = showAllVehicles[group.id] === true;
          const totalVehiclesCount = group.schedules.length;

          // Status counts for this event
          const inTransitCount = group.schedules.filter((s) => s.operationStatus === 'in_transit').length;
          const readyCount = group.schedules.filter((s) => s.operationStatus === 'ready').length;
          const completedCount = group.schedules.filter((s) => s.operationStatus === 'completed').length;

          // Progressive disclosure: 5 rows by default if > 5
          const visibleSchedules =
            totalVehiclesCount > 5 && !isShowingAll
              ? group.schedules.slice(0, 5)
              : group.schedules;

          return (
            <div
              key={group.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden"
            >
              {/* Event Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col gap-2.5 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: Customer Tag & Event Name */}
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-[#1E60F3] text-[11px] font-bold border border-blue-200/60">
                      {group.customerTag}
                    </span>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      {group.eventName}
                    </h2>
                  </div>

                  {/* Right Actions: Event Info & Accordion Toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setSelectedEventInfo(group);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                    >
                      <span>행사 정보</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleEventAccordion(group.id)}
                      className="w-8 h-8 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 transition-colors cursor-pointer shadow-2xs"
                      aria-label="아코디언 토글"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-600" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Event Meta Row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {group.dateDisplay} {group.timeDisplay}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-slate-700">
                      총 {totalVehiclesCount}대 배차
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{group.routeSummary}</span>
                  </span>
                </div>
              </div>

              {/* Accordion Body */}
              {isExpanded && (
                <div>
                  {/* Inner Sub-header: Count & Status Chips */}
                  <div className="px-5 py-3 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="font-black text-slate-900">
                      배차 목록 ({totalVehiclesCount}대)
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>운행 중 {inTransitCount}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span>운행 준비 {readyCount}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <Check className="w-3 h-3 stroke-[2.5] text-slate-400" />
                        <span>완료 {completedCount}</span>
                      </span>
                    </div>
                  </div>

                  {/* Vehicles Table (Toss/Apple Style Streamlined) */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-white text-[11px] font-semibold text-slate-400 select-none">
                          <th className="py-2.5 px-5 w-16">#</th>
                          <th className="py-2.5 px-5">기사 (차량)</th>
                          <th className="py-2.5 px-5">이동 경로 (현재 여정)</th>
                          <th className="py-2.5 px-5">운영 상태</th>
                          <th className="py-2.5 px-5 text-right w-28">작업</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                        {visibleSchedules.map((item, idx) => {
                          const statusConfig = STATUS_CONFIG[item.operationStatus] || STATUS_CONFIG.ready;
                          const StatusIcon = statusConfig.icon;
                          const driverTitle = formatDriverTitle(item.driverName);
                          const vehicleIndex = item.groupVehicleIndex || idx + 1;

                          return (
                            <tr
                              key={item.id}
                              onClick={() => {
                                haptics.lightTap();
                                setSelectedSchedule(item);
                              }}
                              className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                            >
                              {/* 1. 호차 순번 */}
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200/60">
                                  {vehicleIndex}호차
                                </span>
                              </td>

                              {/* 2. 기사 (차량) & 오기 방지 */}
                              <td className="py-3.5 px-5">
                                <div>
                                  <div className="font-extrabold text-slate-900 group-hover:text-[#1E60F3] transition-colors">
                                    <span>{driverTitle}</span>{' '}
                                    <span className="text-slate-500 font-semibold text-[11px]">
                                      ({item.vehiclePlate})
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                                    {item.vehicleModel || 'Mercedes-Benz Sprinter'}
                                  </div>
                                </div>
                              </td>

                              {/* 3. 이동 경로 */}
                              <td className="py-3.5 px-5">
                                <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="font-bold text-slate-900">{item.pickupLocation}</span>
                                  <span className="text-slate-400 font-bold">➔</span>
                                  <span className="text-slate-700">{item.dropoffLocation}</span>
                                </div>
                              </td>

                              {/* 4. 운영 상태 & 최종 업데이트 병합 (컬럼 다이어트) */}
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <div className="flex flex-col items-start gap-0.5">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs ${statusConfig.badgeClass}`}
                                  >
                                    <StatusIcon className="w-3 h-3" />
                                    <span>{statusConfig.label}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium pl-1">
                                    {item.operationUpdatedAt || '오후 03:34'}
                                  </span>
                                </div>
                              </td>

                              {/* 5. 단일 도착 알림 버튼 (토스 스타일 단순화) */}
                              <td className="py-3.5 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => handleSendArrivalNotice(e, item)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-[#1E60F3] border border-blue-200/80 transition-colors shadow-2xs cursor-pointer active:scale-95"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>도착 알림</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Progressive Disclosure (더보기 11대 접기/펼치기) */}
                  {totalVehiclesCount > 5 && (
                    <div className="py-2.5 border-t border-slate-100 text-center bg-slate-50/40">
                      <button
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setShowAllVehicles((prev) => ({
                            ...prev,
                            [group.id]: !isShowingAll,
                          }));
                        }}
                        className="text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 transition-colors cursor-pointer py-1 px-3 rounded-lg hover:bg-slate-100"
                      >
                        {isShowingAll ? (
                          <>
                            <span>접기</span>
                            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                          </>
                        ) : (
                          <>
                            <span>더보기 ({totalVehiclesCount - 5}대)</span>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredGroups.length === 0 && (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 space-y-2">
            <Activity className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-700">일치하는 행사나 배차 정보가 없습니다.</p>
            <p className="text-[11px] text-slate-400">검색어 또는 필터를 변경해 보세요.</p>
          </div>
        )}
      </div>

      {/* 5. Event Info Modal (행사 정보 ↗) */}
      {selectedEventInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-50 text-[#1E60F3] text-[11px] font-bold border border-blue-200/60">
                  {selectedEventInfo.customerTag}
                </span>
                <h3 className="text-base font-black text-slate-900">
                  {selectedEventInfo.eventName} 정보
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEventInfo(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">행사 일시</span>
                  <span className="font-bold text-slate-800">
                    {selectedEventInfo.dateDisplay} ({selectedEventInfo.timeDisplay})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">투입 차량</span>
                  <span className="font-bold text-slate-800">
                    총 {selectedEventInfo.schedules.length}대
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200/60">
                  <span className="text-slate-400 font-medium block mb-1">운행 구간</span>
                  <p className="font-bold text-slate-800 leading-relaxed">
                    {selectedEventInfo.routeSummary}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEventInfo(null)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Vehicle History / Timeline Modal */}
      {selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    {formatDriverTitle(selectedSchedule.driverName)} 운행 상세
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {selectedSchedule.vehiclePlate} · {selectedSchedule.eventName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSchedule(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Summary Card */}
            <div className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">현재 상태</span>
                <span className="font-extrabold text-[#1E60F3]">
                  {STATUS_CONFIG[selectedSchedule.operationStatus]?.label || '운행 준비'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">운행 구간</span>
                <span className="font-bold text-slate-800">
                  {selectedSchedule.pickupLocation} ➔ {selectedSchedule.dropoffLocation}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">차량 모델</span>
                <span className="font-mono font-bold text-slate-700">
                  {selectedSchedule.vehicleModel}
                </span>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3 py-1 max-h-72 overflow-y-auto pr-1">
              {selectedSchedule.operationHistory && selectedSchedule.operationHistory.length > 0 ? (
                selectedSchedule.operationHistory.map((hist, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs">
                    <div className="w-2 h-2 rounded-full bg-[#1E60F3] mt-1 shrink-0" />
                    <div className="flex-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-center text-slate-400 mb-1">
                        <span className="font-bold text-slate-900">
                          {STATUS_CONFIG[hist.toStatus as OperationStatus]?.label || hist.toStatus}
                        </span>
                        <span className="font-mono text-[10px]">
                          {new Date(hist.timestamp).toLocaleTimeString('ko-KR')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">변경 주체: {hist.changedBy}</p>
                      {hist.note && <p className="text-[11px] text-slate-400 mt-1">{hist.note}</p>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-400 py-6 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Clock className="w-5 h-5 text-slate-300 mx-auto mb-1.5" />
                  <p className="font-bold text-slate-600">기사 Cockpit 실시간 연동 중</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    기사 앱에서 운행 상태(준비·도착·탑승·이동·종료)가 갱신되면 타임라인이 자동으로 기록됩니다.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={(e) => handleSendArrivalNotice(e, selectedSchedule)}
                className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E60F3] border border-blue-200/80 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>도착 알림 발송</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSchedule(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
