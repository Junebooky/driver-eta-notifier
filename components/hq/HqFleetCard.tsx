'use client';

import React from 'react';
import { Car, ChevronRight } from 'lucide-react';
import { HqVehicleClassStatus } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqFleetCardProps {
  vehicleClasses: HqVehicleClassStatus[];
  onViewAll?: () => void;
  onSelectClass?: (item: HqVehicleClassStatus) => void;
}

export const HqFleetCard: React.FC<HqFleetCardProps> = ({
  vehicleClasses,
  onViewAll,
  onSelectClass,
}) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
              <Car className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              차량 운영 현황
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

        {/* Vehicle Classes Grid (3 top, 3 middle, 1 bottom / responsive flex-wrap) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3">
          {vehicleClasses.map((v) => (
            <div
              key={v.id}
              onClick={() => {
                haptics.lightTap();
                onSelectClass?.(v);
              }}
              className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-blue-50/40 hover:border-blue-200 transition-all cursor-pointer group text-left"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold text-slate-800 truncate group-hover:text-[#1E60F3] transition-colors">
                  {v.className}
                </span>
                <span className="text-xs font-black text-slate-900 shrink-0">
                  <span className="text-[#1E60F3]">{v.activeCount}</span> / {v.totalCount}대
                </span>
              </div>
              {v.availableCount > 0 ? (
                <div className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                  예약 가능 <strong className="text-emerald-600 font-bold">{v.availableCount}대</strong>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                  전량 운행 중
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status Summary Footer */}
      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[11px] text-slate-600">운행 중 15대</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-[11px] text-slate-600">대기 중 4대</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span className="text-[11px] text-slate-600">정비 중 1대</span>
          </div>
        </div>

        <span className="text-[11px] font-bold text-slate-400">
          총 20대 등록
        </span>
      </div>
    </div>
  );
};
