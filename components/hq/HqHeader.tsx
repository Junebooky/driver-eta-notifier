'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Menu } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { DevAuthSwitcher } from '@/components/DevAuthSwitcher';

export interface HqHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  unreadAlertsCount?: number;
  onOpenNotifications?: () => void;
  onOpenMobileMenu?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOpenQuickPhoneBooking?: () => void;
  onOpenQuoteModal?: () => void;
  onOpenChauffeurCard?: () => void;
  onOpenAdminLogin?: () => void;
  lastSyncedLabel?: string;
  /** @deprecated Header title has been removed in UI cleanup */
  title?: string;
  /** @deprecated Header subtitle has been removed in UI cleanup */
  subtitle?: React.ReactNode;
  searchPlaceholder?: string;
}

export const HqHeader: React.FC<HqHeaderProps> = ({
  searchQuery,
  onSearchChange,
  unreadAlertsCount = 0,
  onOpenNotifications,
  onOpenMobileMenu,
  onRefresh,
  isRefreshing = false,
  onOpenQuickPhoneBooking,
  onOpenQuoteModal,
  onOpenChauffeurCard,
  onOpenAdminLogin,
  lastSyncedLabel,
  searchPlaceholder = '고객명, 예약번호, 기사명, 차량번호 검색...',
}) => {

  // 1-minute alert pulse & speech bubble
  const [isMinutePulsing, setIsMinutePulsing] = useState(false);
  const [showMinuteBubble, setShowMinuteBubble] = useState(false);
  const lastMinuteRef = useRef<number>(Math.floor(Date.now() / 60000));

  useEffect(() => {
    const timer = setInterval(() => {
      const currentMinute = Math.floor(Date.now() / 60000);
      if (currentMinute !== lastMinuteRef.current) {
        lastMinuteRef.current = currentMinute;
        setIsMinutePulsing(true);
        setShowMinuteBubble(true);

        const pulseTimer = setTimeout(() => setIsMinutePulsing(false), 1200);
        const bubbleTimer = setTimeout(() => setShowMinuteBubble(false), 5000);
        return () => {
          clearTimeout(pulseTimer);
          clearTimeout(bubbleTimer);
        };
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formattedSyncTime = useMemo(() => {
    if (!lastSyncedLabel) {
      return new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());
    }
    const parts = lastSyncedLabel.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
    return lastSyncedLabel;
  }, [lastSyncedLabel]);

  return (
    <header className="sticky top-0 z-20 bg-white px-3.5 shadow-[0_1px_0_rgba(225,231,240,0.5)] sm:px-6">
      <div className="flex items-center justify-between gap-2.5 h-14 sm:h-16">
        {/* Left: Mobile Menu Button (lg:hidden) */}
        <div className="flex items-center gap-2">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenMobileMenu();
              }}
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[13px] bg-[#F7F9FC] text-[#4D607C] transition-colors hover:bg-[#EDF1F6] active:scale-[0.98] lg:hidden"
              aria-label="전체 메뉴 열기"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Right Actions: Quick Calculator + Bell + Sync + Dev Switcher + Profile */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">

          {/* Quick Quote Calculator Button (Ghost Style - visible on both Mobile & PC) */}
          {onOpenQuoteModal && (
            <div className="relative group flex items-center">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onOpenQuoteModal();
                }}
                aria-label="빠른 견적 계산"
                className="flex size-10 cursor-pointer items-center justify-center rounded-[13px] bg-transparent transition-colors hover:bg-[#F7F9FC] active:bg-[#EEF3FF]"
              >
                <img
                  src="/images/icons/calculator.png"
                  alt="계산기"
                  className="w-7.5 h-7.5 object-contain shrink-0 transition-transform duration-150 group-hover:scale-110"
                />
              </button>

              {/* Hover Tooltip: 빠른 견적 계산 */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 hidden group-hover:flex flex-col items-center pointer-events-none z-50">
                <div className="-mb-1 size-2 rotate-45 bg-white" />
                <span className="whitespace-nowrap rounded-[12px] bg-white px-3 py-2 text-[11px] font-medium text-[#4D607C] shadow-[0_8px_22px_rgba(35,49,78,0.1)] animate-in fade-in-50 duration-150">
                  빠른 견적 계산
                </span>
              </div>
            </div>
          )}

          {/* Notifications Alarm (Ghost Style - placed before Refresh on both PC & Mobile) */}
          <div className="relative group flex items-center">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenNotifications?.();
              }}
              aria-label="배차 알림 열기"
              className="relative flex size-10 cursor-pointer items-center justify-center rounded-[13px] bg-transparent transition-colors hover:bg-[#F7F9FC] active:bg-[#EEF3FF]"
              title="미배정 · 기사 미확인 · 재확인 필요 점검"
            >
              <img
                src="/images/icons/alarm.png"
                alt="알림"
                className="w-7.5 h-7.5 object-contain shrink-0 transition-transform duration-150 group-hover:scale-110"
              />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-xs">
                  {unreadAlertsCount > 99 ? '99+' : unreadAlertsCount}
                </span>
              )}
            </button>

            {/* Hover Tooltip: 배차 알림 */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 hidden group-hover:flex flex-col items-center pointer-events-none z-50">
              <div className="-mb-1 size-2 rotate-45 bg-white" />
              <span className="whitespace-nowrap rounded-[12px] bg-white px-3 py-2 text-[11px] font-medium text-[#4D607C] shadow-[0_8px_22px_rgba(35,49,78,0.1)] animate-in fade-in-50 duration-150">
                배차 알림
              </span>
            </div>
          </div>

          {/* Live Server Sync Button (Ghost Style with Update Icon & Minute Pulse) */}
          {onRefresh && (
            <div className="relative group flex items-center">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onRefresh();
                }}
                disabled={isRefreshing}
                aria-label="실시간 서버 동기화"
                className="relative flex size-10 cursor-pointer items-center justify-center rounded-[13px] bg-transparent transition-colors hover:bg-[#F7F9FC] active:bg-[#EEF3FF] disabled:cursor-not-allowed disabled:opacity-40"
                title={lastSyncedLabel ? `최근 업데이트: ${lastSyncedLabel}` : '실시간 서버 동기화'}
              >
                <img
                  src="/images/icons/update.png"
                  alt="동기화"
                  className={`w-7.5 h-7.5 object-contain shrink-0 transition-all duration-300 ${isRefreshing ? 'animate-spin' : ''
                    } ${isMinutePulsing ? 'scale-125 drop-shadow-md' : 'group-hover:scale-110'}`}
                />
              </button>

              {/* Speech Bubble: Hover or 1-minute alert */}
              <div
                className={`absolute top-full left-1/2 -translate-x-1/2 pt-2 flex-col items-center pointer-events-none z-50 transition-all duration-200 ${showMinuteBubble ? 'flex animate-in fade-in zoom-in-95' : 'hidden group-hover:flex'
                  }`}
              >
                <div className="-mb-1 size-2 rotate-45 bg-white" />
                <span className="flex items-center gap-1.5 whitespace-nowrap rounded-[12px] bg-white px-3 py-2 text-[11px] font-medium text-[#4D607C] shadow-[0_8px_22px_rgba(35,49,78,0.1)] animate-in fade-in-50 duration-150">
                  <span className="inline-block size-1.5 rounded-full bg-[#1E60F3]" />
                  {formattedSyncTime} 업데이트
                </span>
              </div>
            </div>
          )}

          {/* Dev Test Account Switcher (only renders on localhost with DEV_AUTH_ENABLED) */}
          <DevAuthSwitcher />

          {/* Admin Profile Pill */}
          <button
            type="button"
            onClick={() => {
              if (onOpenAdminLogin) {
                haptics.lightTap();
                onOpenAdminLogin();
              }
            }}
            className="hidden min-h-11 cursor-pointer items-center gap-2 rounded-[14px] bg-white py-1.5 pl-2 pr-3 shadow-[0_4px_14px_rgba(35,49,78,0.055)] transition-colors hover:bg-[#FAFBFD] active:scale-[0.99] sm:flex"
            title="본사 관제 세션 (클릭하여 관리자 로그인)"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-[#EEF3FF] text-[12px] font-semibold text-[#1E60F3]">
              V
            </div>
            <div className="text-left hidden lg:block">
              <div className="text-[12px] font-semibold leading-tight text-[#17233B]">본사 관제</div>
              <div className="text-[10px] text-slate-400 font-medium leading-none">PC · 모바일 연동</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden lg:block" />
          </button>
        </div>
      </div>
    </header>
  );
};
