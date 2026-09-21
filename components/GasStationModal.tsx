'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { GasStation, NaviProvider, DriverProfile } from '@/types';
import { X, Fuel, Zap, DollarSign, Navigation, RefreshCw, AlertCircle } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { launchNavigationApp } from '@/utils/navigation';

interface GasStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLat: number;
  currentLng: number;
  originId?: string;
  defaultNavi: NaviProvider;
  profile: DriverProfile;
  onSelectStation: (station: GasStation, autoLaunch?: boolean) => void;
}

type SortFilter = 'FASTEST' | 'CHEAPEST';

// [태스크 1] 5대 정유사 28x28px 공식 브랜드 컬러 원형 텍스트 뱃지
const BrandEmblem: React.FC<{ brandCode: string; brandName: string }> = ({ brandCode, brandName }) => {
  const code = (brandCode || '').toUpperCase();

  if (code === 'SKE') {
    // SK에너지: 공식 레드 배경(#E11932) + 화이트 텍스트 SK
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#E11932] flex items-center justify-center text-white text-[11px] font-black shrink-0 shadow-2xs select-none"
        title="SK에너지"
      >
        SK
      </div>
    );
  }

  if (code === 'GSC') {
    // GS칼텍스: 공식 딥 틸 배경(#007F74) + 화이트 텍스트 GS
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#007F74] flex items-center justify-center text-white text-[11px] font-black shrink-0 shadow-2xs select-none"
        title="GS칼텍스"
      >
        GS
      </div>
    );
  }

  if (code === 'SOL') {
    // S-OIL: 공식 옐로우 배경(#FFC20E) + 포레스트 그린 텍스트 S-OIL
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#FFC20E] flex items-center justify-center text-[#00873C] text-[9px] font-black tracking-tighter shrink-0 shadow-2xs select-none"
        title="S-OIL"
      >
        S-OIL
      </div>
    );
  }

  if (code === 'HDO') {
    // HD현대오일뱅크: 공식 딥 네이비 배경(#002C5F) + 화이트 텍스트 HD
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#002C5F] flex items-center justify-center text-white text-[11px] font-black shrink-0 shadow-2xs select-none"
        title="HD현대오일뱅크"
      >
        HD
      </div>
    );
  }

  if (code === 'RTO' || code === 'NHO') {
    // 알뜰 / EX-OIL: 한국도로공사 공식 오렌지 배경(#F37021) + 화이트 텍스트 알뜰
    return (
      <div
        className="w-7 h-7 rounded-full bg-[#F37021] flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-2xs select-none"
        title={brandName || '알뜰주유소'}
      >
        알뜰
      </div>
    );
  }

  // 기타/자가상표: 슬레이트 그레이 배경(#64748B) + 화이트 주유기 아이콘
  return (
    <div
      className="w-7 h-7 rounded-full bg-slate-500 flex items-center justify-center text-white shrink-0 shadow-2xs select-none"
      title={brandName || '주유소'}
    >
      <Fuel className="w-3.5 h-3.5 text-white" />
    </div>
  );
};

