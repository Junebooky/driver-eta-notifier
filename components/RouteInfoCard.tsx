'use client';

import React from 'react';
import { RouteEstimate } from '@/types';
import { AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface RouteInfoCardProps {
  routeEstimate: RouteEstimate | null;
  isLoadingRoute: boolean;
  isLocating: boolean;
  isUndergroundFallback: boolean;
  gpsErrorMsg: string | null;
  onRequestGps: () => void;
  onRefreshRoute: () => void;
}

export const RouteInfoCard: React.FC<RouteInfoCardProps> = ({
  routeEstimate,
  isLoadingRoute,
  isLocating,
  isUndergroundFallback,
  gpsErrorMsg,
  onRequestGps,
  onRefreshRoute,
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
              이동 거리: <span className="text-slate-900 font-bold">{routeEstimate.distanceKm} km</span>{' '}
              <span className="text-slate-600">({routeEstimate.trafficSummary || '실시간 교통 반영 (TMAP)'})</span>
            </div>
          )}
        </div>

        {/* Refresh Button ONLY (No GPS button) */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onRefreshRoute();
          }}
          disabled={isLoadingRoute}
          className="w-11 h-11 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white shadow-[0_4px_14px_rgba(30,96,243,0.3)] flex items-center justify-center active:scale-95 transition-transform duration-100 disabled:opacity-50 cursor-pointer shrink-0"
          title="ETA 재계산"
          aria-label="ETA 재계산"
        >
          <RefreshCw className={`w-5 h-5 ${isLoadingRoute ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
