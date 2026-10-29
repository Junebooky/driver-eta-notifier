'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Calculator,
  ShieldAlert,
  Car,
  Clock,
  MapPin,
  Plane,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Layers,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { OfficialPriceCard, OfficialPriceRule } from '@/types/officialPricingHq';
import { STANDARD_VEHICLE_SKU_MAPPINGS } from '@/lib/pricing/officialPricingService';

interface HqOfficialPricingViewProps {
  onOpenQuoteModal: () => void;
  onOpenChauffeurCard: () => void;
}

export const HqOfficialPricingView: React.FC<HqOfficialPricingViewProps> = ({
  onOpenQuoteModal,
  onOpenChauffeurCard,
}) => {
  const [activeTab, setActiveTab] = useState<'cards' | 'mapping' | 'rules'>('cards');
  const [cards, setCards] = useState<OfficialPriceCard[]>([]);
  const [rules, setRules] = useState<OfficialPriceRule[]>([]);
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
          setRules(data.rules || []);
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

  return (
    <div className="space-y-6">
      {/* 1. Official Tariff Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-3xl border border-slate-700/80 p-6 shadow-xl relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                회사 공식 2026 VIP 의전 요금표
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                초안 (Draft) • vlk_2026_initial
              </span>
              <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-slate-800 text-slate-300">
                14개 차종/상품 등록됨
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-slate-100 tracking-tight">
              2026 차종별 공식 의전 요율 & 실시간 견적 엔진
            </h2>
            <p className="text-xs md:text-sm text-slate-400 max-w-2xl leading-relaxed font-medium">
              일반 의전 9시간(수도권·지방) 및 공항 편도 3시간(김포·인천)을 기준으로 단일 SKU 체계를 적용합니다.
              승인 전까지 초안(Draft) 상태를 유지하며, 실제 공식 요율을 바탕으로 즉시 실시간 견적을 산출할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenQuoteModal}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs md:text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <Calculator className="w-4 h-4" />
              <span>공식 요금 견적서 작성</span>
            </button>
            <button
              type="button"
              onClick={onOpenChauffeurCard}
              className="px-4 py-3 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-bold text-xs md:text-sm transition-all cursor-pointer"
            >
              VIP 배차 소개서
            </button>
          </div>
        </div>

        {/* Navigation Tabs inside Banner */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-800/80 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('cards')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'cards'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2026 공식 요금표 (14건)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mapping')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'mapping'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>차종-상품 SKU 매핑 현황</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'rules'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>검수 필요 추가 규정 (12건)</span>
          </button>
        </div>
      </div>

      {/* 2. Main Content Area */}
      {isLoading ? (
        <div className="py-24 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
          <Loader2 className="w-8 h-8 mx-auto text-[#1E60F3] animate-spin mb-3" />
          <p className="font-extrabold text-sm text-slate-700">비공개 2026 공식 요금표 동기화 중...</p>
          <p className="text-xs text-slate-400 mt-1">Supabase cockpit.official_price_cards & rules 로드</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-rose-800 text-xs font-bold">
          {error}
        </div>
      ) : activeTab === 'cards' ? (
        /* Tab 1: 2026 Price Cards Grid */
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
            <span>
              총 <strong className="text-slate-900">{cards.length}개</strong> 공식 의전 요금 상품 (확정 11건 / 상담 전용 3건)
            </span>
            <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              ✓ VAT 10% 별도 명시 • 기본 영어 소통 기사 포함
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => {
              const isBus = card.quoteRequired;

              return (
                <div
                  key={card.id}
                  className={`rounded-2xl border transition-all p-5 flex flex-col justify-between ${
                    isBus
                      ? 'bg-amber-50/40 border-amber-200/80 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-md'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-sm font-black text-slate-900">
                            {card.vehicleProductLabel}
                          </h4>
                          {isBus ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                              가격 상담
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-50 text-[#1E60F3] border border-blue-200">
                              확정 요율
                            </span>
                          )}
                        </div>
                        {card.capacityNote && (
                          <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                            {card.capacityNote}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {card.vehicleProductCode}
                      </span>
                    </div>

                    {/* Rates Grid */}
                    {isBus ? (
                      <div className="p-3.5 bg-white/80 rounded-xl border border-amber-200 text-center space-y-1">
                        <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto" />
                        <div className="text-xs font-black text-amber-900">가격 상담 전용 상품</div>
                        <p className="text-[11px] text-amber-700 leading-tight">
                          대형 버스는 일정·계절·동선에 따라 견적 필수 (0원 배차 금지)
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs">
                        {/* Daily 9h */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                          <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>일반 의전 (9시간)</span>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-slate-900">
                              수도권: {card.dailyMetroKrw ? `${card.dailyMetroKrw.toLocaleString()}원` : '-'}
                            </div>
                            <div className="text-[10.5px] font-extrabold text-blue-600">
                              지방: {card.dailyRegionalKrw ? `${card.dailyRegionalKrw.toLocaleString()}원` : '-'}
                            </div>
                          </div>
                        </div>

                        {/* Airport 3h */}
                        <div className="flex items-center justify-between pt-0.5">
                          <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                            <Plane className="w-3.5 h-3.5 text-slate-400" />
                            <span>공항 편도 (3시간)</span>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-slate-800">
                              김포: {card.airportGimpoKrw ? `${card.airportGimpoKrw.toLocaleString()}원` : '-'}
                            </div>
                            <div className="font-black text-[#1E60F3]">
                              인천: {card.airportIncheonKrw ? `${card.airportIncheonKrw.toLocaleString()}원` : '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{card.notes || '기본 의전 서비스'}</span>
                    <button
                      type="button"
                      onClick={onOpenQuoteModal}
                      className="text-xs font-bold text-[#1E60F3] hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>견적 산출</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'mapping' ? (
        /* Tab 2: SKU Mapping */
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-black text-slate-900">차종-공식 상품 SKU 매핑 현황</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              차종 이름으로 가격을 임의 추론하지 않으며, 2026 공식 상품 SKU 코드와 1:1 매핑하여 정확한 요율을 산출합니다.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-black text-slate-400 uppercase">
                  <th className="py-2.5 px-3">상품 SKU 코드</th>
                  <th className="py-2.5 px-3">공식 상품명</th>
                  <th className="py-2.5 px-3">분류 티어</th>
                  <th className="py-2.5 px-3">좌석/사양 조건</th>
                  <th className="py-2.5 px-3">매칭 키워드</th>
                  <th className="py-2.5 px-3">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {STANDARD_VEHICLE_SKU_MAPPINGS.map((sku) => (
                  <tr key={sku.vehicleProductCode} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">
                      {sku.vehicleProductCode}
                    </td>
                    <td className="py-3 px-3 font-extrabold text-[#1E60F3]">
                      {sku.vehicleProductLabel}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-[11px]">
                        {sku.tier.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-600">
                      {sku.capacityNote}
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {sku.matchKeywords.slice(0, 3).join(', ')}
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px]">
                      {sku.quoteRequired ? '⚠️ 가격 상담' : sku.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Tab 3: Additional Rules & Confirmation Check */
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-black text-slate-900">공식 추가 규정 및 검수 필요 항목</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              `needs_confirmation=true` 규정은 임의 자동 산정하지 않으며, 관리자 검토를 통해 확정합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => {
              const isConfirm = rule.needsConfirmation;

              return (
                <div
                  key={rule.id}
                  className={`p-4 rounded-2xl border text-xs space-y-2 ${
                    isConfirm
                      ? 'bg-amber-50/30 border-amber-200'
                      : 'bg-slate-50/50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-slate-900">{rule.ruleCode}</span>
                      <span className="text-[10.5px] px-1.5 py-0.2 rounded bg-slate-200 font-bold text-slate-600">
                        {rule.serviceType}
                      </span>
                    </div>
                    {isConfirm ? (
                      <span className="px-2 py-0.5 rounded text-[10.5px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                        관리자 확인 필요
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        자동 적용
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 font-medium leading-relaxed">
                    {rule.notes || JSON.stringify(rule.ruleData)}
                  </p>

                  <div className="pt-2 border-t border-slate-200/50 font-mono text-[10.5px] text-slate-400 truncate">
                    {JSON.stringify(rule.ruleData)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

