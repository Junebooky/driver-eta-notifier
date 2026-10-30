'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  Car,
  Zap,
  BatteryCharging,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  X,
  ChevronRight,
  Phone,
  User,
  Info,
  Check,
  Sparkles,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  Fuel,
  Users,
} from 'lucide-react';
import {
  VIP_REAL_VEHICLES,
  VipRealVehicle,
  VehicleUiCategoryKey,
  mapVehicleToUiCategory,
  formatChargingPortSummary,
  stripManufacturerName,
  VehicleChargingPortSpec,
} from '@/utils/vehicleData';
import { AvailableVehicleItem, FleetAvailabilityResult } from '@/utils/availabilityEngine';
import { getKstTodayDateStr, getKstTomorrowDateStr } from '@/utils/dispatchConflictDetector';
import { ensureClientAuth } from '@/utils/cockpitClientAuth';
import { haptics } from '@/utils/haptics';

export interface HqVehicleManagementViewProps {
  initialSearchQuery?: string;
}

const UI_CATEGORIES: { key: VehicleUiCategoryKey; label: string; count: number }[] = [
  { key: 'all', label: '전체', count: 20 },
  { key: 'sedan', label: '세단', count: 4 },
  { key: 'suv', label: 'SUV', count: 1 },
  { key: 'van', label: '밴', count: 6 },
  { key: 'sprinter', label: '스프린터', count: 9 },
];

function getVehicleHeroImage(category: string, model: string): string {
  if (category === 'sprinter' || model.includes('스프린터')) {
    return '/images/car_sprinter.png';
  }
  if (category === 'carnival' || category === 'staria' || model.includes('카니발') || model.includes('스타리아')) {
    return '/images/car_phone_carnival.png';
  }
  return '/images/car_g90.png';
}

