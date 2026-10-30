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
} from 'lucide-react';
import {
  VIP_REAL_VEHICLES,
  VipRealVehicle,
  VehicleUiCategoryKey,
  mapVehicleToUiCategory,
} from '@/utils/vehicleData';
import {
  getKstTodayDateStr,
  normalizeDateToIso,
  cleanVehicleIdentity,
  isBookingActiveForConflict,
} from '@/utils/dispatchConflictDetector';
import { HqBooking } from '@/types/hq';
import type { FleetAvailabilityResult } from '@/utils/availabilityEngine';
import { haptics } from '@/utils/haptics';

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

// Helper to get thumbnail image matching the mockup
function getVehicleThumb(v: VipRealVehicle): string {
  if (v.plateShort === '5336') return '/images/thumb_carnival.jpg';
  if (v.category === 'carnival') return '/images/thumb_carnival.jpg';
  if (v.category === 'staria') return '/images/thumb_staria.jpg';
  if (v.category === 'sprinter') return '/images/thumb_sprinter.jpg';
  if (v.category === 'genesis' && v.model.includes('GV80')) return '/images/thumb_gv80.jpg';
  return '/images/thumb_g90.jpg';
}

// Helper to get Hero image matching the mockup
function getVehicleHero(v: VipRealVehicle): string {
  if (v.plateShort === '5336') return '/images/carnival_hero.jpg';
  if (v.category === 'carnival') return '/images/thumb_carnival.jpg';
  if (v.category === 'staria') return '/images/thumb_staria.jpg';
  if (v.category === 'sprinter') return '/images/thumb_sprinter.jpg';
  if (v.category === 'genesis' && v.model.includes('GV80')) return '/images/thumb_gv80.jpg';
  return '/images/thumb_g90.jpg';
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

export const HqVehicleManagementView: React.FC<HqVehicleManagementViewProps> = ({
  initialSearchQuery = '',
  bookings,
}) => {
  // 1. Filter States
  const [selectedCategory, setSelectedCategory] = useState<VehicleUiCategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [fuelFilter, setFuelFilter] = useState<FuelTypeFilter>('all');

  // 2. Selected Vehicle - Defaults to 193호 5336 (Carnival Limousine from mockup)
  const defaultCarId = useMemo(() => {
    const carnival5336 = VIP_REAL_VEHICLES.find((v) => v.plateShort === '5336');
    return carnival5336 ? carnival5336.id : VIP_REAL_VEHICLES[0].id;
  }, []);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(defaultCarId);

  // 3. Tab State inside Detail View
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'calendar' | 'tips' | 'memo'>('info');

  // 4. Overrides (Status, Color, Year, Memo) synced with server store
  const [statusOverrides, setStatusOverrides] = useState<Record<string, '확인 필요' | '대기 중' | '운행 중' | '정비 중'>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [serverColors, setServerColors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/fleet/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          if (data.statuses) setStatusOverrides(data.statuses);
          if (data.memos) setMemos(data.memos);
          if (data.colors) setServerColors(data.colors);
        }
      })
      .catch((err) => console.warn('Notice fetching /api/fleet/status:', err));
  }, []);

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

    setAvailabilityState('loading');
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
      if (!res.ok) {
        throw new Error(`서버 응답 에러 (${res.status})`);
      }
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || '가용성 조회 실패');
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
    return () => {
      if (activeAbortRef.current) activeAbortRef.current.abort();
    };
  }, [fetchAvailability]);

  // 6. Modals State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);

  // Edit Modal Form State
  const [editStatus, setEditStatus] = useState<'확인 필요' | '대기 중' | '운행 중' | '정비 중'>('확인 필요');
  const [editMemo, setEditMemo] = useState('');
  const [editColor, setEditColor] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [saveEditError, setSaveEditError] = useState<string | null>(null);

  // Enriched vehicles with category, fuel normalization, and verified attributes
  const enrichedVehicles = useMemo(() => {
    return VIP_REAL_VEHICLES.map((v) => {
      const uiCategory = mapVehicleToUiCategory(v);
      const effectiveStatus = statusOverrides[v.id] || '확인 필요';
      // 연식/색상 추정 금지: 오직 확인된 값만 노출 (5336은 디자인 시안 기준 2023년/오로라 블랙 펄, 그 외는 '미확인')
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
  }, [statusOverrides, serverColors]);

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
    setEditStatus(selectedVehicle.effectiveStatus);
    setEditMemo(memos[selectedVehicle.id] || selectedVehicle.adminMemo || '');
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
      const isMaint = statusOverrides[v.id] === '정비 중';
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

        // Check if this vehicle has an active schedule overlapping targetDateIso specifically
        if (detail.activeSchedules && detail.activeSchedules.length > 0) {
          const daySchedule = detail.activeSchedules.find((s) => {
            return scheduleOverlapsInterval(s, { startDate: targetDateIso, startTime: '00:00', endDate: targetDateIso, endTime: '23:59' });
          });

          if (daySchedule) {
            const isToday = targetDateIso === getKstTodayDateStr();
            const inTransit =
              isToday &&
              (daySchedule.operationStatus === 'in_transit' ||
                daySchedule.operationStatus === 'boarded' ||
                statusOverrides[v.id] === '운행 중');
            return {
              status: !daySchedule.endTime ? '미확인' : inTransit ? '운행 중' : '예약 있음',
              detail: `${daySchedule.customerName || '고객사'} (${daySchedule.pickupTime})`,
            };
          }
        }

        return { status: '예약 가능' };
      }

      // Default fallback: Fail-closed
      return { status: '확인 불가', detail: '가용성 데이터 부재' };
    },
    [availabilityState, availabilityError, statusOverrides, bookings, fleetResult]
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


  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { all: 20, sedan: 4, suv: 1, van: 6, sprinter: 9 };
    return counts;
  }, []);

  // Fuel counts
  const fuelCounts = useMemo(() => {
    return {
      all: 20,
      gasoline: enrichedVehicles.filter((v) => v.fuelDisplay === '휘발유').length,
      diesel: enrichedVehicles.filter((v) => v.fuelDisplay === '경유').length,
      hybrid: enrichedVehicles.filter((v) => v.fuelType === '하이브리드').length,
    };
  }, [enrichedVehicles]);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">차량관리</h1>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          차량 이미지, 차량번호, 차량별 운영 팁을 한눈에 관리합니다.
        </p>
      </div>

      {/* Main 3-Column Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ============================================================== */}
        {/* COLUMN 1 (Left 2.5 cols / lg:col-span-3): Filter Sidebar      */}
        {/* ============================================================== */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-5">
            {/* 1. 차량 분류 */}
            <div className="space-y-2">
              <h2 className="text-xs font-black text-slate-900">차량 분류</h2>
              <div className="space-y-1">
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
                      className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-[#1E60F3] text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <IconComp className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                        <span>{cat.label}</span>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. 검색 */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h2 className="text-xs font-black text-slate-900">검색</h2>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="차량, 차량번호로 검색"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#1E60F3] placeholder:text-slate-400 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 3. 연료 타입 */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <h2 className="text-xs font-black text-slate-900">연료 타입</h2>
              <div className="space-y-2 text-xs">
                {[
                  { key: 'all', label: '전체', count: fuelCounts.all },
                  { key: '휘발유', label: '휘발유', count: fuelCounts.gasoline },
                  { key: '경유', label: '경유', count: fuelCounts.diesel },
                  { key: '하이브리드', label: '하이브리드', count: fuelCounts.hybrid },
                ].map((fuel) => {
                  const isChecked = fuelFilter === fuel.key;
                  return (
                    <div
                      key={fuel.key}
                      onClick={() => {
                        haptics.selection();
                        setFuelFilter(fuel.key as FuelTypeFilter);
                      }}
                      className="flex items-center justify-between cursor-pointer group py-0.5"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                            isChecked
                              ? 'bg-[#1E60F3] text-white'
                              : 'border border-slate-300 bg-white group-hover:border-slate-400'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className={`font-medium ${isChecked ? 'text-slate-900 font-bold' : 'text-slate-600'}`}>
                          {fuel.label}
                        </span>
                      </div>
                      {fuel.key !== 'all' && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          {fuel.count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 2 (Center 3.5 cols / lg:col-span-4): Vehicle List Cards */}
        {/* ============================================================== */}
        <div className="lg:col-span-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black text-slate-900">차량 목록</h2>
            <span className="text-xs text-slate-400 font-bold">
              총 {filteredVehicles.length}대
            </span>
          </div>

          {/* Cards Stack */}
          <div className="space-y-2.5 max-h-[calc(100vh-210px)] overflow-y-auto pr-1">
            {filteredVehicles.map((vehicle) => {
              const isSelected = vehicle.id === selectedVehicle?.id;
              const thumbUrl = getVehicleThumb(vehicle);

              return (
                <div
                  key={vehicle.id}
                  onClick={() => {
                    haptics.selection();
                    setSelectedVehicleId(vehicle.id);
                  }}
                  className={`bg-white border rounded-2xl p-3 hover:border-slate-300 transition-all cursor-pointer flex items-center gap-3 relative shadow-2xs ${
                    isSelected
                      ? 'border-[#1E60F3] ring-2 ring-[#1E60F3] bg-blue-50/20'
                      : 'border-slate-200/80'
                  }`}
                >
                  {/* Left Thumbnail Image */}
                  <div className="relative w-20 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                    <Image
                      src={thumbUrl}
                      alt={vehicle.model}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>

                  {/* Center Info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <h3 className="text-xs font-black text-slate-900 tracking-tight truncate">
                      {vehicle.model}
                    </h3>
                    <div className="flex items-center gap-1.5 pt-0.5">
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
                    <p className="text-xs font-black text-slate-900 tracking-tight pt-0.5">
                      {vehicle.plate}
                    </p>
                  </div>

                  {/* Right Status & Arrow */}
                  <div className="flex flex-col items-end justify-between h-14 shrink-0 py-0.5">
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        vehicle.effectiveStatus === '대기 중'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/70'
                          : vehicle.effectiveStatus === '운행 중'
                          ? 'bg-blue-50 text-[#1E60F3] border border-blue-200/70'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          vehicle.effectiveStatus === '대기 중'
                            ? 'bg-emerald-500'
                            : vehicle.effectiveStatus === '운행 중'
                            ? 'bg-[#1E60F3]'
                            : 'bg-slate-400'
                        }`}
                      />
                      {vehicle.effectiveStatus}
                    </span>
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
        {/* COLUMN 3 (Right 5 cols / lg:col-span-5): Vehicle Detail Panel  */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 space-y-4">
          {selectedVehicle ? (
            <>
              {/* Top Hero Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  {/* Left Hero Photo */}
                  <div className="relative w-full sm:w-[220px] h-[135px] rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                    <Image
                      src={getVehicleHero(selectedVehicle)}
                      alt={selectedVehicle.model}
                      fill
                      className="object-cover"
                      priority
                    />
                  </div>

                  {/* Right Header Info */}
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-xl font-black text-slate-950 tracking-tight">
                          {selectedVehicle.model}
                        </h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-base font-black text-slate-900 tracking-tight">
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
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                            selectedVehicle.effectiveStatus === '대기 중'
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                              : selectedVehicle.effectiveStatus === '운행 중'
                              ? 'bg-blue-50 text-[#1E60F3] border border-blue-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          {selectedVehicle.effectiveStatus}
                        </span>

                        <button
                          type="button"
                          onClick={handleOpenEdit}
                          className="bg-[#1E60F3] hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>수정하기</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="bg-blue-50 text-[#1E60F3] text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {selectedVehicle.uiCategory === 'sprinter'
                          ? '스프린터'
                          : selectedVehicle.uiCategory === 'van'
                          ? '밴'
                          : selectedVehicle.uiCategory === 'suv'
                          ? 'SUV'
                          : '세단'}
                      </span>
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.5 rounded">
                        {selectedVehicle.fuelDisplay}
                      </span>
                    </div>

                    {/* Quick Specs 3 Items */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Car className="w-3.5 h-3.5 text-slate-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-normal">제조사</span>
                          <span className="font-bold text-slate-800">{selectedVehicle.brand}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-normal">연식</span>
                          <span className="font-bold text-slate-800">{selectedVehicle.year}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
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
                  기본 정보
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
                  날짜별 예약 가능 여부
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
                  차량 꿀팁
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
                  관리자 메모
                </button>
              </div>

              {/* Grid with Left Box (기본 정보) & Right Side (날짜별 예약 가능 여부 + 차량 꿀팁) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                {/* -------------------------------------------------------- */}
                {/* LEFT BOX: ⚙ 기본 정보 (5.5 cols)                         */}
                {/* -------------------------------------------------------- */}
                <div className="md:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
                  <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
                    <Info className="w-3.5 h-3.5 text-[#1E60F3]" />
                    <h3 className="text-xs font-black text-slate-900">기본 정보</h3>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">차종</span>
                      <span className="font-bold text-slate-800">{selectedVehicle.model}</span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">차량번호</span>
                      <span className="font-bold text-slate-800">{selectedVehicle.plate}</span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">차량 분류</span>
                      <span className="font-bold text-slate-800">
                        {selectedVehicle.uiCategory === 'sprinter'
                          ? '스프린터'
                          : selectedVehicle.uiCategory === 'van'
                          ? '밴'
                          : selectedVehicle.uiCategory === 'suv'
                          ? 'SUV'
                          : '세단'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">연료 타입</span>
                      <span className="font-bold text-slate-800">{selectedVehicle.fuelDisplay}</span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">현재 운행 상태</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          selectedVehicle.effectiveStatus === '대기 중'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : selectedVehicle.effectiveStatus === '운행 중'
                            ? 'bg-blue-50 text-[#1E60F3] border border-blue-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        <Check className="w-2.5 h-2.5" />
                        {selectedVehicle.effectiveStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">승차 정원</span>
                      <span className="font-bold text-slate-800">{selectedVehicle.capacity}</span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">제조사</span>
                      <span className="font-bold text-slate-800">{selectedVehicle.brand}</span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">연식</span>
                      <span className="font-bold text-slate-800">{selectedVehicle.year}</span>
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-400 font-medium">색상</span>
                      <span className="font-bold text-slate-800">{selectedVehicle.color}</span>
                    </div>
                  </div>
                </div>

                {/* -------------------------------------------------------- */}
                {/* RIGHT SIDE (6 cols): 날짜별 예약 가능 여부 + 차량 꿀팁      */}
                {/* -------------------------------------------------------- */}
                <div className="md:col-span-6 space-y-4">
                  {/* Card 1: 📅 날짜별 예약 가능 여부 */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-[#1E60F3]" />
                        <h3 className="text-xs font-black text-slate-900">날짜별 예약 가능 여부</h3>
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
                    <div className="grid grid-cols-5 gap-1.5 text-center pt-1">
                      {fiveDays.map((d, idx) => {
                        const badgeStyle =
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

                        return (
                          <div key={idx} className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-600 leading-tight">
                              <div>{d.label}</div>
                              <div className="text-[9px] text-slate-400">{d.dayOfWeek}</div>
                            </div>
                            <div
                              className={`text-[9px] font-bold py-0.5 rounded border transition-colors ${badgeStyle}`}
                              title={d.detail || d.status}
                            >
                              {d.status}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 2: 💡 차량 꿀팁 */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#1E60F3]" />
                        <h3 className="text-xs font-black text-slate-900">차량 꿀팁</h3>
                      </div>
                      {!tips.isVerified && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          현장 실차 확인 필요
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {/* 앞자리 충전단자 */}
                      <div className="flex items-start gap-2.5">
                        <Plug className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-black text-slate-800 text-[11px]">앞자리 충전단자</div>
                          <div className={`text-[11px] font-medium ${tips.isVerified ? 'text-slate-500' : 'text-slate-400 italic'}`}>
                            {tips.frontCharging}
                          </div>
                        </div>
                      </div>

                      {/* 뒷자리 충전단자 */}
                      <div className="flex items-start gap-2.5">
                        <Plug className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-black text-slate-800 text-[11px]">뒷자리 충전단자</div>
                          <div className={`text-[11px] font-medium ${tips.isVerified ? 'text-slate-500' : 'text-slate-400 italic'}`}>
                            {tips.rearCharging}
                          </div>
                        </div>
                      </div>

                      {/* 연료 팁 */}
                      <div className="flex items-start gap-2.5">
                        <Fuel className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-black text-slate-800 text-[11px]">
                            연료: {selectedVehicle.fuelDisplay}
                          </div>
                          <div className={`text-[11px] font-medium ${tips.isVerified ? 'text-slate-500' : 'text-slate-400 italic'}`}>
                            {tips.fuelTip}
                          </div>
                        </div>
                      </div>

                      {/* 220V 전원 */}
                      <div className="flex items-start gap-2.5">
                        <Zap className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-black text-slate-800 text-[11px]">220V 전원 사용 가능</div>
                          <div className={`text-[11px] font-medium ${tips.isVerified ? 'text-slate-500' : 'text-slate-400 italic'}`}>
                            {tips.powerTip}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
      {/* MODAL 1: 차량 정보 수정 Modal (✎ 수정하기)                      */}
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
                <div className="grid grid-cols-3 gap-2">
                  {(['확인 필요', '대기 중', '운행 중', '정비 중'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEditStatus(st)}
                      className={`py-2 rounded-xl font-bold cursor-pointer transition-all border ${
                        editStatus === st
                          ? 'bg-[#1E60F3] text-white border-[#1E60F3]'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {st}
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
                <label className="font-bold text-slate-700 block mb-1">관리자 메모</label>
                <textarea
                  rows={3}
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  placeholder="특이사항, 하이패스 단말기 번호, 세차 주기 등..."
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
    </div>
  );
};
