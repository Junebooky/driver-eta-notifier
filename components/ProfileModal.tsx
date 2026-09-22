'use client';

import React, { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { X, User, Car, Users, Navigation, Check } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { ENABLE_DEV_FLEET_SWITCHER, FLEET_PRESET_DRIVERS } from '@/utils/constants';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  onSave: (updated: Partial<DriverProfile>) => void;
  isOnboarding?: boolean;
}

/**
 * Parses existing vehicleNo string into hocha, plateFront, and plateBack.
 * E.g., '4호차 142호 7811' -> hocha: '4', plateFront: '142호', plateBack: '7811'
 *       '142호 7811'      -> hocha: '', plateFront: '142호', plateBack: '7811'
 *       '4호차'           -> hocha: '4', plateFront: '', plateBack: ''
 */
export function parseVehicleDetails(raw?: string): {
  hocha: string;
  plateNumber: string;
  plateFront: string;
  plateBack: string;
} {
  const v = raw?.trim() || '';
  if (!v) return { hocha: '', plateNumber: '', plateFront: '', plateBack: '' };

  // 1. Extract hocha digits/text (e.g. '4호차' -> '4')
  const hochaMatch = v.match(/(\d+)호차/);
  const hocha = hochaMatch ? hochaMatch[1] : '';

  // 2. Remove hocha portion from string
  const withoutHocha = v.replace(/\d+호차/, '').trim();

  // Backward-compat for plateFront / plateBack if referenced
  const plateSplitMatch = withoutHocha.match(/^(.+?)\s*(\d{4})$/);
  const plateFront = plateSplitMatch ? plateSplitMatch[1].trim() : withoutHocha;
  const plateBack = plateSplitMatch ? plateSplitMatch[2].trim() : '';

  return {
    hocha,
    plateNumber: withoutHocha,
    plateFront,
    plateBack,
  };
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
  isOnboarding = false,
}) => {
  const parsed = parseVehicleDetails(profile.vehicleNo);
  const [hocha, setHocha] = useState(parsed.hocha);
  const [plateFront, setPlateFront] = useState(parsed.plateFront);
  const [plateBack, setPlateBack] = useState(parsed.plateBack);
  const [driverName, setDriverName] = useState(profile.driverName || '');
  const [passengerName, setPassengerName] = useState(profile.passengerName || '');
  const [defaultNavi, setDefaultNavi] = useState<NaviProvider>(profile.defaultNavi || 'tmap');
  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const plateFrontRef = React.useRef<HTMLInputElement>(null);
  const plateBackRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsSaving(false);
      const initial = parseVehicleDetails(profile.vehicleNo);
      setHocha(initial.hocha);
      setPlateFront(initial.plateFront);
      setPlateBack(initial.plateBack);
      setDriverName(profile.driverName || '');
      setPassengerName(profile.passengerName || '');
      setDefaultNavi(profile.defaultNavi || 'tmap');

      // Body Scroll Lock: Prevent background page scrolling & rubber-banding
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;

      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';

      const timer = setTimeout(() => {
        setIsMounted(true);
      }, 20);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    } else {
      setIsMounted(false);
      setIsSaving(false);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isSaving) return;
    setIsMounted(false);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleHochaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHocha(e.target.value.slice(0, 10));
  };

  const handlePlateFrontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Auto-advance to back input if trailing space is typed
    if (val.endsWith(' ') && val.trim().length > 0) {
      setPlateFront(val.trim());
      plateBackRef.current?.focus();
      return;
    }
    setPlateFront(val);
  };

  const handlePlateBackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only numeric digits, max 4
    const numeric = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setPlateBack(numeric);

    // Auto-blur keyboard when 4 digits are completed
    if (numeric.length === 4) {
      plateBackRef.current?.blur();
    }
  };

  const handlePlateBackKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && plateBack === '') {
      plateFrontRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSaving) return;
    setIsSaving(true);

    // 1. Instant visual/haptic feedback
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20);
      }
    } catch {
      // Ignore
    }
    haptics.successPulse();

    const hTrim = hocha.trim();
    const pFront = plateFront.trim();
    const pBack = plateBack.trim();
    const combinedPlate = pFront && pBack ? `${pFront} ${pBack}` : pFront || pBack;

    let combinedVehicleNo = '';
    if (hTrim && combinedPlate) {
      if (combinedPlate.includes('호차')) {
        combinedVehicleNo = combinedPlate;
      } else {
        combinedVehicleNo = `${hTrim}호차 ${combinedPlate}`;
      }
    } else if (hTrim) {
      combinedVehicleNo = hTrim.includes('호차') ? hTrim : `${hTrim}호차`;
    } else if (combinedPlate) {
      combinedVehicleNo = combinedPlate;
    }

    const payload: Partial<DriverProfile> = {
      vehicleNo: combinedVehicleNo,
      driverName: driverName.trim(),
      passengerName: passengerName.trim(),
      defaultNavi: defaultNavi || 'tmap',
    };

    // 2. Trigger modal exit animation FIRST (60fps scale-down & fade-out without Jank)
    setIsMounted(false);

    // 3. Decouple heavy parent updates and database calls from the animation frame
    setTimeout(() => {
      React.startTransition(() => {
        onSave(payload);
        onClose();
        setIsSaving(false);
      });
    }, 180);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 touch-none transition-opacity duration-300 ease-out ${isMounted ? 'bg-slate-900/60 backdrop-blur-sm opacity-100' : 'bg-slate-900/0 opacity-0 pointer-events-none'
        }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          handleClose();
        }
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className={`w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-y-auto overscroll-contain text-slate-900 transform transition-all duration-300 ease-out max-h-[90vh] flex flex-col ${isMounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
          }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Master Brand App Icon & Simplified Title */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center space-x-2.5">
            <img
              src="/cockpit_app_icon.png"
              alt="Protocol Cockpit"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl shadow-xs object-cover shrink-0"
            />
            <h2 className="text-sm font-black text-slate-900 tracking-tight">
              {isOnboarding ? '드라이버 정보 최초 등록' : '프로필 설정'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-transform duration-100 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Focus strictly on separated inputs, navi switcher, and action buttons */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto overscroll-contain flex-1">
          {/* Quick Preset Drivers for Development/Dispatcher */}
          {ENABLE_DEV_FLEET_SWITCHER && (
            <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
                  개발·관제용 1초 기사 전환
                </span>
                <span className="text-[9px] font-bold text-[#1E60F3] bg-white px-1.5 py-0.5 rounded-md border border-blue-200">
                  DEV
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {FLEET_PRESET_DRIVERS.map((d) => {
                  const isCurrent = hocha === d.hocha;
                  return (
                    <button
                      key={d.vehicleNo}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setHocha(d.hocha);
                        setPlateFront(d.plateFront);
                        setPlateBack(d.plateBack);
                        setDriverName(d.driverName);
                        setDefaultNavi(d.defaultNavi);
                      }}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-[#1E60F3] text-white border-[#1E60F3] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#1E60F3]/50 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-black truncate">{d.vehicleNo}</div>
                      <div className={`text-[10px] font-bold truncate ${isCurrent ? 'text-blue-100' : 'text-slate-600'}`}>
                        {d.driverName}
                      </div>
                      <div className={`text-[9px] truncate ${isCurrent ? 'text-blue-200' : 'text-slate-400'}`}>
                        {d.plateBack}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 1. Hocha (Optional) Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
              <Car className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 호차 (선택)
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={hocha}
                onChange={handleHochaChange}
                placeholder="예: 4 (호차 없으면 공란)"
                className="w-full pl-3.5 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors"
              />
              <span
                className={`absolute right-3 text-xs font-black transition-colors pointer-events-none ${hocha ? 'text-[#1E60F3]' : 'text-slate-300'
                  }`}
              >
                호차
              </span>
            </div>
          </div>

          {/* 2. License Plate Separated Inputs (plateFront & plateBack) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center">
                <Car className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 차량 번호판
              </span>
              <span className="text-[10px] text-slate-400 font-medium">앞자리 + 뒷자리 4자리</span>
            </label>
            <div className="grid grid-cols-[1.2fr_1fr] gap-2">
              {/* Front Plate Input */}
              <div className="relative">
                <input
                  ref={plateFrontRef}
                  type="text"
                  value={plateFront}
                  onChange={handlePlateFrontChange}
                  placeholder="예: 142호"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors"
                />
              </div>

              {/* Back Plate 4-digit Input */}
              <div className="relative">
                <input
                  ref={plateBackRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={plateBack}
                  onChange={handlePlateBackChange}
                  onKeyDown={handlePlateBackKeyDown}
                  placeholder="예: 7811"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors tracking-widest text-center"
                />
              </div>
            </div>
          </div>

          {/* 3. Driver Name Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
              <User className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 드라이버 성명
            </label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="예: 윤태준"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
            />
          </div>

          {/* 4. Passenger Name Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
              <Users className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 담당 승객명
            </label>
            <input
              type="text"
              value={passengerName}
              onChange={(e) => setPassengerName(e.target.value)}
              placeholder="예: SOYFAN 외 1명 (미입력 시 생략)"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
            />
          </div>

          {/* 5. Primary Navigation Switcher */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center">
              <Navigation className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 주력 내비게이션 앱
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* TMAP Option (Default) */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setDefaultNavi('tmap');
                }}
                className={`py-2.5 px-2 rounded-2xl border transition-all duration-100 flex flex-col items-center justify-center space-y-1 active:scale-95 cursor-pointer ${defaultNavi === 'tmap'
                  ? 'bg-blue-50/80 border-blue-500 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                  }`}
              >
                <div className="w-6 h-6 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="tmapModalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#E11D48" />
                        <stop offset="45%" stopColor="#9333EA" />
                        <stop offset="100%" stopColor="#06B6D4" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M3.5 6.25C3.5 4.8 4.7 4 6 4H18C19.3 4 20.5 4.8 20.5 6.25C20.5 7.7 19.3 8.5 18 8.5H14.6V19.5C14.6 20.9 13.5 22 12 22C10.5 22 9.4 20.9 9.4 19.5V8.5H6C4.7 8.5 3.5 7.7 3.5 6.25Z"
                      fill="url(#tmapModalGrad)"
                    />
                  </svg>
                </div>
                <span className="text-[11px] font-extrabold">티맵</span>
                {defaultNavi === 'tmap' && <Check className="w-3 h-3 text-blue-600" />}
              </button>

              {/* KakaoNavi Option */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setDefaultNavi('kakao');
                }}
                className={`py-2.5 px-2 rounded-2xl border transition-all duration-100 flex flex-col items-center justify-center space-y-1 active:scale-95 cursor-pointer ${defaultNavi === 'kakao'
                  ? 'bg-amber-50/80 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                  }`}
              >
                <div className="w-6 h-6 rounded-full bg-[#FEE500] border border-amber-300 text-[#3C1E1E] flex items-center justify-center text-xs font-black shadow-2xs">
                  K
                </div>
                <span className="text-[11px] font-extrabold">카카오</span>
                {defaultNavi === 'kakao' && <Check className="w-3 h-3 text-amber-600" />}
              </button>

              {/* NaverMap Option */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setDefaultNavi('naver');
                }}
                className={`py-2.5 px-2 rounded-2xl border transition-all duration-100 flex flex-col items-center justify-center space-y-1 active:scale-95 cursor-pointer ${defaultNavi === 'naver'
                  ? 'bg-emerald-50/80 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                  }`}
              >
                <div className="w-6 h-6 rounded-full bg-[#03C75A] border border-emerald-400 text-white flex items-center justify-center text-xs font-black shadow-2xs">
                  N
                </div>
                <span className="text-[11px] font-extrabold">네이버</span>
                {defaultNavi === 'naver' && <Check className="w-3 h-3 text-emerald-600" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center space-x-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="w-1/3 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold active:scale-95 transition-transform duration-100 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`w-2/3 py-3.5 rounded-2xl bg-[#1E60F3] hover:bg-[#1650D6] active:bg-[#1244B8] active:scale-[0.98] text-white text-sm font-bold shadow-sm shadow-blue-500/20 transition-all duration-150 ease-out cursor-pointer flex items-center justify-center gap-1.5 ${isSaving ? 'opacity-85 pointer-events-none' : ''
                }`}
            >
              {isSaving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                  <span>저장 중...</span>
                </>
              ) : (
                '설정 저장'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
