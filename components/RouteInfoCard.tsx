'use client';

import React from 'react';
import { LocationPreset, RouteEstimate } from '@/types';
import { Navigation, Compass, AlertTriangle, RefreshCw, Clock, MapPin } from 'lucide-react';

interface RouteInfoCardProps {
  origin: LocationPreset;
  destination: LocationPreset;
  routeEstimate: RouteEstimate | null;
  isLoadingRoute: boolean;
  isLocating: boolean;
  isUndergroundFallback: boolean;
  gpsErrorMsg: string | null;
  onRequestGps: () => void;
  onRefreshRoute: () => void;
}

export const RouteInfoCard: React.FC<RouteInfoCardProps> = ({
  origin,
  destination,
  routeEstimate,
  isLoadingRoute,
  isLocating,
  isUndergroundFallback,
  gpsErrorMsg,
  onRequestGps,
  onRefreshRoute,
}) => {
  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-md space-y-3">
      {/* Origin -> Destination Bar */}
      <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">출발지</span>
            <span className="text-xs font-bold text-zinc-200 truncate">{origin.shortName}</span>
          </div>
        </div>

        <div className="px-2 text-zinc-600 font-bold">→</div>

        <div className="flex items-center space-x-2 flex-1 min-w-0 justify-end text-right">
          <div className="flex flex-col min-w-0 items-end">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">목적지</span>
            <span className="text-xs font-bold text-blue-400 truncate">{destination.shortName}</span>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
        </div>
      </div>

      {/* Underground Parking / GPS Status Notice */}
      {isUndergroundFallback && (
        <div className="flex items-start space-x-2 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-amber-300 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] leading-tight">
            <span className="font-bold block text-amber-200">지하 주차장 GPS 수신 음영 감지</span>
            <span>{gpsErrorMsg || 'GPS 대신 최근 선택 거점을 출발지로 자동 대체했습니다.'}</span>
          </div>
        </div>
      )}

      {/* Route & ETA Display Card */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-950/40 to-indigo-950/40 p-3.5 rounded-xl border border-blue-900/40">
        <div>
          <div className="flex items-center space-x-1.5 text-xs text-blue-300 font-medium">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>예상 소요 시간 / ETA</span>
          </div>
          <div className="text-xl font-black text-white mt-1 tracking-tight">
            {isLoadingRoute ? (
              <span className="text-zinc-500 text-sm animate-pulse">실시간 경로 계산 중...</span>
            ) : (
              routeEstimate?.etaFormatted || '약 70분 소요'
            )}
          </div>
          {routeEstimate && (
            <div className="text-[11px] text-zinc-400 mt-0.5">
              이동 거리: <span className="text-zinc-200 font-semibold">{routeEstimate.distanceKm} km</span> ({routeEstimate.trafficSummary})
            </div>
          )}
        </div>

        {/* Refresh & GPS Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onRequestGps}
            disabled={isLocating}
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white transition-all active:scale-95 disabled:opacity-50"
            title="GPS 현재 위치 조회"
          >
            <Compass className={`w-4 h-4 ${isLocating ? 'animate-spin text-blue-400' : ''}`} />
          </button>
          <button
            onClick={onRefreshRoute}
            disabled={isLoadingRoute}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md active:scale-95 disabled:opacity-50"
            title="ETA 재계산"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingRoute ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
