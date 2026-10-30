'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  ChevronLeft,
  ChevronRight,
  Phone,
  MessageSquare,
  Star,
  Plane,
  Edit2,
  Check,
  ArrowLeft,
  Loader2,
  Calendar,
} from 'lucide-react';
import { HqDriverSummary, DriverScheduleItem } from '@/types/driverHq';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { haptics } from '@/utils/haptics';

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
}

export const HqDriverDetailSplitView: React.FC<HqDriverDetailSplitViewProps> = ({
  selectedDriverId,
  onSelectDriver,
  onBackToTable,
  drivers: propDrivers,
  counts: propCounts,
  isLoading: propIsLoading,
  onUpdateDriver: propOnUpdateDriver,
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

  // Active Driver
  const activeDriver = useMemo(() => {
    return drivers.find((d) => d.id === selectedDriverId) || drivers[0] || null;
  }, [drivers, selectedDriverId]);

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

  // Filtered driver list for left column
  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (filterAffiliation === 'all') return true;
      return d.affiliationType === filterAffiliation;
    });
  }, [drivers, filterAffiliation]);

  // Compute 7 days for the displayed week based on weekOffset (Reference date: 2026-10-28)
  const weekInfo = useMemo(() => {
    const baseDate = new Date('2026-10-28T00:00:00+09:00');
    // Shift by weekOffset weeks
    baseDate.setDate(baseDate.getDate() + weekOffset * 7);

    // Find Monday of this week (day 1)
    const currentDayOfWeek = (baseDate.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    const monday = new Date(baseDate);
    monday.setDate(monday.getDate() - currentDayOfWeek);

    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    const days = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const fullDate = `${yyyy}-${mm}-${dd}`;
      const isToday = fullDate === '2026-10-28';

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
          <span>전체 기사 목록으로 돌아가기</span>
        </button>

        <span className="text-xs text-slate-400 font-medium">
          선택된 기사: <strong className="text-slate-900">{activeDriver.name}</strong> ({activeDriver.affiliationLabel})
        </span>
      </div>

      {/* Main 3-Column Split Layout */}
      {/* Col 1: Left Compact Driver List (w-[250px]) */}
      {/* Col 2: Middle Basic Info (w-[320px]) - [SWAPPED AS REQUESTED] */}
      {/* Col 3: Right Weekly Schedule Calendar (flex-1) - [SWAPPED AS REQUESTED] */}
      <div className="flex flex-col lg:flex-row items-start gap-4">
        {/* ========================================================= */}
        {/* Column 1 (Left): Compact Driver List (w-[250px])           */}
        {/* ========================================================= */}
        <div className="w-full lg:w-[250px] shrink-0 bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col h-[750px]">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 flex items-center gap-2 bg-white">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-black text-slate-900">기사 관리</h2>
          </div>

          {/* Filter Pills */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setFilterAffiliation('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                filterAffiliation === 'all'
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 font-extrabold shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              전체 {counts.total}
            </button>
            <button
              type="button"
              onClick={() => setFilterAffiliation('employed')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                filterAffiliation === 'employed'
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 font-extrabold shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              소속 {counts.employed}
            </button>
            <button
              type="button"
              onClick={() => setFilterAffiliation('freelance')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                filterAffiliation === 'freelance'
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 font-extrabold shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              프리 {counts.freelance}
            </button>
          </div>

          {/* Driver List */}
          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {filteredDrivers.map((driver) => {
              const isSelected = driver.id === activeDriver.id;

              return (
                <div
                  key={driver.id}
                  onClick={() => {
                    haptics.lightTap();
                    onSelectDriver(driver.id);
                  }}
                  className={`p-3 transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-blue-50/80 border-l-4 border-l-[#1E60F3] shadow-2xs'
                      : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {driver.avatarUrl ? (
                      <img
                        src={driver.avatarUrl}
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
                          className={`text-xs truncate ${
                            isSelected ? 'font-black text-slate-900' : 'font-extrabold text-slate-800'
                          }`}
                        >
                          {driver.name}
                        </span>

                        {driver.affiliationType === 'employed' ? (
                          <span className="px-1.5 py-0.2 rounded bg-blue-100 text-[#1E60F3] text-[9.5px] font-black shrink-0">
                            소속
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-700 text-[9.5px] font-black shrink-0">
                            프리
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10.5px] text-slate-400 mt-1">
                        {driver.rating !== undefined && driver.rating !== null ? (
                          <div className="flex items-center gap-1 text-amber-500 font-bold">
                            <Star className="w-2.5 h-2.5 fill-amber-400 shrink-0" />
                            <span>{driver.rating.toFixed(1)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-bold">-</span>
                        )}
                        <span className="font-mono truncate ml-1">{driver.phone || '-'}</span>
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
          <div className="flex items-start gap-4 p-3 bg-slate-50/70 rounded-2xl border border-slate-100">
            {activeDriver.avatarUrl ? (
              <img
                src={activeDriver.avatarUrl}
                alt={activeDriver.name}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-xs shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#1E60F3] border-2 border-blue-100 font-black text-xl flex items-center justify-center shadow-xs shrink-0">
                {activeDriver.name.slice(0, 1)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-black text-slate-900">
                  {activeDriver.name}
                </h4>
                {activeDriver.affiliationType === 'employed' ? (
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-[#1E60F3] text-[10px] font-black">
                    소속
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 text-[10px] font-black">
                    프리랜서
                  </span>
                )}
              </div>

              {/* Rating and badges */}
              <div className="flex items-center gap-1.5 mt-1 text-xs">
                {activeDriver.rating !== undefined && activeDriver.rating !== null ? (
                  <div className="flex items-center gap-1 text-amber-500 font-extrabold">
                    <Star className="w-3.5 h-3.5 fill-amber-400 shrink-0" />
                    <span>{activeDriver.rating.toFixed(1)}</span>
                    {activeDriver.reviewCount !== undefined && (
                      <span className="text-slate-400 font-medium">({activeDriver.reviewCount}건)</span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400 font-semibold text-xs">평점 없음</span>
                )}
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1 text-sm">
                  {activeDriver.flags.map((flag, idx) => (
                    <span key={idx} title={flag === '🇺🇸' ? '영어 가능' : '한국어'}>
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Contact Action Buttons */}
          <div className="flex items-center gap-2">
            <a
              href={`tel:${activeDriver.phone}`}
              className="flex-1 py-2 px-3 rounded-xl bg-blue-50/70 hover:bg-blue-100 border border-blue-200/80 text-[#1E60F3] text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Phone className="w-3.5 h-3.5" />
              <span className="font-mono">{activeDriver.phone || '연락처 미등록'}</span>
            </a>

            {activeDriver.phone && (
              <>
                <a
                  href={`tel:${activeDriver.phone}`}
                  className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                  title="전화 걸기"
                >
                  <Phone className="w-3.5 h-3.5" />
                </a>

                <a
                  href={`sms:${activeDriver.phone}`}
                  className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                  title="문자 발송"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </a>
              </>
            )}
          </div>

          {/* Profile Details List */}
          <div className="bg-slate-50/60 rounded-2xl border border-slate-100 p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">소속</span>
              <span className="font-extrabold text-slate-800">
                {activeDriver.affiliationLabel}
              </span>
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
              <span className="text-slate-400 font-semibold">언어 가능</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                {activeDriver.englishAvailable ? (
                  <span className="flex items-center gap-1 text-[#1E60F3] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-black">
                    <span>🇺🇸</span>
                    <span>영어 가능</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-700">
                    <span>🇰🇷</span>
                    <span>한국어</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">가입/등록일</span>
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
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#1E60F3] flex items-center justify-center shrink-0">
                  <Plane className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-mono font-extrabold text-[#1E60F3]">
                    {activeDriver.recentTripDate}
                  </div>
                  <div className="text-xs font-black text-slate-800 truncate mt-0.5">
                    {activeDriver.recentTripRoute || '운행 일정 완료'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-400 font-medium">
                배정된 운행 이력이 없습니다.
              </div>
            )}
          </div>

          {/* Card: 메모 (Editable and Persisted to DB) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900">관리자 메모</h4>
              {!isEditingMemo ? (
                <button
                  type="button"
                  onClick={handleStartEditMemo}
                  className="px-2 py-0.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Edit2 className="w-3 h-3 text-slate-400" />
                  <span>수정</span>
                </button>
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
                  className="w-full py-1.5 rounded-lg bg-[#1E60F3] text-white text-xs font-bold shadow-2xs hover:bg-blue-600 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  {isSavingMemo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingMemo ? '저장 중...' : '저장 완료'}</span>
                </button>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs font-medium text-slate-700 leading-relaxed min-h-[50px]">
                {currentMemo || '(등록된 메모가 없습니다)'}
              </div>
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
              {activeDriver.name}의 주간 스케줄
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
                  className={`py-2 px-1 text-center transition-colors ${
                    day.isToday ? 'bg-blue-50/90 text-[#1E60F3]' : 'text-slate-700'
                  }`}
                >
                  <div className="text-xs font-black">
                    {day.dateNum} ({day.dayName})
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
                      className={`relative border-r border-slate-100 divide-y divide-slate-100/70 ${
                        day.isToday ? 'bg-blue-50/20' : ''
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
                            className={`absolute rounded-xl p-2 border shadow-xs text-left cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between overflow-hidden z-10 ${
                              isAirport || isEvent
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
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-blue-500" />
                <span>공항 / VIP 의전</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-slate-400" />
                <span>일반 미팅 / 대기</span>
              </div>
            </div>

            <span className="text-[10.5px] text-slate-400">
              * 기사 스마트폰 Cockpit과 실시간 양방향 동기화됨
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
