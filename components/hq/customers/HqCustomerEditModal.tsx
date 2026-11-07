'use client';

import { HqTextarea, HqButton } from '@/components/hq/ui';
import React, { useState } from 'react';
import { X, Heart, FileText, Check, Loader2 } from 'lucide-react';
import { HqCustomer } from '@/types/customerHq';
import { haptics } from '@/utils/haptics';

interface HqCustomerEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: HqCustomer;
  mode: 'preferences' | 'notes';
  onSave: (updatedCustomer: HqCustomer) => Promise<boolean> | void;
}

export const HqCustomerEditModal: React.FC<HqCustomerEditModalProps> = ({
  isOpen,
  onClose,
  customer,
  mode,
  onSave,
}) => {
  const [preferencesText, setPreferencesText] = useState(customer.preferences.join(', '));
  const [notesText, setNotesText] = useState(customer.notes.join('\n'));
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    let updatedCustomer: HqCustomer;
    if (mode === 'preferences') {
      const updatedPrefs = preferencesText
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      updatedCustomer = { ...customer, preferences: updatedPrefs };
    } else {
      const updatedNotes = notesText
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean);
      updatedCustomer = { ...customer, notes: updatedNotes };
    }

    try {
      const result = await onSave(updatedCustomer);
      if (result !== false) {
        haptics.success();
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17233B]/30 p-3 backdrop-blur-[2px] animate-in fade-in duration-150 sm:p-6">
      <div className="hq-customer-modal-a flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-[26px] bg-[#FAFBFD] shadow-[0_24px_64px_rgba(27,45,77,0.16),0_4px_14px_rgba(27,45,77,0.04)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 bg-white px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center gap-2">
            {mode === 'preferences' ? (
              <Heart className="size-5 text-[#73839D]" />
            ) : (
              <FileText className="size-5 text-[#73839D]" />
            )}
            <h2 className="text-[18px] font-bold tracking-[-0.025em] text-[#17233B]">
              {customer.name} - {mode === 'preferences' ? '주요 선호사항 수정' : '의전 메모 수정'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="수정 모달 닫기"
            className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#F7F9FC] text-[#73839D] transition-colors hover:bg-[#EDF1F6]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-5 text-[12px] font-medium text-[#4D607C] sm:p-6">
          {mode === 'preferences' ? (
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                선호사항 태그 (쉼표로 구분하여 입력)
              </label>
              <HqTextarea
                rows={4}
                value={preferencesText}
                onChange={(e) => setPreferencesText(e.target.value)}
                placeholder="예: S클래스 선호, 영어 가능 기사, 정시 출발 필수, 공항 CIQ 지원"
                
              />
              <p className="text-[10px] text-slate-400 mt-1">
                * 배차 시 기사님 및 관제 시스템에 우선 알림 항목으로 반영됩니다.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                관리자 내부 메모 (한 줄에 하나씩 입력)
              </label>
              <HqTextarea
                rows={6}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="의전 지침 및 주의사항을 입력하세요..."
                
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3">
            <HqButton variant="subtle"
              type="button"
              onClick={onClose}
              
            >
              취소
            </HqButton>
            <HqButton variant="primary"
              type="submit"
              disabled={isSaving}
              
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>저장 중...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>저장 완료</span>
                </>
              )}
            </HqButton>
          </div>
        </form>
      </div>
    </div>
  );
};
