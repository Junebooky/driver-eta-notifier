'use client';

import React, { useState, useRef } from 'react';
import { NaviProvider, LocationPreset, RouteEstimate, DriverProfile } from '@/types';
import { launchNavigationApp, calculateHaversineEstimate } from '@/utils/navigation';
import { generateVipReportText, copyAndLaunchKakaoTalk } from '@/utils/kakao';
import { Zap, Navigation, X } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ActionPanelProps {
  defaultNavi: NaviProvider;
  origin: LocationPreset;
  destination: LocationPreset;
  waypoints?: LocationPreset[];
  waypoint?: LocationPreset | null;
  adminWaypoints?: LocationPreset[];
  isAdminRoute?: boolean;
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
  waypoints,
  waypoint,
  adminWaypoints = [],
  isAdminRoute = false,
  routeEstimate,
  reportText,
  targetChatRoom,
}) => {
  const [isTmapAssistOpen, setIsTmapAssistOpen] = useState(false);
  const [copiedWpIndex, setCopiedWpIndex] = useState<number | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Active waypoints resolution
  const activeWaypointsList: LocationPreset[] = isAdminRoute
    ? [
        { ...origin, name: origin.shortName || origin.name },
        ...(adminWaypoints || []).map((w) => ({ ...w, name: w.shortName || w.name })),
      ]
    : (waypoints && waypoints.length > 0 ? waypoints : (waypoint ? [waypoint] : []));

  const targetNavi = {
    name: destination.name,
    lat: destination.lat,
    lng: destination.lng,
  };

  const naviWaypoints = activeWaypointsList.slice(0, 5).map((w) => ({
    name: w.shortName || w.name,
    lat: w.lat,
    lng: w.lng,
    address: w.address,
  }));

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

    // 2. Multi-waypoint TMAP check: TMAP cannot receive external waypoints via deep link
    if (activeWaypointsList.length > 0 && defaultNavi === 'tmap') {
      setIsTmapAssistOpen(true);
      return;
    }

    // 3. Direct launch for Naver, Kakao, or Tmap without waypoints
    launchNavigationApp(
      defaultNavi,
      targetNavi,
      undefined, // Start navigation directly from driver's smartphone GPS
      naviWaypoints
    );
  };

  /**
   * Copy specific waypoint address with 2-second checkmark feedback
   */
  const handleCopyWaypoint = (text: string, index: number) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
    haptics.lightTap();
    setCopiedWpIndex(index);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      setCopiedWpIndex(null);
    }, 2000);
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
        className="w-full py-4 px-4 bg-[#1E60F3] hover:bg-[#1346D8] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.97] active:bg-[#0f3bb8] text-white rounded-2xl font-bold text-base tracking-tight shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ease-out"
      >
        <Zap className="w-4.5 h-4.5 text-yellow-300 fill-yellow-300 shrink-0" />
        <span>{getNaviActionText(defaultNavi)}</span>
      </button>

      {/* KakaoTalk Pure Text Copy & App Launch Button (Centered) */}
      <button
        onClick={handleKakaoReportAction}
        className="w-full py-4 px-4 bg-[#FEE500] hover:bg-[#FDD835] hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97] text-[#191919] rounded-2xl font-bold text-base tracking-tight shadow-[0_4px_14px_rgba(254,229,0,0.25)] flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ease-out"
      >
        {/* Authentic Kakao Speech Bubble Icon */}
        <svg className="w-4.5 h-4.5 fill-[#191919] shrink-0" viewBox="0 0 24 24">
          <path d="M12 3c-5.523 0-10 3.582-10 8 0 2.853 1.879 5.364 4.707 6.744l-.961 3.541c-.085.312.246.577.525.418l4.24-2.42c.484.06 1.002.097 1.489.097 5.523 0 10-3.582 10-8s-4.477-8-10-8z" />
        </svg>
        <span>카카오톡 공유</span>
      </button>

      {/* Tmap Smart Assist Bottom Sheet / Modal */}
      {isTmapAssistOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 select-none overscroll-contain"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          onClick={() => setIsTmapAssistOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[85dvh] animate-in slide-in-from-bottom-6 duration-300"
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                  <Navigation className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    티맵 경유지 스마트 어시스트
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    경유지 {activeWaypointsList.length}곳이 등록된 코스입니다
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setIsTmapAssistOpen(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[85dvh] flex-1 text-slate-800 overscroll-contain touch-pan-y">
              {/* 영역 A: 원터치 자동 전환 권장 */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-[#1E60F3] flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="w-3 h-3 fill-[#1E60F3]" />
                  </div>
                  <div className="text-xs text-slate-700 font-medium leading-relaxed">
                    <span className="font-bold text-slate-900">네이버 지도</span> 또는 <span className="font-bold text-slate-900">카카오내비</span>로 열면 모든 경유지가 <strong className="text-[#1E60F3]">자동으로 입력</strong>됩니다.
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.mediumTap();
                      setIsTmapAssistOpen(false);
                      launchNavigationApp('naver', targetNavi, undefined, naviWaypoints);
                    }}
                    className="py-3 px-2.5 bg-[#03C75A] hover:bg-[#02b350] active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                  >
                    <span>네이버 지도로 자동 연결</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.mediumTap();
                      setIsTmapAssistOpen(false);
                      launchNavigationApp('kakao', targetNavi, undefined, naviWaypoints);
                    }}
                    className="py-3 px-2.5 bg-[#FEE500] hover:bg-[#FDD835] active:scale-98 text-[#191919] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                  >
                    <span>카카오내비로 자동 연결</span>
                  </button>
                </div>
              </div>

              {/* 영역 B: 티맵 주소 개별 복사 목록 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs font-bold text-slate-700">경유지 주소 복사 (티맵에서 검색 후 추가)</span>
                  <span className="text-[11px] text-slate-400">총 {activeWaypointsList.length}개</span>
                </div>
                <div className="space-y-1.5 max-h-[36vh] overflow-y-auto pr-0.5">
                  {activeWaypointsList.map((wp, idx) => {
                    const addressToCopy = wp.address || wp.name;
                    const isCopied = copiedWpIndex === idx;
                    return (
                      <div
                        key={wp.id || `tmap_wp_${idx}`}
                        className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition-colors"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                              경유지 {idx + 1}
                            </span>
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {wp.shortName || wp.name}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate" title={addressToCopy}>
                            {addressToCopy}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyWaypoint(addressToCopy, idx)}
                          className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition-all shrink-0 cursor-pointer"
                          title="주소 복사"
                          aria-label={`경유지 ${idx + 1} 주소 복사`}
                        >
                          {isCopied ? (
                            <span className="text-xs font-bold text-emerald-600 leading-none">✓</span>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 영역 C: 티맵 목적지 실행부 */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    haptics.successPulse();
                    setIsTmapAssistOpen(false);
                    launchNavigationApp('tmap', targetNavi, undefined, []);
                  }}
                  className="w-full py-3.5 px-4 bg-[#1E60F3] hover:bg-[#1346D8] active:scale-98 text-white rounded-2xl font-bold text-sm tracking-tight shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300 shrink-0" />
                  <span>티맵 목적지 안내 시작</span>
                </button>
                <p className="text-center text-[11px] text-slate-400 mt-2">
                  티맵 실행 후 상단에서 복사한 경유지를 직접 추가해 주세요
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
