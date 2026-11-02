'use client';

import React, { useState } from 'react';
import {
  FileText,
  Clock,
  Check,
  CheckCircle2,
  AlertTriangle,
  XCircle,
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
  onOpenExpenseDetail?: (log: HqDrivingLog) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  kpiCounts?: {
    totalToday: number;
    pending: number;
    approved: number;
    revision: number;
    rejected?: number;
    inProgressDrafts?: number;
  };
  selectedStatus?: HqDrivingLogStatus | '전체';
  onSelectStatus?: (status: HqDrivingLogStatus | '전체') => void;
}

export const HqDrivingLogsTable: React.FC<HqDrivingLogsTableProps> = ({
  logs,
  totalCount,
  selectedLogId,
  onSelectLog,
  onOpenExpenseDetail,
  pageSize,
  onPageSizeChange,
  currentPage,
  onPageChange,
  kpiCounts,
  selectedStatus,
  onSelectStatus,
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
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-amber-300 bg-amber-50 text-amber-700">
            <Clock className="w-3 h-3 stroke-[2.2]" />
            <span>진행 중 (초안)</span>
          </span>
        );
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
      {/* Table Header: Icon + Title + Count */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">운행일지 목록</h2>
          <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full text-xs">
            {totalCount}건
          </span>
        </div>

        {selectedIds.length > 0 && (
          <div className="text-xs font-semibold text-slate-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
            <span className="font-bold text-[#1E60F3]">{selectedIds.length}개</span> 항목 선택됨
          </div>
        )}
      </div>

      {/* Subheader: Guide & Counters (Matching Expenses pattern) */}
      <div className="px-5 py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="text-slate-400 font-medium">
          행을 누르면 운행 상세 정보와 영수증 내역 모달이 열려 편리하게 검수할 수 있어요.
        </div>
        {kpiCounts && (
          <div className="flex flex-wrap items-center gap-3.5 text-slate-500 font-medium shrink-0">
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                onSelectStatus?.('전체');
              }}
              className={`flex items-center gap-1 transition-colors cursor-pointer ${
                selectedStatus === '전체' ? 'text-[#1E60F3] font-bold' : 'hover:text-slate-800'
              }`}
              title="전체 운행일지 보기"
            >
              <span>오늘 제출 <strong className="text-slate-700 font-bold">{kpiCounts.totalToday}</strong></span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                onSelectStatus?.(selectedStatus === '검토 대기' ? '전체' : '검토 대기');
              }}
              className={`flex items-center gap-1 transition-colors cursor-pointer ${
                selectedStatus === '검토 대기' ? 'text-[#1E60F3] font-bold' : 'hover:text-slate-800'
              }`}
              title="검토 대기 필터"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>검토 대기 <strong className="text-slate-700 font-bold">{kpiCounts.pending}</strong></span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                onSelectStatus?.(selectedStatus === '승인 완료' ? '전체' : '승인 완료');
              }}
              className={`flex items-center gap-1 transition-colors cursor-pointer ${
                selectedStatus === '승인 완료' ? 'text-emerald-600 font-bold' : 'hover:text-slate-800'
              }`}
              title="승인 완료 필터"
            >
              <Check className="w-3.5 h-3.5 text-slate-400" />
              <span>승인 완료 <strong className="text-slate-700 font-bold">{kpiCounts.approved}</strong></span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                onSelectStatus?.(selectedStatus === '보완 필요' ? '전체' : '보완 필요');
              }}
              className={`flex items-center gap-1 transition-colors cursor-pointer ${
                selectedStatus === '보완 필요' || selectedStatus === '반려' ? 'text-rose-600 font-bold' : 'hover:text-slate-800'
              }`}
              title="보완 필요/반려 필터"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
              <span>보완 필요 <strong className="text-slate-700 font-bold">{kpiCounts.revision}</strong></span>
            </button>
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
              <th className="py-3 px-3 text-center">경비지출</th>
              <th className="py-3 px-3 text-center">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/90 text-slate-700 font-medium">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={15} className="py-12 text-center text-slate-400 text-xs">
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

                    {/* 차량: 차량번호 + 차량기종 함께 표시 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-bold text-slate-900 text-xs tracking-tight">
                        {log.vehiclePlate || '-'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {log.vehicleModel}
                      </div>
                    </td>

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

                    {/* 경비지출: 건수 위(중앙), 금액 아래(중앙) */}
                    <td className="py-3 px-3 text-center">
                      {log.expenseAmount > 0 || (log.expenseCount && log.expenseCount > 0) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            haptics.lightTap();
                            if (onOpenExpenseDetail) {
                              onOpenExpenseDetail(log);
                            } else {
                              onSelectLog(log);
                            }
                          }}
                          className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-xl bg-blue-50/70 hover:bg-blue-100 border border-blue-200/60 transition-all cursor-pointer group shadow-2xs hover:scale-105 active:scale-95"
                          title="경비 지출 상세 내역 확인하기"
                        >
                          <span className="text-[11px] font-extrabold text-slate-700 group-hover:text-slate-900 leading-tight">
                            {log.expenseCount ? `${log.expenseCount}건` : '1건'}
                          </span>
                          <span className="text-[11px] font-black text-[#1E60F3] group-hover:text-blue-700 leading-tight mt-0.5">
                            {log.expenseAmount.toLocaleString()}원
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-400 font-medium text-xs">-</span>
                      )}
                    </td>

                    {/* 상태 */}
                    <td className="py-3 px-3 text-center">{renderStatusBadge(log.status)}</td>
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
