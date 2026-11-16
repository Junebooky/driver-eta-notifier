import type { VipRealVehicle } from '@/utils/vehicleData';

/**
 * Public, version-controlled vehicle photos ONLY. Never put driver portraits
 * here: those remain in the existing private cockpit-assets bucket.
 *
 * Actual file names uploaded on integration HEAD e312082:
 * - staria: exterior, interior_01, interior_02
 * - sprinter_519/1458: exterior, interior_02, interior_03
 * A missing car must never silently borrow a different vehicle's interior.
 */
export interface DispatchCardPhotoSet {
  exterior: string;
  interiorOne: string;
  interiorTwo: string;
  source: 'model' | 'vehicle';
}

const ROOT = '/images/dispatch_cards/vehicles';

export function resolveDispatchCardPhotos(
  vehicle: Pick<VipRealVehicle, 'category' | 'model' | 'plate' | 'plateShort'>,
): DispatchCardPhotoSet | null {
  if (vehicle.category === 'staria') {
    const folder = `${ROOT}/staria`;
    return {
      exterior: `${folder}/exterior.webp`,
      interiorOne: `${folder}/interior_01.webp`,
      interiorTwo: `${folder}/interior_02.webp`,
      source: 'model',
    };
  }

  if (vehicle.category === 'sprinter' && vehicle.model.includes('519') && vehicle.plateShort === '1458') {
    const folder = `${ROOT}/sprinter_519/1458`;
    return {
      exterior: `${folder}/exterior.webp`,
      interiorOne: `${folder}/interior_02.webp`,
      interiorTwo: `${folder}/interior_03.webp`,
      source: 'vehicle',
    };
  }

  return null;
}

export function dispatchCardVehicleLabel(vehicle: Pick<VipRealVehicle, 'modelShort' | 'model'>): string {
  const name = vehicle.modelShort || vehicle.model;
  if (/스타리아/.test(name)) return 'Staria Limousine';
  if (/스프린터/.test(name)) return name.replace(/스프린터/g, 'Sprinter');
  if (/카니발/.test(name)) return name.replace(/카니발/g, 'Carnival');
  if (/제네시스/.test(name)) return name.replace(/제네시스/g, 'GENESIS');
  return name.replace(/벤츠/g, 'Mercedes-Benz');
}
