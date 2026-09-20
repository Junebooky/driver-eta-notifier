'use client';

import React from 'react';
import { ReportMode } from '@/types';
import { MessageSquareShare, Send, CheckCircle2 } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ReportTemplateSelectorProps {
  currentMode: ReportMode;
  onSelectMode: (mode: ReportMode) => void;
  reportPreviewText: string;
}

const TEMPLATES: {
  mode: ReportMode;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    mode: 'DEPARTURE',
    label: '출발',
    icon: <Send className="w-4 h-4 text-blue-600" />,
  },
  {
    mode: 'ARRIVED',
    label: '도착',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  },
];

export const ReportTemplateSelector: React.FC<ReportTemplateSelectorProps> = ({
  currentMode,
  onSelectMode,
  reportPreviewText,
}) => {
  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-3 select-none">
      {/* Header: Simplified Title with MessageSquareShare icon (no auxiliary text) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <MessageSquareShare className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold text-slate-800 tracking-tight">단톡방 보고</h3>
        </div>
      </div>

      {/* Mode Selector: 2-Column Unified Circular Badge Buttons */}
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((item) => {
          const isSelected = currentMode === item.mode;
          const isDeparture = item.mode === 'DEPARTURE';

          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => {
                haptics.lightTap();
                onSelectMode(item.mode);
              }}
              className={`py-2.5 px-3 rounded-xl border transition-all duration-100 flex items-center justify-center space-x-2.5 active:scale-95 cursor-pointer ${
                isSelected
                  ? isDeparture
                    ? 'bg-blue-50/90 border-blue-500 text-blue-950 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-emerald-50/90 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200 text-slate-600'
              }`}
            >
              {/* Circular Badge matching top Navbar family look */}
              <div
                className={`w-8 h-8 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center shrink-0 transition-transform ${
                  isSelected
                    ? isDeparture
                      ? 'ring-2 ring-offset-1 ring-blue-600 scale-105 shadow-xs'
                      : 'ring-2 ring-offset-1 ring-emerald-500 scale-105 shadow-xs'
                    : 'opacity-70'
                }`}
              >
                {item.icon}
              </div>
              <span className="text-xs font-black tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Live Report Preview Box */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center justify-between">
          <span>보고 텍스트 미리보기</span>
          <span className="text-blue-600 font-semibold">실시간 갱신됨</span>
        </div>
        <p className="text-xs font-mono font-medium text-slate-800 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs select-all whitespace-pre-line">
          {reportPreviewText}
        </p>
      </div>
    </div>
  );
};
