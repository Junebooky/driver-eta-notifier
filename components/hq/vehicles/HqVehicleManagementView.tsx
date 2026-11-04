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
  Trash2,
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
  const [vehicleIconError, setVehicleIconError] = useState(false);

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
    const refresh = () => { if (document.visibilityState === 'visible') void fetchAvailability(); };
    const timer = setInterval(refresh, 8000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('vip_hq_schedules_updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer); window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('vip_hq_schedules_updated', refresh);
      document.removeEventListener('visibilitychange', refresh);
      if (activeAbortRef.current) activeAbortRef.current.abort();
    };
  }, [fetchAvailability]);

  // 6. Modals & Toast State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isNewVehicleModalOpen, setIsNewVehicleModalOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<VipRealVehicle | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  }, []);

  // Custom vehicles dynamically added via NewVehicleModal (persisted to localStorage)
  const [customVehicles, setCustomVehicles] = useState<VipRealVehicle[]>([]);
  // Deleted vehicle IDs (persisted to localStorage)
  const [deletedVehicleIds, setDeletedVehicleIds] = useState<string[]>([]);

  useEffect(() => {
    let customList: VipRealVehicle[] = [];
    try {
      const stored = localStorage.getItem('vip_hq_custom_vehicles');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          customList = parsed;
          setCustomVehicles(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached custom vehicles', e);
    }

    try {
      const storedDeleted = localStorage.getItem('vip_hq_deleted_vehicle_ids');
      if (storedDeleted) {
        const parsedDeleted = JSON.parse(storedDeleted);
        if (Array.isArray(parsedDeleted)) {
          // Self-heal: Any plate that the user has explicitly registered should NOT remain deleted
          const customPlates = new Set(customList.map((cv) => cv.plate?.trim().replace(/\s+/g, '')));
          const cleaned = parsedDeleted.filter((id) => !customPlates.has(String(id).trim().replace(/\s+/g, '')));
          setDeletedVehicleIds(cleaned);
          if (cleaned.length !== parsedDeleted.length) {
            localStorage.setItem('vip_hq_deleted_vehicle_ids', JSON.stringify(cleaned));
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached deleted vehicle ids', e);
    }
  }, []);

  const allBaseVehicles = useMemo(() => {
    // 1. Plates in customVehicles (user explicitly registered these, so they take highest priority)
    const customPlates = new Set(customVehicles.map((v) => v.plate.trim().replace(/\s+/g, '')));

    // 2. Active deleted set, excluding any plate that exists in customVehicles
    const activeDeletedSet = new Set(
      deletedVehicleIds
        .map((id) => id.trim().replace(/\s+/g, ''))
        .filter((cleanId) => !customPlates.has(cleanId))
    );

    const isNotDeleted = (v: VipRealVehicle) => {
      const cleanPlate = v.plate.trim().replace(/\s+/g, '');
      const cleanId = v.id.trim().replace(/\s+/g, '');
      if (activeDeletedSet.has(cleanPlate) || activeDeletedSet.has(cleanId)) {
        return false;
      }
      return true;
    };

    const validCustom = customVehicles.filter(isNotDeleted);

    // Filter default vehicles: not deleted AND not superseded by a custom vehicle with same plate
    const validDefault = VIP_REAL_VEHICLES.filter(
      (v) => isNotDeleted(v) && !customPlates.has(v.plate.trim().replace(/\s+/g, ''))
    );

    return [...validCustom, ...validDefault];
  }, [customVehicles, deletedVehicleIds]);

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
    const normalizedPlate = data.plate.trim();
    const cleanPlate = normalizedPlate.replace(/\s+/g, '');

    const newVehicle: VipRealVehicle = {
      id: `vehicle-custom-${Date.now()}`,
      uuid: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `custom-${Date.now()}`,
      plate: normalizedPlate,
      plateShort: normalizedPlate.split(/\s+/).pop() || normalizedPlate.slice(-4),
      model: data.model.trim(),
      modelShort: data.model.trim().replace(/^(벤츠|현대|기아|제네시스)\s+/, ''),
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
      subType: data.model.trim(),
      capacity: data.capacity,
      status: '차고지 대기', // Initial status: displays as '배차 가능'
      fuelType: data.fuelType === '경유' ? '디젤' : data.fuelType === '휘발유' ? '가솔린' : '하이브리드',
      year: '2026',
      color: '블랙 (기본)',
      imageUrl: data.imageUrl,
    };

    // 1. Immediately un-delete this plate if it was previously marked deleted
    setDeletedVehicleIds((prev) => {
      const next = prev.filter((id) => {
        const cleanId = id.trim().replace(/\s+/g, '');
        if (cleanId === cleanPlate || id === normalizedPlate) return false;
        const matchingDefault = VIP_REAL_VEHICLES.find(
          (dv) => dv.plate.replace(/\s+/g, '') === cleanPlate
        );
        if (matchingDefault && (matchingDefault.id === id || matchingDefault.plate === id)) {
          return false;
        }
        return true;
      });
      try {
        localStorage.setItem('vip_hq_deleted_vehicle_ids', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to update deleted vehicle ids in localStorage', err);
      }
      return next;
    });

    // 2. Add to customVehicles state and localStorage (replace duplicate if exists)
    setCustomVehicles((prev) => {
      const filteredPrev = prev.filter((v) => v.plate.trim().replace(/\s+/g, '') !== cleanPlate);
      const next = [newVehicle, ...filteredPrev];
      try {
        localStorage.setItem('vip_hq_custom_vehicles', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save custom vehicles to localStorage', err);
      }
      return next;
    });

    // 3. Reset filters so the new vehicle is immediately visible
    setSelectedCategory('all');
    setFuelFilter('all');
    setSearchQuery('');

    // 4. Focus on the new vehicle
    setSelectedVehicleId(newVehicle.id);
    setIsNewVehicleModalOpen(false);
    showToast(`차량 '${normalizedPlate}'이(가) 등록되었습니다.`);
    haptics.success();
  };

  // Delete Vehicle Handler
  const handleConfirmDeleteVehicle = (vehicle: VipRealVehicle) => {
    haptics.warningPulse();

    const cleanPlate = vehicle.plate.trim().replace(/\s+/g, '');

    // 1. Remove from custom vehicles state if present
    setCustomVehicles((prev) => {
      const next = prev.filter(
        (v) => v.id !== vehicle.id && v.plate.trim().replace(/\s+/g, '') !== cleanPlate
      );
      try {
        localStorage.setItem('vip_hq_custom_vehicles', JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to update custom vehicles in localStorage', e);
      }
      return next;
    });

    // 2. Add to deleted vehicle IDs
    setDeletedVehicleIds((prev) => {
      const next = Array.from(new Set([...prev, vehicle.id, vehicle.plate.trim(), cleanPlate]));
      try {
        localStorage.setItem('vip_hq_deleted_vehicle_ids', JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save deleted vehicle ids to localStorage', e);
      }
      return next;
    });

    // 3. Clear modal
    setVehicleToDelete(null);

    // 4. Update selected vehicle to next available vehicle
    const remaining = enrichedVehicles.filter(
      (v) => v.id !== vehicle.id && v.plate.trim().replace(/\s+/g, '') !== cleanPlate
    );
    if (remaining.length > 0) {
      setSelectedVehicleId(remaining[0].id);
    }

    // 5. Toast & haptics
    showToast(`차량 '${vehicle.plate}' (${vehicle.model})이(가) 삭제되었습니다.`);
    haptics.success();
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card: Icon + Title + Count */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:px-5 shadow-2xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* 차량관리 아이콘 & 마우스 호버 툴팁 */}
          <div className="relative group/vehicles inline-flex items-center justify-center cursor-pointer shrink-0">
            {!vehicleIconError ? (
              <img
                src="/images/icons/vehicles/icon_vehicle.png"
                alt="차량 관리"
                onError={() => setVehicleIconError(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0 transition-transform duration-150 group-hover/vehicles:scale-110"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#1E60F3] flex items-center justify-center shrink-0 transition-transform duration-150 group-hover/vehicles:scale-110 shadow-2xs">
                <Car className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            )}

            {/* Hover Tooltip: 최상단 내브바와 동일한 블랙 말풍선 규격 */}
            <div className="absolute top-full left-0 pt-2 hidden group-hover/vehicles:flex flex-col items-start pointer-events-none z-50">
              <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 ml-3.5 shadow-xs" />
              <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                VIP 의전 세단·SUV·밴·스프린터의 실시간 배차 및 제원을 관리해요
              </span>
            </div>
          </div>

          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            차량 관리
          </h2>
          <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full text-xs">
            {allBaseVehicles.length}대
          </span>
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
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>차량 등록</span>
        </button>
      </div>

      {/* Top Horizontal Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* 1. 차량 분류 (Category Pills) - 가로 스크롤 및 충분한 간격 확보 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 xl:pb-0 scrollbar-none flex-1 min-w-0">
            {[
              { key: "all", label: "전체", count: categoryCounts.all, icon: Car },
              { key: "sedan", label: "세단", count: categoryCounts.sedan, icon: Car },
              { key: "suv", label: "SUV", count: categoryCounts.suv, icon: Car },
              { key: "van", label: "밴", count: categoryCounts.van, icon: Truck },
              { key: "sprinter", label: "스프린터", count: categoryCounts.sprinter, icon: Bus },
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
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 ${isSelected
                    ? "bg-[#0050FF] text-white shadow-xs"
                    : "bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200"
                    }`}
                >
                  <IconComp className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-slate-400"}`} />
                  <span>{cat.label}</span>
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 2. Right: Fuel Dropdown & Search & + 차량 등록 */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            {/* 세로 구분선 (데스크톱) */}
            <div className="hidden xl:block w-px h-6 bg-slate-200 shrink-0" />

            {/* Fuel Type Compact Dropdown */}
            <div className="relative shrink-0">
              <select
                value={fuelFilter}
                onChange={(e) => {
                  haptics.selection();
                  setFuelFilter(e.target.value as FuelTypeFilter);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs transition-colors"
              >
                <option value="all">유종: 전체</option>
                <option value="휘발유">휘발유 ({fuelCounts.gasoline})</option>
                <option value="경유">경유 ({fuelCounts.diesel})</option>
                {fuelCounts.hybrid > 0 && <option value="하이브리드">하이브리드 ({fuelCounts.hybrid})</option>}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative w-44 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="차량명이나 번호로 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#0050FF] placeholder:text-slate-400 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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
            <div className="flex items-center gap-2">
              {deletedVehicleIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.impactMedium();
                    setDeletedVehicleIds([]);
                    try {
                      localStorage.removeItem("vip_hq_deleted_vehicle_ids");
                    } catch (e) {
                      console.warn(e);
                    }
                    showToast("삭제된 모든 차량이 복구되었습니다.");
                  }}
                  className="text-[11px] font-bold text-slate-600 hover:text-[#0050FF] flex items-center gap-1 transition-colors cursor-pointer bg-slate-100/80 hover:bg-blue-50 px-2 py-0.5 rounded-lg border border-slate-200"
                  title="삭제된 차량 초기화 및 복구"
                >
                  <RefreshCw className="w-2.5 h-2.5 text-slate-400" />
                  <span>복구</span>
                </button>
              )}
              <span className="text-xs text-slate-400 font-bold">
                {filteredVehicles.length}대
              </span>
            </div>
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
                  className={`rounded-2xl p-3 sm:p-3.5 transition-all cursor-pointer flex items-center gap-3 relative shadow-2xs group border ${isSelected
                    ? "bg-blue-50/70 border-blue-200/90 border-l-4 border-l-[#0050FF] shadow-xs"
                    : "bg-white hover:bg-slate-50/80 border-slate-200/80 hover:border-slate-300"
                    }`}
                >
                  {/* Left Thumbnail Image */}
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
                      <h3 className="text-xs sm:text-[13px] font-bold text-slate-900 tracking-tight truncate">
                        {vehicle.model}
                      </h3>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    </div>

                    {/* Middle: Badges */}
                    <div className="flex items-center gap-1.5 my-1">
                      <span className="bg-blue-50 text-[#0050FF] text-[10px] font-bold px-1.5 py-0.2 rounded">
                        {vehicle.uiCategory === "sprinter"
                          ? "스프린터"
                          : vehicle.uiCategory === "van"
                            ? "밴"
                            : vehicle.uiCategory === "suv"
                              ? "SUV"
                              : "세단"}
                      </span>
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.2 rounded">
                        {vehicle.fuelDisplay}
                      </span>
                    </div>

                    {/* Bottom: Plate (Tag Style) & Status Pill */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-xs sm:text-[13px] font-black text-slate-900 tracking-tight px-1.5 py-0.5 rounded-md bg-slate-100/90 border border-slate-200/80">
                        {vehicle.plate}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200/60 shrink-0">
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
                {deletedVehicleIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.impactMedium();
                      setDeletedVehicleIds([]);
                      try {
                        localStorage.removeItem("vip_hq_deleted_vehicle_ids");
                      } catch (e) {
                        console.warn(e);
                      }
                      showToast("삭제된 모든 차량이 복구되었습니다.");
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>삭제된 차량 복구</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 2 (Right): Selected Vehicle Details                    */}
        {/* ============================================================== */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {selectedVehicle ? (
            <>
              {/* Top Hero Header Card (Streamlined, no redundant quick specs) */}
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
                    {/* Row 1: Model Title & Minimal Icon Actions */}
                    <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-3">
                      <h2 className="text-lg sm:text-xl font-black text-slate-950 tracking-tight break-keep">
                        {selectedVehicle.model}
                      </h2>

                      <div className="flex items-center gap-1.5 shrink-0">
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
                                  className={`w-full text-left px-3 py-1.5 text-xs font-bold flex items-center justify-between hover:bg-slate-50 cursor-pointer ${selectedVehicle.effectiveStatus === st.value ? "text-[#0050FF] bg-blue-50/50" : "text-slate-700"
                                    }`}
                                >
                                  <span>{st.label}</span>
                                  {selectedVehicle.effectiveStatus === st.value && <Check className="w-3 h-3 text-[#0050FF]" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Minimal Edit Icon Button */}
                        <button
                          type="button"
                          onClick={handleOpenEdit}
                          className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors cursor-pointer shadow-2xs border border-transparent hover:border-slate-200"
                          title="정보 수정"
                          aria-label="정보 수정"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Minimal Delete Icon Button */}
                        <button
                          type="button"
                          onClick={() => {
                            haptics.warningPulse();
                            setVehicleToDelete(selectedVehicle);
                          }}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-colors cursor-pointer shadow-2xs border border-transparent hover:border-rose-100"
                          title="차량 삭제"
                          aria-label="차량 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
                      <span className="bg-blue-50 text-[#0050FF] text-[10px] font-bold px-2 py-0.5 rounded">
                        {selectedVehicle.uiCategory === "sprinter"
                          ? "스프린터"
                          : selectedVehicle.uiCategory === "van"
                            ? "밴"
                            : selectedVehicle.uiCategory === "suv"
                              ? "SUV"
                              : "세단"}
                      </span>
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded">
                        {selectedVehicle.fuelDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs (4 distinct tabs) */}
              <div className="flex items-center gap-6 border-b border-slate-200 px-1 text-xs font-bold text-slate-500">
                {[
                  { key: "info", label: "기본 제원" },
                  { key: "calendar", label: "예약 일정" },
                  { key: "tips", label: "편의 사양" },
                  { key: "memo", label: "운영 메모" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setActiveDetailTab(tab.key as any);
                    }}
                    className={`pb-2.5 transition-all cursor-pointer relative ${activeDetailTab === tab.key
                      ? "text-[#0050FF] font-black after:content-[''] after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-[#0050FF]"
                      : "hover:text-slate-800"
                      }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Tab Content 1: 기본 제원 (단독 뷰) */}
              {activeDetailTab === "info" && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-[#0050FF]" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {selectedVehicle.model} ({selectedVehicle.plate}) 기본 제원
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenEdit}
                      className="text-xs font-semibold text-[#0050FF] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>정보 수정</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">제조사</span>
                      <span className="font-bold text-slate-900 mt-0.5 block">{selectedVehicle.brand}</span>
                    </div>
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">차량 모델</span>
                      <span className="font-bold text-slate-900 mt-0.5 block">{selectedVehicle.model}</span>
                    </div>
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">차량 번호판</span>
                      <span className="font-bold text-slate-900 mt-0.5 block">{selectedVehicle.plate}</span>
                    </div>
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">차급 분류</span>
                      <span className="font-bold text-slate-900 mt-0.5 block">
                        {selectedVehicle.uiCategory === "sprinter"
                          ? "스프린터"
                          : selectedVehicle.uiCategory === "van"
                            ? "밴"
                            : selectedVehicle.uiCategory === "suv"
                              ? "SUV"
                              : "세단"}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">연식</span>
                      <span className="font-bold text-slate-900 mt-0.5 block">{selectedVehicle.year}</span>
                    </div>
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">승차 정원</span>
                      <span className="font-bold text-slate-900 mt-0.5 block">{selectedVehicle.capacity}</span>
                    </div>
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">차량 색상</span>
                      <span className="font-bold text-slate-900 mt-0.5 block">{selectedVehicle.color}</span>
                    </div>
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">사용 연료</span>
                      <span className="font-bold text-slate-900 mt-0.5 block">{selectedVehicle.fuelDisplay}</span>
                    </div>
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium block">운행 상태</span>
                      <span className="font-bold text-blue-600 mt-0.5 block">{formatVehicleStatus(selectedVehicle.effectiveStatus)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content 2: 예약 일정 (단독 뷰) */}
              {activeDetailTab === "calendar" && (
                <div className="space-y-4">
                  {/* 5-Day Quick Strip */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#0050FF]" />
                        <h3 className="text-sm font-bold text-slate-900">5일간 단기 배차 일정</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCalendarModalOpen(true)}
                        className="text-xs font-semibold text-[#0050FF] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>전체 달력 보기</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-5 gap-2 text-center">
                      {fiveDays.map((d, i) => {
                        const isAvail = d.status === "예약 가능";
                        return (
                          <div
                            key={i}
                            className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${isAvail
                              ? "bg-blue-50/40 border-blue-100"
                              : "bg-slate-50 border-slate-100"
                              }`}
                            title={d.detail || d.status}
                          >
                            <span className="text-xs font-bold text-slate-700">
                              {d.label} {d.dayOfWeek}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isAvail
                                ? "bg-blue-50 text-[#0050FF] border border-blue-200/60"
                                : "bg-slate-200/80 text-slate-700"
                                }`}
                            >
                              {d.status}
                            </span>
                            {d.detail && (
                              <span className="text-[10px] text-slate-400 truncate max-w-full">
                                {d.detail}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2-Week Full Calendar */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-[#0050FF]" />
                        <h3 className="text-sm font-bold text-slate-900">2주간 일자별 가용성 현황</h3>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">실시간 스케줄</span>
                    </div>

                    <div className="grid grid-cols-7 gap-2 text-center">
                      {["일", "월", "화", "수", "목", "금", "토"].map((dw, i) => (
                        <div key={i} className="text-xs font-bold text-slate-400 pb-1">
                          {dw}
                        </div>
                      ))}
                      {fourteenDays.map((d, i) => {
                        const isAvailable = d.status === "예약 가능";
                        return (
                          <div
                            key={i}
                            className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col items-center gap-1.5"
                            title={d.detail || d.status}
                          >
                            <span className="text-xs font-bold text-slate-700">{d.label}</span>
                            {isAvailable ? (
                              <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200/70 flex items-center justify-center text-[#0050FF]">
                                <Check className="w-3 h-3 stroke-[2.5]" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-400">
                                <Minus className="w-3 h-3 stroke-[2.5]" />
                              </div>
                            )}
                            <span className="text-[10px] font-bold text-slate-500 truncate max-w-full">
                              {d.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content 3: 편의 사양 (단독 뷰) */}
              {activeDetailTab === "tips" && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#0050FF]" />
                      <h3 className="text-sm font-bold text-slate-900">
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
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                          <Zap className="w-4 h-4 text-[#0050FF]" />
                          <span>1열 충전 포트</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.frontCharging}</p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                          <Zap className="w-4 h-4 text-[#0050FF]" />
                          <span>VIP석 충전 포트</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.rearCharging}</p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                          <Fuel className="w-4 h-4 text-[#0050FF]" />
                          <span>사용 연료: {selectedVehicle.fuelDisplay}</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.fuelTip}</p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                          <Plug className="w-4 h-4 text-[#0050FF]" />
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
                        className="px-3.5 py-2 rounded-xl bg-[#0050FF] hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ 충전 단자 정보 입력하기</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content 4: 운영 메모 (단독 뷰) */}
              {activeDetailTab === "memo" && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Edit2 className="w-4 h-4 text-[#0050FF]" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {selectedVehicle.model} ({selectedVehicle.plate}) 운영 메모
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenEdit}
                      className="text-xs font-semibold text-[#0050FF] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>정보 수정</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 min-h-[120px] text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {memos[selectedVehicle.id] || selectedVehicle.adminMemo || "등록된 운영 메모가 없습니다. [정보 수정] 버튼을 눌러 메모를 작성해 보세요."}
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
                      className={`py-2 px-2 rounded-xl font-bold cursor-pointer transition-all border text-center text-xs ${editStatus === st.value
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

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => {
                  setIsEditModalOpen(false);
                  haptics.warningPulse();
                  setVehicleToDelete(selectedVehicle);
                }}
                className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>차량 삭제</span>
              </button>
              <div className="flex items-center gap-2">
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

      {/* Delete Vehicle Confirmation Modal */}
      {vehicleToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-150 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                <Trash2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-base font-black text-slate-900 tracking-tight">차량 삭제</h3>
                <p className="text-xs text-slate-500 break-keep">
                  정말로 이 차량을 목록에서 삭제하시겠습니까?
                </p>
              </div>
            </div>

            {/* Target Vehicle Summary Card */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
              <div className="relative w-16 h-12 shrink-0 flex items-center justify-center">
                <Image
                  src={getVehicleHero(vehicleToDelete)}
                  alt={vehicleToDelete.model}
                  fill
                  className="object-contain filter drop-shadow-xs"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-slate-900 truncate">
                  {vehicleToDelete.model}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    {vehicleToDelete.plate}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {(vehicleToDelete as any).fuelDisplay || vehicleToDelete.fuelType}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
              * 삭제된 차량은 목록 및 통계에서 즉시 제외되며, 필요시 언제든지 복구할 수 있습니다.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setVehicleToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteVehicle(vehicleToDelete)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>삭제 완료</span>
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
