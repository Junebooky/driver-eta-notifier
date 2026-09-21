'use client';

import React, { useState, useEffect } from 'react';
import { FlightInfo, FlightType, DriverProfile, LocationPreset } from '@/types';
import {
  X,
  Plane,
  Search,
  Check,
  Copy,
  Navigation,
  User,
  AlertCircle,
  RefreshCw,
  Clock,
  ArrowRight,
  MapPin,
  Luggage,
  ExternalLink,
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

  // Quick preset flight examples for instant 1-tap testing
  const quickExamples = [
    { id: 'KE012', type: 'arrival' as FlightType, label: 'KE012 (LAX 입국)' },
    { id: 'OZ202', type: 'departure' as FlightType, label: 'OZ202 (LAX 출국)' },
    { id: 'DL159', type: 'arrival' as FlightType, label: 'DL159 (DTW 입국)' },
    { id: 'KE011', type: 'departure' as FlightType, label: 'KE011 (LAX 출국)' },
  ];

  const handleSearch = async (targetId?: string, targetType?: FlightType) => {
    const query = (targetId || flightQuery).trim().toUpperCase();
    const type = targetType || activeType;

    if (!query) {
      setErrorMsg('항공편명을 입력해 주세요. (예: KE012, OZ202)');
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

  const handleSelectQuickExample = (ex: { id: string; type: FlightType }) => {
    haptics.lightTap();
    setFlightQuery(ex.id);
    setActiveType(ex.type);
    handleSearch(ex.id, ex.type);
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

  // One-Stop Action: Set destination preset + Copy report + Close
  const handleApplyDestinationAndCopy = () => {
    if (!flight) return;
    haptics.successPulse();
    copyReport(flight);
    onSelectDestination(flight.targetPreset);
    onClose();
  };

  // Open KakaoTalk chat URL scheme
  const handleOpenKakaoTalk = () => {
    if (!flight) return;
    copyReport(flight);
    window.location.href = 'kakaotalk://';
  };

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsCopied(false);
      setErrorMsg(null);
      if (!flight && !flightQuery) {
        // Default to KE012 for quick initial preview
        setFlightQuery('KE012');
        handleSearch('KE012', 'arrival');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const passengerName = profile.passengerName?.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] sm:items-center sm:pt-0 p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-scale-up">
        {/* Modal Header */}
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 shadow-2xs">
              <Plane className="w-4 h-4 text-sky-600 rotate-[-45deg]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">
                인천공항 실시간 운항 관제
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                하차 도어 및 입국 게이트 자동 매핑
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Tab: [입국 픽업] vs [출국 샌딩] (0.1초 즉시 전환) */}
        <div className="px-4 pt-3 pb-2 bg-white shrink-0">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveType('arrival');
                if (flightQuery) handleSearch(flightQuery, 'arrival');
              }}
              className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeType === 'arrival'
                  ? 'bg-[#1E60F3] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>🛬 입국 픽업</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setActiveType('departure');
                if (flightQuery) handleSearch(flightQuery, 'departure');
              }}
              className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeType === 'departure'
                  ? 'bg-[#1E60F3] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>🛫 출국 샌딩</span>
            </button>
          </div>
        </div>

        {/* Flight Input Form & Quick Chips */}
        <div className="px-4 py-2 bg-white shrink-0 space-y-2">
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
              placeholder="항공편명 입력 (예: KE012, OZ202)"
              className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50 border border-slate-200 focus:border-[#1E60F3] focus:bg-white rounded-xl text-slate-900 text-sm font-bold tracking-wider placeholder:tracking-normal placeholder:font-medium placeholder:text-slate-400 focus:outline-none transition-all uppercase"
            />
            <div className="absolute right-1.5 flex items-center space-x-1">
              {flightQuery && (
                <button
                  type="button"
                  onClick={() => setFlightQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="px-3 py-1.5 bg-[#1E60F3] hover:bg-[#1650D6] active:scale-95 text-white text-xs font-black rounded-lg shadow-xs flex items-center gap-1 disabled:opacity-50 transition-all cursor-pointer"
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

          {/* Quick Examples */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-bold text-slate-400 shrink-0">빠른 조회:</span>
            {quickExamples.map((ex) => (
              <button
                key={ex.id + ex.type}
                type="button"
                onClick={() => handleSelectQuickExample(ex)}
                className={`px-2 py-0.8 rounded-lg text-[10px] font-bold shrink-0 transition-colors cursor-pointer ${
                  flightQuery === ex.id && activeType === ex.type
                    ? 'bg-blue-100 text-[#1E60F3]'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Auto-bound Passenger Badge */}
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-600">
              <User className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span className="font-semibold text-slate-500">담당승객:</span>
              {passengerName ? (
                <span className="font-black text-slate-900">{passengerName}</span>
              ) : (
                <span className="text-slate-400">프로필 미등록 (보고서 생략)</span>
              )}
            </div>
            <span className="text-[10px] text-slate-400">프로필 자동 바인딩</span>
          </div>
        </div>

        {/* Content Body: Flight Details */}
        <div className="p-4 overflow-y-auto flex-1 overscroll-contain space-y-3">
          {isLoading ? (
            <div className="py-14 flex flex-col items-center justify-center space-y-2.5 text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-[#1E60F3]" />
              <p className="text-xs font-bold text-slate-700">
                인천공항공사 실시간 운항 데이터 조회 중...
              </p>
              <p className="text-[11px] text-slate-400">게이트 및 체크인 카운터 매핑 분석 중</p>
            </div>
          ) : errorMsg ? (
            <div className="py-12 text-center space-y-2 px-2">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-xs font-bold text-slate-700">{errorMsg}</p>
              <p className="text-[11px] text-slate-400">
                편명(예: KE012, OZ202) 및 상단 [입국/출국] 탭 설정을 확인해 주세요.
              </p>
            </div>
          ) : flight ? (
            <div className="space-y-3 animate-fade-in">
              {/* Flight Badge Card */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md relative overflow-hidden">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-[11px] font-black tracking-wider">
                      {flight.airline}
                    </span>
                    <h4 className="text-lg font-black tracking-wide text-white">
                      {flight.flightId}
                    </h4>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.8 rounded-full ${
                      flight.diffMinutes >= 10
                        ? 'bg-amber-400 text-amber-950'
                        : flight.diffMinutes <= -5
                        ? 'bg-sky-400 text-sky-950'
                        : 'bg-emerald-400 text-emerald-950'
                    }`}
                  >
                    {flight.statusText.replace(/^[\d:]+\s*/, '')}
                  </span>
                </div>

                {/* Route visualization */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-medium">
                      {flight.type === 'arrival' ? '출발공항' : '출발 (ICN)'}
                    </span>
                    <span className="font-bold text-white text-sm">
                      {flight.type === 'arrival'
                        ? `${flight.airport}${flight.airportCode ? ` (${flight.airportCode})` : ''}`
                        : '인천국제공항'}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-sky-400 mx-2 shrink-0" />
                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400 font-medium">
                      {flight.type === 'arrival' ? '도착 (ICN)' : '도착공항'}
                    </span>
                    <span className="font-bold text-white text-sm">
                      {flight.type === 'arrival'
                        ? '인천국제공항'
                        : `${flight.airport}${flight.airportCode ? ` (${flight.airportCode})` : ''}`}
                    </span>
                  </div>
                </div>

                {/* Flight Times */}
                <div className="mt-3 pt-2.5 border-t border-white/10 grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white/5 rounded-xl py-1.5 px-2">
                    <span className="block text-[10px] text-slate-400 font-medium">
                      스케줄 예정 시각
                    </span>
                    <span className="text-xs font-black text-slate-200">
                      {flight.scheduleTimeFormatted}
                    </span>
                  </div>
                  <div className="bg-white/10 rounded-xl py-1.5 px-2 border border-sky-400/30">
                    <span className="block text-[10px] text-sky-300 font-bold">
                      {flight.type === 'arrival' ? '예상 착륙 시각' : '예상 출발 시각'}
                    </span>
                    <span className="text-xs font-black text-white">
                      {flight.estimatedTimeFormatted}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mapped Door / Gate Card */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 shadow-2xs space-y-2">
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
                        : '1층 입국장 출구 & 수하물 수취대'}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-[#1E60F3] text-white px-1.5 py-0.5 rounded-md">
                    {flight.terminal}
                  </span>
                </div>

                <div className="bg-white rounded-xl p-2.5 border border-blue-100">
                  <p className="text-sm font-black text-slate-900">
                    {flight.type === 'departure'
                      ? flight.departureLocationText
                      : flight.arrivalLocationText}
                  </p>
                  {flight.type === 'departure' && flight.checkinRange && (
                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      체크인 카운터: <span className="font-bold text-slate-800">{flight.checkinRange}</span>
                    </p>
                  )}
                  {flight.type === 'arrival' && flight.gateNumber && (
                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      탑승구(Gate): <span className="font-bold text-slate-800">{flight.gateNumber}번 게이트</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Report Preview Box */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700">단톡방 표준 보고서 미리보기</span>
                  <span className="text-[10px] text-slate-400">0.05초 즉시 복사 규격</span>
                </div>
                <pre className="text-[11px] font-mono leading-relaxed bg-white p-2.5 rounded-xl border border-slate-200/80 text-slate-800 whitespace-pre-wrap select-all">
                  {formatFlightReport(profile, flight)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-1">
              <Plane className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">항공편명을 입력 후 조회해 주세요.</p>
              <p className="text-[11px]">실시간 게이트 및 하차 도어가 자동 계산됩니다.</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {flight && (
          <div className="p-3.5 bg-slate-50 border-t border-slate-100 shrink-0 space-y-2">
            <div className="flex gap-2">
              {/* Primary Action: Set Destination + Copy Report */}
              <button
                type="button"
                onClick={handleApplyDestinationAndCopy}
                className="flex-1 py-3 px-3 bg-[#1E60F3] hover:bg-[#1650D6] active:scale-98 text-white rounded-xl font-black text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Navigation className="w-4 h-4 fill-white" />
                <span>목적지 설정 및 보고서 복사</span>
              </button>

              {/* KakaoTalk Direct Launcher */}
              <button
                type="button"
                onClick={handleOpenKakaoTalk}
                className="py-3 px-3.5 bg-[#FEE500] hover:bg-[#FDD835] active:scale-95 text-[#191919] rounded-xl font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all shadow-2xs"
                title="보고서 복사 후 카카오톡 실행"
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
