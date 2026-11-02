'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Car,
  Truck,
  Bus,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { OfficialPriceCard } from '@/types/officialPricingHq';

interface HqOfficialPricingViewProps {
  onOpenQuoteModal: (vehicleProductCode?: string) => void;
  onOpenChauffeurCard: () => void;
}

interface PricingTableRow {
  vehicleProductCode: string;
  vehicleProductLabel: string;
  capacityNote: string;
  imageUrl: string;
  dailyMetroKrw: number | null;
  dailyRegionalKrw: number | null;
  airportGimpoKrw: number | null;
  airportIncheonKrw: number | null;
  quoteRequired: boolean;
}

interface PricingCategoryGroup {
  id: 'sedan' | 'suv' | 'van' | 'sprinter' | 'bus';
  label: string;
  icon: 'sedan' | 'suv' | 'van' | 'sprinter' | 'bus';
  items: PricingTableRow[];
}

/**
 * 2026 Canonical VIP Vehicle Categories & Pricing Data matching Owner's Reference Layout
 */
const CANONICAL_PRICING_GROUPS: PricingCategoryGroup[] = [
  {
    id: 'sedan',
    label: '세단',
    icon: 'sedan',
    items: [
      {
        vehicleProductCode: 'benz_s560',
        vehicleProductLabel: '벤츠 S560',
        capacityNote: '최대 3인',
        imageUrl: '/images/vehicles/s560.webp',
        dailyMetroKrw: 800000,
        dailyRegionalKrw: 900000,
        airportGimpoKrw: 350000,
        airportIncheonKrw: 400000,
        quoteRequired: false,
      },
      {
        vehicleProductCode: 'genesis_g90_donghaeng',
        vehicleProductLabel: '제네시스 G90 리무진 (동행)',
        capacityNote: '최대 9인',
        imageUrl: '/images/vehicles/g90_lwb.webp',
        dailyMetroKrw: 800000,
        dailyRegionalKrw: 900000,
        airportGimpoKrw: 350000,
        airportIncheonKrw: 400000,
        quoteRequired: false,
      },
      {
        vehicleProductCode: 'genesis_g90_standard',
        vehicleProductLabel: '제네시스 G90 신차 최고급형',
        capacityNote: '최대 9인',
        imageUrl: '/images/vehicles/g90_black.webp',
        dailyMetroKrw: 550000,
        dailyRegionalKrw: 600000,
        airportGimpoKrw: 220000,
        airportIncheonKrw: 250000,
        quoteRequired: false,
      },
    ],
  },
  {
    id: 'suv',
    label: 'SUV',
    icon: 'suv',
    items: [
      {
        vehicleProductCode: 'genesis_gv80_new',
        vehicleProductLabel: '제네시스 GV80 신차',
        capacityNote: '최대 6인',
        imageUrl: '/images/vehicles/gv80.webp',
        dailyMetroKrw: 500000,
        dailyRegionalKrw: 550000,
        airportGimpoKrw: 200000,
        airportIncheonKrw: 230000,
        quoteRequired: false,
      },
    ],
  },
  {
    id: 'van',
    label: '밴',
    icon: 'van',
    items: [
      {
        vehicleProductCode: 'hyundai_staria_lounge_limo',
        vehicleProductLabel: '현대 스타리아 라운지 리무진 최고급형',
        capacityNote: '7~9인',
        imageUrl: '/images/vehicles/staria.webp',
        dailyMetroKrw: 430000,
        dailyRegionalKrw: 480000,
        airportGimpoKrw: 200000,
        airportIncheonKrw: 220000,
        quoteRequired: false,
      },
      {
        vehicleProductCode: 'kia_carnival_hi_limo',
        vehicleProductLabel: '기아 카니발 하이리무진 최고급형',
        capacityNote: '최대 4~7인',
        imageUrl: '/images/vehicles/carnival_high.webp',
        dailyMetroKrw: 430000,
        dailyRegionalKrw: 480000,
        airportGimpoKrw: 200000,
        airportIncheonKrw: 220000,
        quoteRequired: false,
      },
    ],
  },
  {
    id: 'sprinter',
    label: '스프린터',
    icon: 'sprinter',
    items: [
      {
        vehicleProductCode: 'sprinter_319_new_6seat',
        vehicleProductLabel: '벤츠 스프린터 319 신차',
        capacityNote: '최대 16인',
        imageUrl: '/images/vehicles/sprinter_319.webp',
        dailyMetroKrw: 800000,
        dailyRegionalKrw: 900000,
        airportGimpoKrw: 350000,
        airportIncheonKrw: 400000,
        quoteRequired: false,
      },
      {
        vehicleProductCode: 'sprinter_519_business',
        vehicleProductLabel: '벤츠 스프린터 519 비즈니스',
        capacityNote: '15~16인',
        imageUrl: '/images/vehicles/sprinter_519.webp',
        dailyMetroKrw: 700000,
        dailyRegionalKrw: 800000,
        airportGimpoKrw: 300000,
        airportIncheonKrw: 350000,
        quoteRequired: false,
      },
      {
        vehicleProductCode: 'sprinter_519_premium',
        vehicleProductLabel: '벤츠 스프린터 519 최고급형',
        capacityNote: '최대 16인',
        imageUrl: '/images/vehicles/sprinter_519.webp',
        dailyMetroKrw: 800000,
        dailyRegionalKrw: 900000,
        airportGimpoKrw: 350000,
        airportIncheonKrw: 400000,
        quoteRequired: false,
      },
      {
        vehicleProductCode: 'sprinter_519_standard',
        vehicleProductLabel: '벤츠 스프린터 리무진 519 일반형',
        capacityNote: '15~16인',
        imageUrl: '/images/vehicles/sprinter_519.webp',
        dailyMetroKrw: 700000,
        dailyRegionalKrw: 800000,
        airportGimpoKrw: 350000,
        airportIncheonKrw: 400000,
        quoteRequired: false,
      },
    ],
  },
  {
    id: 'bus',
    label: '버스',
    icon: 'bus',
    items: [
      {
        vehicleProductCode: 'bus_45',
        vehicleProductLabel: '버스',
        capacityNote: '45인승',
        imageUrl: '/images/vehicles/bus.webp',
        dailyMetroKrw: null,
        dailyRegionalKrw: null,
        airportGimpoKrw: null,
        airportIncheonKrw: null,
        quoteRequired: true,
      },
      {
        vehicleProductCode: 'bus_limo_28',
        vehicleProductLabel: '리무진 버스',
        capacityNote: '28인승',
        imageUrl: '/images/vehicles/bus.webp',
        dailyMetroKrw: null,
        dailyRegionalKrw: null,
        airportGimpoKrw: null,
        airportIncheonKrw: null,
        quoteRequired: true,
      },
      {
        vehicleProductCode: 'bus_premium_22',
        vehicleProductLabel: '프리미엄 럭셔리 리무진 버스',
        capacityNote: '22인승',
        imageUrl: '/images/vehicles/bus.webp',
        dailyMetroKrw: null,
        dailyRegionalKrw: null,
        airportGimpoKrw: null,
        airportIncheonKrw: null,
        quoteRequired: true,
      },
    ],
  },
];

