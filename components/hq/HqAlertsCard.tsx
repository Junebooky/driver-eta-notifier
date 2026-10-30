'use client';

import React, { useState } from 'react';
import { Bell, ChevronRight, MoreHorizontal } from 'lucide-react';
import { HqAlertItem } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqAlertsCardProps {
  alerts: HqAlertItem[];
  onViewAll?: () => void;
  onAction?: (alert: HqAlertItem) => void;
}

export const HqAlertsCard: React.FC<HqAlertsCardProps> = ({
  alerts,
  onViewAll,
  onAction,
}) => {
  const [filter, setFilter] = useState<'all' | 'unack' | 'resend' | 'change'>('all');

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'unack') return a.category === '발송 미확인';
    if (filter === 'resend') return a.category === '재발송 필요';
    if (filter === 'change') return a.category === '고객 요청 변경';
    return true;
  });

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      {/* Header & Filter Tabs */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
              <Bell className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              알림 / 후속 조치
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-[10px] font-bold">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setFilter('all');
                }}
                className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                  filter === 'all' ? 'bg-[#1E60F3] text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                전체 12
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setFilter('unack');
                }}
                className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                  filter === 'unack' ? 'bg-[#1E60F3] text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                미확인 7
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setFilter('resend');
                }}
                className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                  filter === 'resend' ? 'bg-[#1E60F3] text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                재발송 필요 3
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setFilter('change');
                }}
                className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                  filter === 'change' ? 'bg-[#1E60F3] text-white shadow-2xs' : 'text-slate-600'
                }`}
              >
                고객 요청 변경 2
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onViewAll?.();
              }}
              className="text-[11px] font-bold text-[#1E60F3] hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
            >
              <span>전체보기</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Alerts List */}
        <div className="pt-2 divide-y divide-slate-100/80">
          {filteredAlerts.map((alt) => {
            const isUnack = alt.status === '미확인';

            return (
              <div
                key={alt.id}
                className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 px-1 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                    {alt.time}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                      isUnack
                        ? 'bg-rose-50 text-rose-600 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {alt.category}
                  </span>
                  <div className="min-w-0 flex items-center gap-1.5 truncate">
                    <span className="font-bold text-slate-900 truncate">
                      {alt.customerName}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      / {alt.bookingNo}
                    </span>
                    <span className="text-slate-600 truncate ml-1 text-[11px]">
                      {alt.message}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-bold ${
                      isUnack ? 'text-rose-600' : 'text-amber-600'
                    }`}
                  >
                    {alt.status}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      onAction?.(alt);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      isUnack
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                        : 'bg-blue-50 hover:bg-blue-100 text-[#1E60F3] border border-blue-200'
                    }`}
                  >
                    {alt.actionLabel}
                  </button>

                  <button
                    type="button"
                    className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
