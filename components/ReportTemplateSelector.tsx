'use client';

import React from 'react';
import { ReportMode } from '@/types';
import { FileText, Play, Square } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ReportTemplateSelectorProps {
  currentMode: ReportMode;
  onSelectMode: (mode: ReportMode) => void;
  reportPreviewText: string;
}

export const ReportTemplateSelector: React.FC<ReportTemplateSelectorProps> = ({
  currentMode,
  onSelectMode,
  reportPreviewText,
}) => {
  const isDeparture = currentMode === 'DEPARTURE';

  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] space-y-3 select-none">
      {/* Header: Title with electric cobalt document icon */}
      <div className="flex items-center space-x-2">
        <div className="w-5 h-5 rounded-md bg-[#1E60F3] text-white flex items-center justify-center shadow-[0_2px_6px_rgba(30,96,243,0.3)]">
          <FileText className="w-3.5 h-3.5 text-white" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">단톡방 보고</h3>
      </div>

      {/* Mode Selector: Unified Sliding Segmented Control */}
      <div className="w-full bg-slate-100/90 p-1 rounded-full relative flex items-center select-none shadow-inner">
        {/* Sliding Indicator Pill */}
        <div
          className={`w-1/2 h-[calc(100%-8px)] absolute top-1 left-1 rounded-full bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-all duration-300 ease-out pointer-events-none transform ${
            isDeparture ? 'translate-x-0' : 'translate-x-full'
          }`}
        />

        {/* Departure Tab */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectMode('DEPARTURE');
          }}
          className="flex-1 py-2.5 rounded-full z-10 flex items-center justify-center space-x-2 cursor-pointer transition-colors duration-300"
        >
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300 ${
              isDeparture ? 'bg-white/20 text-white' : 'text-slate-400'
            }`}
          >
            <Play className={`w-3 h-3 ml-0.5 ${isDeparture ? 'fill-white text-white' : 'fill-slate-400 text-slate-400'}`} />
          </div>
          <span
            className={`text-sm tracking-tight transition-colors duration-300 ${
              isDeparture ? 'text-white font-black' : 'text-slate-500 font-semibold'
            }`}
          >
            출발
          </span>
        </button>

        {/* Arrived Tab */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectMode('ARRIVED');
          }}
          className="flex-1 py-2.5 rounded-full z-10 flex items-center justify-center space-x-2 cursor-pointer transition-colors duration-300"
        >
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300 ${
              !isDeparture ? 'bg-white/20 text-white' : 'text-slate-400'
            }`}
          >
            <Square className={`w-2.5 h-2.5 ${!isDeparture ? 'fill-white text-white' : 'fill-slate-400 text-slate-400'}`} />
          </div>
          <span
            className={`text-sm tracking-tight transition-colors duration-300 ${
              !isDeparture ? 'text-white font-black' : 'text-slate-500 font-semibold'
            }`}
          >
            도착
          </span>
        </button>
      </div>

      {/* Live Report Preview Box (Stabilized Height to prevent Action Button Layout Shift) */}
      <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3 space-y-2">
        <div className="text-xs text-slate-400 font-normal px-0.5 flex items-center justify-between">
          <span>보고 텍스트 미리보기</span>
          <span className="text-[#1E60F3] font-medium">실시간 갱신됨</span>
        </div>
        <div className="text-xs font-medium text-slate-800 leading-relaxed bg-white p-3 rounded-xl border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.03)] select-all whitespace-pre-line font-sans min-h-[130px] flex flex-col justify-start items-start text-left w-full">
          {reportPreviewText}
        </div>
      </div>
    </div>
  );
};
