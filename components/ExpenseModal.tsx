'use client';

import React, { useEffect } from 'react';
import { X, ReceiptText, ShieldCheck, ChevronRight, Sparkles } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const expenseCategories = [
    { name: '통행료', desc: '고속도로 및 유료도로 하이패스/현금 영수증' },
    { name: '주차비', desc: '공항, 호텔, 행사장 등 주차 정산 영수증' },
    { name: '주유비', desc: '지정 주유소 및 법인카드 유류비 영수증' },
    { name: '식비', desc: '대기 중 기사 식대 영수증' },
    { name: '숙박/기타', desc: '장거리 일정 숙박비 및 기타 부대비용' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1E60F3]">
              <ReceiptText className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">경비지출 관리</h2>
              <span className="text-[11px] text-slate-400">VIP 의전 경비 정산 전용</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 stroke-[2.2]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Status Alert Banner */}
          <div className="bg-gradient-to-r from-blue-50/80 via-sky-50/60 to-indigo-50/50 border border-blue-100/80 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#1E60F3]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>영수증 AI/OCR 및 상세 경비 모듈 준비 중</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              경비지출 상세 입력 및 영수증 자동 인식(OCR) 기능은 본사 가이드라인 및 디자인 승인 후 순차적으로 연결됩니다.
            </p>
          </div>

          {/* Categories Preview */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700">지원 정산 항목</span>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl bg-white overflow-hidden shadow-2xs">
              {expenseCategories.map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 text-xs">
                  <div>
                    <div className="font-bold text-slate-800">{cat.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{cat.desc}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-[#1E60F3] shrink-0" />
            <span>회사 법인 지출 규정에 따라 영수증 실물 및 사진 보관이 필요합니다.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-full py-3 bg-[#1E60F3] text-white text-xs font-bold rounded-xl shadow-[0_4px_12px_rgba(30,96,243,0.3)] hover:bg-blue-600 transition-all"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
