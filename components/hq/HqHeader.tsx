'use client';

import React from 'react';
import { Search, X, Bell, ChevronDown, Menu, RefreshCw, PhoneCall, Calculator, Award } from 'lucide-react';
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
              className="lg:hidden w-9 h-9 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 shrink-0 cursor-pointer active:scale-95"
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
                  <span className="text-slate-400 truncate">사모님(접수) · 대표님(배차) · 기사 실시간 동기화</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Actions: Desktop Search + Phone Intake + Sync + Bell + Profile */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop Search Bar */}
          <div className="relative hidden md:block w-60 xl:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                title="검색어 지우기"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            ) : null}
          </div>

          {/* Fast Phone Reservation Intake Button (PC & Mobile) */}
          {onOpenQuickPhoneBooking && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenQuickPhoneBooking();
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="전화 문의 즉시 예약 접수 (배차 대기함 등록 가능)"
            >
              <PhoneCall className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">전화 예약 접수</span>
              <span className="sm:hidden">전화접수</span>
            </button>
          )}

          {/* Quick Quote Calculator Button */}
          {onOpenQuoteModal && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenQuoteModal();
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-700 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer"
              title="가격표 기반 실시간 견적서 작성"
            >
              <Calculator className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="hidden sm:inline">견적기</span>
            </button>
          )}

          {/* VIP Chauffeur Card Modal Button */}
          {onOpenChauffeurCard && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenChauffeurCard();
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer"
              title="VIP Limousine Korea 공식 배차 소개서 (모바일/인쇄)"
            >
              <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden md:inline">VIP 소개서</span>
            </button>
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
              className="h-9 px-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 flex items-center gap-1.5 text-slate-600 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs disabled:opacity-60"
              title={lastSyncedLabel ? `최근 동기화: ${lastSyncedLabel}` : '실시간 서버 동기화'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1E60F3]' : ''}`} />
              <span className="hidden xl:inline">{lastSyncedLabel ? `동기화 ${lastSyncedLabel}` : '동기화'}</span>
            </button>
          )}

          {/* Notifications Bell */}
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onOpenNotifications?.();
            }}
            className="w-9 h-9 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 relative transition-all active:scale-95 cursor-pointer shadow-2xs"
            title="미배정 · 기사 미확인 · 재확인 필요 점검"
          >
            <Bell className="w-4 h-4" />
            {unreadAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-xs">
                {unreadAlertsCount > 99 ? '99+' : unreadAlertsCount}
              </span>
            )}
          </button>

          {/* Dev Test Account Switcher (only renders on localhost with DEV_AUTH_ENABLED) */}
          <DevAuthSwitcher />

          {/* Admin Profile Pill */}
          <div className="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50 transition-all shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-[#1E60F3] text-white flex items-center justify-center text-xs font-black shrink-0">
              V
            </div>
            <div className="text-left hidden lg:block">
              <div className="text-xs font-bold text-slate-900 leading-tight">본사 관제</div>
              <div className="text-[10px] text-slate-400 font-medium leading-none">PC · 모바일 연동</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden lg:block" />
          </div>
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
