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
} from 'lucide-react';
import { HqDriverSummary } from '@/types/driverHq';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { haptics } from '@/utils/haptics';
import { formatPhoneNumber } from '@/utils/formatters';
import { getKstTodayDateStr } from '@/utils/dispatchConflictDetector';

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
}) => {
  // If not passed from parent, use the custom hook
  const hookState = useHqDrivers();
  const drivers = propDrivers ?? hookState.drivers;
  const counts = propCounts ?? hookState.counts;
  const isLoading = propIsLoading ?? hookState.isLoading;
  const error = propError ?? hookState.error;
  const statusCode = propStatusCode ?? hookState.statusCode;
  const onRetry = propOnRetry ?? hookState.refetch;

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [affiliationFilter, setAffiliationFilter] = useState<'all' | 'employed' | 'freelance'>('all');
  const [residenceFilter, setResidenceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'driving' | 'off' | 'active' | 'vacation'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
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

  // Helper to check if a driver joined within the last 14 days
  const isNewDriver = (driver: HqDriverSummary): boolean => {
    if (!driver.createdAt) return false;
    try {
      const createdTime = new Date(driver.createdAt).getTime();
      const diffDays = (Date.now() - createdTime) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 14;
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

  // Filtered List
  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
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
      {/* 1. Header Bar */}
      <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-white">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100/80 text-[#1E60F3] flex items-center justify-center shadow-xs">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">기사 관리</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              실제 등록된 기사 정보를 조회하고, 상세 프로필과 운행 일정을 관리할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="기사명, 연락처, 차종, 거주지..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E60F3] focus:bg-white transition-all shadow-2xs"
            />
          </div>

          {/* Add Driver Button */}
          <button
            type="button"
            onClick={onOpenAddDriver}
            className="px-4 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-extrabold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>기사 추가</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="px-6 py-3.5 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
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
        </div>

        {/* Dropdowns */}
        <div className="flex items-center gap-2">
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
                            {/* Special Status Badges Only (Freelance / New) */}
                            {driver.affiliationType === 'freelance' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                                프리랜서
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
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
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

                    {/* 4열: 지원 언어 (다국어 지원 기사만 미니 뱃지) */}
                    <td className="py-4 px-5 whitespace-nowrap">
                      {hasForeignLanguage ? (
                        <div className="flex items-center gap-1">
                          {foreignLanguages.map((lang) => (
                            <span
                              key={lang}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/80"
                            >
                              {lang}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs font-medium">-</span>
                      )}
                    </td>

                    {/* 5열: 더보기 (호버 인터랙션) */}
                    <td className="py-4 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRowClick(driver.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-[#1E60F3] hover:bg-blue-50/80 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1 cursor-pointer"
                        >
                          <span>상세</span>
                          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRowClick(driver.id)}
                          className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer group-hover:hidden"
                          title="기사 상세 보기"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
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
    </div>
  );
};
