'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calculator,
  Calendar,
  Clock,
  Car,
  Check,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  Sparkles,
  Award,
  ShieldAlert,
  Info,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  Flag,
  Copy,
  ChevronRight,
  ChevronLeft,
  Send,
  Plus,
  Minus,
  ExternalLink,
} from 'lucide-react';
import { HqQuoteItem, QuoteCalculationInput } from '@/types/quoteHq';
import { OfficialServiceCategory } from '@/types/officialPricingHq';
import {
  STANDARD_VEHICLE_SKU_MAPPINGS,
  OFFICIAL_TARIFF_VERSION,
} from '@/lib/pricing/officialPricingSkus';
import { VipChauffeurCardModal } from '@/components/cards/VipChauffeurCardModal';
import { ensureClientAuth } from '@/utils/cockpitClientAuth';
import { HqPlaceSearchInput } from '@/components/hq/HqPlaceSearchInput';
import { INITIAL_HQ_CUSTOMERS } from '@/utils/customerHqData';
import { getVehicleImage } from '@/utils/vehicleData';
import { haptics } from '@/utils/haptics';
import { formatPhoneNumber } from '@/utils/formatters';
import { HqOfficialQuoteDocument, generateOfficialQuotePrintHtml } from './HqOfficialQuoteDocument';

interface HqQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookingConverted?: (bookingIds: string[]) => void;
}

const SERVICE_CATEGORIES: {
  id: OfficialServiceCategory;
  label: string;
  baseHours: number;
  description: string;
}[] = [
    {
      id: 'daily_metro',
      label: '일반 의전 (수도권 9시간)',
      baseHours: 9,
      description: '수도권 기준, 9시간 기본 (125km 포함)',
    },
    {
      id: 'daily_regional',
      label: '일반 의전 (지방/광역 9시간)',
      baseHours: 9,
      description: '지방 운행 전용 요율 (추가 지방 할증 중복 없음)',
    },
    {
      id: 'airport_incheon',
      label: '공항 편도 (인천국제공항 3시간)',
      baseHours: 3,
      description: '인천공항 픽업/샌딩 편도 3시간 기준',
    },
    {
      id: 'airport_gimpo',
      label: '공항 편도 (김포공항 3시간)',
      baseHours: 3,
      description: '김포공항 픽업/샌딩 편도 3시간 기준',
    },
  ];

const WIZARD_STEPS = [
  { number: 1, label: '고객 정보' },
  { number: 2, label: '일정 선택' },
  { number: 3, label: '차량 선택' },
  { number: 4, label: '견적 확인' },
] as const;

