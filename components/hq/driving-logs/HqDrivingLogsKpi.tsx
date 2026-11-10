'use client';

import React from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { HqDrivingLogStatus } from '@/types/drivingLogHq';
import { haptics } from '@/utils/haptics';

export interface HqDrivingLogsKpiProps {
  todaySubmittedCount: number;
  pendingCount: number;
  approvedCount: number;
  revisionNeededCount: number;
  activeStatusFilter: HqDrivingLogStatus | '전체';
  onSelectStatusFilter: (status: HqDrivingLogStatus | '전체') => void;
}

export const HqDrivingLogsKpi: React.FC<HqDrivingLogsKpiProps> = ({
  todaySubmittedCount,
  pendingCount,
  approvedCount,
  revisionNeededCount,
  activeStatusFilter,
  onSelectStatusFilter,
}) => {
  const cards = [
    {
      id: 'today_submitted',
      status: '전체' as const,
      title: '오늘 제출',
      count: todaySubmittedCount,
      trend: '전일 대비 +6',
      trendColor: 'text-[#1E60F3]',
      description: '오늘 제출된 운행일지',
      icon: FileText,
      iconBg: 'bg-blue-50 text-[#1E60F3]',
      activeBorder: 'border-[#1E60F3] ring-2 ring-blue-100',
    },
    {
      id: 'pending',
      status: '검토 대기' as const,
      title: '검토 대기',
      count: pendingCount,
      trend: '전일 대비 +2',
      trendColor: 'text-rose-500 font-bold',
      description: '관리자 검토가 필요한 건',
      icon: Clock,
      iconBg: 'bg-blue-50 text-[#1E60F3]',
      activeBorder: 'border-amber-400 ring-2 ring-amber-100',
    },
    {
      id: 'approved',
      status: '승인 완료' as const,
      title: '승인 완료',
      count: approvedCount,
      trend: '전일 대비 +5',
      trendColor: 'text-emerald-600 font-bold',
      description: '검토 후 승인 완료된 건',
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-600',
      activeBorder: 'border-emerald-500 ring-2 ring-emerald-100',
    },
    {
      id: 'revision_needed',
      status: '보완 필요' as const,
      title: '보완 필요',
      count: revisionNeededCount,
      trend: '전일 대비 -1',
      trendColor: 'text-rose-500 font-bold',
      description: '추가 확인이 필요한 건',
      icon: AlertTriangle,
      iconBg: 'bg-rose-50 text-rose-500',
      activeBorder: 'border-rose-400 ring-2 ring-rose-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeStatusFilter === card.status;

        return (
          <div
            key={card.id}
            onClick={() => {
              haptics.selection();
              onSelectStatusFilter(card.status);
            }}
            className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer shadow-2xs hover:shadow-md hover:-translate-y-0.5 group ${
              isSelected ? card.activeBorder : 'border-slate-200/80 hover:border-blue-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div
                className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center transition-transform group-hover:scale-105 shrink-0`}
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />
              </div>

              <div className="flex items-center text-slate-300 group-hover:text-[#1E60F3] transition-colors">
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3.5">
              <div className="text-xs font-bold text-slate-600 flex items-center justify-between">
                <span>{card.title}</span>
                <span className={`text-[11px] ${card.trendColor}`}>{card.trend}</span>
              </div>

              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {card.count}
                </span>
                <span className="text-sm font-bold text-slate-600">건</span>
              </div>

              <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                {card.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
