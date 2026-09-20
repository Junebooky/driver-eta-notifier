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
  return (
    <div className="w-full bg-white border border-slate-100/90 rounded-2xl p-4 shadow-2xs space-y-3 select-none">
      {/* Header: Title with blue document icon */}
      <div className="flex items-center space-x-2">
        <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center shadow-2xs">
          <FileText className="w-3.5 h-3.5 text-white" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">단톡방 보고</h3>
      </div>

      {/* Mode Selector:出発 (solid blue) / 到着 (light gray) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Departure Button */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectMode('DEPARTURE');
          }}
          className={`py-3 px-4 rounded-xl transition-all duration-150 flex items-center justify-center space-x-2.5 active:scale-95 cursor-pointer ${
            currentMode === 'DEPARTURE'
              ? 'bg-blue-600 text-white font-bold shadow-xs'
              : 'bg-slate-100/80 hover:bg-slate-100 border border-slate-200/80 text-slate-600 font-medium'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              currentMode === 'DEPARTURE' ? 'bg-white text-blue-600' : 'bg-slate-200/80 text-slate-500'
            }`}
          >
            <Play className="w-3 h-3 fill-current ml-0.5" />
          </div>
          <span className="text-sm tracking-tight">출발</span>
        </button>

        {/* Arrived Button */}
        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onSelectMode('ARRIVED');
          }}
          className={`py-3 px-4 rounded-xl transition-all duration-150 flex items-center justify-center space-x-2.5 active:scale-95 cursor-pointer ${
            currentMode === 'ARRIVED'
              ? 'bg-blue-600 text-white font-bold shadow-xs'
              : 'bg-slate-100/80 hover:bg-slate-100 border border-slate-200/80 text-slate-600 font-medium'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              currentMode === 'ARRIVED' ? 'bg-white text-blue-600' : 'bg-slate-200/80 text-slate-500'
            }`}
          >
            <Square className="w-2.5 h-2.5 fill-current" />
          </div>
          <span className="text-sm tracking-tight">도착</span>
        </button>
      </div>

      {/* Live Report Preview Box */}
      <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3 space-y-2">
        <div className="text-xs text-slate-400 font-normal px-0.5 flex items-center justify-between">
          <span>보고 텍스트 미리보기</span>
          <span className="text-blue-600 font-medium">실시간 갱신됨</span>
        </div>
        <p className="text-xs font-medium text-slate-800 leading-relaxed bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs select-all whitespace-pre-line font-sans">
          {reportPreviewText}
        </p>
      </div>
    </div>
  );
};
