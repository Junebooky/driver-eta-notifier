import { resolveDispatchCardPhotos } from './dispatchCardAssets';
import { validateDispatchCardProfile } from './chauffeurIdentity';
import { resolveDispatchCardEnglishName } from '@/utils/koreanNameRomanization';
import type { VipRealVehicle } from '@/utils/vehicleData';

type DbDriver = { id: string; driver_name: string | null; phone: string | null; driver_meta: unknown };
type ExistingCard = { driver_id: string; vehicle_id: string; variant: string };
type DriverPortrait = { driver_id: string };

export interface DispatchCardCoverageSlot {
  vehicleId: string;
  plate: string;
  pc: boolean;
  mobile: boolean;
}
export interface DispatchCardCoverageDriver {
  id: string;
  name: string;
  portraitReady: boolean;
  englishNameReady: boolean;
  positionReady: boolean;
  identityReady: boolean;
  missingVariants: number;
  savedVariants: number;
  slots: DispatchCardCoverageSlot[];
}
export interface DispatchCardCoverage {
  vehicles: VipRealVehicle[];
  drivers: DispatchCardCoverageDriver[];
  requiredVariants: number;
  savedVariants: number;
  missingVariants: number;
}
const record = (value: unknown): Record<string,unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};

/**
 * A virtual all-drivers × all-image-ready-vehicles mapping.
 * DO NOT create dummy database asset rows; missing slots are only created
 * when a valid image is actually rendered and uploaded.
 * Existing cards are never rewritten merely to rebuild this matrix.
 */
export function buildDispatchCardCoverage(
  drivers: DbDriver[],
  fleet: VipRealVehicle[],
  portraits: DriverPortrait[],
  cards: ExistingCard[],
): DispatchCardCoverage {
  const seen = new Set<string>();
  const vehicles = fleet.filter(vehicle => {
    if (!vehicle.uuid || seen.has(vehicle.uuid) || !resolveDispatchCardPhotos(vehicle)) return false;
    seen.add(vehicle.uuid);
    return true;
  });
  const photoDrivers = new Set(portraits.map(p => p.driver_id));
  const saved = new Set(cards
    .filter(card => card.variant === 'pc' || card.variant === 'mobile')
    .map(card => [card.driver_id,card.vehicle_id,card.variant].join(':')));
  const coverage = drivers.map(driver => {
    const meta = record(driver.driver_meta), cardIdentity = record(meta.dispatch_card_identity);
    const koreanName = typeof cardIdentity.koreanName === 'string' && cardIdentity.koreanName.trim()
      ? cardIdentity.koreanName : driver.driver_name || '';
    const englishName = resolveDispatchCardEnglishName(
      koreanName, typeof cardIdentity.englishName === 'string' ? cardIdentity.englishName : '',
    );
    const approved = validateDispatchCardProfile({
      koreanName,
      englishName,
      positionCode: cardIdentity.positionCode ?? '',
      phone: cardIdentity.phone ?? driver.phone ?? '',
    });
    const englishNameReady = !!englishName;
    const positionReady = cardIdentity.positionCode === 'chauffeur' || cardIdentity.positionCode === 'senior_chauffeur';
    const portraitReady = photoDrivers.has(driver.id);
    const slots = vehicles.map(vehicle => ({
      vehicleId: vehicle.uuid,
      plate: vehicle.plate,
      pc: saved.has([driver.id,vehicle.uuid,'pc'].join(':')),
      mobile: saved.has([driver.id,vehicle.uuid,'mobile'].join(':')),
    }));
    const savedVariants = slots.reduce((count,slot)=>count+Number(slot.pc)+Number(slot.mobile),0);
    return {
      id:driver.id,
      name:driver.driver_name || '',
      portraitReady,
      englishNameReady,
      positionReady,
      identityReady:!!approved && portraitReady,
      missingVariants:slots.length*2-savedVariants,
      savedVariants,
      slots,
    };
  });
  const requiredVariants=drivers.length*vehicles.length*2;
  const savedVariants=coverage.reduce((n,d)=>n+d.savedVariants,0);
  return {vehicles,drivers:coverage,requiredVariants,savedVariants,missingVariants:requiredVariants-savedVariants};
}
