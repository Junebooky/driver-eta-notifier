'use client';

import React from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  CalendarCheck,
  Building2,
  Mail,
  Car,
  Users,
  FileSpreadsheet,
  Receipt,
  BarChart3,
  Settings,
  Smartphone,
  X,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

export interface HqSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  dispatchActionBadgeCount?: number;
}

export const HqSidebar: React.FC<HqSidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpenMobile = false,
  onCloseMobile,
  dispatchActionBadgeCount = 0,
}) => {
  const menuItems: {
    id: string;
    label: string;
    icon: React.ElementType;
    badge?: number;
    badgeColor?: string;
  }[] = [
    { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
    {
      id: 'dispatch',
      label: '예약·배차 관리',
      icon: CalendarCheck,
      badge: dispatchActionBadgeCount > 0 ? dispatchActionBadgeCount : undefined,
      badgeColor: 'bg-rose-500 text-white',
    },
    { id: 'customers', label: '고객 관리', icon: Building2 },
    { id: 'emails', label: '고객 이메일', icon: Mail },
    { id: 'vehicles', label: '차량 관리', icon: Car },
    { id: 'drivers', label: '기사 관리', icon: Users },
    { id: 'driving_logs', label: '운행일지 관리', icon: FileSpreadsheet },
    { id: 'expenses', label: '경비지출', icon: Receipt },
    { id: 'reports', label: '보고서·통계', icon: BarChart3 },
    { id: 'settings', label: '설정·권한', icon: Settings },
  ];

  const renderSidebarBody = (isMobileDrawer: boolean) => (
    <>
      {/* Brand Header */}
      <div className="p-5 pb-5 border-b border-slate-100/80 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex items-baseline tracking-tight">
              <span className="text-xl font-black text-[#0B1E48] tracking-tighter">VIP</span>
              <span className="text-[13px] font-black text-[#1E60F3] ml-1.5 tracking-tight uppercase">
                Limousine
              </span>
              <span className="text-[11px] font-bold text-slate-500 ml-1 tracking-tight">
                Korea
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
            HQ Operations System
          </p>
        </div>

        {isMobileDrawer && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
            aria-label="메뉴 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeTab === item.id ||
            (item.id === 'dispatch' && (activeTab === 'dashboard' || activeTab === 'vehicles' || activeTab === 'drivers'));

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectTab(item.id);
                onCloseMobile?.();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer active:scale-[0.98] ${
                activeTab === item.id || (item.id === 'dispatch' && activeTab === 'dispatch')
                  ? 'bg-blue-50/80 text-[#1E60F3] shadow-xs'
                  : isActive && item.id !== 'dispatch'
                  ? 'bg-blue-50/80 text-[#1E60F3] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    activeTab === item.id ? 'text-[#1E60F3]' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                    item.badgeColor || 'bg-blue-100 text-[#1E60F3]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Switch to Driver Cockpit shortcut */}
      <div className="p-3 border-t border-slate-100">
        <Link
          href="/"
          onClick={() => {
            haptics.lightTap();
            onCloseMobile?.();
          }}
          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 text-slate-600 hover:text-[#1E60F3] text-xs font-bold transition-all group"
          title="기사용 Cockpit 화면으로 전환"
        >
          <div className="flex items-center gap-2">
            <Smartphone className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#1E60F3]" />
            <span>기사 Cockpit 전환</span>
          </div>
          <span className="text-[10px] text-slate-400 group-hover:text-[#1E60F3]">➔</span>
        </Link>
      </div>

      {/* Footer Watermark */}
      <div className="p-3 pt-1 pb-4 text-center">
        <p className="text-[10px] text-slate-400 font-semibold tracking-tight">
          VIP LIMOUSINE KOREA
        </p>
        <p className="text-[9px] text-slate-400/80 font-medium">
          PC · 모바일 실시간 공유 관제
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-56 xl:w-60 bg-white border-r border-slate-100 flex-col shrink-0 select-none min-h-dvh sticky top-0 h-dvh">
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile Slide-Over Drawer (PC & Smartphone 100% Feature Parity) */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-[115] lg:hidden bg-slate-900/50 backdrop-blur-xs flex animate-fade-in select-none"
          onClick={onCloseMobile}
        >
          <aside
            className="w-72 max-w-[84dvw] h-dvh max-h-dvh bg-white shadow-2xl flex flex-col border-r border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}
    </>
  );
};
