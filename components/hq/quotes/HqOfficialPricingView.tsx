'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Car,
  Truck,
  Bus,
  Loader2,
  Calculator,
} from 'lucide-react';
import { OfficialPriceCard } from '@/types/officialPricingHq';
import { haptics } from '@/utils/haptics';

interface HqOfficialPricingViewProps {
  onOpenQuoteModal: (vehicleProductCode?: string) => void;
  onOpenChauffeurCard?: () => void;
}

export type CategoryTabId = 'all' | 'sedan' | 'suv' | 'van' | 'sprinter' | 'bus';

export interface PricingTableRow {
  vehicleProductCode: string;
  vehicleProductLabel: string;
  yearTrim: string;
  seats: string;
  imageUrl: string;
  dailyMetroKrw: number | null;
  dailyRegionalKrw: number | null;
  airportGimpoKrw: number | null;
  airportIncheonKrw: number | null;
  quoteRequired: boolean;
  category: CategoryTabId;
  categoryLabel: string;
}

/**
 * 2026 Canonical VIP Vehicle Pricing Data
 * Seat capacity formatted cleanly without redundant trims/years in the capacity column.
 */
const CANONICAL_VEHICLES: PricingTableRow[] = [
  // 1. Sedan
  {
    vehicleProductCode: 'benz_s560',
    vehicleProductLabel: '벤츠 S560',
    yearTrim: '2026년형',
    seats: '최대 3인',
    imageUrl: '/images/vehicles/s560.webp',
    dailyMetroKrw: 800000,
    dailyRegionalKrw: 900000,
    airportGimpoKrw: 350000,
    airportIncheonKrw: 400000,
    quoteRequired: false,
    category: 'sedan',
    categoryLabel: '세단',
  },
  {
    vehicleProductCode: 'genesis_g90_donghaeng',
    vehicleProductLabel: '제네시스 G90 리무진 롱휠',
    yearTrim: '2026년형',
    seats: '최대 3인',
    imageUrl: '/images/vehicles/g90_lwb.webp',
    dailyMetroKrw: 800000,
    dailyRegionalKrw: 900000,
    airportGimpoKrw: 350000,
    airportIncheonKrw: 400000,
    quoteRequired: false,
    category: 'sedan',
    categoryLabel: '세단',
  },
  {
    vehicleProductCode: 'genesis_g90_standard',
    vehicleProductLabel: '제네시스 G90 신차 최고급형',
    yearTrim: '2026년형',
    seats: '최대 3인',
    imageUrl: '/images/vehicles/g90_black.webp',
    dailyMetroKrw: 550000,
    dailyRegionalKrw: 600000,
    airportGimpoKrw: 220000,
    airportIncheonKrw: 250000,
    quoteRequired: false,
    category: 'sedan',
    categoryLabel: '세단',
  },

  // 2. SUV
  {
    vehicleProductCode: 'genesis_gv80_new',
    vehicleProductLabel: '제네시스 GV80 신차',
    yearTrim: '2026년형',
    seats: '최대 4인',
    imageUrl: '/images/vehicles/gv80.webp',
    dailyMetroKrw: 500000,
    dailyRegionalKrw: 550000,
    airportGimpoKrw: 200000,
    airportIncheonKrw: 230000,
    quoteRequired: false,
    category: 'suv',
    categoryLabel: 'SUV',
  },

  // 3. Van
  {
    vehicleProductCode: 'hyundai_staria_lounge_limo',
    vehicleProductLabel: '현대 스타리아 라운지 리무진 최고급형',
    yearTrim: '2026년형',
    seats: '7~9인',
    imageUrl: '/images/vehicles/staria.webp',
    dailyMetroKrw: 430000,
    dailyRegionalKrw: 480000,
    airportGimpoKrw: 200000,
    airportIncheonKrw: 220000,
    quoteRequired: false,
    category: 'van',
    categoryLabel: '밴',
  },
  {
    vehicleProductCode: 'kia_carnival_hi_limo',
    vehicleProductLabel: '기아 카니발 하이리무진 최고급형',
    yearTrim: '2026년형',
    seats: '최대 4~7인',
    imageUrl: '/images/vehicles/carnival_high.webp',
    dailyMetroKrw: 430000,
    dailyRegionalKrw: 480000,
    airportGimpoKrw: 200000,
    airportIncheonKrw: 220000,
    quoteRequired: false,
    category: 'van',
    categoryLabel: '밴',
  },

  // 4. Sprinter
  {
    vehicleProductCode: 'sprinter_319_new_6seat',
    vehicleProductLabel: '벤츠 스프린터 319 신차',
    yearTrim: '2026년형',
    seats: '6인승',
    imageUrl: '/images/vehicles/sprinter_319.webp',
    dailyMetroKrw: 800000,
    dailyRegionalKrw: 900000,
    airportGimpoKrw: 350000,
    airportIncheonKrw: 400000,
    quoteRequired: false,
    category: 'sprinter',
    categoryLabel: '스프린터',
  },
  {
    vehicleProductCode: 'sprinter_519_business',
    vehicleProductLabel: '벤츠 스프린터 519 비즈니스',
    yearTrim: '2026년형',
    seats: '15~16인',
    imageUrl: '/images/vehicles/sprinter_519.webp',
    dailyMetroKrw: 700000,
    dailyRegionalKrw: 800000,
    airportGimpoKrw: 300000,
    airportIncheonKrw: 350000,
    quoteRequired: false,
    category: 'sprinter',
    categoryLabel: '스프린터',
  },
  {
    vehicleProductCode: 'sprinter_519_business_premium',
    vehicleProductLabel: '벤츠 스프린터 519 비즈니스 최고급',
    yearTrim: '2026년형',
    seats: '15~16인',
    imageUrl: '/images/vehicles/sprinter_519.webp',
    dailyMetroKrw: 800000,
    dailyRegionalKrw: 900000,
    airportGimpoKrw: 350000,
    airportIncheonKrw: 400000,
    quoteRequired: false,
    category: 'sprinter',
    categoryLabel: '스프린터',
  },
  {
    vehicleProductCode: 'sprinter_519_shuttle_premium',
    vehicleProductLabel: '벤츠 스프린터 519 셔틀 최고급',
    yearTrim: '2026년형',
    seats: '15~16인',
    imageUrl: '/images/vehicles/sprinter_519.webp',
    dailyMetroKrw: 800000,
    dailyRegionalKrw: 900000,
    airportGimpoKrw: 350000,
    airportIncheonKrw: 400000,
    quoteRequired: false,
    category: 'sprinter',
    categoryLabel: '스프린터',
  },
  {
    vehicleProductCode: 'sprinter_519_shuttle_standard',
    vehicleProductLabel: '벤츠 스프린터 519 셔틀 일반',
    yearTrim: '2026년형',
    seats: '15~16인',
    imageUrl: '/images/vehicles/sprinter_519.webp',
    dailyMetroKrw: 700000,
    dailyRegionalKrw: 800000,
    airportGimpoKrw: 300000,
    airportIncheonKrw: 350000,
    quoteRequired: false,
    category: 'sprinter',
    categoryLabel: '스프린터',
  },
  {
    vehicleProductCode: 'sprinter_519_premium',
    vehicleProductLabel: '벤츠 스프린터 519 최고급형',
    yearTrim: '2026년형',
    seats: '최대 16인',
    imageUrl: '/images/vehicles/sprinter_519.webp',
    dailyMetroKrw: 800000,
    dailyRegionalKrw: 900000,
    airportGimpoKrw: 350000,
    airportIncheonKrw: 400000,
    quoteRequired: false,
    category: 'sprinter',
    categoryLabel: '스프린터',
  },
  {
    vehicleProductCode: 'sprinter_519_standard',
    vehicleProductLabel: '벤츠 스프린터 리무진 519 일반형',
    yearTrim: '2026년형',
    seats: '15~16인',
    imageUrl: '/images/vehicles/sprinter_519.webp',
    dailyMetroKrw: 700000,
    dailyRegionalKrw: 800000,
    airportGimpoKrw: 350000,
    airportIncheonKrw: 400000,
    quoteRequired: false,
    category: 'sprinter',
    categoryLabel: '스프린터',
  },

  // 5. Bus
  {
    vehicleProductCode: 'bus_45',
    vehicleProductLabel: '버스',
    yearTrim: '2026년형',
    seats: '45인승',
    imageUrl: '/images/vehicles/bus.webp',
    dailyMetroKrw: null,
    dailyRegionalKrw: null,
    airportGimpoKrw: null,
    airportIncheonKrw: null,
    quoteRequired: true,
    category: 'bus',
    categoryLabel: '버스',
  },
  {
    vehicleProductCode: 'bus_limo_28',
    vehicleProductLabel: '리무진 버스',
    yearTrim: '2026년형',
    seats: '28인승',
    imageUrl: '/images/vehicles/bus.webp',
    dailyMetroKrw: null,
    dailyRegionalKrw: null,
    airportGimpoKrw: null,
    airportIncheonKrw: null,
    quoteRequired: true,
    category: 'bus',
    categoryLabel: '버스',
  },
  {
    vehicleProductCode: 'bus_premium_22',
    vehicleProductLabel: '프리미엄 럭셔리 리무진 버스',
    yearTrim: '2026년형',
    seats: '22인승',
    imageUrl: '/images/vehicles/bus.webp',
    dailyMetroKrw: null,
    dailyRegionalKrw: null,
    airportGimpoKrw: null,
    airportIncheonKrw: null,
    quoteRequired: true,
    category: 'bus',
    categoryLabel: '버스',
  },
];

