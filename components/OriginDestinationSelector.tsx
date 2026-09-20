'use client';

import React from 'react';
import { LocationPreset } from '@/types';
import { ArrowLeftRight } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface OriginDestinationSelectorProps {
  origin: LocationPreset;
  destination: LocationPreset;
  selectionTarget: 'origin' | 'destination';
  onSelectTarget: (target: 'origin' | 'destination') => void;
  onSwap: () => void;
}

export const OriginDestinationSelector: React.FC<OriginDestinationSelectorProps> = ({
  origin,
  destination,
  selectionTarget,
  onSelectTarget,
  onSwap,
}) => {
  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-1.5 select-none">
      <div className="flex items-center space-x-2">
        {/* Origin Card */}
        <div
          onClick={() => {
            haptics.lightTap();
            onSelectTarget('origin');
          }}
          className={`flex-1 p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-100 active:scale-95 ${
            selectionTarget === 'origin'
              ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
              : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200 opacity-75'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">출발지</span>
            </div>
            {selectionTarget === 'origin' && (
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-blue-600 text-white">
                선택 대상
              </span>
            )}
          </div>
          <div className="text-xs font-black text-slate-900 truncate mt-1">
            {origin.shortName}
          </div>
          {origin.address && (
            <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
              {origin.address}
            </div>
          )}
        </div>

        {/* Bidirectional Swap Button (⇄) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptics.successPulse();
            onSwap();
          }}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 shadow-2xs flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 cursor-pointer"
          title="출발지 ⇄ 목적지 맞교환"
          aria-label="출발지 목적지 맞교환"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>

        {/* Destination Card */}
        <div
          onClick={() => {
            haptics.lightTap();
            onSelectTarget('destination');
          }}
          className={`flex-1 p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-100 active:scale-95 ${
            selectionTarget === 'destination'
              ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
              : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200 opacity-75'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-600" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">목적지</span>
            </div>
            {selectionTarget === 'destination' && (
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-600 text-white">
                선택 대상
              </span>
            )}
          </div>
          <div className="text-xs font-black text-slate-900 truncate mt-1">
            {destination.shortName}
          </div>
          {destination.address && (
            <div className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">
              {destination.address}
            </div>
          )}
        </div>
      </div>

      {/* Guide Caption */}
      <div className="text-[10px] text-slate-400 font-medium px-1 flex items-center justify-between">
        <span>아래 거점을 탭하면 현재 <strong className={selectionTarget === 'origin' ? 'text-blue-600' : 'text-emerald-600'}>[{selectionTarget === 'origin' ? '출발지' : '목적지'}]</strong>로 지정됩니다.</span>
        <span className="text-slate-300">⇄ 맞교환 가능</span>
      </div>
    </div>
  );
};
