import type { VipRealVehicle } from '@/utils/vehicleData';

export interface FleetRegistryRecord {
  vehicle_id: string;
  organization_id: string;
  plate: string;
  profile: VipRealVehicle;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
}

export const normalizeFleetPlate = (plate: string) => plate.trim().replace(/[\s-]/g, '').toLowerCase();

/**
 * DB cockpit.vehicles is authoritative. A deleted/archived row is never
 * selectable, and a missing vehicle must not be silently resurrected from
 * localStorage or the hardcoded original catalog.
 *
 * Optional stock is only for isolated fixture tests, never production.
 */
export function mergeFleetRegistry(records: FleetRegistryRecord[], stock: VipRealVehicle[] = []): VipRealVehicle[] {
  const byPlate = new Map<string, VipRealVehicle>();
  for (const vehicle of stock) byPlate.set(normalizeFleetPlate(vehicle.plate), vehicle);
  for (const row of records) {
    if (row.organization_id !== 'vip_limousine_korea' || !row.plate) continue;
    const key = normalizeFleetPlate(row.plate);
    if (row.archived) {
      byPlate.delete(key);
      continue;
    }
    if (!row.profile?.plate || normalizeFleetPlate(row.profile.plate) !== key) continue;
    byPlate.set(key, row.profile);
  }
  return [...byPlate.values()];
}
