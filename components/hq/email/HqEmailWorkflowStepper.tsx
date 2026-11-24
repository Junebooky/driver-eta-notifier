'use client';

import React from 'react';
import {
  Mail,
  Sparkles,
  FileEdit,
  BookmarkCheck,
  Car,
  Check,
  ChevronRight,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

export type WorkflowStepId = 1 | 2 | 3 | 4 | 5;

export interface WorkflowStepMeta {
  id: WorkflowStepId;
  label: string;
  sublabel: string;
  shortLabel: string;
  icon: React.ElementType;
}

export const WORKFLOW_STEPS: WorkflowStepMeta[] = [
  {
    id: 1,
    label: '메일 확인',
    sublabel: '도착한 메일 읽기',
    shortLabel: '메일',
    icon: Mail,
  },
  {
    id: 2,
    label: 'AI 정리',
    sublabel: '핵심 정보 쏙쏙',
    shortLabel: 'AI 정리',
    icon: Sparkles,
  },
  {
    id: 3,
    label: '예약 검토',
    sublabel: '일정과 경로 확인',
    shortLabel: '내용 검토',
    icon: FileEdit,
  },
  {
    id: 4,
    label: '예약 확정',
    sublabel: '정식 등록하기',
    shortLabel: '예약 확정',
    icon: BookmarkCheck,
  },
  {
    id: 5,
    label: '기사님 배정',
    sublabel: '배차 알림 보내기',
    shortLabel: '기사 배정',
    icon: Car,
  },
];

export interface HqEmailWorkflowStepperProps {
  currentStep: WorkflowStepId;
  isExtractingAi?: boolean;
  hasDraft?: boolean;
  isDispatchDone?: boolean;
  onStepClick?: (step: WorkflowStepId) => void;
}

export const HqEmailWorkflowStepper: React.FC<HqEmailWorkflowStepperProps> = ({
  currentStep,
  isExtractingAi = false,
  hasDraft = false,
  isDispatchDone = false,
  onStepClick,
}) => {
  return (
    <div className="bg-white px-3.5 sm:px-5 py-2.5 sm:py-3">
      {/* Desktop / Tablet Stepper (>= md) */}
      <div className="hidden md:flex items-center justify-between gap-1 lg:gap-2">
        {WORKFLOW_STEPS.map((step, idx) => {
          const isCompleted = isDispatchDone
            ? true
            : currentStep > step.id || (step.id === 2 && hasDraft && currentStep >= 3);
          const isActive = !isDispatchDone && currentStep === step.id;
          const isClickable = Boolean(
            onStepClick && (isCompleted || (step.id === 3 && hasDraft) || (step.id === 5 && currentStep >= 5))
          );
          const Icon = step.icon;

          return (
            <React.Fragment key={step.id}>
              <div
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={() => {
                  if (isClickable && onStepClick) {
                    haptics.selection();
                    onStepClick(step.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (isClickable && onStepClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onStepClick(step.id);
                  }
                }}
                className={`flex-1 py-1.5 px-2.5 rounded-xl border transition-all duration-200 flex items-center gap-2.5 select-none ${isActive
                    ? 'border-[#1E60F3] bg-blue-50/70 shadow-xs ring-1 ring-[#1E60F3]/30'
                    : isCompleted
                      ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                      : 'border-slate-100 bg-slate-50/50 text-slate-400 opacity-60'
                  } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {/* Step Circle / Badge */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all ${isCompleted
                      ? 'bg-[#1E60F3] text-white shadow-2xs'
                      : isActive
                        ? 'bg-[#1E60F3] text-white shadow-[0_2px_8px_rgba(30,96,243,0.35)] animate-pulse'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : step.id}
                </div>

                {/* Text Labels */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs tracking-tight truncate ${isActive
                          ? 'font-black text-[#1E60F3]'
                          : isCompleted
                            ? 'font-extrabold text-slate-800'
                            : 'font-medium text-slate-400'
                        }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  <p
                    className={`text-[10px] truncate leading-tight ${isActive ? 'text-blue-600 font-semibold' : 'text-slate-400 font-medium'
                      }`}
                  >
                    {isActive && isExtractingAi && step.id === 2
                      ? 'Flash-Lite 분석 중...'
                      : step.sublabel}
                  </p>
                </div>
              </div>

              {/* Connecting Chevron */}
              {idx < WORKFLOW_STEPS.length - 1 && (
                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 ${isCompleted ? 'text-[#1E60F3]' : 'text-slate-300'
                    }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile Stepper (< md): Compact Horizontal Scroll Strip */}
      <div className="flex md:hidden items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
        {WORKFLOW_STEPS.map((step) => {
          const isCompleted = isDispatchDone
            ? true
            : currentStep > step.id || (step.id === 2 && hasDraft && currentStep >= 3);
          const isActive = !isDispatchDone && currentStep === step.id;
          const isClickable = Boolean(
            onStepClick && (isCompleted || (step.id === 3 && hasDraft) || (step.id === 5 && currentStep >= 5))
          );

          return (
            <button
              key={step.id}
              type="button"
              disabled={!isClickable}
              onClick={() => {
                if (isClickable && onStepClick) {
                  haptics.selection();
                  onStepClick(step.id);
                }
              }}
              className={`px-2.5 py-1.5 rounded-full text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all ${isActive
                  ? 'bg-[#1E60F3] text-white shadow-xs'
                  : isCompleted
                    ? 'bg-blue-50 text-[#1E60F3] border border-blue-200'
                    : 'bg-slate-100 text-slate-400'
                }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${isActive
                    ? 'bg-white text-[#1E60F3]'
                    : isCompleted
                      ? 'bg-[#1E60F3] text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
              >
                {isCompleted ? '✓' : step.id}
              </span>
              <span className="truncate">{step.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
