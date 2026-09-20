'use client';

import React from 'react';
import { NaviProvider, LocationPreset, RouteEstimate } from '@/types';
import { launchNavigationApp } from '@/utils/navigation';
import { generateVipReportText, copyAndLaunchKakaoTalk } from '@/utils/kakao';
import { Zap, MessageSquare, Navigation } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ActionPanelProps {
  defaultNavi: NaviProvider;
  origin: LocationPreset;
  destination: LocationPreset;
  routeEstimate: RouteEstimate | null;
  reportText: string;
  onShowToast: (message: string) => void;
}

const NAVI_DISPLAY_NAMES: Record<NaviProvider, string> = {
  tmap: '티맵 (TMAP)',
  kakao: '카카오내비',
  naver: '네이버지도',
};

export const ActionPanel: React.FC<ActionPanelProps> = ({
  defaultNavi,
  origin,
  destination,
  routeEstimate,
  reportText,
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
      onShowToast(`📋 보고문구 복사 완료! [${NAVI_DISPLAY_NAMES[defaultNavi]}] 실행 중...`);
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

    const formattedVipText = generateVipReportText({
      destinationName: destination.shortName,
      originName: origin.shortName,
      distanceKm: routeEstimate?.distanceKm || 62.4,
      durationMinutes: routeEstimate?.durationMinutes || 70,
      etaFormatted: routeEstimate?.etaFormatted || '약 70분 소요',
    });

    const copied = await copyAndLaunchKakaoTalk(formattedVipText);

    if (copied) {
      onShowToast('📋 보고 문구 복사 완료! 카카오톡을 실행합니다.');
    } else {
      onShowToast('카카오톡을 실행합니다. (복사 실패 시 재시도)');
    }
  };

  return (
    <div className="w-full space-y-3 pt-1 select-none">
      {/* 1-Second Fast Pass Primary Button */}
      <button
        onClick={handleFastPassAction}
        className="w-full py-4 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 active:scale-95 transition-transform duration-100 text-white rounded-2xl font-black text-base tracking-tight shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2 border border-blue-500/30 group"
      >
        <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300 animate-bounce" />
        <span>1초 패스트패스 (보고복사 + {NAVI_DISPLAY_NAMES[defaultNavi]} 직행)</span>
        <Navigation className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* KakaoTalk Pure Text Copy & App Launch Button */}
      <button
        onClick={handleKakaoReportAction}
        className="w-full py-3.5 px-4 bg-[#FEE500] hover:bg-[#FDD835] active:scale-95 transition-transform duration-100 text-[#3C1E1E] rounded-2xl font-black text-sm tracking-tight shadow-xs flex items-center justify-center space-x-2 border border-[#E6CF00]"
      >
        <MessageSquare className="w-4 h-4 text-[#3C1E1E] fill-[#3C1E1E]" />
        <span>카카오톡 단톡방 보고 (텍스트 복사 + 앱 실행)</span>
      </button>
    </div>
  );
};
