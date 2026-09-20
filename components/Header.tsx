'use client';

import React from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { Car, ChevronDown } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface HeaderProps {
  profile: DriverProfile;
  onOpenProfileModal: () => void;
  onSelectNavi: (provider: NaviProvider) => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  onOpenProfileModal,
  onSelectNavi,
}) => {
  return (
    <header className="w-full bg-white/95 border-b border-slate-100/90 backdrop-blur pt-[max(env(safe-area-inset-top),1.25rem)] pb-2.5 px-4 sticky top-0 z-30 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Left: Driver / Vehicle Pill Tag */}
        <button
          onClick={() => {
            haptics.lightTap();
            onOpenProfileModal();
          }}
          className="flex items-center space-x-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-xs font-bold text-slate-800 cursor-pointer hover:bg-slate-50 active:scale-95 transition-all"
        >
          <Car className="w-3.5 h-3.5 text-[#1E60F3] fill-[#1E60F3] shrink-0" />
          <span className="font-extrabold">{profile.vehicleNo || '4호차'} • {profile.driverName || '윤태준'}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        </button>

        {/* Right: Circular 36px Navi Switchers (Right Aligned) */}
        <div className="ml-auto flex items-center gap-2">
          {/* TMAP Button (White circular background + Gradient 'T' Logo) */}
          <button
            onClick={() => {
              haptics.lightTap();
              onSelectNavi('tmap');
            }}
            className={`w-9 h-9 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer ${
              profile.defaultNavi === 'tmap'
                ? 'ring-2 ring-[#1E60F3] scale-105 shadow-[0_4px_12px_rgba(30,96,243,0.25)] z-10'
                : 'opacity-60 hover:opacity-100'
            }`}
            title="티맵 (TMAP) 선택"
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
            onClick={() => {
              haptics.lightTap();
              onSelectNavi('kakao');
            }}
            className={`w-9 h-9 rounded-full bg-[#FEE500] border border-amber-300 text-[#3C1E1E] font-black text-xs shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer ${
              profile.defaultNavi === 'kakao'
                ? 'ring-2 ring-amber-400 scale-105 shadow-[0_4px_12px_rgba(254,229,0,0.35)] z-10'
                : 'opacity-60 hover:opacity-100'
            }`}
            title="카카오내비 선택"
            aria-label="카카오내비 선택"
          >
            <span>K</span>
          </button>

          {/* NaverMap Button */}
          <button
            onClick={() => {
              haptics.lightTap();
              onSelectNavi('naver');
            }}
            className={`w-9 h-9 rounded-full bg-[#A7F3D0] border border-emerald-300 text-emerald-800 font-black text-xs shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer ${
              profile.defaultNavi === 'naver'
                ? 'ring-2 ring-emerald-500 scale-105 shadow-[0_4px_12px_rgba(16,185,129,0.25)] z-10'
                : 'opacity-60 hover:opacity-100'
            }`}
            title="네이버지도 선택"
            aria-label="네이버지도 선택"
          >
            <span>N</span>
          </button>
        </div>
      </div>
    </header>
  );
};
