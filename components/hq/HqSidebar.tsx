'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
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

  interface MenuItem {
    id: string;
    label: string;
    iconSrc: string;
    badge?: number;
    badgeColor?: string;
  }

  const menuItems: MenuItem[] = [
    {
      id: 'dispatch',
      label: '예약·배차 관리',
      iconSrc: '/images/icons/reservations/icon_reservations.png',
      badge: dispatchActionBadgeCount > 0 ? dispatchActionBadgeCount : undefined,
      badgeColor: 'bg-[#1E60F3] text-white',
    },
    {
      id: 'operations',
      label: '실시간 운영 보드',
      iconSrc: '/images/icons/live_dashboard/icon_live_dashboard.png',
    },
    {
      id: 'quotes',
      label: '견적·가격표',
      iconSrc: '/images/icons/calculator.png',
    },
    {
      id: 'customers',
      label: '고객 관리',
      iconSrc: '/images/icons/clients/icon_clients.png',
    },
    {
      id: 'emails',
      label: '고객 이메일',
      iconSrc: '/images/icons/eemail/icon_email.png',
    },
    {
      id: 'vehicles',
      label: '차량 관리',
      iconSrc: '/images/icons/vehicles/icon_vehicle.png',
    },
    {
      id: 'drivers',
      label: '기사 관리',
      iconSrc: '/images/icons/drivers/icon_driver.png',
    },
    {
      id: 'driving_logs',
      label: '운행일지 관리',
      iconSrc: '/images/icons/driving-logs/icon_driving_log.png',
    },
    {
      id: 'expenses',
      label: '경비지출',
      iconSrc: '/images/icons/driver_ui/icon_expense.png',
    },
    {
      id: 'field_knowledge',
      label: '현장 지식',
      iconSrc: '/images/icons/knowledge/icon_knowledge.png',
    },
    {
      id: 'reports',
      label: '보고서·통계',
      iconSrc: '/images/icons/report/icon_report.png',
    },
    {
      id: 'excel_import',
      label: '카카오톡 → Excel',
      iconSrc: '/images/icons/excel/icon_kakao.png',
    },
    {
      id: 'settings',
      label: '설정·권한',
      iconSrc: '/images/icons/settings/icon_setting.png',
    },
  ];

  // Shared HQ A-plan selection. The intentionally unconfigured Settings tab
  // remains untouched, including its existing menu behavior and styling.
  const activeNavClass = 'bg-[#F3F7FF] text-[#17233B] shadow-[0_4px_14px_rgba(35,49,78,0.055)]';
  const idleNavClass = 'bg-transparent text-[#61728A] hover:bg-[#F7F9FC] hover:text-[#17233B]';

  const renderSidebarBody = (isMobileDrawer: boolean, expanded: boolean) => (
    <>
      {/* Brand Header Card with Logo and Pin button */}
      <div className="relative flex h-[72px] shrink-0 items-center overflow-hidden px-3">
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
            <span className="truncate text-[12px] font-bold tracking-[-0.02em] text-[#17233B]">
              VIP LIMOUSINE
            </span>
            <span className="truncate text-[10px] font-medium leading-none text-[#95A3B9]">
              KOREA HQ
            </span>
          </div>

          {!isMobileDrawer && (
            <button
              type="button"
              onClick={togglePin}
              className={`p-1.5 rounded-lg transition-all cursor-pointer shrink-0 ml-1.5 ${
                isPinned
                  ? 'text-[#1E60F3] bg-[#EEF3FF] hover:bg-[#E8F0FF]'
                  : 'text-[#73839D] hover:text-[#17233B] hover:bg-[#F7F9FC]'
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
            className="ml-auto flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6]"
            aria-label="메뉴 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2.5 pb-3 pt-3">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          const isSettings = item.id === 'settings';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectTab(item.id);
                onCloseMobile?.();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex min-h-11 w-full cursor-pointer items-center rounded-[14px] px-3 text-left text-[12px] font-semibold transition-[background-color,color,box-shadow,transform] active:scale-[0.99] sm:text-[13px] ${
                isSettings
                  ? (isActive ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-100/50')
                  : isActive ? activeNavClass : idleNavClass
              }`}
              title={!expanded ? item.label : undefined}
            >
              {/* Icon Anchor: Position is 100% stable during expansion */}
              <div className="w-6 h-6 flex items-center justify-center shrink-0 relative">
                <img
                  src={item.iconSrc}
                  alt={item.label}
                  className={`w-5.5 h-5.5 object-contain shrink-0 transition-transform duration-150 ${
                    isActive ? 'scale-110 drop-shadow-2xs' : 'group-hover:scale-110 opacity-90'
                  }`}
                />
                {!expanded && item.badge !== undefined && (
                  <span
                    className={`absolute -top-1 -right-1.5 min-w-3.5 h-3.5 px-0.5 rounded-full text-[9px] font-black flex items-center justify-center ${
                      item.badgeColor || 'bg-[#1E60F3] text-white'
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
                      item.badgeColor || 'bg-[#1E60F3] text-white'
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
      <div className="shrink-0 space-y-1 overflow-hidden px-2.5 pb-2 pt-3">
        <Link
          href="/"
          onClick={() => {
            haptics.lightTap();
            onCloseMobile?.();
          }}
          className="group flex min-h-11 cursor-pointer items-center rounded-[14px] bg-[#F7F9FC] px-3 text-[12px] font-semibold text-[#4D607C] transition-colors hover:bg-[#EEF3FF] hover:text-[#1E60F3]"
          title={!expanded ? '기사 Cockpit 전환' : undefined}
          aria-label="기사 Cockpit 전환"
        >
          <div className="w-6 h-6 flex items-center justify-center shrink-0">
            <img
              src="/images/icons/mobile.png"
              alt="기사 Cockpit"
              className="w-5 h-5 object-contain shrink-0 group-hover:scale-110 transition-transform drop-shadow-2xs"
            />
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
          className="flex min-h-11 w-full cursor-pointer items-center rounded-[14px] px-3 text-[12px] font-semibold text-[#73839D] transition-colors hover:bg-[#F7F9FC] hover:text-[#4D607C]"
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
            ? 'z-50 bg-white/98 backdrop-blur-md shadow-[0_16px_48px_rgba(35,49,78,0.11)]'
            : 'z-30 bg-white shadow-[1px_0_0_rgba(225,231,240,0.35)]'
        }`}
      >
        {renderSidebarBody(false, isExpanded)}
      </aside>

      {/* Mobile Slide-Over Drawer (100% Full-Featured Parity) */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-[115] flex select-none bg-[#17233B]/30 backdrop-blur-[2px] animate-fade-in lg:hidden"
          onClick={onCloseMobile}
        >
          <aside
            className="flex h-dvh max-h-dvh w-72 max-w-[84dvw] flex-col bg-white shadow-[0_20px_60px_rgba(35,49,78,0.14)]"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarBody(true, true)}
          </aside>
        </div>
      )}
    </>
  );
};
