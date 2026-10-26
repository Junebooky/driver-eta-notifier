'use client';

import React, { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { HqDrivingLog, HqDrivingLogStatus } from '@/types/drivingLogHq';
import { haptics } from '@/utils/haptics';

export interface HqDrivingLogsTableProps {
  logs: HqDrivingLog[];
  totalCount: number;
  selectedLogId: string | null;
  onSelectLog: (log: HqDrivingLog) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export const HqDrivingLogsTable: React.FC<HqDrivingLogsTableProps> = ({
  logs,
  totalCount,
  selectedLogId,
  onSelectLog,
  pageSize,
  onPageSizeChange,
  currentPage,
  onPageChange,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Toggle select all on current page
  const handleToggleSelectAll = () => {
    haptics.selection();
    if (selectedIds.length === logs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(logs.map((l) => l.id));
    }
  };

  const handleToggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.selection();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Render Status Badge matching Image 1
  const renderStatusBadge = (status: HqDrivingLogStatus) => {
    switch (status) {
      case '검토 대기':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-blue-200 bg-blue-50/70 text-[#1E60F3]">
            <Clock className="w-3 h-3 stroke-[2.2]" />
            <span>검토 대기</span>
          </span>
        );
      case '검토 중':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-sky-300 bg-sky-50 text-sky-700">
            <Clock className="w-3 h-3 stroke-[2.2]" />
            <span>검토 중</span>
          </span>
        );
      case '승인 완료':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-emerald-300 bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-3 h-3 stroke-[2.2]" />
            <span>승인 완료</span>
          </span>
        );
      case '보완 필요':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-rose-300 bg-rose-50 text-rose-600">
            <AlertTriangle className="w-3 h-3 stroke-[2.2]" />
            <span>보완 필요</span>
          </span>
        );
      case '반려':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-red-300 bg-red-50 text-red-600">
            <XCircle className="w-3 h-3 stroke-[2.2]" />
            <span>반려</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
      {/* Table Header / Title */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">운행일지 목록</h2>
          <span className="text-xs font-black text-[#1E60F3] ml-1">총 {totalCount}건</span>
        </div>

        {selectedIds.length > 0 && (
          <div className="text-xs font-semibold text-slate-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
            <span className="font-bold text-[#1E60F3]">{selectedIds.length}개</span> 항목 선택됨
          </div>
        )}
      </div>

      {/* Table Container with Horizontal Scroll */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-3 text-center w-8">
                <input
                  type="checkbox"
                  checked={logs.length > 0 && selectedIds.length === logs.length}
                  onChange={handleToggleSelectAll}
                  className="rounded border-slate-300 text-[#1E60F3] focus:ring-[#1E60F3] cursor-pointer"
                />
              </th>
              <th className="py-3 px-2 text-center w-10">No.</th>
              <th className="py-3 px-3">제출일</th>
              <th className="py-3 px-2">운행일</th>
              <th className="py-3 px-3">기사명</th>
              <th className="py-3 px-3">고객명</th>
              <th className="py-3 px-3">차량</th>
              <th className="py-3 px-2 text-center">출근시간</th>
              <th className="py-3 px-2 text-center">퇴근시간</th>
              <th className="py-3 px-3 text-center">총 근무시간</th>
              <th className="py-3 px-2 text-right">시작 km</th>
              <th className="py-3 px-2 text-right">종료 km</th>
              <th className="py-3 px-3 text-right">운행합</th>
              <th className="py-3 px-3 text-right">경비지출</th>
              <th className="py-3 px-3 text-center">상태</th>
              <th className="py-3 px-3 text-center">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/90 text-slate-700 font-medium">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={16} className="py-12 text-center text-slate-400 text-xs">
                  조건에 해당하는 운행일지가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isSelected = selectedLogId === log.id;
                const isChecked = selectedIds.includes(log.id);

                return (
                  <tr
                    key={log.id}
                    onClick={() => {
                      haptics.selection();
                      onSelectLog(log);
                    }}
                    className={`transition-colors cursor-pointer hover:bg-blue-50/40 ${
                      isSelected ? 'bg-blue-50/80 font-semibold text-slate-900 ring-1 ring-inset ring-[#1E60F3]/30' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(e) => handleToggleSelectOne(log.id, e)}
                        onChange={() => {}}
                        className="rounded border-slate-300 text-[#1E60F3] focus:ring-[#1E60F3] cursor-pointer"
                      />
                    </td>

                    {/* No. */}
                    <td className="py-3 px-2 text-center text-slate-400 text-[11px] font-bold">
                      {log.no}
                    </td>

                    {/* 제출일 */}
                    <td className="py-3 px-3 text-slate-500 font-normal">{log.submittedAt}</td>

                    {/* 운행일 */}
                    <td className="py-3 px-2 font-bold text-slate-800">{log.drivingDate}</td>

                    {/* 기사명 */}
                    <td className="py-3 px-3 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{log.driverName}</span>
                        {log.isDriverSubmitted && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="기사 직접 제출건" />
                        )}
                      </div>
                    </td>

                    {/* 고객명 */}
                    <td className="py-3 px-3 text-slate-800 font-semibold">{log.customerName}</td>

                    {/* 차량 */}
                    <td className="py-3 px-3 text-slate-600">{log.vehicleModel}</td>

                    {/* 출근시간 */}
                    <td className="py-3 px-2 text-center text-slate-600">{log.clockIn}</td>

                    {/* 퇴근시간 */}
                    <td className="py-3 px-2 text-center text-slate-600">{log.clockOut}</td>

                    {/* 총 근무시간 */}
                    <td className="py-3 px-3 text-center font-bold text-slate-800">
                      {log.totalDutyHours}
                    </td>

                    {/* 시작 km */}
                    <td className="py-3 px-2 text-right text-slate-500">{log.startKm}</td>

                    {/* 종료 km */}
                    <td className="py-3 px-2 text-right text-slate-500">{log.endKm}</td>

                    {/* 운행합 */}
                    <td className="py-3 px-3 text-right font-extrabold text-[#1E60F3]">
                      {log.distanceKm}
                    </td>

                    {/* 경비지출 */}
                    <td className="py-3 px-3 text-right font-bold text-slate-800">
                      {log.expenseAmount > 0 ? `${log.expenseAmount.toLocaleString()}원` : '-'}
                    </td>

                    {/* 상태 */}
                    <td className="py-3 px-3 text-center">{renderStatusBadge(log.status)}</td>

                    {/* 작업 */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            haptics.lightTap();
                            onSelectLog(log);
                          }}
                          className="px-2 py-0.5 border border-slate-200 hover:border-[#1E60F3] hover:text-[#1E60F3] rounded text-[11px] font-bold text-slate-600 transition-colors"
                        >
                          보기
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            haptics.lightTap();
                            onSelectLog(log);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer matching Image 1 */}
      <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
        {/* Page size dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              haptics.selection();
              onPageSizeChange(Number(e.target.value));
            }}
            className="pl-2.5 pr-6 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer"
          >
            <option value={10}>10개씩 보기</option>
            <option value={20}>20개씩 보기</option>
            <option value={50}>50개씩 보기</option>
          </select>
        </div>

        {/* Page navigation buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => {
              haptics.selection();
              onPageChange(currentPage - 1);
            }}
            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {Array.from({ length: totalPages }).map((_, i) => {
            const pageNum = i + 1;
            const isCurrent = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => {
                  haptics.selection();
                  onPageChange(pageNum);
                }}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-[#1E60F3] text-white shadow-xs'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => {
              haptics.selection();
              onPageChange(currentPage + 1);
            }}
            className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
