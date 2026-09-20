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
  AIRPORT: <Plane className="w-4 h-4 text-sky-600" />,
  HOTEL: <Building2 className="w-4 h-4 text-amber-600" />,
  CIRCUIT: <Flag className="w-4 h-4 text-rose-600" />,
  RETURN: <RotateCcw className="w-4 h-4 text-emerald-600" />,
  CUSTOM: <MapPin className="w-4 h-4 text-purple-600" />,
};

export const PresetButtons: React.FC<PresetButtonsProps> = ({
  presets,
  selectedDestination,
  onSelectDestination,
  onOpenAddModal,
  onDeleteCustomPreset,
}) => {
  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center">
          <MapPin className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> VIP 거점 원터치 선택
        </h3>

        {/* Top Add Custom Preset Button */}
        <button
          onClick={() => {
            haptics.lightTap();
            onOpenAddModal();
          }}
          className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 active:scale-95 transition-transform duration-100 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 shadow-xs"
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
            <div key={preset.id} className="relative group select-none">
              <button
                onClick={() => {
                  haptics.lightTap();
                  onSelectDestination(preset);
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-transform duration-100 active:scale-95 flex flex-col justify-between min-h-[76px] cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="p-1 rounded-lg bg-white border border-slate-200 shadow-2xs">
                    {CATEGORY_ICONS[preset.category] || <MapPin className="w-4 h-4 text-blue-600" />}
                  </span>
                  <div className="flex items-center space-x-1">
                    {isCustom && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                        커스텀
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-600 text-white shadow-2xs">
                        선택됨
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <div className="font-extrabold text-sm tracking-tight text-slate-900 truncate">
                    {preset.shortName}
                  </div>
                  {preset.address && (
                    <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
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
                  className="absolute top-2 right-2 p-1 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-600 border border-rose-200 opacity-80 hover:opacity-100 active:scale-90 transition-all"
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
