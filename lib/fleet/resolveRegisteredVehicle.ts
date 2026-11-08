import { readFleetRegistry } from './registryStore';
import { normalizeFleetPlate } from '@/utils/fleetVehicleRegistry';
import type { VipRealVehicle } from '@/utils/vehicleData';

/**
 * Resolve the real cockpit.vehicles UUID, not a fabricated hash or legacy
 * static catalog ID. This is essential when users register custom vehicles
 * and then upload/delete customer-facing information cards.
 */
export async function resolveRegisteredFleetVehicle(
  plateOrUuid: string,
  options: { allowArchived?: boolean } = {},
): Promise<VipRealVehicle> {
  const requested = String(plateOrUuid || '').trim();
  if (!requested) throw new Error('차량 등록부에서 차량을 선택해 주세요.');
  const rows = await readFleetRegistry();
  const matching = rows.find(row =>
    row.vehicle_id === requested || normalizeFleetPlate(row.plate) === normalizeFleetPlate(requested)
  );
  if (!matching || !matching.profile?.uuid || matching.profile.uuid !== matching.vehicle_id) {
    throw new Error('차량 등록부에 없는 차량입니다. 차량 관리에서 먼저 등록해 주세요.');
  }
  if (matching.archived && !options.allowArchived) {
    throw new Error('보관 처리된 차량은 새 배차 카드를 등록할 수 없습니다.');
  }
  return matching.profile;
}
