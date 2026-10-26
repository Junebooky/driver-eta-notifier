'use client';

import React from 'react';
import {
  Calendar,
  Users,
  FileText,
  Send,
  RefreshCw,
  ClipboardCheck,
  Receipt,
  ChevronRight,
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
        return <Users className="w-4 h-4 text-rose-500" />;
      case 'document':
        return <FileText className="w-4 h-4 text-[#1E60F3]" />;
      case 'send':
        return <Send className="w-4 h-4 text-amber-500" />;
      case 'refresh':
        return <RefreshCw className="w-4 h-4 text-rose-500" />;
      case 'clipboard':
        return <ClipboardCheck className="w-4 h-4 text-[#1E60F3]" />;
      case 'receipt':
        return <Receipt className="w-4 h-4 text-[#1E60F3]" />;
      default:
        return <Calendar className="w-4 h-4 text-slate-500" />;
    }
  };

  const getIconBg = (type: HqKpiMetric['iconType']) => {
    switch (type) {
      case 'users':
      case 'refresh':
        return 'bg-rose-50';
      case 'send':
        return 'bg-amber-50';
      default:
        return 'bg-blue-50';
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 w-full">
      {metrics.map((m) => {
        const isSelected = activeFilter === m.id;
        const isRed = m.iconType === 'users' || m.iconType === 'refresh';

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
            className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer group active:scale-[0.98] flex flex-col justify-between ${
              isSelected
                ? 'bg-blue-50/50 border-[#1E60F3] ring-2 ring-blue-100 shadow-sm'
                : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
            }`}
          >
            {/* Top Row: Icon + Title + Chevron */}
            <div className="flex items-center justify-between gap-1 w-full">
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  className={`w-6 h-6 rounded-lg ${getIconBg(
                    m.iconType
                  )} flex items-center justify-center shrink-0`}
                >
                  {getIcon(m.iconType)}
                </div>
                <span className="text-xs font-bold text-slate-700 truncate">
                  {m.title}
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
            </div>

            {/* Value Counter */}
            <div className="mt-2 flex items-baseline gap-1">
              <span
                className={`text-2xl font-black tracking-tight ${
                  isRed ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {m.count}
              </span>
              <span className="text-xs font-bold text-slate-500">건</span>
            </div>

            {/* Subtext and Trends */}
            <div className="mt-1.5 space-y-0.5">
              {m.trendText ? (
                <div
                  className={`text-[11px] font-bold ${
                    m.trendColor === 'red'
                      ? 'text-rose-500'
                      : m.trendColor === 'blue'
                      ? 'text-[#1E60F3]'
                      : 'text-slate-500'
                  }`}
                >
                  {m.trendText}
                </div>
              ) : null}
              <div className="text-[10px] text-slate-400 font-medium truncate">
                {m.subtext}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
