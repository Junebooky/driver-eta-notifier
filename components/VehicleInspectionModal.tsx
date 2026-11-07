'use client';

import React, { useState, useEffect, useMemo, useRef, startTransition } from 'react';
import { DriverProfile } from '@/types';
import { useVehicleCustody } from '@/hooks/useVehicleCustody';
import { VIP_REAL_VEHICLES } from '@/utils/vehicleData';
import { isReportingUuid } from '@/utils/receiptSubmission';
import { createRetryableJsonMutation } from '@/utils/retryableJsonMutation';
import { inspectionPhotoForSubmission } from '@/utils/vehicleCustody';
import type { CustodyWriteResult } from '@/types/vehicleCustody';
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
  profilePlateNumber?: string;
  initialMode?: 'pickup' | 'daily' | 'return' | 'receipt';
  bookingId?: string;
  onCustodySaved?: (bookingId: string) => void;
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
  profilePlateNumber,
  initialMode = 'pickup',
  bookingId,
  onCustodySaved,
}) => {
  const normalizedInitialMode = initialMode === 'receipt' ? 'pickup' : (initialMode || 'pickup');
  const [activeTab, setActiveTab] = useState<'pickup' | 'daily' | 'return'>(normalizedInitialMode);
  const serverMode = isReportingUuid(profile.driverId);
  const custody = useVehicleCustody(isOpen && serverMode);
  const [selectedBookingId, setSelectedBookingId] = useState(bookingId || '');
  const selectedBooking = custody.data?.bookings.find(row => row.id === selectedBookingId) || custody.data?.bookings[0];
  const activeCustody = custody.data?.custodies.find(row => !row.returned_at);
  const [custodyConfirmed, setCustodyConfirmed] = useState(false);
  const [mismatchReason, setMismatchReason] = useState('');
  const [custodyMessage, setCustodyMessage] = useState<string | null>(null);
  const [custodySaving, setCustodySaving] = useState(false);
  const custodyLock = useRef(false);
  const mutation = useMemo(() => createRetryableJsonMutation(`cockpit_custody_pending_${profile.driverId || 'unlinked'}`), [profile.driverId]);
  const [pendingCustody, setPendingCustody] = useState(mutation.hasPending);
  const initialBinding = useRef('');
  const serverAssignmentPlate = selectedBooking?.vehicle_plate || activeCustody?.vehicle_plate || '';
  const inspectionDraftKey = serverMode ? `cockpit_inspection_draft_${profile.driverId}_${selectedBooking?.id || bookingId || 'unselected'}` : getInspectionStorageKey(profile.vehicleNo);


  // Profile hocha and car number defaults
  const detectedHocha = useMemo(() => {
    return extractHocha(profile.vehicleNo) || '';
  }, [profile.vehicleNo]);

  const detectedCarNumber = useMemo(() => {
    if (profilePlateNumber?.trim()) return profilePlateNumber.trim();
    const p = profile as any;
    if (p.plateNumber?.trim()) return p.plateNumber.trim();
    if (profile.carNumber?.trim()) return profile.carNumber.trim();
    const parts = (profile.vehicleNo || '').split(' ');
    if (parts.length >= 2) return parts.slice(1).join(' ').trim();
    return '';
  }, [profilePlateNumber, profile.plateNumber, profile.carNumber, profile.vehicleNo]);

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

  useEffect(() => {
    if (!serverMode || !custody.ready) return;
    const binding = activeTab === 'return' && activeCustody ? activeCustody.id : selectedBooking?.id || '';
    if (!binding || initialBinding.current === binding) return;
    initialBinding.current = binding;
    startTransition(() => {
      setCustodyConfirmed(false);
      if (activeTab === 'return' && activeCustody) {
        setCarNumber(activeCustody.vehicle_plate);
        setInitialData({ initialTotalKm: activeCustody.pickup_odometer, initialDte: activeCustody.pickup_details.dte || 0,
          inspectionDate: formatInspectionDate(), vehicleHocha: '', carNumber: activeCustody.vehicle_plate,
          outerDamage: activeCustody.pickup_details.damage, selectedParts: activeCustody.pickup_details.parts, savedAt: activeCustody.picked_up_at });
      } else if (selectedBooking) {
        setSelectedBookingId(selectedBooking.id);
        setCarNumber(selectedBooking.vehicle_plate);
        setReceiptTotalKm(''); setReturnTotalKm(''); setInitialData(null);
      }
    });
  }, [serverMode, custody.ready, activeTab, activeCustody, selectedBooking]);

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
    const currentKey = inspectionDraftKey;

    const initialKmNum = parseFloat(sanitizeNumericInput(receiptTotalKm)) || 0;
    const initialDteNum = parseFloat(sanitizeNumericInput(receiptDte)) || 0;
    const effectiveCarNumber =
      overrides?.carNumber?.trim() ||
      carNumber?.trim() ||
      profilePlateNumber?.trim() ||
      profile.plateNumber?.trim() ||
      profile.carNumber?.trim() ||
      detectedCarNumber;

    let currentInitialData = initialData;
    if (activeTab === 'pickup' || !currentInitialData) {
      if (initialKmNum > 0 || receiptSelectedParts.length > 0 || (receiptDamage && receiptDamage !== '무')) {
        currentInitialData = {
          initialTotalKm: initialKmNum,
          initialDte: initialDteNum,
          inspectionDate: formatInspectionDate(),
          vehicleHocha: vehicleHocha || detectedHocha,
          carNumber: effectiveCarNumber,
          outerDamage: receiptDamage,
          selectedParts: receiptSelectedParts,
          savedAt: initialData?.savedAt || new Date().toISOString(),
        };
        setInitialData(currentInitialData);
      }
    }

    const payload = {
      vehicleHocha: vehicleHocha || detectedHocha,
      carNumber: effectiveCarNumber,
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
      bookingId: (serverMode ? selectedBooking?.id : bookingId) || overrides?.bookingId,
      driverId: profile.driverId,
      mismatchReason,
      savedAt: new Date().toISOString(),
      ...overrides,
    };

    try {
      localStorage.setItem(currentKey, JSON.stringify(payload));
      if (bookingId) {
        localStorage.setItem(`${currentKey}_${bookingId}`, JSON.stringify(payload));
      }
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

    if (serverMode && !custody.ready) return;
    const defaultPlate = serverMode ? serverAssignmentPlate : detectedCarNumber;
    const currentKey = inspectionDraftKey;
    let rawData: string | null = null;
    try {
      rawData = localStorage.getItem(currentKey);
      if (!serverMode && !rawData && profile.vehicleNo) {
        rawData = localStorage.getItem(`cockpit_vehicle_inspection_${profile.vehicleNo.trim()}`);
      }
      if (!rawData && !serverMode) {
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
        setCarNumber(serverMode ? parsed.carNumber || defaultPlate : detectedCarNumber || parsed.carNumber || '');
        if (serverMode) setMismatchReason(parsed.mismatchReason || '');

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
        setCarNumber(defaultPlate);
      }
    } else {
      // 해당 호차의 점검 기록이 없으면 깨끗한 초기 상태(Clean State)로 리셋
      resetToCleanState();
      setVehicleHocha(detectedHocha);
      setCarNumber(defaultPlate);
    }

    isLoadedRef.current = true;
  }, [isOpen, profile.vehicleNo, detectedHocha, detectedCarNumber, inspectionDraftKey, serverMode, custody.ready, serverAssignmentPlate]);

  // Task 2: Real-time synchronization of profilePlateNumber / profile.plateNumber to carNumber when modal is open or profile updates
  useEffect(() => {
    if (serverMode) return;
    const targetPlate = profilePlateNumber?.trim() || profile.plateNumber?.trim() || detectedCarNumber;
    if (isOpen && targetPlate) {
      setCarNumber(targetPlate);
    }
  }, [isOpen, profilePlateNumber, profile.plateNumber, detectedCarNumber]);

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

  // Lock background page scroll when VehicleInspectionModal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isOpen]);

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
    setCustodyConfirmed(false);
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

    // Call Gemini Vision Dashboard OCR API with 3.5s Underground Shadow Zone Timeout Guard
    setIsOcrAnalyzing(true);
    setOcrFeedback(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      try {
        const base64Data = reader.result as string;
        const res = await fetch('/api/inspect-dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Data,
            vehicleNo: vehicleHocha || profile.vehicleNo || '',
          }),
          signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(3500)
            : controller.signal,
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
      } catch (err: any) {
        console.warn('Dashboard OCR analysis error (timeout or network):', err);
        const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError';
        setOcrFeedback(
          isTimeout
            ? '통신 지연(3.5초 타임아웃)으로 자동 인식을 건너뜁니다. 수동으로 입력해주세요.'
            : '사진 인식을 완료하지 못했습니다. 수동으로 입력해주세요.'
        );
      } finally {
        clearTimeout(timeoutId);
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
    const effectiveCarNumber =
      carNumber?.trim() ||
      profilePlateNumber?.trim() ||
      profile.plateNumber?.trim() ||
      profile.carNumber?.trim() ||
      detectedCarNumber;

    if (activeTab === 'pickup') {
      return generateReceiptReport({
        vehicleHocha,
        carNumber: effectiveCarNumber,
        totalKm: receiptTotalKm,
        dte: receiptDte,
        outerDamage: receiptDamage,
      });
    } else if (activeTab === 'daily') {
      return generateDailyReport({
        date: formatInspectionDate(),
        vehicleNo: vehicleHocha,
        plateNumber: effectiveCarNumber,
        range: parseFloat(dailyDte) || 0,
        existingDamages: existingDamageParts,
        newDamages: dailyNewParts,
      });
    } else {
      return generateReturnReport({
        vehicleHocha,
        carNumber: effectiveCarNumber,
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
    detectedCarNumber,
    profilePlateNumber,
    profile.plateNumber,
    profile.carNumber,
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

  const saveServerCustody = async (retry = false) => {
    if (custodyLock.current) return;
    custodyLock.current = true; setCustodySaving(true); setCustodyMessage(null);
    try {
      let response: Response;
      if (retry) response = await mutation.retry();
      else {
        if (!custody.ready || isOcrAnalyzing) throw new Error('최신 서버 기록과 계기판을 먼저 확인해 주세요.');
        const returning = activeTab === 'return';
        const vehicle = VIP_REAL_VEHICLES.find(row => row.plate.replace(/\s/g, '') === carNumber.replace(/\s/g, ''));
        const odometerInput = returning ? returnTotalKm : receiptTotalKm;
        if (!vehicle || !custodyConfirmed || !odometerInput.trim()) throw new Error('실제 전체 차량번호와 계기판 주행거리를 확인하고 체크해 주세요.');
        if (returning && !activeCustody) throw new Error('반납할 인수 기록이 없습니다. 서버 기록을 새로고침해 주세요.');
        if (!returning && !selectedBooking) throw new Error('확정 배정된 일정을 먼저 선택해 주세요. 차량 미배정은 관리자에게 요청해 주세요.');
        const photo = await inspectionPhotoForSubmission(returning ? returnMeterPhoto : receiptMeterPhoto);
        response = await mutation.send('/api/vehicle-custody', {
          action: returning ? 'return' : 'pickup', bookingId: returning ? undefined : selectedBooking?.id,
          expectedVersion: returning ? undefined : selectedBooking?.version, custodyId: returning ? activeCustody?.id : undefined,
          vehicleId: vehicle.uuid, confirmed: custodyConfirmed, reason: mismatchReason,
          inspection: { odometer: Number(sanitizeNumericInput(odometerInput)),
            dte: (returning ? returnDte : receiptDte).trim() ? Number(sanitizeNumericInput(returning ? returnDte : receiptDte)) : undefined,
            damage: returning ? returnDamage : receiptDamage, parts: returning ? returnSelectedParts : receiptSelectedParts,
            parkingLocation: returning ? parkingLocation : undefined, keyLocation: returning ? keyLocation : undefined }, photo,
        });
      }
      const result: CustodyWriteResult & { error?: string } = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || '서버 저장 결과를 확인하지 못했습니다.');
      const fresh = await custody.refresh(true);
      window.dispatchEvent(new Event('vip_vehicle_custody_updated'));
      setCustodyConfirmed(false);
      if (result.outcome === 'mismatch') {
        setCustodyMessage(`차량 불일치 확인 요청을 저장했습니다. 배정 ${result.assignedPlate} / 실제 선택 ${result.actualPlate}. 관리자 확인 전까지 인수 완료가 아닙니다.`);
        haptics.warningPulse();
      } else {
        setCustodyMessage(`${result.outcome === 'returned' ? '반납' : '인수'} 기록이 서버에 저장되었습니다.${fresh ? '' : ' 최신 상태 재조회에 실패했습니다. 새로고침해 확인해 주세요.'}`);
        haptics.success();
        if (result.outcome === 'picked_up' && result.custody) onCustodySaved?.(result.custody.booking_id);
      }
    } catch (error) {
      setCustodyMessage(error instanceof Error ? error.message : '서버 저장에 실패했습니다. 입력은 보존되어 있습니다.');
      haptics.errorAlert();
    } finally { custodyLock.current = false; setCustodySaving(false); setPendingCustody(mutation.hasPending); }
  };

  const handleConfirmSave = () => {
    if (serverMode && activeTab !== 'daily') { void saveServerCustody(); return; }
    saveVehicleInspectionData();
    onClose();
  };

  // Handle Save & Launch KakaoTalk
  const handleKakaoLaunch = async () => {
    haptics.successPulse();
    const effectiveCarNumber =
      carNumber?.trim() ||
      profilePlateNumber?.trim() ||
      profile.plateNumber?.trim() ||
      profile.carNumber?.trim() ||
      detectedCarNumber;
    if (!carNumber?.trim() && effectiveCarNumber) {
      setCarNumber(effectiveCarNumber);
    }
    saveVehicleInspectionData({ carNumber: effectiveCarNumber });
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overscroll-none driver-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="bg-[#F6F8FC] rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden text-slate-900 overscroll-contain driver-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Title + Close */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 bg-[#F6F8FC] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0055FF] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(0,85,255,0.25)] shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">
                차량 인수·반납 체크
              </h2>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">
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
            className="w-9 h-9 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Segmented Control (3단 전환: 인수 | 데일리 체크 | 반납) */}
        <div className="px-5 pt-1 pb-3 shrink-0">
          <div className="w-full bg-white p-1.5 rounded-2xl border border-slate-100/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)] relative flex items-center select-none">
            {/* Sliding Pill Indicator */}
            <div
              className={`w-[calc((100%-12px)/3)] h-[calc(100%-12px)] absolute top-1.5 left-1.5 rounded-xl bg-[#0055FF] shadow-[0_4px_12px_rgba(0,85,255,0.25)] transition-transform duration-300 ease-out pointer-events-none transform ${
                activeTab === 'pickup'
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
              className="flex-1 py-2.5 rounded-xl z-10 flex items-center justify-center space-x-1 sm:space-x-1.5 cursor-pointer transition-colors duration-300"
            >
              <Gauge className={`w-4 h-4 ${activeTab === 'pickup' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-[14px] tracking-tight transition-colors duration-300 ${
                  activeTab === 'pickup' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
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
              className="flex-1 py-2.5 rounded-xl z-10 flex items-center justify-center space-x-1 sm:space-x-1.5 cursor-pointer transition-colors duration-300"
            >
              <CalendarCheck className={`w-4 h-4 ${activeTab === 'daily' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-[14px] tracking-tight transition-colors duration-300 ${
                  activeTab === 'daily' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
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
              className="flex-1 py-2.5 rounded-xl z-10 flex items-center justify-center space-x-1 sm:space-x-1.5 cursor-pointer transition-colors duration-300"
            >
              <RotateCcw className={`w-4 h-4 ${activeTab === 'return' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-[14px] tracking-tight transition-colors duration-300 ${
                  activeTab === 'return' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
                }`}
              >
                반납
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4 text-base overscroll-contain">
          {/* Vehicle Basic Info Row: 2 columns (차량호차, 차량번호) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-bold text-slate-700 mb-1.5 truncate">
                호차
              </label>
              <input
                type="text"
                value={vehicleHocha}
                onChange={(e) => setVehicleHocha(e.target.value)}
                placeholder="4호차"
                className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] font-bold text-slate-900 text-[15px] focus:border-[#0055FF] outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[13px] font-bold text-slate-700 mb-1.5 truncate">
                차량번호
              </label>
              {serverMode ? (
                <select
                  aria-label="실제 차량번호"
                  value={carNumber}
                  disabled={custodySaving || pendingCustody || (activeTab === 'return' && Boolean(activeCustody))}
                  onChange={(event) => {
                    setCarNumber(event.target.value);
                    setCustodyConfirmed(false);
                  }}
                  className="min-h-[50px] w-full rounded-2xl border border-slate-100/90 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.04)] px-3 text-[15px] font-bold text-slate-900 focus:border-[#0055FF] outline-none"
                >
                  {!VIP_REAL_VEHICLES.some((row) => row.plate === carNumber) && (
                    <option value={carNumber}>{carNumber || '전체 차량번호 선택'}</option>
                  )}
                  {VIP_REAL_VEHICLES.map((row) => (
                    <option key={row.uuid} value={row.plate}>
                      {row.plate} · {row.modelShort}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={carNumber}
                  onChange={(e) => setCarNumber(e.target.value)}
                  placeholder="142호 7811"
                  className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] font-bold text-slate-900 text-[15px] focus:border-[#0055FF] outline-none transition-all"
                />
              )}
            </div>
          </div>

          {serverMode && (
            <section
              aria-label="서버 차량 인수 상태"
              className="space-y-3 rounded-3xl border border-slate-100/90 bg-white p-4 shadow-[0_3px_14px_rgba(15,23,42,0.04)]"
            >
              <p className="text-[14px] font-black text-slate-900">배정 차량 확인 · 인수·반납 공유</p>
              <p className="text-xs text-slate-500">
                계기판 입력을 기존 점검 양식과 함께 사용합니다. 일일점검·복사·카톡은 이 기기의 초안이며 서버 인수 완료와 별도입니다.
              </p>
              {custody.error && (
                <p role="alert" className="text-sm text-rose-700">
                  {custody.error}
                </p>
              )}
              {!custody.data && !custody.error && (
                <p role="status" className="text-sm text-slate-600">
                  최신 배정과 인수 기록을 확인하고 있습니다.
                </p>
              )}
              {activeTab !== 'return' && (
                <label className="block text-xs font-bold text-slate-600">
                  배정 일정
                  <select
                    aria-label="인수할 배정 일정"
                    disabled={custodySaving || pendingCustody || Boolean(activeCustody)}
                    value={selectedBooking?.id || ''}
                    onChange={(event) => {
                      setSelectedBookingId(event.target.value);
                      setCustodyMessage(null);
                    }}
                    className="mt-1.5 min-h-12 w-full rounded-2xl border border-slate-100 bg-[#F8FAFC] p-2.5 text-[14px] font-semibold"
                  >
                    {!custody.data?.bookings.length && <option value="">확정된 기사·차량 배정 필요</option>}
                    {custody.data?.bookings.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.date} {row.pickup_time.slice(0, 5)} · {row.vehicle_plate || '차량 미배정'} · {row.origin}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selectedBooking && activeTab !== 'return' && (
                <p className="text-sm">
                  등록된 배정 차량: <strong>{selectedBooking.vehicle_plate || '미배정'}</strong>
                  <br />
                  실제 선택 차량: <strong>{carNumber || '선택 필요'}</strong>
                </p>
              )}
              {activeCustody && (
                <p className="rounded-2xl bg-[#EBF3FF]/70 p-3.5 text-sm font-bold text-[#0055FF]">
                  인수 중 · {activeCustody.vehicle_plate}
                  <span className="mt-1 block text-xs font-normal text-slate-600">
                    {activeCustody.pickup_odometer.toLocaleString()} km ·{' '}
                    {new Date(activeCustody.picked_up_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    <br />이 차량을 계속 사용 중이면 다시 인수하지 않아도 됩니다. 반납 탭에서 기록을 마쳐주세요.
                  </span>
                </p>
              )}
              {custody.data?.mismatches.map((row) => (
                <p key={row.request_id} className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">
                  관리자 확인 대기 · {row.result.assignedPlate} → {row.result.actualPlate} · {row.result.reason}
                </p>
              ))}
              {activeTab === 'pickup' &&
                selectedBooking &&
                carNumber.replace(/\s/g, '') !== selectedBooking.vehicle_plate.replace(/\s/g, '') && (
                  <label className="block text-sm font-bold text-amber-900">
                    다른 차량을 선택한 사유
                    <input
                      aria-label="차량 불일치 사유"
                      value={mismatchReason}
                      onChange={(event) => setMismatchReason(event.target.value)}
                      maxLength={1000}
                      className="mt-1 min-h-11 w-full rounded-2xl border border-amber-200 bg-white p-2.5 text-base"
                    />
                    <span className="mt-1 block text-xs font-normal">
                      확인 요청만 저장합니다. 관리자 배차 변경 전에는 이 차량을 인수 완료로 처리하지 않습니다.
                    </span>
                  </label>
                )}
              {activeTab !== 'daily' && (
                <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={custodyConfirmed}
                    disabled={custodySaving || pendingCustody}
                    onChange={(event) => setCustodyConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span>실제 전체 차량번호와 계기판 주행거리를 직접 확인했습니다.</span>
                </label>
              )}
              {custodyMessage && (
                <p role="status" className="break-words text-sm font-bold text-slate-800">
                  {custodyMessage}
                </p>
              )}
              <button
                type="button"
                disabled={custodySaving}
                onClick={() => void custody.refresh(true)}
                className="min-h-11 text-sm font-bold text-[#0055FF]"
              >
                서버 기록 새로고침
              </button>
              {pendingCustody && (
                <button
                  type="button"
                  disabled={custodySaving}
                  onClick={() => void saveServerCustody(true)}
                  className="ml-2 min-h-11 text-sm font-bold text-[#0055FF]"
                >
                  이전 저장 결과 재확인
                </button>
              )}
            </section>
          )}

          {/* TAB 1: PICKUP MODE */}
          {activeTab === 'pickup' && (
            <div className="space-y-4 animate-fade-in">
              {/* Meter Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                    총 주행거리 (km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(receiptTotalKm)}
                    onChange={(e) => setReceiptTotalKm(sanitizeNumericInput(e.target.value))}
                    placeholder="예: 14,698"
                    className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] font-black text-slate-900 text-[15px] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                    주행가능거리 (km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(receiptDte)}
                    onChange={(e) => setReceiptDte(sanitizeNumericInput(e.target.value))}
                    placeholder="예: 276"
                    className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] font-black text-slate-900 text-[15px] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Dashboard Photo Slot */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                  계기판 AI 자동 인식 ✨
                </label>
                {receiptMeterPhoto ? (
                  <div className="relative w-full h-32 rounded-3xl overflow-hidden border border-slate-100/90 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.04)] group">
                    <img
                      src={receiptMeterPhoto}
                      alt="수령 계기판 사진"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMeterPhoto('pickup')}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-md active:scale-90 cursor-pointer"
                      title="사진 삭제"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-2.5 px-2.5 py-0.5 rounded-full bg-slate-900/60 backdrop-blur-xs text-[10px] text-white font-semibold">
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
                      className="w-full py-3.5 px-4 rounded-2xl border border-slate-100/90 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.04)] hover:border-blue-200 text-slate-700 hover:text-[#0055FF] flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.99]"
                    >
                      <img
                        src="/images/icons/driver_ui/icon_camera.png"
                        alt="카메라"
                        className="w-7 h-7 object-contain shrink-0"
                        draggable={false}
                      />
                      <span className="text-[14px] font-extrabold">계기판 사진 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* OCR Analysis State & Feedback Banner */}
              {isOcrAnalyzing && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#EBF3FF]/80 border border-blue-200/80 text-[#0055FF] text-sm font-semibold animate-pulse">
                  <Sparkles className="w-4 h-4 text-[#0055FF] shrink-0 animate-spin" />
                  <span>Gemini Vision이 계기판 주행거리 및 타코미터 RPM을 분석 중입니다...</span>
                </div>
              )}
              {ocrFeedback && !isOcrAnalyzing && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-slate-700 text-sm">
                  <Sparkles className="w-4 h-4 text-[#0055FF] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">계기판 자동 인식 완료</p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{ocrFeedback}</p>
                  </div>
                </div>
              )}

              {/* 2D Top-Down Interactive Vehicle Inspection Viewer & Damage Chips Card */}
              <div className="p-4 rounded-3xl bg-white border border-slate-100/90 shadow-[0_3px_14px_rgba(15,23,42,0.04)] space-y-3.5">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-bold text-slate-700">
                    차량 외관 체크
                  </label>
                  <VehicleTopDownViewer
                    selectedParts={receiptSelectedParts}
                    onTogglePart={(part) => handleToggleDamageChip(part, 'pickup')}
                    mode="pickup"
                  />
                </div>

                {/* Outer Damage Quick Chip Selector & Input */}
                <div className="space-y-2 pt-1">
                  <label className="block text-[13px] font-bold text-slate-700">
                    흠집 위치 선택
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Clean reset chip */}
                    <button
                      type="button"
                      onClick={() => handleResetDamageToClean('pickup')}
                      className={`px-3 py-1.5 text-[13px] rounded-xl border transition-all cursor-pointer flex items-center ${
                        isReceiptClean
                          ? 'border-[#0055FF] bg-[#EBF3FF]/70 text-[#0055FF] font-extrabold'
                          : 'border-slate-100 bg-[#F8FAFC] text-slate-500 font-semibold hover:bg-slate-100'
                      }`}
                    >
                      <span className={isReceiptClean ? 'text-[#0055FF] font-black text-sm mr-1' : 'text-slate-300 text-sm mr-1'}>
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
                          className={`px-3 py-1.5 text-[13px] rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[#0055FF] bg-[#0055FF] text-white font-bold shadow-[0_2px_8px_rgba(0,85,255,0.2)]'
                              : 'border-slate-100 bg-[#F8FAFC] text-slate-600 font-semibold hover:bg-slate-100'
                          }`}
                        >
                          {part}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-1.5">
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                      외관 데미지 상세 (직접 수정 가능)
                    </label>
                    <input
                      type="text"
                      value={receiptDamage}
                      onChange={(e) => setReceiptDamage(e.target.value)}
                      placeholder="무 (미입력 시 '무' 표기)"
                      className="w-full px-4 py-3 bg-[#F8FAFC] border border-slate-100 rounded-2xl text-slate-800 font-medium text-[14px] focus:bg-white focus:border-[#0055FF] outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DAILY INSPECTION MODE */}
          {activeTab === 'daily' && (
            <div className="space-y-4 animate-fade-in">
              {/* Range Input Only (Odometer Hidden) */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                  주행가능거리 (km)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatNumberWithComma(dailyDte)}
                  onChange={(e) => setDailyDte(sanitizeNumericInput(e.target.value))}
                  placeholder="예: 280"
                  className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] font-black text-slate-900 text-[15px] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] outline-none transition-all"
                />
              </div>

              {/* Dashboard Photo Slot for Daily */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                  계기판 사진 (선택)
                </label>
                {dailyMeterPhoto ? (
                  <div className="relative w-full h-32 rounded-3xl overflow-hidden border border-slate-100/90 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.04)] group">
                    <img
                      src={dailyMeterPhoto}
                      alt="일일 점검 계기판 사진"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMeterPhoto('daily')}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-md active:scale-90 cursor-pointer"
                      title="사진 삭제"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-2.5 px-2.5 py-0.5 rounded-full bg-slate-900/60 backdrop-blur-xs text-[10px] text-white font-semibold">
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
                      className="w-full py-3.5 px-4 rounded-2xl border border-slate-100/90 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.04)] hover:border-blue-200 text-slate-700 hover:text-[#0055FF] flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.99]"
                    >
                      <img
                        src="/images/icons/driver_ui/icon_camera.png"
                        alt="카메라"
                        className="w-7 h-7 object-contain shrink-0"
                        draggable={false}
                      />
                      <span className="text-[14px] font-extrabold">계기판 사진 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* OCR Analysis State & Feedback Banner */}
              {isOcrAnalyzing && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#EBF3FF]/80 border border-blue-200/80 text-[#0055FF] text-sm font-semibold animate-pulse">
                  <Sparkles className="w-4 h-4 text-[#0055FF] shrink-0 animate-spin" />
                  <span>Gemini Vision이 계기판을 분석 중입니다...</span>
                </div>
              )}
              {ocrFeedback && !isOcrAnalyzing && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-slate-700 text-sm">
                  <Sparkles className="w-4 h-4 text-[#0055FF] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">계기판 인식 완료</p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{ocrFeedback}</p>
                  </div>
                </div>
              )}

              {/* 2D Top-Down Interactive Vehicle Inspection Viewer & Damage Chips Card */}
              <div className="p-4 rounded-3xl bg-white border border-slate-100/90 shadow-[0_3px_14px_rgba(15,23,42,0.04)] space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[13px] font-bold text-slate-700">
                      차량 외관 2D 탑뷰 점검
                    </label>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                      {existingDamageParts.length > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0055FF]" />
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
                <div className="space-y-2 pt-1">
                  <label className="block text-[13px] font-bold text-slate-700">
                    외관 부위별 빠른 선택
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {/* One-touch clean check button */}
                    <button
                      type="button"
                      onClick={handleResetDailyDamage}
                      className={`px-3 py-1.5 text-[13px] rounded-xl border transition-all cursor-pointer flex items-center gap-1 ${
                        dailyNewParts.length === 0
                          ? 'border-[#0055FF] bg-[#EBF3FF]/70 text-[#0055FF] font-extrabold'
                          : 'border-slate-100 bg-[#F8FAFC] text-slate-500 font-semibold hover:bg-slate-100'
                      }`}
                    >
                      <span className={dailyNewParts.length === 0 ? 'text-[#0055FF] font-black text-sm mr-0.5' : 'text-slate-300 text-sm mr-0.5'}>
                        ✓
                      </span>
                      <span>이상없음 (무)</span>
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
                          className={`px-3 py-1.5 text-[13px] rounded-xl border transition-all flex items-center gap-1 ${
                            isExisting
                              ? 'border-slate-200 bg-slate-100 text-slate-500 font-semibold cursor-default opacity-85'
                              : isNew
                                ? 'border-red-400 bg-red-500 hover:bg-red-600 text-white font-bold shadow-xs ring-1 ring-red-400/50 cursor-pointer'
                                : 'border-slate-100 bg-[#F8FAFC] text-slate-600 font-semibold hover:bg-slate-100 cursor-pointer'
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
            </div>
          )}

          {/* TAB 3: RETURN MODE */}
          {activeTab === 'return' && (
            <div className="space-y-4 animate-fade-in">
              {/* Meter Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                    반납 총 주행거리 (km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(returnTotalKm)}
                    onChange={(e) => setReturnTotalKm(sanitizeNumericInput(e.target.value))}
                    placeholder="예: 15,048"
                    className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] font-black text-slate-900 text-[15px] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                    반납 주행가능거리 (km)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(returnDte)}
                    onChange={(e) => setReturnDte(sanitizeNumericInput(e.target.value))}
                    placeholder="예: 180"
                    className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] font-black text-slate-900 text-[15px] placeholder:font-medium placeholder:text-slate-400 focus:border-[#0055FF] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Dashboard Photo Slot for Return */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                  계기판 AI 자동 입력 ✨
                </label>
                {returnMeterPhoto ? (
                  <div className="relative w-full h-32 rounded-3xl overflow-hidden border border-slate-100/90 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.04)] group">
                    <img
                      src={returnMeterPhoto}
                      alt="반납 계기판 사진"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMeterPhoto('return')}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-all shadow-md active:scale-90 cursor-pointer"
                      title="사진 삭제"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-2.5 px-2.5 py-0.5 rounded-full bg-slate-900/60 backdrop-blur-xs text-[10px] text-white font-semibold">
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
                      className="w-full py-3.5 px-4 rounded-2xl border border-slate-100/90 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.04)] hover:border-blue-200 text-slate-700 hover:text-[#0055FF] flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.99]"
                    >
                      <img
                        src="/images/icons/driver_ui/icon_camera.png"
                        alt="카메라"
                        className="w-7 h-7 object-contain shrink-0"
                        draggable={false}
                      />
                      <span className="text-[14px] font-extrabold">계기판 사진 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* OCR Analysis State & Feedback Banner */}
              {isOcrAnalyzing && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#EBF3FF]/80 border border-blue-200/80 text-[#0055FF] text-sm font-semibold animate-pulse">
                  <Sparkles className="w-4 h-4 text-[#0055FF] shrink-0 animate-spin" />
                  <span>Gemini Vision이 반납 계기판을 분석 중입니다...</span>
                </div>
              )}
              {ocrFeedback && !isOcrAnalyzing && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-slate-700 text-sm">
                  <Sparkles className="w-4 h-4 text-[#0055FF] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">반납 계기판 인식 완료</p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{ocrFeedback}</p>
                  </div>
                </div>
              )}

              {/* 2D Top-Down Interactive Vehicle Inspection Viewer with Receipt Data Inheritance */}
              <div className="p-4 rounded-3xl bg-white border border-slate-100/90 shadow-[0_3px_14px_rgba(15,23,42,0.04)] space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[13px] font-bold text-slate-700">
                      차량 외관 2D 탑뷰 점검
                    </label>
                    {existingDamageParts.length > 0 && (
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0055FF]" />
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

                {/* Outer Damage Quick Chip Selector & Input */}
                <div className="space-y-2 pt-1">
                  <label className="block text-[13px] font-bold text-slate-700">
                    외관 부위별 빠른 선택
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Clean reset chip */}
                    <button
                      type="button"
                      onClick={() => handleResetDamageToClean('return')}
                      className={`px-3 py-1.5 text-[13px] rounded-xl border transition-all cursor-pointer flex items-center ${
                        isReturnClean
                          ? 'border-[#0055FF] bg-[#EBF3FF]/70 text-[#0055FF] font-extrabold'
                          : 'border-slate-100 bg-[#F8FAFC] text-slate-500 font-semibold hover:bg-slate-100'
                      }`}
                    >
                      <span className={isReturnClean ? 'text-[#0055FF] font-black text-sm mr-1' : 'text-slate-300 text-sm mr-1'}>
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
                          className={`px-3 py-1.5 text-[13px] rounded-xl border transition-all cursor-pointer flex items-center gap-1 ${
                            isNew
                              ? 'border-red-400 bg-red-500 hover:bg-red-600 text-white font-bold shadow-xs ring-1 ring-red-400/50'
                              : isSelected
                                ? 'border-[#0055FF] bg-[#0055FF] text-white font-bold shadow-[0_2px_8px_rgba(0,85,255,0.2)]'
                                : 'border-slate-100 bg-[#F8FAFC] text-slate-600 font-semibold hover:bg-slate-100'
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

                  <div className="pt-1.5">
                    <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                      외관 데미지 상세 (직접 수정 가능)
                    </label>
                    <input
                      type="text"
                      value={returnDamage}
                      onChange={(e) => setReturnDamage(e.target.value)}
                      placeholder="예: 조수석 뒷 휠 기스 (수령 시와 동일)"
                      className="w-full px-4 py-3 bg-[#F8FAFC] border border-slate-100 rounded-2xl text-slate-800 font-medium text-[14px] focus:bg-white focus:border-[#0055FF] outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Parking & Key Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                    주차위치 (선택)
                  </label>
                  <input
                    type="text"
                    value={parkingLocation}
                    onChange={(e) => setParkingLocation(e.target.value)}
                    placeholder="예: B5 기둥 F"
                    className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-slate-800 font-semibold text-[14px] focus:border-[#0055FF] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                    차키위치 (선택)
                  </label>
                  <input
                    type="text"
                    value={keyLocation}
                    onChange={(e) => setKeyLocation(e.target.value)}
                    placeholder="예: 운전석 뒷바퀴 위"
                    className="w-full px-4 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_12px_rgba(15,23,42,0.04)] text-slate-800 font-semibold text-[14px] focus:border-[#0055FF] outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Live Standard Report Preview Box */}
          <div className="bg-white border border-slate-100/90 rounded-3xl p-4 shadow-[0_3px_14px_rgba(15,23,42,0.04)] space-y-2.5">
            <div className="flex items-center justify-between text-[12px] font-bold text-slate-400">
              <span>카카오톡 전송 양식 미리보기</span>
              <button
                type="button"
                onClick={handleCopyMinimal}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F4F7FC] hover:bg-slate-200/70 text-slate-600 transition-all active:scale-90 cursor-pointer"
                title="양식 복사"
                aria-label="양식 복사"
              >
                {copySuccess ? (
                  <Check className="w-4 h-4 text-[#0055FF]" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-600" />
                )}
              </button>
            </div>
            <pre className="p-3.5 bg-[#F8FAFC] border border-slate-100 rounded-2xl text-[13px] font-sans font-semibold text-slate-800 whitespace-pre-wrap leading-relaxed select-all">
              {previewText}
            </pre>
          </div>
        </div>

        {/* 2-Split Action Buttons Footer */}
        <div className="px-5 py-4 border-t border-slate-200/60 bg-[#F6F8FC] flex items-center gap-2.5 shrink-0">
          {/* Left: '확인' Button (Cobalt Blue, larger width) */}
          <button
            type="button"
            onClick={handleConfirmSave}
            disabled={
              custodySaving ||
              (serverMode &&
                activeTab !== 'daily' &&
                (pendingCustody ||
                  !custody.ready ||
                  isOcrAnalyzing ||
                  (activeTab === 'return' ? !activeCustody : Boolean(activeCustody))))
            }
            className="flex-[2] py-3.5 rounded-2xl bg-[#0055FF] hover:bg-[#0044CC] disabled:opacity-40 text-white font-bold text-[15px] transition-all shadow-[0_4px_14px_rgba(0,85,255,0.25)] active:scale-[0.98] cursor-pointer text-center flex items-center justify-center"
          >
            {custodySaving
              ? '서버 저장 확인 중…'
              : serverMode && activeTab !== 'daily'
                ? activeTab === 'return'
                  ? '반납 기록 저장'
                  : selectedBooking &&
                      carNumber.replace(/\s/g, '') !== selectedBooking.vehicle_plate.replace(/\s/g, '')
                    ? '차량 불일치 확인 요청'
                    : '이 차량이 맞아요 · 인수 저장'
                : '이 기기에 점검 저장'}
          </button>

          {/* Right: '카톡' Button (Compact Brand Button) */}
          <button
            type="button"
            onClick={handleKakaoLaunch}
            className="flex-1 py-3.5 rounded-2xl bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] font-extrabold text-[15px] flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-[0.98] cursor-pointer"
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
