'use client';

import React from 'react';
import { RouteEstimate } from '@/types';
import { Compass, AlertTriangle, RefreshCw, Clock, WifiOff, ShieldCheck } from 'lucide-react';
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
  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2 select-none">
      {/* Underground Parking / GPS Status Notice */}
      {isUndergroundFallback && (
        <div className="flex items-start space-x-2 bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-amber-800 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] leading-tight">
            <span className="font-bold block text-amber-900">지하 주차장 GPS 수신 음영 감지</span>
            <span>{gpsErrorMsg || 'GPS 대신 최근 선택 거점을 출발지로 자동 대체했습니다.'}</span>
          </div>
        </div>
      )}

      {/* Route & ETA Display Card */}
      <div className="flex items-center justify-between bg-slate-50/90 border border-slate-200/80 p-3.5 rounded-xl">
        <div>
          <div className="flex items-center space-x-1.5 text-xs text-slate-600 font-bold">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>예상 소요 시간 / ETA</span>

            {/* Network Fallback Badge */}
            {routeEstimate?.isFallback && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                <WifiOff className="w-3 h-3 mr-1" />
                {routeEstimate.fallbackNotice || '네트워크 지연으로 추정 소요시간 표시 중'}
              </span>
            )}

            {/* Quota Defense Cache Badge */}
            {routeEstimate?.isCached && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <ShieldCheck className="w-3 h-3 mr-1" />
                쿼터 캐시(3분)
              </span>
            )}
          </div>

          <div className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            {isLoadingRoute ? (
              <span className="text-slate-400 text-sm animate-pulse">실시간 경로 계산 중...</span>
            ) : (
              routeEstimate?.etaFormatted || '약 70분 소요'
            )}
          </div>
          {routeEstimate && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              이동 거리: <span className="text-slate-800 font-bold">{routeEstimate.distanceKm} km</span> ({routeEstimate.trafficSummary})
            </div>
          )}
        </div>

        {/* Refresh & GPS Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onRequestGps();
            }}
            disabled={isLocating}
            className="p-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 shadow-xs transition-transform duration-100 active:scale-95 disabled:opacity-50 cursor-pointer"
            title="GPS 현재 위치를 출발지로 설정"
          >
            <Compass className={`w-4 h-4 ${isLocating ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onRefreshRoute();
            }}
            disabled={isLoadingRoute}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition-transform duration-100 active:scale-95 disabled:opacity-50 cursor-pointer"
            title="ETA 재계산"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingRoute ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
