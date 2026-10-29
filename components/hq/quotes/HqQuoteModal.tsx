'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Calculator,
  Calendar,
  Clock,
  Car,
  Languages,
  DollarSign,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  Sparkles,
  Award,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { HqQuoteItem, QuoteCalculationInput } from '@/types/quoteHq';
import { OfficialServiceCategory } from '@/types/officialPricingHq';
import { STANDARD_VEHICLE_SKU_MAPPINGS, OFFICIAL_TARIFF_VERSION } from '@/lib/pricing/officialPricingService';
import { VipChauffeurCardModal } from '@/components/cards/VipChauffeurCardModal';
import { ensureClientAuth } from '@/utils/cockpitClientAuth';

interface HqQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookingConverted?: (bookingIds: string[]) => void;
}

const SERVICE_CATEGORIES: { id: OfficialServiceCategory; label: string; baseHours: number; description: string }[] = [
  { id: 'daily_metro', label: '일반 의전 (수도권 9시간)', baseHours: 9, description: '수도권 기준, 9시간 기본 (125km 포함)' },
  { id: 'daily_regional', label: '일반 의전 (지방/광역 9시간)', baseHours: 9, description: '지방 운행 전용 요율 (추가 지방 할증 중복 없음)' },
  { id: 'airport_incheon', label: '공항 편도 (인천국제공항 3시간)', baseHours: 3, description: '인천공항 픽업/샌딩 편도 3시간 기준' },
  { id: 'airport_gimpo', label: '공항 편도 (김포공항 3시간)', baseHours: 3, description: '김포공항 픽업/샌딩 편도 3시간 기준' },
];

