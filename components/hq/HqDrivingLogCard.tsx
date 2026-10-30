'use client';

import React from 'react';
import { FileSpreadsheet, ChevronRight } from 'lucide-react';
import { HqDrivingLogItem } from '@/types/hq';
import { haptics } from '@/utils/haptics';

export interface HqDrivingLogCardProps {
  logs: HqDrivingLogItem[];
  onViewAll?: () => void;
  onSelectLog?: (log: HqDrivingLogItem) => void;
}

export const HqDrivingLogCard: React.FC<HqDrivingLogCardProps> = ({
  logs,
  onViewAll,
  onSelectLog,
}) => {
  const getStatusBadge = (status: HqDrivingLogItem['status']) => {
    switch (status) {
      case '검토 대기':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            검토 대기
          </span>
        );
      case '검토 중':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#1E60F3] border border-blue-200">
            검토 중
          </span>
        );
      case '승인 완료':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            승인 완료
          </span>
        );
      case '보완 필요':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            보완 필요
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            운행일지 검토
          </h3>
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.lightTap();
            onViewAll?.();
          }}
          className="text-[11px] font-bold text-[#1E60F3] hover:underline flex items-center gap-0.5 cursor-pointer"
        >
          <span>전체보기</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto pt-2">
        <table className="w-full text-left text-xs select-none">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
              <th className="py-2 px-1">제출일</th>
              <th className="py-2 px-1">기사명</th>
              <th className="py-2 px-1">차량</th>
              <th className="py-2 px-1">운행시간</th>
              <th className="py-2 px-1 text-right">주행거리</th>
              <th className="py-2 px-1 text-right">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/70">
            {logs.map((log) => (
              <tr
                key={log.id}
                onClick={() => {
                  haptics.lightTap();
                  onSelectLog?.(log);
                }}
                className="hover:bg-slate-50 transition-colors cursor-pointer group"
              >
                <td className="py-2.5 px-1 text-slate-500 font-medium whitespace-nowrap text-[11px]">
                  {log.submittedAt}
                </td>
                <td className="py-2.5 px-1 font-bold text-slate-900 group-hover:text-[#1E60F3] transition-colors whitespace-nowrap">
                  {log.driverName}
                </td>
                <td className="py-2.5 px-1 text-slate-600 font-medium whitespace-nowrap text-[11px]">
                  {log.vehicleModel}
                </td>
                <td className="py-2.5 px-1 text-slate-500 font-semibold whitespace-nowrap text-[11px]">
                  {log.dutyTime}
                </td>
                <td className="py-2.5 px-1 text-right font-bold text-slate-800 whitespace-nowrap">
                  {log.mileageKm} km
                </td>
                <td className="py-2.5 px-1 text-right whitespace-nowrap">
                  {getStatusBadge(log.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