const CATEGORY_TABS: { id: CategoryTabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'all', label: '전체', icon: Car },
  { id: 'sedan', label: '세단', icon: Car },
  { id: 'suv', label: 'SUV', icon: Car },
  { id: 'van', label: '밴', icon: Truck },
  { id: 'sprinter', label: '스프린터', icon: Truck },
  { id: 'bus', label: '버스', icon: Bus },
];

export const HqOfficialPricingView: React.FC<HqOfficialPricingViewProps> = ({
  onOpenQuoteModal,
}) => {
  const [activeTab, setActiveTab] = useState<CategoryTabId>('all');
  const [cards, setCards] = useState<OfficialPriceCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchOfficialData = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/hq/official-pricing');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || '공식 요금표를 불러오지 못했습니다.');
        }
        if (isMounted) {
          setCards(data.cards || []);
        }
      } catch (err: any) {
        console.warn('[HqOfficialPricingView] Notice:', err.message);
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchOfficialData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Merge live Supabase price cards with canonical pricing items
  const allMergedVehicles = useMemo(() => {
    return CANONICAL_VEHICLES.map((item) => {
      const liveCard = cards.find(
        (c) => c.vehicleProductCode.toLowerCase() === item.vehicleProductCode.toLowerCase()
      );
      if (!liveCard) return item;
      return {
        ...item,
        dailyMetroKrw: liveCard.dailyMetroKrw !== undefined ? liveCard.dailyMetroKrw : item.dailyMetroKrw,
        dailyRegionalKrw: liveCard.dailyRegionalKrw !== undefined ? liveCard.dailyRegionalKrw : item.dailyRegionalKrw,
        airportGimpoKrw: liveCard.airportGimpoKrw !== undefined ? liveCard.airportGimpoKrw : item.airportGimpoKrw,
        airportIncheonKrw: liveCard.airportIncheonKrw !== undefined ? liveCard.airportIncheonKrw : item.airportIncheonKrw,
        quoteRequired: Boolean(liveCard.quoteRequired ?? item.quoteRequired),
      };
    });
  }, [cards]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: allMergedVehicles.length,
      sedan: allMergedVehicles.filter((v) => v.category === 'sedan').length,
      suv: allMergedVehicles.filter((v) => v.category === 'suv').length,
      van: allMergedVehicles.filter((v) => v.category === 'van').length,
      sprinter: allMergedVehicles.filter((v) => v.category === 'sprinter').length,
      bus: allMergedVehicles.filter((v) => v.category === 'bus').length,
    };
  }, [allMergedVehicles]);

  // Filtered displayed vehicles based on active pill tab
  const displayedVehicles = useMemo(() => {
    if (activeTab === 'all') return allMergedVehicles;
    return allMergedVehicles.filter((v) => v.category === activeTab);
  }, [allMergedVehicles, activeTab]);

  if (isLoading && cards.length === 0) {
    return (
      <div className="py-24 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
        <Loader2 className="w-8 h-8 mx-auto text-[#1E60F3] animate-spin mb-3" />
        <p className="font-extrabold text-sm text-slate-700">2026 공식 요율표 로드 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-bold">
          ⚠️ {error} (로컬 캐시 표준 요율표를 표시합니다)
        </div>
      )}

      {/* 1. Top Segmented Capsule Tabs & Action Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:px-5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        {/* Category Pill Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {CATEGORY_TABS.map((tab) => {
            const isSelected = activeTab === tab.id;
            const count = tabCounts[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setActiveTab(tab.id);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isSelected
                  ? 'bg-blue-50 text-[#1E60F3] border border-blue-200 shadow-2xs font-bold'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[11px] ${isSelected ? 'font-black text-[#1E60F3]' : 'text-slate-400 font-medium'
                    }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Quote Calculator Trigger */}
        <button
          type="button"
          onClick={() => onOpenQuoteModal()}
          className="px-4 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ml-auto"
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>견적서 작성</span>
        </button>
      </div>

      {/* 2. Unified Pricing Table (Single Clean Table Container) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] sm:text-xs font-bold text-slate-700 select-none">
                <th className="py-3.5 px-5 font-bold text-slate-800 text-left min-w-[240px]">
                  차량명
                </th>
                <th className="py-3.5 px-3 font-bold text-slate-800 text-center min-w-[80px]">
                  좌석
                </th>
                <th className="py-3.5 px-3 font-bold text-slate-800 text-center min-w-[110px]">
                  수도권 (9시간)
                </th>
                <th className="py-3.5 px-3 font-bold text-slate-800 text-center min-w-[110px]">
                  지방 (9시간)
                </th>
                <th className="py-3.5 px-3 font-bold text-slate-800 text-center min-w-[110px]">
                  김포공항 편도
                </th>
                <th className="py-3.5 px-3 font-bold text-slate-800 text-center min-w-[110px]">
                  인천공항 편도
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {displayedVehicles.map((item) => (
                <tr
                  key={item.vehicleProductCode}
                  onClick={() => {
                    haptics.lightTap();
                    onOpenQuoteModal(item.vehicleProductCode);
                  }}
                  className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  title="클릭하여 이 차량으로 견적서 작성"
                >
                  {/* 1. 차량명 (썸네일 + 라벨 + 서브텍스트 연식) */}
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-9 shrink-0 flex items-center justify-center bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                        <img
                          src={item.imageUrl}
                          alt={item.vehicleProductLabel}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/images/vehicles/bus.webp';
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-[13px] font-bold text-slate-900 group-hover:text-[#1E60F3] transition-colors">
                            {item.vehicleProductLabel}
                          </span>
                          {activeTab === 'all' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200/80">
                              {item.categoryLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {item.yearTrim}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 2. 좌석 (탑승 인원 수로만 명확히 통일) */}
                  <td className="py-3.5 px-3 text-center text-xs font-semibold text-slate-700 whitespace-nowrap">
                    {item.seats}
                  </td>

                  {/* 3~6. 요금 4개 열 (버스는 하이픈 4번 대신 별도 상담 전화 아이콘 표시) */}
                  {item.quoteRequired ? (
                    <td colSpan={4} className="py-3.5 px-3 text-center bg-slate-50/50">
                      <div className="inline-flex items-center justify-center group/call cursor-pointer" title="별도 상담 (전화 문의)">
                        <img
                          src="/images/icons/call.png"
                          alt="별도 상담"
                          className="w-10 h-10 object-contain transition-transform duration-200 group-hover/call:scale-125 drop-shadow-xs"
                        />
                      </div>
                    </td>
                  ) : (
                    <>
                      {/* 수도권 (9시간) */}
                      <td className="py-3.5 px-3 text-center text-xs sm:text-[13px] font-extrabold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {item.dailyMetroKrw !== null ? `${item.dailyMetroKrw.toLocaleString()}원` : '-'}
                      </td>

                      {/* 지방 (9시간) */}
                      <td className="py-3.5 px-3 text-center text-xs sm:text-[13px] font-extrabold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {item.dailyRegionalKrw !== null ? `${item.dailyRegionalKrw.toLocaleString()}원` : '-'}
                      </td>

                      {/* 김포공항 편도 */}
                      <td className="py-3.5 px-3 text-center text-xs sm:text-[13px] font-extrabold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {item.airportGimpoKrw !== null ? `${item.airportGimpoKrw.toLocaleString()}원` : '-'}
                      </td>

                      {/* 인천공항 편도 */}
                      <td className="py-3.5 px-3 text-center text-xs sm:text-[13px] font-extrabold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {item.airportIncheonKrw !== null ? `${item.airportIncheonKrw.toLocaleString()}원` : '-'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
