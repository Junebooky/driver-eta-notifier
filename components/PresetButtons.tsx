'use client';

import React from 'react';
import { LocationPreset } from '@/types';
import { PRESET_LOCATIONS } from '@/utils/presets';
import { Plane, Building2, Flag, RotateCcw, MapPin } from 'lucide-react';

interface PresetButtonsProps {
  selectedDestination: LocationPreset;
  onSelectDestination: (preset: LocationPreset) => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  AIRPORT: <Plane className="w-4 h-4 text-sky-400" />,
  HOTEL: <Building2 className="w-4 h-4 text-amber-400" />,
  CIRCUIT: <Flag className="w-4 h-4 text-rose-400" />,
  RETURN: <RotateCcw className="w-4 h-4 text-emerald-400" />,
};

export const PresetButtons: React.FC<PresetButtonsProps> = ({
  selectedDestination,
  onSelectDestination,
}) => {
  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center">
          <MapPin className="w-3.5 h-3.5 mr-1.5 text-blue-400" /> VIP 거점 원터치 선택
        </h3>
        <span className="text-[11px] text-zinc-500 font-medium">거치대 터치 최적화</span>
      </div>

      {/* Grid of presets - 2 columns for large touch targets on mobile */}
      <div className="grid grid-cols-2 gap-2.5">
        {PRESET_LOCATIONS.map((preset) => {
          const isSelected = selectedDestination.id === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onSelectDestination(preset)}
              className={`p-3.5 rounded-xl border text-left transition-all active:scale-95 flex flex-col justify-between min-h-[72px] ${
                isSelected
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200 ring-2 ring-blue-500/50 shadow-lg shadow-blue-950/50'
                  : 'bg-zinc-950 border-zinc-850 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="p-1 rounded-lg bg-zinc-900 border border-zinc-800">
                  {CATEGORY_ICONS[preset.category] || <MapPin className="w-4 h-4 text-blue-400" />}
                </span>
                {isSelected && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-500 text-white shadow-sm">
                    선택됨
                  </span>
                )}
              </div>
              <div className="mt-2">
                <div className="font-extrabold text-sm tracking-tight text-zinc-100">{preset.shortName}</div>
                {preset.address && (
                  <div className="text-[10px] text-zinc-400 font-medium truncate mt-0.5">{preset.address}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
