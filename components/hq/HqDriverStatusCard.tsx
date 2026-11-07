'use client';

import React from 'react';
import { Users, ChevronRight, UserCheck } from 'lucide-react';
import { haptics } from '@/utils/haptics';

export interface HqDriverStatusCardProps {
  drivingCount?: number;
  standbyCount?: number;
  offDutyCount?: number;
  delayedCount?: number;
  onViewAll?: () => void;
}

export const HqDriverStatusCard: React.FC<HqDriverStatusCardProps> = ({
  drivingCount = 9,
  standbyCount = 6,
  offDutyCount = 2,
  delayedCount = 1,
  onViewAll,
}) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            기사 현황
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

      {/* 4 Status Blocks */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
        {/* 전체 기사: 운행 중 */}
        <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1E60F3] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 font-bold">운행 중</div>
            <div className="text-sm font-black text-slate-900">
              {drivingCount}명
            </div>
          </div>
        </div>

        {/* 대기 중 */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-[#1E60F3] shrink-0 ml-1" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 font-bold">대기 중</div>
            <div className="text-sm font-black text-slate-900">
              {standbyCount}명
            </div>
          </div>
        </div>

        {/* 휴무 */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0 ml-1" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 font-bold">휴무</div>
            <div className="text-sm font-black text-slate-900">
              {offDutyCount}명
            </div>
          </div>
        </div>

        {/* 지연 */}
        <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-100 flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0 ml-1" />
          <div className="min-w-0">
            <div className="text-[10px] text-rose-600 font-bold">지연</div>
            <div className="text-sm font-black text-rose-600">
              {delayedCount}명
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
