'use client';

import React, { useState, useEffect } from 'react';
import { Smartphone, X, PlusSquare } from 'lucide-react';
import { haptics } from '@/utils/haptics';

const DISMISS_KEY = 'protocol_cockpit_a2hs_dismissed_v1';

export const A2HSBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const isDismissed = localStorage.getItem(DISMISS_KEY);
      // Only show on standalone mode false and not dismissed
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      if (!isDismissed && !isStandalone) {
        setIsVisible(true);
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  const handleDismiss = () => {
    haptics.lightTap();
    setIsVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch (e) {
      // Ignore
    }
  };

  if (!isVisible) return null;

  return (
    <div className="w-full bg-gradient-to-r from-blue-950/80 to-indigo-950/80 border-b border-blue-500/30 px-3.5 py-2.5 flex items-center justify-between shadow-md">
      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
        <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 shrink-0">
          <PlusSquare className="w-4 h-4" />
        </div>
        <p className="text-[11px] font-semibold text-zinc-200 leading-tight truncate">
          <span className="font-extrabold text-blue-300">홈 화면에 추가</span>하여 브라우저 틀 없는 전용 관제 앱으로 사용하세요
        </p>
      </div>

      <button
        onClick={handleDismiss}
        className="w-6 h-6 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white flex items-center justify-center ml-2 shrink-0"
        aria-label="닫기"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