export const HqOfficialPricingView: React.FC<HqOfficialPricingViewProps> = ({
  onOpenQuoteModal,
}) => {
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

  // Merge live Supabase price cards with canonical category groups
  const categoryGroups = useMemo(() => {
    return CANONICAL_PRICING_GROUPS.map((group) => {
      const mergedItems = group.items.map((item) => {
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
          capacityNote: liveCard.capacityNote || item.capacityNote,
          vehicleProductLabel: liveCard.vehicleProductLabel || item.vehicleProductLabel,
        };
      });

      return {
        ...group,
        items: mergedItems,
      };
    });
  }, [cards]);

  const renderCategoryIcon = (iconType: 'sedan' | 'suv' | 'van' | 'sprinter' | 'bus') => {
    switch (iconType) {
      case 'sedan':
        return <Car className="w-5 h-5 text-slate-800" />;
      case 'suv':
        return <Car className="w-5 h-5 text-slate-800" />;
      case 'van':
      case 'sprinter':
        return <Truck className="w-5 h-5 text-slate-800" />;
      case 'bus':
        return <Bus className="w-5 h-5 text-slate-800" />;
      default:
        return <Car className="w-5 h-5 text-slate-800" />;
    }
  };

  if (isLoading && cards.length === 0) {
    return (
      <div className="py-24 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
        <Loader2 className="w-8 h-8 mx-auto text-[#1E60F3] animate-spin mb-3" />
        <p className="font-extrabold text-sm text-slate-700">2026 공식 요율표 로드 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-bold">
          ⚠️ {error} (로컬 캐시 표준 요율표를 표시합니다)
        </div>
      )}

      {/* 5 Categorized Pricing Tables Matching Reference Image */}
      {categoryGroups.map((group) => (
        <div key={group.id} className="space-y-2.5">
          {/* Category Header */}
          <div className="flex items-center gap-2 px-1">
            {renderCategoryIcon(group.icon)}
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
              {group.label}
            </h3>
            <span className="text-[11px] font-bold text-slate-600 bg-slate-100/90 px-2.5 py-0.5 rounded-full border border-slate-200/60 ml-0.5">
              총 {group.items.length}개 차량
            </span>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-slate-200/80 text-[11px] sm:text-xs font-bold text-slate-800">
                    <th className="py-3 px-4 font-bold text-slate-800 text-left min-w-[240px]">
                      차량명
                    </th>
                    <th className="py-3 px-3 font-bold text-slate-800 text-center min-w-[75px]">
                      좌석
                    </th>
                    <th className="py-3 px-3 font-bold text-slate-800 text-center min-w-[100px]">
                      수도권 9시간
                    </th>
                    <th className="py-3 px-3 font-bold text-slate-800 text-center min-w-[100px]">
                      지방 9시간
                    </th>
                    <th className="py-3 px-3 font-bold text-slate-800 text-center min-w-[100px]">
                      공항 편도 김포
                    </th>
                    <th className="py-3 px-3 font-bold text-slate-800 text-center min-w-[100px]">
                      공항 편도 인천
                    </th>
                    <th className="py-3 px-3 font-bold text-slate-800 text-center min-w-[80px]">
                      상태
                    </th>
                    <th className="py-3 px-4 font-bold text-slate-800 text-center min-w-[85px]">
                      액션
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {group.items.map((item) => (
                    <tr
                      key={item.vehicleProductCode}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* 차량명 (썸네일 이미지 + 차량 라벨) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-9 shrink-0 flex items-center justify-center bg-slate-50/50 rounded-lg p-0.5">
                            <img
                              src={item.imageUrl}
                              alt={item.vehicleProductLabel}
                              className="max-w-full max-h-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/images/vehicles/bus.webp';
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs sm:text-[13px] font-bold text-slate-900">
                              {item.vehicleProductLabel}
                            </span>
                            {item.quoteRequired && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FFF7ED] text-[#EA580C] border border-[#FFEDD5] whitespace-nowrap">
                                가격 상담
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 좌석 */}
                      <td className="py-3.5 px-3 text-center text-xs font-medium text-slate-700 whitespace-nowrap">
                        {item.capacityNote}
                      </td>

                      {/* 수도권 9시간 */}
                      <td className="py-3.5 px-3 text-center text-xs sm:text-[13px] font-extrabold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {item.dailyMetroKrw !== null ? `${item.dailyMetroKrw.toLocaleString()}원` : '-'}
                      </td>

                      {/* 지방 9시간 */}
                      <td className="py-3.5 px-3 text-center text-xs sm:text-[13px] font-extrabold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {item.dailyRegionalKrw !== null ? `${item.dailyRegionalKrw.toLocaleString()}원` : '-'}
                      </td>

                      {/* 공항 편도 김포 */}
                      <td className="py-3.5 px-3 text-center text-xs sm:text-[13px] font-extrabold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {item.airportGimpoKrw !== null ? `${item.airportGimpoKrw.toLocaleString()}원` : '-'}
                      </td>

                      {/* 공항 편도 인천 */}
                      <td className="py-3.5 px-3 text-center text-xs sm:text-[13px] font-extrabold text-slate-900 font-mono tracking-tight whitespace-nowrap">
                        {item.airportIncheonKrw !== null ? `${item.airportIncheonKrw.toLocaleString()}원` : '-'}
                      </td>

                      {/* 상태 */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {item.quoteRequired ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#FFF7ED] text-[#EA580C] border border-[#FFEDD5]">
                            가격 상담
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#EFF6FF] text-[#1E60F3] border border-[#BFDBFE]">
                            확정 요율
                          </span>
                        )}
                      </td>

                      {/* 액션 */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenQuoteModal(item.vehicleProductCode)}
                          className="inline-flex items-center gap-0.5 text-xs font-bold text-[#1E60F3] hover:underline cursor-pointer transition-all"
                        >
                          <span>{item.quoteRequired ? '견적 상담' : '견적 산출'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
