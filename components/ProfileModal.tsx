'use client';

import React, { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { X, User, Car, Users, Navigation, Check, MessageSquare } from 'lucide-react';
import { haptics } from '@/utils/haptics';

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
  plateFront: string;
  plateBack: string;
} {
  const v = raw?.trim() || '';
  if (!v) return { hocha: '', plateFront: '', plateBack: '' };

  // 1. Extract hocha digits (e.g. '4호차' -> '4')
  const hochaMatch = v.match(/(\d+)호차/);
  const hocha = hochaMatch ? hochaMatch[1] : '';

  // 2. Remove hocha portion from string
  const withoutHocha = v.replace(/\d+호차/, '').trim();

  // 3. Match 4 trailing digits: e.g. '142호 7811' or '142호7811'
  const plateSplitMatch = withoutHocha.match(/^(.+?)\s*(\d{4})$/);
  if (plateSplitMatch) {
    return {
      hocha,
      plateFront: plateSplitMatch[1].trim(),
      plateBack: plateSplitMatch[2].trim(),
    };
  }

  // If only 4 digits exist
  if (/^\d{4}$/.test(withoutHocha)) {
    return {
      hocha,
      plateFront: '',
      plateBack: withoutHocha,
    };
  }

  // Otherwise, place remaining in plateFront
  return {
    hocha,
    plateFront: withoutHocha,
    plateBack: '',
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
  const [targetChatRoom, setTargetChatRoom] = useState(profile.targetChatRoom || '');
  const [defaultNavi, setDefaultNavi] = useState<NaviProvider>(profile.defaultNavi || 'tmap');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const initial = parseVehicleDetails(profile.vehicleNo);
      setHocha(initial.hocha);
      setPlateFront(initial.plateFront);
      setPlateBack(initial.plateBack);
      setDriverName(profile.driverName || '');
      setPassengerName(profile.passengerName || '');
      setTargetChatRoom(profile.targetChatRoom || '');
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
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsMounted(false);
    setTimeout(() => {
      onClose();
    }, 250);
  };

  const handleHochaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Digits only for hocha
    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
    setHocha(digits);
  };

  const handlePlateFrontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow numbers, completed Hangul (가-힣), and in-progress jamo (ㄱ-ㅎ, ㅏ-ㅣ) to prevent IME freeze
    const val = e.target.value
      .replace(/[^0-9가-힣\u3131-\u314e\u314f-\u3163]/g, '')
      .slice(0, 6);
    setPlateFront(val);
  };

  const handlePlateBackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Exact 4 numeric digits for back plate
    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setPlateBack(digits);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    haptics.successPulse();

    const hTrim = hocha.trim();
    const pFrontTrim = plateFront.trim();
    const pBackTrim = plateBack.trim();

    const combinedPlate = pFrontTrim && pBackTrim
      ? `${pFrontTrim} ${pBackTrim}`
      : pFrontTrim || pBackTrim;

    let combinedVehicleNo = '';
    if (hTrim && combinedPlate) {
      combinedVehicleNo = `${hTrim}호차 ${combinedPlate}`;
    } else if (hTrim) {
      combinedVehicleNo = `${hTrim}호차`;
    } else if (combinedPlate) {
      combinedVehicleNo = combinedPlate;
    }

    onSave({
      vehicleNo: combinedVehicleNo,
      driverName: driverName.trim(),
      passengerName: passengerName.trim(),
      targetChatRoom: targetChatRoom.trim(),
      defaultNavi: defaultNavi || 'tmap',
    });
    handleClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 touch-none transition-opacity duration-300 ease-out ${
        isMounted ? 'bg-slate-900/60 backdrop-blur-sm opacity-100' : 'bg-slate-900/0 opacity-0 pointer-events-none'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
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
        className={`w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-y-auto overscroll-contain text-slate-900 transform transition-all duration-300 ease-out max-h-[90vh] flex flex-col ${
          isMounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
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
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-transform duration-100 cursor-pointer"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Focus strictly on separated inputs, navi switcher, and action buttons */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto overscroll-contain flex-1">
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
                className="w-full pl-3.5 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
              />
              <span
                className={`absolute right-3 text-xs font-black transition-colors pointer-events-none ${
                  hocha ? 'text-[#1E60F3]' : 'text-slate-300'
                }`}
              >
                호차
              </span>
            </div>
          </div>

          {/* 2. License Plate Dual Input (Flex Row: Front 53% + Back 47%) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
              <Car className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 차량 번호판
            </label>
            <div className="flex items-center gap-2">
              {/* Front Plate: 2~3 digits + Hangul (e.g. 142호, 110하, 70가) */}
              <div className="flex-1 basis-[53%] min-w-0">
                <input
                  type="text"
                  value={plateFront}
                  onChange={handlePlateFrontChange}
                  placeholder="예: 142호"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
                />
              </div>

              {/* Separator */}
              <span className="text-slate-400 font-bold shrink-0">-</span>

              {/* Back Plate: 4 digits (e.g. 7811) */}
              <div className="flex-1 basis-[47%] min-w-0">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={plateBack}
                  onChange={handlePlateBackChange}
                  placeholder="예: 7811"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
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
              placeholder="예: SOFYAN 외 1명 (미입력 시 생략)"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
            />
          </div>

          {/* 5. Target Chat Room Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
              <MessageSquare className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 고정 보고 단톡방 / 수신자 메모
            </label>
            <input
              type="text"
              value={targetChatRoom}
              onChange={(e) => setTargetChatRoom(e.target.value)}
              placeholder="예: VIP 의전 단톡방"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:bg-white font-bold transition-colors"
            />
          </div>

          {/* 6. Primary Navigation Switcher */}
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
                className={`py-2.5 px-2 rounded-2xl border transition-all duration-100 flex flex-col items-center justify-center space-y-1 active:scale-95 cursor-pointer ${
                  defaultNavi === 'tmap'
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
                className={`py-2.5 px-2 rounded-2xl border transition-all duration-100 flex flex-col items-center justify-center space-y-1 active:scale-95 cursor-pointer ${
                  defaultNavi === 'kakao'
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
                className={`py-2.5 px-2 rounded-2xl border transition-all duration-100 flex flex-col items-center justify-center space-y-1 active:scale-95 cursor-pointer ${
                  defaultNavi === 'naver'
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
              className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold active:scale-95 transition-transform duration-100 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="w-2/3 py-3 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-black shadow-md shadow-blue-500/20 active:scale-95 transition-transform duration-100 cursor-pointer"
            >
              설정 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
