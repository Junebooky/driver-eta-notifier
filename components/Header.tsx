'use client';

import React from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { Settings, Shield, Car, Moon, Sun } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface HeaderProps {
  profile: DriverProfile;
  onOpenProfileModal: () => void;
  onSelectNavi: (provider: NaviProvider) => void;
  isOledMode?: boolean;
  onToggleOledMode?: () => void;
}

const NAVI_LABELS: Record<NaviProvider, { name: string; color: string; badge: string }> = {
  tmap: { name: '티맵 (TMAP)', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', badge: 'TMAP' },
  kakao: { name: '카카오내비', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', badge: 'KAKAO' },
  naver: { name: '네이버지도', color: 'bg-green-500/20 text-green-400 border-green-500/40', badge: 'NAVER' },
};

export const Header: React.FC<HeaderProps> = ({
  profile,
  onOpenProfileModal,
  onSelectNavi,
  isOledMode = false,
  onToggleOledMode,
}) => {
  return (
    <header
      className={`w-full border-b backdrop-blur px-4 py-3 sticky top-0 z-30 transition-colors ${
        isOledMode
          ? 'bg-black/95 border-zinc-800 shadow-none'
          : 'bg-zinc-900/90 border-zinc-800 shadow-lg'
      }`}
    >
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Left: Brand Logo & Vehicle Info */}
        <div className="flex items-center space-x-2.5">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold shadow-inner ${
              isOledMode
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-400'
                : 'bg-blue-600/30 border-blue-500/50 text-blue-400'
            }`}
          >
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-sm tracking-wide text-white uppercase">
                PROTOCOL COCKPIT
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  isOledMode
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }`}
              >
                VIP
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-zinc-400 font-medium mt-0.5">
              <span className="flex items-center text-zinc-200 font-semibold bg-zinc-850 px-1.5 py-0.2 rounded border border-zinc-700">
                <Car className="w-3 h-3 mr-1 text-cyan-400" />
                {profile.vehicleNo}
              </span>
              <span className="text-zinc-300">{profile.driverName} 기사</span>
            </div>
          </div>
        </div>

        {/* Right: OLED Mode Toggle, Quick Navi Switcher & Settings */}
        <div className="flex items-center space-x-1.5">
          {/* OLED Pure Black Dark Mode Toggle */}
          {onToggleOledMode && (
            <button
              onClick={() => {
                haptics.lightTap();
                onToggleOledMode();
              }}
              className={`p-2 rounded-lg border text-xs font-bold transition-all active:scale-95 flex items-center justify-center ${
                isOledMode
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-900/50'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
              title={isOledMode ? 'OLED 심야 모드 활성화됨 (순수 블랙)' : 'OLED 심야 모드 켜기'}
              aria-label="OLED 심야 모드 토글"
            >
              {isOledMode ? (
                <Moon className="w-4 h-4 text-cyan-300 fill-cyan-300" />
              ) : (
                <Sun className="w-4 h-4 text-zinc-400" />
              )}
            </button>
          )}

          {/* Quick Navi Switcher Toggle */}
          <div className="flex bg-black p-1 rounded-lg border border-zinc-800">
            {(['tmap', 'kakao', 'naver'] as NaviProvider[]).map((prov) => {
              const isSelected = profile.defaultNavi === prov;
              return (
                <button
                  key={prov}
                  onClick={() => {
                    haptics.lightTap();
                    onSelectNavi(prov);
                  }}
                  className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${
                    isSelected
                      ? NAVI_LABELS[prov].color + ' border shadow-sm scale-105 font-extrabold'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title={`${NAVI_LABELS[prov].name} (임시 선택 / 기본 설정)`}
                >
                  {NAVI_LABELS[prov].badge}
                </button>
              );
            })}
          </div>

          {/* Profile Settings Button */}
          <button
            onClick={() => {
              haptics.lightTap();
              onOpenProfileModal();
            }}
            className="w-8 h-8 rounded-lg bg-zinc-850 hover:bg-zinc-750 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white transition-colors active:scale-95"
            aria-label="기사 프로필 설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
