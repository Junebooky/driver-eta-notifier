'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Download, ImagePlus, Loader2,
  Monitor, Smartphone, SlidersHorizontal, UserRound, ChevronDown,
} from 'lucide-react';
import type { HqDriverSummary } from '@/types/driverHq';
import type { VipRealVehicle } from '@/utils/vehicleData';
import {
  dispatchCardVehicleLabel,
  resolveDispatchCardPhotos,
} from '@/lib/dispatchCards/dispatchCardAssets';
import {
  cardCanvasToPng,
  renderDispatchCard,
  type CardOrientation,
  type CardPhotoKind,
  type CardPhotoPlacements,
  type CardPlacement,
  type DispatchCardRenderInput,
} from '@/lib/dispatchCards/renderDispatchCard';
import { zipSync } from 'fflate';
import {
  DEFAULT_DISPATCH_PORTRAIT_PLACEMENT,
  PORTRAIT_CROP_LIMITS,
  normalizePortraitPlacement,
  calculatePortraitCrop,
} from '@/lib/dispatchCards/portraitCrop';
import { HqButton, HqCard, HqInput, HqSelect, HqSegmentedTabs } from '@/components/hq/ui';
import { HqModal } from '@/components/hq/ui/HqModal';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';

interface Props {
  isOpen: boolean;
  driver: HqDriverSummary;
  vehicles: VipRealVehicle[];
  onClose: () => void;
  onAssetUpdated?: () => void;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const DEFAULT_PLACEMENT: CardPlacement = { zoom: 100, x: 0, y: 0 };
type CardSummary = Record<string, { pc: boolean; mobile: boolean }>;
type GenerationMode = 'missing' | 'selected' | 'all';

function cleanFilename(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, '_').slice(0, 55) || 'driver';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function getPhotoPreviewUrl(path: string) {
  return '/api/hq/drivers/assets/preview?path=' + encodeURIComponent(path);
}

export const HqDispatchCardBuilderModal: React.FC<Props> = ({
  isOpen, driver, vehicles, onClose, onAssetUpdated,
}) => {
  const availableVehicles = useMemo(
    () => vehicles.filter(vehicle => Boolean(resolveDispatchCardPhotos(vehicle))),
    [vehicles],
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [name, setName] = useState(driver.name);
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState(driver.phone || '');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoStored, setPhotoStored] = useState(false);
  const [portraitPlacement, setPortraitPlacement] = useState<CardPlacement>({ ...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT });
  const [portraitSavedPlacement, setPortraitSavedPlacement] = useState<CardPlacement>({ ...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT });
  const [portraitSettingsLoaded, setPortraitSettingsLoaded] = useState(false);
  const [portraitSaving, setPortraitSaving] = useState(false);
  const [portraitImageDimensions, setPortraitImageDimensions] = useState({ width: 800, height: 800 });
  const [dbReady, setDbReady] = useState(true);
  const [savedCards, setSavedCards] = useState<CardSummary>({});
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('missing');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [orientation, setOrientation] = useState<CardOrientation>('pc');
  const [photoKind, setPhotoKind] = useState<CardPhotoKind>('exterior');
  const [perVehiclePlacements, setPerVehiclePlacements] = useState<Record<string, CardPhotoPlacements>>({});
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const currentRequest = useRef(0);
  const portraitRequest = useRef(0);
  // Keep the shared HQ modal's focus trap stable while form values change.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeModal = React.useCallback(() => onCloseRef.current(), []);

  const vehicle = useMemo(
    () => availableVehicles.find(v => v.uuid === selectedVehicleId) || availableVehicles[0] || null,
    [availableVehicles, selectedVehicleId],
  );
  const photos = vehicle ? resolveDispatchCardPhotos(vehicle) : null;
  const missingVehicles = availableVehicles.filter(item => {
    const saved = savedCards[item.uuid];
    return !saved?.pc || !saved?.mobile;
  });
  const currentCardStatus = vehicle ? savedCards[vehicle.uuid] : undefined;
  const placements = vehicle ? (perVehiclePlacements[vehicle.uuid] || {}) : {};
  const currentPlacement = placements[photoKind] || DEFAULT_PLACEMENT;
  const smallPortraitFrame = { x: 0, y: 0, w: 150, h: 187.5 };
  const smallPortraitCrop = calculatePortraitCrop(
    portraitImageDimensions.width, portraitImageDimensions.height,
    smallPortraitFrame, portraitPlacement,
  );
  const portraitDirty = portraitPlacement.zoom !== portraitSavedPlacement.zoom ||
    portraitPlacement.x !== portraitSavedPlacement.x ||
    portraitPlacement.y !== portraitSavedPlacement.y;
  const isComplete = Boolean(
    portraitSettingsLoaded && photoStored && photoUrl && name.trim() && position.trim() && phone.trim() && vehicle && photos,
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedVehicleId(previous => availableVehicles.some(v => v.uuid === previous)
      ? previous : (availableVehicles[0]?.uuid || ''));
  }, [isOpen, driver.id, availableVehicles]);

