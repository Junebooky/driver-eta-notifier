'use client';

import React from 'react';
import { LocationPreset } from '@/types';
import { Plus, Trash2 } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface PresetButtonsProps {
  presets: LocationPreset[];
  selectedOriginId?: string;
  selectedDestinationId?: string;
  onSelectPreset: (preset: LocationPreset) => void;
  onOpenAddModal: () => void;
  onDeleteCustomPreset?: (id: string) => void;
}

export const PresetButtons: React.FC<PresetButtonsProps> = ({
  presets,
  selectedOriginId,
  selectedDestinationId,
  onSelectPreset,
  onOpenAddModal,
  onDeleteCustomPreset,
}) => {
  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-2.5 shadow-xs select-none">
      {/* 3-Column High-Density Grid (No Section Title, No Emojis) */}
      <div className="grid grid-cols-3 gap-1.5">
        {presets.map((preset) => {
          const isOrigin = selectedOriginId === preset.id;
          const isDestination = selectedDestinationId === preset.id;
          const isCustom = preset.category === 'CUSTOM';

          let stateClasses = 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-bold';
          if (isDestination) {
            stateClasses = 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 font-black shadow-2xs';
          } else if (isOrigin) {
            stateClasses = 'bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 font-black shadow-2xs';
          }

          return (
            <div key={preset.id} className="relative group">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onSelectPreset(preset);
                }}
                className={`w-full py-2.5 px-2 rounded-xl border text-center transition-transform duration-100 active:scale-95 flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${stateClasses}`}
                title={preset.name}
              >
                <span className="text-xs tracking-tight truncate w-full">
                  {preset.shortName}
                </span>

                {/* Status Indicator Tag */}
                {isDestination && (
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter leading-none mt-0.5">
                    도착지
                  </span>
                )}
                {isOrigin && !isDestination && (
                  <span className="text-[9px] font-black text-blue-600 uppercase tracking-tighter leading-none mt-0.5">
                    출발지
                  </span>
                )}
              </button>

              {/* Delete button for custom presets */}
              {isCustom && onDeleteCustomPreset && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.lightTap();
                    if (confirm(`'${preset.shortName}' 거점을 삭제하시겠습니까?`)) {
                      onDeleteCustomPreset(preset.id);
                    }
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-100 hover:bg-rose-500 text-rose-600 hover:text-white border border-rose-300 flex items-center justify-center opacity-80 hover:opacity-100 active:scale-90 transition-all cursor-pointer z-10"
                  title="거점 삭제"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Integrated Compact '+ 거점 추가' Button */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onOpenAddModal();
          }}
          className="w-full py-2.5 px-2 rounded-xl border border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/60 hover:bg-blue-50/60 text-slate-500 hover:text-blue-600 text-xs font-bold flex items-center justify-center space-x-1 active:scale-95 transition-transform duration-100 cursor-pointer min-h-[44px]"
          title="새 거점 검색 및 등록"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>추가</span>
        </button>
      </div>
    </div>
  );
};
