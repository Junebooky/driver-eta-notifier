'use client';
import { scheduleOverlapsInterval } from '@/utils/dispatchInterval';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  Car,
  Truck,
  Bus,
  Search,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  RotateCw,
  Edit2,
  Calendar,
  Users,
  Copy,
  CheckCircle2,
  Plug,
  Fuel,
  Zap,
  Info,
  CalendarDays,
  Plus,
  Clock,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Minus,
} from 'lucide-react';
import {
  VIP_REAL_VEHICLES,
  VipRealVehicle,
  VehicleUiCategoryKey,
  mapVehicleToUiCategory,
  getVehicleImage,
} from '@/utils/vehicleData';
import {
  getKstTodayDateStr,
  normalizeDateToIso,
  cleanVehicleIdentity,
  isBookingActiveForConflict,
} from '@/utils/dispatchConflictDetector';
import { HqBooking } from '@/types/hq';
import type { FleetAvailabilityResult } from '@/utils/availabilityEngine';
import { VEHICLE_STATUS_LABELS } from '@/utils/fleetVehicleStatus';
import { haptics } from '@/utils/haptics';
import { NewVehicleModal, NewVehicleFormData } from './NewVehicleModal';

export interface HqVehicleManagementViewProps {
  initialSearchQuery?: string;
  bookings?: HqBooking[];
}

export type FuelTypeFilter = 'all' | '휘발유' | '경유' | '하이브리드';
export type AvailabilityDayStatus =
  | '예약 가능'
  | '예약 있음'
  | '운행 중'
  | '정비 중'
  | '확인 중...'
  | '확인 불가'
  | '미확인';

// Preserved resolver aliases adhering to centralized mapping (Issue #10)
export function getVehicleHero(v: VipRealVehicle): string {
  return getVehicleImage(v);
}
export function getVehicleThumb(v: VipRealVehicle): string {
  return getVehicleImage(v);
}

// Specific vehicle tips strictly following verified real data
// ONLY 193호 5336 has verified specs from user-provided cockpit mockup.
// All other 19 vehicles must remain "미확인 (관리자 확인 필요)" to prevent false operational assurances.
function getVehicleTips(v: VipRealVehicle) {
  if (v.plateShort === '5336') {
    return {
      isVerified: true,
      frontCharging: 'USB 총 3개 (상세 규격 미확인)',
      rearCharging: '시거잭 + 220V 콘센트 (수량·위치 현장 확인 필요)',
      fuelTip: '휘발유 (가득 주유 시 주행거리 미확인)',
      powerTip: '220V 전원 사용 가능 (상세 위치 현장 확인 필요)',
    };
  }
  return {
    isVerified: false,
    frontCharging: '미확인 (관리자 확인 필요)',
    rearCharging: '미확인 (관리자 확인 필요)',
    fuelTip: '연료 잔여량 및 주행거리 미확인 (관리자 확인 필요)',
    powerTip: '220V 인버터 유무 미확인 (관리자 확인 필요)',
  };
}

// Status display formatter (대기 중 -> 배차 가능)
const formatVehicleStatus = (st: string) => (st === '대기 중' ? '배차 가능' : st);

const STATUS_OPTIONS: Array<{ value: '확인 필요' | '대기 중' | '운행 중' | '정비 중'; label: string }> = [
  { value: '대기 중', label: '배차 가능' },
  { value: '운행 중', label: '운행 중' },
  { value: '정비 중', label: '정비 중' },
  { value: '확인 필요', label: '확인 필요' },
];

