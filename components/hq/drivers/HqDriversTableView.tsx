'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Phone,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  Key,
  RefreshCw,
  Edit3,
  UserCheck,
  UserMinus,
  User,
  Trash2,
} from 'lucide-react';
import { HqDriverSummary } from '@/types/driverHq';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { haptics } from '@/utils/haptics';
import { formatPhoneNumber } from '@/utils/formatters';
import { getKstTodayDateStr } from '@/utils/dispatchConflictDetector';
import { HqDriverEditModal } from './HqDriverEditModal';

export interface HqDriversTableViewProps {
  onSelectDriver: (driverId: string) => void;
  initialSearchQuery?: string;
  onOpenAddDriver?: () => void;
  drivers?: HqDriverSummary[];
  counts?: {
    total: number;
    employed: number;
    freelance: number;
    englishCount: number;
  };
  isLoading?: boolean;
  error?: string | null;
  statusCode?: number | null;
  onRetry?: () => void;
  onOpenLogin?: () => void;
  onUpdateDriver?: (id: string, updates: Record<string, any>) => Promise<boolean>;
  onDeleteDriver?: (id: string) => Promise<boolean>;
}

export const HqDriversTableView: React.FC<HqDriversTableViewProps> = ({
  onSelectDriver,
  initialSearchQuery = '',
  onOpenAddDriver,
  drivers: propDrivers,
  counts: propCounts,
  isLoading: propIsLoading,
  error: propError,
  statusCode: propStatusCode,
  onRetry: propOnRetry,
  onOpenLogin,
  onUpdateDriver: propOnUpdateDriver,
  onDeleteDriver: propOnDeleteDriver,
}) => {
  // If not passed from parent, use the custom hook
  const hookState = useHqDrivers();
  const drivers = propDrivers ?? hookState.drivers;
  const counts = propCounts ?? hookState.counts;
  const isLoading = propIsLoading ?? hookState.isLoading;
  const updateDriver = propOnUpdateDriver ?? hookState.updateDriver;
  const deleteDriver = propOnDeleteDriver ?? hookState.deleteDriver;
  const error = propError ?? hookState.error;
  const statusCode = propStatusCode ?? hookState.statusCode;
  const onRetry = propOnRetry ?? hookState.refetch;

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [affiliationFilter, setAffiliationFilter] = useState<'all' | 'employed' | 'freelance'>('all');
  const [residenceFilter, setResidenceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'driving' | 'off' | 'active' | 'vacation'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [menuOpenDriverId, setMenuOpenDriverId] = useState<string | null>(null);
  const [editingDriver, setEditingDriver] = useState<HqDriverSummary | null>(null);
  const [driverIconError, setDriverIconError] = useState(false);
  const pageSize = 10;

  // Helper to determine real-time operation status:
  // 'driving' (운행 중 - 파랑 칩) | 'available' (운행 가능 - 초록 칩) | 'off' (휴무 - 회색 칩)
  const getDriverStatus = (driver: HqDriverSummary): 'available' | 'driving' | 'off' => {
    if (!driver.isAvailable) return 'off';
    const today = getKstTodayDateStr();
    const hasTodayTrip = driver.schedules?.some((s) => s.dateStr === today);
    if (hasTodayTrip) return 'driving';
    return 'available';
  };

  // Helper to check if a driver joined within the last 7 days (and has an explicit, valid created date)
  const isNewDriver = (driver: HqDriverSummary): boolean => {
    if (!driver.createdAt) return false;
    try {
      const createdTime = new Date(driver.createdAt).getTime();
      const diffMs = Date.now() - createdTime;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7;
    } catch {
      return false;
    }
  };

  // Helper to build vehicle subtext
  const getVehicleSubtext = (driver: HqDriverSummary): string => {
    const model = driver.vehicleModel && driver.vehicleModel !== '차량 미지정' ? driver.vehicleModel : '';
    const plate = driver.carNumber && driver.carNumber !== '차량 미등록'
      ? driver.carNumber
      : (driver.vehicleNo && driver.vehicleNo !== '미지정' ? driver.vehicleNo : '');

    if (model && plate) return `${model} · ${plate}`;
    if (model) return model;
    if (plate) return plate;
    return '차량 미지정';
  };

  // Filtered List (소속 기사 우선 노출)
  const filteredDrivers = useMemo(() => {
    const list = drivers.filter((driver) => {
      // Affiliation filter
      if (affiliationFilter !== 'all' && driver.affiliationType !== affiliationFilter) {
        return false;
      }

      // Residence filter
      if (residenceFilter !== 'all') {
        if (!driver.residence.includes(residenceFilter)) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all') {
        const opStatus = getDriverStatus(driver);
        if (statusFilter === 'available' && opStatus !== 'available') return false;
        if (statusFilter === 'driving' && opStatus !== 'driving') return false;
        if (statusFilter === 'off' && opStatus !== 'off') return false;
        // Backward-compat for legacy filters
        if (statusFilter === 'active' && !driver.isAvailable) return false;
        if (statusFilter === 'vacation' && driver.isAvailable) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          driver.name.toLowerCase().includes(q) ||
          driver.phone.toLowerCase().includes(q) ||
          driver.residence.toLowerCase().includes(q) ||
          driver.affiliationLabel.toLowerCase().includes(q) ||
          (driver.vehicleModel && driver.vehicleModel.toLowerCase().includes(q)) ||
          (driver.carNumber && driver.carNumber.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });

    // 소속(employed) 기사를 최상단에 먼저 노출, 동일 조건 시 이름 가나다순 정렬
    return list.slice().sort((a, b) => {
      if (a.affiliationType !== b.affiliationType) {
        return a.affiliationType === 'employed' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [drivers, affiliationFilter, residenceFilter, statusFilter, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / pageSize));
  const paginatedDrivers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDrivers.slice(start, start + pageSize);
  }, [filteredDrivers, currentPage, pageSize]);

  const handleRowClick = (driverId: string) => {
    haptics.lightTap();
    onSelectDriver(driverId);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Card Header: Icon + Title + Count */}
      <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* 기사관리 아이콘 & 마우스 호버 툴팁 */}
          <div className="relative group/drivers inline-flex items-center justify-center cursor-pointer shrink-0">
            {!driverIconError ? (
              <img
                src="/images/icons/drivers/icon_driver.png"
                alt="기사 관리"
                onError={() => setDriverIconError(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0 transition-transform duration-150 group-hover/drivers:scale-110"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#1E60F3] flex items-center justify-center shrink-0 transition-transform duration-150 group-hover/drivers:scale-110 shadow-2xs">
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            )}

            {/* Hover Tooltip: 최상단 내브바와 동일한 블랙 말풍선 규격 */}
            <div className="absolute top-full left-0 pt-2 hidden group-hover/drivers:flex flex-col items-start pointer-events-none z-50">
              <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 ml-3.5 shadow-xs" />
              <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                소속 및 프리랜서 기사님들의 프로필과 배차 자격을 관리해요
              </span>
            </div>
          </div>

          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            기사 관리
          </h2>
          <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full text-xs">
            {counts.total}명
          </span>
        </div>

        {/* Quick Add Driver Action */}
        <button
          type="button"
          onClick={onOpenAddDriver}
          className="px-3.5 py-1.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>기사 등록</span>
        </button>
      </div>

      {/* 1. Control & Filter Toolbar */}
      <div className="p-4 sm:px-6 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Affiliation & Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Affiliation Tabs */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setAffiliationFilter('all');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                affiliationFilter === 'all'
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs font-bold'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <span>전체 </span>
              <span className="font-bold">{counts.total}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setAffiliationFilter('employed');
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                affiliationFilter === 'employed'
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs font-bold'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <span>소속 </span>
              <span className="font-bold">{counts.employed}</span>
            </button>

            {counts.freelance > 0 && (
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setAffiliationFilter('freelance');
                  setCurrentPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  affiliationFilter === 'freelance'
                    ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs font-bold'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <span>프리랜서 </span>
                <span className="font-bold">{counts.freelance}</span>
              </button>
            )}
          </div>

          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="appearance-none bg-white border border-slate-200 rounded-xl px-3 py-1.5 pr-7 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#1E60F3] cursor-pointer shadow-2xs"
            >
              <option value="all">운행 상태 전체</option>
              <option value="available">운행 가능</option>
              <option value="driving">운행 중</option>
              <option value="off">휴무</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Residence Filter Dropdown */}
          <div className="relative flex items-center">
            <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              value={residenceFilter}
              onChange={(e) => {
                setResidenceFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="appearance-none bg-white border border-slate-200 rounded-xl pl-7 pr-7 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#1E60F3] cursor-pointer shadow-2xs"
            >
              <option value="all">거주 지역 전체</option>
              <option value="서울">서울 권역</option>
              <option value="경기">경기 권역</option>
              <option value="인천">인천 권역</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
          </div>
        </div>

        {/* Right: Search */}
        <div className="flex items-center gap-2.5">
          {/* Search Bar */}
          <div className="relative w-56 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="기사명, 차종, 연락처로 검색"
              className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E60F3] focus:bg-white transition-all shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* 3. Driver Table (Toss / Apple Style 5 Columns) */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-medium text-slate-400 select-none">
              <th className="py-3.5 px-5 font-medium">기사 정보</th>
              <th className="py-3.5 px-5 font-medium">운행 상태</th>
              <th className="py-3.5 px-5 font-medium">연락처</th>
              <th className="py-3.5 px-5 font-medium">지원 언어</th>
              <th className="py-3.5 px-5 font-medium text-right w-24">더보기</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 mx-auto text-[#1E60F3] animate-spin mb-3" />
                  <p className="font-bold text-slate-600">실시간 기사 데이터 동기화 중...</p>
                </td>
              </tr>
            ) : error ? (
              statusCode === 401 || statusCode === 403 ? (
                <tr>
                  <td colSpan={5} className="py-12 px-4 text-center">
                    <div className="max-w-md mx-auto p-6 bg-amber-50/80 border border-amber-200/90 rounded-3xl space-y-3 shadow-sm">
                      <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
                        <ShieldAlert className="w-6 h-6 text-amber-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 mb-1">
                          본사 관리자(HQ Admin) 인증이 필요합니다
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          기사 명단 및 차량 배정 정보는 본사 관리자 전용 데이터입니다.
                          <br />
                          로그인 세션이 만료되었거나 인증되지 않았습니다. (HTTP {statusCode || 401})
                        </p>
                      </div>
                      <div className="pt-2 flex items-center justify-center gap-2">
                        {onOpenLogin && (
                          <button
                            type="button"
                            onClick={onOpenLogin}
                            className="px-4 py-2 bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Key className="w-3.5 h-3.5" />
                            <span>관리자 로그인하기</span>
                          </button>
                        )}
                        {onRetry && (
                          <button
                            type="button"
                            onClick={onRetry}
                            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            다시 시도
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 px-4 text-center">
                    <div className="max-w-md mx-auto p-6 bg-rose-50/80 border border-rose-200/90 rounded-3xl space-y-3 shadow-sm">
                      <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto shadow-xs">
                        <AlertTriangle className="w-6 h-6 text-rose-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 mb-1">
                          기사 목록을 불러오지 못했습니다
                        </h4>
                        <p className="text-xs text-rose-700 font-mono mb-1">{error}</p>
                        <p className="text-[11px] text-slate-500">
                          데이터베이스 연결 또는 서버 통신 상태를 확인해주세요. (HTTP {statusCode || 500})
                        </p>
                      </div>
                      <div className="pt-2 flex items-center justify-center gap-2">
                        {onRetry && (
                          <button
                            type="button"
                            onClick={onRetry}
                            className="px-4 py-2 bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>다시 시도</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )
            ) : paginatedDrivers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-slate-600">
                    {drivers.length === 0
                      ? '등록된 기사가 없습니다.'
                      : '검색 조건에 일치하는 기사가 없습니다.'}
                  </p>
                </td>
              </tr>
            ) : (
              paginatedDrivers.map((driver) => {
                const opStatus = getDriverStatus(driver);
                const vehicleSubtext = getVehicleSubtext(driver);
                const isNew = isNewDriver(driver);

                // Multi-language support check: only non-Korean languages shown as mini badge
                const foreignLanguages = (driver.languageLabels || [])
                  .filter((l) => l !== '한국어')
                  .concat(
                    driver.englishAvailable && !(driver.languageLabels || []).includes('영어') ? ['영어'] : []
                  );
                const hasForeignLanguage = foreignLanguages.length > 0;

                return (
                  <tr
                    key={driver.id}
                    onClick={() => handleRowClick(driver.id)}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  >
                    {/* 1열: 기사 정보 (Avatar + Name + Vehicle subtext) */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3.5">
                        {driver.avatarUrl ? (
                          <img
                            src={driver.avatarUrl}
                            alt={driver.name}
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200/80 shrink-0 shadow-2xs"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 border border-slate-200/80 font-bold text-xs flex items-center justify-center shrink-0">
                            {driver.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 group-hover:text-[#1E60F3] transition-colors">
                              {driver.name}
                            </span>
                            {/* 소속 기사만 '소속' 뱃지 표시 (프리랜서는 다수이므로 미표시하여 시각적 소음 제거) */}
                            {driver.affiliationType === 'employed' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200/80">
                                소속
                              </span>
                            )}
                            {isNew && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                신규
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                            {vehicleSubtext}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2열: 운행 상태 (운행 가능 / 운행 중 / 휴무) */}
                    <td className="py-4 px-5 whitespace-nowrap">
                      {opStatus === 'driving' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#1E60F3] border border-blue-200/60 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3] animate-pulse" />
                          운행 중
                        </span>
                      ) : opStatus === 'off' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          휴무
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/80">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          운행 가능
                        </span>
                      )}
                    </td>

                    {/* 3열: 연락처 (전화 걸기 연동) */}
                    <td className="py-4 px-5 whitespace-nowrap">
                      {driver.phone ? (
                        <a
                          href={`tel:${driver.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-xs font-semibold text-slate-700 hover:text-[#1E60F3] hover:underline transition-colors inline-flex items-center gap-1.5 group/phone"
                          title="전화 걸기"
                        >
                          <Phone className="w-3.5 h-3.5 text-slate-400 group-hover/phone:text-[#1E60F3] transition-colors" />
                          <span>{formatPhoneNumber(driver.phone)}</span>
                        </a>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">-</span>
                      )}
                    </td>

                    {/* 4열: 지원 언어 (미국 국기 🇺🇸 표기, 비어있으면 하이픈 없이 빈 공간) */}
                    <td className="py-4 px-5 whitespace-nowrap">
                      {hasForeignLanguage ? (
                        <div className="flex items-center gap-1.5">
                          {foreignLanguages.map((lang) => {
                            const isEng = lang === '영어' || lang.toLowerCase() === 'english' || lang === 'en';
                            return (
                              <span
                                key={lang}
                                className={isEng ? 'text-sm select-none' : 'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/80'}
                                title={isEng ? '영어 소통 가능' : lang}
                              >
                                {isEng ? '🇺🇸' : lang}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </td>

                    {/* 5열: 더보기 (··· 아이콘 클릭 시 소속 전환 및 정보 수정 팝오버) */}
                    <td className="py-4 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end relative">
                        <button
                          type="button"
                          onClick={() => {
                            haptics.lightTap();
                            setMenuOpenDriverId((prev) => (prev === driver.id ? null : driver.id));
                          }}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                            menuOpenDriverId === driver.id
                              ? 'bg-blue-50 text-[#1E60F3]'
                              : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
                          }`}
                          title="기사 관리 메뉴"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {menuOpenDriverId === driver.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setMenuOpenDriverId(null)}
                            />
                            <div className="absolute right-0 top-9 z-50 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-xs text-left animate-in fade-in zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenDriverId(null);
                                  handleRowClick(driver.id);
                                }}
                                className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-bold cursor-pointer transition-colors"
                              >
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                <span>상세 프로필</span>
                              </button>

                              <button
                                type="button"
                                onClick={async () => {
                                  haptics.selection();
                                  setMenuOpenDriverId(null);
                                  const targetAffiliation = driver.affiliationType === 'employed' ? 'freelance' : 'employed';
                                  await updateDriver(driver.id, { affiliationType: targetAffiliation });
                                }}
                                className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-bold cursor-pointer transition-colors"
                              >
                                {driver.affiliationType === 'employed' ? (
                                  <>
                                    <UserMinus className="w-3.5 h-3.5 text-slate-500" />
                                    <span>프리랜서로 전환</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5 text-[#1E60F3]" />
                                    <span className="text-[#1E60F3]">소속 기사로 전환</span>
                                  </>
                                )}
                              </button>

                              <div className="my-1 border-t border-slate-100" />

                              <button
                                type="button"
                                onClick={() => {
                                  haptics.lightTap();
                                  setMenuOpenDriverId(null);
                                  setEditingDriver(driver);
                                }}
                                className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-bold cursor-pointer transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                                <span>기사 정보 수정</span>
                              </button>

                              <div className="my-1 border-t border-slate-100" />

                              <button
                                type="button"
                                onClick={async () => {
                                  haptics.warningPulse();
                                  setMenuOpenDriverId(null);
                                  const confirmed = window.confirm(
                                    `'${driver.name}' 기사님을 목록에서 삭제하시겠습니까?\n배정된 운행 기록이 있는 경우 기사 배정만 해제됩니다.`
                                  );
                                  if (confirmed) {
                                    const ok = await deleteDriver(driver.id);
                                    if (ok) {
                                      haptics.success();
                                    } else {
                                      alert('기사 삭제에 실패했습니다.');
                                    }
                                  }
                                }}
                                className="w-full px-3 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-bold cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                <span>기사 삭제</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Table Footer (Pagination & Count) */}
      <div className="p-4 sm:px-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs bg-white">
        <div className="flex items-center gap-2 text-slate-500 font-medium">
          <span>
            총 <strong className="font-bold text-slate-900">{filteredDrivers.length}명</strong>의 기사님이 등록되어 있어요
          </span>
          {error && (
            <span className="text-[11px] text-rose-600 font-semibold flex items-center gap-1.5 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span>동기화 확인 필요</span>
            </span>
          )}
        </div>

        {/* Pagination rounded buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setCurrentPage((p) => Math.max(1, p - 1));
            }}
            disabled={currentPage === 1}
            className="w-8 h-8 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: totalPages }).map((_, idx) => {
            const pageNum = idx + 1;
            const isActive = pageNum === currentPage;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setCurrentPage(pageNum);
                }}
                className={`min-w-8 h-8 px-2 rounded-full text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1E60F3] text-white font-bold shadow-2xs'
                    : 'border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setCurrentPage((p) => Math.min(totalPages, p + 1));
            }}
            disabled={currentPage === totalPages}
            className="w-8 h-8 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            aria-label="다음 페이지"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Driver Edit Modal */}
      {editingDriver && (
        <HqDriverEditModal
          isOpen={Boolean(editingDriver)}
          onClose={() => setEditingDriver(null)}
          driver={editingDriver}
          onSave={async (id, updates) => {
            const ok = await updateDriver(id, updates);
            if (ok) {
              setEditingDriver(null);
            }
            return ok;
          }}
        />
      )}
    </div>
  );
};
