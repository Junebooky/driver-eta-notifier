'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Download, ImagePlus, Loader2,
  ChevronDown, Columns2,
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
  normalizePortraitPlacement,
} from '@/lib/dispatchCards/portraitCrop';
import { HqButton, HqCard, HqInput, HqSegmentedTabs } from '@/components/hq/ui';
import { HqSearchSelect } from '@/components/hq/ui/HqSearchSelect';
import { HqModal } from '@/components/hq/ui/HqModal';
import { HqDispatchCardCompareModal } from './HqDispatchCardCompareModal';
import { HqInlineFeedback } from '@/components/hq/ui/HqInlineFeedback';
import { HqDispatchCardLiveEditor, type DispatchCardEditMode } from './HqDispatchCardLiveEditor';
import { CHAUFFEUR_POSITION_OPTIONS, formatBilingualChauffeurName, getEnglishPosition, validateDispatchCardProfile, type ChauffeurPositionCode } from '@/lib/dispatchCards/chauffeurIdentity';
import { formatKoreanMobileInternationalInput, KOREA_MOBILE_PREFIX } from '@/utils/koreanInternationalPhone';
import { formatKoreanEnglishName } from '@/utils/koreanNameRomanization';
import { shouldRebuildDriverCards } from '@/lib/dispatchCards/cardRevision';