export const HqVehicleManagementView: React.FC<HqVehicleManagementViewProps> = ({
  initialSearchQuery = '',
  bookings,
}) => {
  // 1. Filter States
  const [selectedCategory, setSelectedCategory] = useState<VehicleUiCategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [fuelFilter, setFuelFilter] = useState<FuelTypeFilter>('all');

  // 2. Selected Vehicle - Defaults to 125호 9982 (Benz Sprinter Tourer 319 CDI from mockup)
  const defaultCarId = useMemo(() => {
    return VIP_REAL_VEHICLES[0].id;
  }, []);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(defaultCarId);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

  // 3. Tab State inside Detail View
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'calendar' | 'tips' | 'memo'>('info');

  // 4. Overrides (Status, Color, Year, Memo) synced with server store
  const [statusOverrides, setStatusOverrides] = useState<Record<string, '확인 필요' | '대기 중' | '운행 중' | '정비 중'>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [serverColors, setServerColors] = useState<Record<string, string>>({});

  const fetchServerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/status');
      const data = await res.json();
      if (data.ok) {
        if (data.statuses) setStatusOverrides(data.statuses);
        if (data.memos) setMemos(data.memos);
        if (data.colors) setServerColors(data.colors);
      }
    } catch (err) {
      console.warn('Notice fetching /api/fleet/status:', err);
    }
  }, []);

  useEffect(() => {
    void fetchServerStatus();
  }, [fetchServerStatus]);

  const handleQuickChangeStatus = async (vehicleId: string, newStatus: '확인 필요' | '대기 중' | '운행 중' | '정비 중') => {
    haptics.selection();
    setStatusOverrides((prev) => ({ ...prev, [vehicleId]: newStatus }));
    try {
      await fetch('/api/fleet/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statuses: { [vehicleId]: newStatus },
        }),
      });
      void fetchAvailability();
    } catch (err) {
      console.warn('Failed to save status change:', err);
    }
  };

  // 5. Fail-Closed Real Availability State
  const [fleetResult, setFleetResult] = useState<FleetAvailabilityResult | null>(null);
  const [availabilityState, setAvailabilityState] = useState<'loading' | 'success' | 'error'>('loading');
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const activeAbortRef = React.useRef<AbortController | null>(null);

  const fetchAvailability = useCallback(async () => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setAvailabilityError(null);

    const todayIso = getKstTodayDateStr();
    const [ty, tm, td] = todayIso.split('-').map(Number);
    const endDt = new Date(Date.UTC(ty, tm - 1, td + 14));
    const endIso = `${endDt.getUTCFullYear()}-${String(endDt.getUTCMonth() + 1).padStart(2, '0')}-${String(endDt.getUTCDate()).padStart(2, '0')}`;

    try {
      const res = await fetch(
        `/api/fleet/availability?startDate=${todayIso}&endDate=${endIso}&startTime=00:00&endTime=23:59`,
        { signal: controller.signal, cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `서버 응답 에러 (${res.status})`);
      }
      if (controller.signal.aborted) return;
      setFleetResult(data);
      setAvailabilityState('success');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Fleet availability fetch error:', err);
      setAvailabilityState('error');
      setAvailabilityError(err.message || '가용성 서버 조회 실패');
    }
  }, []);

  useEffect(() => {
    fetchAvailability();
    const refresh=()=>{if(document.visibilityState==='visible')void fetchAvailability();};
    const timer=setInterval(refresh,8000);
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
    window.addEventListener('vip_hq_schedules_updated',refresh);
    document.addEventListener('visibilitychange',refresh);
    return () => {
      clearInterval(timer);window.removeEventListener('focus',refresh);
      window.removeEventListener('online',refresh);
      window.removeEventListener('vip_hq_schedules_updated',refresh);
      document.removeEventListener('visibilitychange',refresh);
      if (activeAbortRef.current) activeAbortRef.current.abort();
    };
  }, [fetchAvailability]);

  // 6. Modals & Toast State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isNewVehicleModalOpen, setIsNewVehicleModalOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  }, []);

  // Custom vehicles dynamically added via NewVehicleModal (persisted to localStorage)
  const [customVehicles, setCustomVehicles] = useState<VipRealVehicle[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vip_hq_custom_vehicles');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCustomVehicles(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached custom vehicles', e);
    }
  }, []);

  const allBaseVehicles = useMemo(() => {
    return [...customVehicles, ...VIP_REAL_VEHICLES];
  }, [customVehicles]);

  // Edit Modal Form State
  const [editStatus, setEditStatus] = useState<'확인 필요' | '대기 중' | '운행 중' | '정비 중'>('확인 필요');
  const [editMemo, setEditMemo] = useState('');
  const [editColor, setEditColor] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [saveEditError, setSaveEditError] = useState<string | null>(null);

  // Enriched vehicles with category, fuel normalization, and verified attributes
  const enrichedVehicles = useMemo(() => {
    return allBaseVehicles.map((v) => {
      const uiCategory = mapVehicleToUiCategory(v);
      const override = statusOverrides[v.id] || statusOverrides[v.plate];
      const live = availabilityState === 'success' ? fleetResult?.vehicles.find(row => row.uuid === v.uuid) : undefined;
      const effectiveStatus = override
        ? override
        : live
        ? VEHICLE_STATUS_LABELS[live.currentStatus]
        : availabilityState === 'loading'
        ? '확인 중...'
        : availabilityState === 'error'
        ? '확인 불가'
        : '대기 중';
      // 연식과 색상은 확인된 값만 표시합니다.
      const year = v.year || '미확인';
      const color =
        serverColors[v.id] ||
        v.color ||
        '미확인';
      const fuel = v.fuelType === '디젤' ? '경유' : '휘발유';
      return {
        ...v,
        uiCategory,
        effectiveStatus,
        year,
        color,
        fuelDisplay: fuel,
      };
    });
  }, [allBaseVehicles, availabilityState, fleetResult, serverColors, statusOverrides]);

  // Filtered vehicles for Center Column
  const filteredVehicles = useMemo(() => {
    return enrichedVehicles.filter((v) => {
      // Category filter
      if (selectedCategory !== 'all' && v.uiCategory !== selectedCategory) {
        return false;
      }
      // Fuel filter
      if (fuelFilter !== 'all') {
        if (fuelFilter === '휘발유' && v.fuelDisplay !== '휘발유') return false;
        if (fuelFilter === '경유' && v.fuelDisplay !== '경유') return false;
        if (fuelFilter === '하이브리드' && v.fuelType !== '하이브리드') return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesPlate = v.plate.toLowerCase().includes(q);
        const matchesPlateShort = v.plateShort.toLowerCase().includes(q);
        const matchesModel = v.model.toLowerCase().includes(q);
        const matchesBrand = v.brand.toLowerCase().includes(q);
        if (!matchesPlate && !matchesPlateShort && !matchesModel && !matchesBrand) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedVehicles, selectedCategory, fuelFilter, searchQuery]);

  // Selected vehicle for Right Column
  const selectedVehicle = useMemo(() => {
    return (
      enrichedVehicles.find((v) => v.id === selectedVehicleId) ||
      filteredVehicles[0] ||
      enrichedVehicles[0]
    );
  }, [enrichedVehicles, filteredVehicles, selectedVehicleId]);

  // Copy Plate Handler
  const handleCopyPlate = () => {
    if (!selectedVehicle) return;
    navigator.clipboard.writeText(selectedVehicle.plate);
    setCopiedToast(true);
    haptics.success();
    setTimeout(() => setCopiedToast(false), 2000);
  };

  // Open Edit Modal
  const handleOpenEdit = () => {
    if (!selectedVehicle) return;
    setEditStatus(statusOverrides[selectedVehicle.id] || '대기 중');
    setEditMemo(memos[selectedVehicle.id] || '');
    setEditColor(selectedVehicle.color === '미확인' ? '' : selectedVehicle.color);
    setSaveEditError(null);
    setIsEditModalOpen(true);
  };

  // Save Edit - Persists to Server API and syncs state
  const handleSaveEdit = async () => {
    if (!selectedVehicle) return;
    setIsSavingEdit(true);
    setSaveEditError(null);

    try {
      const res = await fetch('/api/fleet/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: selectedVehicle.id,
          plate: selectedVehicle.plate,
          status: editStatus,
          memo: editMemo,
          color: editColor || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '서버 상태 저장에 실패했습니다.');
      }

      const saved = await res.json();
      if (!saved.ok) throw new Error(saved.error || '저장 확인 실패');
      const newStatuses = { ...statusOverrides, ...saved.statuses };
      const newMemos = { ...memos, ...saved.memos };
      const newColors = { ...serverColors, ...saved.colors };
      setStatusOverrides(newStatuses);
      setMemos(newMemos);
      setServerColors(newColors);
      setIsEditModalOpen(false);
      void fetchAvailability();
      haptics.success();
    } catch (err: any) {
      console.error('Error saving vehicle status to server:', err);
      setSaveEditError(err.message || '저장 실패');
      haptics.errorAlert();
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Fail-Closed Day Status Resolver: calculates exact status for a specific vehicle on a given date (Point 3)
  const getVehicleDayStatus = useCallback(
    (v: VipRealVehicle, targetDateIso: string): { status: AvailabilityDayStatus; detail?: string } => {
      // 1. Fail-closed: while loading or error
      if (availabilityState === 'loading') {
        return { status: '확인 중...', detail: '가용성 서버 조회 중' };
      }
      if (availabilityState === 'error') {
        return { status: '확인 불가', detail: availabilityError || '서버 오류' };
      }

      // 2. Server/local maintenance override or data
      const isMaint = fleetResult?.vehicles.find(row => row.uuid === v.uuid)?.currentStatus === 'maintenance';
      if (isMaint) {
        return { status: '정비 중', detail: '차량 정비/점검' };
      }

      // 4. Check fleetResult from API with exact per-day activeSchedules match
      if (fleetResult) {
        const detail = fleetResult.vehicles?.find((vd: any) => {
          const vdPlate = cleanVehicleIdentity(vd.plate);
          const vPlate = cleanVehicleIdentity(v.plate);
          return (v.uuid && vd.uuid === v.uuid) || (vdPlate && vPlate && vdPlate === vPlate);
        });

        if (!detail) {
          return { status: '미확인', detail: '차량 등록 정보 미확인' };
        }

        if (detail.currentStatus === 'maintenance' || detail.requestedIntervalStatus === 'maintenance') {
          return { status: '정비 중', detail: '정비 중' };
        }

        if (targetDateIso === getKstTodayDateStr() && detail.currentStatus === 'in_service') {
          return { status: '운행 중', detail: '일정·기사 상태·차량 인수 기록 반영' };
        }

        if (detail.requestedIntervalStatus === 'custody_hold') return { status: '미확인', detail: '차량 인수 중 · 반납 확인 필요' };

        // Check if this vehicle has an active schedule overlapping targetDateIso specifically
        if (detail.activeSchedules && detail.activeSchedules.length > 0) {
          const daySchedule = detail.activeSchedules.find((s) => {
            return scheduleOverlapsInterval(s, { startDate: targetDateIso, startTime: '00:00', endDate: targetDateIso, endTime: '23:59' });
          });

          if (daySchedule) {
            return {
              status: !daySchedule.endTime ? '미확인' : '예약 있음',
              detail: `${daySchedule.customerName || '고객사'} (${daySchedule.pickupTime})`,
            };
          }
        }

        return { status: '예약 가능' };
      }

      // Default fallback: Fail-closed
      return { status: '확인 불가', detail: '가용성 데이터 부재' };
    },
    [availabilityState, availabilityError, fleetResult]
  );

  // 5 Days Strip computation starting from today with real fail-closed statuses
  const fiveDays = useMemo(() => {
    const todayIso = getKstTodayDateStr();
    const [ty, tm, td] = todayIso.split('-').map(Number);
    const base = new Date(Date.UTC(ty, tm - 1, td));
    const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    const days = [];
    for (let i = 0; i < 5; i++) {
      const cur = new Date(base);
      cur.setUTCDate(base.getUTCDate() + i);
      const curIso = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`;
      const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(cur.getUTCDate()).padStart(2, '0');
      const dayOfWeek = dayLabels[cur.getUTCDay()];
      const dayRes = getVehicleDayStatus(selectedVehicle, curIso);

      days.push({
        iso: curIso,
        label: `${mm}/${dd}`,
        dayOfWeek: `(${dayOfWeek})`,
        status: dayRes.status,
        detail: dayRes.detail,
      });
    }
    return days;
  }, [selectedVehicle, getVehicleDayStatus]);

  // 14 Days computation for Calendar Modal
  const fourteenDays = useMemo(() => {
    const todayIso = getKstTodayDateStr();
    const [ty, tm, td] = todayIso.split('-').map(Number);
    const base = new Date(Date.UTC(ty, tm - 1, td));
    const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    const days = [];
    for (let i = 0; i < 14; i++) {
      const cur = new Date(base);
      cur.setUTCDate(base.getUTCDate() + i);
      const curIso = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`;
      const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(cur.getUTCDate()).padStart(2, '0');
      const dayOfWeek = dayLabels[cur.getUTCDay()];
      const dayRes = getVehicleDayStatus(selectedVehicle, curIso);

      days.push({
        iso: curIso,
        label: `${mm}/${dd}`,
        dayOfWeek,
        status: dayRes.status,
        detail: dayRes.detail,
      });
    }
    return days;
  }, [selectedVehicle, getVehicleDayStatus]);

  const tips = useMemo(() => {
    return getVehicleTips(selectedVehicle);
  }, [selectedVehicle]);


  // Dynamic Category counts
  const categoryCounts = useMemo(() => {
    return {
      all: enrichedVehicles.length,
      sedan: enrichedVehicles.filter((v) => v.uiCategory === 'sedan').length,
      suv: enrichedVehicles.filter((v) => v.uiCategory === 'suv').length,
      van: enrichedVehicles.filter((v) => v.uiCategory === 'van').length,
      sprinter: enrichedVehicles.filter((v) => v.uiCategory === 'sprinter').length,
    };
  }, [enrichedVehicles]);

  // Dynamic Fuel counts
  const fuelCounts = useMemo(() => {
    return {
      all: enrichedVehicles.length,
      gasoline: enrichedVehicles.filter((v) => v.fuelDisplay === '휘발유').length,
      diesel: enrichedVehicles.filter((v) => v.fuelDisplay === '경유').length,
      hybrid: enrichedVehicles.filter((v) => v.fuelType === '하이브리드').length,
    };
  }, [enrichedVehicles]);

  // Register New Vehicle Handler
  const handleCreateVehicle = (data: NewVehicleFormData) => {
    const newVehicle: VipRealVehicle = {
      id: `vehicle-custom-${Date.now()}`,
      uuid: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `custom-${Date.now()}`,
      plate: data.plate,
      plateShort: data.plate.trim().split(/\s+/).pop() || data.plate.slice(-4),
      model: data.model,
      modelShort: data.model.replace(/^(벤츠|현대|기아|제네시스)\s+/, ''),
      brand: (
        data.model.includes('벤츠') ? '벤츠' :
        data.model.includes('현대') ? '현대' :
        data.model.includes('기아') ? '기아' :
        data.model.includes('제네시스') ? '제네시스' :
        data.category === 'sprinter' ? '벤츠' :
        data.category === 'sedan' ? '제네시스' :
        data.category === 'suv' ? '제네시스' : '현대'
      ),
      category: (
        data.category === 'sprinter' ? 'sprinter' :
        data.category === 'suv' ? 'genesis' :
        data.category === 'van' ? 'carnival' :
        data.model.includes('벤츠') || data.model.includes('S') ? 's_class' : 'genesis'
      ),
      categoryLabel: (
        data.category === 'sprinter' ? '스프린터' :
        data.category === 'suv' ? 'SUV' :
        data.category === 'van' ? '밴' : '세단'
      ),
      subType: data.model,
      capacity: data.capacity,
      status: '차고지 대기', // Initial status: displays as '배차 가능'
      fuelType: data.fuelType === '경유' ? '디젤' : data.fuelType === '휘발유' ? '가솔린' : '하이브리드',
      year: '2026',
      color: '블랙 (기본)',
      imageUrl: data.imageUrl,
    };

    setCustomVehicles((prev) => {
      const next = [newVehicle, ...prev];
      try {
        localStorage.setItem('vip_hq_custom_vehicles', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save custom vehicles to localStorage', err);
      }
      return next;
    });

    setSelectedVehicleId(newVehicle.id);
    setIsNewVehicleModalOpen(false);
    showToast('차량이 성공적으로 등록되었습니다.');
    haptics.success();
  };

  return (
    <div className="space-y-4">
      {/* Top Horizontal Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* 1. 차량 분류 (Category Pills) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {[
              { key: 'all', label: '전체', count: categoryCounts.all, icon: Car },
              { key: 'sedan', label: '세단', count: categoryCounts.sedan, icon: Car },
              { key: 'suv', label: 'SUV', count: categoryCounts.suv, icon: Car },
              { key: 'van', label: '밴', count: categoryCounts.van, icon: Truck },
              { key: 'sprinter', label: '스프린터', count: categoryCounts.sprinter, icon: Bus },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.key;
              const IconComp = cat.icon;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setSelectedCategory(cat.key as VehicleUiCategoryKey);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-[#1E60F3] text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  <IconComp className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                  <span>{cat.label}</span>
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 2. Right: Fuel Type Filter & Search Bar */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
            {/* Fuel Type Filters (0건 필터 칩 숨김) */}
            <div className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl shrink-0 border border-slate-200/50">
              {[
                { key: 'all', label: '전체' },
                { key: '휘발유', label: '휘발유', count: fuelCounts.gasoline },
                { key: '경유', label: '경유', count: fuelCounts.diesel },
                { key: '하이브리드', label: '하이브리드', count: fuelCounts.hybrid },
              ]
                .filter((fuel) => fuel.key === 'all' || (fuel.count !== undefined && fuel.count > 0))
                .map((fuel) => {
                  const isChecked = fuelFilter === fuel.key;
                  return (
                    <button
                      key={fuel.key}
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setFuelFilter(fuel.key as FuelTypeFilter);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                        isChecked
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span>{fuel.label}</span>
                      {fuel.key !== 'all' && (
                        <span className={`text-[10px] ${isChecked ? 'text-blue-600 font-extrabold' : 'text-slate-400 font-medium'}`}>
                          {fuel.count}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="차량명이나 번호로 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#1E60F3] placeholder:text-slate-400 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* + 차량 등록 Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setIsNewVehicleModalOpen(true);
              }}
              className="bg-[#0050FF] hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 shrink-0"
              title="신규 차량 등록"
            >
              <Plus className="w-4 h-4 stroke-[2.2]" />
              <span>+ 차량 등록</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ============================================================== */}
        {/* COLUMN 1 (Left): Vehicle List Cards                           */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-black text-slate-900">차량 목록</h2>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium mt-0.5">
                <span>실시간 반영 중</span>
                <button
                  type="button"
                  onClick={fetchServerStatus}
                  className="hover:text-slate-600 transition-colors cursor-pointer"
                  title="새로고침"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-bold">
              {filteredVehicles.length}대
            </span>
          </div>

          {/* Cards Stack */}
          <div className="space-y-2.5 max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
            {filteredVehicles.map((vehicle) => {
              const isSelected = vehicle.id === selectedVehicle?.id;
              const thumbUrl = getVehicleImage(vehicle);

              return (
                <div
                  key={vehicle.id}
                  onClick={() => {
                    haptics.selection();
                    setSelectedVehicleId(vehicle.id);
                  }}
                  className={`bg-white border rounded-2xl p-3 sm:p-3.5 hover:border-slate-300 transition-all cursor-pointer flex items-center gap-3 relative shadow-2xs group ${
                    isSelected
                      ? 'border-[#1E60F3] ring-1 ring-[#1E60F3]/40'
                      : 'border-slate-200/80'
                  }`}
                >
                  {/* Left Thumbnail Image - Transparent background with lifting drop-shadow */}
                  <div className="relative w-20 sm:w-24 h-14 sm:h-16 shrink-0 flex items-center justify-center">
                    <Image
                      src={thumbUrl}
                      alt={vehicle.model}
                      fill
                      className="object-contain filter drop-shadow-[0_8px_12px_rgba(0,0,0,0.16)] transition-transform duration-200 group-hover:scale-105"
                      sizes="96px"
                    />
                  </div>

                  {/* Center & Right Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 self-stretch">
                    {/* Top: Model & Chevron */}
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-xs sm:text-[13px] font-black text-slate-900 tracking-tight truncate">
                        {vehicle.model}
                      </h3>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    </div>

                    {/* Middle: Badges */}
                    <div className="flex items-center gap-1.5 my-1">
                      <span className="bg-blue-50 text-[#1E60F3] text-[10px] font-bold px-1.5 py-0.2 rounded">
                        {vehicle.uiCategory === 'sprinter'
                          ? '스프린터'
                          : vehicle.uiCategory === 'van'
                          ? '밴'
                          : vehicle.uiCategory === 'suv'
                          ? 'SUV'
                          : '세단'}
                      </span>
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.2 rounded">
                        {vehicle.fuelDisplay}
                      </span>
                    </div>

                      {/* Bottom: Plate & Status Pill */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-xs sm:text-[13px] font-black text-slate-900 tracking-tight">
                          {vehicle.plate}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/60 shrink-0">
                          <Calendar className="w-2.5 h-2.5 text-slate-400" />
                          <span>{formatVehicleStatus(vehicle.effectiveStatus)}</span>
                        </span>
                      </div>
                  </div>
                </div>
              );
            })}

            {filteredVehicles.length === 0 && (
              <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-2">
                <Car className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">검색된 차량이 없습니다.</p>
                <p className="text-[11px] text-slate-400">필터나 검색어를 변경해 보세요.</p>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 2 (Right): Vehicle Detail Panel                         */}
        {/* ============================================================== */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {selectedVehicle ? (
            <>
              {/* Top Hero Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  {/* Left Hero Photo - Transparent background with floating 3D drop-shadow */}
                  <div className="relative w-full sm:w-[240px] md:w-[260px] h-[145px] shrink-0 flex items-center justify-center p-2">
                    <Image
                      src={getVehicleHero(selectedVehicle)}
                      alt={selectedVehicle.model}
                      fill
                      className="object-contain filter drop-shadow-[0_12px_22px_rgba(0,0,0,0.20)] transition-transform duration-300 hover:scale-[1.03]"
                      priority
                    />
                  </div>

                  {/* Right Header Info */}
                  <div className="flex-1 w-full min-w-0 space-y-2.5">
                    {/* Row 1: Model Title & Actions */}
                    <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-3">
                      <h2 className="text-lg sm:text-xl font-black text-slate-950 tracking-tight break-keep">
                        {selectedVehicle.model}
                      </h2>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Status Dropdown Button */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer shadow-2xs"
                          >
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatVehicleStatus(selectedVehicle.effectiveStatus)}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                          {isStatusDropdownOpen && (
                            <div className="absolute right-0 mt-1 w-32 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30">
                              {STATUS_OPTIONS.map((st) => (
                                <button
                                  key={st.value}
                                  type="button"
                                  onClick={() => {
                                    handleQuickChangeStatus(selectedVehicle.id, st.value);
                                    setIsStatusDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-xs font-bold flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                                    selectedVehicle.effectiveStatus === st.value ? 'text-[#1E60F3] bg-blue-50/50' : 'text-slate-700'
                                  }`}
                                >
                                  <span>{st.label}</span>
                                  {selectedVehicle.effectiveStatus === st.value && <Check className="w-3 h-3 text-[#1E60F3]" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={handleOpenEdit}
                          className="bg-[#1E60F3] hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>정보 수정</span>
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Plate & Copy Button */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                        {selectedVehicle.plate}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyPlate}
                        title="차량번호 복사"
                        className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {copiedToast && (
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                          복사됨!
                        </span>
                      )}
                    </div>

                    {/* Row 3: Badges */}
                    <div className="flex items-center gap-1.5">
                      <span className="bg-blue-50 text-[#1E60F3] text-[10px] font-bold px-2 py-0.5 rounded">
                        {selectedVehicle.uiCategory === 'sprinter'
                          ? '스프린터'
                          : selectedVehicle.uiCategory === 'van'
                          ? '밴'
                          : selectedVehicle.uiCategory === 'suv'
                          ? 'SUV'
                          : '세단'}
                      </span>
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">
                        {selectedVehicle.fuelDisplay}
                      </span>
                    </div>

                    {/* Row 4: Quick Specs 3 Items */}
                    <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-normal">제조사</span>
                          <span className="font-bold text-slate-800">{selectedVehicle.brand}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-normal">연식</span>
                          <span className="font-bold text-slate-800">{selectedVehicle.year}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-normal">승차정원</span>
                          <span className="font-bold text-slate-800">{selectedVehicle.capacity}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-6 border-b border-slate-200 px-1 text-xs font-bold text-slate-500">
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setActiveDetailTab('info');
                  }}
                  className={`pb-2.5 transition-all cursor-pointer relative ${
                    activeDetailTab === 'info'
                      ? 'text-[#1E60F3] font-black after:content-[""] after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-[#1E60F3]'
                      : 'hover:text-slate-800'
                  }`}
                >
                  기본 제원
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setActiveDetailTab('calendar');
                  }}
                  className={`pb-2.5 transition-all cursor-pointer relative ${
                    activeDetailTab === 'calendar'
                      ? 'text-[#1E60F3] font-black after:content-[""] after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-[#1E60F3]'
                      : 'hover:text-slate-800'
                  }`}
                >
                  예약 일정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setActiveDetailTab('tips');
                  }}
                  className={`pb-2.5 transition-all cursor-pointer relative ${
                    activeDetailTab === 'tips'
                      ? 'text-[#1E60F3] font-black after:content-[""] after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-[#1E60F3]'
                      : 'hover:text-slate-800'
                  }`}
                >
                  편의 사양
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setActiveDetailTab('memo');
                  }}
                  className={`pb-2.5 transition-all cursor-pointer relative ${
                    activeDetailTab === 'memo'
                      ? 'text-[#1E60F3] font-black after:content-[""] after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-[#1E60F3]'
                      : 'hover:text-slate-800'
                  }`}
                >
                  운영 메모
                </button>
              </div>

              {/* Tab Content Display */}
              {activeDetailTab === 'info' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  {/* LEFT BOX: ℹ️ 기본 제원 (6 cols) */}
                  <div className="md:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
                      <Info className="w-3.5 h-3.5 text-slate-700" />
                      <h3 className="text-xs font-black text-slate-900">기본 제원</h3>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-400 font-medium">제조사</span>
                        <span className="font-bold text-slate-800">{selectedVehicle.brand}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-t border-slate-100">
                        <span className="text-slate-400 font-medium">연식</span>
                        <span className="font-bold text-slate-800">{selectedVehicle.year}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-t border-slate-100">
                        <span className="text-slate-400 font-medium">승차 정원</span>
                        <span className="font-bold text-slate-800">{selectedVehicle.capacity}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-t border-slate-100">
                        <span className="text-slate-400 font-medium">색상</span>
                        <span className="font-bold text-slate-800">{selectedVehicle.color}</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT SIDE (6 cols): 예약 일정 + 탑승 편의 사양 */}
                  <div className="md:col-span-6 space-y-4">
                    {/* Card 1: 📅 예약 일정 */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-slate-700" />
                          <h3 className="text-xs font-black text-slate-900">예약 일정</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCalendarModalOpen(true)}
                          className="text-[11px] font-bold text-[#1E60F3] hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <span>전체 달력 보기</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>

                      {/* 5-Day Strip */}
                      <div className="grid grid-cols-5 gap-1 text-center pt-1">
                        {fiveDays.map((d, idx) => {
                          const isAvailable = d.status === '예약 가능';

                          return (
                            <div key={idx} className="space-y-2">
                              <div className="text-[10px] font-bold text-slate-600 leading-tight">
                                <div>{d.label}</div>
                                <div className="text-[9px] text-slate-400">{d.dayOfWeek}</div>
                              </div>
                              <div className="flex justify-center" title={d.detail || d.status}>
                                {isAvailable ? (
                                  <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200/70 flex items-center justify-center text-[#1E60F3]">
                                    <Check className="w-3 h-3 stroke-[2.5]" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-400">
                                    <Minus className="w-3 h-3 stroke-[2.5]" />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Card 2: ✨ 탑승 편의 사양 */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-slate-700" />
                          <h3 className="text-xs font-black text-slate-900">탑승 편의 사양</h3>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/60 flex items-center gap-1">
                          <Info className="w-2.5 h-2.5 text-slate-400" />
                          실차 기준
                        </span>
                      </div>

                      {tips.isVerified ? (
                        <div className="space-y-3 text-xs pt-0.5">
                          {/* 1열 충전 포트 */}
                          <div className="flex items-start gap-2.5">
                            <Zap className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-black text-slate-900 text-[11px]">1열 충전 포트</div>
                              <div className="text-[11px] font-medium text-slate-400">
                                {tips.frontCharging}
                              </div>
                            </div>
                          </div>

                          {/* VIP석 충전 포트 */}
                          <div className="flex items-start gap-2.5">
                            <Zap className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-black text-slate-900 text-[11px]">VIP석 충전 포트</div>
                              <div className="text-[11px] font-medium text-slate-400">
                                {tips.rearCharging}
                              </div>
                            </div>
                          </div>

                          {/* 사용 연료: 경유 / 휘발유 */}
                          <div className="flex items-start gap-2.5">
                            <Fuel className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-black text-slate-900 text-[11px]">
                                사용 연료: {selectedVehicle.fuelDisplay}
                              </div>
                              <div className="text-[11px] font-medium text-slate-400">
                                {tips.fuelTip}
                              </div>
                            </div>
                          </div>

                          {/* 220V 파워 아울렛 */}
                          <div className="flex items-start gap-2.5">
                            <Plug className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-black text-slate-900 text-[11px]">220V 파워 아울렛</div>
                              <div className="text-[11px] font-medium text-slate-400">
                                {tips.powerTip}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-5 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-2">
                          <Zap className="w-5 h-5 text-slate-400" />
                          <p className="text-xs text-slate-500 font-medium">
                            등록된 편의 사양 정보가 없습니다.
                          </p>
                          <button
                            type="button"
                            onClick={handleOpenEdit}
                            className="mt-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E60F3] text-xs font-bold transition-colors cursor-pointer border border-blue-200/80 inline-flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ 충전 단자 정보 입력하기</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Calendar Tab */}
              {activeDetailTab === 'calendar' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-[#1E60F3]" />
                      <h3 className="text-sm font-black text-slate-900">
                        {selectedVehicle.model} ({selectedVehicle.plate}) 일자별 가용성 현황
                      </h3>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">2주간 실시간 스케줄</span>
                  </div>

                  <div className="grid grid-cols-7 gap-2 text-center">
                    {['일', '월', '화', '수', '목', '금', '토'].map((dw, i) => (
                      <div key={i} className="text-xs font-bold text-slate-400 pb-1">
                        {dw}
                      </div>
                    ))}
                    {fourteenDays.map((d, i) => {
                      const isAvailable = d.status === '예약 가능';
                      return (
                        <div
                          key={i}
                          className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col items-center gap-1.5"
                          title={d.detail || d.status}
                        >
                          <span className="text-xs font-black text-slate-700">{d.label}</span>
                          {isAvailable ? (
                            <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200/70 flex items-center justify-center text-[#1E60F3]">
                              <Check className="w-3 h-3 stroke-[2.5]" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-400">
                              <Minus className="w-3 h-3 stroke-[2.5]" />
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-slate-500">
                            {d.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 3: Tips Tab */}
              {activeDetailTab === 'tips' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#1E60F3]" />
                      <h3 className="text-sm font-black text-slate-900">
                        {selectedVehicle.model} 탑승 편의 사양
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/60 flex items-center gap-1">
                      <Info className="w-2.5 h-2.5 text-slate-400" />
                      실차 기준
                    </span>
                  </div>

                  {tips.isVerified ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                        <div className="flex items-center gap-2 text-slate-900 font-black text-xs">
                          <Zap className="w-4 h-4 text-[#1E60F3]" />
                          <span>1열 충전 포트</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.frontCharging}</p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                        <div className="flex items-center gap-2 text-slate-900 font-black text-xs">
                          <Zap className="w-4 h-4 text-[#1E60F3]" />
                          <span>VIP석 충전 포트</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.rearCharging}</p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                        <div className="flex items-center gap-2 text-slate-900 font-black text-xs">
                          <Fuel className="w-4 h-4 text-[#1E60F3]" />
                          <span>사용 연료: {selectedVehicle.fuelDisplay}</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.fuelTip}</p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                        <div className="flex items-center gap-2 text-slate-900 font-black text-xs">
                          <Plug className="w-4 h-4 text-[#1E60F3]" />
                          <span>220V 파워 아울렛</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.powerTip}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-center space-y-2.5">
                      <Zap className="w-6 h-6 text-slate-400" />
                      <p className="text-xs text-slate-600 font-semibold">
                        아직 {selectedVehicle.model}의 충전 포트 및 편의 사양이 등록되지 않았습니다.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenEdit}
                        className="px-3.5 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ 충전 단자 정보 입력하기</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Memo Tab */}
              {activeDetailTab === 'memo' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Edit2 className="w-4 h-4 text-[#1E60F3]" />
                      <h3 className="text-sm font-black text-slate-900">
                        {selectedVehicle.model} ({selectedVehicle.plate}) 운영 메모
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenEdit}
                      className="text-xs font-bold text-[#1E60F3] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>정보 수정</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 min-h-[120px] text-xs text-slate-700 whitespace-pre-wrap">
                    {memos[selectedVehicle.id] || selectedVehicle.adminMemo || '등록된 운영 메모가 없습니다. [정보 수정] 버튼을 눌러 메모를 작성해 보세요.'}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl p-10 border border-slate-200 text-center space-y-2">
              <Car className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-700">선택된 차량이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL 1: 차량 정보 수정 Modal (✎ 정보 수정)                      */}
      {/* ============================================================== */}
      {isEditModalOpen && selectedVehicle && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">
                차량 정보 수정 ({selectedVehicle.plate})
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">운행 상태</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STATUS_OPTIONS.map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => setEditStatus(st.value)}
                      className={`py-2 px-2 rounded-xl font-bold cursor-pointer transition-all border text-center text-xs ${
                        editStatus === st.value
                          ? 'bg-[#1E60F3] text-white border-[#1E60F3]'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">차량 색상</label>
                <input
                  type="text"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  placeholder="예: 오로라 블랙 펄"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-[#1E60F3]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">운영 메모</label>
                <textarea
                  rows={3}
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  placeholder="특이사항, 충전 단자 규격, 하이패스 단말기 번호, 세차 주기 등..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:outline-none focus:border-[#1E60F3]"
                />
              </div>
              {saveEditError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                  {saveEditError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => setIsEditModalOpen(false)}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveEdit}
                className="px-4 py-2 text-xs font-bold bg-[#1E60F3] hover:bg-blue-700 text-white rounded-xl cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>저장하기</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: 전체 달력 보기 Modal (📅 전체 달력 보기)                 */}
      {/* ============================================================== */}
      {isCalendarModalOpen && selectedVehicle && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#1E60F3]" />
                <h3 className="text-base font-black text-slate-900">
                  {selectedVehicle.model} ({selectedVehicle.plate}) 월간 예약 현황
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCalendarModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                선택하신 차량의 2주간 일자별 예약 가용성 및 충돌 상태를 확인하실 수 있습니다.
              </p>

              <div className="grid grid-cols-7 gap-1.5 text-center pt-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((dw, i) => (
                  <div key={i} className="text-[10px] font-bold text-slate-400 pb-1">
                    {dw}
                  </div>
                ))}
                {fourteenDays.map((d, i) => {
                  const badgeClass =
                    d.status === '예약 있음'
                      ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : d.status === '운행 중'
                      ? 'bg-blue-50 text-[#1E60F3] border-blue-200'
                      : d.status === '정비 중'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : d.status === '확인 중...'
                      ? 'bg-slate-100 text-slate-500 border-slate-200 animate-pulse'
                      : d.status === '확인 불가'
                      ? 'bg-rose-100 text-rose-700 border-rose-300'
                      : d.status === '미확인'
                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                      : 'bg-emerald-50 text-emerald-600 border-emerald-200';

                  const label =
                    d.status === '확인 중...'
                      ? '조회중'
                      : d.status === '확인 불가'
                      ? '오류'
                      : d.status === '예약 있음'
                      ? '예약있음'
                      : d.status === '운행 중'
                      ? '운행중'
                      : d.status === '정비 중'
                      ? '정비중'
                      : d.status === '미확인'
                      ? '미확인'
                      : '가능';

                  return (
                    <div
                      key={i}
                      className="p-2 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col items-center gap-1"
                      title={d.detail || d.status}
                    >
                      <span className="text-[11px] font-black text-slate-700">{d.label}</span>
                      <span className={`text-[8px] font-bold px-1 py-0.2 rounded border ${badgeClass}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCalendarModalOpen(false)}
                className="px-4 py-2 text-xs font-bold bg-slate-900 text-white rounded-xl cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Vehicle Registration Modal */}
      <NewVehicleModal
        isOpen={isNewVehicleModalOpen}
        onClose={() => setIsNewVehicleModalOpen(false)}
        onSubmit={handleCreateVehicle}
      />

      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#0B1E48] text-white px-4 py-3 rounded-2xl shadow-xl border border-blue-500/30 flex items-center gap-2.5 text-xs font-bold animate-slide-up">
          <span className="w-2 h-2 rounded-full bg-[#1E60F3] animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
