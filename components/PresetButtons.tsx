'use client';

import React, { useState } from 'react';
import { LocationPreset } from '@/types';
import { Plus, Trash2, Pencil, SlidersHorizontal } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface PresetButtonsProps {
  presets: LocationPreset[];
  selectedOriginId?: string;
  selectedDestinationId?: string;
  onSelectPreset: (preset: LocationPreset) => void;
  onOpenAddModal: () => void;
  onEditPreset?: (preset: LocationPreset) => void;
  onDeleteCustomPreset?: (id: string) => void;
}

export const PresetButtons: React.FC<PresetButtonsProps> = ({
  presets,
  selectedOriginId,
  selectedDestinationId,
  onSelectPreset,
  onOpenAddModal,
  onEditPreset,
  onDeleteCustomPreset,
}) => {
  const [isManageMode, setIsManageMode] = useState(false);
  const [managingPreset, setManagingPreset] = useState<LocationPreset | null>(null);

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-2.5 shadow-xs select-none">
      {/* Management Mode Guidance Bar */}
      {isManageMode && (
        <div className="mb-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold flex items-center justify-between animate-fade-in">
          <span>관리(수정/삭제)할 거점을 탭하세요.</span>
          <button
            type="button"
            onClick={() => setIsManageMode(false)}
            className="text-blue-600 font-extrabold hover:underline cursor-pointer"
          >
            완료
          </button>
        </div>
      )}

      {/* 3-Column High-Density Grid (Clean Text-Only Chips) */}
      <div className="grid grid-cols-3 gap-1.5">
        {presets.map((preset) => {
          const isOrigin = selectedOriginId === preset.id;
          const isDestination = selectedDestinationId === preset.id;

          let stateClasses = 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-bold';
          if (isDestination) {
            stateClasses = 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 font-black shadow-2xs';
          } else if (isOrigin) {
            stateClasses = 'bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 font-black shadow-2xs';
          }

          if (isManageMode) {
            stateClasses += ' border-dashed border-blue-400/80 hover:bg-blue-50/50';
          }

          return (
            <div key={preset.id} className="relative">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  if (isManageMode) {
                    setManagingPreset(preset);
                  } else {
                    onSelectPreset(preset);
                  }
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
                {isManageMode && (
                  <span className="text-[8px] font-bold text-blue-600 leading-none mt-0.5">
                    관리
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* Integrated Compact '+ 추가' Button */}
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

      {/* Bottom Right: Discreet '거점 관리' Button */}
      <div className="flex justify-end pt-2 pr-1">
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            setIsManageMode(!isManageMode);
          }}
          className={`text-[11px] font-bold flex items-center space-x-1 py-1 px-2 rounded-lg transition-colors cursor-pointer ${
            isManageMode
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          }`}
          title="거점 수정 및 삭제 관리"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>{isManageMode ? '관리 완료' : '거점 관리'}</span>
        </button>
      </div>

      {/* Management Action Dialog Modal */}
      {managingPreset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 text-center space-y-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">거점 관리</span>
              <h3 className="text-sm font-black text-slate-900 truncate mt-0.5">
                [{managingPreset.shortName}]
              </h3>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {managingPreset.address || managingPreset.name}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onEditPreset?.(managingPreset);
                  setManagingPreset(null);
                  setIsManageMode(false);
                }}
                className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center space-x-1.5 border border-blue-200 active:scale-95 transition-transform cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>수정</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  if (confirm(`'${managingPreset.shortName}' 거점을 삭제하시겠습니까?`)) {
                    onDeleteCustomPreset?.(managingPreset.id);
                    setManagingPreset(null);
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center space-x-1.5 border border-slate-200 active:scale-95 transition-transform cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                <span>삭제</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setManagingPreset(null)}
              className="w-full py-1.5 text-xs text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