  useEffect(() => {
    if (!isOpen) return;
    const id = ++currentRequest.current;
    setName(driver.name);
    setPosition('');
    setPhone(driver.phone || '');
    setPhotoUrl('');
    setPhotoStored(false);
    setPhotoLoading(true);
    setError('');
    setMessage('');
    setPerVehiclePlacements({});
    fetch('/api/hq/drivers/assets?driverId=' + encodeURIComponent(driver.id) + '&type=profile', {
      cache: 'no-store',
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || data.ok !== true) throw new Error(data.error || '기사 프로필 조회 실패');
        if (currentRequest.current !== id) return;
        setDbReady(data.isDbReady !== false);
        if (data.profile?.filePath) {
          setPhotoUrl(getPhotoPreviewUrl(data.profile.filePath));
          setPhotoStored(true);
        }
      })
      .catch(err => {
        if (currentRequest.current === id) setError(err instanceof Error ? err.message : '프로필 조회 실패');
      })
      .finally(() => {
        if (currentRequest.current === id) setPhotoLoading(false);
      });
    return () => { ++currentRequest.current; };
  }, [isOpen, driver.id, driver.name, driver.phone]);

  async function loadSavedCards(): Promise<CardSummary> {
    const response = await fetch(
      '/api/hq/drivers/assets?driverId=' + encodeURIComponent(driver.id) + '&type=summary',
      { cache: 'no-store' },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) throw new Error(data.error || '저장된 배차카드 조회 실패');
    if (data.isDbReady === false) throw new Error('배차카드 DB 준비가 필요합니다.');
    return (data.vehicleAssetSummary || {}) as CardSummary;
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSavedCards({});
    setSummaryLoaded(false);
    setGenerationMode('missing');
    setAdvancedOpen(false);
    setDownloadsOpen(false);
    void loadSavedCards()
      .then(summary => {
        if (!cancelled) {
          setSavedCards(summary);
          setSummaryLoaded(true);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : '기존 카드 조회 실패');
      });
    return () => { cancelled = true; };
    // Fetch only when the selected driver or dialog changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, driver.id]);

  useEffect(() => {
    if (!isOpen) return;
    const id = ++portraitRequest.current;
    setPortraitSettingsLoaded(false);
    setPortraitPlacement({ ...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT });
    setPortraitSavedPlacement({ ...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT });
    void fetch('/api/hq/drivers/assets/portrait?driverId=' + encodeURIComponent(driver.id), {
      cache: 'no-store',
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok !== true) {
          throw new Error(data.error || '기사 사진 구도를 불러오지 못했습니다.');
        }
        if (portraitRequest.current !== id) return;
        const placement = normalizePortraitPlacement(data.placement);
        setPortraitPlacement(placement);
        setPortraitSavedPlacement(placement);
        setPortraitSettingsLoaded(true);
      })
      .catch(error => {
        if (portraitRequest.current === id) {
          setError(error instanceof Error ? error.message : '기사 사진 구도 조회 실패');
        }
      });
    return () => { ++portraitRequest.current; };
  }, [isOpen, driver.id]);

  /** The same settings are stored once per chauffeur, not once per vehicle. */
  async function persistPortraitPlacement(): Promise<void> {
    if (!portraitSettingsLoaded) throw new Error('기사 사진 구도를 먼저 불러와야 합니다.');
    if (!portraitDirty) return;
    setPortraitSaving(true);
    try {
      const response = await fetch('/api/hq/drivers/assets/portrait', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id, placement: portraitPlacement }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || '기사 사진 구도 저장 실패');
      }
      setPortraitSavedPlacement(normalizePortraitPlacement(result.placement));
    } finally {
      setPortraitSaving(false);
    }
  }

  async function handleProfileFile(file: File) {
    if (!IMAGE_TYPES.has(file.type) || file.size > MAX_PHOTO_BYTES) {
      setError('PNG·JPG·WebP 이미지만 업로드할 수 있습니다. 최대 10MB입니다.');
      return;
    }
    const targetDriverId = driver.id;
    const id = ++currentRequest.current;
    setError('');
    setMessage('');
    setPhotoStored(false);
    setPhotoUploading(true);
    const localUrl = URL.createObjectURL(file);
    setPhotoUrl(localUrl);
    try {
      const image = new Image();
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('기사 사진을 읽을 수 없습니다.'));
        image.src = localUrl;
      });
      if (dimensions.width < 400 || dimensions.height < 400) {
        throw new Error('사진의 가로·세로 길이가 각각 최소 400px 이상이어야 합니다.');
      }
      const form = new FormData();
      form.set('assetType', 'profile');
      form.set('driverId', targetDriverId);
      form.set('driverName', driver.name);
      form.set('width', String(dimensions.width));
      form.set('height', String(dimensions.height));
      form.set('file', file);
      const response = await fetch('/api/hq/drivers/assets/upload', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true || !data.storagePath) {
        throw new Error(data.error || '프로필 사진을 저장하지 못했습니다.');
      }
      if (currentRequest.current !== id) return;
      setPhotoUrl(getPhotoPreviewUrl(data.storagePath));
      setPhotoStored(true);
      setMessage('기사 사진을 비공개 저장소에 저장했습니다. 카드를 미리 볼 수 있습니다.');
      onAssetUpdated?.();
    } catch (err) {
      if (currentRequest.current === id) {
        setPhotoStored(false);
        setPhotoUrl('');
        setError(err instanceof Error ? err.message : '사진 업로드 실패');
      }
    } finally {
      URL.revokeObjectURL(localUrl);
      if (currentRequest.current === id) setPhotoUploading(false);
    }
  }

  const buildInput = (currentVehicle: VipRealVehicle, variant: CardOrientation): DispatchCardRenderInput => {
    const assets = resolveDispatchCardPhotos(currentVehicle);
    if (!assets) throw new Error('해당 차량의 외관·실내 이미지가 등록되지 않았습니다.');
    return {
      name: name.trim(),
      position: position.trim(),
      phone: phone.trim(),
      plate: currentVehicle.plate,
      model: dispatchCardVehicleLabel(currentVehicle),
      photoUrl,
      portraitPlacement,
      photos: assets,
      orientation: variant,
      placements: perVehiclePlacements[currentVehicle.uuid] || {},
    };
  };

  useEffect(() => {
    if (!isOpen || !isComplete || !vehicle) {
      setPreviewUrl('');
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    let currentObjectUrl = '';
    setPreviewLoading(true);
    setError('');
    const job = window.setTimeout(async () => {
      try {
        const canvas = await renderDispatchCard(buildInput(vehicle, orientation));
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(result => result ? resolve(result) : reject(new Error('미리보기 실패')), 'image/webp', 0.82),
        );
        if (cancelled) return;
        currentObjectUrl = URL.createObjectURL(blob);
        setPreviewUrl(currentObjectUrl);
      } catch (err) {
        if (!cancelled) {
          setPreviewUrl('');
          setError(err instanceof Error ? err.message : '배차카드를 생성하지 못했습니다.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(job);
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
    // Only values used by rendering, including position adjustments, trigger preview updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isComplete, vehicle?.uuid, orientation, name, position, phone, photoUrl, portraitPlacement, perVehiclePlacements]);

  const updatePlacement = (key: keyof CardPlacement, value: number) => {
    if (!vehicle) return;
    setPerVehiclePlacements(prev => {
      const current = prev[vehicle.uuid] || {};
      return {
        ...prev,
        [vehicle.uuid]: {
          ...current,
          [photoKind]: { ...(current[photoKind] || DEFAULT_PLACEMENT), [key]: value },
        },
      };
    });
  };

  const downloadSingle = async () => {
    if (!isComplete || !vehicle || busy) return;
    setBusy(true);
    setError('');
    try {
      await persistPortraitPlacement();
      const canvas = await renderDispatchCard(buildInput(vehicle, orientation));
      const blob = await cardCanvasToPng(canvas);
      downloadBlob(blob, 'VIP_' + cleanFilename(name) + '_' + cleanFilename(vehicle.plate) + '_' + orientation + '.png');
      setMessage('선택한 차량의 ' + (orientation === 'pc' ? 'PC' : '모바일') + ' 배차카드를 저장했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '다운로드 실패');
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = async () => {
    if (!isComplete || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const entries: Record<string, Uint8Array> = {};
    const failures: string[] = [];
    try {
      await persistPortraitPlacement();
      for (let i = 0; i < availableVehicles.length; i++) {
        const item = availableVehicles[i];
        setProgress((i + 1) + ' / ' + availableVehicles.length + '대 생성 중 · ' + item.plate);
        try {
          for (const variant of ['pc', 'mobile'] as const) {
            const canvas = await renderDispatchCard(buildInput(item, variant));
            const blob = await cardCanvasToPng(canvas);
            const key = cleanFilename(item.plate) + '/' + cleanFilename(name) + '_' + variant + '.png';
            entries[key] = new Uint8Array(await blob.arrayBuffer());
          }
        } catch {
          // No half-complete pair should ever be offered as a finished card.
          delete entries[cleanFilename(item.plate) + '/' + cleanFilename(name) + '_pc.png'];
          delete entries[cleanFilename(item.plate) + '/' + cleanFilename(name) + '_mobile.png'];
          failures.push(item.plate);
        }
      }
      if (Object.keys(entries).length === 0) throw new Error('완성할 수 있는 차량 카드가 없습니다. 차량별 사진을 확인해 주세요.');
      setProgress('ZIP 압축 중…');
      const bytes = zipSync(entries, { level: 0 });
      downloadBlob(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }), 'VIP_Dispatch_Cards_' + cleanFilename(name) + '.zip');
      setMessage((Object.keys(entries).length / 2) + '대의 PC·모바일 카드 다운로드 완료.' +
        (failures.length ? ' 이미지 오류로 제외: ' + failures.join(', ') : ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : '전체 다운로드 실패');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  // Stored cards are never changed by the default 'missing' mode. Explicit
  // selected/all modes are the only way to intentionally create new versions.
  const saveAllToAssetLibrary = async () => {
    if (!isComplete || !dbReady || busy || !summaryLoaded) return;
    setBusy(true);
    setError('');
    setMessage('');
    let generatedCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];
    try {
      await persistPortraitPlacement();
      // Always refresh immediately before the batch. The server also rejects
      // writes to an existing slot when skipIfExists=true.
      const latest = await loadSavedCards();
      setSavedCards(latest);
      const targets = generationMode === 'selected'
        ? (vehicle ? [vehicle] : [])
        : generationMode === 'missing'
          ? availableVehicles.filter(item => !latest[item.uuid]?.pc || !latest[item.uuid]?.mobile)
          : availableVehicles;
      if (targets.length === 0) {
        setMessage('추가 생성할 미등록 차량 카드가 없습니다. 기존 배차카드는 그대로 유지됩니다.');
        return;
      }
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setProgress((i + 1) + ' / ' + targets.length + '대 등록 중 · ' + item.plate);
        for (const variant of ['pc', 'mobile'] as const) {
          if (generationMode === 'missing' && latest[item.uuid]?.[variant]) {
            skippedCount++;
            continue;
          }
          try {
            const canvas = await renderDispatchCard(buildInput(item, variant));
            const blob = await new Promise<Blob>((resolve, reject) =>
              canvas.toBlob(result => result ? resolve(result) : reject(new Error('WebP 변환 실패')), 'image/webp', 0.9),
            );
            const form = new FormData();
            form.set('assetType', 'info');
            form.set('driverId', driver.id);
            form.set('driverName', name.trim());
            form.set('vehicleId', item.uuid);
            form.set('vehiclePlate', item.plate);
            form.set('vehicleModel', item.model);
            form.set('variant', variant);
            form.set('width', String(canvas.width));
            form.set('height', String(canvas.height));
            if (generationMode === 'missing') form.set('skipIfExists', 'true');
            form.set('file', blob, 'dispatch_' + cleanFilename(item.plate) + '_' + variant + '.webp');
            const response = await fetch('/api/hq/drivers/assets/upload', { method: 'POST', body: form });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.ok !== true) {
              throw new Error(result.error || '배차카드 서버 저장 실패');
            }
            if (result.skipped) skippedCount++;
            else generatedCount++;
          } catch (err) {
            failures.push(item.plate + ' / ' + variant + ' (' +
              (err instanceof Error ? err.message : '오류') + ')');
          }
        }
      }
      try {
        setSavedCards(await loadSavedCards());
      } catch (err) {
        setError('저장 후 카드 목록 갱신에 실패했습니다. 화면을 다시 열어 확인해 주세요.');
      }
      if (generatedCount > 0) onAssetUpdated?.();
      setMessage('PC·모바일 카드 ' + generatedCount + '장 저장 완료 · 기존 카드 ' +
        skippedCount + '장 유지. 고객에게 자동 발송되지 않습니다.');
      if (failures.length) setError('일부 생성 실패 — ' + failures.join(' / '));
    } catch (err) {
      setError(err instanceof Error ? err.message : '배차카드 저장 실패');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <HqModal
      isOpen={isOpen}
      title="배차카드 자동 생성"
      subtitle="기사 정보 한 번 입력 · 차량별 PC·모바일 카드 생성"
      icon={<span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[#EEF3FF] text-[#1E60F3]"><UserRound className="size-5" /></span>}
      onClose={closeModal}
      className="max-w-[1180px]! w-full"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <HqButton variant="secondary" onClick={() => setDownloadsOpen(value => !value)}
            disabled={!isComplete || busy || portraitSaving} aria-expanded={downloadsOpen} className="w-full sm:w-auto">
            <Download className="size-4" /> 파일 다운로드 <ChevronDown className={'size-4 transition-transform ' + (downloadsOpen ? 'rotate-180' : '')} />
          </HqButton>
          <div className="flex w-full gap-2 sm:w-auto">
            <HqButton variant="subtle" onClick={closeModal} className="flex-1 sm:flex-none">닫기</HqButton>
            <HqButton variant="primary" className="min-w-0 flex-[2] sm:flex-none" loading={busy}
              disabled={!isComplete || !dbReady || !summaryLoaded || busy || portraitSaving || photoUploading || previewLoading || (generationMode === 'missing' && missingVehicles.length === 0)}
              onClick={() => {
                if (generationMode !== 'all' || window.confirm('준비된 모든 차량의 기존 카드를 새 버전으로 교체할까요?')) {
                  void saveAllToAssetLibrary();
                }
              }}>
              {busy ? (progress || '저장 중…') : (
                <><CheckCircle2 className="size-4" />{generationMode === 'missing' ? '미생성 카드만 등록' : generationMode === 'selected' ? '선택 차량 등록' : '전체 카드 재생성'}</>
              )}
            </HqButton>
          </div>
        </div>
      }
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <HqCard className="p-4 sm:p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-[#21344D]">
              <UserRound className="size-4 text-[#1E60F3]" /> 기사 정보
            </h3>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[15px] bg-[#F5F7FA]">
                {photoUrl ? <img src={photoUrl} alt="기사 프로필" className="size-full object-contain" /> :
                  <UserRound className="size-7 text-[#A0ACBB]" />}
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-[12px] leading-relaxed text-[#73839A]">정면·어깨까지 나온 투명 PNG 사진을 권장합니다.</p>
                <input ref={fileRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void handleProfileFile(file);
                    event.target.value = '';
                  }} />
                <HqButton variant="secondary" size="sm" disabled={photoUploading || photoLoading || busy}
                  onClick={() => fileRef.current?.click()}>
                  {photoUploading || photoLoading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  {photoUrl ? '사진 변경' : '사진 업로드'}
                </HqButton>
              </div>
            </div>
            <div className="space-y-3">
              {([
                { label: '기사 성명', value: name, onChange: setName, placeholder: '기사 이름' },
                { label: '직책', value: position, onChange: setPosition, placeholder: '예: 실장 / Department Manager' },
                { label: '전화번호', value: phone, onChange: setPhone, placeholder: '예: +82 10 1234 5678' },
              ] as const).map(field => (
                <label key={field.label} className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-[#526680]">{field.label}</span>
                  <HqInput value={field.value} onChange={event => field.onChange(event.target.value)}
                    placeholder={field.placeholder} maxLength={90} />
                </label>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#8492A4]">
              기사 정보 수정은 생성할 카드에만 적용되며 기사 원본 정보는 바뀌지 않습니다.
            </p>
          </HqCard>

          <HqCard className="p-4 sm:p-5">
            <h3 className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-[#21344D]">
              <SlidersHorizontal className="size-4 text-[#1E60F3]" /> 기사 사진 구도
            </h3>
            <p className="mb-4 text-[11px] leading-relaxed text-[#8492A4]">
              기사마다 얼굴 크기가 달라도 맞출 수 있어요. 미리보기와 오른쪽 완성 카드를 보면서 조절하세요.
            </p>
            {photoUrl && (
              <div className="mb-4 flex items-center gap-4 rounded-[14px] bg-[#F7F9FC] p-3">
                <div className="relative shrink-0 overflow-hidden bg-white" style={{ width: 150, height: 187.5 }}>
                  <img src={photoUrl} alt="조정 중인 기사 사진의 실시간 크롭 미리보기"
                    onLoad={event => setPortraitImageDimensions({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })}
                    style={{
                      position: 'absolute', left: smallPortraitCrop.x, top: smallPortraitCrop.y,
                      width: smallPortraitCrop.w, height: smallPortraitCrop.h,
                      maxWidth: 'none', maxHeight: 'none',
                    }} />
                </div>
                <p className="min-w-0 text-[11px] leading-relaxed text-[#73839A]">
                  기사 얼굴을 확인하면서 확대하고 위치를 옮겨보세요. 실제 배차카드와 같은 비율로 표시합니다.
                </p>
              </div>
            )}
            <div className="space-y-4">
              {([
                ['zoom', '얼굴 확대', PORTRAIT_CROP_LIMITS.zoom.min, PORTRAIT_CROP_LIMITS.zoom.max, '%'],
                ['x', '좌우 위치', PORTRAIT_CROP_LIMITS.x.min, PORTRAIT_CROP_LIMITS.x.max, '%'],
                ['y', '상하 위치', PORTRAIT_CROP_LIMITS.y.min, PORTRAIT_CROP_LIMITS.y.max, '%'],
              ] as const).map(([key, label, min, max, suffix]) => (
                <label key={key} className="block">
                  <span className="mb-1.5 flex justify-between text-[12px] text-[#62738A]">
                    <span>{label}</span><strong className="font-semibold">{portraitPlacement[key]}{suffix}</strong>
                  </span>
                  <input type="range" min={min} max={max} step={1}
                    aria-label={'기사 사진 ' + label} value={portraitPlacement[key]}
                    disabled={!portraitSettingsLoaded || busy || portraitSaving}
                    onChange={event => setPortraitPlacement(current => ({
                      ...current, [key]: Number(event.target.value),
                    }))}
                    className="w-full accent-[#1E60F3]" />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <HqButton variant="ghost" size="sm" disabled={!portraitSettingsLoaded || busy || portraitSaving}
                onClick={() => setPortraitPlacement({ ...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT })}>
                기본 구도 복원
              </HqButton>
              <HqButton variant={portraitDirty ? 'primary' : 'secondary'} size="sm"
                disabled={!portraitSettingsLoaded || !portraitDirty || busy || portraitSaving}
                loading={portraitSaving}
                onClick={() => {
                  void persistPortraitPlacement()
                    .then(() => setMessage('기사 사진 구도를 저장했습니다. 이후 새 차량 카드에도 동일하게 적용됩니다.'))
                    .catch(err => setError(err instanceof Error ? err.message : '사진 구도 저장 실패'));
                }}>
                구도 저장
              </HqButton>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#8492A4]">
              {portraitSettingsLoaded
                ? portraitDirty
                  ? '미저장 변경사항이 있습니다. 카드 등록·다운로드 시에도 자동 저장됩니다.'
                  : '기사별 설정 저장됨 · 이후 만드는 PC·모바일 카드에 공통 적용 (기존 등록 카드는 유지)'
                : '기사별 사진 설정 불러오는 중…'}
            </p>
          </HqCard>

          <HqCard className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-[#21344D]">차량 선택</h3>
              <span className="text-[12px] text-[#73839A]">사진 연결 {availableVehicles.length}대</span>
            </div>
            <HqSelect aria-label="미리보기 차량 선택" value={vehicle?.uuid || ''}
              onChange={event => setSelectedVehicleId(event.target.value)}
              disabled={!availableVehicles.length || busy}>
              {availableVehicles.length === 0 && <option value="">이미지가 준비된 차량 없음</option>}
              {availableVehicles.map(item => <option key={item.uuid} value={item.uuid}>{item.plate} · {item.modelShort}</option>)}
            </HqSelect>
            <p className="mt-3 text-[11px] leading-relaxed text-[#8492A4]">
              외관 1장·실내 2장이 준비된 차량만 표시됩니다. 차량별 전용 사진이 공통 모델 사진보다 우선합니다.
            </p>
            <div className="mt-3 rounded-[12px] bg-[#F7F9FC] p-3 text-[12px] leading-relaxed text-[#526680]">
              {summaryLoaded
                ? '추가 생성 필요 ' + missingVehicles.length + '대 · 사진 준비 ' + availableVehicles.length + '대'
                : '저장된 배차카드 확인 중…'}
              {vehicle && summaryLoaded && <p className="mt-1 text-[#73839A]">
                선택 차량: PC {currentCardStatus?.pc ? '등록됨' : '미등록'} · 모바일 {currentCardStatus?.mobile ? '등록됨' : '미등록'}
              </p>}
            </div>
            {!dbReady && (
              <HqInlineFeedback tone="error" message="배차카드 DB 준비가 필요합니다. 미리보기·다운로드는 가능하지만 서버 등록은 차단됩니다." className="mt-3" />
            )}
          </HqCard>

          <HqCard className="p-4 sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-[#21344D]">
              <SlidersHorizontal className="size-4 text-[#1E60F3]" /> 이미지 위치 조정
            </h3>
            <HqSegmentedTabs aria-label="조정할 차량 이미지" value={photoKind}
              onValueChange={value => setPhotoKind(value as CardPhotoKind)}
              tabs={[
                { id: 'exterior', label: '외관' },
                { id: 'interiorOne', label: '실내 1' },
                { id: 'interiorTwo', label: '실내 2' },
              ]} />
            <div className="mt-4 space-y-3">
              {([
                ['zoom', '크기', 80, 150, '%'],
                ['x', '좌우', -20, 20, '%'],
                ['y', '상하', -20, 20, '%'],
              ] as const).map(([key, label, min, max, suffix]) => (
                <label key={key} className="block">
                  <span className="mb-1 flex justify-between text-[12px] text-[#62738A]">
                    <span>{label}</span><strong className="font-semibold">{currentPlacement[key]}{suffix}</strong>
                  </span>
                  <input type="range" min={min} max={max} value={currentPlacement[key]}
                    disabled={!vehicle || busy} onChange={event => updatePlacement(key, Number(event.target.value))}
                    className="w-full accent-[#1E60F3]" />
                </label>
              ))}
            </div>
            <HqButton variant="ghost" size="sm" className="mt-2" disabled={!vehicle || busy}
              onClick={() => {
                if (!vehicle) return;
                setPerVehiclePlacements(previous => ({
                  ...previous,
                  [vehicle.uuid]: { ...previous[vehicle.uuid], [photoKind]: DEFAULT_PLACEMENT },
                }));
              }}>
              선택 이미지 초기화
            </HqButton>
            <p className="mt-2 text-[11px] text-[#8492A4]">이번 생성에만 적용되며 다른 관리자 기기에는 저장되지 않습니다.</p>
          </HqCard>
        </div>

        <div className="min-w-0 space-y-4">
          <HqCard className="overflow-hidden">
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h3 className="text-[14px] font-semibold text-[#21344D]">완성 카드 미리보기</h3>
                <p className="mt-1 text-[11px] text-[#8492A4]">PC·모바일 규격을 선택해 완성된 이미지를 확인하세요.</p>
              </div>
              <HqSegmentedTabs aria-label="배차카드 미리보기 규격" value={orientation}
                onValueChange={value => setOrientation(value as CardOrientation)}
                tabs={[
                  { id: 'pc', label: <><Monitor className="size-4" /> PC</> },
                  { id: 'mobile', label: <><Smartphone className="size-4" /> 모바일</> },
                ]} />
            </div>
            <div className="flex min-h-[280px] items-center justify-center bg-[#F5F7FA] p-4 sm:min-h-[430px] sm:p-6">
              {previewLoading && <div role="status" className="flex items-center gap-2 text-[12px] text-[#66778B]">
                <Loader2 className="size-4 animate-spin" /> 카드 생성 중…
              </div>}
              {!previewLoading && previewUrl && isComplete && (
                <img src={previewUrl} alt={vehicle?.plate + ' 배차카드 ' + orientation + ' 미리보기'}
                  className="max-h-[55vh] max-w-full object-contain shadow-[0_12px_32px_rgba(15,25,45,.14)]" />
              )}
              {!previewLoading && (!isComplete || !previewUrl) && (
                <div className="space-y-2 px-2 text-center text-[#8492A4]">
                  <ImagePlus className="mx-auto size-8" strokeWidth={1.5} />
                  <p className="text-[13px] font-semibold text-[#54657A]">기사 사진·성명·직책·전화번호를 입력해 주세요.</p>
                  <p className="text-[12px]">입력이 완료되면 선택한 차량 카드가 미리보기로 표시됩니다.</p>
                </div>
              )}
            </div>
          </HqCard>

          {(error || message) && (
            <HqInlineFeedback tone={error ? 'error' : 'success'} message={error || message} />
          )}

          <HqCard className="p-4 sm:p-5">
            <button type="button" className="flex min-h-10 w-full items-center justify-between text-left"
              onClick={() => setAdvancedOpen(value => !value)} aria-expanded={advancedOpen}>
              <span className="text-[13px] font-semibold text-[#526680]">
                {generationMode === 'missing' ? '저장 범위 · 미생성 카드만 추가' : generationMode === 'selected' ? '저장 범위 · 선택 차량' : '저장 범위 · 전체 재생성'}
              </span>
              <ChevronDown className={'size-4 text-[#8492A4] transition-transform ' + (advancedOpen ? 'rotate-180' : '')} />
            </button>
            <p className="mt-1 text-[11px] leading-relaxed text-[#8492A4]">
              {generationMode === 'missing'
                ? '기존에 등록된 PC·모바일 카드는 보존하고 없는 카드만 추가합니다.'
                : generationMode === 'selected'
                  ? '선택한 차량의 PC·모바일 카드를 새 버전으로 저장합니다.'
                  : '이미지 준비된 모든 차량의 카드를 새 버전으로 다시 생성합니다.'}
            </p>
            {advancedOpen && (
              <div className="mt-4 border-t border-[#EEF1F6] pt-4">
                <HqSegmentedTabs aria-label="배차카드 저장 범위" value={generationMode}
                  onValueChange={value => setGenerationMode(value as GenerationMode)}
                  tabs={[
                    { id: 'missing', label: '미생성만 추가' },
                    { id: 'selected', label: '선택 차량' },
                    { id: 'all', label: '전체 재생성' },
                  ]} />
                {generationMode === 'all' && (
                  <HqInlineFeedback tone="error" message="전체 재생성은 기존 카드의 활성 버전을 교체합니다. 저장 전에 한 번 더 확인합니다." className="mt-3" />
                )}
              </div>
            )}
          </HqCard>

          {downloadsOpen && (
            <HqCard className="p-4 sm:p-5">
              <h3 className="mb-3 text-[13px] font-semibold text-[#526680]">파일 다운로드</h3>
              <div className="flex flex-col gap-2 sm:flex-row">
                <HqButton variant="secondary" onClick={() => void downloadSingle()}
                  disabled={!isComplete || busy || portraitSaving || photoUploading || previewLoading} className="w-full sm:w-auto">
                  <Download className="size-4" /> 선택한 {orientation === 'pc' ? 'PC' : '모바일'} 카드 PNG
                </HqButton>
                <HqButton variant="secondary" onClick={() => void downloadAll()}
                  disabled={!isComplete || busy || portraitSaving || photoUploading || previewLoading} className="w-full sm:w-auto">
                  <Download className="size-4" /> 준비된 차량 전체 ZIP
                </HqButton>
              </div>
            </HqCard>
          )}
        </div>
      </div>
    </HqModal>
  );
};
