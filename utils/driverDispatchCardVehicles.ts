import type { DispatchCardCoverageDriver, DispatchCardCoverageSlot } from '@/lib/dispatchCards/dispatchCardCoverage';
import {mapVehicleToUiCategory, type VipRealVehicle} from '@/utils/vehicleData';

export type DriverCardSummary = Record<
  string,
  { pc: boolean; mobile: boolean; stalePc?: boolean; staleMobile?: boolean }
>;

const UNREGISTERED_PLATE_VALUES = new Set([
  '차량 미등록',
  '미등록',
  '미배정',
  '배정 대기',
  '없음',
  '-',
]);

/** Drops placeholder/unassigned labels so real registered vehicles can be preferred. */
export function sanitizeInitialDispatchCardPlate(plate?: string | null): string {
  const trimmed = (plate || '').trim();
  if (
    !trimmed ||
    UNREGISTERED_PLATE_VALUES.has(trimmed) ||
    UNREGISTERED_PLATE_VALUES.has(trimmed.toLowerCase())
  ) {
    return '';
  }
  return trimmed;
}

export function getVehicleCardStatusMeta(entry?: DriverCardSummary[string]) {
  const isFull = Boolean(entry?.pc && entry?.mobile);
  const isPartial = Boolean((entry?.pc || entry?.mobile) && !isFull);
  const isRegistered = isFull || isPartial;
  const hasStale = Boolean(entry?.stalePc || entry?.staleMobile);
  const optionStatus = isFull
    ? 'PC·모바일'
    : entry?.pc
      ? 'PC만 등록'
      : entry?.mobile
        ? '모바일만 등록'
        : hasStale
          ? '갱신 필요'
          : '미등록';

  return { isFull, isPartial, isRegistered, hasStale, optionStatus };
}

/** Splits vehicles into registered (full first, then partial) vs. unregistered sections. */
export function partitionDispatchCardVehicles<T extends { uuid: string; plate: string }>(
  vehicles: readonly T[],
  summary: DriverCardSummary
): {
  registered: T[];
  unregistered: T[];
  ordered: T[];
  defaultVehicle: T | null;
} {
  const full: T[] = [];
  const partial: T[] = [];
  const unregistered: T[] = [];

  for (const vehicle of vehicles) {
    const meta = getVehicleCardStatusMeta(summary[vehicle.uuid]);
    if (meta.isFull) {
      full.push(vehicle);
    } else if (meta.isPartial) {
      partial.push(vehicle);
    } else {
      unregistered.push(vehicle);
    }
  }

  const registered = [...full, ...partial];
  const ordered = [...registered, ...unregistered];
  const defaultVehicle = registered[0] || unregistered[0] || null;
  return { registered, unregistered, ordered, defaultVehicle };
}

export function pickDefaultDispatchCardVehicle<T extends { uuid: string; plate: string }>({
  vehicles,
  summary,
  initialVehiclePlate,
  preferRegistered = true,
}: {
  vehicles: readonly T[];
  summary: DriverCardSummary;
  initialVehiclePlate?: string | null;
  preferRegistered?: boolean;
}): T | null {
  const cleanInitial = sanitizeInitialDispatchCardPlate(initialVehiclePlate);
  const initialMatch = cleanInitial ? vehicles.find((v) => v.plate === cleanInitial) || null : null;
  const { registered, defaultVehicle } = partitionDispatchCardVehicles(vehicles, summary);

  if (initialMatch) {
    if (!preferRegistered) return initialMatch;
    if (registered.some((v) => v.uuid === initialMatch.uuid)) return initialMatch;
    if (registered.length > 0) return registered[0];
    return initialMatch;
  }

  return defaultVehicle;
}

