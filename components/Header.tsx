'use client';

import React from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { Settings, Car } from 'lucide-react';
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
    <header className="w-full bg-white/95 border-b border-slate-200 backdrop-blur pt-[max(env(safe-area-inset-top),1.25rem)] pb-2.5 px-4 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Left: Minimal Driver / Vehicle Status Tag */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 text-xs text-slate-700 font-bold">
            <Car className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="text-slate-900 font-black">{profile.vehicleNo || '4호차'}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600">{profile.driverName || '기사'}</span>
          </div>
        </div>

        {/* Right: Circular 40~44px Navi Switchers & Settings */}
        <div className="flex items-center space-x-2">
          {/* TMAP Button (Renewed with Official White Background & Magenta-to-Cyan Gradient 'T' Logo) */}
          <button
            onClick={() => {
              haptics.lightTap();
              onSelectNavi('tmap');
            }}
            className={`w-10 h-10 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer ${
              profile.defaultNavi === 'tmap'
                ? 'ring-2 ring-offset-2 ring-blue-600 scale-105 shadow-md z-10'
                : 'opacity-50 hover:opacity-90'
            }`}
            title="티맵 (TMAP) 선택"
            aria-label="티맵 선택"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
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

          {/* KakaoNavi Button (Official Yellow + Dark Brown 'K') */}
          <button
            onClick={() => {
              haptics.lightTap();
              onSelectNavi('kakao');
            }}
            className={`w-10 h-10 rounded-full bg-[#FEE500] border border-amber-300 text-[#3C1E1E] font-black text-sm shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer ${
              profile.defaultNavi === 'kakao'
                ? 'ring-2 ring-offset-2 ring-amber-400 scale-105 shadow-md z-10'
                : 'opacity-50 hover:opacity-90'
            }`}
            title="카카오내비 선택"
            aria-label="카카오내비 선택"
          >
            <span>K</span>
          </button>

          {/* NaverMap Button (Official Green + White 'N') */}
          <button
            onClick={() => {
              haptics.lightTap();
              onSelectNavi('naver');
            }}
            className={`w-10 h-10 rounded-full bg-[#03C75A] border border-emerald-400 text-white font-black text-sm shadow-xs flex items-center justify-center transition-all duration-100 active:scale-90 cursor-pointer ${
              profile.defaultNavi === 'naver'
                ? 'ring-2 ring-offset-2 ring-emerald-500 scale-105 shadow-md z-10'
                : 'opacity-50 hover:opacity-90'
            }`}
            title="네이버지도 선택"
            aria-label="네이버지도 선택"
          >
            <span>N</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={() => {
              haptics.lightTap();
              onOpenProfileModal();
            }}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 active:scale-90 transition-transform duration-100 cursor-pointer ml-1"
            aria-label="기사 프로필 설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
