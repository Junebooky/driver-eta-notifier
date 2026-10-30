'use client';

import React from 'react';
import { Receipt, ChevronRight, CreditCard, Coins, FileCheck } from 'lucide-react';
import { HqExpenseItem } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqExpenseCardProps {
  expenses: HqExpenseItem[];
  todayTotalExpense?: number;
  monthTotalExpense?: number;
  pendingReceiptsCount?: number;
  onViewAll?: () => void;
  onSelectExpense?: (item: HqExpenseItem) => void;
}

export const HqExpenseCard: React.FC<HqExpenseCardProps> = ({
  expenses,
  todayTotalExpense = 125000,
  monthTotalExpense = 4320000,
  pendingReceiptsCount = 7,
  onViewAll,
  onSelectExpense,
}) => {
  const getStatusBadge = (status: HqExpenseItem['status']) => {
    switch (status) {
      case '검수 대기':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            검수 대기
          </span>
        );
      case '승인 완료':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            승인 완료
          </span>
        );
      case '금액 확인':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            금액 확인
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
              <Receipt className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              경비지출 / 영수증 검수
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

        {/* 3 Metric Summary Blocks */}
        <div className="grid grid-cols-3 gap-2 pt-3 pb-2">
          {/* 오늘 총 지출 */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100/70 text-[#1E60F3] flex items-center justify-center shrink-0">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-medium">오늘 총 지출</div>
              <div className="text-xs font-black text-slate-900 truncate">
                {todayTotalExpense.toLocaleString()}원
              </div>
            </div>
          </div>

          {/* 이번 달 지출 */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100/70 text-[#1E60F3] flex items-center justify-center shrink-0">
              <Coins className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-medium">이번 달 지출</div>
              <div className="text-xs font-black text-slate-900 truncate">
                {monthTotalExpense.toLocaleString()}원
              </div>
            </div>
          </div>

          {/* 미검수 영수증 */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-100/70 text-rose-600 flex items-center justify-center shrink-0">
              <FileCheck className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 font-medium">미검수 영수증</div>
              <div className="text-xs font-black text-rose-600 truncate">
                {pendingReceiptsCount}건
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mini Table */}
      <div className="overflow-x-auto pt-1">
        <table className="w-full text-left text-xs select-none">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
              <th className="py-2 px-1">제출일</th>
              <th className="py-2 px-1">기사명</th>
              <th className="py-2 px-1">항목</th>
              <th className="py-2 px-1 text-right">금액</th>
              <th className="py-2 px-1 text-right">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/70">
            {expenses.map((item) => (
              <tr
                key={item.id}
                onClick={() => {
                  haptics.lightTap();
                  onSelectExpense?.(item);
                }}
                className="hover:bg-slate-50 transition-colors cursor-pointer group"
              >
                <td className="py-2.5 px-1 text-slate-500 font-medium whitespace-nowrap text-[11px]">
                  {item.submittedAt}
                </td>
                <td className="py-2.5 px-1 font-bold text-slate-900 group-hover:text-[#1E60F3] transition-colors whitespace-nowrap">
                  {item.driverName}
                </td>
                <td className="py-2.5 px-1 text-slate-600 font-medium whitespace-nowrap text-[11px]">
                  {item.category}
                </td>
                <td className="py-2.5 px-1 text-right font-black text-slate-800 whitespace-nowrap">
                  {item.amount.toLocaleString()}원
                </td>
                <td className="py-2.5 px-1 text-right whitespace-nowrap">
                  {getStatusBadge(item.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
