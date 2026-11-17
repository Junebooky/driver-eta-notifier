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
  resolveVehicleEntity,
  getVehicleImage,
} from '@/utils/vehicleData';
import { haptics } from '@/utils/haptics';
import { HqSearchSelect } from '@/components/hq/ui/HqSearchSelect';
import { HqBadge, HqButton, HqCard, HqIconButton, HqInput, HqSegmentedTabs } from '@/components/hq/ui';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import { useHqFleetRegistry } from '@/hooks/useHqFleetRegistry';
import { HqDispatchCardBuilderModal } from './HqDispatchCardBuilderModal';

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
  const fleet = useHqFleetRegistry(isOpen);
  const [selectedVehiclePlate, setSelectedVehiclePlate] = useState<string>(initialVehiclePlate || '');
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
  const [pendingDelete, setPendingDelete] = useState<{
    type: 'profile' | 'info'; variant?: 'pc' | 'mobile';
    driverId: string; vehiclePlate: string; label: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAutoBuilderOpen, setIsAutoBuilderOpen] = useState(false);
  const [isManualUploadOpen, setIsManualUploadOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const profileInputRef = useRef<HTMLInputElement>(null);
  const pcInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const bundleRequestSequence = useRef(0);

  // Match caller selection, but never resurrect archived or browser-only cars.
  useEffect(() => {
    if (initialDriverId) setSelectedDriverId(initialDriverId);
    setSelectedVehiclePlate(initialVehiclePlate || '');
  }, [initialDriverId, initialVehiclePlate, isOpen]);

  useEffect(() => {
    if (!selectedDriverId && drivers.length > 0) setSelectedDriverId(drivers[0].id);
  }, [drivers, selectedDriverId]);

  useEffect(() => {
    if (!isOpen || fleet.loading || fleet.error || !fleet.vehicles.length) return;
    if (!fleet.vehicles.some(vehicle => vehicle.plate === selectedVehiclePlate)) {
      setSelectedVehiclePlate(fleet.vehicles[0].plate);
    }
  }, [isOpen, fleet.loading, fleet.error, fleet.vehicles, selectedVehiclePlate]);

  const activeDriver = useMemo(
    () => drivers.find(driver => driver.id === selectedDriverId) || drivers[0] || null,
    [drivers, selectedDriverId],
  );
  const activeVehicle = useMemo(() =>
    fleet.vehicles.find(vehicle => vehicle.plate === selectedVehiclePlate) ||
    fleet.vehicles[0] ||
    resolveVehicleEntity('미배정'),
    [fleet.vehicles, selectedVehiclePlate],
  );
  const assetVehicleReady = !fleet.loading && !fleet.error &&
    fleet.vehicles.some(vehicle => vehicle.plate === selectedVehiclePlate);

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

  // Counts reflect registered active vehicles, not an obsolete fixed stock list.
  const categoryTabs = useMemo(() => ([
    { key: 'all', label: '전체' },
    { key: 'sprinter', label: '스프린터' },
    { key: 'staria', label: '스타리아' },
    { key: 'carnival', label: '카니발' },
    { key: 'genesis', label: '제네시스' },
    { key: 's_class', label: 'S-클래스' },
  ]).map(tab => ({
    ...tab, count: tab.key === 'all'
      ? fleet.vehicles.length : fleet.vehicles.filter(vehicle => vehicle.category === tab.key).length,
  })), [fleet.vehicles]);

  const filteredVehicles = useMemo(() => fleet.vehicles.filter(vehicle => {
    const matchesCategory = selectedCategory === 'all' || vehicle.category === selectedCategory;
    const query = vehicleSearchQuery.trim().toLowerCase();
    return matchesCategory && (!query || vehicle.plate.toLowerCase().includes(query) ||
      vehicle.model.toLowerCase().includes(query));
  }), [fleet.vehicles, selectedCategory, vehicleSearchQuery]);

  // Count total completed vehicles for this driver
  const completedVehiclesCount = useMemo(() => {
    return Object.values(vehicleAssetSummary).filter((s) => s.pc && s.mobile).length;
  }, [vehicleAssetSummary]);

  // Load bundle whenever driver or vehicle selection changes
  const fetchBundle = async (preserveNotice = false) => {
    if (!activeDriver?.id || !assetVehicleReady) {
      setBundle(null);
      return;
    }
    const requestId = ++bundleRequestSequence.current;
    setIsLoading(true);
    setBundle(null);
    if (!preserveNotice) setStatusMessage(null);
    try {
      const vPlate = activeVehicle.plate;
      const res = await fetch(
        `/api/hq/drivers/assets?driverId=${encodeURIComponent(activeDriver.id)}&vehiclePlate=${encodeURIComponent(vPlate)}&type=bundle`
      );
      const json = await res.json();
      if (requestId !== bundleRequestSequence.current) return;
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
      if (requestId === bundleRequestSequence.current) {
        setStatusMessage({ type: 'error', text: err?.message || '네트워크 오류' });
      }
    } finally {
      if (requestId === bundleRequestSequence.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeDriver?.id && assetVehicleReady) {
      void fetchBundle();
    } else {
      ++bundleRequestSequence.current;
      setBundle(null);
    }
  }, [isOpen, activeDriver?.id, activeVehicle.plate, assetVehicleReady]);

  if (!isOpen) return null;

  // File Upload Handler
  const handleFileUpload = async (
    file: File,
    assetType: 'profile' | 'info',
    variant?: 'pc' | 'mobile'
  ) => {
    if (!activeDriver?.id) return;
    if (assetType === 'info' && !assetVehicleReady) {
      setStatusMessage({ type: 'error', text: '차량 등록부에서 활성 차량을 선택한 뒤 안내 카드를 등록해 주세요.' });
      return;
    }

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

      await fetchBundle(true);
      onAssetUpdated?.();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || '네트워크 오류' });
      haptics.errorAlert();
    } finally {
      setIsUploading(null);
    }
  };

  // Open a branded confirmation instead of a native browser confirm().
  // Capture the resource identity before asking, to avoid deleting another
  // driver's image if an operator changes the selection.
  const handleDeleteAsset = (type: 'profile' | 'info', variant?: 'pc' | 'mobile') => {
    if (!activeDriver?.id || isDeleting || (type === 'info' && !assetVehicleReady)) return;
    const label = type === 'profile' ? '프로필 사진' : `${variant === 'pc' ? 'PC' : '모바일'} 안내 카드`;
    setPendingDelete({
      type, variant, label, driverId: activeDriver.id,
      vehiclePlate: activeVehicle.plate,
    });
  };

  const confirmDeleteAsset = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/hq/drivers/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: pendingDelete.type,
          driverId: pendingDelete.driverId,
          vehiclePlate: pendingDelete.vehiclePlate,
          variant: pendingDelete.variant,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || '삭제에 실패했습니다.');
      }
      haptics.success();
      setPendingDelete(null);
      setStatusMessage({ type: 'success', text: `${pendingDelete.label}이 삭제되었습니다.` });
      await fetchBundle(true);
      onAssetUpdated?.();
    } catch (error) {
      haptics.errorAlert();
      setStatusMessage({
        type: 'error', text: error instanceof Error ? error.message : '네트워크 연결을 확인해 주세요.',
      });
    } finally {
      setIsDeleting(false);
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
    if (assetType === 'info' && !isManualUploadOpen) return;
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

  // Format asset dimensions & size (e.g. '2000 × 1500 px · 2.6 MB')
  const formatAssetDimensionAndSize = (asset?: { width?: number; height?: number; fileSize: number } | null) => {
    if (!asset) return null;
    const dimensionStr = asset.width && asset.height ? `${asset.width} × ${asset.height} px` : '';
    const sizeStr =
      asset.fileSize >= 1024 * 1024
        ? `${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(asset.fileSize / 1024)} KB`;

    if (dimensionStr && sizeStr) {
      return `${dimensionStr} · ${sizeStr}`;
    }
    return dimensionStr || sizeStr;
  };

  return (
    <div className="hq-ui-modal-backdrop z-[60] animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-label="기사 프로필 및 배차 카드" className="hq-ui-modal-surface relative flex w-full max-w-4xl flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-white px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#EEF3FF] text-[#1E60F3]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[19px] font-bold tracking-[-.03em] text-[#17233B]">
                기사 프로필 및 배차 카드
              </h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HqButton
              variant="primary"
              size="sm"
              disabled={!activeDriver || fleet.loading || Boolean(fleet.error)}
              onClick={() => setIsAutoBuilderOpen(true)}
            >
              배차카드 자동 생성
            </HqButton>
            <HqIconButton variant="subtle" aria-label="닫기" onClick={onClose}>
              <X className="size-4" />
            </HqIconButton>
          </div>
        </div>

        {/* Top Bar: Driver Select ONLY (Decoupled from vehicle) */}
        <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 bg-[#FAFBFD] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex-1 min-w-0">
            <label className="mb-1.5 block text-[12px] font-semibold text-[#526680]">기사 선택</label>
            <HqSearchSelect
              label="배차 카드 관리 기사 선택"
              value={selectedDriverId}
              onChange={next => setSelectedDriverId(next)}
              placeholder="기사 선택"
              disabled={isUploading !== null || isDeleting}
              options={drivers.map(driver => ({
                value: driver.id,
                label: driver.name,
                subtitle: `${driver.phone || '연락처 미등록'} · ${driver.affiliationLabel} · ${driver.carNumber || driver.vehicleNo || '차량 미지정'}`,
                imageSrc: driver.avatarUrl || undefined,
              }))}
            />
          </div>

          {/* Quick Summary Chips for Driver */}
          <div className="flex shrink-0 items-center gap-2 self-end pt-1 sm:self-center sm:pt-4">
            <HqBadge>{bundle?.profile ? '프로필 등록됨' : '프로필 미등록'}</HqBadge>
            <HqBadge>카드 {completedVehiclesCount}/{fleet.vehicles.length} 등록</HqBadge>
          </div>
        </div>

        {/* Shared neutral feedback; status uses the HQ A-plan primitive. */}
        {statusMessage && (
          <div className="shrink-0 bg-white px-5 pb-3 sm:px-6">
            <HqInlineFeedback message={statusMessage.text}
              tone={statusMessage.type === 'error' ? 'error' : statusMessage.type === 'success' ? 'success' : 'info'} />
          </div>
        )}

        {/* Modal Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#FAFBFD] p-4 sm:p-6">
          {fleet.error && (
            <div role="alert" className="rounded-[14px] bg-[#FFF5F3] p-3 text-[12px] text-[#A85950]">
              차량 등록부 연결 실패: {fleet.error}. 차량 안내 카드 업로드를 차단했습니다.
            </div>
          )}
          {!fleet.loading && !fleet.error && fleet.vehicles.length === 0 && (
            <div role="status" className="rounded-[14px] bg-[#F7F9FC] p-3 text-[12px] text-[#6D7C90]">
              등록된 활성 차량이 없습니다. 차량 관리에서 먼저 등록해 주세요.
            </div>
          )}
          {/* Section 1: Driver Profile Photo (Independent 1-photo per driver) */}
          <HqCard className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[#21344D]">기사 프로필</h3>
                <p className="text-[11px] text-slate-500">
                  고객 알림톡과 모바일 명함에 표시돼요
                </p>
              </div>
              <HqBadge>{bundle?.profile ? '등록 완료' : '미등록'}</HqBadge>
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
              className={`flex flex-col items-center gap-4 rounded-[15px] bg-[#FAFBFD] p-4 transition-all sm:flex-row ${isDraggingProfile
                ? 'ring-2 ring-[#1E60F3]/40 bg-[#F3F7FF]'
                : 'shadow-[0_3px_12px_rgba(35,49,78,.025)]'
                }`}
            >
              {bundle?.profile?.signedUrl ? (
                <img
                  src={bundle.profile.signedUrl}
                  alt={activeDriver?.name || '기사 프로필'}
                  className="size-20 shrink-0 rounded-[14px] bg-white object-contain"
                />
              ) : (
                <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-[14px] bg-white text-xs font-medium text-[#8492A4]">
                  <User className="w-6 h-6 mb-1 text-slate-400" />
                  <span className="text-[10px]">사진 없음</span>
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[12px] font-semibold text-[#24374F]">
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
                <HqButton variant="secondary" size="sm"
  disabled={!isDbReady || isUploading === 'profile'}
  onClick={() => profileInputRef.current?.click()}> profileInputRef.current?.click()}
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
                </HqButton>

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
          </HqCard>

          {/* Section 2: Driver × Vehicle Info (PC horizontal & Mobile vertical) */}
          <HqCard className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-semibold text-[#21344D]">차량별 배차 카드</h3>
                <p className="text-[11px] text-slate-500">
                  해당 차량 운행 시 고객에게 전달되는 전용 카드예요
                </p>
              </div>

              <HqBadge>{bundle?.isFullyComplete ? '완비 (PC·모바일)' : bundle?.isReadyForCustomerDispatch ? '1종 등록됨' : '카드 미등록'}</HqBadge>
            </div>

            {/* Visual Vehicle Selector with Category Filter Tabs & Plate Chips */}
            <div className="space-y-3 rounded-[16px] bg-[#FAFBFD] p-3">
              <div className="flex items-center justify-between gap-2.5">
                {/* Category Filter Tabs with no wrapping truncation */}
                <div className="min-w-0 flex-1">
                  <HqSegmentedTabs aria-label="차량 분류" value={selectedCategory}
                    onValueChange={value => { haptics.selection(); setSelectedCategory(value); }}
                    tabs={categoryTabs.map(cat => ({ id: cat.key, label: cat.label, count: cat.count }))} />
                </div>

                {/* Quick Vehicle Plate Search */}
                <div className="relative w-36 sm:w-44 shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <HqInput
                    type="text"
                    value={vehicleSearchQuery}
                    onChange={(e) => setVehicleSearchQuery(e.target.value)}
                    placeholder="차량번호나 차종 검색"
                    className="pl-8 pr-7 text-[12px]"
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
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-[13px] bg-[#F7F9FC] p-2 sm:grid-cols-4 md:grid-cols-5">
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
                      disabled={isUploading !== null || isDeleting}
                      onClick={() => {
                        haptics.selection();
                        setSelectedVehiclePlate(v.plate);
                      }}
                      className={`group relative flex flex-col justify-between gap-1.5 rounded-[13px] p-2 text-left transition-all ${isSelected
                        ? 'bg-[#F3F7FF] ring-1 ring-[#1E60F3]/50 shadow-[0_3px_9px_rgba(30,96,243,.07)]'
                        : 'bg-white shadow-[0_3px_12px_rgba(35,49,78,.045)] hover:bg-[#F9FBFF]'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <img
                          src={thumb}
                          alt={v.modelShort}
                          className="w-9 h-6 object-contain shrink-0 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.18)]"
                        />
                        {isComplete ? <HqBadge>완비</HqBadge> : isPartial ? <HqBadge>1건</HqBadge> : <span className="size-2 rounded-full bg-[#DDE3EC]" title="카드 미등록" />}
                      </div>

                      <div className="min-w-0">
                        <div className={`text-[11px] font-black truncate ${isSelected ? 'text-[#1E60F3]' : 'text-slate-800'}`}>
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
              <div className="flex items-center justify-between rounded-[12px] bg-white px-3 py-3 text-xs shadow-[0_3px_10px_rgba(35,49,78,.035)]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-[#1E60F3] uppercase tracking-wider">
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

            <div className="flex items-center justify-between gap-3 rounded-[13px] bg-white px-3 py-2 shadow-[0_3px_10px_rgba(35,49,78,0.035)]">
              <span className="text-[11px] leading-relaxed text-[#73839D]">PC·모바일 카드는 자동 생성에서 등록할 수 있습니다.</span>
              <HqButton type="button" size="sm" variant="subtle" className="shrink-0"
                aria-expanded={isManualUploadOpen} onClick={() => setIsManualUploadOpen(value => !value)}>
                {isManualUploadOpen ? '직접 업로드 닫기' : '고급 · 직접 업로드'}
              </HqButton>
            </div>

            {/* Read-only previews stay visible; manual upload is an explicit advanced action. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card A: PC Info (Horizontal 16:9) */}
              <div className="flex h-full flex-col justify-between rounded-[16px] bg-white p-4 shadow-[0_4px_16px_rgba(35,49,78,.05)]">
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <span>PC용 가로 카드 (4:3)</span>
                    </span>
                    <HqBadge>{bundle?.pcInfo ? '등록 완료' : '미등록'}</HqBadge>
                  </div>
                </div>

                {/* Vertically centered Preview Area */}
                <div className="my-auto py-3 flex-1 flex flex-col justify-center">
                  <div
                    role={isManualUploadOpen ? 'button' : undefined}
                    tabIndex={isManualUploadOpen ? 0 : undefined}
                    onClick={() => {
                      if (isManualUploadOpen && !bundle?.pcInfo && isDbReady && !isUploading) {
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
                    className={'group relative flex w-full aspect-[4/3] items-center justify-center overflow-hidden rounded-[13px] bg-white transition-all ' + (isManualUploadOpen ? 'cursor-pointer' : 'cursor-default') + ' ' + (isDraggingPc ? 'ring-2 ring-[#1E60F3]/40 bg-[#F3F7FF]' : 'shadow-[0_3px_12px_rgba(35,49,78,.04)]')}
                  >
                    {bundle?.pcInfo?.signedUrl ? (
                      <>
                        <img
                          src={bundle.pcInfo.signedUrl}
                          alt="PC Info"
                          className="w-full h-full object-contain"
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
                          className="w-95 h-95 sm:w-95 sm:h-95 max-h-[85%] max-w-[85%] object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-md select-none"
                        />
                      </div>
                    )}
                  </div>

                  {bundle?.pcInfo && (
                    <div className="mt-2 text-xs text-slate-400 text-center">
                      {formatAssetDimensionAndSize(bundle.pcInfo)}
                    </div>
                  )}
                </div>

                {/* Advanced manual PC upload: hidden during the normal auto-create flow. */}
                {isManualUploadOpen && <div className="flex items-center gap-2 pt-2 border-t border-slate-100 shrink-0">
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
                  <HqButton variant="secondary" size="sm" className="flex-1"
  disabled={!isDbReady || !assetVehicleReady || isUploading === 'pc' || isDeleting}
  onClick={() => pcInputRef.current?.click()}> pcInputRef.current?.click()}
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
                  </HqButton>

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
                </div>}
              </div>

              {/* Card B: Mobile Info (Minimal Line Wireframe matching PC preview) */}
              <div className="flex h-full flex-col justify-between rounded-[16px] bg-white p-4 shadow-[0_4px_16px_rgba(35,49,78,.05)]">
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <span>모바일용 세로 카드 (9:16)</span>
                    </span>
                    <HqBadge>{bundle?.mobileInfo ? '등록 완료' : '미등록'}</HqBadge>
                  </div>
                </div>

                {/* Vertically centered Preview Area */}
                <div className="my-auto py-3 flex-1 flex flex-col items-center justify-center">
                  <div
                    role={isManualUploadOpen ? 'button' : undefined}
                    tabIndex={isManualUploadOpen ? 0 : undefined}
                    onClick={() => {
                      if (isManualUploadOpen && !bundle?.mobileInfo && isDbReady && !isUploading) {
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
                    className={'group relative flex w-32 flex-col overflow-hidden rounded-[13px] bg-white aspect-[9/16] transition-all sm:w-36 ' + (isManualUploadOpen ? 'cursor-pointer' : 'cursor-default') + ' ' + (isDraggingMobile ? 'ring-2 ring-[#1E60F3]/40 bg-[#F3F7FF]' : 'shadow-[0_3px_12px_rgba(35,49,78,.04)]')}
                  >
                    {/* Screen Content */}
                    <div className="flex-1 bg-white relative flex items-center justify-center overflow-hidden">
                      {bundle?.mobileInfo?.signedUrl ? (
                        <>
                          <img
                            src={bundle.mobileInfo.signedUrl}
                            alt="Mobile Info"
                            className="w-full h-full object-contain"
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
                            className="w-20 h-20 sm:w-24 sm:h-24 max-h-[92%] object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-md select-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {bundle?.mobileInfo && (
                    <div className="mt-2 text-xs text-slate-400 text-center">
                      {formatAssetDimensionAndSize(bundle.mobileInfo)}
                    </div>
                  )}
                </div>

                {/* Advanced manual mobile upload. */}
                {isManualUploadOpen && <div className="flex items-center gap-2 pt-2 border-t border-slate-100 shrink-0">
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
                  <HqButton variant="secondary" size="sm" className="flex-1"
  disabled={!isDbReady || !assetVehicleReady || isUploading === 'mobile' || isDeleting}
  onClick={() => mobileInputRef.current?.click()}> mobileInputRef.current?.click()}
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
                  </HqButton>

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
                </div>}
              </div>
            </div>
          </HqCard>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between bg-white px-5 py-4 text-xs text-[#73839D] sm:px-6">
          <span className="hidden sm:inline">등록된 카드는 고객 알림톡과 차량 상세 화면에 실시간으로 반영돼요.</span>
          <span className="sm:hidden">실시간 고객 배차 연동</span>
          <HqButton variant="secondary" onClick={onClose}>
            닫기
          </HqButton>
        </div>
      </div>
      {isAutoBuilderOpen && activeDriver && (
        <HqDispatchCardBuilderModal
          isOpen={isAutoBuilderOpen}
          driver={activeDriver}
          vehicles={fleet.vehicles}
          onClose={() => setIsAutoBuilderOpen(false)}
          onAssetUpdated={() => { void fetchBundle(true); onAssetUpdated?.(); }}
        />
      )}
      {pendingDelete && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-[#17233B]/25 p-4"
          role="presentation">
          <div role="alertdialog" aria-modal="true" aria-label="에셋 삭제 확인"
            className="w-full max-w-sm rounded-[19px] bg-white p-5 shadow-[0_20px_55px_rgba(35,49,78,0.16)]">
            <h3 className="text-[15px] font-semibold text-[#243449]">{pendingDelete.label} 삭제</h3>
            <p className="mt-2 text-[12px] leading-relaxed text-[#697A90]">
              선택한 파일이 삭제되며 고객에게 표시되지 않을 수 있습니다. 계속하시겠습니까?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <HqButton variant="subtle" size="sm" disabled={isDeleting} onClick={() => setPendingDelete(null)}> setPendingDelete(null)}
                className="min-h-10 rounded-[12px] bg-[#F4F6FA] px-4 text-[12px] font-semibold text-[#5A6E86] disabled:opacity-50">
                취소
              </HqButton>
              <HqButton variant="danger" size="sm" loading={isDeleting} onClick={() => void confirmDeleteAsset()}> void confirmDeleteAsset()}
                className="min-h-10 rounded-[12px] bg-[#A85C54] px-4 text-[12px] font-semibold text-white disabled:opacity-50">
                {isDeleting ? '삭제 중…' : '파일 삭제'}
              </HqButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
