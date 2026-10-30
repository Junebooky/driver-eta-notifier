'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  BookOpen,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  Globe,
  CircleParking,
  Truck,
  Users2,
  Car,
  AlertTriangle,
  Info,
  CheckCircle2,
  Camera,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';
import { FieldKnowledgeItem, FieldKnowledgeCategory } from '@/types/fieldKnowledge';
import {
  getStoredFieldKnowledge,
  saveFieldKnowledgeItem,
  deleteFieldKnowledgeItem,
  FIELD_KNOWLEDGE_CHANGE_EVENT,
} from '@/utils/fieldKnowledgeData';
import { haptics } from '@/utils/haptics';

export interface HqFieldKnowledgeViewProps {
  initialSearchQuery?: string;
  onSelectPlaceForSchedule?: (item: FieldKnowledgeItem) => void;
}

const CATEGORIES: FieldKnowledgeCategory[] = [
  '전체',
  '공항',
  '호텔',
  '식당',
  '쇼핑',
  '교통',
  '긴급',
  '기타',
];

export const HqFieldKnowledgeView: React.FC<HqFieldKnowledgeViewProps> = ({
  initialSearchQuery = '',
  onSelectPlaceForSchedule,
}) => {
  const [items, setItems] = useState<FieldKnowledgeItem[]>(() => getStoredFieldKnowledge());
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<FieldKnowledgeCategory>('전체');

  // View state: 'list' | 'edit'
  const [currentView, setCurrentView] = useState<'list' | 'edit'>('list');
  const [editingItem, setEditingItem] = useState<FieldKnowledgeItem | null>(null);
  const [editTab, setEditTab] = useState<'details' | 'photos'>('details');

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync listener for cross-tab or external changes
  useEffect(() => {
    const handleUpdate = () => {
      setItems(getStoredFieldKnowledge());
    };
    window.addEventListener(FIELD_KNOWLEDGE_CHANGE_EVENT, handleUpdate);
    return () => window.removeEventListener(FIELD_KNOWLEDGE_CHANGE_EVENT, handleUpdate);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Category filter
      if (selectedCategory !== '전체' && item.category !== selectedCategory) {
        return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          item.description.toLowerCase().includes(q) ||
          item.address.toLowerCase().includes(q) ||
          (item.category && item.category.toLowerCase().includes(q)) ||
          (item.additionalNotes && item.additionalNotes.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [items, selectedCategory, searchQuery]);

  // Handle Edit click
  const handleOpenEdit = (item: FieldKnowledgeItem) => {
    haptics.lightTap();
    setEditingItem({ ...item });
    setEditTab('details');
    setCurrentView('edit');
  };

  // Handle Add New Place click
  const handleOpenAddNew = () => {
    haptics.mediumTap();
    const newItem: FieldKnowledgeItem = {
      id: `fk-${Date.now()}`,
      title: '',
      subtitle: '',
      category: '호텔',
      categoryBadge: '호텔',
      description: '',
      imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      photos: [],
      address: '',
      phone: '',
      website: '',
      freeParkingNotice: '',
      sprinterWaiting: '',
      restroomLocation: '',
      pickupLocationNotes: '',
      vehicleWaitingNotes: '',
      cautionNotes: '',
      additionalNotes: '',
      updatedAt: new Date().toISOString(),
      updatedBy: '본사 관리자',
    };
    setEditingItem(newItem);
    setEditTab('details');
    setCurrentView('edit');
  };

  // Handle Save
  const handleSaveItem = () => {
    if (!editingItem) return;
    if (!editingItem.title.trim()) {
      haptics.errorAlert();
      showToast('장소명은 필수 입력 항목입니다.');
      return;
    }

    haptics.success();
    saveFieldKnowledgeItem(editingItem);
    setItems(getStoredFieldKnowledge());
    showToast(`'${editingItem.title}' 현장 지식이 성공적으로 저장되었습니다.`);
    setCurrentView('list');
    setEditingItem(null);
  };

  // Handle Delete (with strict neutral gray button per user instruction)
  const handleDeleteItem = () => {
    if (!editingItem) return;
    const confirmDelete = window.confirm(`'${editingItem.title}' 현장 지식을 정말 삭제하시겠습니까?`);
    if (!confirmDelete) return;

    haptics.mediumTap();
    deleteFieldKnowledgeItem(editingItem.id);
    setItems(getStoredFieldKnowledge());
    showToast(`'${editingItem.title}' 현장 지식이 삭제되었습니다.`);
    setCurrentView('list');
    setEditingItem(null);
  };

  // Handle Change Cover Image URL
  const handleChangeImageUrl = () => {
    if (!editingItem) return;
    const newUrl = window.prompt(
      '새 대표 이미지 URL을 입력해 주세요 (웹 주소):',
      editingItem.imageUrl
    );
    if (newUrl && newUrl.trim()) {
      setEditingItem({
        ...editingItem,
        imageUrl: newUrl.trim(),
      });
      showToast('대표 이미지가 변경되었습니다.');
    }
  };

  // =========================================================================
  // VIEW: EDIT SCREEN (Reference 2 Screen C)
  // =========================================================================
  if (currentView === 'edit' && editingItem) {
    const descLength = editingItem.description?.length || 0;

    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1E60F3]">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">현장 지식 수정</h2>
              <p className="text-xs text-slate-500 font-medium">
                기사 Cockpit 앱에 실시간 공유되는 거점 진입 동선 및 의전 가이드
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* STRICT REQUIREMENT: Clean Neutral Gray Delete Button (NOT RED!) */}
            <button
              type="button"
              onClick={handleDeleteItem}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100/80 active:scale-95 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              title="현장 지식 삭제"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-500" />
              <span>삭제</span>
            </button>

            {/* Back to List Button */}
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                setCurrentView('list');
                setEditingItem(null);
              }}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>목록으로</span>
            </button>
          </div>
        </div>

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-xs font-bold text-blue-800 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-[#1E60F3] shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Main Header Edit Card: Image + Title/Category/Description */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* Left: Representative Image with change button */}
            <div className="md:col-span-4 flex flex-col items-center">
              <div className="relative w-full h-48 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group">
                <img
                  src={editingItem.imageUrl}
                  alt={editingItem.title || '대표 이미지'}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={handleChangeImageUrl}
                  className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-black/70 hover:bg-black/85 text-white text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-xs transition-all cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>대표 이미지 변경</span>
                </button>
              </div>
            </div>

            {/* Right: Meta Fields */}
            <div className="md:col-span-8 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>장소명</span>
                    <span className="text-[#1E60F3]">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingItem.title}
                    onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    placeholder="예: 조선팰리스 강남, 인천공항 T2"
                    className="w-full px-3.5 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>카테고리</span>
                    <span className="text-[#1E60F3]">*</span>
                  </label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => {
                      const val = e.target.value as FieldKnowledgeItem['category'];
                      setEditingItem({
                        ...editingItem,
                        category: val,
                        categoryBadge: val,
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
                  >
                    <option value="호텔">호텔</option>
                    <option value="공항">공항</option>
                    <option value="식당">식당</option>
                    <option value="쇼핑">쇼핑</option>
                    <option value="교통">교통</option>
                    <option value="긴급">긴급</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
              </div>

              {/* 한 줄 설명 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">한 줄 설명</label>
                  <span className="text-[11px] text-slate-400 font-semibold">{descLength}/100</span>
                </div>
                <input
                  type="text"
                  maxLength={100}
                  value={editingItem.description}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="장소의 성격과 핵심 특징을 한 줄로 요약해 주세요"
                  className="w-full px-3.5 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
                />
              </div>

              {/* 서브 카피 / 배지 문구 */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">서브 안내 문구</label>
                <input
                  type="text"
                  value={editingItem.subtitle || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, subtitle: e.target.value })}
                  placeholder="예: 차량 진입 안내, 미팅포인트 안내, 주차 및 발렛"
                  className="w-full px-3.5 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sub-tabs: 기본정보 | 사진 */}
        <div className="flex items-center gap-6 border-b border-slate-200 px-2 pt-1">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setEditTab('details');
            }}
            className={`pb-2.5 text-xs font-bold transition-all relative cursor-pointer ${
              editTab === 'details'
                ? 'text-[#1E60F3] font-black'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <span>기본정보</span>
            {editTab === 'details' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setEditTab('photos');
            }}
            className={`pb-2.5 text-xs font-bold transition-all relative cursor-pointer ${
              editTab === 'photos'
                ? 'text-[#1E60F3] font-black'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <span>사진 갤러리</span>
            {editTab === 'photos' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E60F3] rounded-full" />
            )}
          </button>
        </div>

        {/* Tab 1: 기본정보 Form Fields */}
        {editTab === 'details' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            {/* 1. 주소 */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>주소</span>
              </label>
              <input
                type="text"
                value={editingItem.address}
                onChange={(e) => setEditingItem({ ...editingItem, address: e.target.value })}
                placeholder="서울시 강남구 테헤란로 231..."
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
              />
            </div>

            {/* 2. 대표전화 & 공식 웹사이트 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>대표전화</span>
                </label>
                <input
                  type="text"
                  value={editingItem.phone || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, phone: e.target.value })}
                  placeholder="예: 02-727-7200"
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span>공식 웹사이트</span>
                </label>
                <input
                  type="text"
                  value={editingItem.website || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, website: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
                />
              </div>
            </div>

            {/* 3. 무료회차 안내 */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <CircleParking className="w-3.5 h-3.5 text-slate-400" />
                <span>무료회차</span>
              </label>
              <input
                type="text"
                value={editingItem.freeParkingNotice || ''}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, freeParkingNotice: e.target.value })
                }
                placeholder="예: 30분 (호텔 등록 시 무료, 이후 유료)"
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
              />
            </div>

            {/* 4. 스프린터 대기 가능 구역 */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                <span>스프린터 대기 가능 구역</span>
              </label>
              <input
                type="text"
                value={editingItem.sprinterWaiting || ''}
                onChange={(e) => setEditingItem({ ...editingItem, sprinterWaiting: e.target.value })}
                placeholder="예: 로비 앞, B2, B3 (상황에 따라 변동 가능)"
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
              />
            </div>

            {/* 5. 화장실 위치 */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users2 className="w-3.5 h-3.5 text-slate-400" />
                <span>화장실 위치</span>
              </label>
              <input
                type="text"
                value={editingItem.restroomLocation || ''}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, restroomLocation: e.target.value })
                }
                placeholder="예: 로비층, B2층 (직원 전용 화장실 별도)"
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
              />
            </div>

            {/* 6. 차량 대기 위치 */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-slate-400" />
                <span>차량 대기 위치</span>
              </label>
              <input
                type="text"
                value={editingItem.vehicleWaitingNotes || ''}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, vehicleWaitingNotes: e.target.value })
                }
                placeholder="예: 지하 주차장 대기 구역 (직원 안내 필요)"
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
              />
            </div>

            {/* 7. 추가 정보 (공사, 행사 기간, 주차 제한 등) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span>추가 정보</span>
              </label>
              <textarea
                rows={3}
                value={editingItem.additionalNotes || ''}
                onChange={(e) => setEditingItem({ ...editingItem, additionalNotes: e.target.value })}
                placeholder="추가로 알아야 할 정보가 있다면 입력하세요. (예: 공사, 행사 기간, 주차 제한, VIP 전용 동선 등)"
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:border-[#1E60F3]"
              />
            </div>
          </div>
        )}

        {/* Tab 2: 사진 갤러리 */}
        {editTab === 'photos' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700">현장 참조 사진 목록</h3>
              <button
                type="button"
                onClick={() => {
                  const url = window.prompt('추가할 사진 이미지 URL을 입력하세요:');
                  if (url && url.trim()) {
                    setEditingItem({
                      ...editingItem,
                      photos: [...(editingItem.photos || []), url.trim()],
                    });
                  }
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>사진 추가</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(editingItem.photos || []).map((p, idx) => (
                <div
                  key={idx}
                  className="relative h-28 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group"
                >
                  <img src={p} alt={`사진 ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem({
                        ...editingItem,
                        photos: (editingItem.photos || []).filter((_, i) => i !== idx),
                      });
                    }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {(editingItem.photos || []).length === 0 && (
                <div className="col-span-full py-8 text-center text-xs text-slate-400">
                  등록된 추가 현장 사진이 없습니다.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Action Buttons: [취소] [저장] */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              setCurrentView('list');
              setEditingItem(null);
            }}
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs"
          >
            취소
          </button>

          <button
            type="button"
            onClick={handleSaveItem}
            className="px-6 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-[0_4px_14px_rgba(30,96,243,0.25)] flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>저장</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: LIST SCREEN (Reference 1 PC Card Grid)
  // =========================================================================
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Top Header & Search Bar (Reference 1) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1E60F3]">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>현장 지식</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#1E60F3] border border-blue-100">
                {items.length}개 거점
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              호텔, 공항, 쇼핑, 미팅포인트 등 VIP 의전 현장 특이사항 및 주차·진입 가이드
            </p>
          </div>
        </div>

        {/* Search Input & Add Button */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색어를 입력하세요..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-[#1E60F3] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenAddNew}
            className="px-3.5 py-2 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_4px_12px_rgba(30,96,243,0.2)] transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">새 지식 등록</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills (Reference 1: 전체, 공항, 호텔, 식당, 쇼핑, 교통, 긴급, 기타) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                haptics.selection();
                setSelectedCategory(cat);
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                isSelected
                  ? 'bg-white text-[#1E60F3] border-2 border-[#1E60F3] shadow-2xs'
                  : 'bg-white/80 hover:bg-slate-50 text-slate-600 border border-slate-200'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-xs font-bold text-blue-800 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-[#1E60F3] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 3-Column Card Grid (Reference 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => {
          const isEmergency = item.category === '긴급';

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => handleOpenEdit(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenEdit(item);
                }
              }}
              className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs hover:shadow-md hover:border-[#1E60F3]/40 transition-all cursor-pointer group flex flex-col"
            >
              {/* Card Image Thumbnail */}
              <div className="relative w-full h-44 bg-slate-100 overflow-hidden">
                {isEmergency ? (
                  <div className="w-full h-full bg-rose-50/70 flex items-center justify-center">
                    <div className="w-16 h-14 rounded-2xl bg-white/90 border border-rose-200 flex items-center justify-center shadow-xs">
                      <AlertTriangle className="w-8 h-8 text-rose-500 fill-rose-500/20" />
                    </div>
                  </div>
                ) : (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
                <div className="absolute top-2.5 left-2.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/60 text-white backdrop-blur-xs">
                    {item.categoryBadge || item.category}
                  </span>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 group-hover:text-[#1E60F3] transition-colors tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {item.subtitle || item.description}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#1E60F3] group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate max-w-[200px]">{item.address}</span>
                  <span className="text-[#1E60F3] font-bold group-hover:underline shrink-0">
                    수정하기
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200 p-8">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">검색된 현장 지식이 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">
              다른 검색어를 입력하시거나 카테고리 필터를 변경해 보세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
