'use client';

import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, LogOut } from 'lucide-react';
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

  const handleClose = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setErrorMsg('');
    setPin('');
    onClose();
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const numericVal = rawVal.replace(/[^0-9]/g, '').slice(0, 4);
    setPin(numericVal);
    setErrorMsg('');

    // [태스크 2] 4자리 입력 즉시 자동 인증 (Auto-Submit)
    if (numericVal.length === 4) {
      if (numericVal === '1010') {
        haptics.successPulse();
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setErrorMsg('');
        setPin('');
        onToggleAdmin(true);
        onClose();
      } else {
        haptics.errorAlert();
        setErrorMsg('비밀번호(PIN)가 일치하지 않습니다.');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdmin) {
      // Toggle off
      haptics.lightTap();
      onToggleAdmin(false);
      handleClose();
      return;
    }

    if (pin === '1010') {
      haptics.successPulse();
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setErrorMsg('');
      setPin('');
      onToggleAdmin(true);
      onClose();
    } else {
      haptics.errorAlert();
      setErrorMsg('비밀번호(PIN)가 일치하지 않습니다.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] sm:items-center sm:pt-0 p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 text-slate-900 space-y-4 transform transition-transform duration-200 ease-out focus-within:-translate-y-8 sm:focus-within:translate-y-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">관리자 모드</h3>
              <p className="text-[11px] text-slate-400 font-medium">전사 공통 거점 관리</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isAdmin ? (
          <div className="space-y-3 pt-1">
            <div className="bg-blue-50/50 border border-blue-100/80 rounded-xl p-3.5 space-y-1.5">
              <div className="text-[#1E60F3] font-bold text-xs flex items-center gap-1.5">
                <span>✓</span>
                <span>전사 공통 거점 편집 권한</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                추가 또는 삭제하는 거점은 모든 의전 드라이버 앱에 실시간 공통 거점으로 일괄 반영됩니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onToggleAdmin(false);
                handleClose();
              }}
              className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>관리자 모드 종료</span>
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
                maxLength={4}
                value={pin}
                onChange={handlePinChange}
                placeholder="PIN 4자리 입력 (기본: 1010)"
                autoFocus
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg tracking-widest font-black focus:outline-none focus:border-[#1E60F3] focus:bg-white transition-all"
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
              className="w-full py-3 bg-[#1E60F3] hover:bg-[#1346D8] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.97] active:bg-[#0f3bb8] disabled:opacity-50 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all duration-150 ease-out cursor-pointer"
            >
              관리자 모드 활성화
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
