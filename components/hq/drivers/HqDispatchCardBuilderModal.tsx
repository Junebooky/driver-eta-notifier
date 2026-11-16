'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Download, ImagePlus, Loader2,
  Monitor, Smartphone, SlidersHorizontal, UserRound, X,
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
  const [dbReady, setDbReady] = useState(true);
  const [savedCards, setSavedCards] = useState<CardSummary>({});
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('missing');
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
  const isComplete = Boolean(
    photoStored && photoUrl && name.trim() && position.trim() && phone.trim() && vehicle && photos,
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
  }, [isOpen, isComplete, vehicle?.uuid, orientation, name, position, phone, photoUrl, perVehiclePlacements]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[#17233B]/35 p-2 backdrop-blur-[3px] sm:p-5" role="presentation">
      <div className="flex max-h-[94vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[23px] bg-[#F8FAFD] shadow-[0_28px_80px_rgba(20,35,60,0.22)]" role="dialog" aria-modal="true" aria-label="배차카드 자동 생성">
        <div className="flex shrink-0 items-center justify-between bg-white px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onClose} aria-label="이전 화면" className="flex size-9 items-center justify-center rounded-[12px] bg-[#F2F5F9] text-[#6A7B91] hover:bg-[#E9EDF5]">
              <ArrowLeft size={17}/>
            </button>
            <div>
              <h2 className="text-[17px] font-bold tracking-[-.03em] text-[#17233B]">배차카드 자동 생성</h2>
              <p className="text-[11px] text-[#75849A]">기사 정보 한 번 입력 · 차량별 PC·모바일 카드 생성</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex size-9 items-center justify-center rounded-[12px] text-[#91A0B1] hover:bg-[#F3F6FA]"><X size={19}/></button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden lg:p-5">
          <div className="space-y-4 lg:overflow-y-auto lg:pr-1">
            <section className="rounded-[18px] bg-white p-5 shadow-[0_4px_18px_rgba(27,45,77,.045)]">
              <h3 className="mb-4 flex items-center gap-2 text-[14px] font-bold text-[#21344D]"><UserRound size={16} className="text-[#1E60F3]"/> 기사 정보</h3>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[15px] bg-[#F3F5F8]">
                  {photoUrl ? <img src={photoUrl} alt="기사 프로필" className="h-full w-full object-contain"/> : <UserRound size={29} className="text-[#A0ACBB]"/>}
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-[11px] leading-relaxed text-[#73839A]">흰색 배경 없이 정면·어깨까지 담긴 투명 PNG를 권장해요.</p>
                  <input ref={fileRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void handleProfileFile(file);
                    event.target.value = '';
                  }}/>
                  <button type="button" disabled={photoUploading || photoLoading || busy} onClick={() => fileRef.current?.click()} className="inline-flex min-h-9 items-center gap-1.5 rounded-[11px] bg-[#EDF3FF] px-3 text-[11px] font-semibold text-[#1E60F3] disabled:opacity-50">
                    {photoUploading || photoLoading ? <Loader2 size={13} className="animate-spin"/> : <ImagePlus size={14}/>}
                    {photoUrl ? '사진 변경' : '사진 업로드'}
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {([
                  { label: '기사 성명', value: name, onChange: setName, placeholder: '기사 이름' },
                  { label: '직책', value: position, onChange: setPosition, placeholder: '예: 실장 / Department Manager' },
                  { label: '전화번호', value: phone, onChange: setPhone, placeholder: '예: +82 10 1234 5678' },
                ] as const).map(field =>
                  <label key={field.label} className="block space-y-1.5">
                    <span className="text-[11px] font-semibold text-[#526680]">{field.label}</span>
                    <input value={field.value} onChange={e => field.onChange(e.target.value)} placeholder={field.placeholder} maxLength={90}
                      className="h-11 w-full rounded-[12px] bg-[#F6F8FB] px-3 text-[13px] text-[#1D3048] outline-none focus:ring-2 focus:ring-[#1E60F3]/20"/>
                  </label>,
                )}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[#8B98A9]">입력한 이름·직책·전화번호는 이번 카드 생성에 적용됩니다. 기사 원본 DB 정보는 변경하지 않습니다.</p>
            </section>

            <section className="rounded-[18px] bg-white p-5 shadow-[0_4px_18px_rgba(27,45,77,.045)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[14px] font-bold text-[#21344D]">차량 선택</h3>
                <span className="text-[11px] font-semibold text-[#1E60F3]">{availableVehicles.length}대 이미지 연결</span>
              </div>
              <select value={vehicle?.uuid || ''} onChange={event => setSelectedVehicleId(event.target.value)} disabled={!availableVehicles.length || busy}
                className="h-11 w-full rounded-[12px] bg-[#F6F8FB] px-3 text-[12px] text-[#24374F] outline-none focus:ring-2 focus:ring-[#1E60F3]/20">
                {availableVehicles.length === 0 && <option value="">이미지가 연결된 차량 없음</option>}
                {availableVehicles.map(item => <option key={item.uuid} value={item.uuid}>{item.plate} · {item.modelShort}</option>)}
              </select>
              <p className="mt-2 text-[10px] leading-relaxed text-[#8491A4]">
                사진 3장이 준비된 차량만 표시합니다. 차량별 폴더가 있으면 공통 모델 사진보다 우선합니다.
              </p>
              <div className="mt-2 rounded-[11px] bg-[#F5F7FB] px-3 py-2 text-[11px] text-[#66788F]">
                {summaryLoaded ? ('미생성 차량 ' + missingVehicles.length + '대 / 준비된 차량 ' + availableVehicles.length + '대') : '기존 배차카드 확인 중…'}
                {vehicle && summaryLoaded && (
                  <span className="mt-1 block">
                    선택 차량: PC {currentCardStatus?.pc ? '등록됨' : '미등록'} · 모바일 {currentCardStatus?.mobile ? '등록됨' : '미등록'}
                  </span>
                )}
              </div>
              {!dbReady && <p role="alert" className="mt-2 rounded-[10px] bg-[#FFF1EB] px-3 py-2 text-[11px] text-[#A85B47]">배차카드 자산 DB 준비가 필요합니다. 미리보기·다운로드는 가능하지만 서버 등록은 차단됩니다.</p>}
            </section>

            <section className="rounded-[18px] bg-white p-5 shadow-[0_4px_18px_rgba(27,45,77,.045)]">
              <h3 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#21344D]"><SlidersHorizontal size={16} className="text-[#1E60F3]"/> 이미지 위치 조정</h3>
              <div className="mb-3 flex gap-1 rounded-[11px] bg-[#F4F6F9] p-1">
                {([
                  ['exterior', '외관'], ['interiorOne', '실내 1'], ['interiorTwo', '실내 2'],
                ] as const).map(([key, label]) =>
                  <button type="button" key={key} onClick={() => setPhotoKind(key)}
                    className={'min-h-9 flex-1 rounded-[9px] text-[11px] font-semibold ' + (photoKind === key ? 'bg-white text-[#1E60F3] shadow-sm' : 'text-[#74849A]')}>
                    {label}
                  </button>,
                )}
              </div>
              {([
                ['zoom', '크기', 80, 150, '%'],
                ['x', '좌우', -20, 20, '%'],
                ['y', '상하', -20, 20, '%'],
              ] as const).map(([key, label, min, max, suffix]) =>
                <label key={key} className="mb-3 block">
                  <span className="mb-1 flex justify-between text-[11px] text-[#62738A]"><span>{label}</span><strong>{currentPlacement[key]}{suffix}</strong></span>
                  <input type="range" min={min} max={max} value={currentPlacement[key]} disabled={!vehicle || busy} onChange={e => updatePlacement(key, Number(e.target.value))}
                    className="w-full accent-[#1E60F3]"/>
                </label>,
              )}
              <button type="button" onClick={() => {
                if (!vehicle) return;
                setPerVehiclePlacements(prev => ({ ...prev, [vehicle.uuid]: { ...prev[vehicle.uuid], [photoKind]: DEFAULT_PLACEMENT } }));
              }} className="text-[11px] font-medium text-[#6D7D91] underline underline-offset-2">선택 이미지 초기화</button>
              <p className="mt-2 text-[10px] text-[#8995A5]">위치 조정은 이번 생성에 적용되며 다른 관리자 기기에는 저장되지 않습니다.</p>
            </section>
          </div>

          <div className="flex min-h-[480px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_4px_18px_rgba(27,45,77,.045)] lg:min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-[14px] font-bold text-[#21344D]">완성 카드 미리보기</h3>
                <p className="text-[10px] text-[#8491A4]">등록 이미지와 입력한 기사 정보가 그대로 PNG에 출력됩니다.</p>
              </div>
              <div className="inline-flex rounded-[12px] bg-[#F3F6FA] p-1">
                <button type="button" onClick={() => setOrientation('pc')} className={'flex min-h-9 items-center gap-1 rounded-[9px] px-3 text-[11px] font-semibold ' + (orientation === 'pc' ? 'bg-white text-[#1E60F3] shadow-sm' : 'text-[#8390A2]')}><Monitor size={14}/> PC</button>
                <button type="button" onClick={() => setOrientation('mobile')} className={'flex min-h-9 items-center gap-1 rounded-[9px] px-3 text-[11px] font-semibold ' + (orientation === 'mobile' ? 'bg-white text-[#1E60F3] shadow-sm' : 'text-[#8390A2]')}><Smartphone size={14}/> 모바일</button>
              </div>
            </div>

            <div className="flex min-h-[320px] flex-1 items-center justify-center overflow-auto bg-[#EEF1F5] p-4 sm:p-6">
              {previewLoading && <div role="status" className="flex items-center gap-2 text-[12px] text-[#66778B]"><Loader2 size={17} className="animate-spin"/> 카드 생성 중…</div>}
              {!previewLoading && previewUrl && isComplete && <img src={previewUrl} alt={vehicle?.plate + ' 배차카드 ' + orientation + ' 미리보기'}
                className="max-h-[65vh] max-w-full object-contain shadow-[0_14px_40px_rgba(15,25,45,.17)]"/>}
              {!previewLoading && (!isComplete || !previewUrl) &&
                <div className="max-w-xs space-y-2 text-center text-[#8492A3]">
                  <ImagePlus className="mx-auto" size={35} strokeWidth={1.4}/>
                  <p className="text-[13px] font-semibold text-[#54657A]">기사 사진·성명·직책·전화번호를 입력해 주세요.</p>
                  <p className="text-[11px]">사진이 저장되면 선택한 차량의 PC·모바일 카드가 자동으로 만들어집니다.</p>
                </div>}
            </div>

            {(error || message) && (
              <p role={error ? 'alert' : 'status'} className={'mx-4 mt-3 rounded-[11px] px-3 py-2 text-[11px] ' + (error ? 'bg-[#FFF0EE] text-[#A3544E]' : 'bg-[#F1F7FF] text-[#466B9F]')}>
                {error || message}
              </p>
            )}
            <div className="border-t border-[#F1F3F7] bg-white px-4 py-3 sm:px-5">
              <p className="mb-2 text-[11px] font-semibold text-[#526680]">배차카드 생성 방식</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ['missing', '미생성만 추가'],
                  ['selected', '선택 차량'],
                  ['all', '전체 재생성'],
                ] as const).map(([mode, label]) => (
                  <button key={mode} type="button" disabled={busy} onClick={() => setGenerationMode(mode)}
                    aria-pressed={generationMode === mode}
                    className={'min-h-10 rounded-[10px] px-2 text-[11px] font-semibold ' +
                      (generationMode === mode ? 'bg-[#EAF1FF] text-[#1E60F3]' : 'bg-[#F5F7FA] text-[#71829B]')}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[#8491A4]">
                {generationMode === 'missing'
                  ? '기본값: 기존 PC·모바일 카드는 보존하고 비어 있는 카드만 추가합니다.'
                  : generationMode === 'selected'
                    ? '선택한 차량의 PC·모바일 카드를 새 버전으로 저장합니다.'
                    : '주의: 이미지가 준비된 모든 차량의 기존 카드를 새 버전으로 교체합니다.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 bg-white p-4 sm:px-5">
              <button type="button" onClick={onClose} className="min-h-11 rounded-[12px] bg-[#F3F5F8] px-4 text-[12px] font-semibold text-[#67788D]">닫기</button>
              <button type="button" disabled={!isComplete || busy || photoUploading || previewLoading} onClick={() => void downloadSingle()}
                className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#EBF1FF] px-4 text-[12px] font-bold text-[#1E60F3] disabled:opacity-40">
                <Download size={15}/> 선택한 카드 PNG
              </button>
              <button type="button" disabled={!isComplete || !dbReady || !summaryLoaded || busy || photoUploading || previewLoading || (generationMode === 'missing' && missingVehicles.length === 0)}
                onClick={() => { if (generationMode !== 'all' || window.confirm('준비된 모든 차량의 기존 카드를 새 버전으로 교체할까요?')) void saveAllToAssetLibrary(); }}
                className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#1E60F3] px-4 text-[12px] font-bold text-white disabled:opacity-40">
                {busy ? <Loader2 size={15} className="animate-spin"/> : <CheckCircle2 size={15}/>}
                {busy ? (progress || '저장 중…') : generationMode === 'missing' ? '미생성 카드만 등록' : generationMode === 'selected' ? '선택 차량 등록' : '전체 카드 재생성'}
              </button>
              <button type="button" disabled={!isComplete || busy || photoUploading || previewLoading} onClick={() => void downloadAll()}
                className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#1E60F3] px-4 text-[12px] font-bold text-white disabled:opacity-40">
                {busy ? <Loader2 size={15} className="animate-spin"/> : <CheckCircle2 size={15}/>}
                {busy ? (progress || '생성 중…') : '준비된 전체 차량 ZIP'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
