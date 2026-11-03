'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  User,
  Car,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Loader2,
  ExternalLink,
  Bus,
  Truck,
  Check,
  Search,
  Sparkles,
} from 'lucide-react';
import { HqDriverSummary } from '@/types/driverHq';
import {
  DriverVehicleAssetBundle,
} from '@/types/driverVehicleAsset';
import {
  VIP_REAL_VEHICLES,
  VipRealVehicle,
  resolveVehicleEntity,
  getVehicleImage,
} from '@/utils/vehicleData';
import { haptics } from '@/utils/haptics';

export interface HqDriverAssetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  drivers: HqDriverSummary[];
  initialDriverId?: string;
  initialVehiclePlate?: string;
  onAssetUpdated?: () => void;
}

export const HqDriverAssetManagerModal: React.FC<HqDriverAssetManagerModalProps> = ({
  isOpen,
  onClose,
  drivers,
  initialDriverId,
  initialVehiclePlate,
  onAssetUpdated,
}) => {
  const [selectedDriverId, setSelectedDriverId] = useState<string>(initialDriverId || '');
  const [selectedVehiclePlate, setSelectedVehiclePlate] = useState<string>(() => {
    if (initialVehiclePlate && VIP_REAL_VEHICLES.some((v) => v.plate === initialVehiclePlate)) {
      return initialVehiclePlate;
    }
    return VIP_REAL_VEHICLES[0]?.plate || '125호 9982';
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState<string>('');

  const [bundle, setBundle] = useState<DriverVehicleAssetBundle | null>(null);
  const [vehicleAssetSummary, setVehicleAssetSummary] = useState<Record<string, { pc: boolean; mobile: boolean }>>({});
  const [isDbReady, setIsDbReady] = useState<boolean>(true);
  const [dbNotice, setDbNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState<'profile' | 'pc' | 'mobile' | null>(null);
  const [isDraggingProfile, setIsDraggingProfile] = useState(false);
  const [isDraggingPc, setIsDraggingPc] = useState(false);
  const [isDraggingMobile, setIsDraggingMobile] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const profileInputRef = useRef<HTMLInputElement>(null);
  const pcInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial props
  useEffect(() => {
    if (initialDriverId) setSelectedDriverId(initialDriverId);
    if (initialVehiclePlate && VIP_REAL_VEHICLES.some((v) => v.plate === initialVehiclePlate)) {
      setSelectedVehiclePlate(initialVehiclePlate);
    } else if (VIP_REAL_VEHICLES.length > 0) {
      setSelectedVehiclePlate(VIP_REAL_VEHICLES[0].plate);
    }
  }, [initialDriverId, initialVehiclePlate, isOpen]);

  // Set default driver and vehicle if none selected
  useEffect(() => {
    if (!selectedDriverId && drivers.length > 0) {
      setSelectedDriverId(drivers[0].id);
    }
    if (!selectedVehiclePlate && VIP_REAL_VEHICLES.length > 0) {
      setSelectedVehiclePlate(VIP_REAL_VEHICLES[0].plate);
    }
  }, [drivers, selectedDriverId, selectedVehiclePlate]);

  const activeDriver = useMemo(() => {
    return drivers.find((d) => d.id === selectedDriverId) || drivers[0] || null;
  }, [drivers, selectedDriverId]);

  const activeVehicle = useMemo(() => {
    const targetPlate =
      selectedVehiclePlate && VIP_REAL_VEHICLES.some((v) => v.plate === selectedVehiclePlate)
        ? selectedVehiclePlate
        : VIP_REAL_VEHICLES[0]?.plate || '125호 9982';
    return resolveVehicleEntity(targetPlate);
  }, [selectedVehiclePlate]);

  // Clean vehicle display name (eliminating double brand names like '벤츠 벤츠...')
  const displayVehicleName = useMemo(() => {
    if (!activeVehicle) return '';
    const brand = activeVehicle.brand || '';
    const model = activeVehicle.model || '';
    if (model.startsWith('벤츠')) {
      return model.replace(/^벤츠\s*/, '메르세데스-벤츠 ');
    }
    if (model.startsWith(brand)) {
      return model;
    }
    return `${brand} ${model}`.trim();
  }, [activeVehicle]);

  // Category Tabs Configuration
  const categoryTabs = useMemo(() => [
    { key: 'all', label: '전체', count: VIP_REAL_VEHICLES.length, icon: Car },
    { key: 'sprinter', label: '스프린터', count: 9, icon: Bus },
    { key: 'staria', label: '스타리아', count: 4, icon: Truck },
    { key: 'carnival', label: '카니발', count: 2, icon: Truck },
    { key: 'genesis', label: '제네시스', count: 4, icon: Car },
    { key: 's_class', label: 'S-클래스', count: 1, icon: Car },
  ], []);

  // Filtered vehicles based on category and search
  const filteredVehicles = useMemo(() => {
    return VIP_REAL_VEHICLES.filter((v) => {
      const matchesCategory = selectedCategory === 'all' || v.category === selectedCategory;
      const q = vehicleSearchQuery.trim().toLowerCase();
      const matchesSearch = !q || v.plate.toLowerCase().includes(q) || v.model.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, vehicleSearchQuery]);

  // Count total completed vehicles for this driver
  const completedVehiclesCount = useMemo(() => {
    return Object.values(vehicleAssetSummary).filter((s) => s.pc && s.mobile).length;
  }, [vehicleAssetSummary]);

  // Load bundle whenever driver or vehicle selection changes
  const fetchBundle = async () => {
    if (!activeDriver?.id) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const vPlate = activeVehicle.plate;
      const res = await fetch(
        `/api/hq/drivers/assets?driverId=${encodeURIComponent(activeDriver.id)}&vehiclePlate=${encodeURIComponent(vPlate)}&type=bundle`
      );
      const json = await res.json();
      if (res.ok && json.ok) {
        setBundle(json.bundle);
        if (json.vehicleAssetSummary) {
          setVehicleAssetSummary(json.vehicleAssetSummary);
        }
        if (json.isDbReady === false) {
          setIsDbReady(false);
          setDbNotice(json.dbReason || 'DB 자산 매핑 마이그레이션 적용 대기 중');
        } else {
          setIsDbReady(true);
          setDbNotice(null);
        }
      } else {
        setStatusMessage({ type: 'error', text: json.error || '자료 조회 실패' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || '네트워크 오류' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeDriver?.id) {
      fetchBundle();
    }
  }, [isOpen, activeDriver?.id, activeVehicle.plate]);

  if (!isOpen) return null;

  // File Upload Handler
  const handleFileUpload = async (
    file: File,
    assetType: 'profile' | 'info',
    variant?: 'pc' | 'mobile'
  ) => {
    if (!activeDriver?.id) return;

    if (!isDbReady) {
      setStatusMessage({
        type: 'warning',
        text: 'DB 마이그레이션 적용 대기 중입니다. 마이그레이션 적용 후 업로드가 가능합니다.',
      });
      haptics.warningPulse();
      return;
    }

    // Read image dimensions
    let width: number | undefined;
    let height: number | undefined;
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve) => {
        img.onload = () => {
          width = img.width;
          height = img.height;
          URL.revokeObjectURL(objectUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve();
        };
        img.src = objectUrl;
      });
    } catch {
      // Dimension reading failed, ignore
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('assetType', assetType);
    formData.append('driverId', activeDriver.id);
    formData.append('driverName', activeDriver.name);
    if (assetType === 'info') {
      formData.append('vehicleId', activeVehicle.uuid);
      formData.append('vehiclePlate', activeVehicle.plate);
      formData.append('vehicleModel', activeVehicle.model);
      if (variant) formData.append('variant', variant);
    }
    if (width) formData.append('width', String(width));
    if (height) formData.append('height', String(height));

    const uploadKey = assetType === 'profile' ? 'profile' : variant || 'pc';
    setIsUploading(uploadKey);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/hq/drivers/assets/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStatusMessage({ type: 'error', text: json.error || '업로드 실패' });
        haptics.errorAlert();
        return;
      }

      haptics.success();
      if (json.warning) {
        setStatusMessage({ type: 'warning', text: `등록 완료 (${json.warning})` });
      } else {
        setStatusMessage({
          type: 'success',
          text: `${assetType === 'profile' ? '기사 프로필 사진' : `${variant === 'pc' ? 'PC' : '모바일'} 안내 카드`}가 등록되었습니다.`,
        });
      }

      await fetchBundle();
      onAssetUpdated?.();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || '네트워크 오류' });
      haptics.errorAlert();
    } finally {
      setIsUploading(null);
    }
  };

  // Delete Handler
  const handleDeleteAsset = async (type: 'profile' | 'info', variant?: 'pc' | 'mobile') => {
    if (!activeDriver?.id) return;

    const label = type === 'profile' ? '프로필 사진' : `${variant === 'pc' ? 'PC' : '모바일'} 안내 카드`;
    if (!confirm(`${label}을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const res = await fetch('/api/hq/drivers/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          driverId: activeDriver.id,
          vehiclePlate: activeVehicle.plate,
          variant,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert(json.error || '삭제 실패');
        return;
      }
      haptics.success();
      await fetchBundle();
      onAssetUpdated?.();
    } catch (err: any) {
      alert(err?.message || '네트워크 오류');
    }
  };

  // Drag & Drop File Handler
  const handleDropFile = (
    e: React.DragEvent<HTMLDivElement>,
    assetType: 'profile' | 'info',
    variant?: 'pc' | 'mobile'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (assetType === 'profile') setIsDraggingProfile(false);
    else if (variant === 'pc') setIsDraggingPc(false);
    else if (variant === 'mobile') setIsDraggingMobile(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file, assetType, variant);
    } else if (file) {
      setStatusMessage({ type: 'error', text: '이미지 파일(JPG, PNG, WEBP)만 업로드할 수 있습니다.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0050FF] flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                기사 프로필 및 배차 카드
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Bar: Driver Select ONLY (Decoupled from vehicle) */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#0050FF]" />
              <span>기사 선택</span>
            </label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.phone || '연락처 미등록'} · {d.affiliationLabel} · {d.carNumber || d.vehicleNo || '차량 미지정'})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Summary Chips for Driver */}
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-1 sm:pt-4">
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${bundle?.profile
                ? 'bg-slate-100 text-slate-700 border-slate-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
            >
              <User className="w-3 h-3" />
              {bundle?.profile ? '프로필 등록됨' : '프로필 미등록'}
            </span>
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-[#0050FF] border border-blue-200 flex items-center gap-1">
              <Car className="w-3 h-3" />
              카드 {completedVehiclesCount}/20 등록
            </span>
          </div>
        </div>

        {/* Notification Status Banner */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs font-bold flex items-center gap-2 shrink-0 ${statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-100'
              : statusMessage.type === 'warning'
                ? 'bg-amber-50 text-amber-800 border-b border-amber-100'
                : 'bg-rose-50 text-rose-800 border-b border-rose-100'
              }`}
          >
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {statusMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
            {statusMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Section 1: Driver Profile Photo (Independent 1-photo per driver) */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#0050FF]" />
                  <span>기사 프로필</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  고객 알림톡과 모바일 명함에 표시돼요
                </p>
              </div>
              {bundle?.profile ? (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> 등록 완료
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[11px] font-bold">
                  미등록
                </span>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingProfile(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingProfile(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingProfile(false);
              }}
              onDrop={(e) => handleDropFile(e, 'profile')}
              className={`flex flex-col sm:flex-row items-center gap-4 bg-white p-3.5 rounded-xl border transition-all ${isDraggingProfile
                ? 'border-2 border-dashed border-[#0050FF] bg-blue-50/60 ring-2 ring-blue-300'
                : 'border-slate-200 shadow-2xs'
                }`}
            >
              {bundle?.profile?.signedUrl ? (
                <img
                  src={bundle.profile.signedUrl}
                  alt={activeDriver?.name || '기사 프로필'}
                  className="w-20 h-20 rounded-2xl object-cover ring-2 ring-blue-100 shadow-xs shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-slate-100 text-slate-400 border border-dashed border-slate-300 flex flex-col items-center justify-center text-xs font-bold shrink-0">
                  <User className="w-6 h-6 mb-1 text-slate-400" />
                  <span className="text-[10px]">사진 없음</span>
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-black text-slate-800">
                  {activeDriver?.name} 기사님
                </div>
                {!bundle?.profile && (
                  <p className="text-[10.5px] text-slate-400">
                    1:1 정방형 권장 · 최대 10MB
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  ref={profileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'profile');
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={!isDbReady || isUploading === 'profile'}
                  onClick={() => profileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer bg-blue-50 hover:bg-blue-100 text-[#1E60F3] disabled:opacity-50"
                >
                  {isUploading === 'profile' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {bundle?.profile ? '사진 교체' : '사진 등록'}
                  </span>
                </button>

                {bundle?.profile && (
                  <button
                    type="button"
                    onClick={() => handleDeleteAsset('profile')}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="프로필 사진 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Driver × Vehicle Info (PC horizontal & Mobile vertical) */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Car className="w-4 h-4 text-[#1E60F3]" />
                  <span>차량별 배차 카드</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  해당 차량 운행 시 고객에게 전달되는 전용 카드예요
                </p>
              </div>

              {bundle?.isFullyComplete ? (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold flex items-center gap-1 self-start sm:self-auto">
                  <CheckCircle2 className="w-3 h-3" /> 완비 (PC·모바일)
                </span>
              ) : bundle?.isReadyForCustomerDispatch ? (
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-extrabold flex items-center gap-1 self-start sm:self-auto">
                  1종 등록됨
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold self-start sm:self-auto">
                  카드 미등록
                </span>
              )}
            </div>

            {/* Visual Vehicle Selector with Category Filter Tabs & Plate Chips */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                {/* Category Filter Tabs with no wrapping truncation */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none flex-1 min-w-0">
                  {categoryTabs.map((cat) => {
                    const isSelected = selectedCategory === cat.key;
                    const IconComp = cat.icon;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setSelectedCategory(cat.key);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${isSelected
                          ? 'bg-[#0050FF] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                          }`}
                      >
                        <IconComp className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                        <span className="whitespace-nowrap">{cat.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-black shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-600'
                            }`}
                        >
                          {cat.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Vehicle Plate Search */}
                <div className="relative w-44 flex-shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={vehicleSearchQuery}
                    onChange={(e) => setVehicleSearchQuery(e.target.value)}
                    placeholder="차량번호나 차종 검색"
                    className="w-full pl-8 pr-7 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-[#0050FF] placeholder:text-slate-400"
                  />
                  {vehicleSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setVehicleSearchQuery('')}
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Vehicle Selection Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-50/60 rounded-xl border border-slate-200/70">
                {filteredVehicles.map((v) => {
                  const isSelected = selectedVehiclePlate === v.plate;
                  const thumb = getVehicleImage(v);
                  const status = vehicleAssetSummary[v.uuid];
                  const isComplete = status?.pc && status?.mobile;
                  const isPartial = status && (status.pc || status.mobile) && !isComplete;

                  return (
                    <button
                      key={v.uuid}
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setSelectedVehiclePlate(v.plate);
                      }}
                      className={`p-2 rounded-xl text-left transition-all border flex flex-col justify-between gap-1.5 cursor-pointer relative group ${isSelected
                        ? 'ring-2 ring-[#0050FF] border-[#0050FF] bg-blue-50/30 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <img
                          src={thumb}
                          alt={v.modelShort}
                          className="w-9 h-6 object-contain shrink-0 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.18)]"
                        />
                        {isComplete ? (
                          <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" /> 완비
                          </span>
                        ) : isPartial ? (
                          <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 text-[9px] font-black">
                            1건
                          </span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-200" title="안내 카드 미등록" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className={`text-[11px] font-black truncate ${isSelected ? 'text-[#0050FF]' : 'text-slate-800'}`}>
                          {v.plate}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {v.modelShort}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Vehicle Status Bar (Cleaned from duplicate brand name) */}
              <div className="px-3 py-2 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-[#0050FF] uppercase tracking-wider">
                    현재 선택 차량:
                  </span>
                  <span className="font-bold text-slate-800">
                    {displayVehicleName} ({activeVehicle.plate})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  {activeVehicle.capacity} · {activeVehicle.fuelType}
                </span>
              </div>
            </div>

            {/* Grid 2 Cards: PC Widescreen & True 9:16 Minimal Line Mobile Wireframe */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card A: PC Info (Horizontal 16:9) */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between shadow-2xs h-full">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <img src="/images/icons/pc.png" alt="PC" className="w-4 h-4 object-contain" />
                      <span>PC용 가로 카드 (16:9)</span>
                    </span>
                    {bundle?.pcInfo ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                        등록 완료
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">
                        미등록
                      </span>
                    )}
                  </div>
                </div>

                {/* Vertically centered Preview Area */}
                <div className="my-auto py-3 flex-1 flex flex-col justify-center">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!bundle?.pcInfo && isDbReady && !isUploading) {
                        pcInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingPc(true);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingPc(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingPc(false);
                    }}
                    onDrop={(e) => handleDropFile(e, 'info', 'pc')}
                    className={`w-full aspect-video rounded-xl overflow-hidden border transition-all flex items-center justify-center relative group cursor-pointer ${isDraggingPc
                      ? 'border-2 border-dashed border-[#0050FF] bg-blue-50/60 ring-2 ring-blue-300'
                      : 'border-slate-200 bg-white hover:border-blue-400'
                      }`}
                  >
                    {bundle?.pcInfo?.signedUrl ? (
                      <>
                        <img
                          src={bundle.pcInfo.signedUrl}
                          alt="PC Info"
                          className="w-full h-full object-cover"
                        />
                        <a
                          href={bundle.pcInfo.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> 원본 크게보기
                        </a>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2 bg-white">
                        <img
                          src="/images/icons/pc.png"
                          alt="PC"
                          className="w-auto h-auto max-h-[85%] max-w-[85%] sm:max-h-[90%] sm:max-w-[90%] object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-md select-none"
                        />
                      </div>
                    )}
                  </div>

                  {bundle?.pcInfo && (
                    <div className="mt-2 text-[10.5px] text-slate-500 space-y-0.5">
                      <div className="font-bold truncate text-slate-800">{bundle.pcInfo.fileName}</div>
                      <div>
                        {bundle.pcInfo.width && bundle.pcInfo.height
                          ? `${bundle.pcInfo.width}×${bundle.pcInfo.height} px · `
                          : ''}
                        {Math.round(bundle.pcInfo.fileSize / 1024)} KB · v{bundle.pcInfo.version}
                      </div>
                    </div>
                  )}
                </div>

                {/* PC Card Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 shrink-0">
                  <input
                    ref={pcInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'info', 'pc');
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={!isDbReady || isUploading === 'pc'}
                    onClick={() => pcInputRef.current?.click()}
                    className="flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-blue-50 hover:bg-blue-100 text-[#1E60F3] disabled:opacity-50"
                  >
                    {isUploading === 'pc' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {bundle?.pcInfo ? '이미지 교체' : '이미지 등록'}
                    </span>
                  </button>

                  {bundle?.pcInfo && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset('info', 'pc')}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="PC 카드 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Card B: Mobile Info (Minimal Line Wireframe matching PC preview) */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between shadow-2xs h-full">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <img src="/images/icons/mobile.png" alt="Mobile" className="w-4 h-4 object-contain" />
                      <span>모바일용 세로 카드 (9:16)</span>
                    </span>
                    {bundle?.mobileInfo ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                        등록 완료
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">
                        미등록
                      </span>
                    )}
                  </div>
                </div>

                {/* Vertically centered Preview Area */}
                <div className="my-auto py-3 flex-1 flex flex-col items-center justify-center">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!bundle?.mobileInfo && isDbReady && !isUploading) {
                        mobileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingMobile(true);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingMobile(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingMobile(false);
                    }}
                    onDrop={(e) => handleDropFile(e, 'info', 'mobile')}
                    className={`w-32 sm:w-36 aspect-[9/16] rounded-2xl border transition-all bg-white relative overflow-hidden flex flex-col group cursor-pointer ${isDraggingMobile
                      ? 'border-2 border-dashed border-[#0050FF] bg-blue-50/60 ring-2 ring-blue-300'
                      : 'border-slate-200 shadow-2xs hover:border-blue-400'
                      }`}
                  >
                    {/* Screen Content */}
                    <div className="flex-1 bg-white relative flex items-center justify-center overflow-hidden">
                      {bundle?.mobileInfo?.signedUrl ? (
                        <>
                          <img
                            src={bundle.mobileInfo.signedUrl}
                            alt="Mobile Info"
                            className="w-full h-full object-cover"
                          />
                          <a
                            href={bundle.mobileInfo.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10.5px] font-bold gap-1 p-2 text-center"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>원본 보기</span>
                          </a>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-1 bg-white">
                          <img
                            src="/images/icons/mobile.png"
                            alt="Mobile"
                            className="w-full h-full max-h-[92%] object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-md select-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {bundle?.mobileInfo && (
                    <div className="mt-2 text-[10.5px] text-slate-500 space-y-0.5 text-center">
                      <div className="font-bold truncate text-slate-800">{bundle.mobileInfo.fileName}</div>
                      <div>
                        {bundle.mobileInfo.width && bundle.mobileInfo.height
                          ? `${bundle.mobileInfo.width}×${bundle.mobileInfo.height} px · `
                          : ''}
                        {Math.round(bundle.mobileInfo.fileSize / 1024)} KB · v{bundle.mobileInfo.version}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile Card Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 shrink-0">
                  <input
                    ref={mobileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'info', 'mobile');
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={!isDbReady || isUploading === 'mobile'}
                    onClick={() => mobileInputRef.current?.click()}
                    className="flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-blue-50 hover:bg-blue-100 text-[#1E60F3] disabled:opacity-50"
                  >
                    {isUploading === 'mobile' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {bundle?.mobileInfo ? '이미지 교체' : '이미지 등록'}
                    </span>
                  </button>

                  {bundle?.mobileInfo && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset('info', 'mobile')}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="모바일 카드 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span className="hidden sm:inline">등록된 카드는 고객 알림톡과 차량 상세 화면에 실시간으로 반영돼요.</span>
          <span className="sm:hidden">실시간 고객 배차 연동</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
