'use client';

import React from 'react';
import { RouteEstimate } from '@/types';
import { AlertTriangle, RefreshCw, Clock, WifiOff } from 'lucide-react';
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
  // Parse time and duration from etaFormatted (e.g. "02:52 (51분 소요)")
  let timePart = '02:52';
  let durationPart = '(51분 소요)';

  if (routeEstimate?.etaFormatted) {
    const match = routeEstimate.etaFormatted.match(/^(.*?)(\s*\(.*?\))$/);
    if (match) {
      timePart = match[1];
      durationPart = match[2];
    } else {
      timePart = routeEstimate.etaFormatted;
      durationPart = '';
    }
  }

  return (
    <div className="w-full bg-white border border-slate-100/90 rounded-2xl p-4 shadow-2xs relative overflow-hidden select-none">
      {/* Background Highway & Car Illustration */}
      <div className="absolute right-12 top-0 bottom-0 w-48 pointer-events-none flex items-center justify-center opacity-85">
        <svg viewBox="0 0 200 100" className="w-full h-full" preserveAspectRatio="none" fill="none">
          <defs>
            <linearGradient id="roadGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EFF6FF" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#DBEAFE" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="roadRibbon" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#BFDBFE" stopOpacity="0.1" />
              <stop offset="60%" stopColor="#93C5FD" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {/* Curved road surface */}
          <path
            d="M 20 100 C 70 80, 110 40, 190 0 L 200 15 C 130 55, 90 85, 50 100 Z"
            fill="url(#roadGrad)"
          />
          {/* Subtle road side glow */}
          <path
            d="M 15 100 C 65 80, 105 40, 185 0"
            stroke="url(#roadRibbon)"
            strokeWidth="3"
            strokeDasharray="6 4"
          />
          {/* Stylized White Car (Isometric High-Angle) */}
          <g transform="translate(108, 38) rotate(-32) scale(0.65)">
            {/* Shadow */}
            <ellipse cx="25" cy="46" rx="20" ry="7" fill="#1E293B" fillOpacity="0.18" />
            {/* Car body */}
            <rect x="8" y="15" width="34" height="62" rx="14" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
            {/* Front windshield */}
            <path d="M 13 32 Q 25 35 37 32 L 34 22 Q 25 24 16 22 Z" fill="#1E293B" fillOpacity="0.85" />
            {/* Rear windshield */}
            <path d="M 14 56 Q 25 54 36 56 L 34 65 Q 25 64 16 65 Z" fill="#1E293B" fillOpacity="0.7" />
            {/* Sunroof */}
            <rect x="16" y="38" width="18" height="13" rx="3" fill="#334155" fillOpacity="0.8" />
            {/* Headlights */}
            <circle cx="13" cy="18" r="2" fill="#60A5FA" />
            <circle cx="37" cy="18" r="2" fill="#60A5FA" />
            {/* Taillights */}
            <rect x="12" y="73" width="5" height="2" rx="1" fill="#EF4444" />
            <rect x="33" y="73" width="5" height="2" rx="1" fill="#EF4444" />
          </g>
        </svg>
      </div>

      {/* Underground Parking / GPS Status Notice */}
      {isUndergroundFallback && (
        <div className="mb-2.5 flex items-start space-x-2 bg-amber-50 border border-amber-200 p-2 rounded-xl text-amber-800 text-xs font-medium relative z-10">
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
            <div className="w-4.5 h-4.5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Clock className="w-3 h-3 text-white stroke-[2.5]" />
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">ETA</span>

            {/* Network Fallback Badge */}
            {routeEstimate?.isFallback && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 ml-1">
                <WifiOff className="w-3 h-3 mr-1" />
                {routeEstimate.fallbackNotice || '추정 소요시간'}
              </span>
            )}
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
            <div className="text-xs text-slate-400 mt-1 font-normal">
              이동 거리: <span className="text-slate-900 font-bold">{routeEstimate.distanceKm} km</span>{' '}
              <span className="text-slate-500">({routeEstimate.trafficSummary || '실시간 교통 반영 (TMAP)'})</span>
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
          className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-xs flex items-center justify-center active:scale-95 transition-transform duration-100 disabled:opacity-50 cursor-pointer shrink-0"
          title="ETA 재계산"
          aria-label="ETA 재계산"
        >
          <RefreshCw className={`w-5 h-5 ${isLoadingRoute ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
