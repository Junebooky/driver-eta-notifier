'use client';

import React, { useState, useRef, useId } from 'react';
import {
  X,
  Upload,
  Check,
  Car,
  Truck,
  Bus,
  Users,
  Trash2,
  AlertCircle,
  Sparkles,
  Camera,
  Layers,
  Fuel,
} from 'lucide-react';
import { haptics } from '@/utils/haptics';

export type UiVehicleCategory = 'sedan' | 'suv' | 'van' | 'sprinter';
export type FuelTypeChoice = '경유' | '휘발유' | '하이브리드' | '전기';

export interface NewVehicleFormData {
  plate: string;
  category: UiVehicleCategory;
  model: string;
  fuelType: FuelTypeChoice;
  capacity: string;
  imageUrl: string;
}

export interface NewVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NewVehicleFormData) => void;
}

export interface LibraryVehicleImage {
  id: string;
  name: string;
  sub: string;
  category: UiVehicleCategory;
  imageUrl: string;
}

export const STANDARD_VEHICLE_LIBRARY: LibraryVehicleImage[] = [
  { id: 'lib-sprinter-319', name: '스프린터 319', sub: '투어러 CDI', category: 'sprinter', imageUrl: '/images/vehicles/sprinter_319.webp' },
  { id: 'lib-sprinter-519', name: '스프린터 519', sub: '엑스트라롱', category: 'sprinter', imageUrl: '/images/vehicles/sprinter_519.webp' },
  { id: 'lib-carnival-high', name: '카니발', sub: '하이리무진', category: 'van', imageUrl: '/images/vehicles/carnival_high.webp' },
  { id: 'lib-staria', name: '스타리아', sub: '라운지', category: 'van', imageUrl: '/images/vehicles/staria.webp' },
  { id: 'lib-g90', name: '제네시스 G90', sub: '세단', category: 'sedan', imageUrl: '/images/vehicles/g90_black.webp' },
  { id: 'lib-g90-lwb', name: '제네시스 G90L', sub: '리무진', category: 'sedan', imageUrl: '/images/vehicles/g90_lwb.webp' },
  { id: 'lib-gv80', name: '제네시스 GV80', sub: 'SUV', category: 'suv', imageUrl: '/images/vehicles/gv80.webp' },
  { id: 'lib-s560', name: '벤츠 S560', sub: 'S-클래스', category: 'sedan', imageUrl: '/images/vehicles/s560.webp' },
];

const CATEGORY_OPTIONS: Array<{
  key: UiVehicleCategory;
  label: string;
  icon: React.ElementType;
  defaultModel: string;
  defaultCapacity: string;
  defaultFuel: FuelTypeChoice;
}> = [
  { key: 'sprinter', label: '스프린터', icon: Bus, defaultModel: '벤츠 스프린터 투어러 (319 CDI)', defaultCapacity: '13인승', defaultFuel: '경유' },
  { key: 'van', label: '밴', icon: Truck, defaultModel: '기아 카니발 하이리무진', defaultCapacity: '7인승', defaultFuel: '휘발유' },
  { key: 'sedan', label: '세단', icon: Car, defaultModel: '제네시스 G90 리무진', defaultCapacity: '4인승', defaultFuel: '휘발유' },
  { key: 'suv', label: 'SUV', icon: Car, defaultModel: '제네시스 GV80', defaultCapacity: '6인승', defaultFuel: '휘발유' },
];

const FUEL_OPTIONS: FuelTypeChoice[] = ['경유', '휘발유', '하이브리드', '전기'];
const CAPACITY_PRESETS = ['13인승', '11인승', '9인승', '7인승', '6인승', '4인승'];

