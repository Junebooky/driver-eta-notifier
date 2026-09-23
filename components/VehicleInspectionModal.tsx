'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DriverProfile } from '@/types';
import {
  generateReceiptReport,
  generateReturnReport,
  saveInitialInspection,
  getInitialInspection,
  clearInitialInspection,
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
  MessageSquare,
  Gauge,
  MapPin,
  Key,
  ShieldAlert,
} from 'lucide-react';

interface VehicleInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  initialMode?: 'receipt' | 'return';
}

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
  const [receiptTotalKm, setReceiptTotalKm] = useState<string>('14698');
  const [receiptDte, setReceiptDte] = useState<string>('476');
  const [receiptDamage, setReceiptDamage] = useState<string>('무');

  // Return Inputs
  const [returnTotalKm, setReturnTotalKm] = useState<string>('15048');
  const [returnDte, setReturnDte] = useState<string>('180');
  const [returnDamage, setReturnDamage] = useState<string>('무');
  const [parkingLocation, setParkingLocation] = useState<string>('');
  const [keyLocation, setKeyLocation] = useState<string>('');

  // Stored Initial Inspection Data
  const [initialData, setInitialData] = useState<InitialInspectionData | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Sync profile defaults when modal opens or profile updates
  useEffect(() => {
    if (isOpen) {
      setVehicleHocha(detectedHocha);
      setCarNumber(detectedCarNumber);
      const stored = getInitialInspection();
      setInitialData(stored);

      if (stored) {
        setReceiptTotalKm(String(stored.initialTotalKm));
        setReceiptDte(String(stored.initialDte));
        if (stored.outerDamage) setReceiptDamage(stored.outerDamage);
      }
    }
  }, [isOpen, detectedHocha, detectedCarNumber]);

  useEffect(() => {
    setActiveTab(initialMode);
  }, [initialMode]);

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

  // Handle Save & Launch KakaoTalk
  const handleSaveAndLaunch = async () => {
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
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Pure Clipboard Copy
  const handleCopyOnly = () => {
    haptics.lightTap();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(previewText);
    }
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1500);
  };

  // Clear stored receipt data
  const handleClearStored = () => {
    haptics.lightTap();
    clearInitialInspection();
    setInitialData(null);
  };

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
              className={`w-[calc(50%-4px)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-full bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-transform duration-300 ease-out pointer-events-none transform ${
                activeTab === 'receipt' ? 'translate-x-0' : 'translate-x-full'
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
                className={`text-xs tracking-tight transition-colors duration-300 ${
                  activeTab === 'receipt' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
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
                className={`text-xs tracking-tight transition-colors duration-300 ${
                  activeTab === 'return' ? 'text-white font-extrabold' : 'text-slate-500 font-semibold'
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
              <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                💡 수령 시 입력한 계기판 수치는 <strong className="text-[#1E60F3]">로컬 브라우저</strong>에 안전하게 보관되어, 운행 후 반납 시 <strong>총 주행거리 및 DTE 증감치</strong>가 자동 연산됩니다.
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    총 주행거리 (km)
                  </label>
                  <input
                    type="number"
                    value={receiptTotalKm}
                    onChange={(e) => setReceiptTotalKm(e.target.value)}
                    placeholder="14698"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    주행가능거리 DTE (km)
                  </label>
                  <input
                    type="number"
                    value={receiptDte}
                    onChange={(e) => setReceiptDte(e.target.value)}
                    placeholder="476"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  외관 데미지
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
          )}

          {/* TAB 2: RETURN MODE */}
          {activeTab === 'return' && (
            <div className="space-y-3 animate-fade-in">
              {/* Linked Initial Inspection Notice */}
              {initialData ? (
                <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between text-[11px] text-blue-900">
                  <div>
                    <span className="font-bold text-[#1E60F3]">✓ 최초 수령 기록 연동됨</span>
                    <div className="text-[10px] text-blue-700 mt-0.5">
                      최초 {initialData.initialTotalKm.toLocaleString()} km / DTE {initialData.initialDte.toLocaleString()} km
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearStored}
                    className="text-[10px] font-medium text-slate-400 hover:text-red-500 underline ml-2 cursor-pointer"
                    title="수령 기록 초기화"
                  >
                    초기화
                  </button>
                </div>
              ) : (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 leading-tight">
                  ⚠️ 보관된 수령 기록이 없습니다. 반납 수치 단독으로 보고서가 작성됩니다.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    반납 총 주행거리 (km)
                  </label>
                  <input
                    type="number"
                    value={returnTotalKm}
                    onChange={(e) => setReturnTotalKm(e.target.value)}
                    placeholder="15048"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    반납 주행가능거리 DTE (km)
                  </label>
                  <input
                    type="number"
                    value={returnDte}
                    onChange={(e) => setReturnDte(e.target.value)}
                    placeholder="180"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  외관 데미지
                </label>
                <input
                  type="text"
                  value={returnDamage}
                  onChange={(e) => setReturnDamage(e.target.value)}
                  placeholder="예: 조수석 뒷 휠 미세 기스 (수령 시와 동일)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:border-[#1E60F3] outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    주차위치 (선택)
                  </label>
                  <input
                    type="text"
                    value={parkingLocation}
                    onChange={(e) => setParkingLocation(e.target.value)}
                    placeholder="예: 지하 5층 B5구역"
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

          {/* Live Standard Report Preview Box */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>카카오톡 전송 양식 미리보기</span>
              <span className="text-[#1E60F3] font-bold">수치 실시간 연산됨</span>
            </div>
            <pre className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed select-all shadow-inner">
              {previewText}
            </pre>
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyOnly}
            className="py-3 px-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-95 cursor-pointer"
            title="텍스트만 복사"
          >
            {copySuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">복사됨</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>복사</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSaveAndLaunch}
            className="flex-1 py-3 px-4 rounded-2xl bg-[#1E60F3] hover:bg-[#1346D8] active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 transition-all cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 fill-white" />
            <span>
              {activeTab === 'receipt'
                ? '수령 저장 및 카톡 보고'
                : '반납 보고서 카톡 전송'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
