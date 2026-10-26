'use client';

import React from 'react';
import { Search, X, Bell, ChevronDown } from 'lucide-react';
import { haptics } from '@/utils/haptics';

export interface HqHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  unreadAlertsCount?: number;
  onOpenNotifications?: () => void;
}

export const HqHeader: React.FC<HqHeaderProps> = ({
  searchQuery,
  onSearchChange,
  unreadAlertsCount = 12,
  onOpenNotifications,
}) => {
  return (
    <header className="bg-white border-b border-slate-100 px-6 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-20">
      {/* Title & Greeting */}
      <div className="min-w-0">
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          운영 대시보드
        </h1>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium">
          <span className="font-bold text-slate-700">2024년 10월 24일 (목)</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-400">좋은 하루 되세요, 관리자님!</span>
        </div>
      </div>

      {/* Center/Right Actions: Global Search, Notifications & Profile */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        <div className="relative w-72 lg:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="고객명, 예약번호, 기사명, 차량번호로..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
              title="검색어 지우기"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Notifications Bell */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenNotifications?.();
          }}
          className="w-9 h-9 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 relative transition-all active:scale-95 cursor-pointer shadow-2xs"
          title="운영 알림 및 후속 조치"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-xs">
              {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
            </span>
          )}
        </button>

        {/* Admin Profile Pill */}
        <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50 cursor-pointer transition-all shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-[#1E60F3] text-white flex items-center justify-center text-xs font-black shrink-0">
            K
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-bold text-slate-900 leading-tight">관리자</div>
            <div className="text-[10px] text-slate-400 font-medium leading-none">VIP LIMOUSINE KOREA</div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5" />
        </div>
      </div>
    </header>
  );
};
