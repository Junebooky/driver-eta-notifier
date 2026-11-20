'use client';

import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,Camera,CheckCircle2,ChevronLeft,ImagePlus,Trash2} from 'lucide-react';
import type {FieldKnowledgeItem,FieldKnowledgeCategory} from '@/types/fieldKnowledge';
import {emptyFieldKnowledgeGuide} from '@/utils/fieldKnowledgeGuide';
import {validateKnowledgePhoto} from '@/utils/fieldKnowledgeImageUpload';
import {HqBadge,HqButton,HqCard,HqFieldHint,HqFieldLabel,HqInput,HqSectionTitle,HqTextarea,HqSegmentedTabs} from '@/components/hq/ui';
import {HqSearchSelect} from '@/components/hq/ui/HqSearchSelect';
import {HqFieldKnowledgeStructuredForm} from './HqFieldKnowledgeStructuredForm';

interface Props {
  item:FieldKnowledgeItem;
  onChange:(item:FieldKnowledgeItem)=>void;
  onSave:(cover:File|null,gallery:File[])=>void;
  onCancel:()=>void;
  onDelete:()=>void;
  saving:boolean;
}
const CATEGORIES:Exclude<FieldKnowledgeCategory,'전체'>[]=
  ['공항','호텔','식당','쇼핑','교통','긴급','기타'];
