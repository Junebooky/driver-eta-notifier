'use client';

import React from 'react';
import { FileText, ChevronRight } from 'lucide-react';
import { HqUnsentDraftItem } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqUnsentDraftsCardProps {
  items: HqUnsentDraftItem[];
  onViewAll?: () => void;
  onSelectItem?: (item: HqUnsentDraftItem) => void;
}

export const HqUnsentDraftsCard: React.FC<HqUnsentDraftsCardProps> = ({
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
            <FileText className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            미발송 초안
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
              <th className="py-2 px-2">생성 시간</th>
              <th className="py-2 px-2">고객명</th>
              <th className="py-2 px-2">픽업 시간</th>
              <th className="py-2 px-2">목적지</th>
              <th className="py-2 px-2 text-right">상태</th>
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
                <td className="py-2.5 px-2 text-slate-500 font-medium whitespace-nowrap">
                  {item.createdAt}
                </td>
                <td className="py-2.5 px-2 font-bold text-slate-900 group-hover:text-[#1E60F3] whitespace-nowrap">
                  {item.customerName}
                </td>
                <td className="py-2.5 px-2 font-semibold text-slate-700 whitespace-nowrap">
                  {item.pickupTime}
                </td>
                <td className="py-2.5 px-2 text-slate-600 font-medium whitespace-nowrap">
                  {item.destination}
                </td>
                <td className="py-2.5 px-2 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 font-bold text-blue-600 text-[11px]">
                    <FileText className="w-3 h-3 text-blue-500" />
                    <span>{item.status}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
