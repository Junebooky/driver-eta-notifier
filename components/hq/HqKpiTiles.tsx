'use client';

import React from 'react';
import {
  Calendar,
  Users,
  FileText,
  Send,
  RefreshCw,
  Mail,
  Layers,
} from 'lucide-react';
import { HqKpiMetric } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqKpiTilesProps {
  metrics: HqKpiMetric[];
  activeFilter?: string | null;
  onSelectMetric: (metricId: string) => void;
}

export const HqKpiTiles: React.FC<HqKpiTilesProps> = ({
  metrics,
  activeFilter,
  onSelectMetric,
}) => {
  const getIcon = (type: HqKpiMetric['iconType']) => {
    switch (type) {
      case 'calendar':
        return <Calendar className="w-4 h-4 text-[#1E60F3]" />;
      case 'users':
        return <Users className="w-4 h-4 text-[#1E60F3]" />;
      case 'document':
        return <FileText className="w-4 h-4 text-[#1E60F3]" />;
      case 'send':
        return <Send className="w-4 h-4 text-[#1E60F3]" />;
      case 'refresh':
        return <RefreshCw className="w-4 h-4 text-[#1E60F3]" />;
      case 'mail':
        return <Mail className="w-4 h-4 text-[#1E60F3]" />;
      case 'group':
        return <Layers className="w-4 h-4 text-[#1E60F3]" />;
      default:
        return <Calendar className="w-4 h-4 text-[#1E60F3]" />;
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 w-full">
      {metrics.map((m) => {
        const isSelected = activeFilter === m.id;

        return (
          <div
            key={m.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              onSelectMetric(m.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                haptics.lightTap();
                onSelectMetric(m.id);
              }
            }}
            className={`p-4 rounded-2xl border transition-all text-left cursor-pointer group active:scale-[0.98] flex items-center gap-3.5 bg-white shadow-xs ${
              isSelected
                ? 'border-[#1E60F3] ring-2 ring-blue-100 bg-blue-50/30'
                : 'border-slate-200/80 hover:border-blue-400 hover:shadow-sm'
            }`}
          >
            {/* Circular Blue Icon */}
            <div className="w-10 h-10 rounded-full bg-blue-50/90 text-[#1E60F3] flex items-center justify-center shrink-0 border border-blue-100/60 shadow-2xs">
              {getIcon(m.iconType)}
            </div>

            {/* Metric Labels */}
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold text-slate-500 block truncate leading-tight">
                {m.title}
              </span>
              <div className="flex items-baseline gap-0.5 mt-0.5 leading-tight">
                <span className="text-xl font-black text-slate-900 tracking-tight">
                  {m.count}
                </span>
                <span className="text-xs font-black text-slate-900">건</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5 leading-tight">
                {m.subtext}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
