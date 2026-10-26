'use client';

import React from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  CalendarCheck,
  Car,
  Users,
  FileSpreadsheet,
  Receipt,
  FileCheck,
  BarChart3,
  Settings,
  Smartphone,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

export interface HqSidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const HqSidebar: React.FC<HqSidebarProps> = ({ activeTab, onSelectTab }) => {
  const menuItems = [
    { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
    { id: 'dispatch', label: '예약·배차 관리', icon: CalendarCheck },
    { id: 'vehicles', label: '차량 관리', icon: Car },
    { id: 'drivers', label: '기사 관리', icon: Users },
    { id: 'driving_logs', label: '운행일지 관리', icon: FileSpreadsheet },
    { id: 'expenses', label: '경비지출 관리', icon: Receipt },
    { id: 'receipts', label: '영수증 검수', icon: FileCheck },
    { id: 'reports', label: '보고서 · 통계', icon: BarChart3 },
    { id: 'settings', label: '설정 · 권한', icon: Settings },
  ];

  return (
    <aside className="w-56 lg:w-60 bg-white border-r border-slate-100 flex flex-col shrink-0 select-none min-h-screen">
      {/* Brand Header */}
      <div className="p-5 pb-6 border-b border-slate-100/80">
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

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectTab(item.id);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer active:scale-[0.98] ${
                isActive
                  ? 'bg-blue-50/80 text-[#1E60F3] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive ? 'text-[#1E60F3]' : 'text-slate-400'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Switch to Driver Cockpit shortcut */}
      <div className="p-3 border-t border-slate-100">
        <Link
          href="/"
          onClick={() => haptics.lightTap()}
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
    </aside>
  );
};
