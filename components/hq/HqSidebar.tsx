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

  // 2. Intent Delay on Hover (150ms debounce)
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (isPinned) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 150);
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
      <div className="h-16 flex items-center justify-between px-3.5 border-b border-slate-100/80 relative shrink-0">
        {expanded ? (
          <div className="flex items-center justify-between w-full min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/logo.png"
                alt="VIP Limousine Logo"
                className="w-8 h-8 object-contain shrink-0 drop-shadow-xs"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black text-slate-900 tracking-tight truncate">
                  VIP LIMOUSINE
                </span>
                <span className="text-[10px] text-slate-400 font-semibold truncate leading-none">
                  KOREA HQ
                </span>
              </div>
            </div>

            {/* Desktop Pin Toggle Button */}
            {!isMobileDrawer && (
              <button
                type="button"
                onClick={togglePin}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
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
        ) : (
          <div className="w-full flex items-center justify-center">
            <img
              src="/logo.png"
              alt="VIP Limousine Logo"
              className="w-8 h-8 object-contain shrink-0 drop-shadow-xs"
            />
          </div>
        )}

        {isMobileDrawer && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors shrink-0 ml-2"
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
              className={`w-full flex items-center rounded-xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer active:scale-[0.98] ${
                expanded
                  ? 'px-3 py-2.5 justify-between'
                  : 'h-10 w-10 mx-auto justify-center'
              } ${
                isActive
                  ? 'bg-blue-50/90 text-[#1E60F3] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title={!expanded ? item.label : undefined}
            >
              <div className={`flex items-center ${expanded ? 'gap-3 min-w-0' : 'justify-center'} relative`}>
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-[#1E60F3]' : 'text-slate-400'
                  }`}
                />
                {expanded && (
                  <span className="truncate whitespace-nowrap animate-in fade-in duration-150">
                    {item.label}
                  </span>
                )}
                {!expanded && item.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-2 min-w-3.5 h-3.5 px-0.5 rounded-full text-[9px] font-black flex items-center justify-center ${
                      item.badgeColor || 'bg-blue-100 text-[#1E60F3]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>

              {expanded && item.badge !== undefined && (
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

      {/* Switch to Driver Cockpit shortcut & Admin Logout */}
      {expanded ? (
        <div className="p-3 border-t border-slate-100 space-y-1 shrink-0 animate-in fade-in duration-150">
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

          <button
            type="button"
            onClick={async () => {
              haptics.lightTap();
              await logoutClientSession();
              window.location.assign('/hq/login');
            }}
            className="w-full flex items-center justify-between p-2.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all cursor-pointer"
            title="본사 관리자 세션 로그아웃"
          >
            <div className="flex items-center gap-2">
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>관리자 로그아웃</span>
            </div>
          </button>
        </div>
      ) : (
        <div className="p-2 border-t border-slate-100 flex flex-col items-center gap-1.5 shrink-0">
          <Link
            href="/"
            onClick={() => {
              haptics.lightTap();
              onCloseMobile?.();
            }}
            className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 text-slate-600 hover:text-[#1E60F3] flex items-center justify-center transition-all cursor-pointer"
            title="기사 Cockpit 전환"
            aria-label="기사 Cockpit 전환"
          >
            <Smartphone className="w-4 h-4 text-slate-400 hover:text-[#1E60F3]" />
          </Link>

          <button
            type="button"
            onClick={async () => {
              haptics.lightTap();
              await logoutClientSession();
              window.location.assign('/hq/login');
            }}
            className="w-10 h-10 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all cursor-pointer"
            title="관리자 로그아웃"
            aria-label="관리자 로그아웃"
          >
            <LogOut className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}

      {/* Footer Watermark */}
      {expanded && (
        <div className="p-3 pt-1 pb-3 text-center shrink-0 animate-in fade-in duration-150">
          <p className="text-[10px] text-slate-400 font-semibold tracking-tight">
            VIP LIMOUSINE KOREA
          </p>
          <p className="text-[9px] text-slate-400/80 font-medium">
            PC · 모바일 실시간 공유 관제
          </p>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar Rail Placeholder (Preserves document flow for main content) */}
      <div
        className={`hidden lg:block shrink-0 transition-[width] duration-200 ease-out ${
          isPinned ? 'w-60' : 'w-16'
        }`}
        aria-hidden="true"
      />

      {/* Desktop Slim Rail + Floating Hover Overlay Sidebar */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`hidden lg:flex fixed top-0 left-0 bottom-0 h-dvh flex-col shrink-0 select-none overflow-x-hidden transition-[width,box-shadow,background-color] duration-200 ease-out ${
          isExpanded ? 'w-60' : 'w-16'
        } ${
          isHovered && !isPinned
            ? 'z-50 bg-white/95 backdrop-blur-md border-r border-slate-200/80 shadow-2xl'
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
