'use client';

import React, { useState } from 'react';
import { LocationPreset } from '@/types';
import { ArrowLeftRight, Search } from 'lucide-react';
import { haptics } from '@/utils/haptics';

export interface OriginDestinationSelectorProps {
  origin: LocationPreset;
  destination: LocationPreset;
  waypoints?: LocationPreset[];
  waypoint?: LocationPreset | null;
  adminWaypoints?: LocationPreset[];
  isAdminRoute?: boolean;
  selectionTarget?: 'origin' | 'destination' | 'waypoint';
  onSelectTarget?: (target: 'origin' | 'destination' | 'waypoint') => void;
  onSelectOrigin?: () => void;
  onSelectDestination?: () => void;
  onSelectWaypoint?: (index: number) => void;
  onAddWaypoint: () => void;
  onRemoveWaypoint: (index: number) => void;
  onSwap?: () => void;
  onOpenSearchModal?: (target: 'origin' | 'destination' | 'waypoint', waypointIndex?: number) => void;
  onOpenInspectionModal?: () => void;
  onOpenFlightModal?: () => void;
  onOpenGasModal?: () => void;
  onOpenPresetModal?: () => void;
}

export const OriginDestinationSelector: React.FC<OriginDestinationSelectorProps> = ({
  origin,
  destination,
  waypoints = [],
  waypoint,
  adminWaypoints = [],
  isAdminRoute = false,
  selectionTarget = 'destination',
  onSelectTarget,
  onSelectOrigin,
  onSelectDestination,
  onSelectWaypoint,
  onAddWaypoint,
  onRemoveWaypoint,
  onSwap,
  onOpenSearchModal,
}) => {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  // Normalize multi-waypoints (backward compatible with single waypoint)
  const activeWaypoints: LocationPreset[] =
    waypoints && waypoints.length > 0 ? waypoints : waypoint ? [waypoint] : [];
  const hasWaypoints = activeWaypoints.length > 0;

  const handleOriginClick = () => {
    haptics.lightTap();
    if (onSelectOrigin) onSelectOrigin();
    if (onSelectTarget) onSelectTarget('origin');
    if (onOpenSearchModal) onOpenSearchModal('origin');
  };

  const handleDestinationClick = () => {
    haptics.lightTap();
    if (onSelectDestination) onSelectDestination();
    if (onSelectTarget) onSelectTarget('destination');
    if (onOpenSearchModal) onOpenSearchModal('destination');
  };

  const handleWaypointClick = (index: number) => {
    haptics.lightTap();
    if (onSelectWaypoint) onSelectWaypoint(index);
    if (onSelectTarget) onSelectTarget('waypoint');
    if (onOpenSearchModal) onOpenSearchModal('waypoint', index);
  };

  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] space-y-2 select-none transition-all duration-300 ease-in-out">
      {hasWaypoints ? (
        /* Vertical Multi-Tier Slim Inline View (Origin ➔ Waypoints (1~5) ➔ Destination) */
        <div className="space-y-1.5 w-full transition-all duration-300 ease-in-out animate-in fade-in slide-in-from-top-2">
          {/* 1. Origin Slot (Inline Slim) */}
          <div
            onClick={handleOriginClick}
            className={`w-full py-2.5 px-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-150 active:scale-98 ${
              selectionTarget === 'origin'
                ? 'bg-slate-50/80 text-slate-800 border-slate-300/90 ring-2 ring-slate-200/60 shadow-xs'
                : 'bg-white border-slate-200/80 hover:border-slate-300'
            }`}
            title="출발지 검색 및 변경"
          >
            <div className="flex items-center justify-between w-full">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                출발지
              </span>
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5">
                <Search className="w-3 h-3 text-slate-400" />
              </span>
            </div>
            <div className="flex items-baseline gap-2 min-w-0 mt-0.5">
              <span className="text-sm sm:text-base font-bold text-slate-900 shrink-0 truncate max-w-[55%]">
                {origin.shortName || origin.name}
              </span>
              <span className="text-xs text-slate-400 truncate">
                {origin.address || origin.name}
              </span>
            </div>
          </div>

          {/* 2. Waypoint Slots (Dynamic Array with + and ✕ dual control, max 5) */}
          {activeWaypoints.map((wp, index) => (
            <div
              key={wp.id || `wp_${index}`}
              onClick={() => handleWaypointClick(index)}
              className={`w-full py-2.5 px-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-150 active:scale-98 ${
                selectionTarget === 'waypoint'
                  ? 'bg-slate-50/80 border-slate-400 ring-2 ring-slate-300/60 shadow-xs'
                  : 'bg-white border-slate-200/80 hover:border-slate-300'
              }`}
              title="경유지 검색 및 변경"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-slate-700 text-white flex items-center justify-center shadow-xs">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600">
                    {activeWaypoints.length > 1
                      ? `경유지 ${index + 1}`
                      : wp.name && wp.name !== '경유지 선택'
                      ? wp.shortName || wp.name
                      : '장소 검색'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* 5개 미만일 때만 + 버튼 노출 */}
                  {activeWaypoints.length < 5 && !isAdminRoute && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        haptics.mediumTap();
                        onAddWaypoint();
                      }}
                      className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                      title="경유지 추가"
                      aria-label="경유지 추가"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  )}
                  {/* 개별 경유지 삭제 버튼 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      haptics.lightTap();
                      onRemoveWaypoint(index);
                    }}
                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all cursor-pointer"
                    title="경유지 삭제"
                    aria-label="경유지 삭제"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex items-baseline gap-2 min-w-0 mt-0.5">
                <span className="text-sm sm:text-base font-bold text-slate-900 shrink-0 truncate max-w-[55%]">
                  {wp.shortName || wp.name}
                </span>
                <span className="text-xs text-slate-400 truncate">
                  {wp.address || '터치하여 장소를 검색하세요'}
                </span>
              </div>
            </div>
          ))}

          {/* 3. Destination Slot (Inline Slim) */}
          <div
            onClick={handleDestinationClick}
            className={`w-full py-2.5 px-3.5 rounded-2xl text-left cursor-pointer transition-all duration-150 active:scale-98 ${
              selectionTarget === 'destination'
                ? 'bg-white border-2 border-[#1E60F3] shadow-sm shadow-blue-500/10'
                : 'bg-white border border-slate-200/80 hover:border-slate-300'
            }`}
            title="목적지 검색 및 변경"
          >
            <div className="flex items-center justify-between w-full">
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1E60F3] text-white font-bold shrink-0 shadow-xs">
                목적지
              </span>
              <span className="text-[10px] text-blue-500 font-medium flex items-center gap-0.5">
                <Search className="w-3 h-3 text-[#1E60F3]" />
              </span>
            </div>
            <div className="flex items-baseline gap-2 min-w-0 mt-0.5">
              <span className="text-sm sm:text-base font-bold text-slate-900 shrink-0 truncate max-w-[55%]">
                {destination.shortName || destination.name}
              </span>
              <span className="text-xs text-slate-400 truncate">
                {destination.address || destination.name}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Horizontal Cards (Origin ⇄ Destination) */
        <div className="flex items-center space-x-2.5 w-full">
          {/* Origin Card (Neutral Gray 기준점) */}
          <div
            onClick={handleOriginClick}
            className={`flex-1 min-w-0 w-full py-2.5 px-3 rounded-2xl border text-left cursor-pointer transition-all duration-150 active:scale-95 ${
              selectionTarget === 'origin'
                ? 'bg-slate-50/80 text-slate-800 border-slate-300/90 ring-2 ring-slate-200/60 shadow-xs'
                : 'bg-white border-slate-200/80 hover:border-slate-300'
            }`}
            title="출발지 검색 및 변경"
          >
            <div className="flex items-center justify-between w-full">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                출발지
              </span>
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5 group-hover:text-slate-600">
                <Search className="w-3 h-3 text-slate-400" />
              </span>
            </div>
            <div
              className={`text-base font-bold truncate mt-1 w-full ${
                selectionTarget === 'origin' ? 'text-slate-900' : 'text-slate-700'
              }`}
              title={origin.name}
            >
              {origin.shortName}
            </div>
            <div
              className={`text-[11px] truncate mt-0.5 font-normal w-full ${
                selectionTarget === 'origin' ? 'text-slate-500' : 'text-slate-400'
              }`}
              title={origin.address || origin.name}
            >
              {origin.address || origin.name}
            </div>
          </div>

          {/* Action Stack: Matching style '+' Waypoint Button stacked above Swap Button */}
          <div className="flex flex-col gap-1.5 items-center shrink-0">
            {!isAdminRoute && activeWaypoints.length < 5 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.mediumTap();
                  onAddWaypoint();
                }}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                title="경유지 추가"
                aria-label="경유지 추가"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}

            {/* Bidirectional Swap Button (⇄) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                haptics.successPulse();
                onSwap?.();
              }}
              className="w-8 h-8 rounded-full bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 cursor-pointer"
              title="출발지 ⇄ 목적지 맞교환"
              aria-label="출발지 목적지 맞교환"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Destination Card (2px Cobalt Outline 핵심 타깃 - 순수 화이트 배경) */}
          <div
            onClick={handleDestinationClick}
            className={`flex-1 min-w-0 w-full py-2.5 px-3 rounded-2xl text-left cursor-pointer transition-all duration-150 active:scale-95 ${
              selectionTarget === 'destination'
                ? 'bg-white border-2 border-[#1E60F3] shadow-sm shadow-blue-500/10'
                : 'bg-white border border-slate-200/80 hover:border-slate-300'
            }`}
            title="목적지 검색 및 변경"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1E60F3] text-white font-bold shrink-0 shadow-xs">
                  목적지
                </span>
                {isAdminRoute && adminWaypoints && adminWaypoints.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      haptics.lightTap();
                      setIsAccordionOpen((prev) => !prev);
                    }}
                    className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    title="관리자 지정동선 상세"
                  >
                    <span>지정동선 {adminWaypoints.length}곳</span>
                    <svg
                      className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${
                        isAccordionOpen ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>
              <span className="text-[10px] text-blue-500 font-medium flex items-center gap-0.5 shrink-0">
                <Search className="w-3 h-3 text-[#1E60F3]" />
              </span>
            </div>
            <div className="text-base font-bold truncate mt-1 w-full text-slate-900" title={destination.name}>
              {destination.shortName}
            </div>
            <div
              className="text-[11px] truncate mt-0.5 font-normal w-full text-slate-500"
              title={destination.address || destination.name}
            >
              {destination.address || destination.name}
            </div>
          </div>
        </div>
      )}

      {/* Admin Route Accordion View (대열 통제 모드: 통제 도로 지점 목록) */}
      {isAdminRoute && isAccordionOpen && adminWaypoints && adminWaypoints.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-slate-500">
              관리자 통제 도로 (대열 주행 동선)
            </span>
            <span className="text-[10px] text-slate-400">
              수정 불가 (대열 통제 모드)
            </span>
          </div>
          <div className="space-y-1 bg-slate-50/80 rounded-xl p-2 border border-slate-100">
            {adminWaypoints.map((wp, index) => (
              <div
                key={wp.id || index}
                className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-white border border-slate-200/60 text-slate-700 shadow-xs"
              >
                <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0 border border-slate-200">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0 flex items-baseline gap-2">
                  <span className="font-semibold text-slate-800 truncate shrink-0 max-w-[55%]">
                    {wp.shortName || wp.name}
                  </span>
                  {wp.address && (
                    <span className="text-[10px] text-slate-400 truncate">
                      {wp.address}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guide Caption */}
      <div className="flex items-center justify-between py-0.5 px-0.5 select-none">
        <div className="flex items-center space-x-1.5 min-w-0">
          <div className="w-3.5 h-3.5 rounded-full bg-[#1E60F3] text-white flex items-center justify-center text-[9px] font-black shrink-0 shadow-[0_1px_4px_rgba(30,96,243,0.3)]">
            i
          </div>
          <span className="text-[11px] text-slate-500 font-medium truncate">
            {hasWaypoints
              ? activeWaypoints.length < 5
                ? '경유지 카드를 탭해 변경하거나 + 로 추가, ✕ 로 삭제하세요.'
                : '최대 경유지(5개)가 설정되었습니다.'
              : isAdminRoute
              ? '관리자 지정동선 대열 통제 주행 모드입니다.'
              : '카드를 탭해 장소·거점을 선택하세요.'}
          </span>
        </div>
      </div>
    </div>
  );
};