export function summarizeDriverCardCoverage(entry?: DispatchCardCoverageDriver): {
  totalVehicles: number;
  completeVehicles: number;
  /** No source photo -> cannot generate PC/mobile yet. */
  imageMissingSlots: DispatchCardCoverageSlot[];
  registeredSlots: DispatchCardCoverageSlot[];
  unregisteredSlots: DispatchCardCoverageSlot[];
  missingIdentityLabels: string[];
  identityReady: boolean;
  tone: 'selected' | 'warning' | 'neutral';
  label: string;
} {
  const slots = entry?.slots || [];
  const completeSlots = slots.filter((slot) => slot.pc && slot.mobile);
  const partialSlots = slots.filter((slot) => (slot.pc || slot.mobile) && !(slot.pc && slot.mobile));
  const registeredSlots = [...completeSlots, ...partialSlots];
  const unregisteredSlots = slots.filter((slot) => !slot.pc && !slot.mobile);
  const imageMissingSlots=slots.filter(slot=>slot.imageReady===false);
  const totalVehicles = slots.length;
  const completeVehicles = completeSlots.length;
  const missingIdentityLabels = [
    !entry?.portraitReady ? '프로필 사진' : null,
    !entry?.englishNameReady ? '영문 성명' : null,
    !entry?.positionReady ? '직책' : null,
  ].filter((value): value is string => Boolean(value));

  let tone: 'selected' | 'warning' | 'neutral' = 'neutral';
  let label = `0/${totalVehicles}대 미등록`;

  if (!entry || totalVehicles === 0) {
    tone = 'neutral';
    label = '차량 없음';
  } else if (completeVehicles === totalVehicles) {
    tone = 'selected';
    label = `${completeVehicles}/${totalVehicles}대 완료`;
  } else if (registeredSlots.length > 0) {
    tone = completeVehicles > 0 ? 'selected' : 'warning';
    // Complete means BOTH PC and mobile are saved. Do not count partials.
    label = `${completeVehicles}/${totalVehicles}대 완료`;
  } else if (!entry.identityReady) {
    tone = 'warning';
    label = `0/${totalVehicles}대 · 정보 필요`;
  }

  return {
    totalVehicles,
    completeVehicles,
    imageMissingSlots,
    registeredSlots,
    unregisteredSlots,
    missingIdentityLabels,
    identityReady: Boolean(entry?.identityReady),
    tone,
    label,
  };
}


/**
 * Compact category view for a single driver's dispatch cards.
 * Full PC/mobile status is conveyed once in the legend, not repeated on
 * every vehicle plate. The source of truth remains the coverage API.
 */
export const DRIVER_CARD_CATEGORY_ORDER = ['sprinter','van','sedan','suv','other'] as const;
export type DriverCardGroupKey = typeof DRIVER_CARD_CATEGORY_ORDER[number];
export type DriverCardSlotStatus = 'complete' | 'partial' | 'missing' | 'photos_missing';
export interface DriverCardVehicleEntry {
  slot:DispatchCardCoverageSlot;
  vehicle:VipRealVehicle|null;
  status:DriverCardSlotStatus;
  modelLabel:string;
}
export interface DriverCardVehicleGroup {
  key:DriverCardGroupKey;
  label:string;
  entries:DriverCardVehicleEntry[];
  complete:number;
  partial:number;
  missing:number;
  photos_missing:number;
}
export const DRIVER_CARD_GROUP_LABELS:Record<DriverCardGroupKey,string>={
  sprinter:'스프린터',van:'밴',sedan:'세단',suv:'SUV',other:'기타 차량',
};
const GROUP_LABELS=DRIVER_CARD_GROUP_LABELS;
export function groupDriverCardVehicles(
  slots:readonly DispatchCardCoverageSlot[],
  vehicles:readonly VipRealVehicle[],
):DriverCardVehicleGroup[]{
  const byId=new Map(vehicles.map(vehicle=>[vehicle.uuid,vehicle]));
  const groups=new Map<DriverCardGroupKey,DriverCardVehicleGroup>();
  for(const slot of slots){
    const vehicle=byId.get(slot.vehicleId)||null;
    const key:DriverCardGroupKey=vehicle?mapVehicleToUiCategory(vehicle):'other';
    let group=groups.get(key);
    if(!group){
      group={key,label:GROUP_LABELS[key],entries:[],complete:0,partial:0,missing:0,photos_missing:0};
      groups.set(key,group);
    }
    const status:DriverCardSlotStatus=slot.pc&&slot.mobile?'complete':
      slot.pc||slot.mobile?'partial':
        slot.imageReady===false?'photos_missing':'missing';
    group[status]++;
    group.entries.push({slot,vehicle,status,modelLabel:vehicle?.modelShort||'차종 미확인'});
  }
  // Registered variants first, but keep source order within each status.
  const order:Record<DriverCardSlotStatus,number>={complete:0,partial:1,missing:2,photos_missing:3};
  return DRIVER_CARD_CATEGORY_ORDER.flatMap(key=>{
    const group=groups.get(key);
    if(!group)return [];
    group.entries.sort((a,b)=>order[a.status]-order[b.status]);
    return [group];
  });
}

