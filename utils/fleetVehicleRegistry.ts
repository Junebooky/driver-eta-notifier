import { VIP_REAL_VEHICLES, reconcileRegisteredVehicle, type VipRealVehicle } from '@/utils/vehicleData';

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
 * Server registry is authoritative for created / removed vehicles.
 * Stock vehicles remain available unless a matching server tombstone archives them.
 * Browser localStorage must never decide fleet availability.
 */
export function mergeFleetRegistry(records: FleetRegistryRecord[], stock = VIP_REAL_VEHICLES): VipRealVehicle[] {
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
    byPlate.set(key, reconcileRegisteredVehicle(row.profile));
  }
  return [...byPlate.values()];
}