// [태스크 1] 단일 진실 공급원(SSOT): 사용자 단말 실제 시각에 기반한 정확한 24시간제 ETA 산출
export const getAccurateEta = (durationMinutes: number): string => {
  const now = new Date();
  const arrivalTime = new Date(now.getTime() + Math.max(1, durationMinutes) * 60 * 1000);
  const hours = String(arrivalTime.getHours()).padStart(2, '0');
  const minutes = String(arrivalTime.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// [태스크 4] '안 1(표준 의전 관제형)' 멀티라인 단톡방 보고 템플릿
function formatGasStationReport(profile: DriverProfile, stationName: string, durationMinutes: number): string {
  let v = (profile.vehicleNo || '').trim();
  // Strip trailing '호차' from full plate (e.g. "4호차 142호 7811호차" -> "4호차 142호 7811")
  v = v.replace(/호차\s*$/, '').trim();

  let vehicleDisplay = '의전차량';
  if (v) {
    if (/^\d+$/.test(v)) {
      vehicleDisplay = `${v}호차`;
    } else if (v.includes('호차')) {
      vehicleDisplay = v;
    } else {
      vehicleDisplay = `${v}호차`;
    }
  }

  const dName = (profile.driverName || '').trim();
  let headerTag = vehicleDisplay;
  if (dName && !vehicleDisplay.includes(dName)) {
    headerTag = `${vehicleDisplay} ${dName}`;
  }

  const cleanEta = getAccurateEta(durationMinutes);

  return [
    `[${headerTag}]`,
    `• 운행목적: 차량 주유`,
    `• 목적지: ${stationName}`,
    `• ETA: ${cleanEta}`,
  ].join('\n');
}

export const GasStationModal: React.FC<GasStationModalProps> = ({
  isOpen,
  onClose,
  currentLat,
  currentLng,
  originId,
  defaultNavi,
  profile,
  onSelectStation,
}) => {
  const [sortFilter, setSortFilter] = useState<SortFilter>('FASTEST');
  const [stations, setStations] = useState<GasStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // [태스크 1] Fetch gas stations using real-time dynamic GPS coordinates
  const fetchGasStations = async (targetLat: number, targetLng: number) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const url = `/api/gas-stations?lat=${targetLat}&lng=${targetLng}&fuelType=all`;
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

  // Acquire on-device GPS location on mount/refresh, fallback to currentLat/currentLng
  const acquireLocationAndFetch = (forceGeolocation = false) => {
    setIsLoading(true);
    setErrorMsg(null);

    const isLiveGpsOrigin = originId === 'gps_current';
    if (!forceGeolocation && isLiveGpsOrigin && currentLat && currentLng) {
      setUserCoords({ lat: currentLat, lng: currentLng });
      fetchGasStations(currentLat, currentLng);
      return;
    }

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setUserCoords({ lat: latitude, lng: longitude });
          fetchGasStations(latitude, longitude);
        },
        (err) => {
          console.warn('Geolocation failed or denied, using dashboard coords:', err);
          setUserCoords({ lat: currentLat, lng: currentLng });
          fetchGasStations(currentLat, currentLng);
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0,
        }
      );
    } else {
      setUserCoords({ lat: currentLat, lng: currentLng });
      fetchGasStations(currentLat, currentLng);
    }
  };

  useEffect(() => {
    if (isOpen) {
      acquireLocationAndFetch();
    }
  }, [isOpen]);

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

  // Helper to copy report text to clipboard safely
  const copyReportToClipboard = (station: GasStation) => {
    const reportMessage = formatGasStationReport(profile, station.name, station.durationMinutes);
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
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  };

  // [태스크 3] 원스톱 내비 런처: 단톡방 보고 자동 복사 + 즉시 내비 딥링크 실행 + 대시보드 동기화
  const handleOneStopLaunch = (station: GasStation, e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.successPulse();

    // 1. 단톡방 보고 텍스트 자동 복사
    copyReportToClipboard(station);

    // 2. 대시보드 목적지 백그라운드 동기화
    onSelectStation(station, true);

    // 3. 즉시 설정된 내비게이션 앱 딥링크 실행
    launchNavigationApp(defaultNavi, {
      name: station.name,
      lat: station.lat,
      lng: station.lng,
    });

    onClose();
  };

  // 카드 터치 시: 단톡방 보고 자동 복사 + 대시보드 목적지 설정 + 모달 닫기
  const handleCardClick = (station: GasStation) => {
    haptics.lightTap();
    copyReportToClipboard(station);
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
        {/* [태스크 2] Header: 코발트 블루 스쿼클 아이콘 & 외부 API 브랜딩 전면 제거 */}
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

        {/* Filter Controls: [⚡ 가장 빠른 곳] vs [💰 최저가 순] (공급자 명칭 제거) */}
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
            onClick={() => acquireLocationAndFetch(true)}
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
                onClick={() => acquireLocationAndFetch(true)}
                className="text-xs text-[#1E60F3] font-bold underline cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : sortedStations.length === 0 ? (
            <div className="py-14 text-center text-slate-400 space-y-1">
              <p className="text-xs font-bold text-slate-600">인근에 검색된 주유소가 없습니다.</p>
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
                  {/* Top Row: [태스크 1] 28x28px 공식 브랜드 원형 텍스트 뱃지 + 주유소 상호명 + 추천 배지 */}
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
                  </div>

                  {/* [태스크 2] 3대 유종 올인원 가격 스트립 (순서: 휘발유 ➔ 경유 ➔ 고급휘발유) */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-3 divide-x divide-slate-100 text-center bg-slate-50/80 py-1.5 px-1 rounded-xl">
                    <div className="px-1">
                      <span className="block text-[10px] font-bold text-slate-400">휘발유</span>
                      <span className="text-xs font-black text-slate-800">
                        {station.prices?.gasoline ? `${station.prices.gasoline.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                    <div className="px-1">
                      <span className="block text-[10px] font-bold text-slate-400">경유</span>
                      <span className="text-xs font-black text-slate-800">
                        {station.prices?.diesel ? `${station.prices.diesel.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                    <div className="px-1">
                      <span className="block text-[10px] font-bold text-slate-400">고급휘발유</span>
                      <span className="text-xs font-black text-slate-800">
                        {station.prices?.premiumGasoline ? `${station.prices.premiumGasoline.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                  </div>

                  {/* [태스크 3] Bottom Row: 실시간 소요시간/거리 + [원스톱 내비 런처: 우상향 45도 화살표] */}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-xs">
                    <div className="text-slate-500 font-medium flex items-center gap-1.5">
                      <span className="font-black text-slate-900 text-sm">
                        약 {station.durationMinutes}분
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-semibold text-slate-600">{station.distanceKm} km</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[#1E60F3] font-bold">
                        {getAccurateEta(station.durationMinutes)} 도착
                      </span>
                    </div>

                    {/* 원형 내비 런처: 45도 우상향(북동쪽) 날렵한 화살표 */}
                    <button
                      type="button"
                      onClick={(e) => handleOneStopLaunch(station, e)}
                      className="w-10 h-10 rounded-full bg-[#1E60F3] hover:bg-[#1650D6] active:scale-90 flex items-center justify-center text-white shadow-md shadow-blue-500/20 transition-all shrink-0 cursor-pointer"
                      title="단톡방 보고 복사 & 길안내 즉시 시작"
                      aria-label="길안내 시작"
                    >
                      <Navigation className="w-4 h-4 fill-white" />
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
