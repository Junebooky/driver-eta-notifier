'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriverProfile } from '@/types';
import {
  generateReceiptReport,
  generateReturnReport,
  saveInitialInspection,
  getInitialInspection,
  formatInspectionDate,
  extractHocha,
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
} from 'lucide-react';
import { VehicleTopDownViewer } from '@/components/VehicleTopDownViewer';

interface VehicleInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  initialMode?: 'receipt' | 'return';
}

const DAMAGE_PART_CHIPS = [
  '앞 범퍼',
  '뒷 범퍼',
  '앞 휠 (운전석)',
  '앞 휠 (조수석)',
  '뒷 휠 (운전석)',
  '뒷 휠 (조수석)',
  '도어/측면',
  '유리/윈드실드',
];

export const VehicleInspectionModal: React.FC<VehicleInspectionModalProps> = ({
  isOpen,
  onClose,
  profile,
  initialMode = 'receipt',
}) => {
  const [activeTab, setActiveTab] = useState<'receipt' | 'return'>(initialMode);

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

  // Receipt Inputs
  const [receiptTotalKm, setReceiptTotalKm] = useState<string>('');
  const [receiptDte, setReceiptDte] = useState<string>('');
  const [receiptDamage, setReceiptDamage] = useState<string>('무');
  const [receiptSelectedParts, setReceiptSelectedParts] = useState<string[]>([]);
  const [receiptMeterPhoto, setReceiptMeterPhoto] = useState<string | null>(null);

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
  const returnPhotoInputRef = useRef<HTMLInputElement>(null);

  // Sync profile defaults when modal opens or profile updates
  useEffect(() => {
    if (isOpen) {
      setVehicleHocha(detectedHocha);
      setCarNumber(detectedCarNumber);
      const stored = getInitialInspection();
      setInitialData(stored);
    }
  }, [isOpen, detectedHocha, detectedCarNumber]);

  useEffect(() => {
    setActiveTab(initialMode);
  }, [initialMode]);

  // Clean up object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (receiptMeterPhoto) URL.revokeObjectURL(receiptMeterPhoto);
      if (returnMeterPhoto) URL.revokeObjectURL(returnMeterPhoto);
    };
  }, [receiptMeterPhoto, returnMeterPhoto]);

  // Damage chip toggle handler
  const handleToggleDamageChip = (part: string, mode: 'receipt' | 'return') => {
    haptics.lightTap();
    if (mode === 'receipt') {
      const isSelected = receiptSelectedParts.includes(part);
      const newParts = isSelected
        ? receiptSelectedParts.filter((p) => p !== part)
        : [...receiptSelectedParts, part];

      setReceiptSelectedParts(newParts);
      if (newParts.length === 0) {
        setReceiptDamage('무');
      } else {
        setReceiptDamage(`${newParts.join(', ')} 미세 기스`);
      }
    } else {
      const isSelected = returnSelectedParts.includes(part);
      const newParts = isSelected
        ? returnSelectedParts.filter((p) => p !== part)
        : [...returnSelectedParts, part];

      setReturnSelectedParts(newParts);
      if (newParts.length === 0) {
        setReturnDamage('무');
      } else {
        setReturnDamage(`${newParts.join(', ')} 미세 기스`);
      }
    }
  };

  // Reset to clean damage chip ("무")
  const handleResetDamageToClean = (mode: 'receipt' | 'return') => {
    haptics.lightTap();
    if (mode === 'receipt') {
      setReceiptSelectedParts([]);
      setReceiptDamage('무');
    } else {
      setReturnSelectedParts([]);
      setReturnDamage('무');
    }
  };

  // Local meter photo upload handler (Pure in-memory Object URL, No-DB)
  const handleMeterPhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'receipt' | 'return'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.lightTap();
    const objectUrl = URL.createObjectURL(file);
    if (mode === 'receipt') {
      if (receiptMeterPhoto) URL.revokeObjectURL(receiptMeterPhoto);
      setReceiptMeterPhoto(objectUrl);
    } else {
      if (returnMeterPhoto) URL.revokeObjectURL(returnMeterPhoto);
      setReturnMeterPhoto(objectUrl);
    }
    // Reset file input value so same file can be reselected
    e.target.value = '';
  };

  // Remove meter photo
  const handleRemoveMeterPhoto = (mode: 'receipt' | 'return') => {
    haptics.lightTap();
    if (mode === 'receipt') {
      if (receiptMeterPhoto) URL.revokeObjectURL(receiptMeterPhoto);
      setReceiptMeterPhoto(null);
    } else {
      if (returnMeterPhoto) URL.revokeObjectURL(returnMeterPhoto);
      setReturnMeterPhoto(null);
    }
  };

  // Real-time Preview Text Generation
  const previewText = useMemo(() => {
    if (activeTab === 'receipt') {
      return generateReceiptReport({
        vehicleHocha,
        carNumber,
        totalKm: receiptTotalKm,
        dte: receiptDte,
        outerDamage: receiptDamage,
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
    returnTotalKm,
    returnDte,
    returnDamage,
    parkingLocation,
    keyLocation,
    initialData,
  ]);

  if (!isOpen) return null;

  // Handle Save (Confirm button) - saves to localStorage and closes
  const handleConfirmSave = () => {
    haptics.lightTap();

    if (activeTab === 'receipt') {
      saveInitialInspection({
        initialTotalKm: parseFloat(receiptTotalKm) || 0,
        initialDte: parseFloat(receiptDte) || 0,
        inspectionDate: formatInspectionDate(),
        vehicleHocha,
        carNumber,
        outerDamage: receiptDamage,
      });
    }

    onClose();
  };

  // Handle Save & Launch KakaoTalk
  const handleKakaoLaunch = async () => {
    haptics.successPulse();

    if (activeTab === 'receipt') {
      saveInitialInspection({
        initialTotalKm: parseFloat(receiptTotalKm) || 0,
        initialDte: parseFloat(receiptDte) || 0,
        inspectionDate: formatInspectionDate(),
        vehicleHocha,
        carNumber,
        outerDamage: receiptDamage,
      });
      const updated = getInitialInspection();
      setInitialData(updated);
    }

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
                차량 수령·반납 점검표
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

        {/* Tab Segmented Control */}
        <div className="px-5 pt-3.5 pb-2 shrink-0">
          <div className="w-full bg-slate-100/90 p-1 rounded-full relative flex items-center select-none shadow-inner">
            {/* Sliding Pill Indicator */}
            <div
              className={`w-[calc(50%-4px)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-full bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-transform duration-300 ease-out pointer-events-none transform ${activeTab === 'receipt' ? 'translate-x-0' : 'translate-x-full'
                }`}
            />

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveTab('receipt');
              }}
              className="flex-1 py-2 rounded-full z-10 flex items-center justify-center space-x-1.5 cursor-pointer transition-colors duration-300"
            >
              <Gauge className={`w-3.5 h-3.5 ${activeTab === 'receipt' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-xs tracking-tight transition-colors duration-300 ${activeTab === 'receipt' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
                  }`}
              >
                차량 수령
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveTab('return');
              }}
              className="flex-1 py-2 rounded-full z-10 flex items-center justify-center space-x-1.5 cursor-pointer transition-colors duration-300"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${activeTab === 'return' ? 'text-white' : 'text-slate-400'}`} />
              <span
                className={`text-xs tracking-tight transition-colors duration-300 ${activeTab === 'return' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
                  }`}
              >
                차량 반납
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4 text-xs">
          {/* Vehicle Basic Info Row */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                차량호차 (선택 시 출력)
              </label>
              <input
                type="text"
                value={vehicleHocha}
                onChange={(e) => setVehicleHocha(e.target.value)}
                placeholder="예: 4호차"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                차량번호
              </label>
              <input
                type="text"
                value={carNumber}
                onChange={(e) => setCarNumber(e.target.value)}
                placeholder="예: 142호 7811"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
              />
            </div>
          </div>

          {/* TAB 1: RECEIPT MODE */}
          {activeTab === 'receipt' && (
            <div className="space-y-3 animate-fade-in">
              {/* Meter Inputs */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    총 주행거리 (km)
                  </label>
                  <input
                    type="number"
                    value={receiptTotalKm}
                    onChange={(e) => setReceiptTotalKm(e.target.value)}
                    placeholder="예: 14698"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    주행가능거리 (km)
                  </label>
                  <input
                    type="number"
                    value={receiptDte}
                    onChange={(e) => setReceiptDte(e.target.value)}
                    placeholder="예: 276"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Task 4: Dashboard Photo Slot (Pure local in-memory preview, No-DB) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  계기판 AI 자동 입력 ✨
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
                      onClick={() => handleRemoveMeterPhoto('receipt')}
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
                      onChange={(e) => handleMeterPhotoUpload(e, 'receipt')}
                    />
                    <button
                      type="button"
                      onClick={() => receiptPhotoInputRef.current?.click()}
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-[#1E60F3] bg-slate-50 hover:bg-blue-50/20 text-slate-500 hover:text-[#1E60F3] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-xs font-semibold">계기판 사진 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 2D Top-Down Interactive Vehicle Inspection Viewer */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    차량 외관 2D 탑뷰 점검
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    사각지대 없는 수직 평면도
                  </span>
                </div>
                <VehicleTopDownViewer
                  selectedParts={receiptSelectedParts}
                  onTogglePart={(part) => handleToggleDamageChip(part, 'receipt')}
                />
              </div>

              {/* Task 3: Outer Damage Quick Chip Selector & Input */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  외관 부위별 빠른 선택
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {/* Clean reset chip */}
                  <button
                    type="button"
                    onClick={() => handleResetDamageToClean('receipt')}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${isReceiptClean
                      ? 'border-[#1E60F3] bg-blue-50 text-[#1E60F3] font-bold shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 font-medium hover:bg-slate-100'
                      }`}
                  >
                    ✓ 이상 없음 (무)
                  </button>

                  {/* Body part chips */}
                  {DAMAGE_PART_CHIPS.map((part) => {
                    const isSelected = receiptSelectedParts.includes(part);
                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => handleToggleDamageChip(part, 'receipt')}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${isSelected
                          ? 'border-[#1E60F3] bg-blue-50 text-[#1E60F3] font-bold shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-600 font-medium hover:bg-slate-100'
                          }`}
                      >
                        {part}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    외관 데미지 상세 (직접 수정 가능)
                  </label>
                  <input
                    type="text"
                    value={receiptDamage}
                    onChange={(e) => setReceiptDamage(e.target.value)}
                    placeholder="무 (미입력 시 '무' 표기)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
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
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    반납 총 주행거리 (km)
                  </label>
                  <input
                    type="number"
                    value={returnTotalKm}
                    onChange={(e) => setReturnTotalKm(e.target.value)}
                    placeholder="예: 15048"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    반납 주행가능거리 (km)
                  </label>
                  <input
                    type="number"
                    value={returnDte}
                    onChange={(e) => setReturnDte(e.target.value)}
                    placeholder="예: 180"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Task 4: Dashboard Photo Slot for Return */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
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
                      <span className="text-xs font-semibold">계기판 사진 등록</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 2D Top-Down Interactive Vehicle Inspection Viewer */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    차량 외관 2D 탑뷰 점검
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    사각지대 없는 수직 평면도
                  </span>
                </div>
                <VehicleTopDownViewer
                  selectedParts={returnSelectedParts}
                  onTogglePart={(part) => handleToggleDamageChip(part, 'return')}
                />
              </div>

              {/* Task 3: Outer Damage Quick Chip Selector & Input */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  외관 부위별 빠른 선택
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {/* Clean reset chip */}
                  <button
                    type="button"
                    onClick={() => handleResetDamageToClean('return')}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${isReturnClean
                      ? 'border-[#1E60F3] bg-blue-50 text-[#1E60F3] font-bold shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 font-medium hover:bg-slate-100'
                      }`}
                  >
                    ✓ 이상 없음 (무)
                  </button>

                  {/* Body part chips */}
                  {DAMAGE_PART_CHIPS.map((part) => {
                    const isSelected = returnSelectedParts.includes(part);
                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => handleToggleDamageChip(part, 'return')}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${isSelected
                          ? 'border-[#1E60F3] bg-blue-50 text-[#1E60F3] font-bold shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-600 font-medium hover:bg-slate-100'
                          }`}
                      >
                        {part}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    외관 데미지 상세 (직접 수정 가능)
                  </label>
                  <input
                    type="text"
                    value={returnDamage}
                    onChange={(e) => setReturnDamage(e.target.value)}
                    placeholder="예: 조수석 뒷 휠 기스 (수령 시와 동일)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Parking & Key Location */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
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
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
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
            <pre className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed select-all shadow-inner">
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
            확인
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
            <span>카톡</span>
          </button>
        </div>
      </div>
    </div>
  );
};