export function HqFieldKnowledgeEditor({item,onChange,onSave,onCancel,onDelete,saving}:Props){
  const [tab,setTab]=useState<'guide'|'photos'>('guide');
  const [cover,setCover]=useState<File|null>(null);
  const [extra,setExtra]=useState<File[]>([]);
  const [issue,setIssue]=useState('');
  const coverRef=useRef<HTMLInputElement>(null);
  const galleryRef=useRef<HTMLInputElement>(null);
  const coverPreview=useMemo(()=>cover?URL.createObjectURL(cover):item.imageUrl,[cover,item.imageUrl]);
  const galleryPreview=useMemo(()=>extra.map(file=>URL.createObjectURL(file)),[extra]);
  useEffect(()=>()=>{if(cover)URL.revokeObjectURL(coverPreview);},[cover,coverPreview]);
  useEffect(()=>()=>{galleryPreview.forEach(URL.revokeObjectURL);},[galleryPreview]);

  const selectCover=(file:File|undefined)=>{
    if(!file)return;
    const error=validateKnowledgePhoto(file);
    if(error){setIssue(error);return;}
    setIssue('');
    setCover(file);
  };
  const selectGallery=(files:FileList|null)=>{
    if(!files)return;
    const incoming=Array.from(files);
    const error=incoming.map(validateKnowledgePhoto).find(Boolean);
    if(error){setIssue(error);return;}
    if((item.photos?.length||0)+extra.length+incoming.length>25){
      setIssue('현장 사진은 최대 25장까지 등록할 수 있어요.');return;
    }
    setIssue('');
    setExtra(previous=>[...previous,...incoming]);
  };
  const updateGuide=(guide:NonNullable<FieldKnowledgeItem['guide']>)=>
    onChange({...item,guide});
  const gallery=[...(item.photos||[]).map((url,index)=>({key:'stored-'+index,url,pending:false,index})),
    ...galleryPreview.map((url,index)=>({key:'pending-'+index,url,pending:true,index}))];

  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5EAF2] pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/images/icons/knowledge/icon_knowledge.png" alt="" draggable={false}
          className="size-11 shrink-0 object-contain"/>
        <div>
          <h2 className="text-[18px] sm:text-[17px] font-semibold tracking-[-0.02em] text-[#17233B]">
            {item.version?'현장 지식 수정':'현장 지식 등록'}
          </h2>
          <HqFieldHint className="mt-0.5">정해진 양식으로 저장하면 모든 기사 화면에 같은 형식으로 표시됩니다.</HqFieldHint>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {item.version&&<HqButton variant="danger" size="sm" disabled={saving} onClick={onDelete}>
          <Trash2 className="size-4"/> 삭제
        </HqButton>}
        <HqButton variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          <ChevronLeft className="size-4"/> 목록으로
        </HqButton>
      </div>
    </div>

    <HqCard className="p-4 sm:p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <HqFieldLabel>대표 이미지</HqFieldLabel>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[15px] bg-[#F5F7FB]">
            <img src={coverPreview} alt={item.title||'대표 이미지'}
              className="size-full object-cover"/>
            <div className="absolute bottom-2 left-2">
              <HqButton variant="secondary" size="sm" disabled={saving} onClick={()=>coverRef.current?.click()}>
                <Camera className="size-4"/> {cover?'이미지 다시 선택':'대표 이미지 변경'}
              </HqButton>
            </div>
          </div>
          <input ref={coverRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp"
            aria-label="대표 이미지 파일 업로드" disabled={saving}
            onChange={event=>{selectCover(event.target.files?.[0]);event.target.value='';}}/>
          <HqFieldHint>파일 직접 업로드 · PNG/JPG/WebP · 각 8MB 이하. 최종 저장 시 서버에 업로드돼요.</HqFieldHint>
        </div>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <label className="block min-w-0 sm:col-span-2">
            <HqFieldLabel>장소명 *</HqFieldLabel>
            <HqInput required maxLength={160} value={item.title}
              onChange={event=>onChange({...item,title:event.target.value})}
              placeholder="예: 안다즈 서울 강남"/>
          </label>
          <div className="min-w-0">
            <HqFieldLabel>카테고리 *</HqFieldLabel>
            <HqSearchSelect label="현장 지식 카테고리" placeholder="카테고리 선택" value={item.category} size="md"
              onChange={value=>onChange({...item,category:value as FieldKnowledgeItem['category'],categoryBadge:value})}
              options={CATEGORIES.map(value=>({value,label:value}))}/>
          </div>
          <label className="block min-w-0">
            <HqFieldLabel>한 줄 설명 <span className="text-[#9AA5B4]">({item.description.length}/100)</span></HqFieldLabel>
            <HqInput maxLength={100} value={item.description}
              onChange={event=>onChange({...item,description:event.target.value})}
              placeholder="장소 특징을 100자 이내로"/>
          </label>
          <label className="block min-w-0 sm:col-span-2">
            <HqFieldLabel>기사에게 보여줄 한 줄 안내</HqFieldLabel>
            <HqInput maxLength={240} value={item.subtitle||''}
              onChange={event=>onChange({...item,subtitle:event.target.value})}
              placeholder="예: VIP 승하차는 정문 우측에서 진행"/>
          </label>
        </div>
      </div>
    </HqCard>

    <HqSegmentedTabs aria-label="현장 지식 편집 영역" className="w-full"
      value={tab} onValueChange={value=>setTab(value as 'guide'|'photos')}
      tabs={[{id:'guide',label:'현장 정보 양식'},{id:'photos',label:'사진 갤러리',
        count:gallery.length||undefined}]}/>

    {tab==='guide'&&<>
      <HqCard className="p-4 sm:p-5">
        <HqSectionTitle className="mb-3">
          <BookOpen className="size-4 text-[#8292A6]"/> 기본 연락처
        </HqSectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0 sm:col-span-2">
            <HqFieldLabel>주소</HqFieldLabel>
            <HqInput maxLength={500} value={item.address}
              onChange={event=>onChange({...item,address:event.target.value})}
              placeholder="예: 서울시 강남구 논현로 854"/>
          </label>
          <label className="block min-w-0">
            <HqFieldLabel>대표전화</HqFieldLabel>
            <HqInput type="tel" maxLength={150} value={item.phone||''}
              onChange={event=>onChange({...item,phone:event.target.value})}
              placeholder="02-123-4567"/>
          </label>
          <label className="block min-w-0">
            <HqFieldLabel>공식 웹사이트</HqFieldLabel>
            <HqInput type="url" maxLength={2048} value={item.website||''}
              onChange={event=>onChange({...item,website:event.target.value})}
              placeholder="https://"/>
          </label>
        </div>
      </HqCard>
      <HqFieldKnowledgeStructuredForm guide={item.guide||emptyFieldKnowledgeGuide()}
        onChange={updateGuide} legacyItem={item}/>
    </>}

    {tab==='photos'&&<HqCard className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <HqSectionTitle>현장 사진 갤러리</HqSectionTitle>
          <HqFieldHint className="mt-1">입구, 주차장, 승하차 지점 등 현장 참고 사진을 추가해 주세요.</HqFieldHint>
        </div>
        <HqButton variant="secondary" size="sm" disabled={saving||gallery.length>=25}
          onClick={()=>galleryRef.current?.click()}><ImagePlus className="size-4"/> 사진 업로드</HqButton>
        <input ref={galleryRef} type="file" multiple className="hidden"
          aria-label="현장 사진 파일 업로드" accept="image/png,image/jpeg,image/webp"
          onChange={event=>{selectGallery(event.target.files);event.target.value='';}}/>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {gallery.map(photo=><div key={photo.key}
          className="relative aspect-[4/3] overflow-hidden rounded-[13px] bg-[#F5F7FB]">
          <img src={photo.url} alt={'현장 사진 '+(photo.index+1)}
            className="size-full object-cover"/>
          {photo.pending&&<span className="absolute bottom-2 left-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] text-[#526680]">저장 대기</span>}
          <HqButton variant="danger" size="sm" disabled={saving}
            className="absolute right-1.5 top-1.5"
            aria-label={'사진 '+(photo.index+1)+' 제거'}
            onClick={()=>photo.pending?setExtra(previous=>previous.filter((_,i)=>i!==photo.index)):
              onChange({...item,photos:(item.photos||[]).filter((_,i)=>i!==photo.index)})}>
            <Trash2 className="size-3.5"/>
          </HqButton>
        </div>)}
      </div>
      {!gallery.length&&<p className="py-8 text-center text-[13px] sm:text-[12px] text-[#9BA8B7]">등록된 현장 사진이 없습니다.</p>}
    </HqCard>}

    {issue&&<p role="alert" className="rounded-[13px] bg-[#FFF5F2] px-4 py-3 text-[13px] sm:text-[12px] text-[#A95045]">{issue}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2 pb-6">
      <HqButton variant="secondary" disabled={saving} onClick={onCancel}>취소</HqButton>
      <HqButton variant="primary" disabled={saving||!item.title.trim()} loading={saving}
        onClick={()=>onSave(cover,extra)}>
        <CheckCircle2 className="size-4"/>{saving?'서버에 저장 중…':'변경사항 저장'}
      </HqButton>
    </div>
  </div>;
}
