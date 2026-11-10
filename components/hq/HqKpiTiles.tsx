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
  AlertTriangle,
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
  const getIcon = (m: HqKpiMetric) => {
    const colorClass =
      m.urgencyLevel === 'urgent' && m.count > 0
        ? 'text-rose-600'
        : m.urgencyLevel === 'warning' && m.count > 0
        ? 'text-amber-600'
        : 'text-[#1E60F3]';

    switch (m.iconType) {
      case 'calendar':
        return <Calendar className={`w-4 h-4 ${colorClass}`} />;
      case 'users':
        return <Users className={`w-4 h-4 ${colorClass}`} />;
      case 'document':
        return <FileText className={`w-4 h-4 ${colorClass}`} />;
      case 'send':
        return <Send className={`w-4 h-4 ${colorClass}`} />;
      case 'refresh':
        return <RefreshCw className={`w-4 h-4 ${colorClass}`} />;
      case 'clipboard':
        return <AlertTriangle className={`w-4 h-4 ${colorClass}`} />;
      case 'mail':
        return <Mail className={`w-4 h-4 ${colorClass}`} />;
      case 'group':
        return <Layers className={`w-4 h-4 ${colorClass}`} />;
      default:
        return <Calendar className={`w-4 h-4 ${colorClass}`} />;
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5 sm:gap-3 w-full">
      {metrics.map((m) => {
        const isSelected = activeFilter === m.id;
        const isUrgentActive = m.urgencyLevel === 'urgent' && m.count > 0;
        const isWarningActive = m.urgencyLevel === 'warning' && m.count > 0;

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
            className={`p-3 sm:p-4 rounded-2xl border transition-all text-left cursor-pointer group active:scale-[0.98] flex items-center gap-3 bg-white shadow-xs ${
              isSelected
                ? 'border-[#1E60F3] ring-2 ring-blue-100 bg-blue-50/30'
                : isUrgentActive
                ? 'border-rose-300 bg-rose-50/20 hover:border-rose-400'
                : isWarningActive
                ? 'border-amber-200 hover:border-amber-400'
                : 'border-slate-200/80 hover:border-blue-400 hover:shadow-sm'
            }`}
          >
            {/* Circular Icon */}
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 border shadow-2xs ${
                isUrgentActive
                  ? 'bg-rose-50 border-rose-200'
                  : isWarningActive
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-blue-50/90 border-blue-100/60'
              }`}
            >
              {getIcon(m)}
            </div>

            {/* Metric Labels */}
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold text-slate-500 block truncate leading-tight">
                {m.title}
              </span>
              <div className="flex items-baseline gap-0.5 mt-0.5 leading-tight">
                <span
                  className={`text-lg sm:text-xl font-black tracking-tight ${
                    isUrgentActive
                      ? 'text-rose-600'
                      : isWarningActive
                      ? 'text-amber-700'
                      : 'text-slate-900'
                  }`}
                >
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
