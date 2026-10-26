'use client';

import React from 'react';
import {
  Calendar,
  ChevronDown,
  Search,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { HqDrivingLogStatus } from '@/types/drivingLogHq';
import { haptics } from '@/utils/haptics';

export interface HqDrivingLogsFilterBarProps {
  dateRange: string;
  onSelectDateRange?: () => void;
  driverOptions: string[];
  selectedDriver: string;
  onSelectDriver: (driver: string) => void;
  vehicleOptions: string[];
  selectedVehicle: string;
  onSelectVehicle: (vehicle: string) => void;
  customerOptions: string[];
  selectedCustomer: string;
  onSelectCustomer: (customer: string) => void;
  selectedStatus: HqDrivingLogStatus | '전체';
  onSelectStatus: (status: HqDrivingLogStatus | '전체') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onExportExcel: () => void;
}

export const HqDrivingLogsFilterBar: React.FC<HqDrivingLogsFilterBarProps> = ({
  dateRange,
  onSelectDateRange,
  driverOptions,
  selectedDriver,
  onSelectDriver,
  vehicleOptions,
  selectedVehicle,
  onSelectVehicle,
  customerOptions,
  selectedCustomer,
  onSelectCustomer,
  selectedStatus,
  onSelectStatus,
  searchQuery,
  onSearchChange,
  onExportExcel,
}) => {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Side: Filter Selectors */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Date Range Picker Button */}
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onSelectDateRange?.();
            }}
            className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
            title="날짜 범위 선택"
          >
            <Calendar className="w-3.5 h-3.5 text-[#1E60F3]" />
            <span>{dateRange}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
          </button>

          {/* 2. 기사명 Select */}
          <div className="relative">
            <select
              value={selectedDriver}
              onChange={(e) => {
                haptics.selection();
                onSelectDriver(e.target.value);
              }}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#1E60F3] cursor-pointer transition-all shadow-2xs"
            >
              <option value="전체">기사명 전체</option>
              {driverOptions.map((driver) => (
                <option key={driver} value={driver}>
                  {driver}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* 3. 차량 Select */}
          <div className="relative">
            <select
              value={selectedVehicle}
              onChange={(e) => {
                haptics.selection();
                onSelectVehicle(e.target.value);
              }}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#1E60F3] cursor-pointer transition-all shadow-2xs"
            >
              <option value="전체">차량 전체</option>
              {vehicleOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* 4. 고객사 Select */}
          <div className="relative">
            <select
              value={selectedCustomer}
              onChange={(e) => {
                haptics.selection();
                onSelectCustomer(e.target.value);
              }}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#1E60F3] cursor-pointer transition-all shadow-2xs"
            >
              <option value="전체">고객사 전체</option>
              {customerOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* 5. 상태 Select */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => {
                haptics.selection();
                onSelectStatus(e.target.value as HqDrivingLogStatus | '전체');
              }}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#1E60F3] cursor-pointer transition-all shadow-2xs"
            >
              <option value="전체">상태 전체</option>
              <option value="검토 대기">검토 대기</option>
              <option value="검토 중">검토 중</option>
              <option value="승인 완료">승인 완료</option>
              <option value="보완 필요">보완 필요</option>
              <option value="반려">반려</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Right Side: Search Input & Excel Export */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="고객명, 기사명, 차량번호로 검색..."
              className="w-full pl-8 pr-7 py-2 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200/90 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* 엑셀 내보내기 Button */}
          <button
            type="button"
            onClick={() => {
              haptics.success();
              onExportExcel();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1E60F3] hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer active:scale-98"
            title="현재 목록 엑셀(CSV) 다운로드"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>엑셀 내보내기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
