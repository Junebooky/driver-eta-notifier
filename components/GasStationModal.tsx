'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { GasStation, NaviProvider, DriverProfile } from '@/types';
import { X, Fuel, Zap, DollarSign, Navigation, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { launchNavigationApp } from '@/utils/navigation';

interface GasStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLat: number;
  currentLng: number;
  defaultNavi: NaviProvider;
  profile: DriverProfile;
  onSelectStation: (station: GasStation, autoLaunch?: boolean) => void;
}

type SortFilter = 'FASTEST' | 'CHEAPEST';

// 5대 정유사 28x28px 공식 원형 브랜드 엠블럼
const BrandEmblem: React.FC<{ brandCode: string; brandName: string }> = ({ brandCode, brandName }) => {
  const code = (brandCode || '').toUpperCase();

  if (code === 'SKE') {
    // SK에너지: 백색 원형 바탕 + SK 시그니처 레드/오렌지 행복날개 심볼
    return (
      <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0 rounded-full shadow-2xs" aria-label={brandName}>
        <circle cx="14" cy="14" r="14" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
        <path
          d="M7.2 15.8C10 12.8 12.8 10.5 15.8 9.5C14.4 12 13.5 13.8 13.5 16.2C13.5 17 13.7 17.6 14 18.2C11.5 18.2 9.2 17.2 7.2 15.8Z"
          fill="#ED1C24"
        />
        <path
          d="M14.5 9.5C17 7 19.8 6 21.8 5.5C20.3 8 18.8 10.5 17.8 13C17.2 11.8 16 10.5 14.5 9.5Z"
          fill="#F7941D"
        />
      </svg>
    );
  }

  if (code === 'GSC') {
    // GS칼텍스: 틸 그린(#00A388) 원형 바탕 + GS 썬버스트 심볼
    return (
      <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0 rounded-full shadow-2xs" aria-label={brandName}>
        <circle cx="14" cy="14" r="14" fill="#00A388" />
        <circle cx="14" cy="14" r="5.5" fill="#FFFFFF" />
        <path
          d="M14 4V6.5M14 21.5V24M4 14H6.5M21.5 14H24M7 7L8.8 8.8M19.2 19.2L21 21M7 21L8.8 19.2M19.2 8.8L21 7"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (code === 'SOL') {
    // S-OIL: 선명한 옐로우(#FFD100) 바탕 + 그린(#00873C) S 심볼 & 레드 포인트
    return (
      <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0 rounded-full shadow-2xs" aria-label={brandName}>
        <circle cx="14" cy="14" r="14" fill="#FFD100" />
        <circle cx="14" cy="14" r="13" fill="#FFD100" stroke="#F59E0B" strokeWidth="0.8" />
        <path
          d="M17.5 10C16.8 8.8 15.5 8 14 8C11.8 8 10 9.8 10 12C10 15 18 13.5 18 17C18 19.2 16.2 20.5 14 20.5C12.2 20.5 10.8 19.5 10.2 18"
          fill="none"
          stroke="#00873C"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle cx="17.8" cy="8.2" r="1.5" fill="#EF4444" />
      </svg>
    );
  }

  if (code === 'HDO') {
    // HD현대오일뱅크: 딥 네이비(#001A49) 바탕 + 그린/시안 포워드 트라이앵글
    return (
      <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0 rounded-full shadow-2xs" aria-label={brandName}>
        <circle cx="14" cy="14" r="14" fill="#001A49" />
        <path d="M9 18.5L14 10.5L19 18.5H15.5L14 16L12.5 18.5H9Z" fill="#00D46A" />
        <path d="M14 10.5L16.5 14.5H19.5L14 5.5L8.5 14.5H11.5L14 10.5Z" fill="#00B2FF" />
      </svg>
    );
  }

  if (code === 'RTO' || code === 'NHO') {
    // 알뜰주유소 / EX-OIL / NH-OIL: 공용 도로공사 규격 블루/그린 링 심볼
    return (
      <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0 rounded-full shadow-2xs" aria-label={brandName}>
        <circle cx="14" cy="14" r="14" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" />
        <circle cx="11.5" cy="14" r="5.5" fill="none" stroke="#0284C7" strokeWidth="2.4" />
        <circle cx="16.5" cy="14" r="5.5" fill="none" stroke="#16A34A" strokeWidth="2.4" />
      </svg>
    );
  }

  // 자가/기타 주유소 (ETC)
  return (
    <div
      className="w-7 h-7 shrink-0 rounded-full bg-[#1E60F3] flex items-center justify-center text-white shadow-2xs"
      aria-label={brandName}
    >
      <Fuel className="w-3.5 h-3.5 text-white" />
    </div>
  );
};

// [태스크 6] 단톡방 보고 텍스트 규격 생성 (중복 호차 제거, 유가 삭제, ETA 표준화)
// 출력 규격: [{호차}호차 {차량번호}] 인근 주유소 이동 중 • 목적지: {주유소명} • ETA: {HH:mm}
function formatGasStationReport(profile: DriverProfile, stationName: string, etaFormatted: string): string {
  let rawV = (profile.vehicleNo || '').trim();

  // Strip trailing '호차' if present after full plate, e.g. "4호차 142호 7811호차" -> "4호차 142호 7811"
  rawV = rawV.replace(/호차\s*$/, '').trim();

  let header = '의전차량';
  if (rawV) {
    if (/^\d+$/.test(rawV)) {
      header = `${rawV}호차`;
    } else if (rawV.includes('호차')) {
      header = rawV;
    } else {
      header = `${rawV}호차`;
    }
  }

  // Strict 24h ETA HH:mm
  const timeMatch = etaFormatted.match(/(\d{1,2}:\d{2})/);
  const cleanEta = timeMatch ? timeMatch[1].padStart(5, '0') : etaFormatted || '19:36';

  return `[${header}] 인근 주유소 이동 중 • 목적지: ${stationName} • ETA: ${cleanEta}`;
}

export const GasStationModal: React.FC<GasStationModalProps> = ({
  isOpen,
  onClose,
  currentLat,
  currentLng,
  defaultNavi,
  profile,
  onSelectStation,
}) => {
  const [sortFilter, setSortFilter] = useState<SortFilter>('FASTEST');
  const [stations, setStations] = useState<GasStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedStationId, setCopiedStationId] = useState<string | null>(null);

  // Fetch gas stations with all-in-one 3-fuel prices
  const fetchGasStations = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const url = `/api/gas-stations?lat=${currentLat}&lng=${currentLng}&radius=3000`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`API Error ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data.gasStations)) {
        setStations(data.gasStations);
      } else {
        setStations([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch gas stations:', err);
      setErrorMsg('주유소 정보를 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGasStations();
    }
  }, [isOpen, currentLat, currentLng]);

  // Client-side sort by Fastest (TMAP duration) or Cheapest (Diesel / lowest price)
  const sortedStations = useMemo(() => {
    return [...stations].sort((a, b) => {
      if (sortFilter === 'FASTEST') {
        if (a.durationMinutes !== b.durationMinutes) {
          return a.durationMinutes - b.durationMinutes;
        }
        return a.distanceKm - b.distanceKm;
      } else {
        const priceA = a.prices?.diesel || a.prices?.gasoline || a.price || 99999;
        const priceB = b.prices?.diesel || b.prices?.gasoline || b.price || 99999;
        if (priceA !== priceB) {
          return priceA - priceB;
        }
        return a.durationMinutes - b.durationMinutes;
      }
    });
  }, [stations, sortFilter]);

  if (!isOpen) return null;

  // Copy report message to clipboard & give haptic feedback
  const handleCopyReport = (station: GasStation, e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.lightTap();

    const reportMessage = formatGasStationReport(profile, station.name, station.tmapEtaFormatted);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportMessage);
      } else {
        const ta = document.createElement('textarea');
        ta.value = reportMessage;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedStationId(station.id);
      setTimeout(() => setCopiedStationId(null), 2000);
    } catch (err) {
      console.warn('Copy report failed:', err);
    }
  };

  // Launch navigation directly with circular button
  const handleNavigate = (station: GasStation, e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.successPulse();

    // 1. Copy formatted report message synchronously for user convenience
    const reportMessage = formatGasStationReport(profile, station.name, station.tmapEtaFormatted);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(reportMessage);
      }
    } catch (err) {}

    // 2. Select station as destination in main dashboard
    onSelectStation(station, true);

    // 3. Launch selected navigation app immediately
    launchNavigationApp(defaultNavi, {
      name: station.name,
      lat: station.lat,
      lng: station.lng,
    });

    onClose();
  };

  const handleCardClick = (station: GasStation) => {
    haptics.lightTap();
    onSelectStation(station, false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] sm:items-center sm:pt-0 p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden text-slate-900 flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Cobalt Squircle Icon & Clean Title (No external API branding) */}
        <div className="p-4 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1E60F3] flex items-center justify-center shadow-md shadow-blue-500/20 text-white shrink-0">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">실시간 주유소 추천</h3>
              <p className="text-[11px] text-slate-400 font-medium">반경 3km 실시간 유가 및 주행 소요 시간</p>
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

        {/* Filter Controls: Sort Filter Tabs Only (No fuel tabs) */}
        <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setSortFilter('FASTEST');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                sortFilter === 'FASTEST'
                  ? 'bg-[#1E60F3] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
              <span>가장 빠른 곳</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setSortFilter('CHEAPEST');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                sortFilter === 'CHEAPEST'
                  ? 'bg-[#1E60F3] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>최저가 순</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchGasStations}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer disabled:opacity-50 transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#1E60F3]' : ''}`} />
          </button>
        </div>

        {/* Station Card List */}
        <div className="p-3.5 overflow-y-auto space-y-3 flex-1 overscroll-contain">
          {isLoading ? (
            <div className="py-14 flex flex-col items-center justify-center space-y-2.5 text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-[#1E60F3]" />
              <p className="text-xs font-bold text-slate-700">인근 주유소 및 실시간 경로 분석 중...</p>
              <p className="text-[11px] text-slate-400">3대 유종 유가 및 도로 교통정보 결합 중</p>
            </div>
          ) : errorMsg ? (
            <div className="py-12 text-center space-y-2">
              <AlertCircle className="w-7 h-7 text-rose-500 mx-auto" />
              <p className="text-xs font-bold text-slate-700">{errorMsg}</p>
              <button
                type="button"
                onClick={fetchGasStations}
                className="text-xs text-[#1E60F3] font-bold underline cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : sortedStations.length === 0 ? (
            <div className="py-14 text-center text-slate-400 space-y-1">
              <p className="text-xs font-bold text-slate-600">반경 3km 내 검색된 주유소가 없습니다.</p>
              <p className="text-[11px]">잠시 후 다시 새로고침해 주세요.</p>
            </div>
          ) : (
            sortedStations.map((station, idx) => {
              const isBest = idx === 0;

              return (
                <div
                  key={station.id}
                  onClick={() => handleCardClick(station)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] ${
                    isBest
                      ? 'bg-blue-50/40 border-blue-200 shadow-xs hover:border-blue-300'
                      : 'bg-white hover:bg-slate-50/80 border-slate-200/80 shadow-2xs'
                  }`}
                >
                  {/* Top Row: 28x28px Official Brand Emblem + Station Name + Best Badge + Report Copy */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <BrandEmblem brandCode={station.brandCode} brandName={station.brandName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-black text-slate-900 truncate">{station.name}</h4>
                          {isBest && (
                            <span className="text-[10px] font-extrabold bg-[#1E60F3] text-white px-1.5 py-0.2 rounded-md shrink-0">
                              {sortFilter === 'FASTEST' ? '최단 시간' : '최저가'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Report Copy Button */}
                    <button
                      type="button"
                      onClick={(e) => handleCopyReport(station, e)}
                      className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                        copiedStationId === station.id
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                      }`}
                      title="단톡방 이동 보고 텍스트 복사"
                    >
                      {copiedStationId === station.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>복사완료</span>
                        </>
                      ) : (
                        <span>보고 복사</span>
                      )}
                    </button>
                  </div>

                  {/* 3-Fuel All-in-One Compact Price Strip */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-3 divide-x divide-slate-100 text-center bg-slate-50/80 py-1.5 px-1 rounded-xl">
                    <div className="px-1">
                      <span className="block text-[10px] font-bold text-slate-400">경유</span>
                      <span className="text-xs font-black text-slate-800">
                        {station.prices?.diesel ? `${station.prices.diesel.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                    <div className="px-1">
                      <span className="block text-[10px] font-bold text-slate-400">휘발유</span>
                      <span className="text-xs font-black text-slate-800">
                        {station.prices?.gasoline ? `${station.prices.gasoline.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                    <div className="px-1">
                      <span className="block text-[10px] font-bold text-slate-400">고급휘발유</span>
                      <span className="text-xs font-black text-slate-800">
                        {station.prices?.premiumGasoline ? `${station.prices.premiumGasoline.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Real-time Duration & Distance + Circular Navigation Arrow Launcher */}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-xs">
                    <div className="text-slate-500 font-medium flex items-center gap-1.5">
                      <span className="font-black text-slate-900 text-sm">
                        약 {station.durationMinutes}분
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-semibold text-slate-600">{station.distanceKm} km</span>
                      {station.tmapEtaFormatted && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-[#1E60F3] font-bold">{station.tmapEtaFormatted} 도착</span>
                        </>
                      )}
                    </div>

                    {/* Circular Navigation Arrow Launcher Button */}
                    <button
                      type="button"
                      onClick={(e) => handleNavigate(station, e)}
                      className="w-10 h-10 rounded-full bg-[#1E60F3] hover:bg-[#1650D6] active:scale-90 flex items-center justify-center text-white shadow-md shadow-blue-500/20 transition-all shrink-0 cursor-pointer"
                      title="길안내 바로 시작"
                      aria-label="길안내 시작"
                    >
                      <Navigation className="w-4 h-4 fill-white -rotate-45" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Note */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-center shrink-0">
          <p className="text-[11px] text-slate-400 font-medium">
            카드를 터치하면 목적지로 설정되며, 우측 버튼으로 즉시 길안내를 시작합니다.
          </p>
        </div>
      </div>
    </div>
  );
};
