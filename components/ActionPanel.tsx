'use client';

import React from 'react';
import { NaviProvider, LocationPreset } from '@/types';
import { launchNavigationApp } from '@/utils/navigation';
import { shareViaKakaoTalk } from '@/utils/kakao';
import { Zap, Share2, Navigation } from 'lucide-react';

interface ActionPanelProps {
  defaultNavi: NaviProvider;
  destination: LocationPreset;
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
  destination,
  reportText,
  onShowToast,
}) => {
  /**
   * 1-Second Fast Pass Action (Synchronous Clipboard Copy on Safari User Activation + Navi Launch)
   */
  const handleFastPassAction = () => {
    // 1. TOP-LEVEL SYNCHRONOUS CLIPBOARD COPY (Mandatory for Safari User Gesture Security)
    let copySuccess = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportText);
        copySuccess = true;
      } else {
        // Fallback for older WebViews
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
   * KakaoTalk Share Card Popup Action
   */
  const handleKakaoShareAction = async () => {
    onShowToast('카카오톡 전송 창을 호출하는 중...');
    const shared = await shareViaKakaoTalk(reportText, 'VIP 의전 업무 보고');
    if (!shared) {
      // If SDK or Web Share fails, copy to clipboard as fallback
      try {
        await navigator.clipboard.writeText(reportText);
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
        className="w-full py-4 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-600 active:scale-[0.98] text-white rounded-2xl font-black text-base tracking-tight shadow-xl shadow-blue-900/50 flex items-center justify-center space-x-2 border border-blue-400/30 transition-all group"
      >
        <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300 animate-bounce" />
        <span>1초 패스트패스 (보고복사 + {NAVI_DISPLAY_NAMES[defaultNavi]} 직행)</span>
        <Navigation className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* KakaoTalk Share Secondary Button */}
      <button
        onClick={handleKakaoShareAction}
        className="w-full py-3.5 px-4 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-amber-950 rounded-2xl font-extrabold text-sm tracking-tight shadow-lg shadow-amber-900/20 flex items-center justify-center space-x-2 border border-amber-300 transition-all"
      >
        <Share2 className="w-4 h-4 text-amber-950" />
        <span>카카오톡 단톡방 보고 공유</span>
      </button>
    </div>
  );
};
