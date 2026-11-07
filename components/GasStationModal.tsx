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

// [태스크 1] 5대 정유사 36x36px 공식 브랜드 컬러 원형 텍스트 뱃지
const BrandEmblem: React.FC<{ brandCode: string; brandName: string }> = ({ brandCode, brandName }) => {
  const code = (brandCode || '').toUpperCase();

  if (code === 'SKE') {
    // SK에너지: 공식 레드 배경(#E11932) + 화이트 텍스트 SK
    return (
      <div
        className="w-9 h-9 rounded-full bg-[#E11932] flex items-center justify-center text-white text-[12px] font-black shrink-0 shadow-2xs select-none"
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
        className="w-9 h-9 rounded-full bg-[#007F74] flex items-center justify-center text-white text-[12px] font-black shrink-0 shadow-2xs select-none"
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
        className="w-9 h-9 rounded-full bg-[#FFC20E] flex items-center justify-center text-[#00873C] text-[10px] font-black tracking-tighter shrink-0 shadow-2xs select-none"
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
        className="w-9 h-9 rounded-full bg-[#002C5F] flex items-center justify-center text-white text-[12px] font-black shrink-0 shadow-2xs select-none"
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
        className="w-9 h-9 rounded-full bg-[#F37021] flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-2xs select-none"
        title={brandName || '알뜰주유소'}
      >
        알뜰
      </div>
    );
  }

  // 기타/자가상표: 슬레이트 그레이 배경(#64748B) + 화이트 주유기 아이콘
  return (
    <div
      className="w-9 h-9 rounded-full bg-slate-500 flex items-center justify-center text-white shrink-0 shadow-2xs select-none"
      title={brandName || '주유소'}
    >
      <Fuel className="w-4 h-4 text-white" />
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm driver-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md bg-[#F6F8FC] border border-slate-100 rounded-3xl shadow-2xl overflow-hidden text-slate-900 flex flex-col max-h-[90vh] driver-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* [태스크 2] Header: 주유소 아이콘 유지 & 깔끔한 모달 헤더 */}
        <div className="px-5 py-4 bg-[#F6F8FC] border-b border-slate-200/60 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <img
              src="/images/icons/expense_driver/icon-expense-fuel.png"
              alt="주유소 아이콘"
              className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 select-none"
              draggable={false}
            />
            <div>
              <h3 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight">실시간 주유소 추천</h3>
              <p className="text-[12px] text-slate-500 font-medium mt-0.5">반경 3km 내 가장 저렴한 주유소와 도착 시간</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-200/60 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer transition-colors"
            title="닫기"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls: [⚡ 가장 빠른 곳] vs [₩ 최저가 순] */}
        <div className="px-5 pt-4 pb-2 bg-[#F6F8FC] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setSortFilter('FASTEST');
              }}
              className={`px-4 py-2.5 rounded-full text-[14px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                sortFilter === 'FASTEST'
                  ? 'bg-[#0055FF] text-white shadow-[0_4px_12px_rgba(0,85,255,0.22)]'
                  : 'bg-[#EEF2F8] text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              <Zap
                className={`w-4 h-4 ${
                  sortFilter === 'FASTEST' ? 'text-[#FFE600] fill-[#FFE600]' : 'text-slate-500'
                }`}
              />
              <span>가장 빠른 곳</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setSortFilter('CHEAPEST');
              }}
              className={`px-4 py-2.5 rounded-full text-[14px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                sortFilter === 'CHEAPEST'
                  ? 'bg-[#0055FF] text-white shadow-[0_4px_12px_rgba(0,85,255,0.22)]'
                  : 'bg-[#EEF2F8] text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              <span className="font-black text-[14px] leading-none">₩</span>
              <span>최저가 순</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => acquireLocationAndFetch(true)}
            disabled={isLoading}
            className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-200/60 cursor-pointer disabled:opacity-50 transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#0055FF]' : ''}`} />
          </button>
        </div>

        {/* Station Card List */}
        <div className="px-5 py-3 overflow-y-auto space-y-3.5 flex-1 overscroll-contain">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-2.5 text-slate-400 bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
              <RefreshCw className="w-7 h-7 animate-spin text-[#0055FF]" />
              <p className="text-[14px] font-bold text-slate-700">인근 주유소 및 실시간 경로 분석 중...</p>
              <p className="text-[12px] text-slate-400">3대 유종 유가 및 도로 교통정보 결합 중</p>
            </div>
          ) : errorMsg ? (
            <div className="py-14 text-center space-y-2 bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
              <AlertCircle className="w-7 h-7 text-rose-500 mx-auto" />
              <p className="text-[14px] font-bold text-slate-700">{errorMsg}</p>
              <button
                type="button"
                onClick={() => acquireLocationAndFetch(true)}
                className="text-[14px] text-[#0055FF] font-bold underline cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : sortedStations.length === 0 ? (
            <div className="py-14 text-center text-slate-400 space-y-1 bg-white rounded-3xl border border-slate-100/90 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
              <p className="text-[14px] font-bold text-slate-600">인근에 검색된 주유소가 없습니다.</p>
              <p className="text-[12px]">잠시 후 다시 새로고침해 주세요.</p>
            </div>
          ) : (
            sortedStations.map((station, idx) => {
              const isBest = idx === 0;

              return (
                <div
                  key={station.id}
                  onClick={() => handleCardClick(station)}
                  className="p-4 rounded-3xl bg-white border border-slate-100/90 shadow-[0_4px_16px_rgba(15,23,42,0.04)] hover:border-blue-200 transition-all cursor-pointer active:scale-[0.99]"
                >
                  {/* Top Row: 공식 브랜드 원형 텍스트 뱃지 + 주유소 상호명 + 실시간 최저 배지 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <BrandEmblem brandCode={station.brandCode} brandName={station.brandName} />
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <h4 className="text-[16px] font-black text-slate-900 truncate tracking-tight">
                          {station.name}
                        </h4>
                        {isBest && (
                          <span className="text-[11px] font-extrabold bg-[#EBF3FF] text-[#0055FF] px-2.5 py-1 rounded-full shrink-0">
                            실시간 최저
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3대 유종 올인원 가격 스트립 (휘발유 ➔ 경유 ➔ 고급휘발유) */}
                  <div className="mt-3.5 grid grid-cols-3 divide-x divide-slate-200/70 text-center bg-[#F8FAFC] py-3 px-1 rounded-2xl">
                    <div className="px-1">
                      <span className="block text-[12px] font-semibold text-slate-400 mb-1">휘발유</span>
                      <span className="text-[16px] font-black text-slate-900 tracking-tight">
                        {station.prices?.gasoline ? `${station.prices.gasoline.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                    <div className="px-1">
                      <span className="block text-[12px] font-semibold text-slate-400 mb-1">경유</span>
                      <span className="text-[16px] font-black text-slate-900 tracking-tight">
                        {station.prices?.diesel ? `${station.prices.diesel.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                    <div className="px-1">
                      <span className="block text-[12px] font-semibold text-slate-400 mb-1">고급휘발유</span>
                      <span className="text-[16px] font-black text-slate-900 tracking-tight">
                        {station.prices?.premiumGasoline ? `${station.prices.premiumGasoline.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: 실시간 소요시간/거리 + 원스톱 내비 런처 */}
                  <div className="flex items-center justify-between mt-3.5 text-[14px]">
                    <div className="text-slate-500 font-medium flex items-center gap-1.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 text-slate-400 shrink-0"
                      >
                        <circle cx="6" cy="19" r="3" />
                        <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
                        <circle cx="18" cy="5" r="3" />
                      </svg>
                      <span className="font-extrabold text-slate-900">
                        약 {station.durationMinutes}분
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-medium text-slate-500">{station.distanceKm} km</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-[#0055FF] font-extrabold">
                        {getAccurateEta(station.durationMinutes)} 도착
                      </span>
                    </div>

                    {/* 원형 내비 런처 */}
                    <button
                      type="button"
                      onClick={(e) => handleOneStopLaunch(station, e)}
                      className="w-11 h-11 rounded-full bg-[#0055FF] hover:bg-[#0044CC] active:scale-90 flex items-center justify-center text-white shadow-[0_4px_12px_rgba(0,85,255,0.25)] transition-all shrink-0 cursor-pointer"
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
        <div className="py-3.5 px-5 bg-[#F6F8FC] border-t border-slate-200/60 text-center shrink-0">
          <p className="text-[11px] text-slate-400 font-medium">
            가격은 실시간 변동될 수 있으며, 주유소 사정에 따라 도착 시간이 달라질 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
};
