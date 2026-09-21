'use client';

import React from 'react';
import { RouteEstimate } from '@/types';
import { AlertTriangle, RefreshCw, Clock, CalendarClock } from 'lucide-react';
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
  departureTimeText?: string | null;
  isFutureDeparture?: boolean;
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
  departureTimeText,
  isFutureDeparture = false,
}) => {
  // Parse strict 24h time (HH:mm) and duration from etaFormatted or durationMinutes
  let timePart = '14:35';
  let durationPart = '';

  if (routeEstimate?.etaFormatted) {
    const timeMatch = routeEstimate.etaFormatted.match(/(\d{1,2}:\d{2})/);
    if (timeMatch) {
      timePart = timeMatch[1].padStart(5, '0');
    } else {
      timePart = routeEstimate.etaFormatted.replace(/\s*\(.*?\)/, '').trim();
    }
  }

  if (routeEstimate?.durationMinutes) {
    durationPart = `(${routeEstimate.durationMinutes}분 소요)`;
  }

  const hasFuture = isFutureDeparture || Boolean(departureTimeText && departureTimeText !== '지금 출발');

  return (
    <div className="w-full bg-[url('/eta_bg.jpg')] bg-cover bg-center border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] relative overflow-hidden select-none">
      {/* Soft gradient overlay for optimal text contrast & ambient depth */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/85 to-white/40 pointer-events-none" />

      {/* Underground Parking / GPS Status Notice */}
      {isUndergroundFallback && (
        <div className="mb-2.5 flex items-start space-x-2 bg-amber-50/95 border border-amber-200 p-2 rounded-xl text-amber-800 text-xs font-medium relative z-10 backdrop-blur-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] leading-tight">
            <span className="font-bold block text-amber-900">지하 주차장 GPS 수신 음영 감지</span>
            <span>{gpsErrorMsg || 'GPS 대신 최근 선택 거점을 출발지로 자동 대체했습니다.'}</span>
          </div>
        </div>
      )}

      {/* Main ETA Card Content */}
      <div className="flex items-center justify-between relative z-10">
        <div>
          {/* Top Label: Clock Icon + ETA */}
          <div className="flex items-center space-x-1.5">
            <div className="w-4.5 h-4.5 rounded-full bg-[#1E60F3] text-white flex items-center justify-center shrink-0 shadow-[0_2px_6px_rgba(30,96,243,0.3)]">
              <Clock className="w-3 h-3 text-white stroke-[2.5]" />
            </div>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">ETA</span>
          </div>

          {/* Large ETA & Duration display */}
          <div className="mt-1.5 flex items-baseline">
            {isLoadingRoute ? (
              <span className="text-slate-400 text-lg font-bold animate-pulse">실시간 경로 계산 중...</span>
            ) : (
              <>
                <span className="text-3xl font-black text-slate-900 tracking-tight">{timePart}</span>
                {durationPart && (
                  <span className="text-xl font-bold text-slate-900 ml-1.5">{durationPart}</span>
                )}
              </>
            )}
          </div>

          {/* Subtitle: Distance & Traffic provider */}
          {routeEstimate && (
            <div className="text-xs text-slate-500 mt-1 font-normal">
              {hasFuture && departureTimeText && (
                <span className="inline-block mr-1.5 text-[#1E60F3] font-bold">
                  [{departureTimeText}]
                </span>
              )}
              이동 거리: <span className="text-slate-900 font-bold">{routeEstimate.distanceKm} km</span>{' '}
              <span className="text-slate-600">({routeEstimate.trafficSummary || '실시간 교통 반영 (TMAP)'})</span>
            </div>
          )}
        </div>

        {/* Right Actions: Clock/Schedule Icon Button + Refresh Button */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenTimePicker && (
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onOpenTimePicker();
              }}
              className={`relative w-11 h-11 rounded-xl border flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer shadow-xs ${
                hasFuture
                  ? 'bg-blue-50 border-blue-300 text-[#1E60F3] hover:bg-blue-100 shadow-[0_2px_8px_rgba(30,96,243,0.15)]'
                  : 'bg-slate-100/80 border-slate-200/80 text-slate-700 hover:bg-slate-200'
              }`}
              title={hasFuture ? `미래 출발 설정됨: ${departureTimeText || ''}` : '출발 시간 선택 (AI 미래 소요시간 예측)'}
              aria-label="출발 시간 선택"
            >
              <CalendarClock className={`w-5 h-5 ${hasFuture ? 'text-[#1E60F3]' : 'text-slate-600'}`} />
              {hasFuture && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#1E60F3] ring-2 ring-white animate-pulse" />
              )}
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
            className="w-11 h-11 rounded-xl bg-[#1E60F3] hover:bg-[#1346D8] hover:scale-105 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.97] active:bg-[#0f3bb8] text-white shadow-xs flex items-center justify-center transition-all duration-150 ease-out disabled:opacity-50 cursor-pointer shrink-0 group"
            title="ETA 재계산"
            aria-label="ETA 재계산"
          >
            <RefreshCw className={`w-5 h-5 group-hover:rotate-45 transition-transform duration-200 ${isLoadingRoute ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
