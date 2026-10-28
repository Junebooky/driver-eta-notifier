'use client';

import React from 'react';
import { Info, ChevronRight, BellRing, Send } from 'lucide-react';
import { HqUnconfirmedDispatchItem } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqUnconfirmedDispatchesCardProps {
  items: HqUnconfirmedDispatchItem[];
  onViewAll?: () => void;
  onSelectItem?: (item: HqUnconfirmedDispatchItem) => void;
  onRemindItem?: (item: HqUnconfirmedDispatchItem) => void;
}

export const HqUnconfirmedDispatchesCard: React.FC<HqUnconfirmedDispatchesCardProps> = ({
  items,
  onViewAll,
  onSelectItem,
  onRemindItem,
}) => {
  const criticalCount = items.filter((i) => i.severity === 'critical').length;

  return (
    <div
      className={`bg-white border rounded-2xl p-4 shadow-xs flex flex-col justify-between ${
        criticalCount > 0 ? 'border-rose-300 ring-1 ring-rose-200/70' : 'border-slate-200/80'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
              criticalCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-blue-50 text-[#1E60F3]'
            }`}
          >
            {criticalCount > 0 ? <BellRing className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
          </div>
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            미확인 배차 자동 추적
          </h3>
          <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-black flex items-center justify-center">
            {items.length}
          </span>
          {criticalCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold animate-pulse">
              픽업임박 {criticalCount}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onViewAll?.();
          }}
          className="text-[11px] font-bold text-[#1E60F3] hover:underline flex items-center gap-0.5 cursor-pointer"
        >
          <span>경보 센터</span>
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
              <th className="py-2 px-2">대기·임박도</th>
              <th className="py-2 px-2 text-right">재알림</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400 text-xs font-medium">
                  현재 미확인 배차가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    haptics.lightTap();
                    onSelectItem?.(item);
                  }}
                  className={`transition-colors cursor-pointer group ${
                    item.severity === 'critical'
                      ? 'bg-rose-50/50 hover:bg-rose-50'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className="py-2.5 px-2 font-semibold text-slate-700 whitespace-nowrap">
                    <div>{item.pickupTime}</div>
                    {item.pickupCountdownLabel && (
                      <div
                        className={`text-[10px] font-extrabold ${
                          item.severity === 'critical' ? 'text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        {item.pickupCountdownLabel}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-2 font-bold text-slate-900 group-hover:text-[#1E60F3] whitespace-nowrap">
                    {item.customerName}
                  </td>
                  <td className="py-2.5 px-2 text-slate-700 font-medium whitespace-nowrap">
                    <div>{item.driverName}</div>
                    {(item.reminderCount || 0) > 0 && (
                      <div className="text-[10px] font-bold text-violet-700">
                        재알림 {item.reminderCount}회
                      </div>
                    )}
                  </td>
                  <td
                    className={`py-2.5 px-2 font-bold whitespace-nowrap ${
                      item.severity === 'critical'
                        ? 'text-rose-600'
                        : item.isUrgent
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.waitingTime}
                  </td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                    {onRemindItem && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          haptics.mediumTap();
                          onRemindItem(item);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 px-2 py-1 text-[10px] font-extrabold text-white cursor-pointer"
                      >
                        <Send className="w-2.5 h-2.5" />
                        <span>재알림</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