export interface DriverSearchMatchResult {
  matched: boolean;
  matchedVehicleIds: string[];
  matchedHighlightLabel: string;
}

/**
 * Matches whitespace-separated query tokens (e.g. "김승준 1336") across driver
 * profile fields AND every dispatch-card vehicle slot, identifying which card
 * slots should be visually called out in the dispatch-card vehicle list.
 */
export function matchDriverWithCardSlots({
  query,
  driver,
  driverCoverage,
  vehicleById,
}: {
  query: string;
  driver: {
    name: string;
    phone?: string;
    residence?: string;
    affiliationLabel?: string;
    vehicleModel?: string;
    carNumber?: string;
  };
  driverCoverage?: DispatchCardCoverageDriver;
  vehicleById: ReadonlyMap<string, VipRealVehicle>;
}): DriverSearchMatchResult {
  const rawTokens = query.trim().split(/\s+/).filter(Boolean);
  if (!rawTokens.length) {
    return { matched: true, matchedVehicleIds: [], matchedHighlightLabel: '' };
  }

  const phoneDigits = (driver.phone || '').replace(/\D/g, '');
  const driverFields = [
    driver.name,
    driver.phone || '',
    driver.residence || '',
    driver.affiliationLabel || '',
    driver.vehicleModel || '',
    driver.carNumber || '',
  ].map((value) => value.toLowerCase());

  const slots = driverCoverage?.slots || [];
  const slotInfos = slots.map((slot) => {
    const vehicle = vehicleById.get(slot.vehicleId);
    const plateLower = slot.plate.toLowerCase();
    const plateCompact = plateLower.replace(/\s+/g, '');
    const modelText = `${vehicle?.model || ''} ${vehicle?.modelShort || ''}`.toLowerCase();
    return { slot, plateLower, plateCompact, modelText };
  });

  const plateMatchingTokens: string[] = [];
  const modelMatchingTokens: string[] = [];

  for (const rawToken of rawTokens) {
    const token = rawToken.toLowerCase();
    const compact = token.replace(/\s+/g, '');
    const digitsOnly = token.replace(/\D/g, '');
    const matchesDriver =
      driverFields.some((field) => field.includes(token)) ||
      (digitsOnly.length >= 2 && phoneDigits.includes(digitsOnly));

    let matchedByPlate = false;
    let matchedByModel = false;
    for (const info of slotInfos) {
      if (info.plateLower.includes(token) || info.plateCompact.includes(compact)) {
        matchedByPlate = true;
      } else if (info.modelText.includes(token)) {
        matchedByModel = true;
      }
    }

    if (!matchesDriver && !matchedByPlate && !matchedByModel) {
      return { matched: false, matchedVehicleIds: [], matchedHighlightLabel: '' };
    }
    if (matchedByPlate) plateMatchingTokens.push(rawToken);
    else if (matchedByModel && !matchesDriver) modelMatchingTokens.push(rawToken);
  }

  const targetTokens = plateMatchingTokens.length > 0 ? plateMatchingTokens : modelMatchingTokens;
  if (!targetTokens.length) {
    return { matched: true, matchedVehicleIds: [], matchedHighlightLabel: '' };
  }

  const matchedSlots = slotInfos.filter((info) =>
    targetTokens.every((rawToken) => {
      const token = rawToken.toLowerCase();
      const compact = token.replace(/\s+/g, '');
      return (
        info.plateLower.includes(token) ||
        info.plateCompact.includes(compact) ||
        info.modelText.includes(token)
      );
    })
  );

  const fallbackSlots = matchedSlots.length
    ? matchedSlots
    : slotInfos.filter((info) =>
        targetTokens.some((rawToken) => {
          const token = rawToken.toLowerCase();
          const compact = token.replace(/\s+/g, '');
          return (
            info.plateLower.includes(token) ||
            info.plateCompact.includes(compact) ||
            info.modelText.includes(token)
          );
        })
      );

  const highlightLabel =
    plateMatchingTokens[plateMatchingTokens.length - 1] ||
    (fallbackSlots[0]?.slot.plate.match(/\d{4}$/)?.[0] || fallbackSlots[0]?.slot.plate || '');

  return {
    matched: true,
    matchedVehicleIds: fallbackSlots.map((info) => info.slot.vehicleId),
    matchedHighlightLabel: highlightLabel,
  };
}
