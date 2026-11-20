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
import { useSharedFieldKnowledge, mutateSharedFieldKnowledge } from '@/hooks/useSharedFieldKnowledge';
import { getBrowserKnowledgeImportReview, type LegacyKnowledgeReview } from '@/utils/legacyFieldKnowledgeImport';
import { haptics } from '@/utils/haptics';
import { formatPhoneNumber } from '@/utils/formatters';
import { HqSearchSelect } from '@/components/hq/ui/HqSearchSelect';
import { HqModal } from '@/components/hq/ui/HqModal';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import { isValidFieldKnowledgeImageUrl } from '@/utils/hqKnowledgeImageUrl';
import {HqButton,HqCard,HqBadge,HqInput,HqSegmentedTabs} from '@/components/hq/ui';
import {HqFieldKnowledgeEditor} from './HqFieldKnowledgeEditor';
import {emptyFieldKnowledgeGuide,validateFieldKnowledgeGuide} from '@/utils/fieldKnowledgeGuide';
import {uploadKnowledgePhoto,cleanupUncommittedKnowledgePhotos,type UploadedKnowledgeImage} from '@/utils/fieldKnowledgeImageUpload';

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
  const { items, loading: knowledgeLoading, error: knowledgeError, refresh: refreshKnowledge } = useSharedFieldKnowledge();
  const [isMutating, setIsMutating] = useState(false);
  const [legacyDialogOpen, setLegacyDialogOpen] = useState(false);
  const [legacyReview, setLegacyReview] = useState<LegacyKnowledgeReview | null>(null);
  const [selectedLegacyIds, setSelectedLegacyIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<FieldKnowledgeCategory>('전체');

  // View state: 'list' | 'edit'
  const [currentView, setCurrentView] = useState<'list' | 'edit'>('list');
  const [editingItem, setEditingItem] = useState<FieldKnowledgeItem | null>(null);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'info' | 'error'>('info');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const showToast = (msg: string, tone: 'info' | 'error' = 'info') => {
    setFeedbackTone(tone);
    setToastMessage(msg);
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
    setToastMessage(null);
    setCurrentView('edit');
  };

  // Handle Add New Place click
  const handleOpenAddNew = () => {
    haptics.mediumTap();
    const newItem: FieldKnowledgeItem = {
      id: `fk-${crypto.randomUUID()}`,
      title: '',
      subtitle: '',
      category: '호텔',
      categoryBadge: '호텔',
      description: '',
      imageUrl: '/images/icons/knowledge/icon_knowledge.png',
      photos: [],
      guide: emptyFieldKnowledgeGuide(),
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
    setToastMessage(null);
    setCurrentView('edit');
  };

  // Uploaded files stay local until Save. Never persist blob/object URLs.
  // If the DB write fails, clean up just files from this save attempt.
  const handleSaveItem=async(coverFile:File|null=null,galleryFiles:File[]=[])=>{
    if(!editingItem||isMutating)return;
    if(!editingItem.title.trim()){showToast('장소명을 입력해 주세요.','error');return;}
    const validated=validateFieldKnowledgeGuide(editingItem.guide||emptyFieldKnowledgeGuide());
    if(!validated.ok){showToast(validated.error,'error');return;}
    if((editingItem.photos?.length||0)+galleryFiles.length>25){
      showToast('사진 갤러리는 최대 25장까지 등록할 수 있습니다.','error');return;
    }
    setIsMutating(true);
    const uploaded:UploadedKnowledgeImage[]=[];
    let committed=false;
    try{
      let coverUrl=editingItem.imageUrl;
      if(coverFile){
        const saved=await uploadKnowledgePhoto(editingItem.id,coverFile);
        uploaded.push(saved);
        coverUrl=saved.url;
      }
      const photos=[...(editingItem.photos||[])];
      for(const file of galleryFiles){
        const saved=await uploadKnowledgePhoto(editingItem.id,file);
        uploaded.push(saved);
        photos.push(saved.url);
      }
      const next:FieldKnowledgeItem={
        ...editingItem,imageUrl:coverUrl,photos,guide:validated.guide,
      };
      if(!isValidFieldKnowledgeImageUrl(next.imageUrl)||
        photos.some(url=>!isValidFieldKnowledgeImageUrl(url)))
        throw new Error('이미지 URL이 올바르지 않습니다.');
      const existing=Number.isSafeInteger(editingItem.version)&&Number(editingItem.version)>0;
      const result=await mutateSharedFieldKnowledge(existing?'PUT':'POST',{
        item:next,...(existing?{expectedVersion:editingItem.version}:{}),
      });
      if(!result.ok)throw new Error(result.error||'현장 지식 저장에 실패했습니다.');
      committed=true;
      haptics.success();
      showToast("'"+editingItem.title+"' 현장 지식과 표준 양식이 저장되었습니다.");
      setCurrentView('list');
      setEditingItem(null);
      await refreshKnowledge();
    }catch(e){
      if(!committed)await cleanupUncommittedKnowledgePhotos(uploaded);
      haptics.errorAlert();
      showToast(e instanceof Error?e.message:'이미지를 저장하지 못했습니다.','error');
    }finally{
      setIsMutating(false);
    }
  };

  const handleDeleteItem = () => {
    if (editingItem?.version) setDeleteDialogOpen(true);
  };

  const confirmDeleteItem = async () => {
    if (!editingItem?.version || isMutating) return;
    setIsMutating(true);
    try {
      const response = await mutateSharedFieldKnowledge('DELETE', {
        id: editingItem.id, expectedVersion: editingItem.version,
      });
      if (!response.ok) {
        haptics.errorAlert();
        showToast(response.error || '서버에서 삭제하지 못했습니다.', 'error');
        setDeleteDialogOpen(false);
        return;
      }
      haptics.mediumTap();
      showToast(`'${editingItem.title}' 항목을 회사 공용 DB에서 삭제했습니다.`);
      setDeleteDialogOpen(false);
      setCurrentView('list');
      setEditingItem(null);
      await refreshKnowledge();
    } finally {
      setIsMutating(false);
    }
  };

  const openLegacyDialog = () => {
    const review = getBrowserKnowledgeImportReview();
    setLegacyReview(review);
    setSelectedLegacyIds([]);
    setLegacyDialogOpen(true);
    setToastMessage(null);
  };

  const confirmLegacyImport = async () => {
    if (isMutating || !legacyReview) return;
    const selected = legacyReview.candidates.filter(item => selectedLegacyIds.includes(item.id));
    if (!selected.length || selected.length > 50) {
      showToast('한 번에 1~50개 항목을 선택해 주세요.', 'error');
      return;
    }
    setIsMutating(true);
    try {
      const result = await mutateSharedFieldKnowledge('POST', { action: 'import', items: selected });
      if (!result.ok) {
        showToast(result.error || '브라우저 항목 가져오기에 실패했습니다.', 'error');
        return;
      }
      setLegacyDialogOpen(false);
      showToast(`회사 공용 DB에 ${result.imported || 0}건 등록했습니다. 이미 존재하는 ${result.skipped || 0}건은 덮어쓰지 않았습니다. 기존 브라우저 데이터는 보존됩니다.`);
      await refreshKnowledge();
    } finally {
      setIsMutating(false);
    }
  };

  if(currentView==='edit'&&editingItem){
    return <>
      <HqFieldKnowledgeEditor item={editingItem} onChange={setEditingItem}
        onSave={(cover,gallery)=>{void handleSaveItem(cover,gallery);}}
        onCancel={()=>{if(isMutating)return;setEditingItem(null);setCurrentView('list');}}
        onDelete={handleDeleteItem} saving={isMutating}/>
      <HqModal isOpen={deleteDialogOpen}
        title="현장 지식 삭제" subtitle={editingItem.title}
        onClose={()=>setDeleteDialogOpen(false)}
        footer={<>
          <HqButton variant="secondary" onClick={()=>setDeleteDialogOpen(false)}>취소</HqButton>
          <HqButton variant="danger" disabled={isMutating}
            onClick={()=>void confirmDeleteItem()}>삭제하기</HqButton>
        </>}>
        <p className="text-[12px] leading-relaxed text-[#65758B]">
          해당 현장 지식은 관리자와 기사 화면에서 보관 처리됩니다.
        </p>
      </HqModal>
    </>;
  }

  // =========================================================================
  // VIEW: LIST SCREEN (Reference 1 PC Card Grid)
  // =========================================================================
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Top Header & Search Bar (Reference 1) */}
      <HqCard className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-center gap-3">
          <div className="relative group/knowledge inline-flex items-center justify-center cursor-pointer shrink-0">
            <img
              src="/images/icons/knowledge/icon_knowledge.png"
              alt="현장지식 아이콘"
              className="w-12 h-12 object-contain shrink-0 transition-transform duration-150 group-hover/knowledge:scale-110"
            />

            {/* Hover Tooltip: 위로 향하는 블랙 말풍선 규격 (아이콘 근접 시에만 노출, 최상단 레이어) */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/knowledge:flex flex-col items-start pointer-events-none z-[100]">
              <span className="whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#52647A] shadow-[0_8px_22px_rgba(35,49,78,0.1)] animate-in fade-in-50 duration-150">
                VIP 의전 현장의 주차장·동선·진입 노하우가 모여있어요
              </span>
              <div className="w-2 h-2 bg-white rotate-45 -mt-1 ml-5 shadow-xs" />
            </div>
          </div>

          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>현장 지식</span>
              <HqBadge>{items.length}개 거점</HqBadge>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              회사 공용 현장 지식 · 기사 Cockpit 자동 동기화 (최대 약 30초)
            </p>
          </div>
        </div>

        {/* Search Input & Add Button */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <HqInput type="search" aria-label="현장 지식 검색" value={searchQuery}
              onChange={event=>setSearchQuery(event.target.value)}
              placeholder="현장명, 주소, 안내사항 검색" className="w-full pl-10 pr-9"/>
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

          <HqButton variant="secondary" size="sm" onClick={openLegacyDialog}
            title="기존 브라우저 지식을 검토한 뒤 수동 이전">
            기존 데이터 가져오기
          </HqButton>
          <HqButton variant="primary" size="sm"
            disabled={knowledgeLoading||Boolean(knowledgeError)} onClick={handleOpenAddNew}>
            <Plus className="size-4"/> 새 지식 등록
          </HqButton>
        </div>
      </HqCard>

      <div className="overflow-x-auto pb-1">
        <HqSegmentedTabs aria-label="현장 지식 카테고리"
          value={selectedCategory}
          onValueChange={value=>{haptics.selection();setSelectedCategory(value as FieldKnowledgeCategory);}}
          tabs={CATEGORIES.map(category=>({id:category,label:category}))}/>
      </div>

      {/* Toast Feedback */}
      <HqInlineFeedback
          message={toastMessage}
          tone={feedbackTone}
          onDismiss={() => setToastMessage(null)}
        />

      {knowledgeError && (
        <HqInlineFeedback message={`회사 공용 현장 지식 서버 연결 실패: ${knowledgeError}. 이전에 표시된 내용은 최신 정보가 아닐 수 있습니다.`}
          onDismiss={undefined} />
      )}
      {knowledgeError && (
        <button type="button" onClick={() => void refreshKnowledge()}
          className="rounded-[12px] bg-[#F2F5FA] px-3 py-2 text-[12px] font-semibold text-[#516783]">
          다시 조회
        </button>
      )}
      {knowledgeLoading && (
        <p role="status" className="text-[12px] font-medium text-[#6F8098]">회사 공용 현장 지식 동기화 중…</p>
      )}

      {/* 3-Column Card Grid (Reference 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => {
          const isEmergency = item.category === '긴급';

          return (
            <HqCard
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
              className="group flex cursor-pointer flex-col overflow-hidden p-0 transition-shadow hover:shadow-md"
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
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/95 text-[#52647A]">
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
            </HqCard>
          );
        })}

        {filteredItems.length === 0 && (
          <HqCard className="col-span-full p-8 py-16 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">검색된 현장 지식이 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">
              다른 검색어를 입력하시거나 카테고리 필터를 변경해 보세요.
            </p>
          </HqCard>
        )}
      </div>
      <HqModal
        isOpen={legacyDialogOpen}
        title="기존 브라우저 데이터 가져오기"
        subtitle="관리자 확인 후 선택한 정보만 회사 공용 DB에 등록합니다."
        onClose={() => { if (!isMutating) setLegacyDialogOpen(false); }}
        footer={
          <>
            <button type="button" disabled={isMutating}
              onClick={() => setLegacyDialogOpen(false)}
              className="min-h-10 rounded-[12px] bg-[#F4F6FA] px-4 text-[12px] font-semibold text-[#60728A]">
              취소
            </button>
            <button type="button" disabled={isMutating || selectedLegacyIds.length === 0 || selectedLegacyIds.length > 50}
              onClick={() => void confirmLegacyImport()}
              className="min-h-10 rounded-[12px] bg-[#1E60F3] px-4 text-[12px] font-semibold text-white disabled:opacity-50">
              {isMutating ? '등록 중…' : `선택한 ${selectedLegacyIds.length}건 등록`}
            </button>
          </>
        }
      >
        <p className="mb-3 text-[12px] leading-relaxed text-[#5D6E85]">
          이 기기의 기존 정보를 검토하는 기능입니다. 기본 예시 항목은 자동으로 제외하며, 기존 회사 데이터는 절대 덮어쓰지 않습니다.
          등록된 항목은 모든 기사에게 표시되므로 정확성을 확인한 후 선택해 주세요.
        </p>
        {legacyReview && (
          <p className="mb-3 text-[11px] font-medium text-[#8090A4]">
            가져오기 후보 {legacyReview.candidates.length}건 · 변경 없는 예시 제외 {legacyReview.skippedSamples}건
            {legacyReview.invalid > 0 ? ` · 형식 오류 제외 ${legacyReview.invalid}건` : ''}
          </p>
        )}
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {legacyReview?.candidates.map(item => (
            <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-[13px] bg-[#F7F9FC] px-3 py-3">
              <input type="checkbox" checked={selectedLegacyIds.includes(item.id)}
                onChange={event => setSelectedLegacyIds(previous => event.target.checked
                  ? [...previous, item.id] : previous.filter(id => id !== item.id))}
                className="mt-0.5 size-4 accent-[#1E60F3]" />
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-[#293D55]">{item.title}</span>
                <span className="block text-[11px] text-[#8593A7]">{item.category} · {item.address || '주소 미기입'}</span>
              </span>
            </label>
          ))}
          {legacyReview?.candidates.length === 0 && (
            <p className="py-4 text-center text-[12px] text-[#8090A4]">이 기기에서 가져올 사용자 작성 정보가 없습니다.</p>
          )}
        </div>
        <HqInlineFeedback message={feedbackTone === 'error' ? toastMessage : null} className="mt-3"/>
      </HqModal>
    </div>
  );
};
