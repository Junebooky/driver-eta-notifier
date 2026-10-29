'use client';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0B1E48] to-[#123485] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'preferences' ? (
              <Heart className="w-4 h-4 text-rose-400" />
            ) : (
              <FileText className="w-4 h-4 text-amber-300" />
            )}
            <h2 className="text-sm font-black">
              {customer.name} - {mode === 'preferences' ? '주요 선호사항 수정' : '의전 메모 수정'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs font-medium text-slate-700">
          {mode === 'preferences' ? (
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                선호사항 태그 (쉼표로 구분하여 입력)
              </label>
              <textarea
                rows={4}
                value={preferencesText}
                onChange={(e) => setPreferencesText(e.target.value)}
                placeholder="예: S클래스 선호, 영어 가능 기사, 정시 출발 필수, 공항 CIQ 지원"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900 font-semibold"
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
              <textarea
                rows={6}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="의전 지침 및 주의사항을 입력하세요..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#1E60F3] outline-none text-slate-900 leading-relaxed"
              />
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 disabled:bg-blue-400 text-white text-xs font-bold shadow-sm cursor-pointer disabled:cursor-not-allowed transition-all"
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
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
