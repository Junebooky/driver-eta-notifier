'use client';

import React from 'react';
import { LocationPreset } from '@/types';
import { ArrowLeftRight, Search, ClipboardCheck, Plane, Fuel, MapPinPlus } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface OriginDestinationSelectorProps {
  origin: LocationPreset;
  destination: LocationPreset;
  selectionTarget: 'origin' | 'destination';
  onSelectTarget: (target: 'origin' | 'destination') => void;
  onSwap: () => void;
  onOpenSearchModal?: (target: 'origin' | 'destination') => void;
  onOpenInspectionModal?: () => void;
  onOpenFlightModal?: () => void;
  onOpenGasModal?: () => void;
  onOpenPresetModal?: () => void;
}

export const OriginDestinationSelector: React.FC<OriginDestinationSelectorProps> = ({
  origin,
  destination,
  selectionTarget,
  onSelectTarget,
  onSwap,
  onOpenSearchModal,
  onOpenInspectionModal,
  onOpenFlightModal,
  onOpenGasModal,
  onOpenPresetModal,
}) => {
  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] space-y-3 select-none">
      {/* Top 4 Quick Utility Action Bar (Right-aligned, compact icon chips) */}
      <div className="flex items-center justify-end gap-2 pb-0.5">
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenInspectionModal?.();
          }}
          className="p-2 bg-slate-100/90 hover:bg-slate-200 active:scale-95 rounded-xl transition flex items-center justify-center cursor-pointer shadow-2xs group"
          title="차량 점검 (수령 / 일일 / 반납)"
          aria-label="차량 점검"
        >
          <ClipboardCheck className="w-4 h-4 text-emerald-600 transition-transform group-hover:scale-110" />
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenFlightModal?.();
          }}
          className="p-2 bg-slate-100/90 hover:bg-slate-200 active:scale-95 rounded-xl transition flex items-center justify-center cursor-pointer shadow-2xs group"
          title="인천공항 실시간 항공편 조회"
          aria-label="항공편 조회"
        >
          <Plane className="w-4 h-4 text-sky-600 transition-transform group-hover:scale-110" />
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenGasModal?.();
          }}
          className="p-2 bg-slate-100/90 hover:bg-slate-200 active:scale-95 rounded-xl transition flex items-center justify-center cursor-pointer shadow-2xs group"
          title="주변 주유소 실시간 유가 조회"
          aria-label="주변 주유소"
        >
          <Fuel className="w-4 h-4 text-amber-600 transition-transform group-hover:scale-110" />
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenPresetModal?.();
          }}
          className="p-2 bg-slate-100/90 hover:bg-slate-200 active:scale-95 rounded-xl transition flex items-center justify-center cursor-pointer shadow-2xs group"
          title="거점 관리 및 신규 등록"
          aria-label="거점 관리"
        >
          <MapPinPlus className="w-4 h-4 text-indigo-600 transition-transform group-hover:scale-110" />
        </button>
      </div>

      {/* Horizontal Cards (Origin ⇄ Destination) */}
      <div className="flex items-center space-x-2.5 w-full">
        {/* Origin Card (Neutral Gray 기준점) */}
        <div
          onClick={() => {
            haptics.lightTap();
            onSelectTarget('origin');
            if (onOpenSearchModal) {
              onOpenSearchModal('origin');
            }
          }}
          className={`flex-1 min-w-0 w-full p-3 rounded-2xl border text-left cursor-pointer transition-all duration-150 active:scale-95 ${
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
              <span>검색</span>
            </span>
          </div>
          <div
            className={`text-sm font-bold truncate mt-1.5 w-full ${
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

        {/* Bidirectional Swap Button (⇄) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptics.successPulse();
            onSwap();
          }}
          className="w-8 h-8 rounded-full bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 cursor-pointer"
          title="출발지 ⇄ 목적지 맞교환"
          aria-label="출발지 목적지 맞교환"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        {/* Destination Card (2px Cobalt Outline 핵심 타깃 - 순수 화이트 배경) */}
        <div
          onClick={() => {
            haptics.lightTap();
            onSelectTarget('destination');
            if (onOpenSearchModal) {
              onOpenSearchModal('destination');
            }
          }}
          className={`flex-1 min-w-0 w-full p-3 rounded-2xl text-left cursor-pointer transition-all duration-150 active:scale-95 ${
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
              <span>검색</span>
            </span>
          </div>
          <div
            className="text-sm font-bold truncate mt-1.5 w-full text-slate-900"
            title={destination.name}
          >
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

      {/* Guide Caption */}
      <div className="text-[11px] text-slate-500 px-1 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <div className="w-3.5 h-3.5 rounded-full bg-[#1E60F3] text-white flex items-center justify-center text-[9px] font-black shrink-0 shadow-[0_1px_4px_rgba(30,96,243,0.3)]">
            i
          </div>
          <span>카드를 탭하면 전용 팝업에서 장소 검색 및 거점 선택이 가능합니다.</span>
        </div>
        <span className="text-slate-400 text-[11px]">⇄ 맞교환</span>
      </div>
    </div>
  );
};
