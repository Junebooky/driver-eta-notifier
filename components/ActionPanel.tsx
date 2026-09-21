'use client';

import React from 'react';
import { NaviProvider, LocationPreset, RouteEstimate } from '@/types';
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
  onShowToast: (message: string) => void;
}

const NAVI_DISPLAY_NAMES: Record<NaviProvider, string> = {
  tmap: '티맵',
  kakao: '카카오내비',
  naver: '네이버지도',
};

const getNaviActionText = (provider: NaviProvider) => {
  switch (provider) {
    case 'kakao':
      return '카카오내비 안내 시작 (ETA 자동복사)';
    case 'naver':
      return '네이버지도 안내 시작 (ETA 자동복사)';
    case 'tmap':
    default:
      return '티맵 안내 시작 (ETA 자동복사)';
  }
};

export const ActionPanel: React.FC<ActionPanelProps> = ({
  defaultNavi,
  origin,
  destination,
  routeEstimate,
  reportText,
  targetChatRoom,
  onShowToast,
}) => {
  /**
   * 1-Second Fast Pass Action (Synchronous Clipboard Copy on Safari User Activation + Navi Launch + Haptics)
   */
  const handleFastPassAction = () => {
    // Confirmation pulse haptic feedback for primary fast pass action
    haptics.successPulse();

    // 1. TOP-LEVEL SYNCHRONOUS CLIPBOARD COPY (Mandatory for Safari User Gesture Security)
    let copySuccess = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportText);
        copySuccess = true;
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = reportText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        copySuccess = true;
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }

    // 2. Immediate Toast Feedback
    if (copySuccess) {
      onShowToast(`📋 ETA 복사 완료! [${NAVI_DISPLAY_NAMES[defaultNavi]}] 실행 중...`);
    } else {
      onShowToast(`[${NAVI_DISPLAY_NAMES[defaultNavi]}] 앱 실행 중...`);
    }

    // 3. Launch Selected Navigation Deep Link sequentially
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

    const copied = await copyAndLaunchKakaoTalk(reportText);

    const targetRoomLabel = targetChatRoom ? `[${targetChatRoom}]` : '[VIP 단톡방]';
    if (copied) {
      onShowToast(`📋 ETA 복사 완료! ${targetRoomLabel}에 바로 붙여넣기 하세요.`);
    } else {
      onShowToast(`카카오톡을 실행합니다. (${targetRoomLabel}에 붙여넣기)`);
    }
  };

  return (
    <div className="w-full space-y-2.5 pt-1 select-none">
      {/* Navigation Primary Action Button (Centered) */}
      <button
        onClick={handleFastPassAction}
        className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-blue-600 active:scale-95 transition-all duration-150 text-white rounded-2xl font-bold text-sm tracking-tight shadow-[0_8px_25px_rgba(30,96,243,0.25)] flex items-center justify-center gap-2 cursor-pointer"
      >
        <Zap className="w-4.5 h-4.5 text-yellow-300 fill-yellow-300 shrink-0" />
        <span>{getNaviActionText(defaultNavi)}</span>
      </button>

      {/* KakaoTalk Pure Text Copy & App Launch Button (Centered) */}
      <button
        onClick={handleKakaoReportAction}
        className="w-full py-4 px-4 bg-[#FEE500] hover:bg-[#FDD835] active:scale-95 transition-all duration-150 text-[#191919] rounded-2xl font-bold text-sm tracking-tight shadow-[0_4px_14px_rgba(254,229,0,0.25)] flex items-center justify-center gap-2 cursor-pointer"
      >
        <MessageSquare className="w-4.5 h-4.5 text-[#3C1E1E] fill-[#3C1E1E] shrink-0" />
        <span>카카오톡 공유 (ETA 자동복사)</span>
      </button>
    </div>
  );
};
