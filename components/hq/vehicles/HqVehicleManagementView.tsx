'use client';
import { scheduleOverlapsInterval } from '@/utils/dispatchInterval';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  reconcileRegisteredVehicle,
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

  // 2. Selected Vehicle - Defaults to registered 125호 9982 (Benz Sprinter 319 CDI)
  const defaultCarId = useMemo(() => {
    return VIP_REAL_VEHICLES[0].id;
  }, []);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(defaultCarId);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isFuelDropdownOpen, setIsFuelDropdownOpen] = useState(false);
  const fuelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fuelDropdownRef.current && !fuelDropdownRef.current.contains(e.target as Node)) {
        setIsFuelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // The HQ server registry is authoritative across devices and dispatch.
  const [customVehicles, setCustomVehicles] = useState<VipRealVehicle[]>([]);
  const [deletedVehicleIds, setDeletedVehicleIds] = useState<string[]>([]);
  const [archivedVehicleProfiles, setArchivedVehicleProfiles] = useState<VipRealVehicle[]>([]);
  const [legacyVehicleProfiles, setLegacyVehicleProfiles] = useState<VipRealVehicle[]>([]);
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [registryBusy, setRegistryBusy] = useState(false);

  const fetchServerRegistry = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/registry', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !Array.isArray(data.records)) {
        throw new Error(data.error || '공용 차량 등록부를 불러오지 못했습니다.');
      }
      const records: Array<{ vehicle_id: string; plate: string; archived: boolean; profile: VipRealVehicle }> = data.records;
      setCustomVehicles(records.filter(row => !row.archived).map(row => row.profile));
      setArchivedVehicleProfiles(records.filter(row => row.archived).map(row => row.profile));
      setDeletedVehicleIds(records.filter(row => row.archived).flatMap(row => [row.profile.id, row.plate]));
      setRegistryLoaded(true);
      setRegistryError(null);

      // Existing browser-only fleet data is never discarded or silently synced.
      // Offer an explicit one-time import after the operator confirms the records.
      const stored = localStorage.getItem('vip_hq_custom_vehicles');
      const parsed = stored ? JSON.parse(stored) : [];
      const active = Array.isArray(parsed) ? parsed.filter((v): v is VipRealVehicle =>
        Boolean(v && typeof v.plate === 'string' && typeof v.model === 'string')) : [];
      const knownPlates = new Set(records.map(row => row.plate.replace(/\s/g, '')));
      setLegacyVehicleProfiles(active.filter(v => !knownPlates.has(v.plate.replace(/\s/g, ''))));
    } catch (err) {
      setRegistryError(err instanceof Error ? err.message : '차량 서버 연결에 실패했습니다.');
      setRegistryLoaded(false);
    }
  }, []);

  useEffect(() => {
    void fetchServerRegistry();
    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchServerRegistry();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('vip_hq_fleet_updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('vip_hq_fleet_updated', refresh);
    };
  }, [fetchServerRegistry]);

  const persistFleetVehicle = async (vehicle: VipRealVehicle): Promise<VipRealVehicle> => {
    const response = await fetch('/api/fleet/registry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vehicle),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.vehicle) {
      throw new Error(data.error || '차량 등록을 서버에 저장하지 못했습니다.');
    }
    return data.vehicle as VipRealVehicle;
  };

  const handleImportLegacyVehicles = async () => {
    if (registryBusy || !legacyVehicleProfiles.length) return;
    setRegistryBusy(true);
    try {
      for (const v of legacyVehicleProfiles) await persistFleetVehicle(reconcileRegisteredVehicle(v));
      localStorage.removeItem('vip_hq_custom_vehicles');
      await fetchServerRegistry();
      window.dispatchEvent(new Event('vip_hq_fleet_updated'));
      showToast('이 기기의 기존 차량을 공용 등록부로 가져왔습니다.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '기존 차량 가져오기에 실패했습니다.');
      await fetchServerRegistry();
    } finally {
      setRegistryBusy(false);
    }
  };

  const handleRestoreAllVehicles = async () => {
    if (registryBusy || !archivedVehicleProfiles.length) return;
    setRegistryBusy(true);
    try {
      for (const v of archivedVehicleProfiles) await persistFleetVehicle(v);
      await fetchServerRegistry();
      window.dispatchEvent(new Event('vip_hq_fleet_updated'));
      showToast('서버 등록부에서 삭제된 차량을 복구했습니다.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '차량 복구에 실패했습니다.');
    } finally {
      setRegistryBusy(false);
    }
  };

  const allBaseVehicles = useMemo(() => {
    if (!registryLoaded) return [] as VipRealVehicle[];
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

    // Keep custom photos and notes, but never let stale browser records override
    // owner-confirmed model, seat count and fuel for registered fleet plates.
    const validCustom = customVehicles.filter(isNotDeleted).map(reconcileRegisteredVehicle);

    // Filter default vehicles: not deleted AND not superseded by a custom vehicle with same plate
    const validDefault = VIP_REAL_VEHICLES.filter(
      (v) => isNotDeleted(v) && !customPlates.has(v.plate.trim().replace(/\s+/g, ''))
    );

    return [...validCustom, ...validDefault];
  }, [customVehicles, deletedVehicleIds, registryLoaded]);

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
  const handleCreateVehicle = async (data: NewVehicleFormData) => {
    const normalizedPlate = data.plate.trim();

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

    setRegistryBusy(true);
    try {
      const saved = await persistFleetVehicle(newVehicle);
      await fetchServerRegistry();
      setSelectedCategory('all');
      setFuelFilter('all');
      setSearchQuery('');
      setSelectedVehicleId(saved.id);
      setIsNewVehicleModalOpen(false);
      window.dispatchEvent(new Event('vip_hq_fleet_updated'));
      showToast(`차량 '${normalizedPlate}'이(가) HQ 공용 등록부에 저장됐습니다.`);
      haptics.success();
      void fetchAvailability();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '차량 등록에 실패했습니다.');
      haptics.errorAlert();
    } finally {
      setRegistryBusy(false);
    }
  };

  // Delete Vehicle Handler
  const handleConfirmDeleteVehicle = async (vehicle: VipRealVehicle) => {
    if (registryBusy) return;
    setRegistryBusy(true);
    try {
      const res = await fetch('/api/fleet/registry', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: vehicle.plate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || '차량 삭제를 서버에 저장하지 못했습니다.');
      await fetchServerRegistry();
      const remaining = enrichedVehicles.filter(v => v.plate !== vehicle.plate);
      setSelectedVehicleId(remaining[0]?.id || '');
      setVehicleToDelete(null);
      window.dispatchEvent(new Event('vip_hq_fleet_updated'));
      void fetchAvailability();
      showToast(`차량 '${vehicle.plate}'이(가) 공용 등록부에서 삭제됐습니다.`);
      haptics.success();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '차량 삭제에 실패했습니다.');
      haptics.errorAlert();
    } finally {
      setRegistryBusy(false);
    }
  };

  return (
    <div className="hq-fleet-a space-y-5">
      {/* Top Header Card: Icon + Title + Count */}
      <div className="flex items-center justify-between gap-3 rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:px-6">
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

            {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 (최상단 레이어) */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/vehicles:flex flex-col items-start pointer-events-none z-[100]">
              <span className="whitespace-nowrap rounded-[12px] bg-white px-3 py-2 text-[11px] font-medium text-[#4D607C] shadow-[0_8px_22px_rgba(35,49,78,0.1)] animate-in fade-in-50 duration-150">
                VIP 의전 세단·SUV·밴·스프린터의 실시간 배차 및 제원을 관리해요
              </span>
              <div className="ml-3.5 -mt-1 size-2 rotate-45 bg-white" />
            </div>
          </div>

          <h2 className="text-[20px] sm:text-[23px] font-bold tracking-[-0.035em] text-[#17233B]">
            차량 관리
          </h2>
          <span className="rounded-full bg-[#F7F9FC] px-3 py-1 text-[11px] font-medium text-[#73839D]">
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
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[14px] bg-[#1E60F3] px-4 text-[12px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-all hover:bg-[#1757DC] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
          title="신규 차량 등록"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>차량 등록</span>
        </button>
      </div>

      {/* Top Horizontal Filter Bar */}
      <div className="rounded-[23px] bg-white p-4 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-5">
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
                  className={`flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[13px] px-3.5 text-[12px] font-semibold transition-all ${isSelected
                    ? "bg-[#EEF3FF] text-[#1E60F3]"
                    : "bg-white text-[#73839D] hover:bg-[#F7F9FC] shadow-[0_3px_10px_rgba(35,49,78,0.04)]"
                    }`}
                >
                  <IconComp className={`w-3.5 h-3.5 ${isSelected ? "text-[#1E60F3]" : "text-[#95A3B9]"}`} />
                  <span>{cat.label}</span>
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full ${isSelected ? "bg-white/70 text-[#1E60F3]" : "bg-[#F7F9FC] text-[#73839D]"
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

            {/* Fuel Type Custom Dropdown */}
            <div className="relative shrink-0" ref={fuelDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsFuelDropdownOpen((prev) => !prev);
                }}
                className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[13px] px-3.5 text-[12px] font-semibold shadow-[0_3px_10px_rgba(35,49,78,0.04)] transition-all ${
                  fuelFilter !== 'all'
                    ? 'bg-[#EEF3FF] text-[#1E60F3]'
                    : 'bg-white text-[#73839D] hover:bg-[#F7F9FC]'
                }`}
              >
                <Fuel className={`w-3.5 h-3.5 ${fuelFilter !== 'all' ? 'text-[#1E60F3]' : 'text-slate-400'}`} />
                <span>
                  {fuelFilter === '휘발유'
                    ? `휘발유 (${fuelCounts.gasoline})`
                    : fuelFilter === '경유'
                    ? `경유 (${fuelCounts.diesel})`
                    : fuelFilter === '하이브리드'
                    ? `하이브리드 (${fuelCounts.hybrid})`
                    : '유종: 전체'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${isFuelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isFuelDropdownOpen && (
                <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-[17px] bg-white p-1.5 shadow-[0_14px_36px_rgba(35,49,78,0.13),0_3px_10px_rgba(35,49,78,0.05)] animate-in fade-in zoom-in-95 duration-100">
                  {[
                    { value: 'all' as const, label: '유종: 전체' },
                    { value: '휘발유' as const, label: `휘발유 (${fuelCounts.gasoline})` },
                    { value: '경유' as const, label: `경유 (${fuelCounts.diesel})` },
                    ...(fuelCounts.hybrid > 0 ? [{ value: '하이브리드' as const, label: `하이브리드 (${fuelCounts.hybrid})` }] : []),
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setFuelFilter(opt.value);
                        setIsFuelDropdownOpen(false);
                      }}
                      className={`flex min-h-10 w-full cursor-pointer items-center justify-between rounded-[12px] px-3.5 text-left text-[12px] font-medium transition-colors hover:bg-[#F7F9FC] ${
                        fuelFilter === opt.value
                          ? 'text-[#1E60F3] bg-[#EEF3FF]'
                          : 'text-[#4D607C]'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {fuelFilter === opt.value && <Check className="w-3.5 h-3.5 text-[#1E60F3]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search Input */}
            <div className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#95A3B9]" />
              <input
                type="text"
                placeholder="차량명이나 번호로 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-[14px] border border-[#E1E7F0]/25 bg-white pl-10 pr-8 text-[13px] font-medium text-[#17233B] placeholder:text-[#95A3B9] shadow-[0_4px_14px_rgba(35,49,78,0.045)] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#95A3B9] hover:text-[#4D607C]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout Grid */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* ============================================================== */}
        {/* COLUMN 1 (Left): Vehicle List Cards                           */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-[15px] font-bold tracking-[-0.02em] text-[#17233B]">차량 목록</h2>
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
              {legacyVehicleProfiles.length > 0 && (
                <button type="button" onClick={() => void handleImportLegacyVehicles()} disabled={registryBusy}
                  className="flex min-h-9 items-center rounded-[12px] bg-[#EEF3FF] px-3 text-[11px] font-semibold text-[#1E60F3] transition-colors hover:bg-[#E5EDFF] disabled:opacity-50"
                  title="이 브라우저에만 저장된 차량을 HQ 공용 등록부로 가져오기">
                  로컬 차량 {legacyVehicleProfiles.length}대 가져오기
                </button>
              )}
              {registryError && (
                <p role="alert" className="max-w-[280px] text-[11px] font-medium text-[#A34E45]">{registryError}</p>
              )}
              {deletedVehicleIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRestoreAllVehicles()}
                  disabled={registryBusy}}
                  className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[12px] bg-white px-3 text-[11px] font-semibold text-[#73839D] shadow-[0_3px_10px_rgba(35,49,78,0.04)] transition-colors hover:bg-[#F5F8FF]"
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
          <div className="max-h-[min(800px,calc(100vh-210px))] space-y-3 overflow-y-auto overscroll-contain pr-1 pb-1">
            {filteredVehicles.map((vehicle) => {
              const isSelected = vehicle.id === selectedVehicle?.id;
              const thumbUrl = getVehicleImage(vehicle);

              return (
                <button
                  key={vehicle.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    haptics.selection();
                    setSelectedVehicleId(vehicle.id);
                  }}
                  className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-[19px] p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/25 ${isSelected
                    ? "bg-[#F3F7FF] shadow-[0_5px_18px_rgba(35,49,78,0.075)]"
                    : "bg-white shadow-[0_4px_14px_rgba(35,49,78,0.045)] hover:bg-[#FAFBFD]"
                    }`}
                >
                  {/* Left Thumbnail Image */}
                  <div className="relative w-20 sm:w-24 h-14 sm:h-16 shrink-0 flex items-center justify-center">
                    <Image
                      src={thumbUrl}
                      alt={vehicle.model}
                      fill
                      className="object-contain drop-shadow-[0_5px_9px_rgba(35,49,78,0.09)] transition-transform duration-200 group-hover:scale-[1.02]"
                      sizes="96px"
                    />
                  </div>

                  {/* Center & Right Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 self-stretch">
                    {/* Top: Model & Chevron */}
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="truncate text-[13px] font-semibold tracking-[-0.02em] text-[#17233B]">
                        {vehicle.model}
                      </h3>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    </div>

                    {/* Middle: Badges */}
                    <div className="flex items-center gap-1.5 my-1">
                      <span className="rounded-[7px] bg-[#F1F4F9] px-2 py-0.5 text-[10px] font-medium text-[#73839D]">
                        {vehicle.uiCategory === "sprinter"
                          ? "스프린터"
                          : vehicle.uiCategory === "van"
                            ? "밴"
                            : vehicle.uiCategory === "suv"
                              ? "SUV"
                              : "세단"}
                      </span>
                      <span className="rounded-[7px] bg-[#F7F9FC] px-2 py-0.5 text-[10px] font-medium text-[#73839D]">
                        {vehicle.fuelDisplay}
                      </span>
                    </div>

                    {/* Bottom: Plate (Tag Style) & Status Pill */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="rounded-[8px] bg-[#F7F9FC] px-2 py-1 text-[12px] font-semibold tracking-tight text-[#17233B]">
                        {vehicle.plate}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-white px-2 py-1 text-[10px] font-medium text-[#73839D]">
                        <Calendar className="w-2.5 h-2.5 text-slate-400" />
                        <span>{formatVehicleStatus(vehicle.effectiveStatus)}</span>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredVehicles.length === 0 && (
              <div className="space-y-2 rounded-[20px] bg-white p-8 text-center shadow-[0_5px_18px_rgba(35,49,78,0.045)]">
                <Car className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">검색된 차량이 없습니다.</p>
                <p className="text-[11px] text-slate-400">필터나 검색어를 변경해 보세요.</p>
                {deletedVehicleIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleRestoreAllVehicles()}
                    disabled={registryBusy}}
                    className="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[12px] bg-[#F7F9FC] px-3 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EDF1F6]"
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
              <div className="space-y-5 rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  {/* Left Hero Photo - Transparent background with floating 3D drop-shadow */}
                  <div className="relative w-full sm:w-[240px] md:w-[260px] h-[145px] shrink-0 flex items-center justify-center p-2">
                    <Image
                      src={getVehicleHero(selectedVehicle)}
                      alt={selectedVehicle.model}
                      fill
                      className="object-contain drop-shadow-[0_8px_18px_rgba(35,49,78,0.10)] transition-transform duration-300 hover:scale-[1.02]"
                      priority
                    />
                  </div>

                  {/* Right Header Info */}
                  <div className="flex-1 w-full min-w-0 space-y-2.5">
                    {/* Row 1: Model Title & Minimal Icon Actions */}
                    <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-3">
                      <h2 className="break-keep text-[20px] font-bold tracking-[-0.03em] text-[#17233B] sm:text-[22px]">
                        {selectedVehicle.model}
                      </h2>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Status Dropdown Button */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[13px] bg-white px-3 text-[12px] font-medium text-[#4D607C] shadow-[0_3px_12px_rgba(35,49,78,0.06)] transition-colors hover:bg-[#F5F8FF]"
                          >
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatVehicleStatus(selectedVehicle.effectiveStatus)}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                          {isStatusDropdownOpen && (
                            <div className="absolute right-0 z-30 mt-2 w-40 overflow-hidden rounded-[16px] bg-white p-1.5 shadow-[0_14px_36px_rgba(35,49,78,0.13),0_3px_10px_rgba(35,49,78,0.05)]">
                              {STATUS_OPTIONS.map((st) => (
                                <button
                                  key={st.value}
                                  type="button"
                                  onClick={() => {
                                    handleQuickChangeStatus(selectedVehicle.id, st.value);
                                    setIsStatusDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-xs font-bold flex items-center justify-between hover:bg-slate-50 cursor-pointer ${selectedVehicle.effectiveStatus === st.value ? "text-[#1E60F3] bg-blue-50/50" : "text-slate-700"
                                    }`}
                                >
                                  <span>{st.label}</span>
                                  {selectedVehicle.effectiveStatus === st.value && <Check className="w-3 h-3 text-[#1E60F3]" />}
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
                      <span className="text-[17px] font-bold tracking-[-0.02em] text-[#17233B]">
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
                        <span className="rounded-[9px] bg-[#EEF3FF] px-2 py-1 text-[10px] font-medium text-[#1E60F3]">
                          복사됨!
                        </span>
                      )}
                    </div>

                    {/* Row 3: Badges */}
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-[8px] bg-[#F1F4F9] px-2 py-1 text-[10px] font-medium text-[#73839D]">
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
              <div className="flex items-center gap-1 overflow-x-auto rounded-[15px] bg-[#F7F9FC] p-1 text-[12px] font-medium text-[#73839D]">
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
                    className={`min-h-10 shrink-0 cursor-pointer rounded-[11px] px-3.5 transition-all ${activeDetailTab === tab.key
                      ? "bg-white text-[#1E60F3] font-semibold shadow-[0_3px_10px_rgba(35,49,78,0.065)]"
                      : "text-[#73839D] hover:text-[#17233B]"
                      }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Tab Content 1: 기본 제원 (단독 뷰) */}
              {activeDetailTab === "info" && (
                <div className="space-y-5 rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      <Info className="size-4 text-[#73839D]" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {selectedVehicle.model} ({selectedVehicle.plate}) 기본 제원
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenEdit}
                      className="flex min-h-9 cursor-pointer items-center gap-1 rounded-[12px] bg-[#F7F9FC] px-3 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EEF3FF] hover:text-[#1E60F3]"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>정보 수정</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
                      <span className="text-[11px] text-slate-400 font-medium block">제조사</span>
                      <span className="mt-1 block font-semibold text-[#17233B]">{selectedVehicle.brand}</span>
                    </div>
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
                      <span className="text-[11px] text-slate-400 font-medium block">차량 모델</span>
                      <span className="mt-1 block font-semibold text-[#17233B]">{selectedVehicle.model}</span>
                    </div>
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
                      <span className="text-[11px] text-slate-400 font-medium block">차량 번호판</span>
                      <span className="mt-1 block font-semibold text-[#17233B]">{selectedVehicle.plate}</span>
                    </div>
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
                      <span className="text-[11px] text-slate-400 font-medium block">차급 분류</span>
                      <span className="mt-1 block font-semibold text-[#17233B]">
                        {selectedVehicle.uiCategory === "sprinter"
                          ? "스프린터"
                          : selectedVehicle.uiCategory === "van"
                            ? "밴"
                            : selectedVehicle.uiCategory === "suv"
                              ? "SUV"
                              : "세단"}
                      </span>
                    </div>
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
                      <span className="text-[11px] text-slate-400 font-medium block">연식</span>
                      <span className="mt-1 block font-semibold text-[#17233B]">{selectedVehicle.year}</span>
                    </div>
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
                      <span className="text-[11px] text-slate-400 font-medium block">승차 정원</span>
                      <span className="mt-1 block font-semibold text-[#17233B]">{selectedVehicle.capacity}</span>
                    </div>
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
                      <span className="text-[11px] text-slate-400 font-medium block">차량 색상</span>
                      <span className="mt-1 block font-semibold text-[#17233B]">{selectedVehicle.color}</span>
                    </div>
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
                      <span className="text-[11px] text-slate-400 font-medium block">사용 연료</span>
                      <span className="mt-1 block font-semibold text-[#17233B]">{selectedVehicle.fuelDisplay}</span>
                    </div>
                    <div className="rounded-[15px] bg-[#FAFBFD] p-4">
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
                  <div className="space-y-4 rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6">
                    <div className="flex items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="size-4 text-[#73839D]" />
                        <h3 className="text-sm font-bold text-slate-900">5일간 단기 배차 일정</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCalendarModalOpen(true)}
                        className="flex min-h-9 cursor-pointer items-center gap-1 rounded-[12px] bg-[#F7F9FC] px-3 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EEF3FF] hover:text-[#1E60F3]"
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
                            className={`flex min-w-0 flex-col items-center gap-1.5 rounded-[13px] p-2 transition-all sm:p-3 ${isAvail
                              ? "bg-[#F3F7FF] shadow-[0_2px_8px_rgba(35,49,78,0.04)]"
                              : "bg-[#FAFBFD]"
                              }`}
                            title={d.detail || d.status}
                          >
                            <span className="text-xs font-bold text-slate-700">
                              {d.label} {d.dayOfWeek}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isAvail
                                ? "bg-white text-[#31598F]"
                                : "bg-[#EEF1F6] text-[#73839D]"
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
                  <div className="space-y-5 rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6">
                    <div className="flex items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-[#73839D]" />
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
                            className="flex min-w-0 flex-col items-center gap-1.5 rounded-[12px] bg-[#FAFBFD] p-2 sm:p-3"
                            title={d.detail || d.status}
                          >
                            <span className="text-xs font-bold text-slate-700">{d.label}</span>
                            {isAvailable ? (
                              <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200/70 flex items-center justify-center text-[#1E60F3]">
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
                <div className="space-y-5 rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-[#73839D]" />
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
                      <div className="space-y-2 rounded-[16px] bg-[#FAFBFD] p-4">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                          <Zap className="size-4 text-[#73839D]" />
                          <span>1열 충전 포트</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.frontCharging}</p>
                      </div>
                      <div className="space-y-2 rounded-[16px] bg-[#FAFBFD] p-4">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                          <Zap className="size-4 text-[#73839D]" />
                          <span>VIP석 충전 포트</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.rearCharging}</p>
                      </div>
                      <div className="space-y-2 rounded-[16px] bg-[#FAFBFD] p-4">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                          <Fuel className="size-4 text-[#73839D]" />
                          <span>사용 연료: {selectedVehicle.fuelDisplay}</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.fuelTip}</p>
                      </div>
                      <div className="space-y-2 rounded-[16px] bg-[#FAFBFD] p-4">
                        <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                          <Plug className="size-4 text-[#73839D]" />
                          <span>220V 파워 아울렛</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6">{tips.powerTip}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-3 rounded-[20px] bg-[#FAFBFD] p-8 text-center">
                      <Zap className="w-6 h-6 text-slate-400" />
                      <p className="text-xs text-slate-600 font-semibold">
                        아직 {selectedVehicle.model}의 충전 포트 및 편의 사양이 등록되지 않았습니다.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenEdit}
                        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[14px] bg-[#1E60F3] px-4 text-[12px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-all hover:bg-[#1757DC]"
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
                <div className="space-y-5 rounded-[23px] bg-white p-5 shadow-[0_6px_20px_rgba(35,49,78,0.055),0_2px_6px_rgba(35,49,78,0.025)] sm:p-6">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      <Edit2 className="size-4 text-[#73839D]" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {selectedVehicle.model} ({selectedVehicle.plate}) 운영 메모
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenEdit}
                      className="flex min-h-9 cursor-pointer items-center gap-1 rounded-[12px] bg-[#F7F9FC] px-3 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EEF3FF] hover:text-[#1E60F3]"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>정보 수정</span>
                    </button>
                  </div>

                  <div className="min-h-[120px] whitespace-pre-wrap rounded-[16px] bg-[#FAFBFD] p-5 text-[13px] leading-relaxed text-[#4D607C]">
                    {memos[selectedVehicle.id] || selectedVehicle.adminMemo || "등록된 운영 메모가 없습니다. [정보 수정] 버튼을 눌러 메모를 작성해 보세요."}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2 rounded-[23px] bg-white p-10 text-center shadow-[0_6px_20px_rgba(35,49,78,0.055)]">
              <Car className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-700">선택된 차량이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: 차량 정보 수정 Modal (✎ 정보 수정)                      */}
      {/* ============================================================== */}
      {isEditModalOpen && selectedVehicle && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-4 backdrop-blur-[2px]">
          <div className="max-h-[92dvh] w-full max-w-md space-y-5 overflow-y-auto overscroll-contain rounded-[24px] bg-white p-6 shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)]">
            <div className="flex items-center justify-between gap-2 pb-2">
              <h3 className="text-[18px] font-bold tracking-[-0.025em] text-[#17233B]">
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
                      className={`min-h-10 cursor-pointer rounded-[12px] px-2 text-center text-[12px] font-semibold transition-all ${editStatus === st.value
                        ? 'bg-[#EEF3FF] text-[#1E60F3]'
                        : 'bg-[#F7F9FC] hover:bg-[#EDF1F6] text-[#73839D]'
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
                  className="h-[52px] w-full rounded-[16px] border border-[#E1E7F0]/25 bg-white px-4 text-[14px] text-[#17233B] shadow-[0_4px_14px_rgba(35,49,78,0.045)] outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">운영 메모</label>
                <textarea
                  rows={3}
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  placeholder="특이사항, 충전 단자 규격, 하이패스 단말기 번호, 세차 주기 등..."
                  className="w-full rounded-[16px] border border-[#E1E7F0]/25 bg-white p-4 text-[14px] text-[#17233B] shadow-[0_4px_14px_rgba(35,49,78,0.045)] outline-none focus-visible:ring-2 focus-visible:ring-[#1E60F3]/20"
                />
              </div>
              {saveEditError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                  {saveEditError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3">
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
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[14px] bg-[#1E60F3] px-4 text-[12px] font-semibold text-white shadow-[0_6px_16px_rgba(30,96,243,0.15)] transition-colors hover:bg-[#1757DC] disabled:opacity-50"
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-4 backdrop-blur-[2px]">
          <div className="max-h-[92dvh] w-full max-w-lg space-y-5 overflow-y-auto overscroll-contain rounded-[24px] bg-white p-6 shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)]">
            <div className="flex items-center justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-[#73839D]" />
                <h3 className="text-[18px] font-bold tracking-[-0.025em] text-[#17233B]">
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
                                : 'bg-[#EEF3FF] text-[#31598F] border-[#EEF3FF]';

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
                      className="flex min-w-0 flex-col items-center gap-1 rounded-[12px] bg-[#FAFBFD] p-2"
                      title={d.detail || d.status}
                    >
                      <span className="text-[11px] font-semibold text-[#4D607C]">{d.label}</span>
                      <span className={`text-[8px] font-bold px-1 py-0.2 rounded border ${badgeClass}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={() => setIsCalendarModalOpen(false)}
                className="min-h-11 cursor-pointer rounded-[14px] bg-[#F7F9FC] px-4 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EDF1F6]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Vehicle Confirmation Modal */}
      {vehicleToDelete && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm space-y-5 rounded-[24px] bg-white p-6 shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                <Trash2 className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-[18px] font-bold tracking-[-0.025em] text-[#17233B]">차량 삭제</h3>
                <p className="text-xs text-slate-500 break-keep">
                  정말로 이 차량을 목록에서 삭제하시겠습니까?
                </p>
              </div>
            </div>

            {/* Target Vehicle Summary Card */}
            <div className="flex items-center gap-3 rounded-[16px] bg-[#FAFBFD] p-4">
              <div className="relative w-16 h-12 shrink-0 flex items-center justify-center">
                <Image
                  src={getVehicleHero(vehicleToDelete)}
                  alt={vehicleToDelete.model}
                  fill
                  className="object-contain filter drop-shadow-xs"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[#17233B]">
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

            <p className="rounded-[13px] bg-[#FAFBFD] p-3 text-[11px] leading-relaxed text-[#73839D]">
              * 삭제된 차량은 목록 및 통계에서 즉시 제외되며, 필요시 언제든지 복구할 수 있습니다.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setVehicleToDelete(null)}
                className="min-h-11 flex-1 cursor-pointer rounded-[14px] bg-[#F7F9FC] text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EDF1F6]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteVehicle(vehicleToDelete)}
                disabled={registryBusy}
                className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] bg-[#FFF4F2] text-[12px] font-semibold text-[#A34E45] transition-colors hover:bg-[#FFE9E5]"
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
        <div className="fixed right-6 top-20 z-[100] flex items-center gap-2.5 rounded-[17px] bg-white px-4 py-3 text-[12px] font-semibold text-[#4D607C] shadow-[0_10px_30px_rgba(35,49,78,0.13)] animate-slide-up">
          <span className="size-2 rounded-full bg-[#1E60F3]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
