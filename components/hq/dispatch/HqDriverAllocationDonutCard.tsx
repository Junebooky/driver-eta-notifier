'use client';

import React from 'react';
import { Users, ChevronRight } from 'lucide-react';
import { HqDriverAllocationStats } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqDriverAllocationDonutCardProps {
  stats: HqDriverAllocationStats;
  onViewAll?: () => void;
}

export const HqDriverAllocationDonutCard: React.FC<HqDriverAllocationDonutCardProps> = ({
  stats,
  onViewAll,
}) => {
  // SVG Donut geometry
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76

  // Cumulative stroke offsets
  const activeLen = (stats.active.percentage / 100) * circumference;
  const standbyLen = (stats.standby.percentage / 100) * circumference;
  const offDutyLen = (stats.offDuty.percentage / 100) * circumference;
  const unassignedLen = circumference - (activeLen + standbyLen + offDutyLen);

  const activeOffset = 0;
  const standbyOffset = -activeLen;
  const offDutyOffset = -(activeLen + standbyLen);
  const unassignedOffset = -(activeLen + standbyLen + offDutyLen);

  const legendItems = [
    stats.active,
    stats.standby,
    stats.offDuty,
    stats.unassigned,
  ];

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            오늘 기사 배정 현황
          </h3>
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onViewAll?.();
          }}
          className="text-[11px] font-bold text-[#1E60F3] hover:underline flex items-center gap-0.5 cursor-pointer"
        >
          <span>전체보기</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Donut Chart & Legend */}
      <div className="flex items-center justify-between gap-4 pt-3 pb-1">
        {/* SVG Donut */}
        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke="#F1F5F9"
              strokeWidth="12"
            />
            {/* Slice 1: 운행 중 (#1E60F3) */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke={stats.active.color}
              strokeWidth="12"
              strokeDasharray={`${activeLen} ${circumference}`}
              strokeDashoffset={activeOffset}
              className="transition-all duration-500"
            />
            {/* Slice 2: 대기 중 (#60A5FA) */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke={stats.standby.color}
              strokeWidth="12"
              strokeDasharray={`${standbyLen} ${circumference}`}
              strokeDashoffset={standbyOffset}
              className="transition-all duration-500"
            />
            {/* Slice 3: 휴무 (#94A3B8) */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke={stats.offDuty.color}
              strokeWidth="12"
              strokeDasharray={`${offDutyLen} ${circumference}`}
              strokeDashoffset={offDutyOffset}
              className="transition-all duration-500"
            />
            {/* Slice 4: 미배정 (#E2E8F0) */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="transparent"
              stroke={stats.unassigned.color}
              strokeWidth="12"
              strokeDasharray={`${unassignedLen} ${circumference}`}
              strokeDashoffset={unassignedOffset}
              className="transition-all duration-500"
            />
          </svg>

          {/* Donut Center Count */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-xl font-black text-slate-900 leading-none">
              {stats.totalDrivers}
            </span>
            <span className="text-[10px] font-bold text-slate-400 mt-0.5">
              총 기사
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2 text-xs">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-600 font-medium text-[11px]">
                  {item.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-[11px]">
                  {item.count}명
                </span>
                <span className="text-slate-400 font-semibold text-[10px] w-7 text-right">
                  {item.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
