'use client';

import React from 'react';
import { ClipboardCheck, Fuel, Plane, Eye } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface QuickActionBarProps {
  onOpenInspectionModal?: () => void;
  onOpenPresetModal?: () => void;
  onOpenAddModal?: () => void;
  onOpenGasModal?: () => void;
  onOpenFlightModal?: () => void;
  onOpenRoadviewModal?: () => void;
}

export const QuickActionBar: React.FC<QuickActionBarProps> = ({
  onOpenInspectionModal,
  onOpenPresetModal,
  onOpenAddModal,
  onOpenGasModal,
  onOpenFlightModal,
  onOpenRoadviewModal,
}) => {
  return (
    <div className="w-full bg-white border border-slate-100/80 rounded-2xl p-3.5 sm:p-4 shadow-[0_8px_25px_rgba(30,96,243,0.06)] select-none">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {/* 1. 차량체크 */}
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

        {/* 2. 즐겨찾기 */}
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-map-pin-plus w-5 h-5 sm:w-6 sm:h-6 stroke-[2]"
              aria-hidden="true"
            >
              <path d="M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738" />
              <circle cx="12" cy="10" r="3" />
              <path d="M16 18h6" />
              <path d="M19 15v6" />
            </svg>
          </div>
          <span className="mt-1.5 text-xs font-medium text-slate-700 text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full">
            즐겨찾기
          </span>
        </div>

        {/* 3. 주유 */}
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

        {/* 4. 항공편 */}
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

        {/* 5. 로드뷰 */}
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
  );
};

