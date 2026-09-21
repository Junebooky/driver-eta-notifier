'use client';

import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare, Smartphone, Zap } from 'lucide-react';
import { haptics } from '@/utils/haptics';

const DISMISS_KEY = 'protocol_cockpit_a2hs_dismissed_v1';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const A2HSBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    try {
      // 1. Check if user already dismissed or app is already in standalone mode
      const isDismissed = localStorage.getItem(DISMISS_KEY);
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        Boolean((window.navigator as any).standalone);

      if (isDismissed || isStandalone) {
        setIsVisible(false);
        return;
      }

      setIsVisible(true);

      // 2. Detect iOS Safari
      const isIosDevice =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setIsIOS(isIosDevice);

      // 3. Capture beforeinstallprompt for Android Chrome / Samsung Internet
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    } catch (e) {
      // Ignore local storage error in private browsing
    }
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.lightTap();
    setIsVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch (err) {
      // Ignore
    }
  };

  const handleInstallClick = async () => {
    haptics.lightTap();

    if (deferredPrompt) {
      // Android Chrome / Samsung Internet: Launch native install dialog immediately
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsVisible(false);
          localStorage.setItem(DISMISS_KEY, 'true');
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('Native install prompt error:', err);
      }
    } else if (isIOS) {
      // iOS Safari: Open 2-step visual guidance modal
      setShowIOSModal(true);
    } else {
      // Fallback for browsers without beforeinstallprompt support
      setShowIOSModal(true);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Streamlined One-Touch Install Banner */}
      <aside
        aria-label="홈 화면 앱 설치 안내"
        className="w-full bg-gradient-to-r from-blue-600 via-[#1E60F3] to-indigo-600 text-white px-3.5 py-2.5 flex items-center justify-between shadow-sm select-none animate-fade-in"
      >
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex items-center space-x-2.5 min-w-0 flex-1 text-left cursor-pointer active:opacity-90 group"
        >
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0 text-xs shadow-2xs group-hover:scale-105 transition-transform">
            <Zap className="w-4 h-4 fill-white text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black tracking-tight truncate flex items-center gap-1.5">
              <span>⚡️ 터치하여 전용 앱으로 추가</span>
              <span className="text-[10px] bg-white/25 text-white font-extrabold px-1.5 py-0.2 rounded-full shrink-0">
                원터치
              </span>
            </p>
            <p className="text-[10px] text-blue-100/90 font-medium truncate">
              {isIOS ? '사파리 공유 메뉴를 통해 1초 만에 추가' : '상단 주소창 없는 전체화면 관제 앱 실행'}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/25 text-white/80 hover:text-white flex items-center justify-center ml-2 shrink-0 active:scale-90 transition-transform cursor-pointer"
          title="배너 닫기"
          aria-label="배너 닫기"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </aside>

      {/* iOS Safari / Fallback 2-Step Visual Guidance Modal */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in touch-none"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-2xl text-slate-900 animate-in zoom-in-95 duration-200 border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3.5">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center font-bold">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">홈 화면에 앱 추가하기</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-transform"
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2-Step Action Guidance */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start space-x-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-[#1E60F3] font-black flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <div className="leading-snug">
                  <p className="font-bold text-slate-800 flex items-center gap-1">
                    하단 바의 <Share className="w-3.5 h-3.5 text-[#1E60F3] inline" /> <span className="text-[#1E60F3] font-black">공유 버튼</span> 터치
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
                    사파리 브라우저 화면 맨 하단 중앙의 네모 위 화살표 아이콘을 누릅니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-[#1E60F3] font-black flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <div className="leading-snug">
                  <p className="font-bold text-slate-800 flex items-center gap-1">
                    <PlusSquare className="w-3.5 h-3.5 text-[#1E60F3] inline" /> <span className="text-[#1E60F3] font-black">‘홈 화면에 추가’</span> 선택
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
                    공유 메뉴를 아래로 내려 ‘홈 화면에 추가’를 누르고 우측 상단 [추가]를 터치하세요.
                  </p>
                </div>
              </div>
            </div>

            {/* Confirm / Dismiss Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setShowIOSModal(false);
              }}
              className="w-full mt-4 py-3 bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-black rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-transform cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
};
