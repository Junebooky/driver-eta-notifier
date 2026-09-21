'use client';

import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, Check, LogOut } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onToggleAdmin: (status: boolean) => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  onToggleAdmin,
}) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdmin) {
      // Toggle off
      haptics.lightTap();
      onToggleAdmin(false);
      onClose();
      return;
    }

    if (pin === '1010') {
      haptics.successPulse();
      setErrorMsg('');
      setPin('');
      onToggleAdmin(true);
      onClose();
    } else {
      haptics.errorAlert();
      setErrorMsg('비밀번호(PIN)가 일치하지 않습니다.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 text-slate-900 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-[#1E60F3]/10 text-[#1E60F3] flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">관리자 모드</h3>
              <p className="text-[11px] text-slate-400 font-medium">전사 공통 거점 관리</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isAdmin ? (
          <div className="space-y-3 pt-1">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-1">
              <span className="inline-flex items-center gap-1 text-xs font-black text-[#1E60F3]">
                <Check className="w-3.5 h-3.5" /> 관리자 권한 활성화됨
              </span>
              <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                현재 추가 또는 삭제하는 거점은 전사 공통 거점(is_global = true)으로 모든 기사에게 반영됩니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onToggleAdmin(false);
                onClose();
              }}
              className="w-full py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>관리자 모드 종료 (일반 기사 모드로 전환)</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                마스터 PIN 입력
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="PIN 4자리 입력 (기본: 1010)"
                autoFocus
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg tracking-widest font-black focus:outline-none focus:border-[#1E60F3] focus:bg-white"
              />
              {errorMsg && (
                <p className="text-[11px] font-bold text-rose-500 mt-1 text-center">
                  {errorMsg}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!pin}
              className="w-full py-3 bg-[#1E60F3] hover:bg-[#1850db] disabled:opacity-50 text-white rounded-xl text-xs font-extrabold shadow-sm active:scale-98 transition-all cursor-pointer"
            >
              관리자 모드 활성화
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
