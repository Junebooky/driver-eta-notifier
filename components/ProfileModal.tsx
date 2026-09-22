'use client';

import React, { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { X, User, Car, Users, Navigation, Check, Phone } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { ENABLE_DEV_FLEET_SWITCHER, FLEET_PRESET_DRIVERS, FleetPresetDriver } from '@/utils/constants';

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

/**
 * Parses existing phone string into 3 segments (e.g. '010', '6348', '8726').
 */
export function parsePhoneDetails(raw?: string): {
  p1: string;
  p2: string;
  p3: string;
} {
  const digits = (raw || '').replace(/[^0-9]/g, '');
  if (!digits) return { p1: '010', p2: '', p3: '' };

  if (digits.length === 11) {
    return { p1: digits.slice(0, 3), p2: digits.slice(3, 7), p3: digits.slice(7, 11) };
  } else if (digits.length === 10) {
    return { p1: digits.slice(0, 3), p2: digits.slice(3, 6), p3: digits.slice(6, 10) };
  } else if (digits.length <= 3) {
    return { p1: digits, p2: '', p3: '' };
  } else if (digits.length <= 7) {
    return { p1: digits.slice(0, 3), p2: digits.slice(3), p3: '' };
  } else {
    return { p1: digits.slice(0, 3), p2: digits.slice(3, 7), p3: digits.slice(7, 11) };
  }
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
  isOnboarding = false,
}) => {
  const parsed = parseVehicleDetails(profile.vehicleNo);
  const parsedPhone = parsePhoneDetails(profile.phone || profile.mobile);
  const isInitialEmpty = isOnboarding || (!profile.driverName && !profile.vehicleNo);

  const [hocha, setHocha] = useState(isInitialEmpty ? '' : parsed.hocha);
  const [plateFront, setPlateFront] = useState(isInitialEmpty ? '' : (profile.carNumberFront || parsed.plateFront));
  const [plateBack, setPlateBack] = useState(isInitialEmpty ? '' : (profile.carNumberBack || parsed.plateBack));
  const [phone1, setPhone1] = useState(isInitialEmpty ? '010' : (profile.phonePart1 || parsedPhone.p1 || '010'));
  const [phone2, setPhone2] = useState(isInitialEmpty ? '' : (profile.phonePart2 || parsedPhone.p2));
  const [phone3, setPhone3] = useState(isInitialEmpty ? '' : (profile.phonePart3 || parsedPhone.p3));
  const [driverName, setDriverName] = useState(isInitialEmpty ? '' : (profile.driverName || ''));
  const [passengerName, setPassengerName] = useState(isInitialEmpty ? '' : (profile.passengerName || ''));
  const [defaultNavi, setDefaultNavi] = useState<NaviProvider>(profile.defaultNavi || 'tmap');
  const [selectedPresetVehicle, setSelectedPresetVehicle] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fleetPresets, setFleetPresets] = useState<FleetPresetDriver[]>(FLEET_PRESET_DRIVERS);

  // Dynamic fetch of all registered drivers from Supabase SSOT
  useEffect(() => {
    if (!isOpen) return;
    async function loadDynamicDrivers() {
      try {
        const res = await fetch('/api/driver?all=true');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.drivers) && data.drivers.length > 0) {
            const presetMap = new Map<string, FleetPresetDriver>();
            FLEET_PRESET_DRIVERS.forEach((d) => presetMap.set(d.vehicleNo, d));

            data.drivers.forEach((d: any) => {
              if (!d.vehicle_no) return;
              const hochaOnly = d.vehicle_no.match(/(\d+)호차/)?.[1] || d.vehicle_no.replace(/\D/g, '') || '';
              const carDetails = parseVehicleDetails(d.car_number);
              const presetObj: FleetPresetDriver = {
                vehicleNo: d.vehicle_no,
                hocha: hochaOnly,
                plateFront: carDetails.plateFront || '',
                plateBack: carDetails.plateBack || '',
                carNumber: d.car_number || '',
                driverName: d.driver_name || '',
                phone: d.phone || '',
                defaultNavi: (d.default_navi as NaviProvider) || 'tmap',
              };
              presetMap.set(d.vehicle_no, presetObj);
            });

            const sorted = Array.from(presetMap.values()).sort((a, b) => {
              const numA = parseInt(a.hocha || '999', 10);
              const numB = parseInt(b.hocha || '999', 10);
              return numA - numB;
            });
            setFleetPresets(sorted);
          }
        }
      } catch (err) {
        console.warn('Failed to load dynamic drivers in ProfileModal:', err);
      }
    }
    loadDynamicDrivers();
  }, [isOpen]);

  const driverNameRef = React.useRef<HTMLInputElement>(null);
  const plateFrontRef = React.useRef<HTMLInputElement>(null);
  const plateBackRef = React.useRef<HTMLInputElement>(null);
  const phone1Ref = React.useRef<HTMLInputElement>(null);
  const phone2Ref = React.useRef<HTMLInputElement>(null);
  const phone3Ref = React.useRef<HTMLInputElement>(null);

  const handlePhone1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPresetVehicle(null);
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
    setPhone1(val);
    if (val.length === 3) {
      phone2Ref.current?.focus();
    }
  };

  const handlePhone2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPresetVehicle(null);
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setPhone2(val);
    if (val.length === 4) {
      phone3Ref.current?.focus();
    }
  };

  const handlePhone3Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPresetVehicle(null);
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setPhone3(val);
    if (val.length === 4) {
      phone3Ref.current?.blur();
    }
  };

  const handlePhone2KeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && phone2 === '') {
      phone1Ref.current?.focus();
    }
  };

  const handlePhone3KeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && phone3 === '') {
      phone2Ref.current?.focus();
    }
  };

  const handlePhonePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    setSelectedPresetVehicle(null);
    const pasted = e.clipboardData.getData('text');
    const digits = pasted.replace(/[^0-9]/g, '');
    if (digits.length >= 10) {
      e.preventDefault();
      const p = parsePhoneDetails(digits);
      setPhone1(p.p1);
      setPhone2(p.p2);
      setPhone3(p.p3);
      phone3Ref.current?.focus();
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsSaving(false);
      setSelectedPresetVehicle(null);

      const isInitialOrOnboarding = isOnboarding || (!profile.driverName && !profile.vehicleNo);
      if (isInitialOrOnboarding) {
        setHocha('');
        setPlateFront('');
        setPlateBack('');
        setPhone1('010');
        setPhone2('');
        setPhone3('');
        setDriverName('');
        setPassengerName('');
        setDefaultNavi('tmap');
      } else {
        const initial = parseVehicleDetails(profile.vehicleNo);
        const initPhone = parsePhoneDetails(profile.phone || profile.mobile);
        setHocha(initial.hocha);
        setPlateFront(profile.carNumberFront || initial.plateFront);
        setPlateBack(profile.carNumberBack || initial.plateBack);
        setPhone1(profile.phonePart1 || initPhone.p1 || '010');
        setPhone2(profile.phonePart2 || initPhone.p2 || '');
        setPhone3(profile.phonePart3 || initPhone.p3 || '');
        setDriverName(profile.driverName || '');
        setPassengerName(profile.passengerName || '');
        setDefaultNavi(profile.defaultNavi || 'tmap');
      }

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
      setSelectedPresetVehicle(null);
    }
  }, [isOpen, profile, isOnboarding]);

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
    setSelectedPresetVehicle(null);
    setHocha(e.target.value.slice(0, 10));
  };

  const handlePlateFrontChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPresetVehicle(null);
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
    setSelectedPresetVehicle(null);
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

    const combinedPhone =
      phone1.trim() && phone2.trim() && phone3.trim()
        ? `${phone1.trim()}-${phone2.trim()}-${phone3.trim()}`
        : [phone1.trim(), phone2.trim(), phone3.trim()].filter(Boolean).join('-');

    const cleanPhone = `${phone1}${phone2}${phone3}`.replace(/[^0-9]/g, '');
    const isNameEmpty = !driverName.trim();
    const isPhoneEmpty = !phone2.trim() && !phone3.trim();
    const isPhoneIncomplete = !phone2.trim() || !phone3.trim() || cleanPhone.length < 10;

    // 1. Both name and phone are empty/missing
    if (isNameEmpty && (isPhoneEmpty || isPhoneIncomplete)) {
      alert('드라이버 성명과 연락처를 입력해 주세요.');
      driverNameRef.current?.focus();
      setIsSaving(false);
      return;
    }

    // 2. Only name is missing
    if (isNameEmpty) {
      alert('드라이버 성명을 입력해 주세요.');
      driverNameRef.current?.focus();
      setIsSaving(false);
      return;
    }

    // 3. Phone is incomplete
    if (isPhoneIncomplete) {
      alert('연락처(휴대폰 번호)를 정확히 입력해 주세요. (예: 010-0000-0000)');
      if (!phone2.trim()) {
        phone2Ref.current?.focus();
      } else {
        phone3Ref.current?.focus();
      }
      setIsSaving(false);
      return;
    }

    // 4. Plate back digit validation if provided
    if (pBack && pBack.length < 4) {
      alert('차량 번호판 뒷자리는 4자리 숫자로 입력해 주세요.');
      plateBackRef.current?.focus();
      setIsSaving(false);
      return;
    }

    const payload: Partial<DriverProfile> = {
      vehicleNo: combinedVehicleNo,
      carNumber: combinedPlate || undefined,
      carNumberFront: pFront,
      carNumberBack: pBack,
      driverName: driverName.trim(),
      phone: combinedPhone,
      mobile: combinedPhone,
      phonePart1: phone1.trim(),
      phonePart2: phone2.trim(),
      phonePart3: phone3.trim(),
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {fleetPresets.map((d) => {
                  const isCurrent = selectedPresetVehicle === d.vehicleNo;
                  return (
                    <button
                      key={d.vehicleNo}
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setSelectedPresetVehicle(d.vehicleNo);
                        const pObj = parsePhoneDetails(d.phone);
                        setHocha(d.hocha);
                        setPlateFront(d.plateFront);
                        setPlateBack(d.plateBack);
                        setDriverName(d.driverName);
                        setPhone1(pObj.p1);
                        setPhone2(pObj.p2);
                        setPhone3(pObj.p3);
                        setDefaultNavi(d.defaultNavi);
                      }}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${isCurrent
                        ? 'bg-[#1E60F3] text-white border-[#1E60F3] shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-[#1E60F3]/50 hover:bg-slate-50'
                        }`}
                    >
                      <div className="text-xs font-black truncate">{d.vehicleNo}</div>
                      <div className={`text-[10px] font-bold truncate ${isCurrent ? 'text-blue-100' : 'text-slate-600'}`}>
                        {d.driverName}
                      </div>
                      <div className={`text-[9px] truncate ${isCurrent ? 'text-blue-200' : 'text-slate-400'}`}>
                        {d.phone}
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
                placeholder="예: 4"
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
                  placeholder="142호"
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
                  placeholder="7811"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors tracking-widest text-center"
                />
              </div>
            </div>
          </div>

          {/* 3. Driver Name Field (드라이버 성명: 연락처 상단 배치) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center">
                <User className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 드라이버 성명
              </span>
              <span className="text-[10px] text-red-500 font-bold">* 필수 입력</span>
            </label>
            <input
              ref={driverNameRef}
              type="text"
              value={driverName}
              onChange={(e) => {
                setSelectedPresetVehicle(null);
                setDriverName(e.target.value);
              }}
              placeholder="성함 입력"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors"
            />
          </div>

          {/* 4. Mobile Phone Number Field (가로 1줄 3칸 분할 입력) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center">
                <Phone className="w-3.5 h-3.5 mr-1 text-[#1E60F3]" /> 연락처
              </span>
              <span className="text-[10px] text-red-500 font-bold">* 필수 입력</span>
            </label>
            <div className="grid grid-cols-[1fr_auto_1.2fr_auto_1.2fr] items-center gap-1.5">
              <div className="relative">
                <input
                  ref={phone1Ref}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  value={phone1}
                  onChange={handlePhone1Change}
                  onPaste={handlePhonePaste}
                  placeholder="010"
                  className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors text-center tracking-wider"
                />
              </div>
              <span className="text-slate-300 font-bold text-xs select-none">-</span>
              <div className="relative">
                <input
                  ref={phone2Ref}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={phone2}
                  onChange={handlePhone2Change}
                  onKeyDown={handlePhone2KeyDown}
                  onPaste={handlePhonePaste}
                  placeholder="0000"
                  className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors text-center tracking-wider"
                />
              </div>
              <span className="text-slate-300 font-bold text-xs select-none">-</span>
              <div className="relative">
                <input
                  ref={phone3Ref}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={phone3}
                  onChange={handlePhone3Change}
                  onKeyDown={handlePhone3KeyDown}
                  onPaste={handlePhonePaste}
                  placeholder="0000"
                  className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#1E60F3] focus:bg-white font-bold transition-colors text-center tracking-wider"
                />
              </div>
            </div>
          </div>

          {/* 5. Passenger Name Field */}
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
