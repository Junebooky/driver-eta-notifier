'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { FuelCode, GasStation, NaviProvider, DriverProfile } from '@/types';
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

const BRAND_BADGE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  SKE: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', label: 'SK에너지' },
  GSC: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', label: 'GS칼텍스' },
  HDO: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', label: 'HD현대오일뱅크' },
  SOL: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'S-OIL' },
  RTO: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', label: '알뜰주유소' },
  NHO: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', label: 'NH-OIL' },
  ETC: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', label: '주유소' },
};

const FUEL_OPTIONS: { code: FuelCode; name: string }[] = [
  { code: 'D047', name: '경유' },
  { code: 'B027', name: '휘발유' },
  { code: 'B034', name: '고급휘발유' },
];

export const GasStationModal: React.FC<GasStationModalProps> = ({
  isOpen,
  onClose,
  currentLat,
  currentLng,
  defaultNavi,
  profile,
  onSelectStation,
}) => {
  const [fuelCode, setFuelCode] = useState<FuelCode>('D047');
  const [sortFilter, setSortFilter] = useState<SortFilter>('FASTEST');
  const [stations, setStations] = useState<GasStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedStationId, setCopiedStationId] = useState<string | null>(null);

  // Fetch gas stations whenever modal opens or fuelCode changes
  const fetchGasStations = async (fuel: FuelCode) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const url = `/api/gas-stations?lat=${currentLat}&lng=${currentLng}&prodcd=${fuel}&radius=3000`;
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
      fetchGasStations(fuelCode);
    }
  }, [isOpen, fuelCode, currentLat, currentLng]);

  // Client-side sort by Fastest (TMAP duration) or Cheapest (Opinet price)
  const sortedStations = useMemo(() => {
    return [...stations].sort((a, b) => {
      if (sortFilter === 'FASTEST') {
        // Sort by TMAP real-time duration, then distance
        if (a.durationMinutes !== b.durationMinutes) {
          return a.durationMinutes - b.durationMinutes;
        }
        return a.distanceKm - b.distanceKm;
      } else {
        // Sort by Opinet price (cheapest first)
        if (a.price !== b.price) {
          return a.price - b.price;
        }
        return a.durationMinutes - b.durationMinutes;
      }
    });
  }, [stations, sortFilter]);

  if (!isOpen) return null;

  const currentFuelName = FUEL_OPTIONS.find((f) => f.code === fuelCode)?.name || '경유';

  // Copy report message to clipboard & give haptic feedback
  const handleCopyReport = (station: GasStation, e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.lightTap();

    const vehicleDisplay = profile.vehicleNo ? `${profile.vehicleNo}` : '의전';
    const reportMessage = `[${vehicleDisplay}호차] 인근 주유소 이동 중 • 목적지: ${station.name} (${currentFuelName} ${station.price.toLocaleString()}원) • 소요시간: 약 ${station.durationMinutes}분`;

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

  // Launch navigation directly or select station
  const handleNavigate = (station: GasStation, e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.successPulse();

    // 1. Copy report message to clipboard first for Safari gesture security
    const vehicleDisplay = profile.vehicleNo ? `${profile.vehicleNo}` : '의전';
    const reportMessage = `[${vehicleDisplay}호차] 인근 주유소 이동 중 • 목적지: ${station.name} (${currentFuelName} ${station.price.toLocaleString()}원) • 소요시간: 약 ${station.durationMinutes}분`;
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

  const naviName = defaultNavi === 'tmap' ? '티맵' : defaultNavi === 'kakao' ? '카카오내비' : '네이버지도';

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
        {/* Header */}
        <div className="p-4 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Fuel className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black text-slate-900">실시간 주유소 추천</h3>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                  오피넷 ✕ TMAP
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">반경 3km 내 실시간 유가 및 도로 주행시간</p>
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

        {/* Filter Controls: Fuel Selector + Sort Filter Tabs */}
        <div className="p-3.5 space-y-2.5 bg-white border-b border-slate-100 shrink-0">
          {/* Fuel Selector Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl">
            {FUEL_OPTIONS.map((f) => (
              <button
                key={f.code}
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setFuelCode(f.code);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  fuelCode === f.code
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>

          {/* Sort Filter Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setSortFilter('FASTEST');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  sortFilter === 'FASTEST'
                    ? 'bg-[#1E60F3] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Zap className="w-3 h-3 text-yellow-300 fill-yellow-300" />
                <span>가장 빠른 곳 (TMAP)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.lightTap();
                  setSortFilter('CHEAPEST');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  sortFilter === 'CHEAPEST'
                    ? 'bg-[#1E60F3] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <DollarSign className="w-3 h-3" />
                <span>최저가 순 (오피넷)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchGasStations(fuelCode)}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#1E60F3]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Station Card List */}
        <div className="p-3.5 overflow-y-auto space-y-2.5 flex-1 overscroll-contain">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-2.5 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-[#1E60F3]" />
              <p className="text-xs font-bold text-slate-600">인근 주유소 및 실시간 경로 조회 중...</p>
              <p className="text-[11px] text-slate-400">오피넷 유가 ✕ TMAP 교통정보 병합 중</p>
            </div>
          ) : errorMsg ? (
            <div className="py-10 text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
              <p className="text-xs font-bold text-slate-700">{errorMsg}</p>
              <button
                type="button"
                onClick={() => fetchGasStations(fuelCode)}
                className="text-xs text-[#1E60F3] font-bold underline cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : sortedStations.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-1">
              <p className="text-xs font-bold text-slate-600">반경 3km 내 검색된 주유소가 없습니다.</p>
              <p className="text-[11px]">다른 유종을 선택하시거나 새로고침해 주세요.</p>
            </div>
          ) : (
            sortedStations.map((station, idx) => {
              const brandStyle = BRAND_BADGE_STYLES[station.brandCode] || BRAND_BADGE_STYLES.ETC;
              const isBest = idx === 0;

              return (
                <div
                  key={station.id}
                  onClick={() => handleCardClick(station)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] relative ${
                    isBest
                      ? 'bg-blue-50/40 border-blue-200 shadow-xs hover:border-blue-300'
                      : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-2xs'
                  }`}
                >
                  {/* Top Badge Row */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${brandStyle.bg} ${brandStyle.text} ${brandStyle.border}`}
                      >
                        {brandStyle.label}
                      </span>
                      {isBest && (
                        <span className="text-[10px] font-extrabold bg-[#1E60F3] text-white px-1.5 py-0.5 rounded-md">
                          {sortFilter === 'FASTEST' ? '최단 시간' : '최저가 추천'}
                        </span>
                      )}
                    </div>

                    {/* Report Copy Button */}
                    <button
                      type="button"
                      onClick={(e) => handleCopyReport(station, e)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                        copiedStationId === station.id
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                      }`}
                      title="단톡방 보고 텍스트 복사"
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

                  {/* Station Name & Price */}
                  <div className="flex items-baseline justify-between mt-1">
                    <h4 className="text-sm font-black text-slate-900 truncate pr-2">{station.name}</h4>
                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-[#1E60F3] tracking-tight">
                        {station.price > 0 ? station.price.toLocaleString() : '-'}
                      </span>
                      <span className="text-xs font-bold text-slate-500 ml-0.5">원/L</span>
                    </div>
                  </div>

                  {/* Real-time TMAP Duration & Distance */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="text-slate-500 font-medium flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">
                        약 {station.durationMinutes}분
                      </span>
                      <span className="text-slate-300">•</span>
                      <span>{station.distanceKm} km</span>
                      {station.tmapEtaFormatted && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500">{station.tmapEtaFormatted} 도착</span>
                        </>
                      )}
                    </div>

                    {/* Direct Navigate Button */}
                    <button
                      type="button"
                      onClick={(e) => handleNavigate(station, e)}
                      className="px-2.5 py-1 bg-[#1E60F3] hover:bg-[#1346D8] active:bg-[#0f3bb8] text-white rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer shadow-2xs transition-all active:scale-95"
                    >
                      <Navigation className="w-3 h-3 fill-current" />
                      <span>{naviName}</span>
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
            카드를 터치하면 목적지로 설정되며, 우측 버튼으로 {naviName}를 즉시 실행할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
};
