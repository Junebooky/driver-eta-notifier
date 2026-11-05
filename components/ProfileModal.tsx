'use client';

import React, { useState, useEffect } from 'react';
import { DriverProfile, NaviProvider } from '@/types';
import { X, User, Car, Users, Navigation, Check, Phone, ChevronDown } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { ENABLE_DEV_FLEET_SWITCHER, FleetPresetDriver } from '@/utils/constants';
import { getStoredVehicleProfile } from '@/hooks/useDriverProfile';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  onSave: (updated: Partial<DriverProfile>) => Promise<boolean> | boolean | void;
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

function profileVehicleDetails(profile: DriverProfile) {
  const vehicle = parseVehicleDetails(profile.vehicleNo);
  return profile.carNumber ? { ...parseVehicleDetails(profile.carNumber), hocha: vehicle.hocha } : vehicle;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSave,
  isOnboarding = false,
}) => {
  const parsed = profileVehicleDetails(profile);
  const parsedPhone = parsePhoneDetails(profile.phone || profile.mobile);
  const isInitialEmpty = isOnboarding || (!profile.driverName && !profile.vehicleNo);

  const [hocha, setHocha] = useState(isInitialEmpty ? '' : parsed.hocha);
  const [plateFront, setPlateFront] = useState(isInitialEmpty ? '' : (profile.carNumberFront || parsed.plateFront));
  const [plateBack, setPlateBack] = useState(isInitialEmpty ? '' : (profile.carNumberBack || parsed.plateBack));
  const [phone1, setPhone1] = useState(isInitialEmpty ? '010' : (profile.phonePart1 || parsedPhone.p1 || '010'));
  const [phone2, setPhone2] = useState(isInitialEmpty ? '' : (profile.phonePart2 || parsedPhone.p2));
  const [phone3, setPhone3] = useState(isInitialEmpty ? '' : (profile.phonePart3 || parsedPhone.p3));
  const [driverName, setDriverName] = useState(isInitialEmpty ? '' : (profile.driverName || ''));
  const [passengerName, setPassengerName] = useState(isInitialEmpty ? '' : (profile.passengerName ?? ''));
  const [defaultNavi, setDefaultNavi] = useState<NaviProvider>(profile.defaultNavi || 'tmap');
  const [selectedPresetVehicle, setSelectedPresetVehicle] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [plateError, setPlateError] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fleetPresets, setFleetPresets] = useState<FleetPresetDriver[]>([]);
  const [isHochaPickerOpen, setIsHochaPickerOpen] = useState(false);

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


            data.drivers.forEach((d: any) => {
              if (!d.vehicle_no || d.vehicle_no === '미배정' || d.vehicle_no === 'unassigned') return;
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
                passengerName: d.passenger_name ?? null,
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
    if (phoneError) {
      setPhoneError(false);
      setValidationMsg(null);
    }
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw.length >= 10) {
      const p = parsePhoneDetails(raw);
      setPhone1(p.p1);
      setPhone2(p.p2);
      setPhone3(p.p3);
      phone3Ref.current?.focus();
      return;
    }
    const val = raw.slice(0, 3);
    setPhone1(val);
    if (val.length === 3) {
      phone2Ref.current?.focus();
    }
  };

  const handlePhone2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPresetVehicle(null);
    if (phoneError) {
      setPhoneError(false);
      setValidationMsg(null);
    }
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setPhone2(val);
    if (val.length === 4) {
      phone3Ref.current?.focus();
    }
  };

  const handlePhone3Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPresetVehicle(null);
    if (phoneError) {
      setPhoneError(false);
      setValidationMsg(null);
    }
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
    if (phoneError) {
      setPhoneError(false);
      setValidationMsg(null);
    }
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
      setNameError(false);
      setPhoneError(false);
      setPlateError(false);
      setValidationMsg(null);

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
        const initial = profileVehicleDetails(profile);
        const initPhone = parsePhoneDetails(profile.phone || profile.mobile);

        // Direct read from cockpit_driver_profile_${vehicleNo}
        const stored: ReturnType<typeof getStoredVehicleProfile> = profile.driverId ? { ...profile } : null;
        const initialPassenger =
          stored?.passengerName !== undefined
            ? (stored.passengerName ?? '')
            : (profile.passengerName ?? '');

        setHocha(initial.hocha);
        setPlateFront(stored?.carNumberFront || profile.carNumberFront || initial.plateFront);
        setPlateBack(stored?.carNumberBack || profile.carNumberBack || initial.plateBack);
        setPhone1(profile.phonePart1 || initPhone.p1 || '010');
        setPhone2(profile.phonePart2 || initPhone.p2 || '');
        setPhone3(profile.phonePart3 || initPhone.p3 || '');
        setDriverName(stored?.driverName || profile.driverName || '');
        setPassengerName(initialPassenger);
        setDefaultNavi(stored?.defaultNavi || profile.defaultNavi || 'tmap');
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
    const val = e.target.value.slice(0, 10);
    setHocha(val);
    if (val.trim()) {
      const cleanV = val.trim().includes('호차') ? val.trim() : `${val.trim()}호차`;
      const stored = getStoredVehicleProfile(cleanV);
      if (stored) {
        if (stored.passengerName !== undefined) setPassengerName(stored.passengerName ?? '');
        if (stored.driverName && !driverName) setDriverName(stored.driverName);
        if (stored.carNumberFront) setPlateFront(stored.carNumberFront);
        if (stored.carNumberBack) setPlateBack(stored.carNumberBack);
        if (stored.defaultNavi) setDefaultNavi(stored.defaultNavi);
        if (stored.phone) {
          const pObj = parsePhoneDetails(stored.phone);
          setPhone1(pObj.p1);
          setPhone2(pObj.p2);
          setPhone3(pObj.p3);
        }
      }
    }
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
    if (plateError) {
      setPlateError(false);
      setValidationMsg(null);
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
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

    let hasValidationError = false;

    if (isNameEmpty) {
      setNameError(true);
      hasValidationError = true;
    } else {
      setNameError(false);
    }

    if (isPhoneIncomplete) {
      setPhoneError(true);
      hasValidationError = true;
    } else {
      setPhoneError(false);
    }

    if (pBack && pBack.length < 4) {
      setPlateError(true);
      hasValidationError = true;
    } else {
      setPlateError(false);
    }

    if (hasValidationError) {
      haptics.warningPulse();
      setIsSaving(false);

      if (isNameEmpty && isPhoneIncomplete) {
        setValidationMsg('드라이버 성명과 연락처를 입력해 주세요.');
        driverNameRef.current?.focus();
      } else if (isNameEmpty) {
        setValidationMsg('드라이버 성명을 입력해 주세요.');
        driverNameRef.current?.focus();
      } else if (isPhoneIncomplete) {
        setValidationMsg('연락처(휴대폰 번호)를 정확히 입력해 주세요.');
        if (!phone2.trim()) {
          phone2Ref.current?.focus();
        } else {
          phone3Ref.current?.focus();
        }
      } else if (pBack && pBack.length < 4) {
        setValidationMsg('차량 번호판 뒷자리 4자리를 입력해 주세요.');
        plateBackRef.current?.focus();
      }
      return;
    }

    // Save vehicle-isolated profile to cockpit_driver_profile_${vehicleNo}

    const normalizedPassenger = passengerName.trim();
    const valueToSave = normalizedPassenger.length > 0 ? normalizedPassenger : null;


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
      passengerName: valueToSave,
      defaultNavi: defaultNavi || 'tmap',
    };

    if (valueToSave === null) {
      setPassengerName('');
    }

    try {
      const saved = await onSave(payload);
      if (saved === false) throw new Error('프로필이 저장되지 않았습니다.');
      setIsMounted(false); onClose();
    } catch (error) {
      setValidationMsg(error instanceof Error ? error.message : '저장에 실패했습니다. 다시 시도해 주세요.');
    } finally { setIsSaving(false); }

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
        className={`w-full max-w-sm bg-[#F6F8FC] border border-slate-200/80 rounded-3xl shadow-2xl overflow-y-auto overscroll-contain text-slate-900 transform transition-all duration-300 ease-out max-h-[92vh] flex flex-col ${isMounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
          }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2.5 bg-[#F6F8FC] shrink-0">
          <div className="flex items-center space-x-2.5">
            <img
              src="images/icons/drivers/icon_driver.png"
              alt="프로필설정 아이콘"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl shadow-xs object-cover shrink-0"
            />
            <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
              {isOnboarding ? '드라이버 정보 최초 등록' : '프로필 설정'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 border border-slate-200/70 shadow-2xs flex items-center justify-center text-slate-500 hover:text-slate-800 active:scale-95 transition-transform duration-100 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Clean Rounded Card Inputs with Volume */}
        <form onSubmit={handleSubmit} className="px-5 pb-5 pt-1 space-y-4 overflow-y-auto overscroll-contain flex-1">
          <p className="text-xs sm:text-[13px] font-medium text-slate-500">
            {profile.driverId ? '차량 배정은 HQ 예약·배차에서 변경합니다.' : '차량 배정엔 아래 정보가 필요해요.'}
          </p>

          {/* 1. Hocha (Optional) Field */}
          <div className="relative">
            <label className="text-xs sm:text-[13px] font-bold text-slate-800 mb-1.5 flex items-center">
              호차 (선택)
            </label>
            <div className="relative flex items-center bg-white rounded-2xl border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-[#1E60F3]/10 transition-all">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                readOnly={Boolean(profile.driverId)}
                value={hocha}
                onChange={handleHochaChange}
                placeholder="예: 99"
                className="w-full h-12 pl-4 pr-24 bg-transparent rounded-2xl text-slate-900 text-sm font-bold placeholder:font-medium placeholder:text-slate-400 focus:outline-none tabular-nums"
              />
              <button
                type="button"
                disabled={Boolean(profile.driverId)}
                onClick={() => {
                  haptics.lightTap();
                  if (ENABLE_DEV_FLEET_SWITCHER && fleetPresets.length > 0 && !profile.driverId) {
                    setIsHochaPickerOpen((prev) => !prev);
                  }
                }}
                className="absolute right-4 text-xs sm:text-[13px] font-extrabold text-[#1E60F3] hover:text-blue-700 transition-colors cursor-pointer disabled:cursor-default"
              >
                호차 선택
              </button>
            </div>

            {/* Optional Quick Hocha Preset Popover when '호차 선택' is tapped */}
            {isHochaPickerOpen && ENABLE_DEV_FLEET_SWITCHER && !profile.driverId && fleetPresets.length > 0 && (
              <div className="mt-2 p-2.5 bg-white border border-slate-200/90 rounded-2xl shadow-lg space-y-2 z-20 relative animate-in fade-in duration-150">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-slate-500">등록된 호차 빠른 선택</span>
                  <button
                    type="button"
                    onClick={() => setIsHochaPickerOpen(false)}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
                  >
                    닫기
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                  {fleetPresets.map((d) => {
                    const isCurrent = selectedPresetVehicle === d.vehicleNo;
                    return (
                      <button
                        key={d.vehicleNo}
                        type="button"
                        onClick={() => {
                          haptics.lightTap();
                          setSelectedPresetVehicle(d.vehicleNo);
                          setNameError(false);
                          setPhoneError(false);
                          setPlateError(false);
                          setValidationMsg(null);
                          const cleanV = d.vehicleNo.match(/(\d+)호차/)?.[1] ? `${d.vehicleNo.match(/(\d+)호차/)![1]}호차` : d.vehicleNo;
                          const storedProfile = getStoredVehicleProfile(cleanV);
                          const pObj = parsePhoneDetails(storedProfile?.phone || d.phone);
                          setHocha(d.hocha);
                          setPlateFront(storedProfile?.carNumberFront || d.plateFront);
                          setPlateBack(storedProfile?.carNumberBack || d.plateBack);
                          setDriverName(storedProfile?.driverName || d.driverName);
                          setPhone1(pObj.p1);
                          setPhone2(pObj.p2);
                          setPhone3(pObj.p3);
                          setDefaultNavi(storedProfile?.defaultNavi || d.defaultNavi);
                          const targetPassenger =
                            storedProfile?.passengerName !== undefined
                              ? (storedProfile.passengerName ?? '')
                              : (d.passengerName ?? '');
                          setPassengerName(targetPassenger);
                          setIsHochaPickerOpen(false);
                        }}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${isCurrent
                          ? 'bg-[#1E60F3] text-white border-[#1E60F3]'
                          : 'bg-slate-50 text-slate-700 border-slate-200/80 hover:border-[#1E60F3]/50'
                          }`}
                      >
                        <div className="text-xs font-black truncate">{d.vehicleNo}</div>
                        <div className={`text-[10px] font-bold truncate ${isCurrent ? 'text-blue-100' : 'text-slate-500'}`}>
                          {d.driverName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. License Plate Separated Inputs (plateFront & plateBack) */}
          <div>
            <label className="text-xs sm:text-[13px] font-bold text-slate-800 mb-1.5 flex items-center justify-between">
              <span className="flex items-center">
                차량 번호판
              </span>
              {plateError && (
                <span className="text-[10px] font-bold text-rose-500 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md flex items-center gap-1 animate-fade-in shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  4자리 입력 필요
                </span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Front Plate Input */}
              <div className="relative">
                <input
                  ref={plateFrontRef}
                  type="text"
                  readOnly={Boolean(profile.driverId)}
                  value={plateFront}
                  onChange={handlePlateFrontChange}
                  placeholder="예: 서울99바"
                  className="w-full h-12 px-4 bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl text-slate-900 text-sm font-bold placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10 transition-all"
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
                  readOnly={Boolean(profile.driverId)}
                  value={plateBack}
                  onChange={handlePlateBackChange}
                  onKeyDown={handlePlateBackKeyDown}
                  placeholder="예: 9999"
                  className={`w-full h-12 px-4 rounded-2xl text-slate-900 text-sm font-bold placeholder:font-medium placeholder:text-slate-400 transition-all tabular-nums ${plateError
                    ? 'bg-rose-50/40 border border-rose-400 ring-2 ring-rose-100 focus:outline-none focus:border-rose-500'
                    : 'bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10'
                    }`}
                />
              </div>
            </div>
          </div>

          {/* 3. Driver Name Field (드라이버 성명) */}
          <div>
            <label className="text-xs sm:text-[13px] font-bold text-slate-800 mb-1.5 flex items-center justify-between">
              <span className="flex items-center">
                드라이버 성명
              </span>
              {nameError && (
                <span className="text-[10.5px] font-bold text-rose-500 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md flex items-center gap-1.5 animate-fade-in shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  필수 입력
                </span>
              )}
            </label>
            <input
              ref={driverNameRef}
              type="text"
              value={driverName}
              onChange={(e) => {
                setSelectedPresetVehicle(null);
                setDriverName(e.target.value);
                if (nameError) {
                  setNameError(false);
                  setValidationMsg(null);
                }
              }}
              placeholder="예: QA 테스트 기사"
              className={`w-full h-12 px-4 rounded-2xl text-slate-900 text-sm font-bold placeholder:font-medium placeholder:text-slate-400 transition-all ${nameError
                ? 'bg-rose-50/40 border border-rose-400 ring-2 ring-rose-100 focus:outline-none focus:border-rose-500'
                : 'bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10'
                }`}
            />
          </div>

          {/* 4. Mobile Phone Number Field (가로 1줄 3칸 독립 카드) */}
          <div>
            <label className="text-xs sm:text-[13px] font-bold text-slate-800 mb-1.5 flex items-center justify-between">
              <span className="flex items-center">
                연락처
              </span>
              {phoneError && (
                <span className="text-[10.5px] font-bold text-rose-500 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md flex items-center gap-1.5 animate-fade-in shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  필수 입력
                </span>
              )}
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <div
                className={`relative flex items-center h-12 rounded-2xl transition-all ${phoneError
                  ? 'bg-rose-50/40 border border-rose-400 ring-2 ring-rose-100 focus-within:border-rose-500'
                  : 'bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-[#1E60F3]/10'
                  }`}
              >
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
                  className="w-full h-full pl-3 pr-7 bg-transparent rounded-2xl text-slate-900 text-sm font-bold text-center tabular-nums placeholder:font-medium placeholder:text-slate-400 focus:outline-none"
                />
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 pointer-events-none" />
              </div>

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
                  className={`w-full h-12 px-2 rounded-2xl text-slate-900 text-sm font-bold transition-all text-center tabular-nums placeholder:font-medium placeholder:text-slate-400 ${phoneError
                    ? 'bg-rose-50/40 border border-rose-400 ring-2 ring-rose-100 focus:outline-none focus:border-rose-500'
                    : 'bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10'
                    }`}
                />
              </div>

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
                  className={`w-full h-12 px-2 rounded-2xl text-slate-900 text-sm font-bold transition-all text-center tabular-nums placeholder:font-medium placeholder:text-slate-400 ${phoneError
                    ? 'bg-rose-50/40 border border-rose-400 ring-2 ring-rose-100 focus:outline-none focus:border-rose-500'
                    : 'bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10'
                    }`}
                />
              </div>
            </div>
          </div>

          {/* 5. Passenger Name Field */}
          <div>
            <label className="text-xs sm:text-[13px] font-bold text-slate-800 mb-1.5 flex items-center">
              담당 승객명
            </label>
            <input
              type="text"
              value={passengerName}
              onChange={(e) => setPassengerName(e.target.value)}
              placeholder="예: SOYFAN 외 1명 (미입력 시 생략)"
              className="w-full h-12 px-4 bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] rounded-2xl text-slate-900 text-sm font-bold placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/10 transition-all"
            />
          </div>

          {/* 6. Primary Navigation Switcher */}
          <div>
            <label className="text-xs sm:text-[13px] font-bold text-slate-800 mb-2 flex items-center">
              주요 내비게이션 앱
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* TMAP Option (Default) */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setDefaultNavi('tmap');
                }}
                className={`min-h-[96px] py-3 px-2 rounded-2xl border transition-all duration-150 flex flex-col items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${defaultNavi === 'tmap'
                  ? 'bg-[#EFF5FF] border-[#609CFA] text-slate-900 shadow-[0_3px_12px_rgba(30,96,243,0.10)]'
                  : 'bg-white hover:bg-slate-50 border-slate-100/90 text-slate-700 shadow-[0_3px_12px_rgba(15,23,42,0.04)]'
                  }`}
              >
                <div className="w-7 h-7 rounded-full bg-white border border-slate-100 shadow-2xs flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                <span className="text-xs font-extrabold">T맵</span>
                {defaultNavi === 'tmap' ? (
                  <Check className="w-3.5 h-3.5 text-[#1E60F3] stroke-[2.5]" />
                ) : (
                  <span className="h-3.5" />
                )}
              </button>

              {/* KakaoNavi Option */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setDefaultNavi('kakao');
                }}
                className={`min-h-[96px] py-3 px-2 rounded-2xl border transition-all duration-150 flex flex-col items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${defaultNavi === 'kakao'
                  ? 'bg-[#EFF5FF] border-[#609CFA] text-slate-900 shadow-[0_3px_12px_rgba(30,96,243,0.10)]'
                  : 'bg-white hover:bg-slate-50 border-slate-100/90 text-slate-700 shadow-[0_3px_12px_rgba(15,23,42,0.04)]'
                  }`}
              >
                <div className="w-7 h-7 rounded-full bg-[#FEE500] text-[#191919] flex items-center justify-center text-xs font-black shadow-2xs">
                  K
                </div>
                <span className="text-xs font-extrabold">카카오</span>
                {defaultNavi === 'kakao' ? (
                  <Check className="w-3.5 h-3.5 text-[#1E60F3] stroke-[2.5]" />
                ) : (
                  <span className="h-3.5" />
                )}
              </button>

              {/* NaverMap Option */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setDefaultNavi('naver');
                }}
                className={`min-h-[96px] py-3 px-2 rounded-2xl border transition-all duration-150 flex flex-col items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${defaultNavi === 'naver'
                  ? 'bg-[#EFF5FF] border-[#609CFA] text-slate-900 shadow-[0_3px_12px_rgba(30,96,243,0.10)]'
                  : 'bg-white hover:bg-slate-50 border-slate-100/90 text-slate-700 shadow-[0_3px_12px_rgba(15,23,42,0.04)]'
                  }`}
              >
                <div className="w-7 h-7 rounded-full bg-[#03C75A] text-white flex items-center justify-center text-xs font-black shadow-2xs">
                  N
                </div>
                <span className="text-xs font-extrabold">네이버</span>
                {defaultNavi === 'naver' ? (
                  <Check className="w-3.5 h-3.5 text-[#1E60F3] stroke-[2.5]" />
                ) : (
                  <span className="h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Validation Notice Banner */}
          {validationMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50/90 border border-rose-200/90 flex items-center gap-2 text-sm font-bold text-rose-600 animate-fade-in shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 animate-ping" />
              <span>{validationMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="w-[34%] h-12 sm:h-13 rounded-2xl bg-white hover:bg-slate-50 border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-slate-800 text-sm font-extrabold active:scale-95 transition-all duration-100 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`flex-1 h-12 sm:h-13 rounded-2xl bg-[#0055FF] hover:bg-[#0046D5] active:bg-[#003BB5] active:scale-[0.98] text-white text-sm font-extrabold shadow-[0_6px_18px_rgba(0,85,255,0.28)] transition-all duration-150 ease-out cursor-pointer flex items-center justify-center gap-1.5 ${isSaving ? 'opacity-85 pointer-events-none' : ''
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
