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
  Trash2,
} from 'lucide-react';
import { OperationStatus } from '@/app/api/schedules/operation-status/route';
import { CustomerNotificationTrigger } from '@/types/hq';
import { ensureClientAuth } from '@/utils/cockpitClientAuth';
import { haptics } from '@/utils/haptics';
import { hardDeleteHqSchedule } from '@/utils/hqScheduleHardDelete';
import { groupOperationsByCustomer } from '@/utils/hqOperationsCustomerGroups';

export interface HqOperationsBoardProps {
  onOpenCustomerMessageForSchedule?: (
    scheduleId: string,
    trigger?: CustomerNotificationTrigger
  ) => void;
}

export interface ScheduleOperationItem {
  id: string;
  eventId?: string;
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
  customerScoped?: boolean;
  customerTag: string;
  eventName: string;
  dateDisplay: string;
  timeDisplay: string;
  routeSummary: string;
  schedules: ScheduleOperationItem[];
}

const STATUS_CONFIG: Record<
  OperationStatus,
  {
    label: string;
    badgeClass: string;
    dotClass: string;
    icon: React.FC<{ className?: string }>;
    isLive?: boolean;
  }
> = {
  ready: {
    label: '운행 준비',
    badgeClass: 'bg-[#F7F9FC] text-[#61728A]',
    dotClass: 'bg-[#95A3B9]',
    icon: Play,
  },
  arrived_pickup: {
    label: '픽업지 도착',
    badgeClass: 'bg-[#F7F9FC] text-[#61728A]',
    dotClass: 'bg-[#95A3B9]',
    icon: MapPin,
  },
  boarded: {
    label: '승객 탑승',
    badgeClass: 'bg-[#F7F9FC] text-[#61728A]',
    dotClass: 'bg-[#95A3B9]',
    icon: Users,
  },
  in_transit: {
    label: '운행 중',
    badgeClass: 'bg-[#EEF3FF] text-[#31598F]',
    dotClass: 'bg-[#1E60F3]',
    icon: Car,
    isLive: true,
  },
  completed: {
    label: '운행 종료',
    badgeClass: 'bg-[#F7F9FC] text-[#95A3B9]',
    dotClass: 'bg-slate-400',
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
  // Only actual server schedules are shown; demo events must not reappear after deletion.
  const [eventGroups, setEventGroups] = useState<EventGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleOperationItem | null>(null);
  const [selectedEventInfo, setSelectedEventInfo] = useState<EventGroup | null>(null);
  const [eventToDelete, setEventToDelete] = useState<EventGroup | null>(null);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      if (data.ok && Array.isArray(data.schedules)) {
        // Map server schedules to ScheduleOperationItem
        const serverMapped: ScheduleOperationItem[] = data.schedules.map((s: any, idx: number) => ({
          id: s.id,
          eventId: s.event_id || s.eventId || undefined,
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

        // One customer = one main event card. Keep each driver's row unchanged,
        // even if the customer has multiple booking group IDs.
        const newGroups: EventGroup[] = groupOperationsByCustomer(serverMapped).map((group) => {
          const items = [...group.schedules].sort((a, b) =>
            a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime));
          const first = items[0];
          const last = items[items.length - 1];
          const sameEvent = items.every(item => item.eventName === first.eventName);
          const sameTimes = items.every(item => item.startTime === first.startTime && item.endTime === first.endTime);
          const sameRoute = items.every(item =>
            item.pickupLocation === first.pickupLocation && item.dropoffLocation === first.dropoffLocation);
          return {
            id: group.key,
            customerScoped: group.customerScoped,
            customerTag: first.customerName || '고객사',
            eventName: sameEvent ? first.eventName : '전체 배차 현황',
            dateDisplay: first.startDate === last.startDate
              ? first.startDate : `${first.startDate} ~ ${last.startDate}`,
            timeDisplay: sameTimes ? `${first.startTime} ~ ${first.endTime || '종료시'}` : '기사별 시간 확인',
            routeSummary: sameRoute
              ? `${first.pickupLocation} ➔ ${first.dropoffLocation}` : '기사별 이동 경로 확인',
            schedules: items,
          };
        });

        setEventGroups(newGroups);
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

  const confirmDeleteEvent = async () => {
    const target = eventToDelete;
    if (!target || deletingEvent || !target.schedules.length) return;
    setDeletingEvent(true);
    setDeleteError(null);
    try {
      // Delete the entire visible customer card, not only the first driver's
      // original group ID. The server revalidates every selected schedule.
      await hardDeleteHqSchedule(
        target.schedules[0].id,
        target.customerScoped ? 'customer' : 'event',
        target.schedules.map(item => item.id)
      );
      setEventToDelete(null);
      setSelectedEventInfo(null);
      // Clear the old selection immediately, then refresh against the server.
      setEventGroups(previous => previous.filter(group => group.id !== target.id));
      await fetchOperations();
      haptics.success();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '행사 삭제에 실패했습니다.');
      haptics.errorAlert();
    } finally {
      setDeletingEvent(false);
    }
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
    <div className="hq-operations-a space-y-5 sm:space-y-6">
      {/* 1. Header Bar & 5-Card KPI Summary Widget (통합 상단 보드 카드) */}
      <div className="space-y-5 rounded-[24px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6 select-none">
        <div className="flex items-center gap-3.5">
          {/* 실시간 운영 보드 아이콘 & 마우스 호버 툴팁 */}
          <div className="relative group/operations inline-flex items-center justify-center cursor-pointer shrink-0">
            <img
              src="/images/icons/live_dashboard/icon_live_dashboard.png"
              alt="실시간 행사 운영 보드"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
              className="w-12 h-12 sm:w-13 sm:h-13 object-contain shrink-0 transition-transform duration-200 group-hover/operations:scale-110 drop-shadow-xs"
            />
            <div className="hidden w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-[#F7F9FC] text-[#1E60F3] items-center justify-center shrink-0 transition-transform duration-200 group-hover/operations:scale-110 shadow-2xs">
              <Activity className="w-6 h-6" />
            </div>

            {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 (최상단 레이어) */}
            <div className="absolute bottom-full left-0 mb-2.5 hidden group-hover/operations:flex flex-col items-start pointer-events-none z-[100]">
              <span className="whitespace-nowrap rounded-[12px] bg-white px-3 py-2 text-[12px] font-medium text-[#4D607C] shadow-[0_10px_28px_rgba(35,49,78,0.12)] animate-in fade-in-50 duration-150">
                진행 중인 행사의 차량 위치와 운행 상태를 실시간으로 확인해요
              </span>
              <div className="-mt-1 ml-5 size-2.5 rotate-45 bg-white" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#F7F9FC] px-3 py-1 text-[11px] font-medium tracking-wide text-[#73839D]">
                OPERATIONS · 실시간 관제
              </span>
            </div>
            <h1 className="mt-1 text-[22px] font-bold tracking-[-0.04em] text-[#17233B] sm:text-[26px]">
              실시간 행사 운영 보드
            </h1>
            <p className="mt-1 text-[12px] font-medium text-[#73839D]">
              진행 중인 행사의 차량 위치와 운행 상태를 실시간으로 확인해요
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#F1F4F9]" />

        {/* 2. Top 5-Card KPI Summary Grid (QuickActionBar & Driver Card 스타일) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Card 1: 운영 중인 행사 */}
          <div
            onClick={() => {
              haptics.lightTap();
              setActiveTab('running');
            }}
            className={`flex min-h-[98px] cursor-pointer select-none items-center gap-3.5 rounded-[20px] p-4 transition-all duration-200 group sm:p-4 ${activeTab === 'running'
              ? 'bg-[#F3F7FF] shadow-[0_5px_16px_rgba(35,49,78,0.085)]'
              : 'bg-white shadow-[0_4px_14px_rgba(35,49,78,0.045)] hover:bg-[#FAFBFD] hover:shadow-[0_6px_20px_rgba(35,49,78,0.065)]'
              }`}
          >
            <img
              src="/images/icons/live_dashboard/active_events.png"
              alt="운영 중인 행사"
              className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs group-hover:scale-105 transition-transform duration-200"
            />
            <div className="min-w-0">
              <div className="text-xs text-slate-500 font-bold group-hover:text-slate-700">운영 중인 행사</div>
              <div className="mt-1 text-[22px] font-bold tracking-[-0.035em] text-[#17233B] sm:text-[25px]">
                {kpiStats.totalEvents}건
              </div>
            </div>
          </div>

          {/* Card 2: 전체 배차 */}
          <div
            onClick={() => {
              haptics.lightTap();
              setActiveTab('all');
            }}
            className={`flex min-h-[98px] cursor-pointer select-none items-center gap-3.5 rounded-[20px] p-4 transition-all duration-200 group sm:p-4 ${activeTab === 'all'
              ? 'bg-[#F3F7FF] shadow-[0_5px_16px_rgba(35,49,78,0.085)]'
              : 'bg-white shadow-[0_4px_14px_rgba(35,49,78,0.045)] hover:bg-[#FAFBFD] hover:shadow-[0_6px_20px_rgba(35,49,78,0.065)]'
              }`}
          >
            <img
              src="/images/icons/live_dashboard/total_dispatch.png"
              alt="전체 배차"
              className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs group-hover:scale-105 transition-transform duration-200"
            />
            <div className="min-w-0">
              <div className="text-xs text-slate-500 font-bold group-hover:text-slate-700">전체 배차</div>
              <div className="mt-1 text-[22px] font-bold tracking-[-0.035em] text-[#17233B] sm:text-[25px]">
                {kpiStats.totalVehicles}대
              </div>
            </div>
          </div>

          {/* Card 3: 운행 중 */}
          <div
            onClick={() => {
              haptics.lightTap();
              setActiveTab('running');
            }}
            className={`flex min-h-[98px] cursor-pointer select-none items-center gap-3.5 rounded-[20px] p-4 transition-all duration-200 group sm:p-4 ${activeTab === 'running'
              ? 'bg-[#F3F7FF] shadow-[0_5px_16px_rgba(35,49,78,0.085)]'
              : 'bg-white shadow-[0_4px_14px_rgba(35,49,78,0.045)] hover:bg-[#FAFBFD] hover:shadow-[0_6px_20px_rgba(35,49,78,0.065)]'
              }`}
          >
            <img
              src="/images/icons/live_dashboard/in_operation.png"
              alt="운행 중"
              className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs group-hover:scale-105 transition-transform duration-200"
            />
            <div className="min-w-0">
              <div className="text-xs text-slate-500 font-bold group-hover:text-slate-700">운행 중</div>
              <div className="mt-1 text-[22px] font-bold tracking-[-0.035em] text-[#17233B] sm:text-[25px]">
                {kpiStats.inTransit}대
              </div>
            </div>
          </div>

          {/* Card 4: 완료 */}
          <div
            onClick={() => {
              haptics.lightTap();
              setActiveTab('closed');
            }}
            className={`flex min-h-[98px] cursor-pointer select-none items-center gap-3.5 rounded-[20px] p-4 transition-all duration-200 group sm:p-4 ${activeTab === 'closed'
              ? 'bg-[#F3F7FF] shadow-[0_5px_16px_rgba(35,49,78,0.085)]'
              : 'bg-white shadow-[0_4px_14px_rgba(35,49,78,0.045)] hover:bg-[#FAFBFD] hover:shadow-[0_6px_20px_rgba(35,49,78,0.065)]'
              }`}
          >
            <img
              src="/images/icons/live_dashboard/completed.png"
              alt="완료"
              className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs group-hover:scale-105 transition-transform duration-200"
            />
            <div className="min-w-0">
              <div className="text-xs text-slate-500 font-bold group-hover:text-slate-700">완료</div>
              <div className="mt-1 text-[22px] font-bold tracking-[-0.035em] text-[#17233B] sm:text-[25px]">
                {kpiStats.completed}대
              </div>
            </div>
          </div>

          {/* Card 5: 운영 진행률 */}
          <div
            onClick={() => {
              haptics.lightTap();
              setActiveTab('all');
            }}
            className="group col-span-2 flex min-h-[98px] cursor-pointer select-none flex-col justify-between rounded-[20px] bg-white p-4 shadow-[0_4px_14px_rgba(35,49,78,0.045)] transition-all duration-200 hover:bg-[#FAFBFD] hover:shadow-[0_6px_20px_rgba(35,49,78,0.065)] sm:col-span-1"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/images/icons/live_dashboard/operation_progress.png"
                alt="운영 진행률"
                className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 drop-shadow-xs group-hover:scale-105 transition-transform duration-200"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500 font-bold group-hover:text-slate-700">운영 진행률</div>
                <div className="mt-1 text-[21px] font-bold tracking-[-0.035em] text-[#17233B] sm:text-[23px] flex items-baseline gap-1">
                  <span>{kpiStats.progressRate}%</span>
                  <span className="text-[11px] text-slate-400 font-semibold truncate">
                    ({kpiStats.inTransit}/{kpiStats.totalVehicles}대)
                  </span>
                </div>
              </div>
            </div>

            {/* Sleek Progress Bar */}
            <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden mt-2">
              <div
                className="bg-[#1E60F3] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, kpiStats.progressRate))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filter Bar & Search Container */}
      <div className="rounded-[22px] bg-white p-3 shadow-[0_6px_20px_rgba(35,49,78,0.055)] sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs select-none">
        {/* Left Filter Tabs (우리만의 캡슐 필 스타일) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('all');
            }}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[13px] px-4 text-[12px] font-semibold transition-colors ${activeTab === 'all'
              ? 'bg-[#EEF3FF] text-[#1E60F3]'
              : 'bg-white text-[#73839D] hover:text-[#17233B] hover:bg-[#F7F9FC]'
              }`}
          >
            <span>전체 행사</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[11px] ${activeTab === 'all' ? 'bg-white/75 text-[#1E60F3]' : 'bg-[#F7F9FC] text-[#73839D]'}`}>
              {eventGroups.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('running');
            }}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[13px] px-4 text-[12px] font-semibold transition-colors ${activeTab === 'running'
              ? 'bg-[#EEF3FF] text-[#1E60F3]'
              : 'bg-white text-[#73839D] hover:text-[#17233B] hover:bg-[#F7F9FC]'
              }`}
          >
            <span>운영 중</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[11px] ${activeTab === 'running' ? 'bg-white/75 text-[#1E60F3]' : 'bg-[#F7F9FC] text-[#73839D]'}`}>
              {eventGroups.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('closed');
            }}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[13px] px-4 text-[12px] font-semibold transition-colors ${activeTab === 'closed'
              ? 'bg-[#EEF3FF] text-[#1E60F3]'
              : 'bg-white text-[#73839D] hover:text-[#17233B] hover:bg-[#F7F9FC]'
              }`}
          >
            <span>대기·종료</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[11px] ${activeTab === 'closed' ? 'bg-white/75 text-[#1E60F3]' : 'bg-[#F7F9FC] text-[#73839D]'}`}>
              0
            </span>
          </button>
        </div>

        {/* Right Search Input & Filter Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="기사님, 차량번호, 장소로 찾아보세요"
              className="h-11 w-full rounded-[15px] bg-white pl-10 pr-8 text-[13px] font-medium text-[#17233B] placeholder:text-[#95A3B9] shadow-[0_4px_14px_rgba(35,49,78,0.045)] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200/60"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => haptics.lightTap()}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-[14px] bg-white px-3.5 text-[12px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.045)] transition-colors hover:bg-[#F5F8FF]"
          >
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>필터</span>
          </button>
        </div>
      </div>

      {/* 4. Event Cards (우리만의 프리미엄 아코디언 카드) */}
      <div className="hq-operations-a space-y-5 sm:space-y-6">
        {!isLoading && filteredGroups.length === 0 && (
          <div className="rounded-[24px] bg-white px-6 py-14 text-center shadow-[0_6px_20px_rgba(35,49,78,0.055)]">
            <p className="text-[14px] font-semibold text-[#17233B]">등록된 행사가 없습니다.</p>
            <p className="mt-1 text-[12px] text-[#8492A4]">새 배차가 등록되면 이곳에 표시됩니다.</p>
          </div>
        )}
        {filteredGroups.map((group) => {
          const isExpanded = expandedEvents[group.id] !== false;
          const isShowingAll = showAllVehicles[group.id] === true;
          const totalVehiclesCount = group.schedules.length;

          // Status counts for this event
          const inTransitCount = group.schedules.filter((s) => s.operationStatus === 'in_transit').length;
          const readyCount = group.schedules.filter((s) => s.operationStatus === 'ready').length;
          const boardedCount = group.schedules.filter((s) => s.operationStatus === 'boarded').length;
          const arrivedPickupCount = group.schedules.filter((s) => s.operationStatus === 'arrived_pickup').length;
          const completedCount = group.schedules.filter((s) => s.operationStatus === 'completed').length;

          // Progressive disclosure: 5 rows by default if > 5
          const visibleSchedules =
            totalVehiclesCount > 5 && !isShowingAll
              ? group.schedules.slice(0, 5)
              : group.schedules;

          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] transition-all duration-200"
            >
              {/* Event Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col gap-3 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: Customer Tag & Event Name */}
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-full bg-[#F7F9FC] px-3 py-1.5 text-[12px] font-medium text-[#73839D]">
                      {group.customerTag}
                    </span>
                    <h2 className="text-[18px] font-bold tracking-[-0.03em] text-[#17233B] sm:text-[20px]">
                      {group.eventName}
                    </h2>
                  </div>

                  {/* Right Actions: Event Info & Accordion Toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setDeleteError(null);
                        setEventToDelete(group);
                      }}
                      aria-label={`${group.customerTag} 행사 삭제`}
                      className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[13px] bg-[#F7F9FC] px-3 text-[12px] font-medium text-[#73839D] transition-colors hover:bg-[#FFF4F2] hover:text-[#A34E45]"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                      <span>행사 삭제</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setSelectedEventInfo(group);
                      }}
                      className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[13px] bg-white px-3.5 text-[12px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.05)] transition-colors hover:bg-[#F5F8FF]"
                    >
                      <span>행사 정보</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleEventAccordion(group.id)}
                      className="flex size-10 cursor-pointer items-center justify-center rounded-[13px] bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6]"
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

                {/* Event Meta Row (Pill Cards) */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                  <div className="inline-flex items-center gap-1.5 rounded-[12px] bg-[#F7F9FC] px-3 py-1.5 text-[12px] font-medium text-[#4D607C]">
                    <img
                      src="/images/icons/driver_ui/icon_calendar.png"
                      alt="일정"
                      className="w-3.5 h-3.5 object-contain select-none pointer-events-none"
                    />
                    <span>
                      {group.dateDisplay} {group.timeDisplay}
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 rounded-[12px] bg-[#F7F9FC] px-3 py-1.5 text-[12px] font-medium text-[#4D607C]">
                    <Car className="w-3.5 h-3.5 text-blue-600" />
                    <span>총 {totalVehiclesCount}대 배차</span>
                  </div>

                  <div className="inline-flex max-w-full items-center gap-1.5 truncate rounded-[12px] bg-[#F7F9FC] px-3 py-1.5 text-[12px] font-medium text-[#4D607C]">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{group.routeSummary}</span>
                  </div>
                </div>
              </div>

              {/* Accordion Body */}
              {isExpanded && (
                <div>
                  {/* Inner Sub-header: Count & Status Chips */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FAFBFD] px-5 py-3.5 text-[12px]">
                    <div className="font-black text-slate-900 flex items-center gap-2">
                      <span>배차 목록</span>
                      <span className="rounded-full bg-[#F7F9FC] px-2.5 py-1 text-[11px] font-medium text-[#73839D]">
                        총 {totalVehiclesCount}대
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#31598F]">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1E60F3] opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1E60F3]" />
                        </span>
                        <span>운행 중 {inTransitCount}</span>
                      </span>

                      {boardedCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          <span>승객 탑승 {boardedCount}</span>
                        </span>
                      )}

                      {arrivedPickupCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700">
                          <span className="w-2 h-2 rounded-full bg-sky-500" />
                          <span>픽업지 도착 {arrivedPickupCount}</span>
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>운행 준비 {readyCount}</span>
                      </span>

                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <Check className="w-3.5 h-3.5 stroke-[2.5] text-slate-400" />
                        <span>완료 {completedCount}</span>
                      </span>
                    </div>
                  </div>

                  {/* Desktop Table View (Hidden on mobile) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#F1F4F9] bg-white text-[11px] font-medium text-[#73839D] tracking-wide select-none whitespace-nowrap">
                          <th className="py-3 px-5 w-16">#</th>
                          <th className="py-3 px-5">기사 (차량)</th>
                          <th className="py-3 px-5">이동 경로 (운행 여정)</th>
                          <th className="py-3 px-5">운영 상태</th>
                          <th className="py-3 px-5 text-right w-32">작업</th>
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
                              className="cursor-pointer transition-colors hover:bg-[#FAFBFD] group"
                            >
                              {/* 1. 호차 순번 */}
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl text-xs font-black bg-[#F4F6FA] text-slate-700 border border-slate-200/70 group-hover:bg-blue-50 group-hover:border-blue-200 group-hover:text-[#1E60F3] transition-all shadow-2xs">
                                  {vehicleIndex}호
                                </span>
                              </td>

                              {/* 2. 기사 (차량) */}
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <div>
                                  <div className="font-extrabold text-slate-900 group-hover:text-[#1E60F3] transition-colors text-sm flex items-center gap-1.5">
                                    <span>{driverTitle}</span>
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/60 font-mono text-[11px] font-bold text-slate-700">
                                      {item.vehiclePlate}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-semibold truncate mt-0.5">
                                    {item.vehicleModel || 'Mercedes-Benz Sprinter'}
                                  </div>
                                </div>
                              </td>

                              {/* 3. 이동 경로 (우리만의 출발지/목적지 아이콘) */}
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 group-hover:bg-white  shadow-2xs transition-colors">
                                  {/* 출발지 */}
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-5.5 h-5.5 rounded-full bg-[#F7F9FC] flex items-center justify-center shrink-0">
                                      <img
                                        src="/images/icons/driver_ui/icon_origin.png"
                                        alt="출발지"
                                        className="w-3.5 h-3.5 object-contain select-none pointer-events-none"
                                      />
                                    </div>
                                    <span className="font-black text-slate-900 whitespace-nowrap">
                                      {item.pickupLocation}
                                    </span>
                                  </div>

                                  <span className="text-slate-300 font-bold px-0.5 select-none">➔</span>

                                  {/* 목적지 */}
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-5.5 h-5.5 rounded-full bg-red-50 border border-red-100/80 flex items-center justify-center shrink-0">
                                      <img
                                        src="/images/icons/driver_ui/icon_destination.png"
                                        alt="목적지"
                                        className="w-3.5 h-3.5 object-contain select-none pointer-events-none"
                                      />
                                    </div>
                                    <span className="font-bold text-slate-700 whitespace-nowrap">
                                      {item.dropoffLocation}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* 4. 운영 상태 & 최종 업데이트 병합 */}
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <div className="flex flex-col items-start gap-1">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs ${statusConfig.badgeClass}`}
                                  >
                                    {statusConfig.isLive ? (
                                      <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1E60F3] opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1E60F3]" />
                                      </span>
                                    ) : (
                                      <StatusIcon className="w-3 h-3" />
                                    )}
                                    <span>{statusConfig.label}</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-semibold pl-1">
                                    {item.operationUpdatedAt || '오후 03:34'}
                                  </span>
                                </div>
                              </td>

                              {/* 5. 도착 알림 버튼 (우리만의 icon_talk 스타일) */}
                              <td className="py-3.5 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => handleSendArrivalNotice(e, item)}
                                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[13px] bg-white px-3.5 text-[12px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.045)] transition-colors hover:bg-[#F5F8FF]"
                                >
                                  <img
                                    src="/images/icons/driver_ui/icon_talk.png"
                                    alt="알림"
                                    className="w-4 h-4 object-contain shrink-0"
                                  />
                                  <span>도착 알림</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards View (Visible on mobile only) */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {visibleSchedules.map((item, idx) => {
                      const statusConfig = STATUS_CONFIG[item.operationStatus] || STATUS_CONFIG.ready;
                      const driverTitle = formatDriverTitle(item.driverName);
                      const vehicleIndex = item.groupVehicleIndex || idx + 1;

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            haptics.lightTap();
                            setSelectedSchedule(item);
                          }}
                          className="group cursor-pointer space-y-3 p-4 transition-colors hover:bg-[#FAFBFD]"
                        >
                          {/* Row 1: Vehicle, Driver, Status */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-black bg-[#F4F6FA] text-slate-700 border border-slate-200/70 shrink-0">
                                {vehicleIndex}호
                              </span>
                              <div className="min-w-0">
                                <div className="font-extrabold text-slate-900 group-hover:text-[#1E60F3] transition-colors text-sm truncate">
                                  {driverTitle}
                                </div>
                                <div className="font-mono text-[11px] font-bold text-slate-500">
                                  {item.vehiclePlate}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs shrink-0 ${statusConfig.badgeClass}`}
                            >
                              {statusConfig.isLive && (
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1E60F3] opacity-75" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#1E60F3]" />
                                </span>
                              )}
                              <span>{statusConfig.label}</span>
                            </span>
                          </div>

                          {/* Row 2: Route box */}
                          <div className="p-2.5 rounded-2xl bg-slate-50  space-y-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-[#F7F9FC] flex items-center justify-center shrink-0">
                                <img
                                  src="/images/icons/driver_ui/icon_origin.png"
                                  alt="출발지"
                                  className="w-3 h-3 object-contain"
                                />
                              </div>
                              <span className="font-bold text-slate-900 truncate">{item.pickupLocation}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-red-50 border border-red-100/80 flex items-center justify-center shrink-0">
                                <img
                                  src="/images/icons/driver_ui/icon_destination.png"
                                  alt="목적지"
                                  className="w-3 h-3 object-contain"
                                />
                              </div>
                              <span className="font-bold text-slate-700 truncate">{item.dropoffLocation}</span>
                            </div>
                          </div>

                          {/* Row 3: Meta & Action */}
                          <div className="flex items-center justify-between gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[11px] text-slate-400 font-semibold">
                              {item.vehicleModel} · {item.operationUpdatedAt || '오후 03:34'}
                            </span>

                            <button
                              type="button"
                              onClick={(e) => handleSendArrivalNotice(e, item)}
                              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[13px] bg-white px-3.5 text-[12px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.045)] transition-colors hover:bg-[#F5F8FF]"
                            >
                              <img
                                src="/images/icons/driver_ui/icon_talk.png"
                                alt="알림"
                                className="w-3.5 h-3.5 object-contain shrink-0"
                              />
                              <span>도착 알림</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Progressive Disclosure (더보기 11대 접기/펼치기) */}
                  {totalVehiclesCount > 5 && (
                    <div className="py-3 border-t border-slate-100 text-center bg-slate-50/50">
                      <button
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setShowAllVehicles((prev) => ({
                            ...prev,
                            [group.id]: !isShowingAll,
                          }));
                        }}
                        className="text-xs font-black text-slate-700 hover:text-[#1E60F3] inline-flex items-center gap-1.5 transition-all cursor-pointer py-1.5 px-4 rounded-xl bg-white shadow-[0_4px_14px_rgba(35,49,78,0.05)] hover:bg-[#F5F8FF] active:scale-95"
                      >
                        {isShowingAll ? (
                          <>
                            <span>배차 목록 접기</span>
                            <ChevronUp className="w-4 h-4 text-slate-500" />
                          </>
                        ) : (
                          <>
                            <span>더보기 ({totalVehiclesCount - 5}대 추가 표시)</span>
                            <ChevronDown className="w-4 h-4 text-slate-500" />
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
          <div className="p-12 text-center bg-white  rounded-[28px] shadow-[0_6px_24px_rgba(15,23,42,0.05)] text-slate-400 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#EEF3FF] text-[#1E60F3] flex items-center justify-center mx-auto shadow-2xs">
              <Activity className="w-7 h-7" />
            </div>
            <p className="text-[14px] font-semibold text-[#17233B]">일치하는 행사나 배차 정보가 없습니다.</p>
            <p className="text-xs text-slate-400">검색어 또는 필터를 변경해 보세요.</p>
          </div>
        )}
      </div>

      {eventToDelete && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-[#17233B]/30 p-4 backdrop-blur-[2px] animate-in fade-in duration-200"
          onClick={() => { if (!deletingEvent) setEventToDelete(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="행사 완전 삭제 확인"
            onClick={event => event.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-[24px] bg-white p-6 shadow-[0_24px_64px_rgba(27,45,77,0.16)]"
          >
            <div className="space-y-2">
              <h3 className="text-[17px] font-bold text-[#17233B]">이 행사를 삭제할까요?</h3>
              <p className="text-[13px] leading-relaxed text-[#61728A]">
                배차된 일정과 기사·차량 배정이 모두 취소돼요.
              </p>
              <p className="text-[13px] font-medium leading-relaxed text-[#A34E45]">
                한 번 삭제하면 다시 되돌릴 수 없어요.
              </p>
            </div>

            <div className="rounded-xl bg-[#F8FAFC] border border-slate-100 p-3 text-[12px] leading-relaxed text-[#64748B] flex items-start gap-1.5">
              <span className="shrink-0 text-slate-400 font-semibold">ⓘ</span>
              <span>운행일지나 정산 기록이 남아있는 예약은 안전하게 보관돼요.</span>
            </div>

            {deleteError && (
              <p role="alert" className="rounded-xl bg-[#FFF4F2] p-3 text-[12px] text-[#A34E45]">
                {deleteError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={deletingEvent}
                onClick={() => { setEventToDelete(null); setDeleteError(null); }}
                className="h-11 rounded-xl bg-[#F1F5F9] text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                disabled={deletingEvent}
                onClick={() => void confirmDeleteEvent()}
                className="h-11 rounded-xl bg-[#EF4444] text-sm font-semibold text-white hover:bg-red-600 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              >
                {deletingEvent ? '삭제 중…' : '삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Event Info Modal (우리만의 팝업 애니메이션 & 스타일) */}
      {selectedEventInfo && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-4 backdrop-blur-[2px] select-none animate-in fade-in duration-200"
          onClick={() => setSelectedEventInfo(null)}
        >
          <div
            className="relative w-full max-w-md space-y-5 rounded-[24px] bg-white p-6 shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)] animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-full bg-[#EEF3FF] text-[#1E60F3] text-[11px] font-black border border-blue-200/60">
                  {selectedEventInfo.customerTag}
                </span>
                <h3 className="text-[17px] font-bold tracking-[-0.025em] text-[#17233B]">
                  {selectedEventInfo.eventName} 정보
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEventInfo(null)}
                className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6]"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-2.5 rounded-[17px] bg-[#FAFBFD] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold">행사 일시</span>
                  <span className="font-extrabold text-slate-900">
                    {selectedEventInfo.dateDisplay} ({selectedEventInfo.timeDisplay})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold">투입 차량</span>
                  <span className="font-extrabold text-blue-600">
                    총 {selectedEventInfo.schedules.length}대
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200/60">
                  <span className="text-slate-400 font-bold block mb-1">운행 구간</span>
                  <p className="font-bold text-slate-800 leading-relaxed">
                    {selectedEventInfo.routeSummary}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedEventInfo(null)}
                className="min-h-[52px] w-full cursor-pointer rounded-[15px] bg-[#1E60F3] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-colors hover:bg-[#1757DC] active:scale-[0.99]"
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Vehicle History / Timeline Modal (기사 앱 운행일지 타임라인 스타일) */}
      {selectedSchedule && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-4 backdrop-blur-[2px] select-none animate-in fade-in duration-200"
          onClick={() => setSelectedSchedule(null)}
        >
          <div
            className="relative w-full max-w-lg space-y-5 rounded-[24px] bg-white p-6 shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)] animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#EEF3FF] text-[#1E60F3] flex items-center justify-center shadow-2xs shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-[17px] font-bold tracking-[-0.025em] text-[#17233B]">
                    {formatDriverTitle(selectedSchedule.driverName)} 운행 상세
                  </h4>
                  <p className="text-[11px] text-slate-400 font-semibold">
                    {selectedSchedule.vehiclePlate} · {selectedSchedule.eventName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSchedule(null)}
                className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6]"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Summary Card */}
            <div className="space-y-2 rounded-[17px] bg-[#FAFBFD] p-4 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">현재 운행 상태</span>
                <span className="font-black text-[#1E60F3] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>{STATUS_CONFIG[selectedSchedule.operationStatus]?.label || '운행 준비'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">운행 여정</span>
                <div className="inline-flex items-center gap-1.5 font-bold text-slate-800">
                  <img
                    src="/images/icons/driver_ui/icon_origin.png"
                    alt="출발지"
                    className="w-3.5 h-3.5 object-contain"
                  />
                  <span>{selectedSchedule.pickupLocation}</span>
                  <span className="text-slate-300">➔</span>
                  <img
                    src="/images/icons/driver_ui/icon_destination.png"
                    alt="목적지"
                    className="w-3.5 h-3.5 object-contain"
                  />
                  <span>{selectedSchedule.dropoffLocation}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">배차 모델</span>
                <span className="font-mono font-bold text-slate-700">
                  {selectedSchedule.vehicleModel}
                </span>
              </div>
            </div>

            {/* Timeline (기사 Cockpit 스타일) */}
            <div className="space-y-3 py-1 max-h-72 overflow-y-auto pr-1">
              {selectedSchedule.operationHistory && selectedSchedule.operationHistory.length > 0 ? (
                selectedSchedule.operationHistory.map((hist, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#1E60F3] mt-1 shrink-0 ring-4 ring-blue-50" />
                    <div className="flex-1 space-y-1 rounded-[16px] bg-[#FAFBFD] p-4">
                      <div className="flex justify-between items-center text-slate-400">
                        <span className="font-black text-slate-900">
                          {STATUS_CONFIG[hist.toStatus as OperationStatus]?.label || hist.toStatus}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-slate-400">
                          {new Date(hist.timestamp).toLocaleTimeString('ko-KR')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium">변경 주체: {hist.changedBy}</p>
                      {hist.note && <p className="text-[11px] text-slate-500 bg-white p-2 rounded-xl border border-slate-100 mt-1">{hist.note}</p>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-400 py-6 text-xs bg-[#FAFBFD] rounded-[18px] space-y-1">
                  <Clock className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                  <p className="font-black text-slate-700">기사 Cockpit 실시간 연동 중</p>
                  <p className="text-[11px] text-slate-400">
                    기사 앱에서 운행 상태(준비·도착·탑승·이동·종료)가 갱신되면 타임라인이 자동으로 기록됩니다.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={(e) => handleSendArrivalNotice(e, selectedSchedule)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[14px] bg-white px-4 text-[12px] font-semibold text-[#4D607C] shadow-[0_4px_14px_rgba(35,49,78,0.055)] transition-colors hover:bg-[#F5F8FF]"
              >
                <img
                  src="/images/icons/driver_ui/icon_talk.png"
                  alt="알림"
                  className="w-4 h-4 object-contain shrink-0"
                />
                <span>도착 알림 발송</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSchedule(null)}
                className="min-h-11 cursor-pointer rounded-[14px] bg-[#F7F9FC] px-5 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EDF1F6]"
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
