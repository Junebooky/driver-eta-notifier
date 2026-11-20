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
    // Plate-verified physical model overrides any stale DB label.
    const canonical = findVipVehicle(vehicle.plate);
    if (canonical?.category === 'sprinter') {
      return canonical.model.includes('319') ? 'sprinter_319' : 'sprinter_519';
    }
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

/** Resolve the DB vehicle to the new kebab-case <brand>/<model> folder under public/images/dispatch-cards/. */
export function dispatchCardKebabPath(vehicle: Car): string | null {
  const model = vehicle.model.toLowerCase();
  if (vehicle.category === 'staria') return 'hyundai/staria-limousine';
  if (vehicle.category === 'sprinter') {
    const canonical = findVipVehicle(vehicle.plate);
    if (canonical?.category === 'sprinter') {
      return canonical.model.includes('319') ? 'mercedes-benz/sprinter-319-cdi' : 'mercedes-benz/sprinter-519-cdi';
    }
    if (model.includes('519')) return 'mercedes-benz/sprinter-519-cdi';
    if (model.includes('319')) return 'mercedes-benz/sprinter-319-cdi';
  }
  if (vehicle.category === 's_class' && model.includes('560')) return 'mercedes-benz/s560';
  if (vehicle.category === 'carnival') {
    return /하이|high/.test(model) ? 'kia/carnival-hi-limousine' : 'kia/carnival-limousine';
  }
  if (vehicle.category === 'genesis') {
    if (model.includes('gv80')) return 'genesis/gv80';
    // Two G90 long-wheelbase vehicles have distinct exterior/interior colors.
    // Use physical plate, not an outdated DB model label, to select the set.
    const canonical = findVipVehicle(vehicle.plate);
    const plate = canonical?.plateShort || vehicle.plateShort;
    if (plate === '4280') return 'genesis/g90-lwb/black';
    if (plate === '1336') return 'genesis/g90-lwb/navy';
    if (/g90l|lwb|롱휠/.test(model)) return 'genesis/g90-lwb';
    if (/리무진|limousine/.test(model)) return 'genesis/g90-limousine';
    if (model.includes('g90')) return 'genesis/g90-standard';
  }
  return null;
}

export function resolveDispatchCardPhotos(vehicle: Car): DispatchCardPhotoSet | null {
  const kebabBase = dispatchCardKebabPath(vehicle);
  if (kebabBase) {
    if (vehicle.plateShort) {
      const kebabVehicle = sets[`${kebabBase}/${vehicle.plateShort}`];
      if (kebabVehicle) return { ...kebabVehicle, source: 'vehicle' };
    }
    if (kebabBase !== 'mercedes-benz/sprinter-519-cdi') {
      const kebabModel = sets[kebabBase];
      if (kebabModel) return { ...kebabModel, source: 'model' };
    }
  }

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
