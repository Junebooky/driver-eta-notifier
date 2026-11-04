'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  ChevronLeft,
  ChevronRight,
  Phone,
  MessageSquare,
  Star,
  Plane,
  Edit2,
  Edit3,
  Check,
  ArrowLeft,
  Loader2,
  Calendar,
  Image as ImageIcon,
  Pencil,
} from 'lucide-react';
import { HqDriverSummary, DriverScheduleItem } from '@/types/driverHq';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { haptics } from '@/utils/haptics';
import { formatPhoneNumber } from '@/utils/formatters';
import { HqDriverAssetManagerModal } from './HqDriverAssetManagerModal';
import { HqDriverEditModal } from './HqDriverEditModal';
import { getKstTodayDateStr } from '@/utils/dispatchConflictDetector';

interface HqDriverDetailSplitViewProps {
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
  onBackToTable: () => void;
  drivers?: HqDriverSummary[];
  counts?: {
    total: number;
    employed: number;
    freelance: number;
    englishCount: number;
  };
  isLoading?: boolean;
  onUpdateDriver?: (id: string, updates: Record<string, any>) => Promise<boolean>;
  onRefreshDrivers?: () => Promise<void> | void;
}

export const HqDriverDetailSplitView: React.FC<HqDriverDetailSplitViewProps> = ({
  selectedDriverId,
  onSelectDriver,
  onBackToTable,
  drivers: propDrivers,
  counts: propCounts,
  isLoading: propIsLoading,
  onUpdateDriver: propOnUpdateDriver,
  onRefreshDrivers,
}) => {
  const hookState = useHqDrivers();
  const drivers = propDrivers ?? hookState.drivers;
  const counts = propCounts ?? hookState.counts;
  const isLoading = propIsLoading ?? hookState.isLoading;
  const updateDriver = propOnUpdateDriver ?? hookState.updateDriver;

  const [filterAffiliation, setFilterAffiliation] = useState<'all' | 'employed' | 'freelance'>('all');
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUpdatingAffiliation, setIsUpdatingAffiliation] = useState(false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  // Active Driver
  const activeDriver = useMemo(() => {
    return drivers.find((d) => d.id === selectedDriverId) || drivers[0] || null;
  }, [drivers, selectedDriverId]);

  // Synchronize and fetch profile photo whenever active driver changes
  useEffect(() => {
    let isMounted = true;
    setAvatarLoadError(false);

    if (!activeDriver?.id) {
      setProfileAvatarUrl(null);
      return;
    }

    if (activeDriver.avatarUrl) {
      setProfileAvatarUrl(activeDriver.avatarUrl);
    }

    // Always query latest active profile asset from cockpit storage
    fetch(`/api/hq/drivers/assets?driverId=${encodeURIComponent(activeDriver.id)}&type=profile`, {
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data?.ok && data.profile?.signedUrl) {
          setProfileAvatarUrl(data.profile.signedUrl);
        } else if (data?.ok && !data.profile) {
          setProfileAvatarUrl(null);
        }
      })
      .catch(() => { });

    return () => {
      isMounted = false;
    };
  }, [activeDriver?.id, activeDriver?.avatarUrl]);

  const effectiveAvatarUrl = profileAvatarUrl || activeDriver?.avatarUrl || null;

  // Sync memo draft when active driver changes
  const currentMemo = activeDriver?.memo || '';

  const handleStartEditMemo = () => {
    setMemoDraft(currentMemo);
    setIsEditingMemo(true);
  };

  const handleSaveMemo = async () => {
    if (!activeDriver) return;
    setIsSavingMemo(true);
    try {
      const ok = await updateDriver(activeDriver.id, { memo: memoDraft });
      if (ok) {
        setIsEditingMemo(false);
        haptics.success();
      } else {
        alert('메모 저장에 실패했습니다.');
      }
    } finally {
      setIsSavingMemo(false);
    }
  };

  // Filtered driver list for left column (소속 기사 우선 노출)
  const filteredDrivers = useMemo(() => {
    const list = drivers.filter((d) => {
      if (filterAffiliation === 'all') return true;
      return d.affiliationType === filterAffiliation;
    });

    // 소속(employed) 기사를 최상단에 먼저 노출
    return list.slice().sort((a, b) => {
      if (a.affiliationType !== b.affiliationType) {
        return a.affiliationType === 'employed' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [drivers, filterAffiliation]);

  // Compute 7 days for the displayed week based on weekOffset (Dynamic KST reference date)
  const weekInfo = useMemo(() => {
    const todayKst = getKstTodayDateStr();
    const [ty, tm, td] = todayKst.split('-').map((n) => parseInt(n, 10));
    const baseDate = new Date(Date.UTC(ty, tm - 1, td));
    // Shift by weekOffset weeks
    baseDate.setUTCDate(baseDate.getUTCDate() + weekOffset * 7);

    // Find Monday of this week (day 1, where 0 = Mon, 6 = Sun)
    const currentDayOfWeek = (baseDate.getUTCDay() + 6) % 7;
    const monday = new Date(baseDate);
    monday.setUTCDate(monday.getUTCDate() - currentDayOfWeek);

    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    const days = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const fullDate = `${yyyy}-${mm}-${dd}`;
      const isToday = fullDate === todayKst;

      days.push({
        dayIndex: i,
        dateNum: String(d.getDate()),
        dayName: dayNames[i],
        fullDate,
        isToday,
      });
    }

    const startLabel = `${days[0].fullDate.replace(/-/g, '. ')}.(${days[0].dayName})`;
    const endLabel = `${days[6].fullDate.slice(5).replace(/-/g, '. ')}.(${days[6].dayName})`;
    const weekLabel = `${startLabel} ~ ${endLabel}`;

    return { days, weekLabel };
  }, [weekOffset]);

  // Hourly slots from 06:00 to 20:00 (every 2 hours)
  const timeHours = [6, 8, 10, 12, 14, 16, 18, 20];

  if (isLoading && drivers.length === 0) {
    return (
      <div className="py-24 text-center bg-white rounded-2xl border border-slate-200">
        <Loader2 className="w-8 h-8 mx-auto text-[#1E60F3] animate-spin mb-3" />
        <p className="font-bold text-slate-600">기사 상세 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (!activeDriver) {
    return (
      <div className="py-24 text-center bg-white rounded-2xl border border-slate-200">
        <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
        <p className="font-bold text-slate-600">선택 가능한 기사가 없습니다.</p>
        <button
          type="button"
          onClick={onBackToTable}
          className="mt-4 px-4 py-2 rounded-xl bg-[#1E60F3] text-white text-xs font-bold"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top Back Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToTable}
          className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs group"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
          <span>표 목록으로 보기</span>
        </button>
      </div>

      {/* Main 3-Column Split Layout */}
      {/* Col 1: Left Compact Driver List (w-[250px]) */}
      {/* Col 2: Middle Basic Info (w-[320px]) - [SWAPPED AS REQUESTED] */}
      {/* Col 3: Right Weekly Schedule Calendar (flex-1) - [SWAPPED AS REQUESTED] */}
      <div className="flex flex-col lg:flex-row items-start gap-4">
        {/* ========================================================= */}
        {/* Column 1 (Left): Compact Driver List (w-[250px])           */}
        {/* ========================================================= */}
        <div className="w-full lg:w-[250px] shrink-0 bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col h-[750px]">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 flex items-center gap-2 bg-white rounded-t-2xl">
            <div className="relative group/drivers inline-flex items-center gap-2 cursor-pointer">
              <img
                src="/images/icons/drivers/icon_driver.png"
                alt="기사 목록"
                className="w-12 h-12 object-contain shrink-0 transition-transform duration-150 group-hover/drivers:scale-110 drop-shadow-2xs select-none"
                draggable={false}
              />
              <h2 className="text-sm font-black text-slate-900">기사 목록</h2>

              {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 (최상단 레이어) */}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover/drivers:flex flex-col items-start pointer-events-none z-[100]">
                <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                  소속 및 프리랜서 기사님들의 프로필과 배차 자격을 관리해요
                </span>
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 ml-4 shadow-xs" />
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setFilterAffiliation('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filterAffiliation === 'all'
                ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 font-extrabold shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
            >
              전체 {counts.total}
            </button>
            <button
              type="button"
              onClick={() => setFilterAffiliation('employed')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filterAffiliation === 'employed'
                ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 font-extrabold shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
            >
              소속 {counts.employed}
            </button>
            {counts.freelance > 0 && (
              <button
                type="button"
                onClick={() => setFilterAffiliation('freelance')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${filterAffiliation === 'freelance'
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 font-extrabold shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
              >
                프리랜서 {counts.freelance}
              </button>
            )}
          </div>

          {/* Driver List */}
          <div className="divide-y divide-slate-100 overflow-y-auto flex-1 rounded-b-2xl">
            {filteredDrivers.map((driver) => {
              const isSelected = driver.id === activeDriver.id;

              return (
                <div
                  key={driver.id}
                  onClick={() => {
                    haptics.lightTap();
                    onSelectDriver(driver.id);
                  }}
                  className={`p-3 transition-all cursor-pointer relative ${isSelected
                    ? 'bg-blue-50/80 border-l-4 border-l-[#1E60F3] shadow-2xs'
                    : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    {driver.avatarUrl || (driver.id === activeDriver?.id && effectiveAvatarUrl) ? (
                      <img
                        src={(driver.id === activeDriver?.id && effectiveAvatarUrl) || driver.avatarUrl}
                        alt={driver.name}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                        className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-[#1E60F3] border border-blue-100 font-black text-xs flex items-center justify-center shrink-0">
                        {driver.name.slice(0, 1)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs truncate ${isSelected ? 'font-black text-slate-900' : 'font-extrabold text-slate-800'
                            }`}
                        >
                          {driver.name}
                        </span>

                        {driver.affiliationType === 'employed' && (
                          <span className="px-1.5 py-0.2 rounded bg-blue-100 text-[#1E60F3] text-[9.5px] font-black shrink-0">
                            소속
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10.5px] text-slate-400 mt-1">
                        {driver.vehicleModel && driver.vehicleModel !== '차량 미지정' ? (
                          <span className="truncate max-w-[85px] text-slate-500 font-medium">
                            {driver.vehicleModel}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="font-mono truncate ml-1">{formatPhoneNumber(driver.phone)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================= */}
        {/* Column 2 (Middle): 기본 정보 (Basic Info) (w-[320px])      */}
        {/* [Swapped position: placed in middle as requested]          */}
        {/* ========================================================= */}
        <div className="w-full lg:w-[320px] shrink-0 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4 h-[750px] overflow-y-auto">
          {/* Section Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900">기본 정보</h3>
            <span className="text-[11px] font-semibold text-slate-400">
              드라이버 프로필
            </span>
          </div>

          {/* Driver Profile Header Card */}
          <div className="relative p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-3">
            {/* 1행: 아바타 + 기사 풀네임 + 소속 뱃지 + 수정(연필) 버튼 */}
            <div className="flex items-center gap-3">
              {effectiveAvatarUrl && !avatarLoadError ? (
                <div
                  className="relative group/avatar cursor-pointer shrink-0"
                  onClick={() => setIsAssetModalOpen(true)}
                  title="배차 안내 카드 설정"
                >
                  <img
                    key={effectiveAvatarUrl}
                    src={effectiveAvatarUrl}
                    alt={activeDriver.name}
                    onError={() => setAvatarLoadError(true)}
                    className="w-14 h-14 rounded-full object-cover border border-slate-200 shadow-xs ring-2 ring-white transition-transform group-hover/avatar:scale-105"
                  />
                  <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(true)}
                  title="프로필 사진 등록하기"
                  className="w-14 h-14 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-black text-lg flex items-center justify-center shadow-xs shrink-0 cursor-pointer transition-colors"
                >
                  {activeDriver.name.slice(0, 1)}
                </button>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-lg font-bold text-slate-900 break-keep">{activeDriver.name}</h3>
                  {activeDriver.affiliationType === 'employed' && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-50 text-[#0050FF] shrink-0">
                      소속
                    </span>
                  )}
                  <button
                    type="button"
                    title="기사 정보 수정"
                    onClick={() => {
                      haptics.selection();
                      setIsEditModalOpen(true);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5 stroke-[2.2]" />
                  </button>
                </div>
                <p className="text-[11.5px] text-slate-500 mt-0.5 truncate">
                  {activeDriver.residence ? `${activeDriver.residence} 거주` : '거주지 미등록'}
                </p>
              </div>
            </div>

            {/* 2행: 지원 언어 뱃지 (좌측) + 전화 & VIP의전카드 3D 아이콘 나란히 (우측) */}
            <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/60">
              {/* 언어 뱃지 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="bg-white border border-slate-200/80 px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-700 shadow-2xs">
                  🇰🇷 한국어
                </span>
                {activeDriver.englishAvailable && (
                  <span className="bg-blue-50 text-[#0050FF] border border-blue-100 px-2 py-0.5 rounded-full text-[11px] font-bold shadow-2xs">
                    🇺🇸 영어
                  </span>
                )}
              </div>

              {/* 액션 아이콘: 전화 & VIP 의전카드 나란히 */}
              <div className="flex items-center gap-2 shrink-0">
                {/* 1. 전화 걸기 아이콘 */}
                <div className="relative group/phone inline-flex items-center justify-center">
                  {activeDriver.phone ? (
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        window.location.href = `tel:${activeDriver.phone}`;
                      }}
                      className="cursor-pointer transition-transform duration-150 group-hover/phone:scale-110 active:scale-95 flex items-center justify-center"
                      aria-label={formatPhoneNumber(activeDriver.phone)}
                    >
                      <img
                        src="/images/icons/drivers/icon_phone.png"
                        alt="전화 걸기"
                        className="w-9 h-9 object-contain drop-shadow-2xs select-none"
                        draggable={false}
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="opacity-35 cursor-not-allowed flex items-center justify-center"
                      aria-label="연락처 미등록"
                    >
                      <img
                        src="/images/icons/drivers/icon_phone.png"
                        alt="연락처 미등록"
                        className="w-9 h-9 object-contain select-none grayscale"
                        draggable={false}
                      />
                    </button>
                  )}

                  {/* 전화 Hover Tooltip (아래로 향하는 말풍선) */}
                  <div className="absolute top-full right-1/2 translate-x-1/2 pt-2 hidden group-hover/phone:flex flex-col items-center pointer-events-none z-50">
                    <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 shadow-xs" />
                    <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                      {activeDriver.phone ? formatPhoneNumber(activeDriver.phone) : '연락처 미등록'}
                    </span>
                  </div>
                </div>

                {/* 2. VIP 의전카드 관리 아이콘 */}
                <div className="relative group/profile inline-flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setIsAssetModalOpen(true);
                    }}
                    className="cursor-pointer transition-transform duration-150 group-hover/profile:scale-110 active:scale-95 flex items-center justify-center"
                    aria-label="프로필 카드를 관리해요"
                  >
                    <img
                      src="/images/icons/drivers/icon_profile_card.png"
                      alt="프로필 카드를 관리해요"
                      className="w-11 h-11 object-contain drop-shadow-2xs select-none"
                      draggable={false}
                    />
                  </button>

                  {/* VIP의전카드 Hover Tooltip (아래로 향하는 말풍선) */}
                  <div className="absolute top-full right-0 pt-2 hidden group-hover/profile:flex flex-col items-end pointer-events-none z-50">
                    <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 mr-4 shadow-xs" />
                    <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                      프로필 카드를 관리해요
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Details List */}
          <div className="bg-slate-50/60 rounded-2xl border border-slate-100 p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500 font-bold">소속 변경</span>
              <div className="inline-flex items-center bg-slate-200/60 p-0.5 rounded-lg border border-slate-200 shadow-2xs text-[11px]">
                <button
                  type="button"
                  disabled={isUpdatingAffiliation}
                  onClick={async () => {
                    if (activeDriver.affiliationType !== 'employed') {
                      haptics.selection();
                      setIsUpdatingAffiliation(true);
                      try {
                        const ok = await updateDriver(activeDriver.id, { affiliationType: 'employed' });
                        if (ok) {
                          onRefreshDrivers?.();
                        }
                      } finally {
                        setIsUpdatingAffiliation(false);
                      }
                    }
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold transition-all cursor-pointer ${activeDriver.affiliationType === 'employed'
                    ? 'bg-[#0050FF] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                >
                  소속
                </button>
                <button
                  type="button"
                  disabled={isUpdatingAffiliation}
                  onClick={async () => {
                    if (activeDriver.affiliationType !== 'freelance') {
                      haptics.selection();
                      setIsUpdatingAffiliation(true);
                      try {
                        const ok = await updateDriver(activeDriver.id, { affiliationType: 'freelance' });
                        if (ok) {
                          onRefreshDrivers?.();
                        }
                      } finally {
                        setIsUpdatingAffiliation(false);
                      }
                    }
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold transition-all cursor-pointer ${activeDriver.affiliationType === 'freelance'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                >
                  프리랜서
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">생년월일</span>
              <span className="font-mono font-bold text-slate-700">
                {activeDriver.birthDate || '미등록'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">거주 지역</span>
              <span className="font-bold text-slate-800">
                {activeDriver.residence}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">연락처</span>
              <span className="font-mono font-bold text-slate-800">
                {activeDriver.phone ? (
                  <a href={`tel:${activeDriver.phone}`} className="hover:text-[#0050FF] hover:underline transition-colors">
                    {formatPhoneNumber(activeDriver.phone)}
                  </a>
                ) : (
                  '미등록'
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">지원 언어</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                  한국어
                </span>
                {activeDriver.englishAvailable && (
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0050FF] border border-blue-200/60 text-xs font-bold">
                    영어
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">등록일</span>
              <span className="font-mono font-bold text-slate-700">
                {activeDriver.joinedDate || '미등록'}
              </span>
            </div>

            {activeDriver.vehicleModel && activeDriver.vehicleModel !== '차량 미지정' && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-slate-400 font-semibold">배정 차량</span>
                <span className="font-bold text-slate-800">
                  {activeDriver.vehicleModel} ({activeDriver.carNumber || activeDriver.vehicleNo})
                </span>
              </div>
            )}
          </div>

          {/* Card: 최근 운행일 */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-black text-slate-900">최근 운행일</h4>
            {activeDriver.recentTripDate ? (
              <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#0050FF] flex items-center justify-center shrink-0">
                  <Plane className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-mono font-extrabold text-[#0050FF]">
                    {activeDriver.recentTripDate}
                  </div>
                  <div className="text-xs font-black text-slate-800 truncate mt-0.5">
                    {activeDriver.recentTripRoute || '운행 일정 완료'}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-medium py-1">
                배정된 운행 이력이 없어요
              </p>
            )}
          </div>

          {/* Card: 메모 (Editable and Persisted to DB) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900">관리자 메모</h4>
              {!isEditingMemo ? (
                currentMemo ? (
                  <button
                    type="button"
                    onClick={handleStartEditMemo}
                    className="px-2 py-0.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <Edit2 className="w-3 h-3 text-slate-400" />
                    <span>수정</span>
                  </button>
                ) : null
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingMemo(false)}
                  className="px-2 py-0.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 cursor-pointer shadow-2xs"
                >
                  취소
                </button>
              )}
            </div>

            {isEditingMemo ? (
              <div className="space-y-2">
                <textarea
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                  rows={3}
                  placeholder="기사 특이사항, 의전 스타일, 비고 등..."
                  className="w-full p-2.5 text-xs font-medium text-slate-800 bg-white border border-blue-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs leading-relaxed"
                />
                <button
                  type="button"
                  onClick={handleSaveMemo}
                  disabled={isSavingMemo}
                  className="w-full py-1.5 rounded-lg bg-[#0050FF] text-white text-xs font-bold shadow-2xs hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  {isSavingMemo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingMemo ? '저장 중...' : '저장 완료'}</span>
                </button>
              </div>
            ) : currentMemo ? (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs font-medium text-slate-700 leading-relaxed min-h-[50px]">
                {currentMemo}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEditMemo}
                className="text-xs text-[#0050FF] hover:underline font-semibold flex items-center gap-1 py-1 cursor-pointer"
              >
                + 메모 추가하기
              </button>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* Column 3 (Right): 주간 스케줄 달력표 (Weekly Timetable)     */}
        {/* [Swapped position: placed on right as requested]          */}
        {/* ========================================================= */}
        <div className="flex-1 min-w-0 w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4 h-[750px] flex flex-col">
          {/* Header Bar: Title + Week Navigator */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 shrink-0">
            <h3 className="text-sm font-black text-slate-900">
              {activeDriver.name} 기사님의 주간 일정
            </h3>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-700">
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w - 1)}
                  className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="이전 주"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-extrabold text-[11px] text-slate-800">
                  {weekInfo.weekLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="다음 주"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold cursor-pointer transition-colors"
                >
                  오늘
                </button>
              )}
            </div>
          </div>

          {/* Timetable Grid Container */}
          <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-0 bg-white select-none">
            {/* Top Days Header Row */}
            <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50 text-center text-xs font-black divide-x divide-slate-200 shrink-0">
              {/* Top-left corner cell */}
              <div className="py-2.5 px-1 text-[11px] text-slate-400 font-semibold flex items-center justify-center">
                시간
              </div>

              {/* 7 Day Header Columns */}
              {weekInfo.days.map((day) => (
                <div
                  key={day.fullDate}
                  className={`py-2 px-1 text-center transition-colors ${day.isToday ? 'bg-blue-50/90 text-[#1E60F3]' : 'text-slate-700'
                    }`}
                >
                  <div className="text-xs font-black">
                    {day.dateNum}일 ({day.dayName})
                  </div>
                  {day.isToday && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#1E60F3] mt-0.5" />
                  )}
                </div>
              ))}
            </div>

            {/* Timetable Rows Body */}
            <div className="flex-1 overflow-y-auto relative">
              <div className="grid grid-cols-8 relative min-h-[496px]">
                {/* Left Hours Column */}
                <div className="divide-y divide-slate-100 border-r border-slate-100 bg-slate-50/40">
                  {timeHours.map((hour) => (
                    <div
                      key={hour}
                      className="h-[62px] p-2 text-[11px] font-mono font-bold text-slate-400 text-center flex items-start justify-center"
                    >
                      {String(hour).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* 7 Day Columns with Schedule Cards */}
                {weekInfo.days.map((day) => {
                  // Match real schedule by dateStr if available, or dayIndex
                  const daySchedules = activeDriver.schedules.filter((sch) => {
                    if (sch.dateStr) {
                      return sch.dateStr === day.fullDate;
                    }
                    return sch.dayIndex === day.dayIndex;
                  });

                  return (
                    <div
                      key={day.fullDate}
                      className={`relative border-r border-slate-100 divide-y divide-slate-100/70 ${day.isToday ? 'bg-blue-50/20' : ''
                        }`}
                    >
                      {/* Background horizontal hour guide lines */}
                      {timeHours.map((hour) => (
                        <div key={hour} className="h-[62px]" />
                      ))}

                      {/* Absolute Positioned Schedule Cards for this Day */}
                      {daySchedules.map((sch) => {
                        const isAirport = sch.type === 'airport';
                        const isEvent = sch.type === 'event';
                        const topPct = Math.max(0, Math.min(95, ((sch.startHour - 6) / 16) * 100));
                        const heightPct = Math.max(8, Math.min(50, (sch.durationHours / 16) * 100));

                        return (
                          <div
                            key={sch.id}
                            style={{
                              top: `${topPct}%`,
                              height: `${heightPct}%`,
                              left: '3px',
                              right: '3px',
                            }}
                            className={`absolute rounded-xl p-2 border shadow-xs text-left cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between overflow-hidden z-10 ${isAirport || isEvent
                              ? 'bg-blue-50/95 border-blue-300 text-blue-950 border-l-4 border-l-[#1E60F3]'
                              : 'bg-slate-100/95 border-slate-200 text-slate-800 border-l-4 border-l-slate-400'
                              }`}
                          >
                            <div className="min-w-0 flex-1 flex flex-col justify-between">
                              <div>
                                <div className="text-[9.5px] font-extrabold text-blue-900 font-mono tracking-tight leading-tight">
                                  {sch.startTime} - {sch.endTime}
                                </div>
                                <div className="text-[10px] font-black text-slate-900 leading-tight mt-0.5 line-clamp-2">
                                  {sch.route}
                                </div>
                              </div>
                              <div className="text-[9px] font-bold text-blue-600/90 leading-tight mt-0.5 truncate">
                                {sch.detail}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Schedule Footer Legend */}
          <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-blue-500" />
              <span>VIP 의전</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-slate-400" />
              <span>일반 운행</span>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Asset Manager Modal */}
      {isAssetModalOpen && activeDriver && (
        <HqDriverAssetManagerModal
          isOpen={isAssetModalOpen}
          onClose={() => setIsAssetModalOpen(false)}
          drivers={drivers}
          initialDriverId={activeDriver.id}
          initialVehiclePlate={activeDriver.plate || activeDriver.carNumber}
          onAssetUpdated={async () => {
            // 1. Immediately refresh active driver's profile asset
            try {
              const res = await fetch(
                `/api/hq/drivers/assets?driverId=${encodeURIComponent(activeDriver.id)}&type=profile`,
                { headers: { 'Cache-Control': 'no-cache' } }
              );
              const data = await res.json();
              if (data?.ok) {
                setProfileAvatarUrl(data.profile?.signedUrl || null);
                setAvatarLoadError(false);
              }
            } catch { }
            // 2. Refetch full driver roster
            onRefreshDrivers?.();
            hookState.refetch();
          }}
        />
      )}

      {/* Driver Profile Edit Modal */}
      {isEditModalOpen && activeDriver && (
        <HqDriverEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          driver={activeDriver}
          onSave={async (id, updates) => {
            const ok = await updateDriver(id, updates);
            if (ok) {
              onRefreshDrivers?.();
              hookState.refetch();
            }
            return ok;
          }}
        />
      )}
    </div>
  );
};