export const HqQuoteModal: React.FC<HqQuoteModalProps> = ({
  isOpen,
  onClose,
  onBookingConverted,
}) => {
  // Wizard Step State (1 ~ 4)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: 고객사 및 행사 정보
  const [customerName, setCustomerName] = useState('인터코스');
  const [contactPerson, setContactPerson] = useState('김지현 팀장');
  const [contactPhone, setContactPhone] = useState('010-3342-9910');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('프랑스 본사 임원단 방한 의전');

  // Step 2: 서비스 선택 & 일정/경로
  const [serviceCategory, setServiceCategory] = useState<OfficialServiceCategory>('daily_metro');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceStartTime, setServiceStartTime] = useState('09:00');
  const [serviceEndTime, setServiceEndTime] = useState('18:00');
  const [serviceHours, setServiceHours] = useState<number>(9);
  const [origin, setOrigin] = useState('인천국제공항 T2');
  const [destination, setDestination] = useState('조선 팰리스 강남');
  const [excessKm, setExcessKm] = useState<number>(0);

  // Step 3: 차량 및 옵션
  const [vehicleProductCode, setVehicleProductCode] = useState<string>('sprinter_519_premium');
  const [vehicleCount, setVehicleCount] = useState<number>(1);
  const [serviceMode, setServiceMode] = useState<'with_driver' | 'vehicle_only'>('with_driver');
  const [englishOption, setEnglishOption] = useState<'basic_included' | 'fluent_upgrade'>('basic_included');
  const [vehicleCategoryFilter, setVehicleCategoryFilter] = useState<'all' | 'sprinter' | 'sedan' | 'suv' | 'van' | 'bus'>('all');

  // Calculation & Actions State
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedQuote, setCalculatedQuote] = useState<HqQuoteItem | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [conversionSuccess, setConversionSuccess] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isChauffeurCardOpen, setIsChauffeurCardOpen] = useState(false);

  // Handle serviceCategory change -> auto-update default hours
  const handleCategoryChange = (newCat: OfficialServiceCategory) => {
    haptics.selection();
    setServiceCategory(newCat);
    const catConfig = SERVICE_CATEGORIES.find((c) => c.id === newCat);
    if (catConfig) {
      setServiceHours(catConfig.baseHours);
      if (catConfig.baseHours === 3) {
        setServiceEndTime('12:00');
      } else {
        setServiceEndTime('18:00');
      }
    }
  };

  // Recalculate quote in-memory whenever inputs change
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchCalc = async () => {
      setIsCalculating(true);
      setErrorMessage(null);
      try {
        await ensureClientAuth('hq');
        const selectedSkuObj = STANDARD_VEHICLE_SKU_MAPPINGS.find(
          (m) => m.vehicleProductCode === vehicleProductCode
        );

        const payload: QuoteCalculationInput = {
          customerName,
          contactPerson,
          contactPhone,
          contactEmail,
          date,
          serviceStartTime,
          serviceEndTime,
          serviceHours: Number(serviceHours),
          origin,
          destination,
          vehicleModel: selectedSkuObj?.vehicleProductLabel || '벤츠 스프린터 519 최고급형',
          vehicleProductCode,
          tariffVersion: OFFICIAL_TARIFF_VERSION,
          serviceCategory,
          vehicleCount: Number(vehicleCount),
          driverLanguage: englishOption === 'fluent_upgrade' ? 'en' : 'ko',
          englishOption,
          excessKm: Number(excessKm) || 0,
          serviceMode,
          notes,
        };

        const res = await fetch('/api/quotes/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (isMounted) {
          if (data.ok && data.quote) {
            setCalculatedQuote(data.quote);
          } else {
            setErrorMessage(data.error || '견적 계산에 실패했습니다.');
          }
        }
      } catch (err: any) {
        if (isMounted) setErrorMessage(err.message);
      } finally {
        if (isMounted) setIsCalculating(false);
      }
    };

    const timer = setTimeout(fetchCalc, 200);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    isOpen,
    customerName,
    contactPerson,
    contactPhone,
    contactEmail,
    date,
    serviceStartTime,
    serviceEndTime,
    serviceHours,
    serviceCategory,
    vehicleProductCode,
    excessKm,
    englishOption,
    origin,
    destination,
    vehicleCount,
    serviceMode,
    notes,
  ]);

  if (!isOpen) return null;

  // Selected SKU Object
  const currentSku = STANDARD_VEHICLE_SKU_MAPPINGS.find((m) => m.vehicleProductCode === vehicleProductCode);
  const isBusSku = currentSku?.tier === 'bus' || calculatedQuote?.quoteRequired === true;

  // Filtered SKUs for Step 3
  const filteredSkus = STANDARD_VEHICLE_SKU_MAPPINGS.filter((sku) => {
    if (vehicleCategoryFilter === 'all') return true;
    if (vehicleCategoryFilter === 'sprinter') return sku.tier === 'sprinter';
    if (vehicleCategoryFilter === 'sedan') return sku.tier === 'sedan' || sku.tier === 'genesis';
    if (vehicleCategoryFilter === 'suv') return sku.tier === 'suv';
    if (vehicleCategoryFilter === 'van') return sku.tier === 'van';
    if (vehicleCategoryFilter === 'bus') return sku.tier === 'bus';
    return true;
  });

  // P0-1: Quarantine unapproved 'draft' tariff
  const isDraftTariff =
    calculatedQuote?.tariffVersion === OFFICIAL_TARIFF_VERSION &&
    calculatedQuote?.appliedPricingSnapshot?.publicationStatus !== 'approved';

  // Explicit Save Quote to DB
  const handleSaveQuote = async () => {
    if (!calculatedQuote) return;
    if (isDraftTariff) {
      setErrorMessage(
        '2026 공식 요율표는 현재 미승인(draft) 상태로 관리자 시뮬레이션 전용입니다. 공식 승인(approved) 전에는 고객 견적서 DB 저장이 제한됩니다.'
      );
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(null);
    try {
      await ensureClientAuth('hq');
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          contactPerson,
          contactPhone,
          contactEmail,
          date,
          serviceStartTime,
          serviceEndTime,
          serviceHours: Number(serviceHours),
          origin,
          destination,
          vehicleModel: calculatedQuote.vehicleModel,
          vehicleProductCode: calculatedQuote.vehicleProductCode,
          tariffVersion: OFFICIAL_TARIFF_VERSION,
          serviceCategory,
          vehicleCount: Number(vehicleCount),
          driverLanguage: englishOption === 'fluent_upgrade' ? 'en' : 'ko',
          englishOption,
          excessKm: Number(excessKm) || 0,
          serviceMode,
          notes,
          quoteNo: calculatedQuote.quoteNo,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveSuccess(`견적서(${calculatedQuote.quoteNo})가 고객사(${customerName}) 정보에 안전하게 저장되었습니다.`);
        setTimeout(() => setSaveSuccess(null), 4000);
      } else {
        setErrorMessage(data.error || '견적서 저장에 실패했습니다.');
      }
    } catch (e: any) {
      setErrorMessage(e.message || '저장 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // Convert quote to live booking in cockpit.schedules
  const handleConvertToBooking = async () => {
    if (!calculatedQuote) return;
    if (isDraftTariff) {
      setErrorMessage(
        '2026 공식 요율표는 현재 미승인(draft) 상태로 관리자 시뮬레이션 전용입니다. 공식 승인(approved) 전에는 확정 예약 전환이 차단됩니다.'
      );
      return;
    }
    if (calculatedQuote.quoteRequired) {
      setErrorMessage('대형 버스는 유선 상담을 거친 후 단가 확정 시 예약으로 전환할 수 있습니다.');
      return;
    }

    setIsConverting(true);
    setErrorMessage(null);
    setConversionSuccess(null);

    try {
      await ensureClientAuth('hq');
      const res = await fetch('/api/quotes/convert-to-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteNo: calculatedQuote.quoteNo,
          quote: calculatedQuote,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || '예약 전환에 실패했습니다.');
        return;
      }

      setConversionSuccess(data.message || '예약으로 전환되었습니다.');
      if (onBookingConverted && data.bookingIds) {
        onBookingConverted(data.bookingIds);
      }
    } catch (err: any) {
      setErrorMessage(err.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setIsConverting(false);
    }
  };

  // Copy receipt text to clipboard
  const handleCopyReceipt = () => {
    if (!calculatedQuote) return;
    haptics.lightTap();
    const text = `[VIP LIMOUSINE KOREA 공식 견적 영수증]
견적번호: ${calculatedQuote.quoteNo}
발급일시: ${new Date().toLocaleDateString('ko-KR')} ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
----------------------------------------
고객사명: ${customerName}
담당자명: ${contactPerson} (${contactPhone})
행사내용: ${notes || 'VIP 수행 의전'}
운행일정: ${date} (${serviceStartTime} ~ ${serviceEndTime}, ${serviceHours}시간)
운행경로: ${origin} → ${destination}
----------------------------------------
선택차량: ${calculatedQuote.vehicleModel} (${vehicleCount}대)
기사서비스: ${englishOption === 'fluent_upgrade' ? '🇺🇸 영어 (추가 비용)' : '🇰🇷 한국어'}
서비스구분: ${SERVICE_CATEGORIES.find((c) => c.id === serviceCategory)?.label || serviceCategory}
----------------------------------------
• 공급가액 소계: ${calculatedQuote.supplyPriceTotal !== null ? `${calculatedQuote.supplyPriceTotal.toLocaleString()}원` : '상담 후 산정'}
• 부가가치세 (10%): ${calculatedQuote.vatAmount !== null ? `${calculatedQuote.vatAmount.toLocaleString()}원` : '별도 산정'}
========================================
총 청구 예상금액: ${calculatedQuote.estimatedGrandTotal !== null ? `${calculatedQuote.estimatedGrandTotal.toLocaleString()}원` : '상담 후 산정'} (VAT 포함)
========================================
* 2026 공식 요금표 기준 실시간 산출 견적`;

    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  const selectedSkuObj = useMemo(
    () => STANDARD_VEHICLE_SKU_MAPPINGS.find((m) => m.vehicleProductCode === vehicleProductCode),
    [vehicleProductCode]
  );
  const currentCategoryConfig = useMemo(
    () => SERVICE_CATEGORIES.find((c) => c.id === serviceCategory),
    [serviceCategory]
  );
  const serviceCategoryLabel = currentCategoryConfig?.label || serviceCategory;

  const quoteDocProps = useMemo(() => {
    return {
      quoteNo: calculatedQuote?.quoteNo || 'QT-261102-188',
      customerName: customerName || '인터코스',
      contactPerson: contactPerson || '김지현 팀장',
      contactPhone: contactPhone || '010-6348-8726',
      notes: notes || '비즈니스 투어',
      date,
      serviceStartTime,
      serviceEndTime,
      serviceHours: Number(serviceHours),
      origin,
      destination,
      vehicleModel: calculatedQuote?.vehicleModel || selectedSkuObj?.vehicleProductLabel || '제네시스 G90 신차 최고급형',
      vehicleCount: Number(vehicleCount),
      serviceCategoryLabel,
      englishOption,
      baseFareTotal: calculatedQuote?.baseFareTotal ?? null,
      overtimeHours: calculatedQuote?.overtimeHours || 0,
      overtimeFareTotal: calculatedQuote?.overtimeFareTotal || 0,
      excessKm: Number(excessKm) || 0,
      excessDistanceTotal: calculatedQuote?.excessDistanceTotal || 0,
      englishSurchargeTotal: calculatedQuote?.englishSurchargeTotal || 0,
      supplyPriceTotal: calculatedQuote?.supplyPriceTotal ?? null,
      vatAmount: calculatedQuote?.vatAmount ?? null,
      estimatedGrandTotal: calculatedQuote?.estimatedGrandTotal ?? null,
      quoteRequired: Boolean(calculatedQuote?.quoteRequired),
    };
  }, [
    calculatedQuote,
    customerName,
    contactPerson,
    contactPhone,
    notes,
    date,
    serviceStartTime,
    serviceEndTime,
    serviceHours,
    origin,
    destination,
    selectedSkuObj,
    vehicleCount,
    serviceCategoryLabel,
    englishOption,
    excessKm,
  ]);

  // Print receipt as a clean 1-page PDF matching reference specification
  const handlePrintPdf = () => {
    haptics.selection();

    // Create an invisible iframe for isolated 1-page printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const printHtml = generateOfficialQuotePrintHtml(quoteDocProps);
    doc.open();
    doc.write(printHtml);
    doc.close();

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn('iframe print error:', e);
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 3000);
      }
    };

    if (iframe.contentWindow?.document?.fonts?.ready) {
      iframe.contentWindow.document.fonts.ready
        .then(() => {
          setTimeout(triggerPrint, 250);
        })
        .catch(() => {
          setTimeout(triggerPrint, 350);
        });
    } else {
      setTimeout(triggerPrint, 350);
    }
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 15mm;
          }
          html, body {
            background: #ffffff !important;
            height: auto !important;
            overflow: visible !important;
          }
          .hq-app,
          header,
          nav,
          aside,
          #quote-modal-header,
          #quote-modal-stepper,
          #quote-step-title,
          #quote-feedback-messages,
          #quote-actions-container,
          #quote-modal-footer,
          .no-print {
            display: none !important;
          }
          #quote-modal-backdrop {
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
          }
          #quote-modal-container {
            border: none !important;
            box-shadow: none !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 auto !important;
          }
          #quote-receipt-card {
            box-shadow: none !important;
            border: 1.5px solid #cbd5e1 !important;
            max-width: 620px !important;
            margin: 0 auto !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div
        id="quote-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="의전 견적 계산기"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            haptics.lightTap();
            onClose();
          }
        }}
      >
        <div id="quote-modal-container" className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white border border-slate-200/90 rounded-3xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div id="quote-modal-header" className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1E60F3] border border-blue-100 flex items-center justify-center shrink-0 shadow-2xs">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    의전 견적 계산기
                  </h3>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stepper (1 ~ 4) */}
          <div id="quote-modal-stepper" className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="flex items-center justify-between max-w-2xl mx-auto relative">
              {/* Background connector line */}
              <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -z-0" />

              {WIZARD_STEPS.map((step) => {
                const isCurrent = currentStep === step.number;
                const isCompleted = currentStep > step.number;
                return (
                  <button
                    key={step.number}
                    type="button"
                    onClick={() => {
                      if (isCompleted || step.number < currentStep) {
                        haptics.lightTap();
                        setCurrentStep(step.number as 1 | 2 | 3 | 4);
                      }
                    }}
                    disabled={!isCompleted && !isCurrent}
                    className={`flex flex-col items-center gap-1.5 z-10 bg-transparent transition-all cursor-pointer ${!isCompleted && !isCurrent ? 'cursor-not-allowed opacity-50' : ''
                      }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${isCurrent
                        ? 'bg-[#1E60F3] text-white ring-4 ring-blue-100 shadow-sm scale-105'
                        : isCompleted
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border-2 border-slate-300 text-slate-400'
                        }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : step.number}
                    </div>
                    <span
                      className={`text-xs transition-colors whitespace-nowrap ${isCurrent
                        ? 'text-[#1E60F3] font-black'
                        : isCompleted
                          ? 'text-slate-700 font-bold'
                          : 'text-slate-400 font-medium'
                        }`}
                    >
                      {step.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-7">
            {/* Step 1: 고객사 및 행사 정보 */}
            {currentStep === 1 && (
              <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in duration-200">

                <div className="space-y-3.5">
                  {/* 고객사명 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      고객사명 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="예: 인터코스, 샤넬코리아, 페라리"
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] focus:ring-1 focus:ring-[#1E60F3] text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                      />
                    </div>
                    {/* Customer quick chips */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[11px] text-slate-400 font-medium">추천 고객사:</span>
                      {INITIAL_HQ_CUSTOMERS.slice(0, 5).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            haptics.lightTap();
                            setCustomerName(c.name);
                            if (c.primaryContactName) setContactPerson(c.primaryContactName);
                            if (c.mainPhone) setContactPhone(formatPhoneNumber(c.mainPhone));
                            if (c.mainEmail) setContactEmail(c.mainEmail);
                          }}
                          className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-[#1E60F3] text-slate-600 border border-slate-200/80 transition cursor-pointer"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 담당자 & 연락처 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        담당자 / 예약자 <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={contactPerson}
                          onChange={(e) => setContactPerson(e.target.value)}
                          placeholder="예: 김지현 팀장"
                          className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] focus:ring-1 focus:ring-[#1E60F3] text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        담당자 연락처 <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(formatPhoneNumber(e.target.value))}
                          placeholder="010-0000-0000"
                          maxLength={13}
                          className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] focus:ring-1 focus:ring-[#1E60F3] text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 이메일 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      견적서 수신 이메일 (선택)
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="vip@intercos.com"
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] focus:ring-1 focus:ring-[#1E60F3] text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* 행사명 / 운행 목적 */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      행사명 / 운행 목적
                    </label>
                    <div className="relative">
                      <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="예: 프랑스 본사 임원단 방한 의전"
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] focus:ring-1 focus:ring-[#1E60F3] text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[11px] text-slate-400 font-medium">자주 쓰는 목적:</span>
                      {['VIP 영접 의전', '공항 픽업/샌딩', '본사 임원단 방한', '비즈니스 투어', '골프 의전'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => {
                            haptics.lightTap();
                            setNotes(chip);
                          }}
                          className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-blue-50 hover:text-[#1E60F3] text-slate-600 border border-slate-200/80 transition cursor-pointer"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: 서비스 선택 & 일정/경로 */}
            {currentStep === 2 && (
              <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in duration-200">

                {/* Service Categories 4 Cards */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    서비스 종류 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SERVICE_CATEGORIES.map((cat) => {
                      const active = serviceCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleCategoryChange(cat.id)}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer shadow-2xs flex items-start gap-2.5 ${active
                            ? 'bg-blue-50/80 border-[#1E60F3] ring-1 ring-[#1E60F3]'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${active ? 'border-[#1E60F3] bg-[#1E60F3]' : 'border-slate-300'
                              }`}
                          >
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div>
                            <div className="text-xs font-black text-slate-900">{cat.label}</div>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              {cat.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 운행 일자 & 시간 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      운행 일자 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] text-sm font-bold text-slate-900 outline-none shadow-2xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      출발 시간 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={serviceStartTime}
                      onChange={(e) => setServiceStartTime(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] text-sm font-bold text-slate-900 outline-none shadow-2xs bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      종료 예정 시간
                    </label>
                    <input
                      type="time"
                      value={serviceEndTime}
                      onChange={(e) => setServiceEndTime(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] text-sm font-bold text-slate-900 outline-none shadow-2xs bg-white font-mono"
                    />
                  </div>
                </div>

                {/* 기본 이용 시간 & 초과 주행 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      기본 이용 시간 (시간 단위)
                    </label>
                    <div className="flex items-center h-11 bg-white border border-slate-200 rounded-xl px-3 justify-between shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setServiceHours((prev) => Math.max(1, prev - 1))}
                        disabled={serviceHours <= 1}
                        className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-black text-slate-900">{serviceHours}시간</span>
                      <button
                        type="button"
                        onClick={() => setServiceHours((prev) => Math.min(24, prev + 1))}
                        className="w-7 h-7 rounded bg-blue-50 hover:bg-blue-100 text-[#1E60F3] font-black flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      예상 초과 주행거리 (선택, km)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={excessKm}
                      onChange={(e) => setExcessKm(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="기본 125km 초과분"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 focus:border-[#1E60F3] text-sm font-bold text-slate-900 outline-none shadow-2xs bg-white font-mono"
                    />
                  </div>
                </div>

                {/* 출발지 & 도착지 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <HqPlaceSearchInput
                    label="출발 장소"
                    required
                    value={origin}
                    onChange={(val) => setOrigin(val)}
                    placeholder="출발 장소 검색 또는 입력"
                    icon="mapPin"
                  />
                  <HqPlaceSearchInput
                    label="도착 장소"
                    required
                    value={destination}
                    onChange={(val) => setDestination(val)}
                    placeholder="도착 장소 검색 또는 입력"
                    icon="flag"
                  />
                </div>
              </div>
            )}

            {/* Step 3: 차량 및 옵션 */}
            {currentStep === 3 && (
              <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in duration-200">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="text-sm font-black text-slate-900 tracking-tight">
                    3. 차량 및 옵션 선택
                  </h4>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    의전 목적에 맞는 2026 공식 상품 차량과 의전 기사 언어 옵션을 지정합니다.
                  </p>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {(
                    [
                      { key: 'all', label: '전체' },
                      { key: 'sprinter', label: '스프린터' },
                      { key: 'sedan', label: '세단' },
                      { key: 'suv', label: 'SUV' },
                      { key: 'van', label: '밴' },
                      { key: 'bus', label: '대형버스' },
                    ] as const
                  ).map((cat) => {
                    const active = vehicleCategoryFilter === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => {
                          haptics.lightTap();
                          setVehicleCategoryFilter(cat.key);
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer shrink-0 ${active
                          ? 'bg-[#1E60F3] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Vehicle SKU Cards */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {filteredSkus.map((sku) => {
                    const isSelected = vehicleProductCode === sku.vehicleProductCode;
                    const thumb = getVehicleImage({ model: sku.vehicleProductLabel, category: sku.tier });
                    return (
                      <button
                        key={sku.vehicleProductCode}
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setVehicleProductCode(sku.vehicleProductCode);
                        }}
                        className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer shadow-2xs flex items-center justify-between ${isSelected
                          ? 'bg-blue-50/80 border-[#1E60F3] ring-1 ring-[#1E60F3]'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-14 h-8 relative shrink-0 flex items-center justify-center">
                            <img
                              src={thumb}
                              alt={sku.vehicleProductLabel}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/images/thumb_g90.jpg';
                              }}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900 truncate">
                                {sku.vehicleProductLabel}
                              </span>
                              {sku.quoteRequired && (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 shrink-0">
                                  가격 상담 전용
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              {sku.capacityNote || sku.notes || '공식 요율 적용'}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 ml-3">
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected
                              ? 'bg-[#1E60F3] border-[#1E60F3] text-white'
                              : 'border-slate-300'
                              }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 차량 대수 & 기사 언어 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      필요 차량 수
                    </label>
                    <div className="flex items-center h-11 bg-white border border-slate-200 rounded-xl px-3 justify-between shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setVehicleCount((prev) => Math.max(1, prev - 1))}
                        disabled={vehicleCount <= 1}
                        className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-black text-slate-900">{vehicleCount}대</span>
                      <button
                        type="button"
                        onClick={() => setVehicleCount((prev) => Math.min(20, prev + 1))}
                        className="w-7 h-7 rounded bg-blue-50 hover:bg-blue-100 text-[#1E60F3] font-black flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      의전 기사 언어 옵션
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setEnglishOption('basic_included');
                        }}
                        className={`h-11 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center transition cursor-pointer ${englishOption === 'basic_included'
                          ? 'bg-blue-50 text-[#1E60F3] border-[#1E60F3] ring-1 ring-[#1E60F3]'
                          : 'bg-white border-slate-200 text-slate-600'
                          }`}
                      >
                        🇰🇷 한국어
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setEnglishOption('fluent_upgrade');
                        }}
                        className={`h-11 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center transition cursor-pointer ${englishOption === 'fluent_upgrade'
                          ? 'bg-blue-50 text-[#1E60F3] border-[#1E60F3] ring-1 ring-[#1E60F3]'
                          : 'bg-white border-slate-200 text-slate-600'
                          }`}
                      >
                        🇺🇸 영어 (추가 비용)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: 견적 확인 & 영수증 요약 */}
            {currentStep === 4 && (
              <div className="max-w-xl mx-auto space-y-5 animate-in zoom-in-95 duration-200">
                <div id="quote-step-title" className="border-b border-slate-100 pb-2 text-center">
                  <h4 className="text-base font-black text-slate-900 tracking-tight">
                    4. 공식 견적서 영수증 확인
                  </h4>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    입력하신 정보로 실시간 산출된 공식 견적 영수증입니다.
                  </p>
                </div>

                {/* Authentic VIP Chauffeur Official Receipt Document */}
                <HqOfficialQuoteDocument {...quoteDocProps} />

                {/* Notifications & Feedback */}
                <div id="quote-feedback-messages" className="space-y-2">
                  {errorMessage && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                  {saveSuccess && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-[#1E60F3]" />
                      <span>{saveSuccess}</span>
                    </div>
                  )}
                  {conversionSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>{conversionSuccess}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div id="quote-actions-container" className="space-y-2.5 pt-1">
                  {/* Primary Convert Button */}
                  <button
                    type="button"
                    onClick={handleConvertToBooking}
                    disabled={isConverting || !calculatedQuote || calculatedQuote.quoteRequired || isDraftTariff}
                    className="w-full h-12 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 active:scale-98 transition cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isConverting ? '예약 전환 중...' : '예약 전환 및 관제 등록'}</span>
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyReceipt}
                      className="py-2.5 px-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isCopied ? '복사 완료!' : '견적서 복사'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintPdf}
                      className="py-2.5 px-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      <span>견적서 PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveQuote}
                      disabled={isSaving || !calculatedQuote || isDraftTariff}
                      className="py-2.5 px-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isSaving ? '저장 중...' : '임시 저장'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Wizard Footer Navigation */}
          <div id="quote-modal-footer" className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
                }}
                className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>이전 단계</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  if (currentStep === 1 && !customerName.trim()) {
                    setErrorMessage('고객사명을 입력해 주세요.');
                    return;
                  }
                  setErrorMessage(null);
                  setCurrentStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
                }}
                className="inline-flex items-center gap-1 px-6 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white font-black text-sm shadow-md shadow-blue-500/20 transition cursor-pointer"
              >
                <span>{currentStep === 3 ? '견적 산출 및 확인' : '다음 단계'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setCurrentStep(1);
                }}
                className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-bold transition cursor-pointer"
              >
                <span>처음부터 다시 작성</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chauffeur Card Modal */}
      <VipChauffeurCardModal
        isOpen={isChauffeurCardOpen}
        onClose={() => setIsChauffeurCardOpen(false)}
        vehicleModel={calculatedQuote?.vehicleModel || 'Mercedes-Benz Sprinter 519'}
      />
    </>
  );
};
