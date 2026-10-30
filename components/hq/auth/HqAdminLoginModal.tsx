'use client';

import React, { useState } from 'react';
import { ShieldCheck, Key, Eye, EyeOff, Loader2, X, Check, AlertCircle } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { purgeLocalCaches } from '@/utils/cockpitClientAuth';

export interface HqAdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onLoginSuccess?: () => void;
  initialMessage?: string;
}

export const HqAdminLoginModal: React.FC<HqAdminLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onLoginSuccess,
  initialMessage,
}) => {
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialMessage || null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) {
      setErrorMessage('본사 관리자 비밀키를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          role: 'hq_admin',
          secret: secret.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        haptics.errorAlert();
        setErrorMessage(
          data.error || `로그인 실패 (HTTP ${res.status}): 비밀키를 확인해주세요.`
        );
        return;
      }

      // Success
      haptics.success();
      purgeLocalCaches();
      setSuccessMessage('본사 관리자로 인증되었습니다.');

      setTimeout(() => {
        onSuccess?.();
        onLoginSuccess?.();
        onClose();
      }, 700);
    } catch (err: any) {
      haptics.errorAlert();
      setErrorMessage(err.message || '서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
      <div
        className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white">
                본사 관리자(HQ Admin) 인증
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                VIP Limousine Korea 중앙 관제 시스템
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleLogin} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              관리자 비밀키 (HQ Secret Passkey)
            </label>
            <div className="relative">
              <div className="w-8 h-8 absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                type={showSecret ? 'text' : 'password'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="관리자 비밀키를 입력하세요"
                autoFocus
                className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-sans focus:bg-white focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="w-8 h-8 absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label={showSecret ? '비밀키 숨기기' : '비밀키 보기'}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Diagnostic info & error banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-800 flex items-start gap-2.5 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0 font-medium">
                <span className="font-bold block text-rose-900 mb-0.5">인증 실패</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 flex items-center gap-2 text-xs font-bold animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Environment notice */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 space-y-1 leading-relaxed">
            <p className="font-semibold text-slate-700">📌 인증 안내</p>
            <p>
              기사 명단 조회, 신규 기사 등록 및 차량별 안내자료(Info) 관리는 본사 관리자(HQ Admin) 권한이 필요합니다.
            </p>
            <p className="text-slate-400">
              * Vercel Preview 검수 환경: 기본 관리자 키(<code className="font-mono text-slate-600 bg-slate-200/60 px-1 py-0.5 rounded">vip_limo_hq_2026</code>)로 인증할 수 있습니다.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading || !secret.trim()}
              className="px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-98 disabled:opacity-50 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>인증 확인 중...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>본사 관리자 로그인</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
