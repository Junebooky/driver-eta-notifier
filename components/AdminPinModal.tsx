'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  const modalRef = useRef<HTMLDivElement>(null);

  // Body Scroll Lock & Background Movement Prevention
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Completely prevent background rubberbanding / dragging on touch & wheel
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] sm:items-center sm:pt-0 p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overscroll-contain select-none touch-none"
      style={{ overscrollBehavior: 'contain', touchAction: 'none' }}
      onTouchMove={(e) => e.preventDefault()}
      onWheel={(e) => e.preventDefault()}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-xs bg-white border border-slate-200 rounded-3xl shadow-2xl p-5 text-slate-900 space-y-4 transform transition-transform duration-200 ease-out focus-within:-translate-y-8 sm:focus-within:translate-y-0 overscroll-contain select-text"
        style={{ overscrollBehavior: 'contain', touchAction: 'none' }}
        onTouchMove={(e) => e.preventDefault()}
        onWheel={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex flex-col items-center justify-center text-center pt-0.5">
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-0 top-0 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-[#1E60F3] flex items-center justify-center shadow-xs mb-1.5">
            <ShieldCheck className="w-4.5 h-4.5 text-[#1E60F3]" />
          </div>
          <h3 className="text-base font-black text-slate-900 leading-snug">관리자 모드</h3>
          <p className="text-[12px] text-slate-400 font-medium leading-relaxed mt-0.5">공통 거점 관리</p>
        </div>

        {isAdmin ? (
          <div className="space-y-3 pt-1">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-center shadow-xs">
              <div className="text-[#1E60F3] font-bold text-sm flex items-center justify-center gap-1.5">
                <span>✓</span>
                <span>모든 드라이버에 적용됩니다</span>
              </div>
              <p className="text-sm text-slate-600 leading-loose text-center">
                여기서 추가·삭제한 거점은<br /> 모든 드라이버 앱에 즉시 반영됩니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onToggleAdmin(false);
                handleClose();
              }}
              className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>관리자 모드 종료</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1 flex items-center gap-1">
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
                placeholder="PIN 4자리 입력"
                autoFocus
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-base tracking-widest font-black focus:outline-none focus:border-[#1E60F3] focus:bg-white transition-all"
              />
              {errorMsg && (
                <p className="text-[11px] font-semibold text-rose-500 mt-1 text-center">
                  {errorMsg}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!pin}
              className="w-full py-3 bg-[#1E60F3] hover:bg-[#1346D8] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/35 active:translate-y-0 active:scale-[0.97] active:bg-[#0f3bb8] disabled:opacity-50 text-white rounded-xl text-sm font-extrabold shadow-xs transition-all duration-150 ease-out cursor-pointer"
            >
              관리자 모드 활성화
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
