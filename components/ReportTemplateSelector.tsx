'use client';

import React from 'react';
import { ReportMode } from '@/types';
import { FileText, Send, CheckCircle2, Clock, Car } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ReportTemplateSelectorProps {
  currentMode: ReportMode;
  onSelectMode: (mode: ReportMode) => void;
  reportPreviewText: string;
}

const TEMPLATES: { mode: ReportMode; label: string; icon: React.ReactNode; color: string }[] = [
  { mode: 'DEPARTURE', label: '[출발/이동]', icon: <Send className="w-3.5 h-3.5" />, color: 'border-blue-500 text-blue-700 bg-blue-50/80 ring-2 ring-blue-500/20' },
  { mode: 'ARRIVED', label: '[도착/하차]', icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'border-emerald-500 text-emerald-700 bg-emerald-50/80 ring-2 ring-emerald-500/20' },
  { mode: 'WAITING', label: '[현장 대기]', icon: <Clock className="w-3.5 h-3.5" />, color: 'border-amber-500 text-amber-700 bg-amber-50/80 ring-2 ring-amber-500/20' },
  { mode: 'RETURN', label: '[차량 반납]', icon: <Car className="w-3.5 h-3.5" />, color: 'border-purple-500 text-purple-700 bg-purple-50/80 ring-2 ring-purple-500/20' },
];

export const ReportTemplateSelector: React.FC<ReportTemplateSelectorProps> = ({
  currentMode,
  onSelectMode,
  reportPreviewText,
}) => {
  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center">
          <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> 단톡방 현장 보고 모드
        </h3>
        <span className="text-[11px] text-slate-400 font-semibold">원터치 템플릿</span>
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-2 gap-2 select-none">
        {TEMPLATES.map((item) => {
          const isSelected = currentMode === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => {
                haptics.lightTap();
                onSelectMode(item.mode);
              }}
              className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-transform duration-100 flex items-center justify-center space-x-1.5 active:scale-95 cursor-pointer ${
                isSelected
                  ? `${item.color} font-black shadow-2xs`
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Live Report Preview Box */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center justify-between">
          <span>보고 전송 텍스트 미리보기</span>
          <span className="text-blue-600 font-semibold">실시간 갱신됨</span>
        </div>
        <p className="text-xs font-mono font-medium text-slate-800 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs select-all">
          {reportPreviewText}
        </p>
      </div>
    </div>
  );
};
