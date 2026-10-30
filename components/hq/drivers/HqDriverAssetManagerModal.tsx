'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  User,
  Car,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Monitor,
  Smartphone,
  Loader2,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { HqDriverSummary } from '@/types/driverHq';
import {
  DriverProfileAsset,
  DriverVehicleAssetBundle,
  DriverVehicleInfoAsset,
} from '@/types/driverVehicleAsset';
import { VIP_REAL_VEHICLES, VipRealVehicle, resolveVehicleEntity } from '@/utils/vehicleData';
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
  const [selectedVehiclePlate, setSelectedVehiclePlate] = useState<string>(initialVehiclePlate || '');

  const [bundle, setBundle] = useState<DriverVehicleAssetBundle | null>(null);
  const [isDbReady, setIsDbReady] = useState<boolean>(true);
  const [dbNotice, setDbNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState<'profile' | 'pc' | 'mobile' | null>(null);
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
    if (initialVehiclePlate) setSelectedVehiclePlate(initialVehiclePlate);
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
    return resolveVehicleEntity(selectedVehiclePlate || (VIP_REAL_VEHICLES[0]?.plate || ''));
  }, [selectedVehiclePlate]);

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
        if (json.isDbReady === false) {
          setIsDbReady(false);
          setDbNotice(json.dbReason || 'DB 자산 매핑 마이그레이션 적용 대기 중 (오너 승인 대기)');
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
        text: 'DB 마이그레이션 적용 대기 중입니다 (읽기 전용 검수 모드). 오너 승인 후 업로드가 가능합니다.',
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
        setStatusMessage({ type: 'warning', text: `업로드 성공 (안내: ${json.warning})` });
      } else {
        setStatusMessage({
          type: 'success',
          text: `${assetType === 'profile' ? '프로필 사진' : `${variant?.toUpperCase()} 안내자료`}가 등록되었습니다.`,
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

    if (!isDbReady) {
      alert('DB 마이그레이션 적용 대기 중입니다 (읽기 전용 검수 모드).');
      return;
    }

    if (!confirm(`${type === 'profile' ? '프로필 사진' : `${variant?.toUpperCase()} 안내자료`}를 삭제(보관)하시겠습니까?`)) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1E60F3] flex items-center justify-center font-bold">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                기사 프로필 및 차량별 Info 관리
              </h2>
              <p className="text-xs text-slate-400">
                기사 고유 ID와 차량 조합에 맞춘 완성형 고객 안내 이미지를 등록합니다.
              </p>
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

        {/* Top Selectors Bar: Driver & Vehicle */}
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
          {/* Driver Select */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>기사 선택 (동명이인은 연락처로 구분)</span>
            </label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.phone || '연락처 미등록'} · {d.affiliationLabel} · {d.carNumber || d.vehicleNo})
                </option>
              ))}
            </select>
          </div>

          {/* Vehicle Select */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 mb-1 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-[#1E60F3]" />
              <span>실제 차량 선택 (차종 + 전체 번호판)</span>
            </label>
            <select
              value={selectedVehiclePlate}
              onChange={(e) => setSelectedVehiclePlate(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            >
              {VIP_REAL_VEHICLES.map((v) => (
                <option key={v.uuid} value={v.plate}>
                  {v.model} ({v.plate})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* DB Migration Pending Warning Banner */}
        {!isDbReady && (
          <div className="mx-4 mt-3 p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3 text-xs text-amber-950 shadow-2xs shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-black text-amber-950">
                  DB 자산 매핑 마이그레이션 적용 대기 중 (오너 승인 대기)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                  읽기 전용 검수 모드
                </span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                {dbNotice || 'Supabase DB에 자산 매핑 테이블(`driver_profile_assets`, `driver_vehicle_info_assets`)이 아직 마이그레이션되지 않았습니다.'}
                <br />
                운영 환경 안정성을 위해 오너 승인 후 실 DB 마이그레이션이 적용되며, 마이그레이션 전까지 신규 이미지 업로드 및 수정은 안전하게 비활성화됩니다.
              </p>
            </div>
          </div>
        )}

        {/* Notification Status Banner */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs font-bold flex items-center gap-2 shrink-0 ${
              statusMessage.type === 'success'
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
                  <User className="w-4 h-4 text-[#1E60F3]" />
                  <span>1. 기사 독립 프로필 사진 (Profile)</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  기사 개인의 증명사진입니다. 차량을 바꿔도 공통으로 재사용됩니다 (1명당 1장).
                </p>
              </div>
              {bundle?.profile ? (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 등록 완료
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[11px] font-bold">
                  미등록
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3.5 rounded-xl border border-slate-200">
              {bundle?.profile?.signedUrl ? (
                <img
                  src={bundle.profile.signedUrl}
                  alt={activeDriver?.name || '기사 프로필'}
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 flex flex-col items-center justify-center text-xs font-bold shrink-0">
                  <User className="w-6 h-6 mb-1" />
                  <span>사진 없음</span>
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-black text-slate-800">
                  {bundle?.profile ? bundle.profile.fileName : '등록된 프로필 사진이 없습니다.'}
                </div>
                {bundle?.profile && (
                  <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>크기: {Math.round(bundle.profile.fileSize / 1024)} KB</span>
                    {bundle.profile.width && bundle.profile.height && (
                      <span>해상도: {bundle.profile.width} × {bundle.profile.height}</span>
                    )}
                    <span>버전: v{bundle.profile.version}</span>
                    <span>등록자: {bundle.profile.uploadedBy}</span>
                  </div>
                )}
                <p className="text-[10.5px] text-slate-400">
                  권장 규격: 1:1 또는 3:4 인물 증명 사진 (JPG/PNG, 최대 10MB)
                </p>
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
                  className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    !isDbReady
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-blue-50 hover:bg-blue-100 text-[#1E60F3] disabled:opacity-50'
                  }`}
                >
                  {isUploading === 'profile' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {!isDbReady
                      ? '업로드 대기 (DB 미반영)'
                      : bundle?.profile
                      ? '사진 교체'
                      : '프로필 업로드'}
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
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Car className="w-4 h-4 text-[#1E60F3]" />
                  <span>2. 기사 × 차량 완성 Info 이미지 (PC & Mobile)</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  <strong className="text-slate-800">[{activeDriver?.name}]</strong> 기사님이{' '}
                  <strong className="text-slate-800">[{activeVehicle.model} ({activeVehicle.plate})]</strong> 운행 시
                  고객에게 전송되는 안내 이미지입니다.
                </p>
              </div>

              {bundle?.isFullyComplete ? (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> PC·Mobile 모두 완비
                </span>
              ) : bundle?.isReadyForCustomerDispatch ? (
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-extrabold flex items-center gap-1">
                  1종 등록됨
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                  Info 미등록
                </span>
              )}
            </div>

            {/* Grid 2 Cards: PC & Mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card A: PC Info (Horizontal) */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-[#1E60F3]" />
                      <span>PC 가로 이미지 (16:9 권장)</span>
                    </span>
                    {bundle?.pcInfo ? (
                      <span className="px-2 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                        등록 완료
                      </span>
                    ) : (
                      <span className="px-2 py-0.2 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">
                        미등록
                      </span>
                    )}
                  </div>

                  {/* Preview Area */}
                  <div className="mt-3 aspect-video rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center relative group">
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
                      <div className="text-center p-4 text-slate-400">
                        <Monitor className="w-8 h-8 mx-auto mb-1 stroke-1 text-slate-300" />
                        <span className="text-xs font-medium">PC Info 이미지를 등록해주세요</span>
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

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
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
                    className={`flex-1 py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      !isDbReady
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        : 'bg-blue-50 hover:bg-blue-100 text-[#1E60F3] disabled:opacity-50'
                    }`}
                  >
                    {isUploading === 'pc' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {!isDbReady
                        ? '업로드 대기 (DB 미반영)'
                        : bundle?.pcInfo
                        ? 'PC 이미지 교체'
                        : 'PC 이미지 업로드'}
                    </span>
                  </button>

                  {bundle?.pcInfo && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset('info', 'pc')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="PC 이미지 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Card B: Mobile Info (Vertical) */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-[#1E60F3]" />
                      <span>모바일 세로 이미지 (9:16 권장)</span>
                    </span>
                    {bundle?.mobileInfo ? (
                      <span className="px-2 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                        등록 완료
                      </span>
                    ) : (
                      <span className="px-2 py-0.2 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">
                        미등록
                      </span>
                    )}
                  </div>

                  {/* Preview Area */}
                  <div className="mt-3 h-44 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center relative group">
                    {bundle?.mobileInfo?.signedUrl ? (
                      <>
                        <img
                          src={bundle.mobileInfo.signedUrl}
                          alt="Mobile Info"
                          className="h-full w-auto max-w-full object-contain"
                        />
                        <a
                          href={bundle.mobileInfo.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> 원본 크게보기
                        </a>
                      </>
                    ) : (
                      <div className="text-center p-4 text-slate-400">
                        <Smartphone className="w-8 h-8 mx-auto mb-1 stroke-1 text-slate-300" />
                        <span className="text-xs font-medium">모바일 Info 이미지를 등록해주세요</span>
                      </div>
                    )}
                  </div>

                  {bundle?.mobileInfo && (
                    <div className="mt-2 text-[10.5px] text-slate-500 space-y-0.5">
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

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
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
                    className={`flex-1 py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      !isDbReady
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        : 'bg-blue-50 hover:bg-blue-100 text-[#1E60F3] disabled:opacity-50'
                    }`}
                  >
                    {isUploading === 'mobile' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {!isDbReady
                        ? '업로드 대기 (DB 미반영)'
                        : bundle?.mobileInfo
                        ? '모바일 이미지 교체'
                        : '모바일 이미지 업로드'}
                    </span>
                  </button>

                  {bundle?.mobileInfo && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset('info', 'mobile')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="모바일 이미지 삭제"
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
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>비공개 저장소 `cockpit-assets` 자동 매핑</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
