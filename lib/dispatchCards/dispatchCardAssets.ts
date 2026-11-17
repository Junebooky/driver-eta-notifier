import { findVipVehicle, type VipRealVehicle } from '@/utils/vehicleData';
import manifest from './dispatchCardAssetManifest.json';

/** Only build-verified, public vehicle images. Never commit private driver photos. */
export interface DispatchCardPhotoSet {
  exterior: string;
  interiorOne: string;
  interiorTwo: string;
  source: 'model' | 'vehicle';
}
type Car = Pick<VipRealVehicle, 'category' | 'model' | 'plate' | 'plateShort'>;
const sets: Record<string, Omit<DispatchCardPhotoSet, 'source'>> = manifest;

/** Resolve the DB vehicle to a human-friendly, stable image folder name. */
export function dispatchCardModelFolder(vehicle: Car): string {
  const model = vehicle.model.toLowerCase();
  if (vehicle.category === 'staria') return 'staria';
  if (vehicle.category === 'sprinter') {
    if (model.includes('519')) return 'sprinter_519';
    if (model.includes('319')) return 'sprinter_319';
  }
  if (vehicle.category === 'carnival') {
    return /하이|high/.test(model) ? 'carnival_high' : 'carnival';
  }
  if (vehicle.category === 'genesis') {
    if (model.includes('gv80')) return 'gv80';
    if (/g90l|lwb|롱휠/.test(model)) return 'g90_lwb';
    if (/리무진|limousine/.test(model)) return 'g90_limousine';
    if (model.includes('g90')) return 'g90';
  }
  if (vehicle.category === 's_class' && model.includes('560')) return 's560';
  // New models with a Latin model name can work without adding more code.
  const modelSlug = model.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return modelSlug || vehicle.category.replace(/[^a-z0-9_-]/gi, '');
}

export function resolveDispatchCardPhotos(vehicle: Car): DispatchCardPhotoSet | null {
  const folder = dispatchCardModelFolder(vehicle);
  const fullPlate = vehicle.plate.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9가-힣]/g, '');
  const keys = [folder + '/' + fullPlate, folder + '/' + vehicle.plateShort];
  for (const key of keys) {
    const found = sets[key];
    if (found) return { ...found, source: 'vehicle' };
  }
  // Sprinter 519 interiors differ by vehicle: never share a generic model image.
  if (folder === 'sprinter_519') return null;
  const common = sets[folder];
  return common ? { ...common, source: 'model' } : null;
}

/** Public-facing English name and verified seat count, used in both PNG layouts. */
export function dispatchCardVehicleLabel(
  vehicle: Pick<VipRealVehicle, 'modelShort' | 'model'> &
    Partial<Pick<VipRealVehicle, 'plate' | 'capacity'>>,
): string {
  // The canonical plate record takes priority over stale DB model/capacity data.
  const canonical = vehicle.plate ? findVipVehicle(vehicle.plate) : undefined;
  const name = (canonical?.modelShort || vehicle.modelShort || vehicle.model).trim();
  let model = name;

  if (/스프린터|sprinter/i.test(name)) {
    const variant = name.match(/\b(319|519)\s*CDI\b/i);
    model = variant ? `Mercedes-Benz Sprinter ${variant[1]} CDI` :
      name.replace(/^(?:벤츠|메르세데스-벤츠|Mercedes-Benz)?\s*스프린터/i, 'Mercedes-Benz Sprinter');
  } else if (/스타리아/.test(name)) {
    model = 'Staria Limousine';
  } else if (/카니발/.test(name)) {
    model = name.replace(/카니발/g, 'Carnival');
  } else if (/제네시스/.test(name)) {
    model = name.replace(/제네시스/g, 'GENESIS');
  } else {
    model = name.replace(/벤츠|메르세데스-벤츠/g, 'Mercedes-Benz');
  }

  const capacity = canonical?.capacity || vehicle.capacity || '';
  const count = capacity.match(/(\d+)\s*(?:인승|seats?)/i)?.[1];
  return count ? `${model} · ${count} Seats` : model;
}
