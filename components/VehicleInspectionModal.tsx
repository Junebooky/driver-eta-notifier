'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriverProfile } from '@/types';
import {
  generateReceiptReport,
  generateReturnReport,
  generateDailyReport,
  saveInitialInspection,
  getInitialInspection,
  saveDailyInspection,
  getDailyInspection,
  formatInspectionDate,
  extractHocha,
  getInspectionStorageKey,
  STORAGE_KEY_INITIAL_INSPECTION,
  InitialInspectionData,
} from '@/utils/vehicleReport';
import { copyAndLaunchKakaoTalk } from '@/utils/kakao';
import { haptics } from '@/utils/haptics';
import {
  X,
  ClipboardCheck,
  RotateCcw,
  Check,
  Copy,
  Gauge,
  Camera,
  CalendarCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { VehicleTopDownViewer } from '@/components/VehicleTopDownViewer';

interface VehicleInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  initialMode?: 'pickup' | 'daily' | 'return' | 'receipt';
}

const DAMAGE_PART_CHIPS = [
  '앞 범퍼',
  '뒷 범퍼',
  '앞 휠 (운전석)',
  '앞 휠 (조수석)',
  '도어 (운전석)',
  '도어 (조수석)',
  '뒷 휠 (운전석)',
  '뒷 휠 (조수석)',
  '유리/윈드실드',
];

/**
 * Format raw numeric string into 3-digit comma separated format
 * e.g. "55555" -> "55,555", "" -> ""
 */
const formatNumberWithComma = (val: string | number | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '';
  const clean = String(val).replace(/[^0-9]/g, '');
  if (!clean) return '';
  const num = Number(clean);
  return isNaN(num) ? '' : num.toLocaleString();
};

/**
 * Extract clean digit string from input
 * e.g. "55,555" -> "55555"
 */
const sanitizeNumericInput = (val: string): string => {
  return val.replace(/[^0-9]/g, '');
};