export const HqQuoteModal: React.FC<HqQuoteModalProps> = ({
  isOpen,
  onClose,
  onBookingConverted,
}) => {
  const [customerName, setCustomerName] = useState('인터코스');
  const [contactPerson, setContactPerson] = useState('김지현 팀장');
  const [contactPhone, setContactPhone] = useState('010-3342-9910');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceStartTime, setServiceStartTime] = useState('09:00');
  const [serviceEndTime, setServiceEndTime] = useState('18:00');
  
  // 2026 Official Tariff states
  const [serviceCategory, setServiceCategory] = useState<OfficialServiceCategory>('daily_metro');
  const [vehicleProductCode, setVehicleProductCode] = useState<string>('sprinter_519_premium');
  const [serviceHours, setServiceHours] = useState<number>(9);
  const [excessKm, setExcessKm] = useState<number>(0);
  const [englishOption, setEnglishOption] = useState<'basic_included' | 'fluent_upgrade'>('basic_included');
  
  const [origin, setOrigin] = useState('인천국제공항 T2');
  const [destination, setDestination] = useState('조선 팰리스 강남');
  const [vehicleCount, setVehicleCount] = useState<number>(1);
  const [serviceMode, setServiceMode] = useState<'with_driver' | 'vehicle_only'>('with_driver');
  const [notes, setNotes] = useState('프랑스 본사 임원단 방한 의전');

  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedQuote, setCalculatedQuote] = useState<HqQuoteItem | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [conversionSuccess, setConversionSuccess] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isChauffeurCardOpen, setIsChauffeurCardOpen] = useState(false);

  // Handle serviceCategory change -> auto-update default hours
  const handleCategoryChange = (newCat: OfficialServiceCategory) => {
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

  // Recalculate quote in-memory when inputs change (Pure calculation, ZERO DB writes)
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

  // Explicit Save Quote to DB
  const handleSaveQuote = async () => {
    if (!calculatedQuote) return;
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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-white">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base md:text-lg font-bold text-slate-100">
                    2026 공식 요금표 실시간 견적기
                  </h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    2026 공식 요율 초안 (Draft)
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  표준 9시간 의전 & 3시간 공항 편도 • 14개 SKU 공식 요금 자동 연동 • 확정 예약 즉시 전환
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsChauffeurCardOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition"
              >
                <Award className="w-3.5 h-3.5 text-amber-400" />
                VIP 배차 소개서
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Inputs (7 cols) */}
            <div className="md:col-span-7 space-y-4">
              {/* Customer & Event Info */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-400" /> 고객사 및 행사 정보
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">고객사명</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                      placeholder="예: 인터코스, 샤넬코리아"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">담당자 / 연락처</label>
                    <input
                      type="text"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                      placeholder="예: 김지현 팀장"
                    />
                  </div>
                </div>

                {/* Service Category */}
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">서비스 구분 (2026 표준 요금 기준)</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {SERVICE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategoryChange(cat.id)}
                        className={`p-2.5 rounded-lg border text-left transition ${
                          serviceCategory === cat.id
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="text-xs font-bold">{cat.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{cat.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">운행 일자</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">시작 시간</label>
                    <input
                      type="time"
                      value={serviceStartTime}
                      onChange={(e) => setServiceStartTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">종료 시간</label>
                    <input
                      type="time"
                      value={serviceEndTime}
                      onChange={(e) => setServiceEndTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">픽업지 (출발)</label>
                    <input
                      type="text"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                      placeholder="예: 인천국제공항 T2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">목적지 (도착)</label>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                      placeholder="예: 조선 팰리스 강남"
                    />
                  </div>
                </div>
              </div>

              {/* Vehicle & Chauffeur selection */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-amber-400" /> 차종 및 2026 공식 상품 선택
                </h4>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">차량 모델 및 공식 상품 SKU (14종)</label>
                  <select
                    value={vehicleProductCode}
                    onChange={(e) => setVehicleProductCode(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  >
                    <optgroup label="벤츠 스프린터 라인업 (5종)">
                      <option value="sprinter_519_premium">벤츠 스프린터 519 최고급형 리무진 (9·11·12인승)</option>
                      <option value="sprinter_519_standard">벤츠 스프린터 519 일반형 리무진</option>
                      <option value="sprinter_519_business">벤츠 스프린터 519 비즈니스 (15·16인승)</option>
                      <option value="sprinter_519_shuttle">벤츠 스프린터 519 셔틀 (15·16인승)</option>
                      <option value="sprinter_319_new_6seat">벤츠 스프린터 319 신차 (6인승 독립 VIP)</option>
                    </optgroup>
                    <optgroup label="제네시스 라인업 (3종)">
                      <option value="genesis_g90_donghaeng">제네시스 G90 리무진 (동행 VIP 의전)</option>
                      <option value="genesis_g90_standard">제네시스 G90 신차 최고급형</option>
                      <option value="genesis_gv80_new">제네시스 신형 GV80 럭셔리 SUV</option>
                    </optgroup>
                    <optgroup label="세단 및 밴 라인업 (3종)">
                      <option value="benz_s560">벤츠 S560 플래그십 세단</option>
                      <option value="hyundai_staria_lounge_limo">현대 스타리아 라운지 리무진 (7·9인승)</option>
                      <option value="kia_carnival_hi_limo">기아 카니발 하이리무진 (4·7인승)</option>
                    </optgroup>
                    <optgroup label="대형 버스 (가격 상담 전용 / 견적 필수)">
                      <option value="bus_premium_22">프리미엄 럭셔리 리무진 버스 (22인승 • 견적 별도)</option>
                      <option value="bus_limo_28">우등 리무진 버스 (28인승 • 견적 별도)</option>
                      <option value="bus_45">대형 투어 버스 (45인승 • 견적 별도)</option>
                    </optgroup>
                  </select>
                  {currentSku?.capacityNote && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      탑승 규격: <span className="text-amber-300 font-medium">{currentSku.capacityNote}</span>
                      {currentSku.notes && ` • ${currentSku.notes}`}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">필요 대수</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={vehicleCount}
                      onChange={(e) => setVehicleCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">이용 시간</label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={serviceHours}
                      onChange={(e) => setServiceHours(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">초과 주행(km)</label>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={excessKm}
                      onChange={(e) => setExcessKm(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                      placeholder="기본 125km 초과분"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">기사 언어</label>
                    <select
                      value={englishOption}
                      onChange={(e) => setEnglishOption(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    >
                      <option value="basic_included">기본 영어 기사 (0원)</option>
                      <option value="fluent_upgrade">프리토킹 영어 전문 (+10만)</option>
                    </select>
                  </div>
                </div>

                {serviceCategory === 'daily_regional' && (
                  <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-[11px] flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                    <span>지방 운행 공식 요율이 적용되어 별도의 추가 지방 할증이 중복 부과되지 않습니다.</span>
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-400 block mb-1">특이사항 / 메모</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    placeholder="예: VIP 영접 피켓 준비, 비행편 KE012"
                  />
                </div>
              </div>
            </div>

            {/* Right Quote Summary (5 cols) */}
            <div className="md:col-span-5 flex flex-col justify-between bg-slate-950 p-5 rounded-xl border border-amber-500/30">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-xs text-amber-400 font-semibold">
                      {calculatedQuote?.quoteNo || 'QT-CALCULATING'}
                    </span>
                    <h4 className="text-sm font-bold text-slate-200">
                      {calculatedQuote?.vehicleModel || '차량'} 견적 명세
                    </h4>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                    VAT 10% 별도 산정
                  </span>
                </div>

                {/* Bus Quote Required Warning Notice */}
                {isBusSku && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <p className="font-bold text-amber-300">대형 버스 가격 상담 전용 상품</p>
                      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                        대형 버스는 이동 동선, 유류비, 고속도로 통행료를 감안하여 유선 협의 후 단가가 확정됩니다. 0원 임의 확정을 방지하기 위해 예약 전환 버튼이 비활성화됩니다.
                      </p>
                    </div>
                  </div>
                )}

                {/* Calculation breakdown */}
                {isCalculating ? (
                  <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <span className="animate-spin text-amber-400">⏳</span>
                    <span>2026 공식 요율 산출 중...</span>
                  </div>
                ) : calculatedQuote ? (
                  <div className="space-y-2.5 text-xs text-slate-300">
                    {/* Base Fare */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">
                        차량 기본료 ({calculatedQuote.vehicleCount}대 × {calculatedQuote.appliedPricingSnapshot?.baseHours || (serviceCategory.startsWith('airport') ? 3 : 9)}h)
                      </span>
                      <span className="font-semibold text-slate-200">
                        {calculatedQuote.baseFareTotal !== null
                          ? `${calculatedQuote.baseFareTotal.toLocaleString()}원`
                          : <span className="text-amber-400 font-bold">상담 후 산정</span>}
                      </span>
                    </div>

                    {/* Overtime */}
                    {calculatedQuote.overtimeHours > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">
                          초과 시간 요금 ({calculatedQuote.overtimeHours}시간)
                        </span>
                        <span className="font-semibold text-amber-300">
                          {calculatedQuote.overtimeFareTotal !== null
                            ? `+${calculatedQuote.overtimeFareTotal.toLocaleString()}원`
                            : '상담 후 산정'}
                        </span>
                      </div>
                    )}

                    {/* Excess Distance */}
                    {(calculatedQuote.excessDistanceTotal || 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">
                          초과 주행 요금 ({excessKm}km)
                        </span>
                        <span className="font-semibold text-amber-300">
                          +{calculatedQuote.excessDistanceTotal?.toLocaleString()}원
                        </span>
                      </div>
                    )}

                    {/* English Chauffeur Option */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">
                        기사 언어 옵션
                      </span>
                      <span className="font-semibold">
                        {calculatedQuote.englishSurchargeTotal > 0 ? (
                          <span className="text-blue-300">
                            +{calculatedQuote.englishSurchargeTotal.toLocaleString()}원 (프리토킹 전문)
                          </span>
                        ) : (
                          <span className="text-emerald-400">
                            기본 영어 기사 포함 (0원)
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Supply Price */}
                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                      <span className="text-slate-400 font-medium">공급가액 소계</span>
                      <span className="font-bold text-slate-100 text-sm">
                        {calculatedQuote.supplyPriceTotal !== null ? (
                          `${calculatedQuote.supplyPriceTotal.toLocaleString()}원`
                        ) : (
                          <span className="text-amber-400">상담 후 별도 산정</span>
                        )}
                      </span>
                    </div>

                    {/* VAT */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">부가가치세 (10%)</span>
                      <span className="font-semibold text-slate-400">
                        {calculatedQuote.vatAmount !== null ? (
                          `${calculatedQuote.vatAmount.toLocaleString()}원`
                        ) : (
                          <span className="text-slate-500">별도 산정</span>
                        )}
                      </span>
                    </div>

                    {/* Grand Total */}
                    <div className="pt-3 border-t-2 border-amber-500/30 flex justify-between items-baseline">
                      <div>
                        <span className="text-xs text-amber-400 font-bold block">총 청구 예상금액</span>
                        <span className="text-[10px] text-slate-500">(VAT 10% 포함)</span>
                      </div>
                      <span className="text-xl font-black text-amber-300">
                        {calculatedQuote.estimatedGrandTotal !== null ? (
                          `${calculatedQuote.estimatedGrandTotal.toLocaleString()}원`
                        ) : (
                          <span className="text-base text-amber-400">상담 후 산정</span>
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-500">
                    견적 계산 중...
                  </div>
                )}

                {/* Feedback / Error Alerts */}
                {errorMessage && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {saveSuccess && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-400" />
                    <span>{saveSuccess}</span>
                  </div>
                )}

                {conversionSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{conversionSuccess}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSaveQuote}
                    disabled={isSaving || !calculatedQuote}
                    className="w-full py-2.5 px-3 rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 text-amber-300 font-bold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    {isSaving ? '저장 중...' : '견적서 DB 저장'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConvertToBooking}
                    disabled={isConverting || !calculatedQuote || calculatedQuote.quoteRequired}
                    title={
                      calculatedQuote?.quoteRequired
                        ? '대형 버스는 관리자 상담 후 단가 입력 시 예약으로 전환할 수 있습니다.'
                        : undefined
                    }
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isConverting
                      ? '전환 중...'
                      : calculatedQuote?.quoteRequired
                      ? '상담 필수 (전환 잠김)'
                      : '확정 예약 전환'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    견적서 인쇄 / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChauffeurCardOpen(true)}
                    className="py-2.5 px-3 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <Award className="w-3.5 h-3.5" />
                    VIP 의전 소개서 보기
                  </button>
                </div>
              </div>
            </div>
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
