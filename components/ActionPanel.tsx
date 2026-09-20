'use client';

import React from 'react';
import { NaviProvider, LocationPreset, RouteEstimate } from '@/types';
import { launchNavigationApp, calculateHaversineEstimate } from '@/utils/navigation';
import { generateVipReportText, copyAndLaunchKakaoTalk } from '@/utils/kakao';
import { Zap, MessageSquare, ArrowRight } from 'lucide-react';
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

    const copied = await copyAndLaunchKakaoTalk(reportText);

    const targetRoomLabel = targetChatRoom ? `[${targetChatRoom}]` : '[지정된 단톡방]';
    if (copied) {
      onShowToast(`📋 복사 완료! ${targetRoomLabel}에 바로 붙여넣기 하세요.`);
    } else {
      onShowToast(`카카오톡을 실행합니다. (${targetRoomLabel}에 붙여넣기)`);
    }
  };

  return (
    <div className="w-full space-y-2.5 pt-1 select-none">
      {/* 1-Second Fast Pass Primary Button */}
      <button
        onClick={handleFastPassAction}
        className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-blue-600 active:scale-95 transition-all duration-150 text-white rounded-2xl font-bold text-sm tracking-tight shadow-[0_8px_25px_rgba(30,96,243,0.25)] flex items-center justify-between cursor-pointer group"
      >
        <div className="flex items-center space-x-2">
          <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300 shrink-0" />
          <span>1초 패스트패스 (보고복사 + {NAVI_DISPLAY_NAMES[defaultNavi]} 실행)</span>
        </div>
        <ArrowRight className="w-4.5 h-4.5 text-white/90 group-hover:translate-x-0.5 transition-transform shrink-0" />
      </button>

      {/* KakaoTalk Pure Text Copy & App Launch Button */}
      <button
        onClick={handleKakaoReportAction}
        className="w-full py-4 px-4 bg-[#FEE500] hover:bg-[#FDD835] active:scale-95 transition-all duration-150 text-[#191919] rounded-2xl font-bold text-sm tracking-tight shadow-[0_4px_14px_rgba(254,229,0,0.25)] flex items-center justify-between cursor-pointer group"
      >
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 text-[#3C1E1E] fill-[#3C1E1E] shrink-0" />
          <span className="text-[#191919]">카카오톡 단톡방 보고 (텍스트 복사 + 앱 실행)</span>
        </div>
        <ArrowRight className="w-4.5 h-4.5 text-[#3C1E1E]/80 group-hover:translate-x-0.5 transition-transform shrink-0" />
      </button>
    </div>
  );
};
