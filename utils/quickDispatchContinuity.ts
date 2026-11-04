import type { HqBooking } from '@/types/hq';

/** Keep the immutable origin of an emailed booking when it is assigned later on
 * another device. Verified POIs may only be reused while their names are unchanged.
 * This is deliberately independent of the quick-dispatch UI for regression tests. */
export function editedBookingIdentity(
  original: HqBooking | null,
  pickupLocation: string,
  destination: string,
) {
  if (!original) return null;
  const samePickup = original.pickupLocation.trim() === pickupLocation.trim();
  const sameDestination = original.destination.trim() === destination.trim();
  return {
    intakeSource: original.intakeSource,
    eventId: original.eventId,
    eventName: original.eventName,
    groupId: original.groupId,
    groupName: original.groupName,
    groupTotalVehicles: original.groupTotalVehicles,
    groupVehicleIndex: original.groupVehicleIndex,
    originLat: samePickup ? original.pickupLat : undefined,
    originLng: samePickup ? original.pickupLng : undefined,
    destinationLat: sameDestination ? original.destinationLat : undefined,
    destinationLng: sameDestination ? original.destinationLng : undefined,
    // A renamed POI cannot inherit the verification of its prior coordinates.
    placeVerified: samePickup && sameDestination ? original.placeVerified : false,
  };
}
