'use client';

import React from 'react';
import { Info, ChevronRight } from 'lucide-react';
import { HqUnconfirmedDispatchItem } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqUnconfirmedDispatchesCardProps {
  items: HqUnconfirmedDispatchItem[];
  onViewAll?: () => void;
  onSelectItem?: (item: HqUnconfirmedDispatchItem) => void;
}

export const HqUnconfirmedDispatchesCard: React.FC<HqUnconfirmedDispatchesCardProps> = ({
  items,
  onViewAll,
  onSelectItem,
}) => {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
            <Info className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            미확인 배차
          </h3>
          <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-black flex items-center justify-center">
            {items.length}
          </span>
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

      {/* Mini Table */}
      <div className="overflow-x-auto pt-2">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="text-[10px] font-bold text-slate-400 border-b border-slate-100/70">
              <th className="py-2 px-2">픽업 시간</th>
              <th className="py-2 px-2">고객명</th>
              <th className="py-2 px-2">기사명</th>
              <th className="py-2 px-2">차량</th>
              <th className="py-2 px-2">목적지</th>
              <th className="py-2 px-2 text-right">대기 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80">
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => {
                  haptics.lightTap();
                  onSelectItem?.(item);
                }}
                className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
              >
                <td className="py-2.5 px-2 font-semibold text-slate-700 whitespace-nowrap">
                  {item.pickupTime}
                </td>
                <td className="py-2.5 px-2 font-bold text-slate-900 group-hover:text-[#1E60F3] whitespace-nowrap">
                  {item.customerName}
                </td>
                <td className="py-2.5 px-2 text-slate-700 font-medium whitespace-nowrap">
                  {item.driverName}
                </td>
                <td className="py-2.5 px-2 text-slate-500 font-medium whitespace-nowrap">
                  {item.vehicleModel}
                </td>
                <td className="py-2.5 px-2 text-slate-600 font-medium whitespace-nowrap">
                  {item.destination}
                </td>
                <td className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${
                  item.isUrgent ? 'text-rose-600' : 'text-slate-500'
                }`}>
                  {item.waitingTime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
