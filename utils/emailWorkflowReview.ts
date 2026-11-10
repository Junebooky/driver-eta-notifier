import type { AvailableVehicleItem } from './availabilityEngine';
import { compareDispatchVehicles } from './fleetVehicleStatus';
import { mapVehicleToUiCategory, type VipRealVehicle } from './vehicleData';
import { normalizeFleetPlate } from './fleetVehicleRegistry';

/** Inventory remains visible when an interval cannot yet be checked. Never infer bookability. */
export function emailVehicleChoices(inventory: VipRealVehicle[], availability: AvailableVehicleItem[] | undefined, reason: string): AvailableVehicleItem[] {
  return inventory.map(vehicle => {
    const verified = availability?.find(row => row.uuid === vehicle.uuid && normalizeFleetPlate(row.plate) === normalizeFleetPlate(vehicle.plate));
    if (verified) return { ...verified, model: vehicle.model, capacity: vehicle.capacity };
    return {
      id: vehicle.id, uuid: vehicle.uuid, plate: vehicle.plate, model: vehicle.model,
      category: vehicle.category as AvailableVehicleItem['category'], uiCategory: mapVehicleToUiCategory(vehicle), capacity: vehicle.capacity,
      isAvailable: false, currentStatus: 'unknown' as const, requestedIntervalStatus: 'unconfirmed_time' as const,
      unavailabilityReason: reason,
    };
  }).sort((a, b) => compareDispatchVehicles(a, b) || a.model.localeCompare(b.model, 'ko') || a.plate.localeCompare(b.plate, 'ko'));
}

export interface SourceTextRange { start: number; end: number }
/** Locate the exact sender text without trusting/rendering HTML.
 * Original UTF-16 ranges remain stable for highlighting and copy.
 * If case/width/spacing matching fails, tolerate punctuation around a
 * sufficiently long address (e.g. "123, Teheran-ro" vs "123 Teheran ro").
 */
export function findEmailSourceRanges(text: string, address: string): SourceTextRange[] {
  function normalized(value: string, loosePunctuation: boolean) {
    let result = '';
    const offsets: SourceTextRange[] = [];
    let offset = 0;
    for (const point of value) {
      const part = point.normalize('NFKC').toLowerCase()
        .replace(/[\s\u200b-\u200d\ufeff]/gu, '')
        .replace(loosePunctuation ? /[.,\-#/()[\]:]/gu : /(?!)a/gu, '');
      for (let i = 0; i < part.length; i++) offsets.push({ start: offset, end: offset + point.length });
      result += part; offset += point.length;
    }
    return { result, offsets };
  }
  function find(loose: boolean): SourceTextRange[] {
    const needle = normalized(address, loose).result;
    if (!needle) return [];
    const haystack = normalized(text, loose);
    const ranges: SourceTextRange[] = [];
    for (let from = 0; from < haystack.result.length;) {
      const at = haystack.result.indexOf(needle, from);
      if (at < 0) break;
      ranges.push({ start: haystack.offsets[at].start, end: haystack.offsets[at + needle.length - 1].end });
      from = at + needle.length;
    }
    return ranges;
  }
  const exact = find(false);
  if (exact.length) return exact;
  // Short names could appear elsewhere in the email; don't fuzzy-match them.
  if (normalized(address, true).result.length < 10) return [];
  return find(true);
}
