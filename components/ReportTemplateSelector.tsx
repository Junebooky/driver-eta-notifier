'use client';

import React from 'react';
import { ReportMode } from '@/types';
import { FileText, Send, CheckCircle2, Clock, Car } from 'lucide-react';

interface ReportTemplateSelectorProps {
  currentMode: ReportMode;
  onSelectMode: (mode: ReportMode) => void;
  reportPreviewText: string;
}

const TEMPLATES: { mode: ReportMode; label: string; icon: React.ReactNode; color: string }[] = [
  { mode: 'DEPARTURE', label: '[출발/이동]', icon: <Send className="w-3.5 h-3.5" />, color: 'border-blue-500 text-blue-400 bg-blue-500/10' },
  { mode: 'ARRIVED', label: '[도착/하차]', icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'border-emerald-500 text-emerald-400 bg-emerald-500/10' },
  { mode: 'WAITING', label: '[현장 대기]', icon: <Clock className="w-3.5 h-3.5" />, color: 'border-amber-500 text-amber-400 bg-amber-500/10' },
  { mode: 'RETURN', label: '[차량 반납]', icon: <Car className="w-3.5 h-3.5" />, color: 'border-purple-500 text-purple-400 bg-purple-500/10' },
];

export const ReportTemplateSelector: React.FC<ReportTemplateSelectorProps> = ({
  currentMode,
  onSelectMode,
  reportPreviewText,
}) => {
  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-md space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center">
          <FileText className="w-3.5 h-3.5 mr-1.5 text-blue-400" /> 단톡방 현장 보고 모드
        </h3>
        <span className="text-[11px] text-zinc-500 font-medium">원터치 템플릿</span>
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((item) => {
          const isSelected = currentMode === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => onSelectMode(item.mode)}
              className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center space-x-1.5 active:scale-95 ${
                isSelected
                  ? `${item.color} ring-2 ring-blue-500/40 shadow-sm font-extrabold`
                  : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Live Report Preview Box */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
        <div className="text-[10px] font-bold text-zinc-500 uppercase mb-1 flex items-center justify-between">
          <span>보고 전송 텍스트 미리보기</span>
          <span className="text-blue-400 font-semibold">자동 갱신됨</span>
        </div>
        <p className="text-xs font-mono font-medium text-zinc-200 leading-relaxed bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800 select-all">
          {reportPreviewText}
        </p>
      </div>
    </div>
  );
};
