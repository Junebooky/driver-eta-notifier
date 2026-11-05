'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ensureClientAuth, switchDevAccount, ClientSessionInfo } from '@/utils/cockpitClientAuth';
import { ShieldCheck, UserCheck, ChevronDown, Check, RefreshCw } from 'lucide-react';

interface DevAuthSwitcherProps {
  className?: string;
}

export const DevAuthSwitcher: React.FC<DevAuthSwitcherProps> = ({ className = '' }) => {
  const router = useRouter();
  const [session, setSession] = useState<ClientSessionInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureClientAuth().then((s) => setSession(s));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // NEVER render in preview or production (isDevAllowed is strictly server-governed)
  if (!session?.isDevAllowed) {
    return null;
  }

  const handleSelectAccount = async (target: 'admin' | 'driver' | 'driver_a' | 'driver_b') => {
    setIsSwitching(true);
    setIsOpen(false);
    try {
      const ok = await switchDevAccount(target);
      if (ok) {
        if (target === 'admin') {
          window.location.assign('/hq?tab=dispatch');
        } else {
          window.location.assign('/');
        }
      }
    } finally {
      setIsSwitching(false);
    }
  };

  const currentRole = session.role === 'hq_admin'
    ? 'admin'
    : session.driverName === '박기사'
      ? 'driver_b'
      : session.driverName === '윤기사'
        ? 'driver_a'
        : 'driver';

  return (
    <div className={`relative inline-flex items-center group/devauth ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isSwitching}
        aria-label="계정 전환 설정"
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-transparent border-0 hover:bg-slate-100 active:bg-slate-200 active:scale-95 transition-all duration-150 cursor-pointer relative"
        title="로컬 개발용 즉시 계정 전환 (Vercel Preview/운영에서는 자동 차단됨)"
      >
        {isSwitching ? (
          <RefreshCw className="w-5 h-5 animate-spin text-[#1E60F3]" />
        ) : (
          <img
            src="/images/icons/settings/icon_setting.png"
            alt="설정"
            className="w-7.5 h-7.5 object-contain shrink-0 transition-transform duration-150 group-hover/devauth:scale-110 select-none"
            draggable={false}
          />
        )}
      </button>

      {/* Hover Tooltip */}
      {!isOpen && (
        <div className="absolute top-full right-0 pt-2 hidden group-hover/devauth:flex flex-col items-end pointer-events-none z-50">
          <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 mr-3.5 shadow-xs" />
          <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-in fade-in-50 duration-150">
            {session.role === 'hq_admin'
              ? '본사 관리자 (계정 전환)'
              : `${session.driverName || '기사 모드'} (계정 전환)`}
          </span>
        </div>
      )}

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-2 py-1.5 border-b border-slate-100 mb-1">
            <span className="text-[10px] font-bold text-slate-400 block tracking-tight">
              로컬 개발 테스트 계정 즉시 전환
            </span>
            <span className="text-xs font-black text-slate-800">
              현재: {session.role === 'hq_admin' ? '본사 관리자(HQ Admin)' : `${session.driverName} (${session.vehicleNo})`}
            </span>
          </div>

          <div className="space-y-1">
            {/* 1. HQ Admin */}
            <button
              type="button"
              onClick={() => handleSelectAccount('admin')}
              className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition-colors cursor-pointer ${
                currentRole === 'admin'
                  ? 'bg-amber-50 text-amber-900 border border-amber-200/60'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <div>
                  <div className="font-bold">👑 본사 관리자</div>
                  <div className="text-[10px] text-slate-400 font-normal">전체 예약·배차·가격표 관리</div>
                </div>
              </div>
              {currentRole === 'admin' && <Check className="w-4 h-4 text-amber-600" />}
            </button>

            {/* 2. QA Test Driver */}
            <button
              type="button"
              onClick={() => handleSelectAccount('driver')}
              className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition-colors cursor-pointer ${
                currentRole === 'driver'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/60'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <div>
                  <div className="font-bold">🚗 QA 테스트 기사</div>
                  <div className="text-[10px] text-slate-400 font-normal">99호차 (서울99바9999)</div>
                </div>
              </div>
              {currentRole === 'driver' && <Check className="w-4 h-4 text-emerald-600" />}
            </button>

            {/* 3. Driver A */}
            <button
              type="button"
              onClick={() => handleSelectAccount('driver_a')}
              className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition-colors cursor-pointer ${
                currentRole === 'driver_a'
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200/60'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#1E60F3]" />
                <div>
                  <div className="font-bold">🚙 기사 A (윤기사)</div>
                  <div className="text-[10px] text-slate-400 font-normal">7호차 (서울31가7777)</div>
                </div>
              </div>
              {currentRole === 'driver_a' && <Check className="w-4 h-4 text-[#1E60F3]" />}
            </button>

            {/* 4. Driver B */}
            <button
              type="button"
              onClick={() => handleSelectAccount('driver_b')}
              className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition-colors cursor-pointer ${
                currentRole === 'driver_b'
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200/60'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#1E60F3]" />
                <div>
                  <div className="font-bold">🚙 기사 B (박기사)</div>
                  <div className="text-[10px] text-slate-400 font-normal">8호차 (서울32나8888)</div>
                </div>
              </div>
              {currentRole === 'driver_b' && <Check className="w-4 h-4 text-[#1E60F3]" />}
            </button>
          </div>

          <div className="pt-2 mt-1 border-t border-slate-100 px-2 text-[10px] text-slate-400 text-center">
            전환 시 이전 기사 캐시가 즉시 초기화됩니다.
          </div>
        </div>
      )}
    </div>
  );
};

