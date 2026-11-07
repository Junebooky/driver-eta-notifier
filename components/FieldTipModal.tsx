'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import {
  X,
  Lightbulb,
  MapPin,
  ChevronDown,
  Clock,
  Car,
  FileText,
  AlertTriangle,
  Truck,
  Ban,
  Plus,
  Info,
  CheckCircle2,
  Coins,
  Compass,
} from 'lucide-react';
import {
  PlaceFieldTips,
  FieldTipItem,
  FieldTipCategory,
} from '@/types/fieldTip';
import {
  getFieldTipsForPlace,
  saveCustomFieldTip,
} from '@/utils/fieldTipData';
import { haptics } from '@/utils/haptics';

interface FieldTipModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlaceName?: string;
  currentAddress?: string;
  originPlaceName?: string;
  originAddress?: string;
  destinationPlaceName?: string;
  destinationAddress?: string;
  onOpenRoadview?: (placeName: string, lat?: number, lng?: number) => void;
}

export const FieldTipModal: React.FC<FieldTipModalProps> = ({
  isOpen,
  onClose,
  currentPlaceName = '조선팰리스 강남',
  currentAddress = '서울 강남구 테헤란로 231',
  originPlaceName,
  originAddress,
  destinationPlaceName,
  destinationAddress,
  onOpenRoadview,
}) => {
  // Location selection: allow toggling between Origin and Destination if both exist
  const [selectedLocationMode, setSelectedLocationMode] = useState<'current' | 'origin' | 'destination'>('current');

  // Active Place Data
  const activePlaceData: PlaceFieldTips = useMemo(() => {
    let targetName = currentPlaceName || '조선팰리스 강남';
    let targetAddr = currentAddress || '서울 강남구 테헤란로 231';

    if (selectedLocationMode === 'origin' && originPlaceName) {
      targetName = originPlaceName;
      targetAddr = originAddress || '';
    } else if (selectedLocationMode === 'destination' && destinationPlaceName) {
      targetName = destinationPlaceName;
      targetAddr = destinationAddress || '';
    }

    return getFieldTipsForPlace(targetName, targetAddr);
  }, [
    currentPlaceName,
    currentAddress,
    originPlaceName,
    originAddress,
    destinationPlaceName,
    destinationAddress,
    selectedLocationMode,
  ]);

  // Expanded accordion item ids (Default: first item '무료 주차 30분' expanded per reference UI)
  const [expandedTipIds, setExpandedTipIds] = useState<Record<string, boolean>>({
    'jp-tip-parking': true,
    'icn-tip-parking': true,
  });

  // Toggle accordion item
  const toggleTip = (id: string) => {
    haptics.selection();
    setExpandedTipIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Add tip sub-modal state
  const [isAddTipOpen, setIsAddTipOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<FieldTipCategory>('parking');
  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveTip = () => {
    if (!newTitle.trim()) {
      showToast('현장 팁 제목을 입력해 주세요.');
      return;
    }

    haptics.success();
    const newTip: FieldTipItem = {
      id: `custom_${Date.now()}`,
      category: newCategory,
      title: newTitle.trim(),
      subtitle: '기사 직접 등록 팁',
      badgeIconType:
        newCategory === 'parking'
          ? 'parking_p'
          : newCategory === 'traffic_warning'
          ? 'ban'
          : newCategory === 'large_vehicle'
          ? 'truck'
          : 'pin',
      badgeBgColor: newCategory === 'parking' ? 'bg-[#1E60F3]' : 'bg-blue-50',
      badgeTextColor: newCategory === 'parking' ? 'text-white' : 'text-[#1E60F3]',
      badgeLetter: newCategory === 'parking' ? 'P' : undefined,
      details: {
        rows: [
          {
            iconType: 'file',
            label: '팁 내용',
            value: newDetail.trim() || newTitle.trim(),
          },
        ],
        verificationNote: '기사 제보 현장 팁',
        verifiedDate: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
      },
    };

    saveCustomFieldTip(activePlaceData.id, newTip);
    setIsAddTipOpen(false);
    setNewTitle('');
    setNewDetail('');
    showToast('✨ 새로운 현장 팁이 등록되었습니다.');
  };

  // Handle Map / Roadview Click
  const handleMapClick = () => {
    haptics.mediumTap();
    if (onOpenRoadview) {
      onOpenRoadview(activePlaceData.placeName, activePlaceData.lat, activePlaceData.lng);
    } else {
      // Fallback: Open KakaoMap or Naver Map search
      const query = encodeURIComponent(`${activePlaceData.placeName} ${activePlaceData.address}`);
      window.open(`https://map.kakao.com/link/search/${query}`, '_blank');
    }
  };

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none overscroll-none driver-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg bg-[#F6F8FC] rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[88dvh] h-[88dvh] sm:h-auto sm:max-h-[85vh] relative overscroll-contain driver-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Handle */}
        <div className="w-11 h-1.5 bg-slate-300/70 rounded-full mx-auto mt-3 mb-1 shrink-0" />

        {/* Header Bar */}
        <div className="px-5 pt-1 pb-4 shrink-0 bg-[#F6F8FC]">
          <div className="flex items-center justify-between">
            {/* Header Title with Lightbulb Icon */}
            <div className="flex items-center gap-2 text-[#0055FF]">
              <Lightbulb className="w-5 h-5 fill-[#0055FF] text-[#0055FF] shrink-0" />
              <h2 className="text-[18px] font-black text-slate-900 tracking-tight">현장 팁</h2>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="w-9 h-9 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Location Toggle Tabs (When both origin & destination exist) */}
          {originPlaceName && destinationPlaceName && (
            <div className="flex items-center gap-1.5 bg-[#EEF2F8] p-1.5 rounded-2xl mt-3.5">
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setSelectedLocationMode('origin');
                }}
                className={`flex-1 py-2.5 px-3 text-[13px] rounded-xl transition-all truncate cursor-pointer ${
                  selectedLocationMode === 'origin' || (!destinationPlaceName && selectedLocationMode === 'current')
                    ? 'bg-white text-[#0055FF] font-extrabold shadow-[0_2px_10px_rgba(15,23,42,0.05)]'
                    : 'text-slate-500 hover:text-slate-700 font-bold'
                }`}
              >
                출발지: {originPlaceName}
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setSelectedLocationMode('destination');
                }}
                className={`flex-1 py-2.5 px-3 text-[13px] rounded-xl transition-all truncate cursor-pointer ${
                  selectedLocationMode === 'destination'
                    ? 'bg-white text-[#0055FF] font-extrabold shadow-[0_2px_10px_rgba(15,23,42,0.05)]'
                    : 'text-slate-500 hover:text-slate-700 font-bold'
                }`}
              >
                목적지: {destinationPlaceName}
              </button>
            </div>
          )}

          {/* Place Title + Address + Place Thumbnail with '지도 보기' Overlay */}
          <div className="flex items-center justify-between gap-3 mt-5">
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-black text-slate-900 tracking-tight truncate leading-tight">
                {activePlaceData.placeName}
              </h1>
              <p className="text-[13px] text-slate-500 font-medium mt-1 truncate">
                {activePlaceData.address}
              </p>
            </div>

            {/* Place Photo Card with '📍 지도 보기' pill */}
            <div className="relative w-32 h-20 sm:w-36 sm:h-22 rounded-2xl overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.08)] border border-white shrink-0 bg-slate-100 group">
              <Image
                src={activePlaceData.imageUrl || '/images/josun_palace_facade.jpg'}
                alt={activePlaceData.placeName}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <button
                type="button"
                onClick={handleMapClick}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white hover:bg-slate-50 text-slate-900 text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md flex items-center gap-1 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <MapPin className="w-3 h-3 text-[#0055FF]" />
                <span>지도 보기</span>
              </button>
            </div>
          </div>
        </div>

        {/* Accordion Tip List Area */}
        <div className="flex-1 overflow-y-auto px-5 py-1.5 space-y-3.5 overscroll-contain">
          {activePlaceData.tips.map((item) => {
            const isExpanded = Boolean(expandedTipIds[item.id]);

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-100/90 rounded-3xl overflow-hidden shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all hover:border-blue-200/80"
              >
                {/* Header Row */}
                <button
                  type="button"
                  onClick={() => toggleTip(item.id)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between text-left cursor-pointer active:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Badge Icon */}
                    {item.badgeIconType === 'parking_p' ? (
                      <div className="w-11 h-11 rounded-2xl bg-[#0055FF] text-white font-black text-[16px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,85,255,0.25)]">
                        P
                      </div>
                    ) : item.badgeIconType === 'pin' ? (
                      <div className="w-11 h-11 rounded-2xl bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5" />
                      </div>
                    ) : item.badgeIconType === 'truck' ? (
                      <div className="w-11 h-11 rounded-2xl bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                    ) : item.badgeIconType === 'ban' ? (
                      <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                        <Ban className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center shrink-0">
                        <Lightbulb className="w-5 h-5" />
                      </div>
                    )}

                    {/* Title & Subtitle */}
                    <div className="min-w-0">
                      <div className="text-[16px] font-black text-slate-900 leading-tight truncate tracking-tight">
                        {item.title}
                      </div>
                      <div className="text-[13px] text-slate-400 font-medium mt-1 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  {/* Expand Chevron */}
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 shrink-0 ml-2 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-slate-700' : ''
                    }`}
                  />
                </button>

                {/* Expanded Details Body */}
                {isExpanded && item.details && (
                  <div className="px-5 pb-5 pt-0.5 space-y-3 bg-white animate-in fade-in duration-150">
                    {/* Key-Value Information Rows */}
                    <div className="space-y-3 text-[13px]">
                      {item.details.rows.map((row, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          {/* Row Icon Badge */}
                          <div className="w-6 h-6 rounded-full bg-[#F1F5F9] text-slate-500 flex items-center justify-center shrink-0 mt-0.5">
                            {row.iconType === 'clock' && <Clock className="w-3.5 h-3.5 text-slate-500" />}
                            {row.iconType === 'won' && <Coins className="w-3.5 h-3.5 text-slate-500" />}
                            {row.iconType === 'car' && <Car className="w-3.5 h-3.5 text-slate-500" />}
                            {row.iconType === 'file' && <FileText className="w-3.5 h-3.5 text-slate-500" />}
                            {row.iconType === 'mapPin' && <MapPin className="w-3.5 h-3.5 text-slate-500" />}
                            {row.iconType === 'truck' && <Truck className="w-3.5 h-3.5 text-slate-500" />}
                            {row.iconType === 'alert' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                            {row.iconType === 'phone' && <Compass className="w-3.5 h-3.5 text-slate-500" />}
                          </div>

                          {/* Row Label */}
                          <div className="w-18 font-semibold text-slate-400 shrink-0 mt-0.5 text-[13px]">
                            {row.label}
                          </div>

                          {/* Row Value or Bullets */}
                          <div className="flex-1 min-w-0">
                            {row.bullets && row.bullets.length > 0 ? (
                              <div className="space-y-1.5">
                                {row.bullets.map((b, bIdx) => (
                                  <div
                                    key={bIdx}
                                    className="text-slate-800 leading-relaxed font-semibold text-[13px]"
                                  >
                                    • {b}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-slate-900 font-extrabold leading-relaxed text-[14px]">
                                {row.value}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Source & Verification Pill Note */}
                    <div className="bg-[#F1F5FB] rounded-2xl px-4 py-3 flex items-center justify-between text-[12px] text-slate-500 font-semibold mt-4">
                      <div className="flex items-center gap-2 truncate">
                        <Info className="w-4 h-4 text-[#0055FF] shrink-0" />
                        <span className="truncate">
                          {item.details.verificationNote || '기사 제보 · 호텔 공식 확인 필요'}
                        </span>
                      </div>
                      <span className="text-slate-400 font-medium shrink-0 ml-2">
                        {item.details.verifiedDate || '2024.10.15'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sticky Footer: '+ 현장 팁 추가' Volumetric White Card Button */}
        <div className="px-5 pb-5 pt-2 bg-[#F6F8FC] shrink-0">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setIsAddTipOpen(true);
            }}
            className="w-full py-4 bg-white hover:bg-slate-50 active:scale-[0.99] text-[#0055FF] font-extrabold rounded-2xl text-[15px] flex items-center justify-center gap-1.5 border border-slate-100/90 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>현장 팁 추가</span>
          </button>
        </div>

        {/* Modal: 현장 팁 추가 Sub-Dialog */}
        {isAddTipOpen && (
          <div className="absolute inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div
              className="w-full max-w-sm bg-[#F6F8FC] rounded-3xl p-5 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[17px] font-black text-slate-900">현장 팁 추가</h3>
                <button
                  type="button"
                  onClick={() => setIsAddTipOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-200/60 text-slate-600 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Category Selection */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">카테고리</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'parking', label: '무료 주차' },
                      { key: 'pickup', label: '픽업 위치' },
                      { key: 'large_vehicle', label: '대형차' },
                      { key: 'traffic_warning', label: '주정차 유의' },
                      { key: 'other', label: '기타 팁' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setNewCategory(cat.key)}
                      className={`py-2.5 text-xs font-bold rounded-2xl border transition-all cursor-pointer ${
                        newCategory === cat.key
                          ? 'bg-[#0055FF] text-white border-[#0055FF] shadow-[0_3px_10px_rgba(0,85,255,0.2)]'
                          : 'bg-white text-slate-600 border-slate-100/90 shadow-[0_2px_8px_rgba(15,23,42,0.03)] hover:bg-slate-50'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">팁 요약 (제목)</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 2층 로비 앞 전용 정차선 이용 가능"
                  className="w-full px-4 py-3 bg-white border border-slate-100/90 rounded-2xl shadow-[0_2px_10px_rgba(15,23,42,0.04)] text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#0055FF] transition-all"
                />
              </div>

              {/* Detail Input */}
              <div>
                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">상세 내용 및 주의사항</label>
                <textarea
                  value={newDetail}
                  onChange={(e) => setNewDetail(e.target.value)}
                  placeholder="동료 기사들을 위해 회차 시간, 높이 제한, 도어맨 소통 팁 등을 적어주세요."
                  rows={3}
                  className="w-full px-4 py-3 bg-white border border-slate-100/90 rounded-2xl shadow-[0_2px_10px_rgba(15,23,42,0.04)] text-sm font-medium text-slate-900 focus:outline-none focus:border-[#0055FF] transition-all resize-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-1 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddTipOpen(false)}
                  className="w-[36%] py-3.5 bg-[#EEF2F7] hover:bg-slate-200 text-slate-600 rounded-2xl text-[14px] font-bold transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveTip}
                  className="flex-1 py-3.5 bg-[#0055FF] hover:bg-[#0044CC] text-white rounded-2xl text-[14px] font-extrabold shadow-[0_4px_14px_rgba(0,85,255,0.25)] active:scale-98 transition-all cursor-pointer"
                >
                  등록하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Toast */}
        {toastMessage && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-70 bg-slate-900/90 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