export const NewVehicleModal: React.FC<NewVehicleModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form States
  const [plate, setPlate] = useState('');
  const [category, setCategory] = useState<UiVehicleCategory>('sprinter');
  const [model, setModel] = useState('벤츠 스프린터 투어러 (319 CDI)');
  const [fuelType, setFuelType] = useState<FuelTypeChoice>('경유');
  const [capacity, setCapacity] = useState('13인승');

  // Photo Dual Mode States
  const [photoMode, setPhotoMode] = useState<'library' | 'upload'>('library');
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('lib-sprinter-319');
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFileSize, setUploadedFileSize] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);

  // Validation & Error state
  const [errors, setErrors] = useState<{ plate?: string; model?: string; image?: string }>({});

  if (!isOpen) return null;

  // Resolved active image URL for preview
  const activeImageUrl =
    photoMode === 'upload' && uploadedImageUrl
      ? uploadedImageUrl
      : STANDARD_VEHICLE_LIBRARY.find((item) => item.id === selectedLibraryId)?.imageUrl ||
        '/images/vehicles/sprinter_319.webp';

  // Handle Category Change (Auto-suggests model, capacity, and matching library photo)
  const handleCategoryChange = (newCat: UiVehicleCategory) => {
    haptics.selection();
    setCategory(newCat);

    const catPreset = CATEGORY_OPTIONS.find((c) => c.key === newCat);
    if (catPreset) {
      setModel(catPreset.defaultModel);
      setCapacity(catPreset.defaultCapacity);
      setFuelType(catPreset.defaultFuel);
    }

    // Auto-select best matching library image if in library mode
    if (photoMode === 'library') {
      const match = STANDARD_VEHICLE_LIBRARY.find((img) => img.category === newCat);
      if (match) {
        setSelectedLibraryId(match.id);
      }
    }

    if (errors.model) {
      setErrors((prev) => ({ ...prev, model: undefined }));
    }
  };

  // Handle File Upload
  const processUploadedFile = (file: File) => {
    if (!file) return;

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, image: '파일 크기는 최대 10MB까지 지원됩니다.' }));
      haptics.warningPulse();
      return;
    }

    // Validate type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors((prev) => ({ ...prev, image: 'JPG, PNG, WebP 이미지 파일만 업로드할 수 있습니다.' }));
      haptics.warningPulse();
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setUploadedImageUrl(result);
      setUploadedFileName(file.name);
      setUploadedFileSize(
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(file.size / 1024)} KB`
      );
      setErrors((prev) => ({ ...prev, image: undefined }));
      haptics.success();
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDeleteUploadedPhoto = () => {
    haptics.lightTap();
    setUploadedImageUrl(null);
    setUploadedFileName('');
    setUploadedFileSize('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: { plate?: string; model?: string } = {};

    if (!plate.trim()) {
      newErrors.plate = '차량 번호를 입력해 주세요. (예: 125호 9982)';
    }

    if (!model.trim()) {
      newErrors.model = '상세 모델명을 입력해 주세요.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      haptics.warningPulse();
      return;
    }

    onSubmit({
      plate: plate.trim(),
      category,
      model: model.trim(),
      fuelType,
      capacity: capacity.trim() || '13인승',
      imageUrl: activeImageUrl,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-vehicle-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden animate-scale-up"
      >
        {/* ============================================================== */}
        {/* Modal Header (Sticky)                                         */}
        {/* ============================================================== */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0050FF] flex items-center justify-center font-bold shadow-2xs">
              <Car className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h2 id="new-vehicle-modal-title" className="text-base font-black text-slate-900 tracking-tight">
                신규 차량 등록
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                본사 관제 시스템에 신규 의전 차량을 즉시 등록합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            aria-label="닫기"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================== */}
        {/* Modal Body (Scrollable)                                       */}
        {/* ============================================================== */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* 1. 차량 외관 사진 등록 (핵심: 듀얼 모드) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#0050FF]" />
                <span>차량 외관 사진 등록</span>
              </label>

              {/* Segmented Control (Tabs) */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setPhotoMode('library');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    photoMode === 'library'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>기본 라이브러리</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setPhotoMode('upload');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    photoMode === 'upload'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  <span>새 사진 업로드</span>
                </button>
              </div>
            </div>

            {/* Representative Image Preview (Clean Elevated Frame) */}
            <div className="w-full h-44 rounded-2xl bg-gradient-to-b from-slate-50/90 to-slate-100/40 border border-slate-200/80 flex items-center justify-center relative overflow-hidden group shadow-inner">
              <div className="absolute top-2.5 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-xs border border-slate-200/60 shadow-2xs text-[10px] font-bold text-slate-700">
                <Sparkles className="w-3 h-3 text-[#0050FF]" />
                <span>대표 사진 미리보기</span>
              </div>

              {photoMode === 'upload' && uploadedImageUrl && (
                <div className="absolute top-2.5 right-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 shadow-2xs text-[10px] font-bold text-emerald-700">
                  <Check className="w-3 h-3" />
                  <span>직접 업로드됨</span>
                </div>
              )}

              <img
                src={activeImageUrl}
                alt="차량 대표 사진"
                className="max-h-36 max-w-[85%] object-contain drop-shadow-md transition-transform duration-200 group-hover:scale-105 select-none"
              />
            </div>

            {/* TAB 1: Standard Vehicle Library (4-Column Grid) */}
            {photoMode === 'library' && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500">
                  표준 차량 대표 이미지 선택 (4열 그리드)
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {STANDARD_VEHICLE_LIBRARY.map((item) => {
                    const isSelected = selectedLibraryId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setSelectedLibraryId(item.id);
                        }}
                        className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col items-center justify-between gap-1 relative ${
                          isSelected
                            ? 'ring-2 ring-[#0050FF] bg-blue-50/40 border-[#0050FF] shadow-2xs'
                            : 'bg-white border-slate-200/80 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#0050FF] text-white flex items-center justify-center shadow-xs">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                        <div className="w-full h-12 flex items-center justify-center">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="max-h-10 max-w-full object-contain"
                          />
                        </div>
                        <div className="text-center w-full">
                          <div className="text-[11px] font-extrabold text-slate-900 truncate">
                            {item.name}
                          </div>
                          <div className="text-[9px] text-slate-400 font-medium truncate">
                            {item.sub}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: Direct File Upload */}
            {photoMode === 'upload' && (
              <div className="space-y-2">
                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {!uploadedImageUrl ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                      isDragOver
                        ? 'border-[#0050FF] bg-blue-50/50'
                        : 'border-slate-200 hover:border-blue-300 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-[#0050FF] flex items-center justify-center shadow-2xs">
                      <Upload className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        클릭하거나 사진을 드래그하여 업로드하세요
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        JPG, PNG, WebP 지원 (최대 10MB)
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                        <img
                          src={uploadedImageUrl}
                          alt="업로드 미리보기"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {uploadedFileName || '업로드된 사진'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {uploadedFileSize || '이미지 준비 완료'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
                      >
                        사진 변경
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteUploadedPhoto}
                        className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer transition-colors"
                        title="업로드 사진 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {errors.image && (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-rose-600">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{errors.image}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. 차량 필수 제원 입력 필드 */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            {/* 차량 번호 (필수) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-900 flex items-center justify-between">
                <span>차량 번호 <span className="text-rose-500">*</span></span>
                <span className="text-[11px] text-slate-400 font-normal">정확한 차량 등록번호</span>
              </label>
              <input
                type="text"
                value={plate}
                onChange={(e) => {
                  setPlate(e.target.value);
                  if (errors.plate) setErrors((prev) => ({ ...prev, plate: undefined }));
                }}
                placeholder="예) 125호 9982"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all focus:outline-hidden ${
                  errors.plate
                    ? 'border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500'
                    : 'border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0050FF]'
                }`}
              />
              {errors.plate && (
                <div className="flex items-center gap-1 text-[11px] font-bold text-rose-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.plate}</span>
                </div>
              )}
            </div>

            {/* 차종 분류 (4구역 라디오 세그먼트 버튼) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-900 block">
                차종 분류 <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {CATEGORY_OPTIONS.map((cat) => {
                  const Icon = cat.icon;
                  const isChecked = category === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => handleCategoryChange(cat.key)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isChecked
                          ? 'bg-[#0050FF] text-white border-[#0050FF] shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 상세 모델명 (필수) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-900 flex items-center justify-between">
                <span>상세 모델명 <span className="text-rose-500">*</span></span>
                <span className="text-[11px] text-slate-400 font-normal">제조사 및 트림 표기</span>
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  if (errors.model) setErrors((prev) => ({ ...prev, model: undefined }));
                }}
                placeholder="예) 벤츠 스프린터 투어러 (319 CDI)"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all focus:outline-hidden ${
                  errors.model
                    ? 'border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500'
                    : 'border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0050FF]'
                }`}
              />
              {errors.model && (
                <div className="flex items-center gap-1 text-[11px] font-bold text-rose-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.model}</span>
                </div>
              )}
            </div>

            {/* 유종 선택 & 승차 정원 (2열 그리드) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 유종 선택 (알약 칩 선택형) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-slate-500" />
                  <span>유종 선택</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {FUEL_OPTIONS.map((f) => {
                    const isSelected = fuelType === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setFuelType(f);
                        }}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center border ${
                          isSelected
                            ? 'bg-blue-50 text-[#0050FF] border-blue-300 font-black shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 승차 정원 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>승차 정원</span>
                </label>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {CAPACITY_PRESETS.map((cap) => {
                      const isSelected = capacity === cap;
                      return (
                        <button
                          key={cap}
                          type="button"
                          onClick={() => {
                            haptics.selection();
                            setCapacity(cap);
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {cap}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="직접 입력 예) 13인승"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50/50 focus:bg-white focus:outline-hidden focus:border-[#0050FF]"
                  />
                </div>
              </div>
            </div>

            {/* 초기 상태 (기본값 '배차 가능' 자동 지정) */}
            <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-extrabold text-emerald-900">
                  초기 운영 상태
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black border border-emerald-300 flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>배차 가능 (자동 지정)</span>
              </span>
            </div>
          </div>

          {/* ============================================================== */}
          {/* Modal Footer (Sticky)                                         */}
          {/* ============================================================== */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between sticky bottom-0 bg-white/95 backdrop-blur-xs z-10 -mx-6 -mb-6 px-6 py-4">
            <button
              type="button"
              onClick={() => {
                haptics.lightTap();
                onClose();
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer active:scale-95 transition-all"
            >
              취소
            </button>

            <button
              type="submit"
              className="bg-[#0050FF] hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs cursor-pointer shadow-xs active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[2.2]" />
              <span>차량 등록 완료</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
