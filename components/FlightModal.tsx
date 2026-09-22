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
} from 'lucide-react';
import { haptics } from '@/utils/haptics';
import {
  formatFlightReport,
  getCurbsideGate,
  resolveArrivalCrossValidation,
  formatExitText,
} from '@/utils/flightMapping';

interface FlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  onSelectDestination: (preset: LocationPreset) => void;
  initialFlightId?: string;
  initialType?: FlightType;
}

export const FlightModal: React.FC<FlightModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSelectDestination,
  initialFlightId,
  initialType,
}) => {
  const [activeType, setActiveType] = useState<FlightType>('arrival');
  const [flightQuery, setFlightQuery] = useState('');
  const [flight, setFlight] = useState<FlightInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Auto-trigger search when launched with an initial flight ID (e.g., from ScheduleCard)
  useEffect(() => {
    if (isOpen) {
      setIsCopied(false);
      setErrorMsg(null);
      if (initialFlightId) {
        const cleanQuery = initialFlightId.split('(')[0].trim().toUpperCase();
        const type = initialType || 'arrival';
        setActiveType(type);
        setFlightQuery(cleanQuery);
        handleSearch(cleanQuery, type);
      } else {
        setFlightQuery('');
        setFlight(null);
      }
    }
  }, [isOpen, initialFlightId, initialType]);

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
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(20);
        } catch {
          // ignore vibration error
        }
      } else {
        haptics.lightTap();
      }
      setTimeout(() => setIsCopied(false), 2000);
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
              className={`w-[calc(50%-4px)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-xl bg-[#1E60F3] shadow-[0_4px_14px_rgba(30,96,243,0.35)] transition-transform duration-300 ease-out pointer-events-none transform ${isArrival ? 'translate-x-0' : 'translate-x-full'
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
                className={`text-xs tracking-tight transition-colors duration-300 ${isArrival ? 'text-white font-black' : 'text-slate-500 font-bold hover:text-slate-800'
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
                className={`text-xs tracking-tight transition-colors duration-300 ${!isArrival ? 'text-white font-black' : 'text-slate-500 font-bold hover:text-slate-800'
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
            <div className="py-12 text-center px-4 bg-white rounded-3xl border border-slate-200/80 shadow-2xs">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <h4 className="text-base font-bold text-slate-800 mt-3">
                운항 정보를 찾을 수 없습니다
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                편명 또는 [입국/출국] 탭 설정을 확인해 주세요.
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
                  {/* Airline Subheader + Flight ID */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-slate-500 block leading-tight mb-1">
                        {flight.airline}
                      </span>
                      <h4 className="text-2xl font-black tracking-wider text-[#1E60F3] leading-none">
                        {flight.flightId}
                      </h4>
                    </div>

                    {flight.flightDate && (
                      <span className="text-xs font-bold text-slate-400">
                        {flight.flightDate}
                      </span>
                    )}
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

                    {/* Flight Path Connector */}
                    <div className="flex flex-col items-center justify-center px-3 shrink-0">
                      <span className="text-xs font-black tracking-widest text-slate-400">
                        TO
                      </span>
                      <div className="w-14 border-b border-dashed border-slate-300 mt-1" />
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

                  {/* Time Comparison & Trajectory (Flat Layout - Reference Image 1:1) */}
                  {(() => {
                    const theme =
                      flight.diffMinutes >= 10
                        ? {
                          colorHex: '#E11D48',
                          textColor: 'text-rose-600',
                          bgBadge:
                            'bg-gradient-to-r from-rose-50/20 via-rose-100/40 to-rose-50/10 text-rose-600 border border-current/10',
                          statusText: `+${flight.diffMinutes}분 지연`,
                        }
                        : flight.diffMinutes <= -5
                          ? {
                            colorHex: '#059669',
                            textColor: 'text-emerald-600',
                            bgBadge:
                              'bg-gradient-to-r from-emerald-50/20 via-emerald-100/40 to-emerald-50/10 text-emerald-600 border border-current/10',
                            statusText: `${flight.diffMinutes}분 조기`,
                          }
                          : {
                            colorHex: '#1E60F3',
                            textColor: 'text-[#1E60F3]',
                            bgBadge:
                              'bg-gradient-to-r from-blue-50/20 via-blue-100/40 to-blue-50/10 text-[#1E60F3] border border-current/10',
                            statusText: '정시 운항',
                          };

                    return (
                      <div className="pt-3 pb-1 border-t border-slate-100 flex items-center justify-between">
                        {/* Left: Scheduled Time */}
                        <div className="text-left flex-1">
                          <span className="block text-xs font-medium text-slate-400 mb-1">
                            스케줄 예정 시각
                          </span>
                          <span className="block text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
                            {flight.scheduleTimeFormatted}
                          </span>
                        </div>

                        {/* Center: Status Badge & Trajectory Graphic */}
                        <div className="flex flex-col items-center justify-center px-1 shrink-0">
                          <span
                            className={`text-[13px] font-bold py-0.5 px-3 rounded-full mb-2 tracking-tight ${theme.bgBadge}`}
                          >
                            {theme.statusText}
                          </span>

                          {/* Flight Trajectory Graphic */}
                          <div className="flex items-center justify-center">
                            {/* Flight Trail Solid Line (Left) */}
                            <div
                              className="h-[2px] w-10 sm:w-14 shrink-0"
                              style={{
                                backgroundImage: `linear-gradient(to right, transparent, ${theme.colorHex})`,
                              }}
                            />
                            {/* Plane Icon (Direct Right / Horizontal →) */}
                            <Plane
                              className="w-4 h-4 rotate-45 shrink-0 mx-0.5"
                              style={{ color: theme.colorHex, fill: theme.colorHex }}
                            />
                            {/* Dotted Trail to Destination (Right) */}
                            <div className="w-8 sm:w-10 border-b-2 border-dotted border-slate-300 opacity-80 shrink-0 ml-0.5" />
                          </div>
                        </div>

                        {/* Right: Estimated Time */}
                        <div className="text-right flex-1">
                          <span
                            className={`block text-xs font-semibold mb-1 ${theme.textColor}`}
                          >
                            {flight.type === 'arrival' ? '예상 착륙 시각' : '예상 출발 시각'}
                          </span>
                          <span
                            className={`block text-2xl sm:text-3xl font-black tracking-tight leading-none ${theme.textColor}`}
                          >
                            {flight.estimatedTimeFormatted}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
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

                {/* 3. Ticket Bottom (하차 도어 / 입국 거점 스텁) */}
                <div className="p-4 bg-gradient-to-b from-white to-slate-50/50">
                  <div className="flex items-center justify-start mb-2">
                    <span className="text-[11px] font-black bg-[#1E60F3] text-white px-2.5 py-0.5 rounded-lg shadow-2xs">
                      {flight.terminal}
                    </span>
                  </div>

                  {/* Bold Location Highlight */}
                  <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs">
                    <p className="text-base font-black text-slate-900 tracking-tight leading-snug">
                      {flight.type === 'departure'
                        ? flight.departureLocationText
                        : flight.arrivalLocationText}
                    </p>

                    {/* 입국 시 1층 도로변 외부 영접 게이트 및 추천 단기 주차 구역 노출 */}
                    {flight.type === 'arrival' &&
                      (() => {
                        const resolution = resolveArrivalCrossValidation(
                          flight.terminal,
                          flight.exitNumber,
                          flight.carousel
                        );
                        const curbside = flight.curbsideGate || resolution.curbsideGate;
                        const parking = flight.recommendedParking || resolution.recommendedParking;

                        return (
                          <div className="space-y-1 mt-1.5">
                            {curbside && curbside !== '외부 게이트 확인 필요' && (
                              <p className="text-xs text-slate-500 font-medium">
                                영접 위치:{' '}
                                <span className="font-bold text-[#1E60F3]">{curbside}</span>
                              </p>
                            )}
                            {parking && !parking.includes('확인 필요') && (
                              <p className="text-xs text-slate-500 font-medium">
                                추천 주차:{' '}
                                <span className="font-bold text-slate-800">{parking}</span>
                              </p>
                            )}
                          </div>
                        );
                      })()}

                    {/* 출국 시에만 체크인 카운터 노출 (입국 시 탑승구 문구 완전 삭제) */}
                    {flight.type === 'departure' && flight.checkinRange && (
                      <p className="text-xs text-slate-500 font-medium mt-1.5">
                        체크인 카운터:{' '}
                        <span className="font-bold text-slate-900">{flight.checkinRange}</span>
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
                    className="text-[11px] flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#1E60F3]" />
                        <span className="text-[#1E60F3] font-bold">복사됨</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-500 font-medium">텍스트 복사</span>
                      </>
                    )}
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
          <div className="p-3.5 bg-white border-t border-slate-100 shrink-0">
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
          </div>
        )}
      </div>
    </div>
  );
};
