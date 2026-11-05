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
  BookOpen,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface QuickActionBarProps {
  isVipEnabled?: boolean;
  onOpenDrivingLogModal?: () => void;
  onOpenExpenseModal?: () => void;
  onOpenInspectionModal?: () => void;
  onOpenPresetModal?: () => void;
  onOpenAddModal?: () => void;
  onOpenGasModal?: () => void;
  onOpenFlightModal?: () => void;
  onOpenRoadviewModal?: () => void;
  onOpenFieldKnowledgeModal?: () => void;
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
  onOpenFieldKnowledgeModal,
}) => {
  const circleClass =
    'w-14 h-14 sm:w-15 sm:h-15 rounded-[20px] bg-[#F4F6FA] border border-transparent flex items-center justify-center text-[#1E293B] hover:bg-white hover:border-slate-100/80 hover:text-[#1E60F3] hover:shadow-[0_10px_24px_rgba(30,96,243,0.14),0_2px_8px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 active:scale-95 transition-all duration-200 group-hover:bg-white group-hover:border-slate-100/80 group-hover:text-[#1E60F3] group-hover:shadow-[0_10px_24px_rgba(30,96,243,0.14),0_2px_8px_rgba(15,23,42,0.06)] group-hover:-translate-y-0.5';

  const labelClass =
    'mt-2 text-xs sm:text-[13px] font-bold text-[#1E293B] text-center tracking-tight group-hover:text-[#1E60F3] transition-colors truncate w-full';

  return (
    <div className="w-full bg-white border border-slate-100/90 rounded-3xl p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] select-none">
      <div className="flex flex-col gap-4 sm:gap-5">
        {/* Row 1: 4 Buttons (운행일지, 경비지출, 차량체크, 즐겨찾기) */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
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
            <div className={circleClass}>
              <NotebookPen className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[1.9]" />
            </div>
            <span className={labelClass}>
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
            <div className={circleClass}>
              <ReceiptText className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[1.9]" />
            </div>
            <span className={labelClass}>
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
            <div className={circleClass}>
              <ClipboardCheck className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[1.9]" />
            </div>
            <span className={labelClass}>
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
            <div className={circleClass}>
              <MapPinPlus className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[1.9]" />
            </div>
            <span className={labelClass}>
              즐겨찾기
            </span>
          </div>
        </div>

        {/* Row 2: 4 Buttons (주유, 항공편, 로드뷰, 현장지식) */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
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
            <div className={circleClass}>
              <Fuel className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[1.9]" />
            </div>
            <span className={labelClass}>
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
            <div className={circleClass}>
              <Plane className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[1.9]" />
            </div>
            <span className={labelClass}>
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
            <div className={circleClass}>
              <Eye className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[1.9]" />
            </div>
            <span className={labelClass}>
              로드뷰
            </span>
          </div>

          {/* 8. 현장지식 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              haptics.lightTap();
              onOpenFieldKnowledgeModal?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenFieldKnowledgeModal?.();
              }
            }}
            className="flex flex-col items-center cursor-pointer group"
            title="주요 거점 진입로 및 현장 지식 가이드"
          >
            <div className={circleClass}>
              <BookOpen className="w-5.5 h-5.5 sm:w-6 sm:h-6 stroke-[1.9]" />
            </div>
            <span className={labelClass}>
              현장지식
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
