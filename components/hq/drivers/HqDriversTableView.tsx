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
  Filter,
} from 'lucide-react';
import { DriverItem, SAMPLE_DRIVERS } from './driverData';
import { haptics } from '@/utils/haptics';

interface HqDriversTableViewProps {
  onSelectDriver: (driverId: string) => void;
  initialSearchQuery?: string;
  onOpenAddDriver?: () => void;
}

export const HqDriversTableView: React.FC<HqDriversTableViewProps> = ({
  onSelectDriver,
  initialSearchQuery = '',
  onOpenAddDriver,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [affiliationFilter, setAffiliationFilter] = useState<'all' | 'employed' | 'freelance'>('all');
  const [residenceFilter, setResidenceFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pageSize = 10;

  // KPI Counts
  const counts = useMemo(() => {
    const total = SAMPLE_DRIVERS.length;
    const employed = SAMPLE_DRIVERS.filter((d) => d.affiliationType === 'employed').length;
    const freelance = SAMPLE_DRIVERS.filter((d) => d.affiliationType === 'freelance').length;
    return { total, employed, freelance };
  }, []);

  // Filtered List
  const filteredDrivers = useMemo(() => {
    return SAMPLE_DRIVERS.filter((driver) => {
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

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          driver.name.toLowerCase().includes(q) ||
          driver.phone.toLowerCase().includes(q) ||
          driver.residence.toLowerCase().includes(q) ||
          driver.affiliationLabel.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [affiliationFilter, residenceFilter, searchQuery]);

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
              기사 정보를 관리하고, 프로필과 운행 일정을 확인할 수 있습니다.
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
              placeholder="기사명, 연락처, 거주지 검색..."
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
              className="appearance-none bg-white border border-slate-200 rounded-xl px-3.5 py-1.5 pr-8 text-xs font-bold text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#1E60F3] cursor-pointer shadow-2xs"
            >
              <option value="all">전체</option>
              <option value="active">운행 가능</option>
              <option value="vacation">휴무</option>
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
            {paginatedDrivers.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-slate-600">검색 조건에 일치하는 기사가 없습니다.</p>
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

                    {/* Driver Name with Avatar */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={driver.avatarUrl}
                          alt={driver.name}
                          onError={(e) => {
                            // Fallback if image not found
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                        <span className="font-extrabold text-slate-900 group-hover:text-[#1E60F3] transition-colors">
                          {driver.name}
                        </span>
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
                      {driver.phone}
                    </td>

                    {/* Residence */}
                    <td className="py-3 px-4 text-slate-600 font-semibold">
                      {driver.residence}
                    </td>

                    {/* Language Flags */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        {driver.flags.map((flag, idx) => (
                          <span key={idx}>{flag}</span>
                        ))}
                      </div>
                    </td>

                    {/* Rating */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-amber-500 font-extrabold text-xs">
                        <Star className="w-3.5 h-3.5 fill-amber-400 shrink-0" />
                        <span>{driver.rating.toFixed(1)}</span>
                      </div>
                    </td>

                    {/* Recent Trip Date */}
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {driver.recentTripDate}
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
        <span className="font-bold text-slate-500">
          총 <span className="font-extrabold text-slate-900">{filteredDrivers.length}명</span>
        </span>

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
          <select className="bg-transparent border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 cursor-pointer">
            <option>10개씩 보기</option>
          </select>
        </div>
      </div>
    </div>
  );
};

