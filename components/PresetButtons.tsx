'use client';

import React from 'react';
import { LocationPreset } from '@/types';
import { Plane, Building2, Flag, RotateCcw, MapPin, Plus, Trash2 } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface PresetButtonsProps {
  presets: LocationPreset[];
  selectedDestination: LocationPreset;
  onSelectDestination: (preset: LocationPreset) => void;
  onOpenAddModal: () => void;
  onDeleteCustomPreset?: (id: string) => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  AIRPORT: <Plane className="w-4 h-4 text-sky-400" />,
  HOTEL: <Building2 className="w-4 h-4 text-amber-400" />,
  CIRCUIT: <Flag className="w-4 h-4 text-rose-400" />,
  RETURN: <RotateCcw className="w-4 h-4 text-emerald-400" />,
  CUSTOM: <MapPin className="w-4 h-4 text-purple-400" />,
};

export const PresetButtons: React.FC<PresetButtonsProps> = ({
  presets,
  selectedDestination,
  onSelectDestination,
  onOpenAddModal,
  onDeleteCustomPreset,
}) => {
  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center">
          <MapPin className="w-3.5 h-3.5 mr-1.5 text-blue-400" /> VIP 거점 원터치 선택
        </h3>
        
        {/* Top Add Custom Preset Button */}
        <button
          onClick={() => {
            haptics.lightTap();
            onOpenAddModal();
          }}
          className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center space-x-1 active:scale-95 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>거점 추가</span>
        </button>
      </div>

      {/* Grid of presets - 2 columns for large touch targets on mobile */}
      <div className="grid grid-cols-2 gap-2.5">
        {presets.map((preset) => {
          const isSelected = selectedDestination.id === preset.id;
          const isCustom = preset.category === 'CUSTOM';

          return (
            <div key={preset.id} className="relative group">
              <button
                onClick={() => {
                  haptics.lightTap();
                  onSelectDestination(preset);
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all active:scale-95 flex flex-col justify-between min-h-[76px] ${
                  isSelected
                    ? 'bg-blue-600/20 border-blue-500 text-blue-200 ring-2 ring-blue-500/50 shadow-lg shadow-blue-950/50'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="p-1 rounded-lg bg-zinc-900 border border-zinc-800">
                    {CATEGORY_ICONS[preset.category] || <MapPin className="w-4 h-4 text-blue-400" />}
                  </span>
                  <div className="flex items-center space-x-1">
                    {isCustom && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        커스텀
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-500 text-white shadow-sm">
                        선택됨
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <div className="font-extrabold text-sm tracking-tight text-zinc-100 truncate">
                    {preset.shortName}
                  </div>
                  {preset.address && (
                    <div className="text-[10px] text-zinc-400 font-medium truncate mt-0.5">
                      {preset.address}
                    </div>
                  )}
                </div>
              </button>

              {/* Delete button for user custom preset */}
              {isCustom && onDeleteCustomPreset && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.lightTap();
                    if (confirm(`'${preset.shortName}' 커스텀 거점을 삭제하시겠습니까?`)) {
                      onDeleteCustomPreset(preset.id);
                    }
                  }}
                  className="absolute top-2 right-2 p-1 rounded-md bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/40 opacity-80 hover:opacity-100 transition-opacity"
                  title="커스텀 거점 삭제"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
