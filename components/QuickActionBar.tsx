'use client';

import React from 'react';
import {
  NotebookPen,
  ReceiptText,
  ClipboardCheck,
  Fuel,
  Plane,
  Eye,
  MapPinPlus,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface QuickActionBarProps {
  onOpenDrivingLogModal?: () => void;
  onOpenExpenseModal?: () => void;
  onOpenInspectionModal?: () => void;
  onOpenPresetModal?: () => void;
  onOpenAddModal?: () => void;
  onOpenGasModal?: () => void;
  onOpenFlightModal?: () => void;
  onOpenRoadviewModal?: () => void;
}

export const QuickActionBar: React.FC<QuickActionBarProps> = ({
  onOpenDrivingLogModal,
  onOpenExpenseModal,
  onOpenInspectionModal,
  onOpenPresetModal,
  onOpenAddModal,
  onOpenGasModal,
  onOpenFlightModal,
  onOpenRoadviewModal,
}) => {
  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-3.5 sm:p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] select-none">
      <div className="flex flex-col gap-3 sm:gap-3.5">
        {/* Row 1: 4 Buttons (운행일지, 경비지출, 차량체크, 즐겨찾기) */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {/* 1. 운행일지 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              onOpenDrivingLogModal?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenDrivingLogModal?.();
              }
            }}
            className="flex flex-col items-center cursor-pointer group"
            title="당일 운행일지 작성 및 확인"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/50 hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 group-hover:border-[#1E60F3] group-hover:text-[#1E60F3] group-hover:bg-blue-50/50 group-hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] group-hover:-translate-y-0.5">
              <NotebookPen className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </div>
            <span className="mt-1.5 text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full">
              운행일지
            </span>
          </div>

          {/* 2. 경비지출 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              onOpenExpenseModal?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenExpenseModal?.();
              }
            }}
            className="flex flex-col items-center cursor-pointer group"
            title="통행료·주차비 등 경비지출 관리"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/50 hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 group-hover:border-[#1E60F3] group-hover:text-[#1E60F3] group-hover:bg-blue-50/50 group-hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] group-hover:-translate-y-0.5">
              <ReceiptText className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </div>
            <span className="mt-1.5 text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full">
              경비지출
            </span>
          </div>

          {/* 3. 차량체크 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              onOpenInspectionModal?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenInspectionModal?.();
              }
            }}
            className="flex flex-col items-center cursor-pointer group"
            title="차량 인수·반납 체크"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/50 hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 group-hover:border-[#1E60F3] group-hover:text-[#1E60F3] group-hover:bg-blue-50/50 group-hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] group-hover:-translate-y-0.5">
              <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </div>
            <span className="mt-1.5 text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full">
              차량체크
            </span>
          </div>

          {/* 4. 즐겨찾기 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              if (onOpenPresetModal) {
                onOpenPresetModal();
              } else if (onOpenAddModal) {
                onOpenAddModal();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (onOpenPresetModal) onOpenPresetModal();
                else if (onOpenAddModal) onOpenAddModal();
              }
            }}
            className="flex flex-col items-center cursor-pointer group"
            title="거점 및 목적지 관리"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/50 hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 group-hover:border-[#1E60F3] group-hover:text-[#1E60F3] group-hover:bg-blue-50/50 group-hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] group-hover:-translate-y-0.5">
              <MapPinPlus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </div>
            <span className="mt-1.5 text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full">
              즐겨찾기
            </span>
          </div>
        </div>

        {/* Row 2: 3 Buttons Centered (주유, 항공편, 로드뷰) */}
        <div className="grid grid-cols-3 max-w-[75%] mx-auto w-full gap-1.5 sm:gap-2">
          {/* 5. 주유 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              onOpenGasModal?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenGasModal?.();
              }
            }}
            className="flex flex-col items-center cursor-pointer group"
            title="주변 주유소 실시간 유가 조회"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/50 hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 group-hover:border-[#1E60F3] group-hover:text-[#1E60F3] group-hover:bg-blue-50/50 group-hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] group-hover:-translate-y-0.5">
              <Fuel className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </div>
            <span className="mt-1.5 text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full">
              주유
            </span>
          </div>

          {/* 6. 항공편 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              onOpenFlightModal?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenFlightModal?.();
              }
            }}
            className="flex flex-col items-center cursor-pointer group"
            title="인천공항 실시간 운항 정보"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/50 hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 group-hover:border-[#1E60F3] group-hover:text-[#1E60F3] group-hover:bg-blue-50/50 group-hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] group-hover:-translate-y-0.5">
              <Plane className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </div>
            <span className="mt-1.5 text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full">
              항공편
            </span>
          </div>

          {/* 7. 로드뷰 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              onOpenRoadviewModal?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenRoadviewModal?.();
              }
            }}
            className="flex flex-col items-center cursor-pointer group"
            title="현장 로드뷰 및 진입로 사전 답사"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center text-slate-700 hover:border-[#1E60F3] hover:text-[#1E60F3] hover:bg-blue-50/50 hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 group-hover:border-[#1E60F3] group-hover:text-[#1E60F3] group-hover:bg-blue-50/50 group-hover:shadow-[0_4px_14px_rgba(30,96,243,0.18)] group-hover:-translate-y-0.5">
              <Eye className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2]" />
            </div>
            <span className="mt-1.5 text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full">
              로드뷰
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
