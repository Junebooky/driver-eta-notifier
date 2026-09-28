'use client';

import React, { useRef, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { Car, ChevronDown, Settings } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { openNaviAppMain } from '@/utils/navigation';

interface HeaderProps {
  profile: DriverProfile;
  onOpenProfileModal: () => void;
  onSelectNavi: (provider: NaviProvider) => void;
  onOpenAdminModal?: () => void;
  isAdmin?: boolean;
}

/**
 * Smart formatting for mobile header driver & vehicle label:
 * If both car unit (e.g., '4호차') and plate numbers ('142호 7811') are present,
 * compacts to '4호차 (7811) • 윤태준' to prevent header overflow.
 */
function formatHeaderDriverLabel(vehicleNo?: string, driverName?: string): string {
  let v = vehicleNo?.trim() || '';
  v = v.replace(/^호차\s+/, '').trim();
  if (v === '호차') v = '';
  const d = driverName?.trim() || '';

  if (!v && !d) return '드라이버 등록';

  let formattedVehicle = v;
  if (v) {
    const hochaMatch = v.match(/(\d+호차)/);
    const lastDigitsMatch = v.match(/(\d{4})\b/);
    if (hochaMatch && lastDigitsMatch) {
      formattedVehicle = `${hochaMatch[1]} (${lastDigitsMatch[1]})`;
    }
  }

  if (formattedVehicle && d) {
    return `${formattedVehicle} • ${d}`;
  }
  return formattedVehicle || d;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  onOpenProfileModal,
  onSelectNavi,
  onOpenAdminModal,
  isAdmin = false,
}) => {
  const headerLabel = formatHeaderDriverLabel(profile.vehicleNo, profile.driverName);

  // Header.tsx 내부 상태 및 롱프레스 제어
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const startCoordRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const startLongPress = (navi: 'tmap' | 'kakao' | 'naver', e: React.TouchEvent | React.MouseEvent) => {
    isLongPressRef.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    startCoordRef.current = { x: clientX, y: clientY };

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      haptics.impactMedium();
      openNaviAppMain(navi); // 목적지 무시하고 초기 메인화면으로 실행
    }, 350);
  };

  const cancelLongPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const checkTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startCoordRef.current.x);
    const dy = Math.abs(touch.clientY - startCoordRef.current.y);
    // 10px 이상 터치 이동 시 스크롤 제스처로 간주하여 롱프레스 취소
    if (dx > 10 || dy > 10) {
      cancelLongPress();
    }
  };

  const handleNaviClick = (navi: 'tmap' | 'kakao' | 'naver') => {
    // 롱프레스가 발화된 직후 손을 뗐을 때 단순 클릭 토글 차단
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    haptics.lightTap();
    onSelectNavi(navi);
  };

  return (
    <header className="w-full bg-white/95 border-b border-slate-100/90 backdrop-blur pt-[max(env(safe-area-inset-top),1.25rem)] pb-2.5 px-4 sticky top-0 z-30 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2">
        {/* Left: Driver / Vehicle Pill Tag (Flexible with truncate, won't wrap to 2 lines) */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1 shrink mr-2">
          <button
            onClick={() => {
              haptics.lightTap();
              onOpenProfileModal();
            }}
            className="flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-sm font-bold text-slate-800 cursor-pointer hover:bg-slate-50 active:scale-95 transition-all min-w-0 max-w-full"
            title={`${profile.vehicleNo || ''} ${profile.driverName || ''}${profile.passengerName?.trim() ? ` • 담당승객: ${profile.passengerName.trim()}` : ''}`.trim()}
          >
            <Car className="w-3.5 h-3.5 text-[#1E60F3] fill-[#1E60F3] shrink-0" />
            <span className="font-extrabold truncate whitespace-nowrap">
              {headerLabel}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

        </div>

        {/* Right: Circular 36px Navi Switchers + Settings Gear Icon (Guaranteed shrink-0 protection) */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* TMAP Button (White circular background + Gradient 'T' Logo) */}
          <button
            onTouchStart={(e) => startLongPress('tmap', e)}
            onTouchEnd={cancelLongPress}
            onTouchMove={checkTouchMove}
            onMouseDown={(e) => startLongPress('tmap', e)}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => handleNaviClick('tmap')}
            className={`w-9 h-9 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer select-none [-webkit-touch-callout:none] ${profile.defaultNavi === 'tmap'
                ? 'ring-2 ring-[#1E60F3] scale-105 shadow-[0_4px_12px_rgba(30,96,243,0.25)] z-10'
                : 'opacity-60 hover:opacity-100'
              }`}
            title="티맵 (TMAP) 선택 (길게 누르면 앱 실행)"
            aria-label="티맵 선택"
          >
            <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="tmapLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#E11D48" />
                  <stop offset="45%" stopColor="#9333EA" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <path
                d="M3.5 6.25C3.5 4.8 4.7 4 6 4H18C19.3 4 20.5 4.8 20.5 6.25C20.5 7.7 19.3 8.5 18 8.5H14.6V19.5C14.6 20.9 13.5 22 12 22C10.5 22 9.4 20.9 9.4 19.5V8.5H6C4.7 8.5 3.5 7.7 3.5 6.25Z"
                fill="url(#tmapLogoGrad)"
              />
            </svg>
          </button>

          {/* KakaoNavi Button */}
          <button
            onTouchStart={(e) => startLongPress('kakao', e)}
            onTouchEnd={cancelLongPress}
            onTouchMove={checkTouchMove}
            onMouseDown={(e) => startLongPress('kakao', e)}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => handleNaviClick('kakao')}
            className={`w-9 h-9 rounded-full bg-[#FEE500] border border-amber-300 text-[#3C1E1E] font-black text-sm shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer select-none [-webkit-touch-callout:none] ${profile.defaultNavi === 'kakao'
                ? 'ring-2 ring-amber-400 scale-105 shadow-[0_4px_12px_rgba(254,229,0,0.35)] z-10'
                : 'opacity-60 hover:opacity-100'
              }`}
            title="카카오내비 선택 (길게 누르면 앱 실행)"
            aria-label="카카오내비 선택"
          >
            <span>K</span>
          </button>

          {/* NaverMap Button */}
          <button
            onTouchStart={(e) => startLongPress('naver', e)}
            onTouchEnd={cancelLongPress}
            onTouchMove={checkTouchMove}
            onMouseDown={(e) => startLongPress('naver', e)}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => handleNaviClick('naver')}
            className={`w-9 h-9 rounded-full bg-[#03C75A] border border-emerald-400 text-white font-black text-sm shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer select-none [-webkit-touch-callout:none] ${profile.defaultNavi === 'naver'
                ? 'ring-2 ring-emerald-500 scale-105 shadow-[0_4px_12px_rgba(3,199,90,0.35)] z-10'
                : 'opacity-60 hover:opacity-100'
              }`}
            title="네이버지도 선택 (길게 누르면 앱 실행)"
            aria-label="네이버지도 선택"
          >
            <span>N</span>
          </button>

          {/* Admin / Settings Gear Button */}
          {onOpenAdminModal && (
            <button
              onClick={() => {
                haptics.lightTap();
                onOpenAdminModal();
              }}
              className={`w-9 h-9 rounded-full border shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer ${isAdmin
                  ? 'bg-blue-50 border-blue-300 text-[#1E60F3] ring-2 ring-blue-400'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              title={isAdmin ? '관리자 모드 활성화됨 (설정)' : '관리자 모드 진입 (설정)'}
              aria-label="관리자 모드 설정"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