export const VehicleInspectionModal: React.FC<VehicleInspectionModalProps> = ({
  isOpen,
  onClose,
  profile,
  initialMode = 'pickup',
}) => {
  const normalizedInitialMode = initialMode === 'receipt' ? 'pickup' : (initialMode || 'pickup');
  const [activeTab, setActiveTab] = useState<'pickup' | 'daily' | 'return'>(normalizedInitialMode);

  // Profile hocha and car number defaults
  const detectedHocha = useMemo(() => {
    return extractHocha(profile.vehicleNo) || '';
  }, [profile.vehicleNo]);

  const detectedCarNumber = useMemo(() => {
    if (profile.carNumber?.trim()) return profile.carNumber.trim();
    const parts = (profile.vehicleNo || '').split(' ');
    if (parts.length >= 2) return parts.slice(1).join(' ').trim();
    return '';
  }, [profile.carNumber, profile.vehicleNo]);

  // Form Fields State
  const [vehicleHocha, setVehicleHocha] = useState(detectedHocha);
  const [carNumber, setCarNumber] = useState(detectedCarNumber);

  // Pickup Inputs (Formerly Receipt)
  const [receiptTotalKm, setReceiptTotalKm] = useState<string>('');
  const [receiptDte, setReceiptDte] = useState<string>('');
  const [receiptDamage, setReceiptDamage] = useState<string>('무');
  const [receiptSelectedParts, setReceiptSelectedParts] = useState<string[]>([]);
  const [receiptMeterPhoto, setReceiptMeterPhoto] = useState<string | null>(null);

  // Daily Inputs
  const [dailyDte, setDailyDte] = useState<string>('');
  const [dailyNewParts, setDailyNewParts] = useState<string[]>([]);
  const [dailyMeterPhoto, setDailyMeterPhoto] = useState<string | null>(null);

  // Return Inputs
  const [returnTotalKm, setReturnTotalKm] = useState<string>('');
  const [returnDte, setReturnDte] = useState<string>('');
  const [returnDamage, setReturnDamage] = useState<string>('무');
  const [returnSelectedParts, setReturnSelectedParts] = useState<string[]>([]);
  const [returnMeterPhoto, setReturnMeterPhoto] = useState<string | null>(null);
  const [parkingLocation, setParkingLocation] = useState<string>('');
  const [keyLocation, setKeyLocation] = useState<string>('');

  // Stored Initial Inspection Data
  const [initialData, setInitialData] = useState<InitialInspectionData | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // File input refs for local photo viewer
  const receiptPhotoInputRef = useRef<HTMLInputElement>(null);
  const dailyPhotoInputRef = useRef<HTMLInputElement>(null);
  const returnPhotoInputRef = useRef<HTMLInputElement>(null);

  // Existing damage parts inherited from initial receipt inspection or current receipt state
  const existingDamageParts = useMemo(() => {
    if (initialData?.selectedParts && initialData.selectedParts.length > 0) {
      return initialData.selectedParts;
    }
    if (initialData?.outerDamage && initialData.outerDamage !== '무') {
      const matched = DAMAGE_PART_CHIPS.filter((part) => initialData.outerDamage!.includes(part));
      if (matched.length > 0) return matched;
    }
    return receiptSelectedParts;
  }, [initialData, receiptSelectedParts]);

  // OCR Feedback State
  const [isOcrAnalyzing, setIsOcrAnalyzing] = useState<boolean>(false);
  const [ocrFeedback, setOcrFeedback] = useState<string | null>(null);

  const isLoadedRef = useRef(false);

  // Explicitly reset all inspection fields to pristine clean state
  const resetToCleanState = () => {
    setReceiptTotalKm('');
    setReceiptDte('');
    setReceiptDamage('무');
    setReceiptSelectedParts([]);
    setReceiptMeterPhoto(null);

    setDailyDte('');
    setDailyNewParts([]);
    setDailyMeterPhoto(null);

    setReturnTotalKm('');
    setReturnDte('');
    setReturnDamage('무');
    setReturnSelectedParts([]);
    setReturnMeterPhoto(null);
    setParkingLocation('');
    setKeyLocation('');

    setInitialData(null);
  };

  // Persist current inspection data to vehicle-specific isolated storage key
  const saveVehicleInspectionData = (overrides?: Record<string, any>) => {
    if (typeof window === 'undefined') return;
    const currentKey = getInspectionStorageKey(profile.vehicleNo || vehicleHocha);

    const initialKmNum = parseFloat(sanitizeNumericInput(receiptTotalKm)) || 0;
    const initialDteNum = parseFloat(sanitizeNumericInput(receiptDte)) || 0;

    let currentInitialData = initialData;
    if (activeTab === 'pickup' || !currentInitialData) {
      if (initialKmNum > 0 || receiptSelectedParts.length > 0 || (receiptDamage && receiptDamage !== '무')) {
        currentInitialData = {
          initialTotalKm: initialKmNum,
          initialDte: initialDteNum,
          inspectionDate: formatInspectionDate(),
          vehicleHocha: vehicleHocha || detectedHocha,
          carNumber: carNumber || detectedCarNumber,
          outerDamage: receiptDamage,
          selectedParts: receiptSelectedParts,
          savedAt: initialData?.savedAt || new Date().toISOString(),
        };
        setInitialData(currentInitialData);
      }
    }

    const payload = {
      vehicleHocha: vehicleHocha || detectedHocha,
      carNumber: carNumber || detectedCarNumber,
      // Pickup
      pickupOdo: receiptTotalKm,
      pickupDte: receiptDte,
      receiptDamage,
      receiptSelectedParts,
      damagePoints: receiptSelectedParts,
      meterPhoto: receiptMeterPhoto,
      // Daily
      dailyDte,
      dailyNewParts,
      dailyMeterPhoto,
      // Return
      returnOdo: returnTotalKm,
      returnDte,
      returnDamage,
      returnSelectedParts,
      returnMeterPhoto,
      parkingLocation,
      keyLocation,
      // Initial Data snapshot for return calculation
      initialData: currentInitialData,
      savedAt: new Date().toISOString(),
      ...overrides,
    };

    try {
      localStorage.setItem(currentKey, JSON.stringify(payload));
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
        try {
          const lightweight = {
            ...payload,
            meterPhoto: null,
            dailyMeterPhoto: null,
            returnMeterPhoto: null,
          };
          localStorage.setItem(currentKey, JSON.stringify(lightweight));
        } catch (e) {
          console.warn('LocalStorage save failed even without images:', e);
        }
      } else {
        console.warn('Failed to save vehicle inspection data to localStorage:', err);
      }
    }
  };

  // Sync profile defaults & restore isolated vehicle inspection data when modal opens or profile changes
  useEffect(() => {
    if (!isOpen) {
      isLoadedRef.current = false;
      return;
    }

    const currentKey = getInspectionStorageKey(profile.vehicleNo);
    let rawData: string | null = null;
    try {
      rawData = localStorage.getItem(currentKey);
      if (!rawData && profile.vehicleNo) {
        rawData = localStorage.getItem(`cockpit_vehicle_inspection_${profile.vehicleNo.trim()}`);
      }
      if (!rawData) {
        // Fallback: Check if legacy initial inspection exists and belongs to this vehicle
        const legacyRaw = localStorage.getItem(STORAGE_KEY_INITIAL_INSPECTION);
        if (legacyRaw) {
          try {
            const legacyParsed = JSON.parse(legacyRaw);
            const legacyHocha = extractHocha(legacyParsed.vehicleHocha);
            if (legacyHocha && legacyHocha === extractHocha(profile.vehicleNo)) {
              rawData = JSON.stringify({
                vehicleHocha: legacyParsed.vehicleHocha,
                carNumber: legacyParsed.carNumber,
                pickupOdo: String(legacyParsed.initialTotalKm || ''),
                pickupDte: String(legacyParsed.initialDte || ''),
                receiptDamage: legacyParsed.outerDamage || '무',
                receiptSelectedParts: legacyParsed.selectedParts || [],
                damagePoints: legacyParsed.selectedParts || [],
                initialData: legacyParsed,
                savedAt: legacyParsed.savedAt,
              });
              localStorage.setItem(currentKey, rawData);
            }
          } catch { }
        }
      }
    } catch (e) {
      console.warn('스토리지 읽기 실패:', e);
    }

    if (rawData) {
      try {
        const parsed = JSON.parse(rawData);
        setVehicleHocha(parsed.vehicleHocha || detectedHocha);
        setCarNumber(parsed.carNumber || detectedCarNumber);

        // Pickup (Receipt) Data
        const pOdo = parsed.pickupOdo || parsed.receiptTotalKm || '';
        const pDte = parsed.pickupDte || parsed.receiptDte || '';
        const pDamage = parsed.receiptDamage || parsed.outerDamage || '무';
        const pParts = parsed.damagePoints || parsed.receiptSelectedParts || parsed.selectedParts || [];
        const pPhoto = parsed.meterPhoto || parsed.receiptMeterPhoto || null;

        setReceiptTotalKm(pOdo);
        setReceiptDte(pDte);
        setReceiptDamage(pDamage);
        setReceiptSelectedParts(pParts);
        setReceiptMeterPhoto(pPhoto);

        // Daily Data
        const dDte = parsed.dailyDte || (typeof parsed.range === 'number' ? String(parsed.range) : '');
        const dParts = parsed.dailyNewParts || parsed.newDamages || [];
        const dPhoto = parsed.dailyMeterPhoto || null;

        setDailyDte(dDte);
        setDailyNewParts(dParts);
        setDailyMeterPhoto(dPhoto);

        // Return Data
        const rOdo = parsed.returnOdo || parsed.returnTotalKm || '';
        const rDte = parsed.returnDte || '';
        const rDamage = parsed.returnDamage || '무';
        const rParts = parsed.returnSelectedParts || [];
        const rPhoto = parsed.returnMeterPhoto || null;
        const pLoc = parsed.parkingLocation || '';
        const kLoc = parsed.keyLocation || '';

        setReturnTotalKm(rOdo);
        setReturnDte(rDte);
        setReturnDamage(rDamage);
        setReturnSelectedParts(rParts);
        setReturnMeterPhoto(rPhoto);
        setParkingLocation(pLoc);
        setKeyLocation(kLoc);

        // Initial Data for calculations
        if (parsed.initialData) {
          setInitialData(parsed.initialData);
        } else if (pOdo || pParts.length > 0) {
          setInitialData({
            initialTotalKm: parseFloat(sanitizeNumericInput(pOdo)) || 0,
            initialDte: parseFloat(sanitizeNumericInput(pDte)) || 0,
            inspectionDate: parsed.inspectionDate || formatInspectionDate(),
            vehicleHocha: parsed.vehicleHocha || detectedHocha,
            carNumber: parsed.carNumber || detectedCarNumber,
            outerDamage: pDamage,
            selectedParts: pParts,
            savedAt: parsed.savedAt || new Date().toISOString(),
          });
        } else {
          setInitialData(null);
        }
      } catch (e) {
        console.error('점검 데이터 파싱 실패:', e);
        resetToCleanState();
        setVehicleHocha(detectedHocha);
        setCarNumber(detectedCarNumber);
      }
    } else {
      // 해당 호차의 점검 기록이 없으면 깨끗한 초기 상태(Clean State)로 리셋
      resetToCleanState();
      setVehicleHocha(detectedHocha);
      setCarNumber(detectedCarNumber);
    }

    isLoadedRef.current = true;
  }, [isOpen, profile.vehicleNo, detectedHocha, detectedCarNumber]);

  // Auto-persist changes to vehicle-isolated key when fields update
  useEffect(() => {
    if (!isOpen || !isLoadedRef.current) return;
    const timer = setTimeout(() => {
      saveVehicleInspectionData();
    }, 300);
    return () => clearTimeout(timer);
  }, [
    isOpen,
    profile.vehicleNo,
    vehicleHocha,
    carNumber,
    receiptTotalKm,
    receiptDte,
    receiptDamage,
    receiptSelectedParts,
    receiptMeterPhoto,
    dailyDte,
    dailyNewParts,
    dailyMeterPhoto,
    returnTotalKm,
    returnDte,
    returnDamage,
    returnSelectedParts,
    returnMeterPhoto,
    parkingLocation,
    keyLocation,
  ]);

  useEffect(() => {
    setActiveTab(initialMode === 'receipt' ? 'pickup' : (initialMode || 'pickup'));
  }, [initialMode]);

  // Carry over receipt and daily damages to return tab when switching to return
  useEffect(() => {
    if (activeTab === 'return') {
      const combined = Array.from(new Set([...existingDamageParts, ...dailyNewParts]));
      if (combined.length > 0 && returnSelectedParts.length === 0) {
        setReturnSelectedParts(combined);
        const newlyAdded = combined.filter((p) => !existingDamageParts.includes(p));
        if (existingDamageParts.length > 0 && newlyAdded.length > 0) {
          setReturnDamage(`기존: ${existingDamageParts.join(', ')} / 신규: ${newlyAdded.join(', ')}`);
        } else if (newlyAdded.length > 0) {
          setReturnDamage(`신규 스크래치: ${newlyAdded.join(', ')}`);
        } else {
          setReturnDamage(`${existingDamageParts.join(', ')} (수령 시와 동일)`);
        }
      }
    }
  }, [activeTab, existingDamageParts, dailyNewParts]);

  // Clean up object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (receiptMeterPhoto) URL.revokeObjectURL(receiptMeterPhoto);
      if (dailyMeterPhoto) URL.revokeObjectURL(dailyMeterPhoto);
      if (returnMeterPhoto) URL.revokeObjectURL(returnMeterPhoto);
    };
  }, [receiptMeterPhoto, dailyMeterPhoto, returnMeterPhoto]);

  // Damage chip toggle handler (pickup & return)
  const handleToggleDamageChip = (part: string, mode: 'pickup' | 'return') => {
    haptics.lightTap();
    if (mode === 'pickup') {
      const isSelected = receiptSelectedParts.includes(part);
      const newParts = isSelected
        ? receiptSelectedParts.filter((p) => p !== part)
        : [...receiptSelectedParts, part];

      setReceiptSelectedParts(newParts);
      if (newParts.length === 0) {
        setReceiptDamage('무');
      } else {
        setReceiptDamage(`${newParts.join(', ')} 기스`);
      }
    } else {
      const isSelected = returnSelectedParts.includes(part);
      const newParts = isSelected
        ? returnSelectedParts.filter((p) => p !== part)
        : [...returnSelectedParts, part];

      setReturnSelectedParts(newParts);

      const existing = newParts.filter((p) => existingDamageParts.includes(p));
      const newlyAdded = newParts.filter((p) => !existingDamageParts.includes(p));

      if (newParts.length === 0) {
        setReturnDamage('무');
      } else if (existing.length > 0 && newlyAdded.length > 0) {
        setReturnDamage(`기존: ${existing.join(', ')} / 신규: ${newlyAdded.join(', ')}`);
      } else if (newlyAdded.length > 0) {
        setReturnDamage(`신규 스크래치: ${newlyAdded.join(', ')}`);
      } else {
        setReturnDamage(`${existing.join(', ')} (수령 시와 동일)`);
      }
    }
  };

  // Daily Damage Toggle (Only allows toggling new scratches)
  const handleToggleDailyDamage = (part: string) => {
    haptics.lightTap();
    if (existingDamageParts.includes(part)) {
      return;
    }
    const isSelected = dailyNewParts.includes(part);
    setDailyNewParts(isSelected ? dailyNewParts.filter((p) => p !== part) : [...dailyNewParts, part]);
  };

  // Reset daily damage to clean
  const handleResetDailyDamage = () => {
    haptics.lightTap();
    setDailyNewParts([]);
  };

  // Reset to clean damage chip ("무")
  const handleResetDamageToClean = (mode: 'pickup' | 'return') => {
    haptics.lightTap();
    if (mode === 'pickup') {
      setReceiptSelectedParts([]);
      setReceiptDamage('무');
    } else {
      setReturnSelectedParts([]);
      setReturnDamage('무');
    }
  };

  // Local meter photo upload handler + Gemini Vision AI Dashboard Analysis
  const handleMeterPhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'pickup' | 'daily' | 'return'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.lightTap();
    const objectUrl = URL.createObjectURL(file);
    if (mode === 'pickup') {
      if (receiptMeterPhoto) URL.revokeObjectURL(receiptMeterPhoto);
      setReceiptMeterPhoto(objectUrl);
    } else if (mode === 'daily') {
      if (dailyMeterPhoto) URL.revokeObjectURL(dailyMeterPhoto);
      setDailyMeterPhoto(objectUrl);
    } else {
      if (returnMeterPhoto) URL.revokeObjectURL(returnMeterPhoto);
      setReturnMeterPhoto(objectUrl);
    }

    // Call Gemini Vision Dashboard OCR API
    setIsOcrAnalyzing(true);
    setOcrFeedback(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await fetch('/api/inspect-dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Data,
            vehicleNo: vehicleHocha || profile.vehicleNo || '',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            haptics.successPulse();
            if (typeof data.totalKm === 'number') {
              if (mode === 'pickup') setReceiptTotalKm(String(data.totalKm));
              if (mode === 'return') setReturnTotalKm(String(data.totalKm));
            }
            if (typeof data.dte === 'number') {
              if (mode === 'pickup') setReceiptDte(String(data.dte));
              if (mode === 'daily') setDailyDte(String(data.dte));
              if (mode === 'return') setReturnDte(String(data.dte));
            }
            if (data.reasoning) {
              setOcrFeedback(data.reasoning);
            }
          }
        }
      } catch (err) {
        console.warn('Dashboard OCR analysis error:', err);
      } finally {
        setIsOcrAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);

    // Reset file input value so same file can be reselected
    e.target.value = '';
  };

  // Remove meter photo
  const handleRemoveMeterPhoto = (mode: 'pickup' | 'daily' | 'return') => {
    haptics.lightTap();
    setOcrFeedback(null);
    if (mode === 'pickup') {
      if (receiptMeterPhoto) URL.revokeObjectURL(receiptMeterPhoto);
      setReceiptMeterPhoto(null);
    } else if (mode === 'daily') {
      if (dailyMeterPhoto) URL.revokeObjectURL(dailyMeterPhoto);
      setDailyMeterPhoto(null);
    } else {
      if (returnMeterPhoto) URL.revokeObjectURL(returnMeterPhoto);
      setReturnMeterPhoto(null);
    }
  };

  // Real-time Preview Text Generation
  const previewText = useMemo(() => {
    if (activeTab === 'pickup') {
      return generateReceiptReport({
        vehicleHocha,
        carNumber,
        totalKm: receiptTotalKm,
        dte: receiptDte,
        outerDamage: receiptDamage,
      });
    } else if (activeTab === 'daily') {
      return generateDailyReport({
        date: formatInspectionDate(),
        vehicleNo: vehicleHocha,
        plateNumber: carNumber,
        range: parseFloat(dailyDte) || 0,
        existingDamages: existingDamageParts,
        newDamages: dailyNewParts,
      });
    } else {
      return generateReturnReport({
        vehicleHocha,
        carNumber,
        returnTotalKm,
        returnDte,
        outerDamage: returnDamage,
        parkingLocation,
        keyLocation,
        initialData,
      });
    }
  }, [
    activeTab,
    vehicleHocha,
    carNumber,
    receiptTotalKm,
    receiptDte,
    receiptDamage,
    dailyDte,
    existingDamageParts,
    dailyNewParts,
    returnTotalKm,
    returnDte,
    returnDamage,
    parkingLocation,
    keyLocation,
    initialData,
  ]);

  if (!isOpen) return null;

  // Handle Save (Confirm button) - saves to vehicle-isolated localStorage and closes
  const handleConfirmSave = () => {
    haptics.lightTap();
    saveVehicleInspectionData();
    onClose();
  };

  // Handle Save & Launch KakaoTalk
  const handleKakaoLaunch = async () => {
    haptics.successPulse();
    saveVehicleInspectionData();
    await copyAndLaunchKakaoTalk(previewText);
  };

  // Minimal Header Copy Action (Icon feedback only)
  const handleCopyMinimal = () => {
    haptics.success();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(previewText);
    }
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1500);
  };

  const isReceiptClean = receiptSelectedParts.length === 0 && (receiptDamage === '무' || !receiptDamage);
  const isReturnClean = returnSelectedParts.length === 0 && (returnDamage === '무' || !returnDamage);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-scale-up">
        {/* Header: Title + Close */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shadow-xs">
              <ClipboardCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                차량 인수·반납 체크
              </h2>
              <p className="text-[11px] text-slate-400 font-normal">
                {formatInspectionDate()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Segmented Control (3단 전환: 수령 | 일일 | 반납) */}
        <div className="px-5 pt-3.5 pb-2 shrink-0">
          <div className="w-full bg-slate-100/90 p-1 rounded-full relative flex items-center select-none shadow-inner">
            {/* Sliding Pill Indicator */}
            <div
              className={`w-[calc((100%-8px)/3)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-full bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-transform duration-300 ease-out pointer-events-none transform ${activeTab === 'pickup'
                ? 'translate-x-0'
                : activeTab === 'daily'
                  ? 'translate-x-full'
                  : 'translate-x-[200%]'
                }`}
            />

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveTab('pickup');
              }}
              className="flex-1 py-2 rounded-full z-10 flex items-center justify-center space-x-1 sm:space-x-1.5 cursor-pointer transition-colors duration-300"
            >
              <Gauge className={`w-3.5 h-3.5 ${activeTab === 'pickup' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-sm tracking-tight transition-colors duration-300 ${activeTab === 'pickup' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
                  }`}
              >
                인수
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveTab('daily');
              }}
              className="flex-1 py-2 rounded-full z-10 flex items-center justify-center space-x-1 sm:space-x-1.5 cursor-pointer transition-colors duration-300"
            >
              <CalendarCheck className={`w-3.5 h-3.5 ${activeTab === 'daily' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-sm tracking-tight transition-colors duration-300 ${activeTab === 'daily' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
                  }`}
              >
                데일리 체크
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveTab('return');
              }}
              className="flex-1 py-2 rounded-full z-10 flex items-center justify-center space-x-1 sm:space-x-1.5 cursor-pointer transition-colors duration-300"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${activeTab === 'return' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-sm tracking-tight transition-colors duration-300 ${activeTab === 'return' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
                  }`}
              >
                반납
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4 text-base">
          {/* Vehicle Basic Info Row: 2 columns (차량호차, 차량번호) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[13px] font-semibold text-slate-600 mb-1 truncate">
                호차
              </label>
              <input
                type="text"
                value={vehicleHocha}
                onChange={(e) => setVehicleHocha(e.target.value)}
                placeholder="4호차"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors text-base"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-slate-600 mb-1 truncate">
                차량번호
              </label>
              <input
                type="text"
                value={carNumber}
                onChange={(e) => setCarNumber(e.target.value)}
                placeholder="142호 7811"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors text-base"
              />
            </div>
          </div>

          {/* TAB 1: PICKUP MODE */}
          {activeTab === 'pickup' && (
            <div className="space-y-3 animate-fade-in">
              {/* Meter Inputs */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                    총 주행거리 (km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(receiptTotalKm)}
                    onChange={(e) => setReceiptTotalKm(sanitizeNumericInput(e.target.value))}
                    placeholder="예: 14,698"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                    주행가능거리 (km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(receiptDte)}
                    onChange={(e) => setReceiptDte(sanitizeNumericInput(e.target.value))}
                    placeholder="예: 276"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Dashboard Photo Slot */}
              <div>
                <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                  계기판 AI 자동 인식 ✨
                </label>
                {receiptMeterPhoto ? (
                  <div className="relative w-full h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group">
                    <img
                      src={receiptMeterPhoto}
                      alt="수령 계기판 사진"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMeterPhoto('pickup')}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-md active:scale-90 cursor-pointer"
                      title="사진 삭제"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-slate-900/60 backdrop-blur-xs text-[10px] text-white font-medium">
                      로컬 미리보기 (DB 업로드 없음)
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={receiptPhotoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleMeterPhotoUpload(e, 'pickup')}
                    />
                    <button
                      type="button"
                      onClick={() => receiptPhotoInputRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-[#1E60F3] bg-slate-50 hover:bg-blue-50/20 text-slate-500 hover:text-[#1E60F3] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-semibold">계기판 사진 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* OCR Analysis State & Feedback Banner */}
              {isOcrAnalyzing && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-blue-700 text-sm animate-pulse">
                  <Sparkles className="w-4 h-4 text-[#1E60F3] shrink-0 animate-spin" />
                  <span>Gemini Vision이 계기판 주행거리 및 타코미터 RPM을 분석 중입니다...</span>
                </div>
              )}
              {ocrFeedback && !isOcrAnalyzing && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm">
                  <Sparkles className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">계기판 자동 인식 완료</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{ocrFeedback}</p>
                  </div>
                </div>
              )}

              {/* 2D Top-Down Interactive Vehicle Inspection Viewer */}
              <div className="space-y-1 pt-0.5">
                <label className="block text-[13px] font-semibold text-slate-600">
                  차량 외관 체크
                </label>
                <VehicleTopDownViewer
                  selectedParts={receiptSelectedParts}
                  onTogglePart={(part) => handleToggleDamageChip(part, 'pickup')}
                  mode="pickup"
                />
              </div>

              {/* Outer Damage Quick Chip Selector & Input */}
              <div className="space-y-1 pt-1">
                <label className="block text-[13px] font-semibold text-slate-600">
                  흠집 위치 선택
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {/* Clean reset chip */}
                  <button
                    type="button"
                    onClick={() => handleResetDamageToClean('pickup')}
                    className={`px-2.5 py-1 text-sm rounded-lg border transition-all cursor-pointer flex items-center ${isReceiptClean
                      ? 'border-[#1E60F3]/40 bg-blue-50/70 text-slate-800 font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-400 font-medium hover:bg-slate-50'
                      }`}
                  >
                    <span className={isReceiptClean ? 'text-[#1E60F3] font-black text-sm mr-1' : 'text-slate-300 text-sm mr-1'}>
                      ✓
                    </span>
                    <span>이상 없음 (무)</span>
                  </button>

                  {/* Body part chips */}
                  {DAMAGE_PART_CHIPS.map((part) => {
                    const isSelected = receiptSelectedParts.includes(part);
                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => handleToggleDamageChip(part, 'pickup')}
                        className={`px-2.5 py-1 text-sm rounded-lg border transition-all cursor-pointer ${isSelected
                          ? 'border-[#1E60F3]/40 bg-[#1E60F3]/85 hover:bg-[#1E60F3]/90 text-white font-bold shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-600 font-medium hover:bg-slate-100'
                          }`}
                      >
                        {part}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                    외관 데미지 상세 (직접 수정 가능)
                  </label>
                  <input
                    type="text"
                    value={receiptDamage}
                    onChange={(e) => setReceiptDamage(e.target.value)}
                    placeholder="무 (미입력 시 '무' 표기)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DAILY INSPECTION MODE */}
          {activeTab === 'daily' && (
            <div className="space-y-3 animate-fade-in">
              {/* Range Input Only (Odometer Hidden) */}
              <div>
                <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                  주행가능거리 (km)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatNumberWithComma(dailyDte)}
                  onChange={(e) => setDailyDte(sanitizeNumericInput(e.target.value))}
                  placeholder="예: 280"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                />
              </div>

              {/* Dashboard Photo Slot for Daily */}
              <div>
                <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                  계기판 사진 (선택)
                </label>
                {dailyMeterPhoto ? (
                  <div className="relative w-full h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group">
                    <img
                      src={dailyMeterPhoto}
                      alt="일일 점검 계기판 사진"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMeterPhoto('daily')}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-md active:scale-90 cursor-pointer"
                      title="사진 삭제"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-slate-900/60 backdrop-blur-xs text-[10px] text-white font-medium">
                      로컬 미리보기 (DB 업로드 없음)
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={dailyPhotoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleMeterPhotoUpload(e, 'daily')}
                    />
                    <button
                      type="button"
                      onClick={() => dailyPhotoInputRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-[#1E60F3] bg-slate-50 hover:bg-blue-50/20 text-slate-500 hover:text-[#1E60F3] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-semibold">계기판 사진 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* OCR Analysis State & Feedback Banner */}
              {isOcrAnalyzing && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-blue-700 text-sm animate-pulse">
                  <Sparkles className="w-4 h-4 text-[#1E60F3] shrink-0 animate-spin" />
                  <span>Gemini Vision이 계기판을 분석 중입니다...</span>
                </div>
              )}
              {ocrFeedback && !isOcrAnalyzing && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm">
                  <Sparkles className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">계기판 인식 완료</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{ocrFeedback}</p>
                  </div>
                </div>
              )}

              {/* 2D Top-Down Interactive Vehicle Inspection Viewer */}
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[13px] font-semibold text-slate-600">
                    차량 외관 2D 탑뷰 점검
                  </label>
                  <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
                    {existingDamageParts.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                        기존 누적 {existingDamageParts.length}
                      </span>
                    )}
                    {dailyNewParts.length > 0 && (
                      <span className="flex items-center gap-1 text-red-600 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        금일 신규 {dailyNewParts.length}
                      </span>
                    )}
                  </div>
                </div>
                <VehicleTopDownViewer
                  selectedParts={[...existingDamageParts, ...dailyNewParts]}
                  onTogglePart={handleToggleDailyDamage}
                  existingParts={existingDamageParts}
                  mode="daily"
                />
              </div>

              {/* Outer Damage Quick Chip Selector & One-Touch Clean */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[13px] font-semibold text-slate-600">
                    외관 부위별 빠른 선택
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {/* One-touch clean check button */}
                  <button
                    type="button"
                    onClick={handleResetDailyDamage}
                    className={`px-2.5 py-1 text-sm rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${dailyNewParts.length === 0
                      ? 'border-[#1E60F3]/40 bg-blue-50/70 text-[#1E60F3] font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-400 font-medium hover:bg-slate-50'
                      }`}
                  >
                    <span className={dailyNewParts.length === 0 ? 'text-[#1E60F3] font-black text-sm mr-0.5' : 'text-slate-300 text-sm mr-0.5'}>
                      ✓
                    </span>
                    <span>이상없음 (무) </span>
                  </button>

                  {/* Body part chips with Existing vs New differentiation */}
                  {DAMAGE_PART_CHIPS.map((part) => {
                    const isExisting = existingDamageParts.includes(part);
                    const isNew = dailyNewParts.includes(part);

                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => handleToggleDailyDamage(part)}
                        className={`px-2.5 py-1 text-sm rounded-lg border transition-all flex items-center gap-1 ${isExisting
                          ? 'border-slate-200 bg-slate-100 text-slate-500 font-medium cursor-default opacity-85'
                          : isNew
                            ? 'border-red-400 bg-red-500 hover:bg-red-600 text-white font-bold shadow-xs ring-1 ring-red-400/50 cursor-pointer'
                            : 'border-slate-200 bg-slate-50 text-slate-600 font-medium hover:bg-slate-100 cursor-pointer'
                          }`}
                      >
                        <span>{part}</span>
                        {isExisting && (
                          <span className="text-[9px] bg-slate-300 text-slate-600 font-semibold px-1 rounded-xs leading-none py-0.5">
                            기존
                          </span>
                        )}
                        {isNew && (
                          <span className="text-[9px] bg-white text-red-600 font-black px-1 rounded-xs leading-none py-0.5">
                            신규
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RETURN MODE */}
          {activeTab === 'return' && (
            <div className="space-y-3 animate-fade-in">
              {/* Meter Inputs */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                    반납 총 주행거리 (km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(returnTotalKm)}
                    onChange={(e) => setReturnTotalKm(sanitizeNumericInput(e.target.value))}
                    placeholder="예: 15,048"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                    반납 주행가능거리 (km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(returnDte)}
                    onChange={(e) => setReturnDte(sanitizeNumericInput(e.target.value))}
                    placeholder="예: 180"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Task 4: Dashboard Photo Slot for Return */}
              <div>
                <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                  계기판 AI 자동 입력 ✨
                </label>
                {returnMeterPhoto ? (
                  <div className="relative w-full h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group">
                    <img
                      src={returnMeterPhoto}
                      alt="반납 계기판 사진"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMeterPhoto('return')}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-md active:scale-90 cursor-pointer"
                      title="사진 삭제"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-slate-900/60 backdrop-blur-xs text-[10px] text-white font-medium">
                      로컬 미리보기 (DB 업로드 없음)
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={returnPhotoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleMeterPhotoUpload(e, 'return')}
                    />
                    <button
                      type="button"
                      onClick={() => returnPhotoInputRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-[#1E60F3] bg-slate-50 hover:bg-blue-50/20 text-slate-500 hover:text-[#1E60F3] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-semibold">계기판 사진 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* OCR Analysis State & Feedback Banner */}
              {isOcrAnalyzing && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-blue-700 text-sm animate-pulse">
                  <Sparkles className="w-4 h-4 text-[#1E60F3] shrink-0 animate-spin" />
                  <span>Gemini Vision이 반납 계기판을 분석 중입니다...</span>
                </div>
              )}
              {ocrFeedback && !isOcrAnalyzing && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm">
                  <Sparkles className="w-3.5 h-3.5 text-[#1E60F3] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">반납 계기판 인식 완료</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{ocrFeedback}</p>
                  </div>
                </div>
              )}

              {/* 2D Top-Down Interactive Vehicle Inspection Viewer with Receipt Data Inheritance */}
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[13px] font-semibold text-slate-600">
                    차량 외관 2D 탑뷰 점검
                  </label>
                  {existingDamageParts.length > 0 && (
                    <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1E60F3]" />
                        수령 기존
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        반납 신규
                      </span>
                    </div>
                  )}
                </div>
                <VehicleTopDownViewer
                  selectedParts={returnSelectedParts}
                  onTogglePart={(part) => handleToggleDamageChip(part, 'return')}
                  existingParts={existingDamageParts}
                  mode="return"
                />
              </div>

              {/* Task 3: Outer Damage Quick Chip Selector & Input */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[13px] font-semibold text-slate-600">
                    외관 부위별 빠른 선택
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {/* Clean reset chip */}
                  <button
                    type="button"
                    onClick={() => handleResetDamageToClean('return')}
                    className={`px-2.5 py-1 text-sm rounded-lg border transition-all cursor-pointer flex items-center ${isReturnClean
                      ? 'border-[#1E60F3]/40 bg-blue-50/70 text-slate-800 font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-400 font-medium hover:bg-slate-50'
                      }`}
                  >
                    <span className={isReturnClean ? 'text-[#1E60F3] font-black text-sm mr-1' : 'text-slate-300 text-sm mr-1'}>
                      ✓
                    </span>
                    <span>이상 없음 (무)</span>
                  </button>

                  {/* Body part chips with Receipt vs New damage color differentiation */}
                  {DAMAGE_PART_CHIPS.map((part) => {
                    const isSelected = returnSelectedParts.includes(part);
                    const isExisting = existingDamageParts.includes(part);
                    const isNew = isSelected && !isExisting;

                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => handleToggleDamageChip(part, 'return')}
                        className={`px-2.5 py-1 text-sm rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${isNew
                          ? 'border-red-400 bg-red-500 hover:bg-red-600 text-white font-bold shadow-xs ring-1 ring-red-400/50'
                          : isSelected
                            ? 'border-[#1E60F3]/40 bg-[#1E60F3]/85 hover:bg-[#1E60F3]/90 text-white font-bold shadow-xs'
                            : 'border-slate-200 bg-slate-50 text-slate-600 font-medium hover:bg-slate-100'
                          }`}
                      >
                        <span>{part}</span>
                        {isNew && (
                          <span className="text-[9px] bg-white text-red-600 font-black px-1 rounded-xs leading-none py-0.5">
                            신규
                          </span>
                        )}
                        {isExisting && isSelected && (
                          <span className="text-[9px] text-blue-100 font-normal">
                            기존
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                    외관 데미지 상세 (직접 수정 가능)
                  </label>
                  <input
                    type="text"
                    value={returnDamage}
                    onChange={(e) => setReturnDamage(e.target.value)}
                    placeholder="예: 조수석 뒷 휠 기스 (수령 시와 동일)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Parking & Key Location */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                    주차위치 (선택)
                  </label>
                  <input
                    type="text"
                    value={parkingLocation}
                    onChange={(e) => setParkingLocation(e.target.value)}
                    placeholder="예: B5 기둥 F"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-600 mb-1">
                    차키위치 (선택)
                  </label>
                  <input
                    type="text"
                    value={keyLocation}
                    onChange={(e) => setKeyLocation(e.target.value)}
                    placeholder="예: 운전석 뒷바퀴 위"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Task 2: Live Standard Report Preview Box with Minimal Icon Copy Button */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>카카오톡 전송 양식 미리보기</span>
              <button
                type="button"
                onClick={handleCopyMinimal}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all active:scale-90 cursor-pointer"
                title="양식 복사"
                aria-label="양식 복사"
              >
                {copySuccess ? (
                  <Check className="w-4 h-4 text-[#1E60F3]" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-600" />
                )}
              </button>
            </div>
            <pre className="p-3 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-800 whitespace-pre-wrap leading-relaxed select-all shadow-inner">
              {previewText}
            </pre>
          </div>
        </div>

        {/* Task 5: 2-Split Action Buttons Footer (FlightModal Kakao Standard) */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center gap-2.5 shrink-0">
          {/* Left: '확인' Button (Cobalt Blue, larger width) */}
          <button
            type="button"
            onClick={handleConfirmSave}
            className="flex-[2] py-3.5 rounded-xl bg-[#1E60F3] hover:bg-[#1650D6] text-white font-bold text-sm transition-all shadow-md shadow-blue-500/20 active:scale-[0.98] cursor-pointer text-center flex items-center justify-center"
          >
            점검 완료
          </button>

          {/* Right: '카톡' Button (Compact Brand Button) */}
          <button
            type="button"
            onClick={handleKakaoLaunch}
            className="flex-1 py-3.5 rounded-xl bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] font-bold text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
          >
            {/* Authentic Kakao Speech Bubble Icon */}
            <svg className="w-4 h-4 fill-[#191919] shrink-0" viewBox="0 0 24 24">
              <path d="M12 3c-5.523 0-10 3.582-10 8 0 2.853 1.879 5.364 4.707 6.744l-.961 3.541c-.085.312.246.577.525.418l4.24-2.42c.484.06 1.002.097 1.489.097 5.523 0 10-3.582 10-8s-4.477-8-10-8z" />
            </svg>
            <span>카톡 공유</span>
          </button>
        </div>
      </div>
    </div>
  );
};
