'use client';

import React from 'react';
import { NaviProvider, LocationPreset, RouteEstimate, DriverProfile } from '@/types';
import { launchNavigationApp, calculateHaversineEstimate } from '@/utils/navigation';
import { generateVipReportText, copyAndLaunchKakaoTalk } from '@/utils/kakao';
import { Zap, MessageSquare } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ActionPanelProps {
  defaultNavi: NaviProvider;
  origin: LocationPreset;
  destination: LocationPreset;
  routeEstimate: RouteEstimate | null;
  reportText: string;
  targetChatRoom?: string;
  profile?: DriverProfile;
}

const NAVI_DISPLAY_NAMES: Record<NaviProvider, string> = {
  tmap: '티맵',
  kakao: '카카오내비',
  naver: '네이버지도',
};

const getNaviActionText = (provider: NaviProvider) => {
  switch (provider) {
    case 'kakao':
      return '카카오내비 안내 시작';
    case 'naver':
      return '네이버지도 안내 시작';
    case 'tmap':
    default:
      return '티맵 안내 시작';
  }
};

export const ActionPanel: React.FC<ActionPanelProps> = ({
  defaultNavi,
  origin,
  destination,
  routeEstimate,
  reportText,
  targetChatRoom,
}) => {
  /**
   * 1-Second Fast Pass Action (Synchronous Clipboard Copy on Safari User Activation + Navi Launch + Haptics)
   */
  const handleFastPassAction = () => {
    // Confirmation pulse haptic feedback for primary fast pass action
    haptics.successPulse();

    // 1. TOP-LEVEL SYNCHRONOUS CLIPBOARD COPY (Mandatory for Safari User Gesture Security)
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = reportText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }

    // 2. Launch Selected Navigation Deep Link (Alt A: Immediate GPS Turn-by-Turn, Destination only)
    launchNavigationApp(defaultNavi, {
      name: destination.name,
      lat: destination.lat,
      lng: destination.lng,
    });
  };

  /**
   * Pure Text Copy & KakaoTalk App Launch Pipeline
   * Copies formatted text and immediately invokes kakaotalk:// URL scheme
   */
  const handleKakaoReportAction = async () => {
    haptics.lightTap();

    await copyAndLaunchKakaoTalk(reportText);
  };

  return (
    <div className="w-full space-y-2.5 pt-1 pb-[max(env(safe-area-inset-bottom),16px)] select-none">
      {/* Navigation Primary Action Button (Centered) */}
      <button
        onClick={handleFastPassAction}
        className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-[#1346D8] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.97] active:bg-[#0f3bb8] text-white rounded-2xl font-bold text-sm tracking-tight shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ease-out"
      >
        <Zap className="w-4.5 h-4.5 text-yellow-300 fill-yellow-300 shrink-0" />
        <span>{getNaviActionText(defaultNavi)}</span>
      </button>

      {/* KakaoTalk Pure Text Copy & App Launch Button (Centered) */}
      <button
        onClick={handleKakaoReportAction}
        className="w-full py-4 px-4 bg-[#FEE500] hover:bg-[#FDD835] hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97] text-[#191919] rounded-2xl font-bold text-sm tracking-tight shadow-[0_4px_14px_rgba(254,229,0,0.25)] flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ease-out"
      >
        <MessageSquare className="w-4.5 h-4.5 text-[#3C1E1E] fill-[#3C1E1E] shrink-0" />
        <span>카카오톡 공유</span>
      </button>
    </div>
  );
};
