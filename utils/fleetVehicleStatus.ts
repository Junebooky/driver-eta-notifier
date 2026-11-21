import type { FleetAvailabilityResult } from './availabilityEngine';
import { parseKstDateTimeToMs } from './dispatchConflictDetector';

export type VehicleCurrentStatus = 'available' | 'maintenance' | 'in_service' | 'unavailable' | 'unknown';
export const VEHICLE_STATUS_LABELS: Record<VehicleCurrentStatus, string> = {
  available: '대기 중', in_service: '운행 중', maintenance: '정비 중', unavailable: '이용 불가', unknown: '확인 필요',
};

interface OperationSchedule {
  date: string;
  pickup_time: string;
  end_date?: string | null;
  end_time?: string | null;
  operation_status?: string | null;
  status?: string | null;
  updated_at?: string | null;
}

/** Live operation is independent of the interval being considered for a new booking. */
export function resolveVehicleCurrentStatus(
  schedules: OperationSchedule[],
  operation?: { status: string; updated_at: string },
  now = Date.now(),
): VehicleCurrentStatus {
  if (operation?.status === '정비 중') return 'maintenance';
  const rows = schedules.filter(row => row.status !== 'cancelled');
  const isDriving = rows.some(row => {
    if (row.status === 'completed' || row.operation_status === 'completed') return false;
    // An actual start/arrival can be early or overrun the planned end time.
    if (['arrived_pickup', 'boarded', 'in_transit'].includes(row.operation_status || '')) return true;
    const start = parseKstDateTimeToMs(row.date, row.pickup_time);
    const end = row.end_time ? parseKstDateTimeToMs(row.end_date || row.date, row.end_time) : Infinity;
    return start <= now && now < end;
  });
  if (isDriving) return 'in_service';
  if (operation?.status === '운행 중') {
    // A completed/elapsed assignment supersedes an older manual "driving" flag.
    const manualAt = Date.parse(operation.updated_at);
    const finishedSinceOverride = rows.some(row => {
      const end = parseKstDateTimeToMs(row.end_date || row.date, row.end_time || '');
      const finishedAt = row.operation_status === 'completed' || row.status === 'completed'
        ? Date.parse(row.updated_at || '') : end;
      return Number.isFinite(finishedAt) && finishedAt <= now && finishedAt >= manualAt;
    });
    if (!finishedSinceOverride) return 'in_service';
  }
  return operation?.status === '확인 필요' ? 'unknown' : 'available';
}

/** Bookable waiting vehicles first; never promote a conflicting vehicle over a bookable one. */
export function compareDispatchVehicles(
  a: { isAvailable: boolean; currentStatus: VehicleCurrentStatus },
  b: { isAvailable: boolean; currentStatus: VehicleCurrentStatus },
) {
  const rank: Record<VehicleCurrentStatus, number> = { available: 0, in_service: 1, unknown: 2, unavailable: 3, maintenance: 4 };
  return Number(b.isAvailable) - Number(a.isAvailable) || rank[a.currentStatus] - rank[b.currentStatus];
}

/** A multi-day email selects the same car for each day, not for the unused overnight gaps. */
export function combineFleetAvailability(results: FleetAvailabilityResult[]) {
  const first = results[0];
  if (!first) return { vehicles: [], drivers: [] };
  return {
    vehicles: first.vehicles.map(vehicle => {
      const rows = results.map(result => result.vehicles.find(row => row.uuid === vehicle.uuid && row.plate === vehicle.plate));
      const blocked = rows.find(row => row && !row.isAvailable);
      return { ...vehicle, isAvailable: rows.every(row => row?.isAvailable),
        unavailabilityReason: blocked?.unavailabilityReason || vehicle.unavailabilityReason };
    }).sort(compareDispatchVehicles),
    drivers: first.drivers.map(driver => ({ ...driver,
      isAvailable: results.every(result => result.drivers.some(row => row.id === driver.id && row.isAvailable)),
    })),
  };
}
