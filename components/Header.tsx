'use client';

import React from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { Settings, Navigation, Shield, Car } from 'lucide-react';

interface HeaderProps {
  profile: DriverProfile;
  onOpenProfileModal: () => void;
  onSelectNavi: (provider: NaviProvider) => void;
}

const NAVI_LABELS: Record<NaviProvider, { name: string; color: string; badge: string }> = {
  tmap: { name: '티맵 (TMAP)', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', badge: 'TMAP' },
  kakao: { name: '카카오내비', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', badge: 'KAKAO' },
  naver: { name: '네이버지도', color: 'bg-green-500/20 text-green-400 border-green-500/40', badge: 'NAVER' },
};

export const Header: React.FC<HeaderProps> = ({ profile, onOpenProfileModal, onSelectNavi }) => {
  return (
    <header className="w-full bg-zinc-900/90 border-b border-zinc-800 backdrop-blur px-4 py-3 sticky top-0 z-30 shadow-lg">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Left: Brand Logo & Vehicle Info */}
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold shadow-inner">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-sm tracking-wide text-zinc-100 uppercase">PROTOCOL COCKPIT</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                VIP
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-zinc-400 font-medium mt-0.5">
              <span className="flex items-center text-zinc-200 font-semibold bg-zinc-800 px-1.5 py-0.2 rounded border border-zinc-700">
                <Car className="w-3 h-3 mr-1 text-blue-400" />
                {profile.vehicleNo}
              </span>
              <span className="text-zinc-300">{profile.driverName} 기사</span>
            </div>
          </div>
        </div>

        {/* Right: Quick Navi Switcher & Settings */}
        <div className="flex items-center space-x-2">
          {/* Quick Navi Switcher Toggle */}
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            {(['tmap', 'kakao', 'naver'] as NaviProvider[]).map((prov) => {
              const isSelected = profile.defaultNavi === prov;
              return (
                <button
                  key={prov}
                  onClick={() => onSelectNavi(prov)}
                  className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${
                    isSelected
                      ? NAVI_LABELS[prov].color + ' border shadow-sm scale-105'
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
            onClick={onOpenProfileModal}
            className="w-9 h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white transition-colors active:scale-95"
            aria-label="기사 프로필 설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
