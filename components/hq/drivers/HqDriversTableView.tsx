'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  MapPin,
  ChevronDown,
  Star,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldAlert,
  AlertTriangle,
  Key,
  RefreshCw,
} from 'lucide-react';
import { HqDriverSummary } from '@/types/driverHq';
import { useHqDrivers } from '@/utils/useHqDrivers';
import { haptics } from '@/utils/haptics';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'vacation'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pageSize = 10;

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
      if (statusFilter === 'active' && !driver.isAvailable) return false;
      if (statusFilter === 'vacation' && driver.isAvailable) return false;

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

  // Select all on current page
  const allCurrentSelected =
    paginatedDrivers.length > 0 &&
    paginatedDrivers.every((d) => selectedIds.has(d.id));

  const handleToggleAllCurrent = () => {
    haptics.selection();
    const next = new Set(selectedIds);
    if (allCurrentSelected) {
      paginatedDrivers.forEach((d) => next.delete(d.id));
    } else {
      paginatedDrivers.forEach((d) => next.add(d.id));
    }
    setSelectedIds(next);
  };

  const handleToggleRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.selection();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

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
      <div className="px-6 py-3.5 bg-slate-50/60 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Affiliation Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAffiliationFilter('all');
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              affiliationFilter === 'all'
                ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <span>전체 </span>
            <span className="font-extrabold">{counts.total}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAffiliationFilter('employed');
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              affiliationFilter === 'employed'
                ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <span>소속 </span>
            <span className="font-extrabold">{counts.employed}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAffiliationFilter('freelance');
              setCurrentPage(1);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              affiliationFilter === 'freelance'
                ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <span>프리랜서 </span>
            <span className="font-extrabold">{counts.freelance}</span>
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
              className="appearance-none bg-white border border-slate-200 rounded-xl px-3.5 py-1.5 pr-8 text-xs font-bold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#1E60F3] cursor-pointer shadow-2xs"
            >
              <option value="all">운행 상태 전체</option>
              <option value="active">운행 가능</option>
              <option value="vacation">휴무/점검</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Residence Filter Dropdown */}
          <div className="relative flex items-center">
            <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <select
              value={residenceFilter}
              onChange={(e) => {
                setResidenceFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="appearance-none bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#1E60F3] cursor-pointer shadow-2xs"
            >
              <option value="all">거주 지역 전체</option>
              <option value="서울">서울 권역</option>
              <option value="경기">경기 권역</option>
              <option value="인천">인천 권역</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 3. Driver Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-black text-slate-400 uppercase tracking-wider select-none">
              <th className="py-3 px-4 w-12 text-center">
                <input
                  type="checkbox"
                  checked={allCurrentSelected}
                  onChange={handleToggleAllCurrent}
                  className="w-4 h-4 rounded border-slate-300 text-[#1E60F3] focus:ring-[#1E60F3] cursor-pointer"
                />
              </th>
              <th className="py-3 px-4">기사명</th>
              <th className="py-3 px-4">소속</th>
              <th className="py-3 px-4">연락처</th>
              <th className="py-3 px-4">거주 지역</th>
              <th className="py-3 px-4">언어</th>
              <th className="py-3 px-4">평점</th>
              <th className="py-3 px-4">최근 운행일</th>
              <th className="py-3 px-4 text-center w-16">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 mx-auto text-[#1E60F3] animate-spin mb-3" />
                  <p className="font-bold text-slate-600">실시간 기사 데이터 동기화 중...</p>
                </td>
              </tr>
            ) : error ? (
              statusCode === 401 || statusCode === 403 ? (
                <tr>
                  <td colSpan={9} className="py-12 px-4 text-center">
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
                  <td colSpan={9} className="py-12 px-4 text-center">
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
                <td colSpan={9} className="py-12 text-center text-slate-400">
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
                const isChecked = selectedIds.has(driver.id);

                return (
                  <tr
                    key={driver.id}
                    onClick={() => handleRowClick(driver.id)}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-4 text-center" onClick={(e) => handleToggleRow(driver.id, e)}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-slate-300 text-[#1E60F3] focus:ring-[#1E60F3] cursor-pointer"
                      />
                    </td>

                    {/* Driver Name with Avatar or Fallback Circle */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {driver.avatarUrl ? (
                          <img
                            src={driver.avatarUrl}
                            alt={driver.name}
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#1E60F3] border border-blue-100 font-black text-xs flex items-center justify-center shrink-0">
                            {driver.name.slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <div className="font-extrabold text-slate-900 group-hover:text-[#1E60F3] transition-colors">
                            {driver.name}
                          </div>
                          {driver.vehicleModel && driver.vehicleModel !== '차량 미지정' && (
                            <div className="text-[10.5px] text-slate-400 font-semibold truncate max-w-[140px]">
                              {driver.vehicleModel}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Affiliation Badge */}
                    <td className="py-3 px-4">
                      {driver.affiliationType === 'employed' ? (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1E60F3] border border-blue-200/80 font-black text-[11px] inline-block">
                          소속
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/80 font-black text-[11px] inline-block">
                          프리랜서
                        </span>
                      )}
                    </td>

                    {/* Contact Phone */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {driver.phone || '-'}
                    </td>

                    {/* Residence */}
                    <td className="py-3 px-4 text-slate-600 font-semibold">
                      {driver.residence}
                    </td>

                    {/* Language Flags */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        {driver.flags.map((flag, idx) => (
                          <span key={idx} title={flag === '🇺🇸' ? '영어 가능' : '한국어'}>
                            {flag}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Rating (Real only; no fabricated ratings) */}
                    <td className="py-3 px-4">
                      {driver.rating !== undefined && driver.rating !== null ? (
                        <div className="flex items-center gap-1 text-amber-500 font-extrabold text-xs">
                          <Star className="w-3.5 h-3.5 fill-amber-400 shrink-0" />
                          <span>{driver.rating.toFixed(1)}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-bold text-xs">-</span>
                      )}
                    </td>

                    {/* Recent Trip Date */}
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {driver.recentTripDate || (
                        <span className="text-slate-400 font-normal text-[11px]">이력 없음</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleRowClick(driver.id)}
                        className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer mx-auto"
                        title="기사 상세 보기"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Table Footer (Pagination & Count) */}
      <div className="p-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs bg-white">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-500">
            총 <span className="font-extrabold text-slate-900">{filteredDrivers.length}명</span>
          </span>
          {error ? (
            <span className="text-[11px] text-rose-600 font-bold flex items-center gap-1.5 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
              <span>동기화 실패 (HTTP {statusCode || 500})</span>
            </span>
          ) : (
            <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span>실시간 DB 동기화 완료 ({drivers.length}명)</span>
            </span>
          )}
        </div>

        {/* Pagination buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {Array.from({ length: totalPages }).map((_, idx) => {
            const pageNum = idx + 1;
            const isActive = pageNum === currentPage;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1E60F3] text-white shadow-2xs font-extrabold'
                    : 'border border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Page size indicator */}
        <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
          <span className="text-slate-600 font-bold">10개씩 보기</span>
        </div>
      </div>
    </div>
  );
};
