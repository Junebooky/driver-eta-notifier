'use client';

import React, { useState, useEffect } from 'react';
import { FlightInfo, FlightType, DriverProfile, LocationPreset } from '@/types';
import {
  X,
  Plane,
  Search,
  Check,
  Copy,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  MapPin,
  Luggage,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { formatFlightReport } from '@/utils/flightMapping';

interface FlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  onSelectDestination: (preset: LocationPreset) => void;
}

export const FlightModal: React.FC<FlightModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSelectDestination,
}) => {
  const [activeType, setActiveType] = useState<FlightType>('arrival');
  const [flightQuery, setFlightQuery] = useState('');
  const [flight, setFlight] = useState<FlightInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleSearch = async (targetId?: string, targetType?: FlightType) => {
    const query = (targetId || flightQuery).trim().toUpperCase();
    const type = targetType || activeType;

    if (!query) {
      setErrorMsg('항공편명을 입력해 주세요. (예: KE012, OZ741)');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setIsCopied(false);

    try {
      const res = await fetch(`/api/flight?flightId=${encodeURIComponent(query)}&type=${type}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || '운항 정보를 찾을 수 없습니다.');
      }

      setFlight(data.flight);
      haptics.lightTap();
    } catch (err: any) {
      setFlight(null);
      setErrorMsg(err.message || '운항 정보를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyReport = (targetFlight: FlightInfo) => {
    const text = formatFlightReport(profile, targetFlight);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setIsCopied(true);
      haptics.successPulse();
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.warn('Clipboard copy error:', err);
    }
  };

  // KakaoTalk Action: Copy standard report + open KakaoTalk deep link
  const handleOpenKakaoTalk = () => {
    if (!flight) return;
    copyReport(flight);
    window.location.href = 'kakaotalk://';
  };

  // Reset when modal opens with KE012 default preview if empty
  useEffect(() => {
    if (isOpen) {
      setIsCopied(false);
      setErrorMsg(null);
      if (!flight && !flightQuery) {
        setFlightQuery('KE012');
        handleSearch('KE012', 'arrival');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isArrival = activeType === 'arrival';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] sm:items-center sm:pt-0 p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-scale-up">
        {/* Modal Header: Cobalt Squircle Icon & Title only */}
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1E60F3] text-white flex items-center justify-center shadow-sm shrink-0">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-black text-slate-900 leading-tight">
              인천공항 실시간 운항 관제
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-500 cursor-pointer transition-all"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Tab: [입국] vs [출국] with Smooth Sliding Pill Animation */}
        <div className="px-4 pt-3 pb-2 bg-white shrink-0">
          <div className="w-full bg-slate-100 p-1 rounded-2xl relative flex items-center select-none shadow-inner">
            {/* Sliding Indicator Pill */}
            <div
              className={`w-[calc(50%-4px)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-xl bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-transform duration-300 ease-out pointer-events-none transform ${
                isArrival ? 'translate-x-0' : 'translate-x-full'
              }`}
            />

            {/* Arrival Tab Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveType('arrival');
                if (flightQuery) handleSearch(flightQuery, 'arrival');
              }}
              className="flex-1 py-2 rounded-xl z-10 flex items-center justify-center cursor-pointer transition-colors duration-300"
            >
              <span
                className={`text-xs tracking-tight transition-colors duration-300 ${
                  isArrival ? 'text-white font-black' : 'text-slate-500 font-bold hover:text-slate-800'
                }`}
              >
                입국
              </span>
            </button>

            {/* Departure Tab Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveType('departure');
                if (flightQuery) handleSearch(flightQuery, 'departure');
              }}
              className="flex-1 py-2 rounded-xl z-10 flex items-center justify-center cursor-pointer transition-colors duration-300"
            >
              <span
                className={`text-xs tracking-tight transition-colors duration-300 ${
                  !isArrival ? 'text-white font-black' : 'text-slate-500 font-bold hover:text-slate-800'
                }`}
              >
                출국
              </span>
            </button>
          </div>
        </div>

        {/* Flight Input Form (군더더기 칩 & 담당승객 행 화면 제거) */}
        <div className="px-4 py-2 bg-white shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="relative flex items-center"
          >
            <input
              type="text"
              value={flightQuery}
              onChange={(e) => setFlightQuery(e.target.value.toUpperCase())}
              placeholder="항공편명 입력 (예: KE012, OZ741)"
              className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50 border border-slate-200 focus:border-[#1E60F3] focus:bg-white rounded-xl text-slate-900 text-sm font-bold tracking-wider placeholder:tracking-normal placeholder:font-medium placeholder:text-slate-400 focus:outline-none transition-all uppercase"
            />
            <div className="absolute right-1.5 flex items-center space-x-1">
              {flightQuery && (
                <button
                  type="button"
                  onClick={() => setFlightQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="px-3.5 py-1.5 bg-[#1E60F3] hover:bg-[#1650D6] active:scale-95 text-white text-xs font-black rounded-lg shadow-xs flex items-center gap-1 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>조회</span>
              </button>
            </div>
          </form>
        </div>

        {/* Content Body: Real Boarding Pass Ticket */}
        <div className="p-4 overflow-y-auto flex-1 overscroll-contain space-y-3 bg-slate-50">
          {isLoading ? (
            <div className="py-14 flex flex-col items-center justify-center space-y-2.5 text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-[#1E60F3]" />
              <p className="text-xs font-bold text-slate-700">
                인천공항공사 실시간 운항 데이터 조회 중...
              </p>
              <p className="text-[11px] text-slate-400">게이트 및 체크인 카운터 매핑 분석 중</p>
            </div>
          ) : errorMsg ? (
            <div className="py-12 text-center space-y-2 px-2 bg-white rounded-2xl border border-slate-200/80 p-4">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-xs font-bold text-slate-700">{errorMsg}</p>
              <p className="text-[11px] text-slate-400">
                편명(예: KE012, OZ741) 및 상단 [입국/출국] 탭 설정을 확인해 주세요.
              </p>
            </div>
          ) : flight ? (
            <div className="space-y-3 animate-fade-in">
              {/* ============================================================== */}
              {/* REAL BOARDING PASS TICKET COMPONENT                            */}
              {/* ============================================================== */}
              <div className="rounded-3xl border border-slate-200 bg-white shadow-sm relative overflow-hidden">
                {/* 1. Ticket Top (비행 정보부) */}
                <div className="p-4 space-y-3">
                  {/* Airline Badge + Flight ID + Status Capsule */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#1E60F3] bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                        {flight.airline}
                      </span>
                      <h4 className="text-xl font-black tracking-wider text-slate-900">
                        {flight.flightId}
                      </h4>
                    </div>

                    <span
                      className={`text-[11px] font-black px-2.5 py-1 rounded-full ${
                        flight.diffMinutes >= 10
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : flight.diffMinutes <= -5
                          ? 'bg-sky-100 text-sky-900 border border-sky-200'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      }`}
                    >
                      {flight.statusText.replace(/^[\d:]+\s*/, '')}
                    </span>
                  </div>

                  {/* Route & Path Graphic */}
                  <div className="flex items-center justify-between pt-1">
                    {/* Origin */}
                    <div className="flex-1">
                      <span className="block text-2xl font-black text-slate-900 leading-none">
                        {flight.type === 'arrival' ? (flight.airportCode || 'DEP') : 'ICN'}
                      </span>
                      <span className="text-xs font-medium text-slate-400 truncate block mt-1">
                        {flight.type === 'arrival' ? flight.airport : '인천국제공항'}
                      </span>
                    </div>

                    {/* Flight Path Icon */}
                    <div className="flex flex-col items-center justify-center px-3 shrink-0">
                      <Plane className="w-5 h-5 text-[#1E60F3] rotate-90" />
                      <div className="w-16 border-b border-dashed border-slate-300 mt-1" />
                    </div>

                    {/* Destination */}
                    <div className="flex-1 text-right">
                      <span className="block text-2xl font-black text-slate-900 leading-none">
                        {flight.type === 'arrival' ? 'ICN' : (flight.airportCode || 'ARR')}
                      </span>
                      <span className="text-xs font-medium text-slate-400 truncate block mt-1">
                        {flight.type === 'arrival' ? '인천국제공항' : flight.airport}
                      </span>
                    </div>
                  </div>

                  {/* Time Grid: Schedule vs Estimated */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div className="bg-slate-50 rounded-xl py-2 px-2.5 text-center border border-slate-100">
                      <span className="block text-[10px] text-slate-400 font-semibold mb-0.5">
                        스케줄 예정 시각
                      </span>
                      <span className="text-sm font-black text-slate-700">
                        {flight.scheduleTimeFormatted}
                      </span>
                    </div>
                    <div className="bg-blue-50/70 rounded-xl py-2 px-2.5 text-center border border-blue-100">
                      <span className="block text-[10px] text-[#1E60F3] font-bold mb-0.5">
                        {flight.type === 'arrival' ? '예상 착륙 시각' : '예상 출발 시각'}
                      </span>
                      <span className="text-sm font-black text-[#1E60F3]">
                        {flight.estimatedTimeFormatted}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Ticket Center Perforation & Notches (반원형 홈 & 점선 절취선) */}
                <div className="relative flex items-center my-0.5">
                  {/* Left Notch */}
                  <div className="-ml-3 w-6 h-6 rounded-r-full bg-slate-50 border-r border-slate-200 shrink-0" />
                  {/* Dashed Perforation Line */}
                  <div className="flex-1 border-b-2 border-dashed border-slate-200 mx-2" />
                  {/* Right Notch */}
                  <div className="-mr-3 w-6 h-6 rounded-l-full bg-slate-50 border-l border-slate-200 shrink-0" />
                </div>

                {/* 3. Ticket Bottom (하차 도어 / 입국 게이트 스텁) */}
                <div className="p-4 bg-gradient-to-b from-white to-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[#1E60F3]">
                      {flight.type === 'departure' ? (
                        <MapPin className="w-4 h-4 text-[#1E60F3]" />
                      ) : (
                        <Luggage className="w-4 h-4 text-[#1E60F3]" />
                      )}
                      <span className="text-xs font-black">
                        {flight.type === 'departure'
                          ? '3층 출국장 VIP 하차 도어'
                          : '1층 입국장 출구 & 수하물'}
                      </span>
                    </div>
                    <span className="text-[11px] font-black bg-[#1E60F3] text-white px-2 py-0.5 rounded-lg shadow-2xs">
                      {flight.terminal}
                    </span>
                  </div>

                  {/* Bold Location Highlight */}
                  <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
                    <p className="text-base font-black text-slate-900 tracking-tight leading-snug">
                      {flight.type === 'departure'
                        ? flight.departureLocationText
                        : flight.arrivalLocationText}
                    </p>

                    {flight.type === 'departure' && flight.checkinRange && (
                      <p className="text-xs text-slate-500 font-medium mt-1.5">
                        체크인 카운터:{' '}
                        <span className="font-bold text-slate-900">{flight.checkinRange}</span>
                      </p>
                    )}

                    {flight.type === 'arrival' && flight.gateNumber && (
                      <p className="text-xs text-slate-500 font-medium mt-1.5">
                        탑승구(Gate):{' '}
                        <span className="font-bold text-slate-900">{flight.gateNumber}번 게이트</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Report Preview Box (클릭 시 복사 가능) */}
              <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700">단톡방 표준 보고서 미리보기</span>
                  <button
                    type="button"
                    onClick={() => copyReport(flight)}
                    className="text-[10px] text-[#1E60F3] font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>텍스트 복사</span>
                  </button>
                </div>
                <pre className="text-[11px] font-mono leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-slate-800 whitespace-pre-wrap select-all">
                  {formatFlightReport(profile, flight)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-1 bg-white rounded-2xl border border-slate-200/80 p-4">
              <Plane className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">항공편명을 입력 후 조회해 주세요.</p>
              <p className="text-[11px]">실시간 게이트 및 하차 도어가 자동 계산됩니다.</p>
            </div>
          )}
        </div>

        {/* Footer Actions: [확인] & [카톡] */}
        {flight && (
          <div className="p-3.5 bg-white border-t border-slate-100 shrink-0 space-y-2">
            <div className="flex gap-2">
              {/* Main Action: Confirm (Close Modal) */}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 bg-[#1E60F3] hover:bg-[#1650D6] active:scale-98 text-white font-bold rounded-2xl text-sm flex items-center justify-center cursor-pointer transition-all shadow-md shadow-blue-500/20"
              >
                <span>확인</span>
              </button>

              {/* KakaoTalk Direct Action: Copy report + kakaotalk:// */}
              <button
                type="button"
                onClick={handleOpenKakaoTalk}
                className="w-16 h-12 bg-[#FEE500] hover:bg-[#FDD835] active:scale-95 text-[#191919] rounded-2xl font-black text-xs flex items-center justify-center gap-1 cursor-pointer transition-all shadow-2xs shrink-0"
                title="단톡방 보고서 복사 및 카카오톡 실행"
              >
                <span>카톡</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#191919]" />
              </button>
            </div>

            {isCopied && (
              <p className="text-center text-[11px] font-bold text-emerald-600 animate-fade-in flex items-center justify-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>단톡방 보고서가 클립보드에 복사되었습니다!</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
