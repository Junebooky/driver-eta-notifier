'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  X,
  Search,
  MapPin,
  Phone,
  Globe,
  CircleParking,
  Truck,
  Users2,
  Car,
  AlertTriangle,
  Info,
  Navigation,
  Copy,
  Check,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import { FieldKnowledgeItem, FieldKnowledgeCategory } from '@/types/fieldKnowledge';
import {
  getStoredFieldKnowledge,
  FIELD_KNOWLEDGE_CHANGE_EVENT,
} from '@/utils/fieldKnowledgeData';
import { haptics } from '@/utils/haptics';

export interface DriverFieldKnowledgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlaceName?: string;
}

const DRIVER_CATEGORIES: FieldKnowledgeCategory[] = [
  '전체',
  '공항',
  '호텔',
  '식당',
  '쇼핑',
  '기타',
];

export const DriverFieldKnowledgeModal: React.FC<DriverFieldKnowledgeModalProps> = ({
  isOpen,
  onClose,
  initialPlaceName,
}) => {
  const [items, setItems] = useState<FieldKnowledgeItem[]>(() => getStoredFieldKnowledge());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<FieldKnowledgeCategory>('전체');

  // Active item in detail view (null = list view)
  const [activeItem, setActiveItem] = useState<FieldKnowledgeItem | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'photos'>('info');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Sync listener
  useEffect(() => {
    const handleUpdate = () => {
      setItems(getStoredFieldKnowledge());
    };
    window.addEventListener(FIELD_KNOWLEDGE_CHANGE_EVENT, handleUpdate);
    return () => window.removeEventListener(FIELD_KNOWLEDGE_CHANGE_EVENT, handleUpdate);
  }, []);

  // Auto-select initial place if provided
  useEffect(() => {
    if (isOpen && initialPlaceName) {
      const match = items.find((i) =>
        i.title.toLowerCase().includes(initialPlaceName.toLowerCase()) ||
        initialPlaceName.toLowerCase().includes(i.title.toLowerCase())
      );
      if (match) {
        setActiveItem(match);
        setActiveTab('info');
      }
    } else if (!isOpen) {
      setActiveItem(null);
      setSearchQuery('');
    }
  }, [isOpen, initialPlaceName, items]);

  // Strictly lock background page scrolling whenever the modal is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const scrollEl = target?.closest('[data-modal-scroll="true"]') as HTMLElement | null;
      if (!scrollEl) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const isAtTop = scrollTop <= 0 && e.deltaY < 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (scrollHeight <= clientHeight || isAtTop || isAtBottom) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const overlayEl = overlayRef.current;
    overlayEl?.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      overlayEl?.removeEventListener('wheel', handleWheel);
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, [isOpen]);

  // Filtered items for list view
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== '전체' && item.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          item.description.toLowerCase().includes(q) ||
          item.address.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [items, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const handleCopyAddress = (address: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(address);
      haptics.selection();
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none overscroll-none driver-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.lightTap();
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg bg-[#F6F8FC] rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[88dvh] h-[88dvh] sm:h-[680px] sm:max-h-[86vh] relative overscroll-contain driver-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* DETAIL VIEW (Strictly Read-Only for Drivers)                              */}
        {/* ========================================================================= */}
        {activeItem ? (
          <div data-modal-scroll="true" className="flex-1 flex flex-col overflow-y-auto overscroll-contain">
            {/* Top Cover Image with Floating Back / Close buttons */}
            <div className="relative w-full h-48 sm:h-52 bg-slate-900 shrink-0">
              <img
                src={activeItem.imageUrl}
                alt={activeItem.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-black/40" />

              {/* Navigation Bar Over Image */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setActiveItem(null);
                  }}
                  className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs active:scale-95 transition-all cursor-pointer"
                  aria-label="뒤로 가기"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    onClose();
                  }}
                  className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs active:scale-95 transition-all cursor-pointer"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Title & Badge Overlay */}
              <div className="absolute bottom-4 left-5 right-5 text-white">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight">{activeItem.title}</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0055FF] text-white">
                    {activeItem.categoryBadge || activeItem.category}
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-medium mt-1 line-clamp-1">
                  {activeItem.description}
                </p>
              </div>
            </div>

            {/* Sub-tabs: 기본정보 | 사진 */}
            <div className="flex items-center border-b border-slate-100 bg-white sticky top-0 z-10 shrink-0">
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setActiveTab('info');
                }}
                className={`flex-1 py-3.5 text-[13px] font-extrabold text-center border-b-2 transition-all cursor-pointer ${
                  activeTab === 'info'
                    ? 'border-[#0055FF] text-[#0055FF]'
                    : 'border-transparent text-slate-400'
                }`}
              >
                기본정보
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setActiveTab('photos');
                }}
                className={`flex-1 py-3.5 text-[13px] font-extrabold text-center border-b-2 transition-all cursor-pointer ${
                  activeTab === 'photos'
                    ? 'border-[#0055FF] text-[#0055FF]'
                    : 'border-transparent text-slate-400'
                }`}
              >
                사진 {(activeItem.photos || []).length > 0 && `(${activeItem.photos?.length})`}
              </button>
            </div>

            {/* Tab 1: Info Content */}
            {activeTab === 'info' && (
              <div className="p-4 sm:p-5 space-y-4">
                {/* 6 Quick Action Grid Buttons */}
                <div className="grid grid-cols-3 gap-2.5">
                  {/* 1. 무료회차 */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] flex flex-col items-center justify-center text-center">
                    <div className="w-8 h-8 rounded-full bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center mb-1.5">
                      <CircleParking className="w-4 h-4" />
                    </div>
                    <span className="text-[12px] font-bold text-slate-700">무료회차</span>
                  </div>

                  {/* 2. 스프린터 대기 */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] flex flex-col items-center justify-center text-center">
                    <div className="w-8 h-8 rounded-full bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center mb-1.5">
                      <Truck className="w-4 h-4" />
                    </div>
                    <span className="text-[12px] font-bold text-slate-700">스프린터 대기</span>
                  </div>

                  {/* 3. 화장실 */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] flex flex-col items-center justify-center text-center">
                    <div className="w-8 h-8 rounded-full bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center mb-1.5">
                      <Users2 className="w-4 h-4" />
                    </div>
                    <span className="text-[12px] font-bold text-slate-700">화장실</span>
                  </div>

                  {/* 4. 픽업 위치 */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] flex flex-col items-center justify-center text-center">
                    <div className="w-8 h-8 rounded-full bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center mb-1.5">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <span className="text-[12px] font-bold text-slate-700">픽업 위치</span>
                  </div>

                  {/* 5. 차량 대기 */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] flex flex-col items-center justify-center text-center">
                    <div className="w-8 h-8 rounded-full bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center mb-1.5">
                      <Car className="w-4 h-4" />
                    </div>
                    <span className="text-[12px] font-bold text-slate-700">차량 대기</span>
                  </div>

                  {/* 6. 주정차 주의 */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)] flex flex-col items-center justify-center text-center">
                    <div className="w-8 h-8 rounded-full bg-[#EBF3FF] text-[#0055FF] flex items-center justify-center mb-1.5">
                      <AlertTriangle className="w-4 h-4 text-slate-600" />
                    </div>
                    <span className="text-[12px] font-bold text-slate-700">주정차 주의</span>
                  </div>
                </div>

                {/* Detailed Accordion Section List */}
                <div className="divide-y divide-slate-100 bg-white rounded-3xl border border-slate-100/90 overflow-hidden shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
                  {/* 주소 */}
                  <div className="p-4 flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[11px] font-bold text-slate-400">주소</p>
                      <p className="text-[13px] font-bold text-slate-800 mt-0.5">{activeItem.address}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyAddress(activeItem.address)}
                      className="p-2 rounded-xl bg-[#F4F7FC] text-slate-600 hover:bg-slate-200/70 active:scale-95 transition-all cursor-pointer"
                      title="주소 복사"
                    >
                      {copiedAddress ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* 대표전화 */}
                  {activeItem.phone && (
                    <div className="p-4 flex items-center gap-3">
                      <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400">대표전화</p>
                        <a
                          href={`tel:${activeItem.phone.replace(/[^0-9]/g, '')}`}
                          className="text-[13px] font-bold text-[#0055FF] hover:underline"
                        >
                          {activeItem.phone}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* 공식 웹사이트 */}
                  {activeItem.website && (
                    <div className="p-4 flex items-center gap-3">
                      <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400">공식 웹사이트</p>
                        <a
                          href={activeItem.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[13px] font-bold text-[#0055FF] hover:underline truncate block max-w-[260px]"
                        >
                          {activeItem.website}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* 무료회차 */}
                  {activeItem.freeParkingNotice && (
                    <div className="p-4 flex items-start gap-3">
                      <CircleParking className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400">무료회차</p>
                        <p className="text-[13px] font-medium text-slate-800 mt-0.5">
                          {activeItem.freeParkingNotice}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 스프린터 대기 가능 */}
                  {activeItem.sprinterWaiting && (
                    <div className="p-4 flex items-start gap-3">
                      <Truck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400">스프린터 대기 가능</p>
                        <p className="text-[13px] font-medium text-slate-800 mt-0.5">
                          {activeItem.sprinterWaiting}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 화장실 위치 */}
                  {activeItem.restroomLocation && (
                    <div className="p-4 flex items-start gap-3">
                      <Users2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400">화장실 위치</p>
                        <p className="text-[13px] font-medium text-slate-800 mt-0.5">
                          {activeItem.restroomLocation}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 차량 대기 위치 */}
                  {activeItem.vehicleWaitingNotes && (
                    <div className="p-4 flex items-start gap-3">
                      <Car className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400">차량 대기 위치</p>
                        <p className="text-[13px] font-medium text-slate-800 mt-0.5">
                          {activeItem.vehicleWaitingNotes}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 주정차 주의사항 */}
                  {activeItem.cautionNotes && (
                    <div className="p-4 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400">주정차 주의사항</p>
                        <p className="text-[13px] font-medium text-slate-800 mt-0.5">
                          {activeItem.cautionNotes}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 추가 정보 */}
                  {activeItem.additionalNotes && (
                    <div className="p-4 flex items-start gap-3">
                      <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400">추가 정보</p>
                        <p className="text-[13px] font-medium text-slate-800 mt-0.5">
                          {activeItem.additionalNotes}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Photos */}
            {activeTab === 'photos' && (
              <div className="p-4 sm:p-5 grid grid-cols-2 gap-3">
                {(activeItem.photos || [activeItem.imageUrl]).map((p, idx) => (
                  <div
                    key={idx}
                    className="relative h-32 rounded-2xl overflow-hidden bg-white border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)]"
                  >
                    <img src={p} alt="현장 사진" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ========================================================================= */
          /* LIST VIEW (Volumetric Driver Mobile Card Grid)                             */
          /* ========================================================================= */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Header */}
            <div className="px-5 pt-5 pb-3.5 bg-[#F6F8FC] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
                  aria-label="뒤로 가기"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <img
                  src="/images/icons/knowledge/icon_knowledge.png"
                  alt="현장 지식 아이콘"
                  className="w-12 h-12 object-contain shrink-0 select-none"
                  draggable={false}
                />
                <h2 className="text-[19px] font-black text-slate-900 tracking-tight">현장 지식</h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="px-5 pb-3.5 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="장소, 호텔, 공항 등을 검색하세요..."
                  className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-100/90 rounded-2xl shadow-[0_3px_14px_rgba(15,23,42,0.04)] text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#0055FF] transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Chips (전체, 공항, 호텔, 식당, 쇼핑, 기타) */}
            <div data-modal-scroll="true" className="px-5 pb-3.5 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
              {DRIVER_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setSelectedCategory(cat);
                    }}
                    className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#0055FF] text-white shadow-[0_4px_12px_rgba(0,85,255,0.22)]'
                        : 'bg-[#EEF2F8] text-slate-600 hover:bg-slate-200/80'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* 2-Column Card Grid */}
            <div data-modal-scroll="true" className="flex-1 px-5 pb-5 pt-0.5 overflow-y-auto overscroll-contain">
              <div className="grid grid-cols-2 gap-3.5">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      haptics.lightTap();
                      setActiveItem(item);
                      setActiveTab('info');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveItem(item);
                        setActiveTab('info');
                      }
                    }}
                    className="bg-white rounded-3xl border border-slate-100/90 overflow-hidden shadow-[0_4px_16px_rgba(15,23,42,0.04)] hover:border-blue-200 active:scale-[0.98] transition-all cursor-pointer flex flex-col group"
                  >
                    <div className="relative w-full h-28 sm:h-32 bg-slate-100 overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="px-3.5 py-3 flex-1 flex items-center justify-between gap-1.5 bg-white">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-black text-slate-900 group-hover:text-[#0055FF] transition-colors line-clamp-1 tracking-tight">
                          {item.title}
                        </h3>
                        <span className="text-[12px] font-semibold text-slate-400 mt-0.5 block truncate">
                          {item.categoryBadge || item.category}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-[#0055FF] transition-colors" />
                    </div>
                  </div>
                ))}

                {filteredItems.length === 0 && (
                  <div className="col-span-full py-14 text-center text-[14px] font-semibold text-slate-400 bg-white rounded-3xl border border-slate-100/90 shadow-[0_3px_12px_rgba(15,23,42,0.04)]">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
