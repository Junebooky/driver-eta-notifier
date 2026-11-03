'use client';

import React from 'react';
import { Search, X, ChevronDown, Menu, RefreshCw, PhoneCall, Award } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { formatKoreanFullDateLabel } from '@/utils/dispatchConflictDetector';
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
  title?: string;
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
  title = '예약·배차 관리',
  subtitle,
  searchPlaceholder = '고객명, 예약번호, 기사명, 차량번호 검색...',
}) => {
  const todayLabel = formatKoreanFullDateLabel();

  return (
    <header className="bg-white border-b border-slate-100 px-3.5 sm:px-6 py-3 sticky top-0 z-20 space-y-2.5">
      <div className="flex items-center justify-between gap-2.5">
        {/* Left: Mobile Menu Button + Title & Live Date */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenMobileMenu();
              }}
              className="lg:hidden w-11 h-11 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 shrink-0 cursor-pointer active:scale-95"
              aria-label="전체 메뉴 열기"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-black text-slate-900 tracking-tight truncate">
              {title}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] sm:text-xs text-slate-500 font-medium truncate">
              {subtitle || (
                <>
                  <span className="font-bold text-slate-700">{todayLabel}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-400 truncate">예약 접수부터 기사님 배정까지 실시간으로 연결돼요</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Actions: Desktop Search + Phone Intake + Sync + Bell + Profile */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">

          {/* Quick Quote Calculator Button (Ghost Style) */}
          {onOpenQuoteModal && (
            <div className="relative group hidden sm:flex items-center">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onOpenQuoteModal();
                }}
                aria-label="빠른 견적 계산"
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-transparent border-0 hover:bg-slate-100 active:bg-slate-200 active:scale-95 transition-all duration-150 cursor-pointer"
              >
                <img
                  src="/images/icons/calculator.png"
                  alt="계산기"
                  className="w-7.5 h-7.5 object-contain shrink-0 transition-transform duration-150 group-hover:scale-110"
                />
              </button>

              {/* Hover Tooltip: 빠른 견적 계산 */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 hidden group-hover:flex flex-col items-center pointer-events-none z-50">
                <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 shadow-xs" />
                <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                  빠른 견적 계산
                </span>
              </div>
            </div>
          )}


          {/* Live Server Sync Button */}
          {onRefresh && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onRefresh();
              }}
              disabled={isRefreshing}
              aria-label="일정 새로고침"
              className="h-10 w-10 sm:w-auto px-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 flex items-center gap-1.5 text-slate-600 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs disabled:opacity-60"
              title={lastSyncedLabel ? `최근 업데이트: ${lastSyncedLabel}` : '실시간 서버 동기화'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1E60F3]' : ''}`} />
              <span className="hidden xl:inline">
                {lastSyncedLabel
                  ? `업데이트 (${lastSyncedLabel.split(':').length >= 2
                    ? `${lastSyncedLabel.split(':')[0]}:${lastSyncedLabel.split(':')[1]}`
                    : lastSyncedLabel
                  })`
                  : '방금 업데이트됨'}
              </span>
            </button>
          )}

          {/* Notifications Alarm (Ghost Style) */}
          <div className="relative group flex items-center">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenNotifications?.();
              }}
              aria-label="배차 알림 열기"
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-transparent border-0 hover:bg-slate-100 active:bg-slate-200 active:scale-95 transition-all duration-150 cursor-pointer relative"
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
              <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 shadow-xs" />
              <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
                배차 알림
              </span>
            </div>
          </div>

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
            className="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50 transition-all shadow-2xs cursor-pointer active:scale-98"
            title="본사 관제 세션 (클릭하여 관리자 로그인)"
          >
            <div className="w-7 h-7 rounded-lg bg-[#1E60F3] text-white flex items-center justify-center text-xs font-black shrink-0">
              V
            </div>
            <div className="text-left hidden lg:block">
              <div className="text-xs font-bold text-slate-900 leading-tight">본사 관제</div>
              <div className="text-[10px] text-slate-400 font-medium leading-none">PC · 모바일 연동</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden lg:block" />
          </button>
        </div>
      </div>

      {/* Mobile Compact Search Bar (< md) */}
      <div className="relative md:hidden">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-8 pr-8 py-1.5 bg-slate-50 focus:bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#1E60F3]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </header>
  );
};
