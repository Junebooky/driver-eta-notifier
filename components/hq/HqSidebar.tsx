'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  Building2,
  Mail,
  Car,
  Users,
  FileSpreadsheet,
  Receipt,
  BookOpen,
  BarChart3,
  Settings,
  Smartphone,
  Activity,
  Calculator,
  X,
  LogOut,
  Pin,
  PinOff,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { logoutClientSession } from '@/utils/cockpitClientAuth';

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
  // 1. Sidebar Pin State with LocalStorage Persistence
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hq_sidebar_pinned');
      if (saved !== null) {
        setIsPinned(saved === 'true');
      }
    } catch {
      // Ignore SSR / localStorage errors
    }
  }, []);

  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('hq_sidebar_pinned', String(next));
      } catch {
        // Ignore storage errors
      }
      haptics.selection();
      return next;
    });
  };

  // 2. Intent Delay on Hover (120ms debounce for smooth responsiveness)
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (isPinned) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // 3. Global Shortcut: Cmd + B (Mac) / Ctrl + B (Windows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        togglePin();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isExpanded = isPinned || isHovered;

  const menuItems: {
    id: string;
    label: string;
    icon: React.ElementType;
    badge?: number;
    badgeColor?: string;
  }[] = [
    {
      id: 'dispatch',
      label: '예약·배차 관리',
      icon: CalendarCheck,
      badge: dispatchActionBadgeCount > 0 ? dispatchActionBadgeCount : undefined,
      badgeColor: 'bg-[#1E60F3] text-white',
    },
    { id: 'operations', label: '실시간 운영 보드', icon: Activity },
    { id: 'quotes', label: '견적·가격표', icon: Calculator },
    { id: 'customers', label: '고객 관리', icon: Building2 },
    { id: 'emails', label: '고객 이메일', icon: Mail },
    { id: 'vehicles', label: '차량 관리', icon: Car },
    { id: 'drivers', label: '기사 관리', icon: Users },
    { id: 'driving_logs', label: '운행일지 관리', icon: FileSpreadsheet },
    { id: 'expenses', label: '경비지출', icon: Receipt },
    { id: 'field_knowledge', label: '현장 지식', icon: BookOpen },
    { id: 'reports', label: '보고서·통계', icon: BarChart3 },
    { id: 'settings', label: '설정·권한', icon: Settings },
  ];

  const renderSidebarBody = (isMobileDrawer: boolean, expanded: boolean) => (
    <>
      {/* Brand Header Card with Logo and Pin button */}
      <div className="h-16 px-3 flex items-center border-b border-slate-100/80 relative shrink-0 overflow-hidden">
        {/* Logo Anchor: Stays strictly in position */}
        <div className="w-10 h-10 flex items-center justify-center shrink-0">
          <img
            src="/logo.png"
            alt="VIP Limousine Logo"
            className="w-8 h-8 object-contain shrink-0 drop-shadow-xs"
          />
        </div>

        {/* Text & Pin Button: smoothly unclips to the right */}
        <div
          className={`flex-1 min-w-0 flex items-center justify-between ml-2.5 overflow-hidden transition-all duration-200 ${
            expanded
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 -translate-x-2 pointer-events-none'
          }`}
        >
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black text-slate-900 tracking-tight truncate">
              VIP LIMOUSINE
            </span>
            <span className="text-[10px] text-slate-400 font-semibold truncate leading-none">
              KOREA HQ
            </span>
          </div>

          {!isMobileDrawer && (
            <button
              type="button"
              onClick={togglePin}
              className={`p-1.5 rounded-lg transition-all cursor-pointer shrink-0 ml-1.5 ${
                isPinned
                  ? 'text-[#1E60F3] bg-blue-50 hover:bg-blue-100 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
              title={isPinned ? '사이드바 고정 해제 (Cmd+B)' : '사이드바 고정 (Cmd+B)'}
              aria-label={isPinned ? '사이드바 고정 해제' : '사이드바 고정'}
            >
              {isPinned ? (
                <PinOff className="w-4 h-4" />
              ) : (
                <Pin className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {isMobileDrawer && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors shrink-0 ml-auto"
            aria-label="메뉴 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2.5 pt-3 pb-3 space-y-1 overflow-y-auto overflow-x-hidden">
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
                onCloseMobile?.();
              }}
              className={`w-full h-10 px-2.5 flex items-center rounded-xl text-xs sm:text-sm font-bold transition-colors text-left cursor-pointer active:scale-[0.98] ${
                isActive
                  ? 'bg-blue-50/90 text-[#1E60F3] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title={!expanded ? item.label : undefined}
            >
              {/* Icon Anchor: Position is 100% stable during expansion */}
              <div className="w-6 h-6 flex items-center justify-center shrink-0 relative">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-[#1E60F3]' : 'text-slate-400'
                  }`}
                />
                {!expanded && item.badge !== undefined && (
                  <span
                    className={`absolute -top-1 -right-1.5 min-w-3.5 h-3.5 px-0.5 rounded-full text-[9px] font-black flex items-center justify-center ${
                      item.badgeColor || 'bg-blue-100 text-[#1E60F3]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Text Label & Badge: Smoothly reveals to the right */}
              <div
                className={`flex-1 min-w-0 flex items-center justify-between ml-3 overflow-hidden transition-all duration-200 ${
                  expanded
                    ? 'opacity-100 translate-x-0'
                    : 'opacity-0 -translate-x-2 pointer-events-none'
                }`}
              >
                <span className="truncate whitespace-nowrap">
                  {item.label}
                </span>

                {item.badge !== undefined && (
                  <span
                    className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ml-1.5 ${
                      item.badgeColor || 'bg-blue-100 text-[#1E60F3]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Switch to Driver Cockpit shortcut & Admin Logout */}
      <div className="p-2.5 border-t border-slate-100 space-y-1 shrink-0 overflow-hidden">
        <Link
          href="/"
          onClick={() => {
            haptics.lightTap();
            onCloseMobile?.();
          }}
          className="h-10 px-2.5 flex items-center rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 text-slate-600 hover:text-[#1E60F3] text-xs font-bold transition-colors group cursor-pointer"
          title={!expanded ? '기사 Cockpit 전환' : undefined}
          aria-label="기사 Cockpit 전환"
        >
          <div className="w-6 h-6 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-slate-400 group-hover:text-[#1E60F3] shrink-0" />
          </div>
          <div
            className={`flex-1 min-w-0 flex items-center justify-between ml-3 overflow-hidden transition-all duration-200 ${
              expanded
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-2 pointer-events-none'
            }`}
          >
            <span className="truncate whitespace-nowrap">기사 Cockpit 전환</span>
            <span className="text-[10px] text-slate-400 group-hover:text-[#1E60F3] shrink-0">➔</span>
          </div>
        </Link>

        <button
          type="button"
          onClick={async () => {
            haptics.lightTap();
            await logoutClientSession();
            window.location.assign('/hq/login');
          }}
          className="w-full h-10 px-2.5 flex items-center rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer"
          title={!expanded ? '관리자 로그아웃' : undefined}
          aria-label="관리자 로그아웃"
        >
          <div className="w-6 h-6 flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div
            className={`flex-1 min-w-0 flex items-center justify-start ml-3 overflow-hidden transition-all duration-200 ${
              expanded
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-2 pointer-events-none'
            }`}
          >
            <span className="truncate whitespace-nowrap">관리자 로그아웃</span>
          </div>
        </button>
      </div>

      {/* Footer Watermark */}
      <div
        className={`px-3 pt-1 pb-3 text-center shrink-0 overflow-hidden transition-all duration-200 ${
          expanded
            ? 'opacity-100 h-auto'
            : 'opacity-0 h-0 pointer-events-none'
        }`}
      >
        <p className="text-[10px] text-slate-400 font-semibold tracking-tight whitespace-nowrap">
          VIP LIMOUSINE KOREA
        </p>
        <p className="text-[9px] text-slate-400/80 font-medium whitespace-nowrap">
          PC · 모바일 실시간 공유 관제
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar Rail Placeholder (Preserves document flow for main content) */}
      <div
        className={`hidden lg:block shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isPinned ? 'w-60' : 'w-16'
        }`}
        aria-hidden="true"
      />

      {/* Desktop Slim Rail + Floating Hover Overlay Sidebar */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`hidden lg:flex fixed top-0 left-0 bottom-0 h-dvh flex-col shrink-0 select-none overflow-hidden transition-[width,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isExpanded ? 'w-60' : 'w-16'
        } ${
          isHovered && !isPinned
            ? 'z-50 bg-white/95 backdrop-blur-md border-r border-slate-200/90 shadow-2xl'
            : 'z-30 bg-white border-r border-slate-100'
        }`}
      >
        {renderSidebarBody(false, isExpanded)}
      </aside>

      {/* Mobile Slide-Over Drawer (100% Full-Featured Parity) */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-[115] lg:hidden bg-slate-900/50 backdrop-blur-xs flex animate-fade-in select-none"
          onClick={onCloseMobile}
        >
          <aside
            className="w-72 max-w-[84dvw] h-dvh max-h-dvh bg-white shadow-2xl flex flex-col border-r border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarBody(true, true)}
          </aside>
        </div>
      )}
    </>
  );
};
