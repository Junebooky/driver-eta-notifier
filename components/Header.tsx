'use client';

import React from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { Settings, Shield, Car } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface HeaderProps {
  profile: DriverProfile;
  onOpenProfileModal: () => void;
  onSelectNavi: (provider: NaviProvider) => void;
}

const NAVI_ICONS: Record<
  NaviProvider,
  {
    name: string;
    symbol: string;
    bgColor: string;
    textColor: string;
    activeRing: string;
    borderColor?: string;
  }
> = {
  tmap: {
    name: '티맵 (TMAP)',
    symbol: 'T',
    bgColor: 'bg-[#EF4444]',
    textColor: 'text-white',
    activeRing: 'ring-2 ring-offset-2 ring-red-500 shadow-md shadow-red-500/30 scale-110 font-black',
  },
  kakao: {
    name: '카카오내비',
    symbol: 'K',
    bgColor: 'bg-[#FEE500]',
    textColor: 'text-[#3C1E1E]',
    activeRing: 'ring-2 ring-offset-2 ring-amber-400 shadow-md shadow-amber-500/30 scale-110 font-black',
  },
  naver: {
    name: '네이버지도',
    symbol: 'N',
    bgColor: 'bg-[#03C75A]',
    textColor: 'text-white',
    activeRing: 'ring-2 ring-offset-2 ring-emerald-500 shadow-md shadow-emerald-500/30 scale-110 font-black',
  },
};

export const Header: React.FC<HeaderProps> = ({
  profile,
  onOpenProfileModal,
  onSelectNavi,
}) => {
  return (
    <header className="w-full bg-white/95 border-b border-slate-200 backdrop-blur px-4 py-3 sticky top-0 z-30 shadow-xs">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Left: Brand Logo & Vehicle Info */}
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold shadow-xs">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-sm tracking-wide text-slate-900 uppercase">
                PROTOCOL COCKPIT
              </span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                VIP
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium mt-0.5">
              <span className="flex items-center text-slate-800 font-bold bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                <Car className="w-3 h-3 mr-1 text-blue-600" />
                {profile.vehicleNo}
              </span>
              <span className="text-slate-600">{profile.driverName} 기사</span>
            </div>
          </div>
        </div>

        {/* Right: Circular Navi Quick Switcher & Settings */}
        <div className="flex items-center space-x-3">
          {/* Circular Navigation Icon Switcher */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-full border border-slate-200">
            {(['tmap', 'kakao', 'naver'] as NaviProvider[]).map((prov) => {
              const isSelected = profile.defaultNavi === prov;
              const config = NAVI_ICONS[prov];
              return (
                <button
                  key={prov}
                  onClick={() => {
                    haptics.lightTap();
                    onSelectNavi(prov);
                  }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all duration-100 active:scale-90 ${
                    config.bgColor
                  } ${config.textColor} ${
                    isSelected
                      ? config.activeRing + ' z-10'
                      : 'opacity-40 hover:opacity-80 scale-95 font-bold'
                  }`}
                  title={`${config.name} (선택 시 딥링크 기본 실행)`}
                  aria-label={config.name}
                >
                  <span>{config.symbol}</span>
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
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 active:scale-95 transition-transform duration-100"
            aria-label="기사 프로필 설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