interface Props {
  isOpen: boolean;
  driver: HqDriverSummary;
  vehicles: VipRealVehicle[];
  initialVehicleId?: string;
  onClose: () => void;
  onAssetUpdated?: () => void;
  onProfileUpdated?: () => void;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const DEFAULT_PLACEMENT: CardPlacement = { zoom: 100, x: 0, y: 0 };
type CardSummary = Record<string, { pc: boolean; mobile: boolean; stalePc?: boolean; staleMobile?: boolean }>;
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
  isOpen, driver, vehicles, initialVehicleId, onClose, onAssetUpdated, onProfileUpdated,
}) => {
  const availableVehicles = useMemo(
    () => vehicles.filter(vehicle => Boolean(resolveDispatchCardPhotos(vehicle))),
    [vehicles],
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [name, setName] = useState(driver.name);
  // Show one company-standard name as a placeholder. A tap explicitly applies it;
  // never silently save a suggestion or overwrite an already confirmed spelling.
  const [englishName, setEnglishName] = useState('');
  const [storedEnglishName, setStoredEnglishName] = useState('');
  const [storedKoreanName, setStoredKoreanName] = useState('');
  const suggestedEnglishName = useMemo(() => formatKoreanEnglishName(name), [name]);
  const applySuggestedEnglishName = () => {
    if (suggestedEnglishName && !englishName.trim()) setEnglishName(suggestedEnglishName);
  };
  const updateKoreanName = (nextName: string) => {
    if (nextName !== name) {
      // The previously confirmed English spelling only belongs to the saved Korean name.
      // If the Korean name is restored, restore that confirmed spelling too.
      setEnglishName(nextName.trim() === storedKoreanName ? storedEnglishName : '');
    }
    setName(nextName);
  };
  const [positionCode, setPositionCode] = useState<ChauffeurPositionCode | ''>('');
  const [savedIdentity, setSavedIdentity] = useState('');
  const [phone, setPhone] = useState(formatKoreanMobileInternationalInput(driver.phone || KOREA_MOBILE_PREFIX));
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoStored, setPhotoStored] = useState(false);
  const [profilePhotoChanged, setProfilePhotoChanged] = useState(false);
  const [portraitPlacement, setPortraitPlacement] = useState<CardPlacement>({ ...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT });
  const [portraitSavedPlacement, setPortraitSavedPlacement] = useState<CardPlacement>({ ...DEFAULT_DISPATCH_PORTRAIT_PLACEMENT });
  const [portraitSettingsLoaded, setPortraitSettingsLoaded] = useState(false);
  const [portraitSaving, setPortraitSaving] = useState(false);
  const [dbReady, setDbReady] = useState(true);
  const [savedCards, setSavedCards] = useState<CardSummary>({});
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('missing');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [orientation, setOrientation] = useState<CardOrientation>('pc');
  // Comparison is an optional fullscreen view; keep the default preview large.
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareInputs, setCompareInputs] = useState<{
    pc: DispatchCardRenderInput;
    mobile: DispatchCardRenderInput;
  } | null>(null);
  const [photoKind, setPhotoKind] = useState<CardPhotoKind>('exterior');
  const [editMode, setEditMode] = useState<DispatchCardEditMode>('portrait');
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
  // Keep the displayed canvas URL alive while a new slider render is in flight.
  const previewObjectUrlRef = useRef('');
  useEffect(() => () => {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
  }, []);
  // Keep the shared HQ modal's focus trap stable while form values change.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeModal = React.useCallback(() => {
    if (busyRef.current) {
      setMessage('배차카드 전체 갱신 중입니다. 완료 결과를 확인한 후 닫아 주세요.');
      return;
    }
    onCloseRef.current();
  }, []);
  const closeComparison = React.useCallback(() => {
    setCompareOpen(false);
    setCompareInputs(null);
  }, []);
  useEffect(() => {
    if (!isOpen) closeComparison();
  }, [isOpen, closeComparison]);

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
  const portraitDirty = portraitPlacement.zoom !== portraitSavedPlacement.zoom ||
    portraitPlacement.x !== portraitSavedPlacement.x || portraitPlacement.y !== portraitSavedPlacement.y;
  const cardProfile = { koreanName: name.trim(), englishName: englishName.trim(), positionCode, phone: phone.trim() };
  const validCardProfile = validateDispatchCardProfile(cardProfile);
  const identityDirty = Boolean(validCardProfile && JSON.stringify(validCardProfile) !== savedIdentity);
  const cardSettingsDirty = portraitDirty || identityDirty;
  const changedSharedInputs = shouldRebuildDriverCards(cardSettingsDirty, profilePhotoChanged);
  const staleCardCount = Object.values(savedCards).reduce((count, entry) =>
    count + Number(Boolean(entry.stalePc)) + Number(Boolean(entry.staleMobile)), 0);
  const needsCardRefresh = changedSharedInputs || staleCardCount > 0;
  const isComplete = Boolean(
    portraitSettingsLoaded && validCardProfile && photoStored && photoUrl && vehicle && photos,
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedVehicleId(previous =>
      initialVehicleId && availableVehicles.some(v=>v.uuid===initialVehicleId)
        ? initialVehicleId
        : availableVehicles.some(v => v.uuid === previous) ? previous : (availableVehicles[0]?.uuid || ''));
  }, [isOpen, driver.id, initialVehicleId, availableVehicles]);

  useEffect(() => {
    if (!isOpen) return;
    const id = ++currentRequest.current;
    setName(driver.name);
    setEnglishName('');
    setStoredEnglishName('');
    setStoredKoreanName('');
    setPositionCode('');
    setPhone(formatKoreanMobileInternationalInput(driver.phone || KOREA_MOBILE_PREFIX));
    setPhotoUrl('');
    setPhotoStored(false);
    setProfilePhotoChanged(false);
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
    void fetch('/api/hq/drivers/assets/card-profile?driverId=' + encodeURIComponent(driver.id), {
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
        if (data.profile) {
          setName(data.profile.koreanName || driver.name);
          setEnglishName(data.profile.englishName || '');
          setStoredEnglishName(data.profile.englishName || '');
          setStoredKoreanName((data.profile.koreanName || driver.name).trim());
          setPositionCode(data.profile.positionCode || '');
          setPhone(formatKoreanMobileInternationalInput(data.profile.phone || driver.phone || KOREA_MOBILE_PREFIX));
          const saved = validateDispatchCardProfile(data.profile);
          setSavedIdentity(saved ? JSON.stringify(saved) : '');
        }
        setPortraitSettingsLoaded(true);
      })
      .catch(error => {
        if (portraitRequest.current === id) {
          setError(error instanceof Error ? error.message : '기사 사진 구도 조회 실패');
        }
      });
    return () => { ++portraitRequest.current; };
  }, [isOpen, driver.id]);

  /** One server write stores bilingual name, two-choice role and portrait crop per chauffeur. */
  async function persistCardSettings(): Promise<void> {
    if (!portraitSettingsLoaded) throw new Error('기사 배차카드 정보를 먼저 불러와야 합니다.');
    if (!validCardProfile) throw new Error('한국어·영문 성명과 직책, 전화번호를 확인해 주세요.');
    if (!cardSettingsDirty) return;
    setPortraitSaving(true);
    try {
      const response = await fetch('/api/hq/drivers/assets/card-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.id, profile: validCardProfile, placement: portraitPlacement }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw new Error(result.error || '배차카드 기사 정보 저장 실패');
      setPortraitSavedPlacement(normalizePortraitPlacement(result.placement));
      setSavedIdentity(JSON.stringify(result.profile));
      setStoredEnglishName(result.profile.englishName);
      setStoredKoreanName(result.profile.koreanName);
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
      setProfilePhotoChanged(true);
      setMessage('기사 사진을 비공개 저장소에 저장했습니다. 카드를 미리 볼 수 있습니다.');
      onProfileUpdated?.();
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
      name: formatBilingualChauffeurName(name, englishName),
      position: getEnglishPosition(positionCode),
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

  const openComparison = () => {
    if (!isOpen || !isComplete || !vehicle || busy || portraitSaving || photoUploading) return;
    // Snapshot both variants at the moment of opening. The builder is hidden
    // during comparison, so editing cannot unexpectedly change the image pair.
    setCompareInputs({
      pc: buildInput(vehicle, 'pc'),
      mobile: buildInput(vehicle, 'mobile'),
    });
    setCompareOpen(true);
  };

  useEffect(() => {
    if (!isOpen || compareOpen || !isComplete || !vehicle) {
      const previous = previewObjectUrlRef.current;
      previewObjectUrlRef.current = '';
      if (previous) URL.revokeObjectURL(previous);
      setPreviewUrl('');
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    // Never blank out the last successful full-card preview on slider input.
    // The near-slider crop updates synchronously; the full canvas refreshes
    // after a short debounce without jumping the layout.
    setPreviewLoading(true);
    const job = window.setTimeout(async () => {
      try {
        const canvas = await renderDispatchCard(buildInput(vehicle, orientation));
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(result => result ? resolve(result) : reject(new Error('미리보기 실패')), 'image/webp', 0.82),
        );
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(blob);
        const previous = previewObjectUrlRef.current;
        previewObjectUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
        // Let the browser paint the newly generated card before releasing the
        // previous URL, preventing flashes when dragging a range slider.
        if (previous) window.setTimeout(() => URL.revokeObjectURL(previous), 1500);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '배차카드를 생성하지 못했습니다.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(job);
    };
    // Only values used by rendering, including position adjustments, trigger preview updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, compareOpen, isComplete, vehicle?.uuid, orientation, name, englishName, positionCode, phone, photoUrl, portraitPlacement, perVehiclePlacements]);

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
    if (needsCardRefresh) {
      setError('기사 정보나 사진을 먼저 저장하고 전체 카드를 갱신한 뒤 다운로드해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await persistCardSettings();
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
    if (needsCardRefresh) {
      setError('기사 정보나 사진을 먼저 저장하고 전체 카드를 갱신한 뒤 다운로드해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    const entries: Record<string, Uint8Array> = {};
    const failures: string[] = [];
    try {
      await persistCardSettings();
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

  // Changed shared identity/portrait updates all vehicle card variants.
  // A later retry only rebuilds stale/missing versions, preserving successes.
  const saveAllToAssetLibrary = async (modeOverride?: GenerationMode) => {
    if (!isComplete || !dbReady || busy || !summaryLoaded) return;
    setBusy(true);
    setError('');
    setMessage('');
    const effectiveMode: GenerationMode = modeOverride ||
      (changedSharedInputs ? 'all' : staleCardCount ? 'missing' : generationMode);
    let generatedCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];
    try {
      await persistCardSettings();
      // Always refresh immediately before the batch. The server also rejects
      // writes to an existing slot when skipIfExists=true.
      const latest = await loadSavedCards();
      setSavedCards(latest);
      const targets = effectiveMode === 'selected'
        ? (vehicle ? [vehicle] : [])
        : effectiveMode === 'missing'
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
          if (effectiveMode === 'missing' && latest[item.uuid]?.[variant]) {
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
            if (effectiveMode === 'missing') form.set('skipIfExists', 'true');
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
      setProfilePhotoChanged(false);
      if (generatedCount > 0) onAssetUpdated?.();
      if (failures.length === 0) {
        onProfileUpdated?.();
        setMessage('기사 정보 반영 완료 · PC·모바일 ' + generatedCount +
          '장 최신 버전 저장 · 기존 ' + skippedCount + '장 유지. 고객에게 자동 발송하지 않았습니다.');
      } else {
        setMessage('반영 완료 ' + generatedCount + '장 · 실패 ' + failures.length +
          '장. 기존 카드 일부는 갱신이 필요합니다. 다시 누르면 남은 카드부터 갱신합니다.');
        setError('일부 갱신 실패 — ' + failures.join(' / '));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '배차카드 저장 실패');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <>
    <HqModal
      isOpen={isOpen && !compareOpen}
      title="배차카드 만들기"
      subtitle="기사 정보 한 번으로 모든 차량 카드 완성"
      icon={<img src="/images/icons/drivers/icon_profile_card.png" alt="" aria-hidden="true" draggable={false} className="size-10 shrink-0 object-contain" />}
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
            <HqButton variant="primary" className="min-w-0 flex-[2] whitespace-nowrap sm:flex-none" loading={busy}
              disabled={!isComplete || !dbReady || !summaryLoaded || busy || portraitSaving || photoUploading || previewLoading || (!needsCardRefresh && generationMode === 'missing' && missingVehicles.length === 0)}
              onClick={() => {
                if (needsCardRefresh || generationMode !== 'all' || window.confirm('준비된 모든 차량의 기존 카드를 새 버전으로 교체할까요?')) {
                  void saveAllToAssetLibrary();
                }
              }}>
              {busy ? (progress || '저장 중…') : (
                <><CheckCircle2 className="size-4" />{needsCardRefresh ? '기사 정보 반영 · 전체 카드 갱신' : generationMode === 'missing' ? '비어 있는 카드 등록하기' : generationMode === 'selected' ? '선택 차량 등록' : '전체 카드 재생성'}</>
              )}
            </HqButton>
          </div>
        </div>
      }
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-1">
          <HqCard className="overflow-visible">
            <div className="relative z-10 space-y-4 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#21344D]">완성 카드 미리보기</h3>
                  <p className="mt-1 text-[11px] text-[#8492A4]">차량을 선택하면 카드가 바로 바뀌어요.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <HqSegmentedTabs aria-label="배차카드 미리보기 규격" value={orientation}
                    onValueChange={value => setOrientation(value as CardOrientation)}
                    tabs={[
                      { id: 'pc', label: 'PC' },
                      { id: 'mobile', label: '모바일' },
                    ]} />
                  <div className="hidden lg:block">
                    <HqButton variant="secondary" size="sm"
                      disabled={!isComplete || busy || portraitSaving || photoUploading}
                      onClick={openComparison}>
                      <Columns2 className="size-4" /> 동시 비교
                    </HqButton>
                  </div>
                </div>
              </div>
              <div className="space-y-2 rounded-[14px] bg-[#F7F9FC] p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[#526680]">미리보기 차량 선택</span>
                  <span className="text-[11px] text-[#7B8AA0]">사진 준비 {availableVehicles.length}대</span>
                </div>
                <HqSearchSelect
                  label="미리보기 차량 선택"
                  value={vehicle?.uuid || ''}
                  onChange={setSelectedVehicleId}
                  disabled={!availableVehicles.length || busy}
                  placeholder="이미지가 준비된 차량 없음"
                  size="md"
                  imageShape="vehicle"
                  options={availableVehicles.map(item => ({
                    value: item.uuid,
                    label: item.plate,
                    subtitle: dispatchCardVehicleLabel(item),
                  }))}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#7B8AA0]">
                  <span>외관 1장 · 실내 2장이 준비된 차량만 표시</span>
                  {summaryLoaded && vehicle && (
                    <span aria-live="polite">
                      PC {currentCardStatus?.pc ? '최신' : currentCardStatus?.stalePc ? '갱신 필요' : '미등록'} · 모바일 {currentCardStatus?.mobile ? '최신' : currentCardStatus?.staleMobile ? '갱신 필요' : '미등록'}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#7B8AA0]">
                  {summaryLoaded
                    ? '전체 미생성 차량 ' + missingVehicles.length + '대'
                    : '저장된 배차카드 확인 중…'}
                </p>
                {!dbReady && (
                  <HqInlineFeedback tone="error" message="배차카드 DB 준비가 필요합니다. 미리보기·다운로드는 가능하지만 서버 등록은 차단됩니다." />
                )}
              </div>
            </div>
            <div className="border-t border-[#EEF1F5] px-3 pb-3 pt-3 sm:px-5">
              <HqDispatchCardLiveEditor
                mode={editMode}
                onModeChange={setEditMode}
                portraitPhotoUrl={photoUrl}
                portraitPlacement={portraitPlacement}
                onPortraitChange={setPortraitPlacement}
                portraitDisabled={!portraitSettingsLoaded || busy || portraitSaving}
                portraitDirty={portraitDirty}
                vehiclePhotoSrc={photos?.[photoKind] || ''}
                vehiclePlacement={currentPlacement}
                vehicleKind={photoKind}
                onVehicleKindChange={setPhotoKind}
                onVehicleChange={updatePlacement}
                onVehicleReset={() => {
                  if (!vehicle) return;
                  setPerVehiclePlacements(previous => ({
                    ...previous,
                    [vehicle.uuid]: { ...previous[vehicle.uuid], [photoKind]: DEFAULT_PLACEMENT },
                  }));
                }}
                vehicleDisabled={!vehicle || busy}
                orientation={orientation}
              />
            </div>
            <div className="relative flex min-h-[280px] items-center justify-center rounded-b-[18px] bg-[#F5F7FA] p-4 sm:min-h-[370px] sm:p-6">
              {previewLoading && (
                <div role="status" aria-live="polite"
                  className={previewUrl ? 'absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-[11px] bg-white/95 px-3 py-2 text-[11px] font-medium text-[#60728C] shadow-sm' : 'flex items-center gap-2 text-[12px] text-[#66778B]'}>
                  <Loader2 className="size-4 animate-spin" /> {previewUrl ? '미리보기 갱신 중…' : '카드 생성 중…'}
                </div>
              )}
              {previewUrl && isComplete && (
                <img src={previewUrl} alt={vehicle?.plate + ' 배차카드 ' + orientation + ' 미리보기'}
                  className="max-h-[55vh] max-w-full object-contain shadow-[0_12px_32px_rgba(15,25,45,.14)]" />
              )}
              {!previewLoading && (!isComplete || !previewUrl) && (
                <div className="space-y-2 px-2 text-center text-[#8492A4]">
                  <ImagePlus className="mx-auto size-8" strokeWidth={1.5} />
                  <p className="text-[13px] font-semibold text-[#54657A]">기사 사진·한국어/영문 성명·직책·전화번호를 입력해 주세요.</p>
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
                {generationMode === 'missing' ? '미생성 카드만 추가' : generationMode === 'selected' ? '저장 범위 · 선택 차량' : '저장 범위 · 전체 재생성'}
              </span>
              <ChevronDown className={'size-4 text-[#8492A4] transition-transform ' + (advancedOpen ? 'rotate-180' : '')} />
            </button>
            <p className="mt-1 text-[11px] leading-relaxed text-[#8492A4]">
              {generationMode === 'missing'
                ? '기존 카드는 유지하고 비어 있는 카드만 채워요.'
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
                  disabled={!isComplete || busy || portraitSaving || photoUploading || previewLoading || needsCardRefresh} className="w-full sm:w-auto">
                  <Download className="size-4" /> 선택한 {orientation === 'pc' ? 'PC' : '모바일'} 카드 PNG
                </HqButton>
                <HqButton variant="secondary" onClick={() => void downloadAll()}
                  disabled={!isComplete || busy || portraitSaving || photoUploading || previewLoading || needsCardRefresh} className="w-full sm:w-auto">
                  <Download className="size-4" /> 준비된 차량 전체 ZIP
                </HqButton>
              </div>
            </HqCard>
          )}
        </div>
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <HqCard className="p-4 sm:p-5">
            <h3 className="mb-4 text-[14px] font-semibold text-[#21344D]">기사 정보</h3>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[15px] bg-[#F5F7FA]">
                {photoUrl ? <img src={photoUrl} alt="기사 프로필" className="size-full object-contain" /> :
                  <img src="/images/icons/drivers/icon_driver.png" alt="기사 목록 아이콘" draggable={false} className="size-12 object-contain" />}
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-[12px] leading-relaxed text-[#73839A]">정면 상반신 · 투명 배경(PNG) 권장</p>
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
                { label: '한국어 성명', value: name, onChange: updateKoreanName, placeholder: '윤태준', id: 'dispatch-card-korean-name' },
                { label: '영문 성명', value: englishName, onChange: setEnglishName, placeholder: suggestedEnglishName || 'Tae-jun Yun', id: 'dispatch-card-english-name' },
                { label: '전화번호', value: phone, onChange: setPhone, placeholder: '+82-10-1234-5678', id: 'dispatch-card-phone' },
              ] as const).map(field => (
                <div key={field.id} className="space-y-1.5">
                  <label htmlFor={field.id} className="block text-[12px] font-medium text-[#526680]">
                    {field.label}
                  </label>
                  <div className="relative">
                    <HqInput
                      id={field.id}
                      value={field.value}
                      onChange={event => field.onChange(field.label === '전화번호'
                        ? formatKoreanMobileInternationalInput(event.target.value) : event.target.value)}
                      onFocus={field.label === '영문 성명' ? applySuggestedEnglishName : undefined}
                      onClick={field.label === '영문 성명' ? applySuggestedEnglishName : undefined}
                      placeholder={field.placeholder}
                      maxLength={field.label === '전화번호' ? 24 : 90}
                      inputMode={field.label === '전화번호' ? 'tel' : 'text'}
                      style={field.label === '영문 성명' && suggestedEnglishName && englishName !== suggestedEnglishName
                        ? { paddingRight: '108px' } : undefined}
                    />
                    {field.label === '영문 성명' && suggestedEnglishName && englishName !== suggestedEnglishName && (
                      <button
                        type="button"
                        disabled={busy || portraitSaving}
                        onClick={() => setEnglishName(suggestedEnglishName)}
                        className="absolute right-1 top-1/2 min-h-10 -translate-y-1/2 rounded-[10px] bg-[#F1F5FB] px-3 text-[12px] font-semibold text-[#1E60F3] disabled:opacity-50"
                        aria-label={'추천 영문 성명 ' + suggestedEnglishName + ' 적용'}
                      >
                        {englishName ? '표준 적용' : '추천 적용'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <p className="rounded-[12px] bg-[#F7F9FC] px-3 py-2.5 text-[11px] leading-relaxed text-[#718198]">
                영문 성명 입력창에 추천 이름이 표시돼요. 입력창을 한 번 누르거나 ‘추천 적용’을 누르면 채워집니다.
                이미 저장된 영문 이름은 그대로 유지하고, 한국어 성명을 바꾸면 추천도 함께 바뀌어요.
              </p>
              <div className="space-y-1.5">
                <span className="block text-[12px] font-medium text-[#526680]">직책</span>
                <HqSearchSelect
                  label="기사 직책 선택"
                  value={positionCode}
                  onChange={next => setPositionCode(next as ChauffeurPositionCode | '')}
                  placeholder="직책 선택"
                  emptyLabel="선택하지 않음"
                  searchable={false}
                  size="md"
                  options={CHAUFFEUR_POSITION_OPTIONS.map(option => ({
                    value: option.value,
                    label: option.label,
                    subtitle: option.english,
                  }))}
                  disabled={busy || portraitSaving}
                />
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#8492A4]">
              카드엔 영문 직책만 표시되며, 원본 프로필은 유지돼요.
            </p>
          </HqCard>

        </div>

      </div>
    </HqModal>
    {compareInputs && vehicle && (
      <HqDispatchCardCompareModal
        isOpen={isOpen && compareOpen}
        onClose={closeComparison}
        vehiclePlate={vehicle.plate}
        vehicleModel={dispatchCardVehicleLabel(vehicle)}
        inputs={compareInputs}
      />
    )}
    </>
  );
};
