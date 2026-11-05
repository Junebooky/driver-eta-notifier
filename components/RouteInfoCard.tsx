'use client';

import React from 'react';
import { RouteEstimate } from '@/types';
import { AlertTriangle, RefreshCw, CalendarClock, MapPin, Coins } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface RouteInfoCardProps {
  routeEstimate: RouteEstimate | null;
  isLoadingRoute: boolean;
  isLocating: boolean;
  isUndergroundFallback: boolean;
  gpsErrorMsg: string | null;
  onRequestGps: () => void;
  onRefreshRoute: () => void;
  onOpenTimePicker?: () => void;
}

export const RouteInfoCard: React.FC<RouteInfoCardProps> = ({
  routeEstimate,
  isLoadingRoute,
  isLocating,
  isUndergroundFallback,
  gpsErrorMsg,
  onRequestGps,
  onRefreshRoute,
  onOpenTimePicker,
}) => {
  // Parse strict 24h time (HH:mm) and duration from etaFormatted or durationMinutes
  let timePart = '--:--';
  let durationPart = '';

  if (routeEstimate?.isUnavailable) {
    timePart = '--:--';
    durationPart = '(조회 불가)';
  } else if (routeEstimate?.etaFormatted) {
    const timeMatch = routeEstimate.etaFormatted.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) {
      timePart = timeMatch[1].padStart(5, '0');
    } else {
      timePart = routeEstimate.etaFormatted.replace(/\s*\(.*?\)/, '').trim();
    }
  }

  if (!routeEstimate?.isUnavailable && routeEstimate?.durationMinutes) {
    durationPart = `(${routeEstimate.durationMinutes}분 소요)`;
  }

  return (
    <div className="w-full bg-white border border-slate-100/90 rounded-3xl p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] relative overflow-hidden select-none">
      {/* Underground Parking / GPS Status Notice */}
      {isUndergroundFallback && (
        <div className="mb-3 flex items-start space-x-2 bg-amber-50/95 border border-amber-200 p-2.5 rounded-2xl text-amber-800 text-sm font-medium relative z-10">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] leading-tight">
            <span className="font-bold block text-amber-900">지하 주차장 GPS 수신 음영 감지</span>
            <span>{gpsErrorMsg || 'GPS 대신 최근 선택 거점을 출발지로 자동 대체했습니다.'}</span>
          </div>
        </div>
      )}

      {/* Main ETA Card Content: Strictly Real-time TMAP Data */}
      <div className="relative z-10">
        {/* Top Row: Left (Clock Icon + ETA + Time) & Right (Action Buttons) */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            {/* Top Label: Clock Icon + ETA */}
            <div className="flex items-center space-x-1.5">
              <img
                src="/images/icons/driver_ui/icon_clock.png"
                alt="ETA 아이콘"
                aria-hidden="true"
                draggable={false}
                className="w-6 h-6 sm:w-6.5 sm:h-6.5 object-contain shrink-0 select-none pointer-events-none"
              />
              <span className="text-sm sm:text-[15px] font-black text-[#0F172A] uppercase tracking-tight">
                ETA
              </span>
            </div>

            {/* Compact 24px ETA & Duration display */}
            <div className="mt-1.5 flex items-baseline flex-nowrap">
              {isLoadingRoute ? (
                <span className="text-slate-400 text-base font-bold animate-pulse">
                  실시간 경로 계산 중...
                </span>
              ) : (
                <>
                  <span className="text-2xl font-black text-[#0F172A] tracking-tight leading-none tabular-nums">
                    {timePart}
                  </span>
                  {durationPart && (
                    <span className="text-base sm:text-[17px] font-extrabold text-[#0F172A] ml-1.5 tracking-tight whitespace-nowrap">
                      {durationPart}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right Actions: Proportionally Sized Horizontal Side-by-Side Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenTimePicker && (
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onOpenTimePicker();
                }}
                className="w-10 h-10 sm:w-10.5 sm:h-10.5 rounded-[14px] bg-white hover:bg-slate-50 border border-slate-100/90 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
                title="출발 시간별 소요 시간 예측 (미래 조회)"
                aria-label="출발 시간 예측"
              >
                <CalendarClock className="w-[18px] h-[18px] text-slate-600 stroke-[1.9]" />
              </button>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onRefreshRoute();
              }}
              disabled={isLoadingRoute}
              className="w-10 h-10 sm:w-10.5 sm:h-10.5 rounded-[14px] bg-[#0055FF] hover:bg-[#0046D5] hover:scale-105 active:scale-[0.97] text-white shadow-[0_5px_14px_rgba(0,85,255,0.28)] flex items-center justify-center transition-all duration-150 ease-out disabled:opacity-50 cursor-pointer shrink-0 group"
              title="ETA 재계산"
              aria-label="경로 새로고침"
            >
              <RefreshCw
                className={`w-[18px] h-[18px] text-white transition-transform duration-500 ${isLoadingRoute ? 'animate-spin' : 'group-hover:rotate-180'
                  }`}
              />
            </button>
          </div>
        </div>

        {/* Subtitle: Real-time Distance & Estimated Toll strictly on a single horizontal row */}
        {routeEstimate && (
          <div className="mt-3.5 space-y-2">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap w-full">
              {/* Distance Pill Card */}
              <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-[#F8FAFC] border border-slate-100/90 shadow-[0_2px_8px_rgba(15,23,42,0.02)] whitespace-nowrap shrink-0">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[2]" />
                <span className="text-[11px] sm:text-xs font-semibold text-slate-500">이동 거리</span>
                <span className="w-px h-3 bg-slate-200 shrink-0" />
                <span className="text-xs sm:text-[13px] font-extrabold text-[#0F172A] tabular-nums">
                  {routeEstimate.isUnavailable ? '-' : `${routeEstimate.distanceKm} km`}
                </span>
              </div>

              {/* Toll Pill Card */}
              {typeof routeEstimate.estimatedTollWon === 'number' && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-[#F8FAFC] border border-slate-100/90 shadow-[0_2px_8px_rgba(15,23,42,0.02)] whitespace-nowrap min-w-0"
                  title="TMAP 1종(승용·소형) 추천 경로 기준 통행료 예상치"
                >
                  <Coins className="w-3.5 h-3.5 text-slate-400 shrink-0 stroke-[2]" />
                  <span className="text-[11px] sm:text-xs font-semibold text-slate-500 shrink-0">예상 통행료</span>
                  <span className="w-px h-3 bg-slate-200 shrink-0" />
                  <span className="text-xs sm:text-[13px] font-extrabold text-[#0F172A] tabular-nums truncate">
                    {routeEstimate.estimatedTollWon > 0 ? (
                      <>
                        ₩{routeEstimate.estimatedTollWon.toLocaleString()}{' '}
                        <span className="text-[10px] sm:text-[11px] font-medium text-slate-500">
                          (1종 예상)
                        </span>
                      </>
                    ) : (
                      '0원 (무료)'
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
