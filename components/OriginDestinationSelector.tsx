'use client';

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
    <div className="w-full bg-white border border-slate-100/90 rounded-2xl p-3.5 shadow-2xs space-y-2.5 select-none">
      <div className="flex items-center space-x-2.5 w-full">
        {/* Origin Card */}
        <div
          onClick={() => {
            haptics.lightTap();
            onSelectTarget('origin');
          }}
          className={`flex-1 min-w-0 w-full p-3 rounded-2xl border text-left cursor-pointer transition-all duration-150 active:scale-95 bg-white ${
            selectionTarget === 'origin'
              ? 'border-blue-400 ring-2 ring-blue-100 shadow-xs'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
            <span className="text-xs font-semibold text-slate-500 shrink-0">출발지</span>
          </div>
          <div className="text-sm font-bold text-slate-900 truncate mt-1.5 w-full" title={origin.name}>
            {origin.shortName}
          </div>
          <div className="text-[11px] text-slate-400 truncate mt-0.5 font-normal w-full" title={origin.address || origin.name}>
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
          className="w-8 h-8 rounded-full bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 shadow-2xs flex items-center justify-center shrink-0 active:scale-90 transition-transform duration-100 cursor-pointer"
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
          className={`flex-1 min-w-0 w-full p-3 rounded-2xl border text-left cursor-pointer transition-all duration-150 active:scale-95 bg-white ${
            selectionTarget === 'destination'
              ? 'border-emerald-400 ring-2 ring-emerald-100 shadow-xs'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
            <span className="text-xs font-semibold text-slate-500 shrink-0">목적지</span>
          </div>
          <div className="text-sm font-bold text-slate-900 truncate mt-1.5 w-full" title={destination.name}>
            {destination.shortName}
          </div>
          <div className="text-[11px] text-slate-400 truncate mt-0.5 font-normal w-full" title={destination.address || destination.name}>
            {destination.address || destination.name}
          </div>
        </div>
      </div>

      {/* Guide Caption */}
      <div className="text-[11px] text-slate-500 px-1 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <div className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-black shrink-0">
            i
          </div>
          <span>
            아래 거점을 탭하면 현재{' '}
            <strong className={selectionTarget === 'origin' ? 'text-blue-600' : 'text-emerald-600'}>
              [{selectionTarget === 'origin' ? '출발지' : '목적지'}]
            </strong>
            로 지정됩니다.
          </span>
        </div>
        <span className="text-slate-400 text-[11px]">⇄ 맞교환 가능</span>
      </div>
    </div>
  );
};
