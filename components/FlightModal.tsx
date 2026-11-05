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
  Globe,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';
import {
  formatFlightReport,
  formatFlightReportEnglish,
  getCurbsideGate,
  resolveArrivalCrossValidation,
  formatExitText,
} from '@/utils/flightMapping';

const LAST_FLIGHT_SEARCH_KEY = 'cockpit_last_flight_search_v1';

function formatCandidateDateText(flightDate?: string): string {
  if (!flightDate) return '';
  const parts = flightDate.split('-');
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const dt = new Date(`${flightDate}T12:00:00+09:00`);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = !isNaN(dt.getDay()) ? `(${dayNames[dt.getDay()]})` : '';
    return `${month}.${day}${dayName}`;
  }
  return flightDate;
}

interface FlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: DriverProfile;
  onSelectDestination?: (preset: LocationPreset) => void;
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
  const [candidates, setCandidates] = useState<FlightInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [reportLang, setReportLang] = useState<'ko' | 'en'>('ko');

  // Auto-trigger search when launched with an initial flight ID (e.g., from ScheduleCard)
  // or restore from last remembered search history
  useEffect(() => {
    if (isOpen) {
      setIsCopied(false);
      setErrorMsg(null);

      if (initialFlightId) {
        // Priority 1: Schedule card / booking takes absolute precedence
        const cleanQuery = initialFlightId.split('(')[0].trim().toUpperCase();
        const type = initialType || 'arrival';
        setActiveType(type);
        setFlightQuery(cleanQuery);
        handleSearch(cleanQuery, type);
      } else {
        // Priority 2: Restore last flight search history from localStorage
        let restored = false;
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem(LAST_FLIGHT_SEARCH_KEY);
            if (raw) {
              const saved = JSON.parse(raw);
              if (saved?.flightId) {
                const type: FlightType = saved.type === 'departure' ? 'departure' : 'arrival';
                setActiveType(type);
                setFlightQuery(saved.flightId);
                handleSearch(saved.flightId, type);
                restored = true;
              }
            }
          } catch {
            // ignore localStorage parse error
          }
        }
        if (!restored) {
          setFlightQuery('');
          setFlight(null);
          setCandidates([]);
        }
      }
    }
  }, [isOpen, initialFlightId, initialType]);

  const handleSearch = async (targetId?: string, targetType?: FlightType) => {
    const query = (targetId || flightQuery).trim().toUpperCase();
    const type = targetType || activeType;

    if (!query) {
      setErrorMsg('항공편명을 입력해 주세요. (예: KE012, OZ8913, 7C101)');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setIsCopied(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    try {
      const res = await fetch(`/api/flight?flightId=${encodeURIComponent(query)}&type=${type}`, {
        signal:
          typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(4500)
            : controller.signal,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || '운항 정보를 찾을 수 없습니다.');
      }

      setFlight(data.flight);
      const rawCands: FlightInfo[] = Array.isArray(data.candidates) ? data.candidates : [data.flight];
      // Filter out any flight dates earlier than today (KST)
      const todayFormatted = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
      const candList = rawCands.filter((c) => !c.flightDate || c.flightDate >= todayFormatted);
      setCandidates(candList);

      // Save search term and type into localStorage for session persistence
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LAST_FLIGHT_SEARCH_KEY, JSON.stringify({ flightId: query, type }));
        } catch {
          // ignore localStorage write errors
        }
      }

      haptics.lightTap();
    } catch (err: any) {
      setFlight(null);
      setCandidates([]);
      const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError';
      setErrorMsg(
        isTimeout
          ? '공항공사 통신 지연(4.5초 타임아웃)으로 조회를 중단했습니다. 잠시 후 다시 시도해 주세요.'
          : err.message || '운항 정보를 불러오지 못했습니다.'
      );
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const getActiveFlightReportText = (targetFlight: FlightInfo, lang: 'ko' | 'en' = reportLang) => {
    return lang === 'en'
      ? formatFlightReportEnglish(profile, targetFlight)
      : formatFlightReport(profile, targetFlight);
  };

  const copyReport = (targetFlight: FlightInfo) => {
    const text = getActiveFlightReportText(targetFlight);
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[4vh] sm:items-center sm:pt-0 p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#F6F8FC] rounded-3xl shadow-2xl border border-slate-100/90 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-scale-up">
        {/* Modal Header: Cobalt Squircle Icon & Title */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between bg-[#F6F8FC] shrink-0">
          <div className="flex items-center space-x-3">
            <img
              src="/images/icons/driver_ui/icon_flight.png"
              alt="항공기 아이콘"
              aria-hidden="true"
              draggable={false}
              className="w-1 h-10 object-contain shrink-0 select-none pointer-events-none"
            />
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                실시간 항공편 조회
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">편명만 입력하면 공항과 터미널을 바로 찾아드려요</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#EDF1F7] hover:bg-slate-200/80 active:scale-95 flex items-center justify-center text-slate-500 cursor-pointer transition-all"
            aria-label="닫기"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Segmented Tab: [입국] vs [출국] with Smooth Sliding Pill Animation */}
        <div className="px-5 pb-2.5 bg-[#F6F8FC] shrink-0">
          <div className="w-full bg-white p-1 rounded-2xl border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] relative flex items-center select-none">
            {/* Sliding Indicator Pill */}
            <div
              className={`w-[calc(50%-4px)] h-[calc(100%-8px)] absolute top-1 left-1 rounded-xl bg-[#0055FF] shadow-[0_4px_14px_rgba(0,85,255,0.3)] transition-transform duration-300 ease-out pointer-events-none transform ${isArrival ? 'translate-x-0' : 'translate-x-full'
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
              className="flex-1 py-2.5 rounded-xl z-10 flex items-center justify-center cursor-pointer transition-colors duration-300"
            >
              <span
                className={`text-sm tracking-tight transition-colors duration-300 ${isArrival ? 'text-white font-extrabold' : 'text-slate-500 font-bold hover:text-slate-800'
                  }`}
              >
                입국 (도착)
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
              className="flex-1 py-2.5 rounded-xl z-10 flex items-center justify-center cursor-pointer transition-colors duration-300"
            >
              <span
                className={`text-sm tracking-tight transition-colors duration-300 ${!isArrival ? 'text-white font-extrabold' : 'text-slate-500 font-bold hover:text-slate-800'
                  }`}
              >
                출국 (출발)
              </span>
            </button>
          </div>
        </div>

        {/* Flight Input Form (Separated Input Card + 조회 Button) */}
        <div className="px-5 pb-2 bg-[#F6F8FC] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1 flex items-center">
              <input
                type="text"
                value={flightQuery}
                onChange={(e) => setFlightQuery(e.target.value.toUpperCase())}
                placeholder="항공편명 입력 (예: KE012, SQ612)"
                className="w-full h-11 sm:h-12 pl-4 pr-9 bg-white border border-slate-100/90 focus:border-[#0055FF] focus:ring-2 focus:ring-[#0055FF]/15 rounded-2xl text-slate-900 text-sm font-extrabold tracking-wider placeholder:tracking-normal placeholder:font-medium placeholder:text-slate-400 focus:outline-none transition-all uppercase shadow-[0_3px_12px_rgba(15,23,42,0.04)]"
              />
              {flightQuery && (
                <button
                  type="button"
                  onClick={() => setFlightQuery('')}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="h-11 sm:h-12 px-4 bg-[#0055FF] hover:bg-[#0046D5] active:scale-95 text-white text-sm font-extrabold rounded-2xl shadow-[0_4px_14px_rgba(0,85,255,0.28)] flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer shrink-0"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4 stroke-[2.2]" />
              )}
              <span>조회</span>
            </button>
          </form>
        </div>

        {/* Content Body: Real Boarding Pass Ticket */}
        <div className="px-5 py-2.5 overflow-y-auto flex-1 overscroll-contain space-y-3 bg-[#F6F8FC]">
          {isLoading ? (
            <div className="py-14 flex flex-col items-center justify-center space-y-2.5 text-slate-400 bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <RefreshCw className="w-7 h-7 animate-spin text-[#0055FF]" />
              <p className="text-sm font-bold text-slate-700">인천 · 김포공항 실시간 운항 데이터 조회 중...</p>
              <p className="text-[11px] text-slate-400">공항 및 게이트 자동 판별 중</p>
            </div>
          ) : errorMsg ? (
            <div className="py-12 text-center px-4 bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <h4 className="text-base font-bold text-slate-800 mt-3">운항 정보를 찾을 수 없습니다</h4>
              <p className="text-sm text-slate-400 mt-1">편명 또는 [입국/출국] 탭 설정을 확인해 주세요.</p>
            </div>
          ) : flight ? (
            <div className="space-y-3 animate-fade-in">
              {/* Multi-Candidate Selection Picker (When more than 1 flight matches) */}
              {candidates.length > 1 && (
                <div className="p-2 bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.04)] divide-y divide-slate-100/80 max-h-44 overflow-y-auto">
                  {candidates.map((cand, idx) => {
                    const isSelected =
                      flight.flightId === cand.flightId &&
                      flight.terminalId === cand.terminalId &&
                      flight.flightDate === cand.flightDate &&
                      flight.scheduleTimeFormatted === cand.scheduleTimeFormatted;
                    return (
                      <button
                        key={`${cand.flightId}-${cand.terminalId}-${cand.flightDate}-${idx}`}
                        type="button"
                        onClick={() => {
                          setFlight(cand);
                          haptics.lightTap();
                        }}
                        className={`w-full text-left px-3.5 py-2.5 rounded-2xl text-xs flex items-center justify-between transition-all cursor-pointer ${isSelected
                          ? 'bg-[#EBF3FF] font-extrabold text-slate-900'
                          : 'bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-slate-600 tracking-tight shrink-0 tabular-nums">
                            {formatCandidateDateText(cand.flightDate)}
                          </span>
                          <span className="font-extrabold text-slate-900 shrink-0">{cand.flightId}</span>
                          <span className="text-slate-400 font-medium truncate">({cand.airport})</span>
                        </div>
                        <div className="text-right shrink-0 ml-2 tabular-nums">
                          <span className="font-extrabold text-slate-900">
                            {cand.estimatedTimeFormatted || cand.scheduleTimeFormatted}
                          </span>
                          {(() => {
                            const match = cand.statusText?.match(/\((.*?)\)/);
                            const shortStatus = match ? match[1].split(' ')[0] : '정상';
                            return (
                              <span
                                className={`text-[11px] ml-1 font-semibold ${isSelected ? 'text-[#0055FF]' : 'text-slate-400'
                                  }`}
                              >
                                ({shortStatus})
                              </span>
                            );
                          })()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Real Boarding Pass Ticket */}
              <div className="rounded-3xl border border-slate-100/90 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.05)] relative overflow-hidden">
                {/* 1. Ticket Top (비행 정보부) */}
                <div className="p-5 space-y-4">
                  {/* Airline Subheader + Flight ID + Airport Badge */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs sm:text-sm font-bold text-slate-500 leading-tight">
                          {flight.airline}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${flight.airportKind === 'GMP'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-[#EBF3FF] text-[#0055FF]'
                            }`}
                        >
                          {flight.airportKind === 'GMP' ? '김포국제공항' : '인천국제공항'}
                        </span>
                        {flight.isMock && (
                          <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            테스트 픽스처
                          </span>
                        )}
                      </div>
                      <h4 className="text-2xl font-black tracking-wider text-[#0055FF] leading-none">
                        {flight.flightId}
                      </h4>
                    </div>

                    {flight.flightDate && (
                      <span className="text-xs sm:text-sm font-bold text-slate-400 tabular-nums">{flight.flightDate}</span>
                    )}
                  </div>

                  {/* Route & Path Graphic */}
                  <div className="flex items-center justify-between pt-0.5">
                    {/* Origin */}
                    <div className="flex-1">
                      <span className="block text-2xl font-black text-slate-900 leading-none">
                        {flight.type === 'arrival'
                          ? flight.airportCode || 'DEP'
                          : flight.airportKind === 'GMP'
                            ? 'GMP'
                            : 'ICN'}
                      </span>
                      <span className="text-xs sm:text-sm font-medium text-slate-400 truncate block mt-1">
                        {flight.type === 'arrival'
                          ? flight.airport
                          : flight.airportKind === 'GMP'
                            ? '김포국제공항'
                            : '인천국제공항'}
                      </span>
                    </div>

                    {/* Flight Path Connector */}
                    <div className="flex flex-col items-center justify-center px-3 shrink-0">
                      <span className="text-xs font-black tracking-widest text-slate-400">TO</span>
                      <div className="w-16 border-b border-dashed border-slate-200 mt-1.5" />
                    </div>

                    {/* Destination */}
                    <div className="flex-1 text-right">
                      <span className="block text-2xl font-black text-slate-900 leading-none">
                        {flight.type === 'arrival'
                          ? flight.airportKind === 'GMP'
                            ? 'GMP'
                            : 'ICN'
                          : flight.airportCode || 'ARR'}
                      </span>
                      <span className="text-xs sm:text-sm font-medium text-slate-400 truncate block mt-1">
                        {flight.type === 'arrival'
                          ? flight.airportKind === 'GMP'
                            ? '김포국제공항'
                            : '인천국제공항'
                          : flight.airport}
                      </span>
                    </div>
                  </div>

                  {/* Time Comparison & Trajectory */}
                  {(() => {
                    const theme =
                      flight.diffMinutes >= 10
                        ? {
                          colorHex: '#E11D48',
                          textColor: 'text-rose-600',
                          bgBadge: 'bg-rose-50 text-rose-600',
                          statusText: `+${flight.diffMinutes}분 지연`,
                        }
                        : flight.diffMinutes <= -5
                          ? {
                            colorHex: '#059669',
                            textColor: 'text-emerald-600',
                            bgBadge: 'bg-emerald-50 text-emerald-700',
                            statusText: `${flight.diffMinutes}분 조기`,
                          }
                          : {
                            colorHex: '#0055FF',
                            textColor: 'text-[#0055FF]',
                            bgBadge: 'bg-[#EBF3FF] text-[#0055FF]',
                            statusText: '정시 운항',
                          };

                    return (
                      <div className="pt-3.5 pb-0.5 border-t border-slate-100/90 flex items-center justify-between">
                        {/* Left: Scheduled Time */}
                        <div className="text-left flex-1">
                          <span className="block text-xs font-medium text-slate-400 mb-1">
                            스케줄 예정 시각
                          </span>
                          <span className="block text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none tabular-nums">
                            {flight.scheduleTimeFormatted}
                          </span>
                        </div>

                        {/* Center: Status Badge & Trajectory Graphic */}
                        <div className="flex flex-col items-center justify-center px-1 shrink-0">
                          <span
                            className={`text-xs font-extrabold py-1 px-3 rounded-full mb-2 tracking-tight ${theme.bgBadge}`}
                          >
                            {theme.statusText}
                          </span>

                          <div className="flex items-center justify-center">
                            <div
                              className="h-[2px] w-10 sm:w-14 shrink-0"
                              style={{
                                backgroundImage: `linear-gradient(to right, transparent, ${theme.colorHex})`,
                              }}
                            />
                            <Plane
                              className="w-4 h-4 rotate-45 shrink-0 mx-0.5"
                              style={{ color: theme.colorHex, fill: theme.colorHex }}
                            />
                            <div className="w-8 sm:w-10 border-b-2 border-dotted border-slate-300 opacity-80 shrink-0 ml-0.5" />
                          </div>
                        </div>

                        {/* Right: Estimated Time */}
                        <div className="text-right flex-1">
                          <span className={`block text-xs font-bold mb-1 ${theme.textColor}`}>
                            {flight.type === 'arrival' ? '예상 착륙 시각' : '예상 출발 시각'}
                          </span>
                          <span
                            className={`block text-2xl sm:text-3xl font-black tracking-tight leading-none tabular-nums ${theme.textColor}`}
                          >
                            {flight.estimatedTimeFormatted}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 2. Subtle Dashed Divider */}
                <div className="mx-5 border-b border-dashed border-slate-200" />

                {/* 3. Ticket Bottom (하차 도어 / 입국 거점 스텁) */}
                <div className="p-5 pt-4 space-y-2.5">
                  <div className="flex items-center justify-start gap-2">
                    <span className="text-[11px] font-extrabold bg-[#0055FF] text-white px-3 py-1 rounded-full">
                      {flight.airportKind === 'GMP' ? `김포공항 ${flight.terminal}` : `인천공항 ${flight.terminal}`}
                    </span>
                    {flight.airportKind === 'GMP' && flight.isDomestic && (
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                        국내선
                      </span>
                    )}
                  </div>

                  {/* Location Highlight */}
                  <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-slate-100/90">
                    {flight.type === 'departure' ? (
                      <p className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-snug">
                        {flight.departureLocationText}
                      </p>
                    ) : (
                      <p
                        className={`text-sm sm:text-base tracking-tight leading-snug ${!flight.exitNumber && !flight.exit && !flight.gateNumber
                          ? 'font-medium text-slate-500'
                          : 'font-extrabold text-slate-900'
                          }`}
                      >
                        {flight.arrivalLocationText}
                      </p>
                    )}

                    {/* Curbside pickup and parking zones */}
                    {flight.type === 'arrival' && (
                      <div className="space-y-1 mt-1.5 text-xs sm:text-[13px]">
                        {flight.curbsideGate ? (
                          <p className="text-slate-500 font-medium">
                            위치 : <span className="font-bold text-[#0055FF]">{flight.curbsideGate}</span>
                          </p>
                        ) : (
                          <p className="text-slate-500 font-medium">
                            위치 : 착륙 1~2시간 전 자동 확정
                          </p>
                        )}
                        {flight.recommendedParking && (
                          <p className="text-slate-500 font-medium">
                            추천 주차: <span className="font-bold text-slate-800">{flight.recommendedParking}</span>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Departure checkin counter */}
                    {flight.type === 'departure' && flight.checkinRange && (
                      <p className="text-xs sm:text-[13px] text-slate-500 font-medium mt-1.5">
                        체크인 카운터: <span className="font-bold text-slate-900">{flight.checkinRange}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 단톡방 보고 미리보기 카드 (한/영 전환 및 복사 지원) */}
              <div className="rounded-3xl border border-slate-100/90 bg-white p-4 shadow-[0_6px_24px_rgba(15,23,42,0.05)] space-y-3 select-none">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src="/images/icons/driver_ui/icon_talk.png"
                      alt="단톡방 보고 아이콘"
                      aria-hidden="true"
                      draggable={false}
                      className="w-6 h-6 sm:w-7 sm:h-7 object-contain shrink-0 select-none pointer-events-none"
                    />
                    <span className="text-sm sm:text-[15px] font-extrabold text-slate-900 tracking-tight">
                      단톡방 보고
                    </span>
                    {reportLang === 'en' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-[#0055FF] border border-blue-200/60">
                        EN
                      </span>
                    )}
                  </div>

                  {/* Action Buttons: Globe (한/영 전환) & Copy (양식 복사) */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.lightTap();
                        setReportLang((prev) => (prev === 'ko' ? 'en' : 'ko'));
                      }}
                      className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
                        reportLang === 'en'
                          ? 'bg-blue-50 hover:bg-blue-100 text-[#0055FF] border-blue-200/80 shadow-[0_2px_6px_rgba(0,85,255,0.15)]'
                          : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-100/90 shadow-[0_2px_6px_rgba(15,23,42,0.05)]'
                      }`}
                      title={reportLang === 'en' ? '한국어 보고서로 전환' : 'Switch to English Report'}
                      aria-label="보고서 언어 전환"
                    >
                      <Globe className={`w-4 h-4 ${reportLang === 'en' ? 'text-[#0055FF]' : 'text-slate-600'}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => copyReport(flight)}
                      className="w-8 h-8 rounded-full border border-slate-100/90 shadow-[0_2px_6px_rgba(15,23,42,0.05)] flex items-center justify-center bg-white hover:bg-slate-50 text-slate-600 transition-all active:scale-90 cursor-pointer"
                      title="보고서 복사"
                      aria-label="보고서 복사"
                    >
                      {isCopied ? (
                        <Check className="w-4 h-4 text-[#0055FF]" />
                      ) : (
                        <Copy className="w-4 h-4 text-slate-600" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-[#F8FAFC] border border-slate-100/90 rounded-2xl p-3.5 text-xs sm:text-[13px] font-semibold text-slate-800 leading-relaxed select-all whitespace-pre-line font-sans text-left">
                  {getActiveFlightReportText(flight)}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-1.5 bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_18px_rgba(15,23,42,0.04)] p-4">
              <Plane className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-600">항공편명을 입력 후 조회해 주세요.</p>
              <p className="text-[11px]">인천·김포공항을 자동 감지하여 게이트 및 하차 도어를 계산합니다.</p>
            </div>
          )}
        </div>

        {/* Footer Actions: [확인] + [카톡] */}
        {flight && (
          <div className="px-5 pb-5 pt-2 bg-[#F6F8FC] shrink-0">
            <div className="flex gap-2.5">
              {/* Confirm Action */}
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  onClose();
                }}
                className="flex-1 h-12 sm:h-13 bg-[#0055FF] hover:bg-[#0046D5] active:scale-98 text-white font-extrabold rounded-2xl text-sm sm:text-[15px] flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-[0_6px_18px_rgba(0,85,255,0.28)]"
              >
                <Check className="w-4 h-4 text-white stroke-[2.5]" />
                <span>확인</span>
              </button>

              {/* KakaoTalk Direct Action */}
              <button
                type="button"
                onClick={handleOpenKakaoTalk}
                className="px-4 h-12 sm:h-13 bg-[#FEE500] hover:bg-[#FDD835] active:scale-95 text-[#191919] rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs shrink-0"
                title="단톡방 보고서 복사 및 카카오톡 실행"
              >
                <svg className="w-3.5 h-3.5 fill-[#191919] shrink-0" viewBox="0 0 24 24">
                  <path d="M12 3c-5.523 0-10 3.582-10 8 0 2.853 1.879 5.364 4.707 6.744l-.961 3.541c-.085.312.246.577.525.418l4.24-2.42c.484.06 1.002.097 1.489.097 5.523 0 10-3.582 10-8s-4.477-8-10-8z" />
                </svg>
                <span>카톡</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
