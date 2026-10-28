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
} from 'lucide-react';
import { HqQuoteItem, QuoteCalculationInput } from '@/types/quoteHq';
import { VipChauffeurCardModal } from '@/components/cards/VipChauffeurCardModal';

interface HqQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookingConverted?: (bookingIds: string[]) => void;
}

const VEHICLE_OPTIONS = [
  { name: 'Mercedes-Benz Sprinter 519 CDI', baseHours: 10, baseFare: 800000, vehicleOnly: 600000, category: 'sprinter' },
  { name: 'Mercedes-Benz Sprinter 319 CDI', baseHours: 10, baseFare: 1000000, vehicleOnly: 800000, category: 'sprinter' },
  { name: 'Mercedes-Benz V-Class', baseHours: 10, baseFare: 500000, vehicleOnly: 400000, category: 'v_class' },
  { name: 'Mercedes-Benz S-Class (W223)', baseHours: 10, baseFare: 650000, vehicleOnly: 500000, category: 's_class' },
  { name: 'Genesis G90 LWB', baseHours: 10, baseFare: 600000, vehicleOnly: 450000, category: 'genesis' },
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
  const [serviceEndTime, setServiceEndTime] = useState('19:00');
  const [serviceHours, setServiceHours] = useState(10);
  const [origin, setOrigin] = useState('인천국제공항 T2');
  const [destination, setDestination] = useState('조선 팰리스 강남');
  const [vehicleModel, setVehicleModel] = useState('Mercedes-Benz Sprinter 519 CDI');
  const [vehicleCount, setVehicleCount] = useState(1);
  const [driverLanguage, setDriverLanguage] = useState<'ko' | 'en'>('en');
  const [serviceMode, setServiceMode] = useState<'with_driver' | 'vehicle_only'>('with_driver');
  const [notes, setNotes] = useState('프랑스 본사 임원단 방한 의전');

  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedQuote, setCalculatedQuote] = useState<HqQuoteItem | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionSuccess, setConversionSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isChauffeurCardOpen, setIsChauffeurCardOpen] = useState(false);
  const [isPrintMode, setIsPrintMode] = useState(false);

  // Recalculate quote when key inputs change
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchCalc = async () => {
      setIsCalculating(true);
      setErrorMessage(null);
      try {
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
          vehicleModel,
          vehicleCount: Number(vehicleCount),
          driverLanguage,
          serviceMode,
          notes,
        };

        const res = await fetch('/api/quotes', {
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
    origin,
    destination,
    vehicleModel,
    vehicleCount,
    driverLanguage,
    serviceMode,
    notes,
  ]);

  if (!isOpen) return null;

  // Convert quote to live booking in cockpit.schedules
  const handleConvertToBooking = async () => {
    if (!calculatedQuote) return;
    setIsConverting(true);
    setErrorMessage(null);
    setConversionSuccess(null);

    try {
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
        <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-white">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base md:text-lg font-bold text-slate-100">
                    실시간 가격표 견적기 & 견적서 생성
                  </h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">
                    사모님 전화응대 최적화
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  표준 가격표 및 고객사 계약 단가 자동 적용 • 즉시 확정 예약 전환
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
                  <Car className="w-3.5 h-3.5 text-amber-400" /> 차종 및 기사 옵션
                </h4>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">차량 모델</label>
                  <select
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                  >
                    {VEHICLE_OPTIONS.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} (기본 {v.baseHours}h • {v.baseFare.toLocaleString()}원)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
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
                    <label className="text-xs text-slate-400 block mb-1">서비스 시간</label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={serviceHours}
                      onChange={(e) => setServiceHours(Math.max(1, parseInt(e.target.value) || 10))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">기사 언어</label>
                    <select
                      value={driverLanguage}
                      onChange={(e) => setDriverLanguage(e.target.value as 'ko' | 'en')}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-400 outline-none"
                    >
                      <option value="ko">한국어 기사</option>
                      <option value="en">영어 가능 기사 (+5만)</option>
                    </select>
                  </div>
                </div>

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
                    <h4 className="text-sm font-bold text-slate-200">실시간 견적 명세</h4>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    VAT 10% 별도
                  </span>
                </div>

                {/* Calculation breakdown */}
                {calculatedQuote ? (
                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">
                        차량 기본료 ({calculatedQuote.vehicleCount}대 × 10h)
                      </span>
                      <span className="font-semibold text-slate-200">
                        {calculatedQuote.baseFareTotal.toLocaleString()}원
                      </span>
                    </div>

                    {calculatedQuote.overtimeHours > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">
                          초과 요금 ({calculatedQuote.overtimeHours}시간)
                        </span>
                        <span className="font-semibold text-amber-300">
                          {calculatedQuote.isOvertimeRateConfirmed
                            ? `${calculatedQuote.overtimeFareTotal.toLocaleString()}원`
                            : '협의 필요 (0원 반영)'}
                        </span>
                      </div>
                    )}

                    {calculatedQuote.englishSurchargeTotal > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">
                          영어 의전 기사 수당 ({calculatedQuote.vehicleCount}대)
                        </span>
                        <span className="font-semibold text-blue-300">
                          +{calculatedQuote.englishSurchargeTotal.toLocaleString()}원
                        </span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                      <span className="text-slate-400">공급가액 소계</span>
                      <span className="font-bold text-slate-200 text-sm">
                        {calculatedQuote.supplyPriceTotal.toLocaleString()}원
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">부가가치세 (10%)</span>
                      <span className="font-semibold text-slate-400">
                        {calculatedQuote.vatAmount.toLocaleString()}원
                      </span>
                    </div>

                    <div className="pt-3 border-t-2 border-amber-500/30 flex justify-between items-baseline">
                      <div>
                        <span className="text-xs text-amber-400 font-bold block">총 청구 예상금액</span>
                        <span className="text-[10px] text-slate-500">(부가세 포함)</span>
                      </div>
                      <span className="text-xl font-black text-amber-300">
                        {calculatedQuote.estimatedGrandTotal.toLocaleString()}원
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

                {conversionSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{conversionSuccess}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={handleConvertToBooking}
                  disabled={isConverting || !calculatedQuote}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2"
                >
                  {isConverting ? (
                    '예약 전환 및 배차 대기 등록 중...'
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      확정 예약으로 전환 (대표님 배차 대기함 전송)
                    </>
                  )}
                </button>

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
        vehicleModel={vehicleModel}
      />
    </>
  );
};