export const HqVehicleManagementView: React.FC<HqVehicleManagementViewProps> = ({
  initialSearchQuery = '',
}) => {
  // 1. Search & Filter State
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<VehicleUiCategoryKey>('all');

  // 2. Interval Selection State (Asia/Seoul Date-Time Range)
  const todayIso = useMemo(() => getKstTodayDateStr(), []);
  const tomorrowIso = useMemo(() => getKstTomorrowDateStr(), []);
  const [startDate, setStartDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState(todayIso);
  const [endTime, setEndTime] = useState('19:00');

  // 3. Live Server Availability Query State
  const [availabilityResult, setAvailabilityResult] = useState<FleetAvailabilityResult | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  // 4. Selected Vehicle for Column 3 Detail View
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(VIP_REAL_VEHICLES[0].id);

  // 5. Mobile Tab Mode (< lg)
  const [mobileTab, setMobileTab] = useState<'list' | 'detail'>('list');

  // 6. Admin memo per vehicle (in-memory & persisted in localStorage)
  const [adminMemos, setAdminMemos] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('vip_fleet_admin_memos');
        if (stored) return JSON.parse(stored);
      } catch (_) {}
    }
    return {};
  });
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');

  // 7. Operational Status Override per vehicle (in-memory & persisted in localStorage)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, '운행 중' | '차고지 대기' | '정비 중'>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('vip_fleet_status_overrides');
        if (stored) return JSON.parse(stored);
      } catch (_) {}
    }
    return {};
  });

  // Query Availability from /api/fleet/availability
  const fetchAvailability = useCallback(async () => {
    setIsLoadingAvailability(true);
    setAvailabilityError(null);
    try {
      await ensureClientAuth('hq');
      const params = new URLSearchParams({
        startDate,
        startTime,
        endDate: endDate || startDate,
        endTime,
        category: selectedCategory,
      });

      const res = await fetch(`/api/fleet/availability?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setAvailabilityError(data.error || '차량 가용성 조회 실패');
        return;
      }

      setAvailabilityResult(data);
    } catch (err: any) {
      console.error('Failed to load fleet availability:', err);
      setAvailabilityError(err.message || '가용성 서버 연결 오류');
    } finally {
      setIsLoadingAvailability(false);
    }
  }, [startDate, startTime, endDate, endTime, selectedCategory]);

  // Initial and reactive fetch on interval change
  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Quick Preset Handlers
  const handleSetPresetToday = () => {
    haptics.lightTap();
    setStartDate(todayIso);
    setEndDate(todayIso);
    setStartTime('09:00');
    setEndTime('19:00');
  };

  const handleSetPresetTomorrow = () => {
    haptics.lightTap();
    setStartDate(tomorrowIso);
    setEndDate(tomorrowIso);
    setStartTime('09:00');
    setEndTime('19:00');
  };

  const handleSetPresetWeekend = () => {
    haptics.lightTap();
    const d = new Date();
    // Move to next Saturday
    const day = d.getDay();
    const diffToSat = (6 - day + 7) % 7 || 7;
    const sat = new Date(d);
    sat.setDate(d.getDate() + diffToSat);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);

    const satIso = sat.toISOString().slice(0, 10);
    const sunIso = sun.toISOString().slice(0, 10);

    setStartDate(satIso);
    setEndDate(sunIso);
    setStartTime('09:00');
    setEndTime('21:00');
  };

  const handleSetPresetThreeDays = () => {
    haptics.lightTap();
    const d = new Date();
    const end = new Date(d);
    end.setDate(d.getDate() + 2);

    setStartDate(todayIso);
    setEndDate(end.toISOString().slice(0, 10));
    setStartTime('08:00');
    setEndTime('22:00');
  };

  // Availability lookup map
  const availabilityMap = useMemo(() => {
    const map = new Map<string, AvailableVehicleItem>();
    if (availabilityResult?.vehicles) {
      for (const item of availabilityResult.vehicles) {
        map.set(item.id, item);
        map.set(item.plate, item);
      }
    }
    return map;
  }, [availabilityResult]);

  // Merge canonical 20 vehicles with live availability data & status overrides
  const enrichedVehicles = useMemo(() => {
    return VIP_REAL_VEHICLES.map((v) => {
      const avail = availabilityMap.get(v.id) || availabilityMap.get(v.plate);
      const uiCategory = mapVehicleToUiCategory(v);
      const effectiveOpStatus = statusOverrides[v.id] || v.status;
      return {
        ...v,
        uiCategory,
        effectiveOpStatus,
        isAvailable: avail ? avail.isAvailable : true,
        requestedIntervalStatus: avail ? avail.requestedIntervalStatus : 'available',
        unavailabilityReason: avail?.unavailabilityReason,
        conflictingTrip: avail?.conflictingTrip,
      };
    });
  }, [availabilityMap, statusOverrides]);

  // Category and Search Filtering
  const filteredVehicles = useMemo(() => {
    return enrichedVehicles.filter((v) => {
      // 1. UI Category Filter
      if (selectedCategory !== 'all' && v.uiCategory !== selectedCategory) {
        return false;
      }
      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesPlate = v.plate.toLowerCase().includes(q);
        const matchesPlateShort = v.plateShort.toLowerCase().includes(q);
        const matchesModel = v.model.toLowerCase().includes(q);
        const matchesBrand = v.brand.toLowerCase().includes(q);
        const matchesDriver = v.defaultDriver?.toLowerCase().includes(q);
        if (!matchesPlate && !matchesPlateShort && !matchesModel && !matchesBrand && !matchesDriver) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedVehicles, selectedCategory, searchQuery]);

  // Active Selected Vehicle
  const selectedVehicle = useMemo(() => {
    return (
      enrichedVehicles.find((v) => v.id === selectedVehicleId) ||
      filteredVehicles[0] ||
      enrichedVehicles[0]
    );
  }, [enrichedVehicles, filteredVehicles, selectedVehicleId]);

  // Sync memo draft when selected vehicle changes
  useEffect(() => {
    if (selectedVehicle) {
      setMemoDraft(adminMemos[selectedVehicle.id] || selectedVehicle.adminMemo || '');
      setIsEditingMemo(false);
    }
  }, [selectedVehicle, adminMemos]);

  const handleSaveMemo = () => {
    if (!selectedVehicle) return;
    const updated = { ...adminMemos, [selectedVehicle.id]: memoDraft };
    setAdminMemos(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vip_fleet_admin_memos', JSON.stringify(updated));
      } catch (_) {}
    }
    setIsEditingMemo(false);
    haptics.success();
  };

  const handleUpdateStatus = (newStatus: '운행 중' | '차고지 대기' | '정비 중') => {
    if (!selectedVehicle) return;
    haptics.selection();
    const updated = { ...statusOverrides, [selectedVehicle.id]: newStatus };
    setStatusOverrides(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vip_fleet_status_overrides', JSON.stringify(updated));
      } catch (_) {}
    }
  };

  // Category counts computation for chips
  const categoryCounts = useMemo(() => {
    const counts: Record<VehicleUiCategoryKey, { total: number; available: number }> = {
      all: { total: 20, available: 0 },
      sedan: { total: 4, available: 0 },
      suv: { total: 1, available: 0 },
      van: { total: 6, available: 0 },
      sprinter: { total: 9, available: 0 },
    };

    for (const v of enrichedVehicles) {
      if (v.isAvailable) {
        counts.all.available++;
        if (counts[v.uiCategory]) {
          counts[v.uiCategory].available++;
        }
      }
    }
    return counts;
  }, [enrichedVehicles]);

  const renderChargingSection = (
    title: string,
    spec: VehicleChargingPortSpec | undefined,
    isCarnivalVerified: boolean = false
  ) => {
    const isUnverified = !spec || spec.status === 'unverified';
    const isConfirmed = spec?.status === 'confirmed' || isCarnivalVerified;

    return (
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <BatteryCharging className="w-4 h-4 text-[#1E60F3]" />
            <span className="text-xs font-black text-slate-800">{title}</span>
          </div>
          {isConfirmed ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
              검증 완료
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              미확인 (관리자 확인 필요)
            </span>
          )}
        </div>

        {isConfirmed ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
            <div className="bg-white p-2 rounded-lg border border-slate-200/60 flex flex-col">
              <span className="text-slate-400 font-bold text-[10px]">USB-A</span>
              <span className="font-black text-slate-800">{spec?.usbA ? `${spec.usbA}구` : '0구'}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200/60 flex flex-col">
              <span className="text-slate-400 font-bold text-[10px]">USB-C</span>
              <span className="font-black text-slate-800">{spec?.usbC ? `${spec.usbC}구` : '0구'}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200/60 flex flex-col">
              <span className="text-slate-400 font-bold text-[10px]">12V 시거잭</span>
              <span className="font-black text-slate-800">{spec?.cigar12v ? `${spec.cigar12v}구` : '0구'}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200/60 flex flex-col">
              <span className="text-slate-400 font-bold text-[10px]">220V 인버터</span>
              <span className="font-black text-slate-800">{spec?.ac220v ? '지원' : '미지원'}</span>
            </div>
          </div>
        ) : (
          <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/70 text-[11px] text-amber-900 leading-relaxed">
            <div className="flex items-start gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                현장 실차 점검 전입니다. 임의 추정 없이 차량 입고 시 확인 후 등록해 주세요.
              </span>
            </div>
          </div>
        )}

        {spec?.notes && (
          <p className="text-[10px] text-slate-500 font-medium pt-1">
            참고: {spec.notes}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Mobile Top View Switcher (< lg) */}
      <div className="flex lg:hidden items-center bg-slate-200/70 p-1 rounded-xl text-xs font-black text-slate-700">
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setMobileTab('list');
          }}
          className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            mobileTab === 'list'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'hover:text-slate-900'
          }`}
        >
          <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
          <span>차량 목록 ({filteredVehicles.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setMobileTab('detail');
          }}
          className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            mobileTab === 'detail'
              ? 'bg-white text-[#1E60F3] shadow-xs'
              : 'hover:text-slate-900'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>차량 상세 · 충전 정보</span>
        </button>
      </div>

      {/* Main 3-Column Working Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ============================================================== */}
        {/* COLUMN 1 (Left 3 cols): Filters, Search & Interval Selector  */}
        {/* ============================================================== */}
        <div
          className={`lg:col-span-3 space-y-4 ${
            mobileTab !== 'list' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Section: Category Filter Chips */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#1E60F3]" />
                차종 카테고리
              </span>
              <span className="text-[11px] font-bold text-slate-400">
                총 {VIP_REAL_VEHICLES.length}대
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {UI_CATEGORIES.map((cat) => {
                const countInfo = categoryCounts[cat.key];
                const isSelected = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setSelectedCategory(cat.key);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border ${
                      isSelected
                        ? 'bg-[#1E60F3] text-white border-[#1E60F3] shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/70'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {countInfo ? `${countInfo.available} / ${countInfo.total}대` : `${cat.count}대`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Reservation Interval Selector (Availability Filter) */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1E60F3]" />
                예약 가용성 조회 구간
              </span>
              {isLoadingAvailability && (
                <RefreshCw className="w-3 h-3 text-[#1E60F3] animate-spin" />
              )}
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleSetPresetToday}
                className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer text-center"
              >
                오늘 당일
              </button>
              <button
                type="button"
                onClick={handleSetPresetTomorrow}
                className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer text-center"
              >
                내일 일정
              </button>
              <button
                type="button"
                onClick={handleSetPresetWeekend}
                className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer text-center"
              >
                이번 주말
              </button>
              <button
                type="button"
                onClick={handleSetPresetThreeDays}
                className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer text-center"
              >
                3일 대여
              </button>
            </div>

            {/* Start Date & Time */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                시작 시각 (출발)
              </label>
              <div className="grid grid-cols-12 gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="col-span-7 px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg focus:outline-none focus:border-[#1E60F3]"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="col-span-5 px-2 py-1.5 text-xs font-bold border border-slate-300 rounded-lg focus:outline-none focus:border-[#1E60F3]"
                />
              </div>
            </div>

            {/* End Date & Time */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                종료 시각 (도착)
              </label>
              <div className="grid grid-cols-12 gap-1.5">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="col-span-7 px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg focus:outline-none focus:border-[#1E60F3]"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="col-span-5 px-2 py-1.5 text-xs font-bold border border-slate-300 rounded-lg focus:outline-none focus:border-[#1E60F3]"
                />
              </div>
            </div>

            {/* Turnaround Buffer Notice */}
            <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/60 text-[11px] text-blue-900 leading-relaxed">
              <div className="flex items-start gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5" />
                <span>
                  <strong className="font-black">60분 정비·세차 버퍼 자동 계산:</strong> 운행 종료 직후 1시간 내 중복 배차가 원천 차단됩니다.
                </span>
              </div>
            </div>

            {/* Query Refresh Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                fetchAvailability();
              }}
              disabled={isLoadingAvailability}
              className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAvailability ? 'animate-spin' : ''}`} />
              <span>가용성 다시 조회</span>
            </button>
          </div>

          {/* Quick Search Input */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-2">
            <span className="text-xs font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-[#1E60F3]" />
              차량 검색
            </span>
            <div className="relative">
              <input
                type="text"
                placeholder="차량번호(9982), 차종, 기사명..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:outline-none focus:border-[#1E60F3]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 2 (Center 5 cols): 20 Vehicle Cards List              */}
        {/* ============================================================== */}
        <div
          className={`lg:col-span-5 space-y-3 ${
            mobileTab !== 'list' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* List Header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900">차량 목록</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                {filteredVehicles.length}대 표시
              </span>
            </div>
            {availabilityResult && (
              <span className="text-[11px] font-bold text-emerald-600">
                선택 구간 가용: {categoryCounts[selectedCategory]?.available || 0}대
              </span>
            )}
          </div>

          {/* Vehicle Cards Grid / Stack */}
          <div className="space-y-2.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {filteredVehicles.map((vehicle) => {
              const isSelected = vehicle.id === selectedVehicle?.id;
              const isAvailable = vehicle.isAvailable;

              return (
                <div
                  key={vehicle.id}
                  onClick={() => {
                    haptics.selection();
                    setSelectedVehicleId(vehicle.id);
                    setMobileTab('detail');
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-blue-50/70 border-[#1E60F3] shadow-sm ring-1 ring-[#1E60F3]'
                      : 'bg-white hover:bg-slate-50/80 border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      {/* Vehicle Plate & Category */}
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-950 tracking-tight">
                          {vehicle.plate}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-slate-100 text-slate-700 border border-slate-200/80">
                          {vehicle.uiCategory === 'sprinter'
                            ? '스프린터'
                            : vehicle.uiCategory === 'van'
                            ? '밴'
                            : vehicle.uiCategory === 'suv'
                            ? 'SUV'
                            : '세단'}
                        </span>
                      </div>

                      {/* Vehicle Model & Capacity */}
                      <p className="text-xs font-bold text-slate-600">
                        {vehicle.model}
                        <span className="text-slate-400 font-normal ml-1">
                          ({vehicle.capacity} · {vehicle.fuelType})
                        </span>
                      </p>
                    </div>

                    {/* Interval Availability Badge */}
                    <div>
                      {isAvailable ? (
                        <span className="px-2 py-1 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-xs flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          예약 가능
                        </span>
                      ) : vehicle.requestedIntervalStatus === 'unconfirmed_time' ? (
                        <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-amber-500 text-white flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          시간 미확정
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-[11px] font-black bg-rose-600 text-white flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          예약 있음
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Operational Status & Conflicting Info Footer */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-bold">운영 상태:</span>
                      <span
                        className={`font-black ${
                          vehicle.effectiveOpStatus === '운행 중'
                            ? 'text-blue-600'
                            : vehicle.effectiveOpStatus === '정비 중'
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {vehicle.effectiveOpStatus}
                      </span>
                    </div>

                    {vehicle.conflictingTrip && (
                      <span className="text-rose-600 font-bold truncate max-w-[200px]">
                        충돌: {vehicle.conflictingTrip.timeSpan} ({vehicle.conflictingTrip.customerName})
                      </span>
                    )}

                    {!vehicle.conflictingTrip && vehicle.defaultDriver && (
                      <span className="text-slate-500 font-medium">
                        담당: {vehicle.defaultDriver} 기사
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredVehicles.length === 0 && (
              <div className="bg-white rounded-2xl p-8 border border-slate-200/80 text-center space-y-2">
                <Car className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">검색된 차량이 없습니다.</p>
                <p className="text-xs text-slate-400">검색어나 카테고리 필터를 변경해 보세요.</p>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 3 (Right 4 cols): Selected Vehicle Detail Panel       */}
        {/* ============================================================== */}
        <div
          className={`lg:col-span-4 space-y-4 ${
            mobileTab !== 'detail' ? 'hidden lg:block' : 'block'
          }`}
        >
          {selectedVehicle ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              {/* Top Hero Image Banner */}
              <div className="relative h-44 bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
                <div className="relative w-full h-full">
                  <Image
                    src={getVehicleHeroImage(selectedVehicle.category, selectedVehicle.model)}
                    alt={selectedVehicle.model}
                    fill
                    className="object-contain drop-shadow-lg"
                    priority
                  />
                </div>
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-white/90 backdrop-blur-md text-slate-900 shadow-xs">
                    {selectedVehicle.uiCategory.toUpperCase()}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/40 backdrop-blur-md text-white">
                    {selectedVehicle.capacity}
                  </span>
                </div>
              </div>

              {/* Main Body */}
              <div className="p-4 sm:p-5 space-y-4">
                {/* Header Title & Status Controls */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-950 tracking-tight">
                      {selectedVehicle.plate}
                    </h3>
                    {selectedVehicle.isAvailable ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                        예약 가능
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                        예약 불가 (중복)
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-600">
                    {selectedVehicle.model}
                  </p>
                </div>

                {/* Operation Status Selector */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">실시간 운영 상태</span>
                  <div className="flex items-center gap-1">
                    {(['차고지 대기', '운행 중', '정비 중'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleUpdateStatus(st)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                          selectedVehicle.effectiveOpStatus === st
                            ? st === '운행 중'
                              ? 'bg-blue-600 text-white'
                              : st === '정비 중'
                              ? 'bg-amber-600 text-white'
                              : 'bg-emerald-600 text-white'
                            : 'bg-white hover:bg-slate-200 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interval Conflict Alert (if conflicting) */}
                {selectedVehicle.conflictingTrip && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 font-black text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>중복 배차 충돌 경고</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      선택하신 구간과 60분 간격 버퍼 내에 이미 배차된 일정이 있어 예약할 수 없습니다.
                    </p>
                    <div className="bg-white/80 p-2 rounded-lg border border-rose-200/60 font-medium text-[11px] space-y-0.5">
                      <div>
                        <strong>시간:</strong> {selectedVehicle.conflictingTrip.timeSpan}
                      </div>
                      <div>
                        <strong>고객:</strong> {selectedVehicle.conflictingTrip.customerName}
                      </div>
                      <div>
                        <strong>경로:</strong> {selectedVehicle.conflictingTrip.route}
                      </div>
                    </div>
                  </div>
                )}

                {/* Specifications Grid */}
                <div className="space-y-2">
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
                    기본 제원
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400">차량 식별 번호</span>
                      <span className="font-black text-slate-800">{selectedVehicle.plate}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400">UI 카테고리</span>
                      <span className="font-black text-slate-800">{selectedVehicle.categoryLabel}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400">탑승 정원</span>
                      <span className="font-black text-slate-800">{selectedVehicle.capacity}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400">유종 / 연료</span>
                      <span className="font-black text-slate-800">{selectedVehicle.fuelType}</span>
                    </div>
                  </div>
                </div>

                {/* Charging Specs: 2 Independent Sections (Front & Rear) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#1E60F3]" />
                      전자기기 충전 포트 사양
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      앞자리 / 뒷자리 분리 관리
                    </span>
                  </div>

                  {/* Section 1: Front (Driver & Passenger) */}
                  {renderChargingSection(
                    '앞자리 (운전석·조수석)',
                    selectedVehicle.chargingSpecs?.front,
                    selectedVehicle.category === 'carnival'
                  )}

                  {/* Section 2: Rear (VIP & Passenger Seats) */}
                  {renderChargingSection(
                    '뒷자리 (승객석 / VIP석)',
                    selectedVehicle.chargingSpecs?.rear,
                    selectedVehicle.category === 'carnival'
                  )}
                </div>

                {/* Admin Memo Section */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-[#1E60F3]" />
                      관리자 메모 / 특이사항
                    </span>
                    {!isEditingMemo ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingMemo(true)}
                        className="text-[11px] font-bold text-[#1E60F3] hover:underline cursor-pointer"
                      >
                        수정
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSaveMemo}
                        className="text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer"
                      >
                        저장
                      </button>
                    )}
                  </div>

                  {isEditingMemo ? (
                    <div className="space-y-2">
                      <textarea
                        value={memoDraft}
                        onChange={(e) => setMemoDraft(e.target.value)}
                        placeholder="하이패스 단말기 위치, 전용 차로 진입 여부, 세차 주기 등..."
                        rows={3}
                        className="w-full p-2.5 text-xs font-medium border border-slate-300 rounded-xl focus:outline-none focus:border-[#1E60F3]"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsEditingMemo(false)}
                          className="px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveMemo}
                          className="px-3 py-1 text-xs font-bold bg-[#1E60F3] text-white rounded-lg cursor-pointer"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed min-h-[48px]">
                      {adminMemos[selectedVehicle.id] ||
                        selectedVehicle.adminMemo ||
                        '등록된 관리자 메모가 없습니다.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 border border-slate-200/80 text-center space-y-2">
              <Car className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">선택된 차량이 없습니다.</p>
              <p className="text-xs text-slate-400">차량 목록에서 차량을 선택해 주세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
