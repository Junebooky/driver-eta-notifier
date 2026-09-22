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
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] space-y-2.5 select-none">
      <div className="flex items-center space-x-2.5 w-full">
        {/* Origin Card (Neutral Gray 기준점) */}
        <div
          onClick={() => {
            haptics.lightTap();
            onSelectTarget('origin');
          }}
          className={`flex-1 min-w-0 w-full p-3 rounded-2xl border text-left cursor-pointer transition-all duration-150 active:scale-95 ${
            selectionTarget === 'origin'
              ? 'bg-slate-100 text-slate-700 border-slate-300 ring-2 ring-slate-300/60 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                selectionTarget === 'origin' ? 'bg-slate-500' : 'bg-slate-300'
              }`}
            />
            <span
              className={`text-xs font-semibold shrink-0 ${
                selectionTarget === 'origin' ? 'text-slate-700 font-bold' : 'text-slate-500'
              }`}
            >
              출발지
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

        {/* Destination Card (2px Cobalt Outline 핵심 타깃) */}
        <div
          onClick={() => {
            haptics.lightTap();
            onSelectTarget('destination');
          }}
          className={`flex-1 min-w-0 w-full p-3 rounded-2xl text-left cursor-pointer transition-all duration-150 active:scale-95 ${
            selectionTarget === 'destination'
              ? 'bg-blue-50/20 border-2 border-[#1E60F3] shadow-sm shadow-blue-500/10'
              : 'bg-white border border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                selectionTarget === 'destination' ? 'bg-[#1E60F3]' : 'bg-slate-300'
              }`}
            />
            <span
              className={`text-xs font-semibold shrink-0 ${
                selectionTarget === 'destination' ? 'text-[#1E60F3] font-bold' : 'text-slate-500'
              }`}
            >
              목적지
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
          <span>
            아래 거점을 탭하면 현재{' '}
            <strong className={selectionTarget === 'origin' ? 'text-slate-800' : 'text-[#1E60F3]'}>
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
