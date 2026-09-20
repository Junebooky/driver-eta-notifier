'use client';

import React from 'react';
import { NaviProvider, LocationPreset, RouteEstimate } from '@/types';
import { launchNavigationApp } from '@/utils/navigation';
import { shareViaKakaoTalk } from '@/utils/kakao';
import { Zap, Share2, Navigation } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ActionPanelProps {
  defaultNavi: NaviProvider;
  origin: LocationPreset;
  destination: LocationPreset;
  routeEstimate: RouteEstimate | null;
  reportText: string;
  onShowToast: (message: string) => void;
  isOledMode?: boolean;
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
  isOledMode = false,
}) => {
  /**
   * 1-Second Fast Pass Action (Synchronous Clipboard Copy on Safari User Activation + Navi Launch + Haptics)
   */
  const handleFastPassAction = () => {
    // Confirmation pulse haptic feedback for primary fast pass action ([30ms, 40ms, 30ms])
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
   * KakaoTalk Share Card Popup Action with 3-tier Fallback
   */
  const handleKakaoShareAction = async () => {
    // Light tap haptic feedback (15ms)
    haptics.lightTap();
    onShowToast('카카오톡 전송 창을 호출하는 중...');

    const shared = await shareViaKakaoTalk({
      destinationName: destination.shortName,
      originName: origin.shortName,
      durationMinutes: routeEstimate?.durationMinutes || 70,
      etaFormatted: routeEstimate?.etaFormatted || '약 70분 소요',
      targetLat: destination.lat,
      targetLng: destination.lng,
      rawText: reportText,
    });

    // Tertiary Fallback: If both Kakao SDK and Web Share API fail/unsupported, copy to clipboard
    if (!shared) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(reportText);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = reportText;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        onShowToast('📋 클립보드 복사 완료! 카카오톡 단톡방에 붙여넣으세요.');
      } catch (e) {
        onShowToast('카카오톡 전송에 실패했습니다.');
      }
    }
  };

  return (
    <div className="w-full space-y-3 pt-1">
      {/* 1-Second Fast Pass Primary Button */}
      <button
        onClick={handleFastPassAction}
        className={`w-full py-4 px-4 active:scale-[0.98] text-white rounded-2xl font-black text-base tracking-tight flex items-center justify-center space-x-2 transition-all group ${
          isOledMode
            ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 border-2 border-cyan-400 shadow-2xl shadow-cyan-950/80 text-white ring-1 ring-cyan-400/50'
            : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 shadow-xl shadow-blue-900/50 border border-blue-400/30'
        }`}
      >
        <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300 animate-bounce" />
        <span>1초 패스트패스 (보고복사 + {NAVI_DISPLAY_NAMES[defaultNavi]} 직행)</span>
        <Navigation className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* KakaoTalk Share Secondary Button */}
      <button
        onClick={handleKakaoShareAction}
        className={`w-full py-3.5 px-4 active:scale-[0.98] rounded-2xl font-extrabold text-sm tracking-tight flex items-center justify-center space-x-2 transition-all ${
          isOledMode
            ? 'bg-amber-400 hover:bg-amber-300 text-black border-2 border-amber-300 shadow-xl shadow-amber-950/60'
            : 'bg-amber-400 hover:bg-amber-300 text-amber-950 border border-amber-300 shadow-lg shadow-amber-900/20'
        }`}
      >
        <Share2 className="w-4 h-4 text-black" />
        <span>카카오톡 단톡방 보고 공유 (VIP 피드)</span>
      </button>
    </div>
  );
};
