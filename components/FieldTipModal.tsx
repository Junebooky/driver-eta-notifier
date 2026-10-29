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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs select-none overscroll-contain animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92dvh] h-[92dvh] sm:h-auto sm:max-h-[88vh] animate-in slide-in-from-bottom-8 duration-300 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Handle */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Header Bar */}
        <div className="px-5 pt-1 pb-3 shrink-0">
          <div className="flex items-center justify-between">
            {/* Header Title with Lightbulb Icon */}
            <div className="flex items-center gap-1.5 text-[#1E60F3]">
              <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center">
                <Lightbulb className="w-3.5 h-3.5 fill-[#1E60F3] text-[#1E60F3]" />
              </div>
              <h2 className="text-sm font-black text-slate-900 tracking-tight">현장 팁</h2>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Location Toggle Tabs (When both origin & destination exist) */}
          {originPlaceName && destinationPlaceName && (
            <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl mt-2.5">
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setSelectedLocationMode('origin');
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all truncate cursor-pointer ${
                  selectedLocationMode === 'origin' || (!destinationPlaceName && selectedLocationMode === 'current')
                    ? 'bg-white text-[#1E60F3] shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
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
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all truncate cursor-pointer ${
                  selectedLocationMode === 'destination'
                    ? 'bg-white text-[#1E60F3] shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                목적지: {destinationPlaceName}
              </button>
            </div>
          )}

          {/* Place Title + Address + Place Thumbnail with '지도 보기' Overlay */}
          <div className="flex items-center justify-between gap-3 mt-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black text-slate-900 tracking-tight truncate leading-tight">
                {activePlaceData.placeName}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-1 truncate">
                {activePlaceData.address}
              </p>
            </div>

            {/* Place Photo Card with '📍 지도 보기' pill */}
            <div className="relative w-28 h-18 sm:w-32 sm:h-20 rounded-xl overflow-hidden shadow-xs border border-slate-200/90 shrink-0 bg-slate-100 group">
              <Image
                src={activePlaceData.imageUrl || '/images/josun_palace_facade.jpg'}
                alt={activePlaceData.placeName}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <button
                type="button"
                onClick={handleMapClick}
                className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-white/95 hover:bg-white text-slate-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 backdrop-blur-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <MapPin className="w-2.5 h-2.5 text-[#1E60F3]" />
                <span>지도 보기</span>
              </button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100 shrink-0" />

        {/* Accordion Tip List Area */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5 overscroll-contain">
          {activePlaceData.tips.map((item) => {
            const isExpanded = Boolean(expandedTipIds[item.id]);

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs transition-all hover:border-slate-300"
              >
                {/* Header Row */}
                <button
                  type="button"
                  onClick={() => toggleTip(item.id)}
                  className="w-full p-3.5 flex items-center justify-between text-left cursor-pointer active:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Badge Icon */}
                    {item.badgeIconType === 'parking_p' ? (
                      <div className="w-7 h-7 rounded-lg bg-[#1E60F3] text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                        P
                      </div>
                    ) : item.badgeIconType === 'pin' ? (
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                    ) : item.badgeIconType === 'truck' ? (
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4" />
                      </div>
                    ) : item.badgeIconType === 'ban' ? (
                      <div className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                        <Ban className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1E60F3] flex items-center justify-center shrink-0">
                        <Lightbulb className="w-4 h-4" />
                      </div>
                    )}

                    {/* Title & Subtitle */}
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900 leading-tight truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  {/* Expand Chevron */}
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 ml-2 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-slate-700' : ''
                    }`}
                  />
                </button>

                {/* Expanded Details Body */}
                {isExpanded && item.details && (
                  <div className="border-t border-slate-100 p-3.5 space-y-2.5 bg-white animate-in fade-in duration-150">
                    {/* Key-Value Information Rows */}
                    <div className="space-y-2 text-xs">
                      {item.details.rows.map((row, idx) => (
                        <div key={idx} className="flex items-start gap-2.5">
                          {/* Row Icon Badge */}
                          <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                            {row.iconType === 'clock' && <Clock className="w-3 h-3 text-slate-600" />}
                            {row.iconType === 'won' && <Coins className="w-3 h-3 text-slate-600" />}
                            {row.iconType === 'car' && <Car className="w-3 h-3 text-slate-600" />}
                            {row.iconType === 'file' && <FileText className="w-3 h-3 text-slate-600" />}
                            {row.iconType === 'mapPin' && <MapPin className="w-3 h-3 text-slate-600" />}
                            {row.iconType === 'truck' && <Truck className="w-3 h-3 text-slate-600" />}
                            {row.iconType === 'alert' && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                            {row.iconType === 'phone' && <Compass className="w-3 h-3 text-slate-600" />}
                          </div>

                          {/* Row Label */}
                          <div className="w-16 font-semibold text-slate-500 shrink-0 mt-0.5">
                            {row.label}
                          </div>

                          {/* Row Value or Bullets */}
                          <div className="flex-1 min-w-0">
                            {row.bullets && row.bullets.length > 0 ? (
                              <div className="space-y-1">
                                {row.bullets.map((b, bIdx) => (
                                  <div
                                    key={bIdx}
                                    className="text-slate-800 leading-relaxed font-medium"
                                  >
                                    • {b}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-slate-900 font-extrabold leading-relaxed">
                                {row.value}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Source & Verification Pill Note */}
                    <div className="bg-blue-50/80 border border-blue-100/90 rounded-xl px-3 py-2 flex items-center justify-between text-[11px] text-[#1E60F3] font-bold mt-3">
                      <div className="flex items-center gap-1.5 truncate">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {item.details.verificationNote || '기사 제보 · 호텔 공식 확인 필요'}
                        </span>
                      </div>
                      <span className="text-blue-500 font-medium shrink-0 ml-2">
                        {item.details.verifiedDate || '2024.10.15'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sticky Footer: '+ 현장 팁 추가' Button */}
        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setIsAddTipOpen(true);
            }}
            className="w-full py-3.5 border border-[#1E60F3] hover:bg-blue-50/60 active:scale-98 text-[#1E60F3] font-black rounded-2xl text-sm flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>현장 팁 추가</span>
          </button>
        </div>

        {/* Modal: 현장 팁 추가 Sub-Dialog */}
        {isAddTipOpen && (
          <div className="absolute inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div
              className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-base font-black text-slate-900">현장 팁 추가</h3>
                <button
                  type="button"
                  onClick={() => setIsAddTipOpen(false)}
                  className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Category Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">카테고리</label>
                <div className="grid grid-cols-3 gap-1.5">
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
                      className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        newCategory === cat.key
                          ? 'bg-[#1E60F3] text-white border-[#1E60F3]'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">팁 요약 (제목)</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 2층 로비 앞 전용 정차선 이용 가능"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#1E60F3] focus:bg-white transition-all"
                />
              </div>

              {/* Detail Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">상세 내용 및 주의사항</label>
                <textarea
                  value={newDetail}
                  onChange={(e) => setNewDetail(e.target.value)}
                  placeholder="동료 기사들을 위해 회차 시간, 높이 제한, 도어맨 소통 팁 등을 적어주세요."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#1E60F3] focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTipOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveTip}
                  className="flex-1 py-3 bg-[#1E60F3] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md active:scale-98 transition-all cursor-pointer"
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
