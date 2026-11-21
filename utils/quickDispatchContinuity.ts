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
    pickupPoiVerified: Boolean(original.placeVerified && samePickup && Number.isFinite(original.pickupLat) && Number.isFinite(original.pickupLng)),
    destinationPoiVerified: Boolean(original.placeVerified && sameDestination && Number.isFinite(original.destinationLat) && Number.isFinite(original.destinationLng)),
    originLat: samePickup ? original.pickupLat : undefined,
    originLng: samePickup ? original.pickupLng : undefined,
    destinationLat: sameDestination ? original.destinationLat : undefined,
    destinationLng: sameDestination ? original.destinationLng : undefined,
    // A renamed POI cannot inherit the verification of its prior coordinates.
    placeVerified: samePickup && sameDestination ? original.placeVerified : false,
  };
}

/** Resolve new TMAP selections and previously verified, unchanged legs independently. */
export function resolveQuickDispatchPlaces(
  lineage: ReturnType<typeof editedBookingIdentity>,
  pickupPoi: {lat:number;lng:number}|null,
  destinationPoi: {lat:number;lng:number}|null,
) {
  const valid=(poi:{lat:number;lng:number}|null) =>
    Boolean(poi && Number.isFinite(poi.lat) && Number.isFinite(poi.lng) && Math.abs(poi.lat)<=90 && Math.abs(poi.lng)<=180);
  const newPickup=valid(pickupPoi)?pickupPoi:null;
  const newDestination=valid(destinationPoi)?destinationPoi:null;
  return {
    originLat:newPickup?.lat ?? lineage?.originLat,
    originLng:newPickup?.lng ?? lineage?.originLng,
    destinationLat:newDestination?.lat ?? lineage?.destinationLat,
    destinationLng:newDestination?.lng ?? lineage?.destinationLng,
    placeVerified:lineage || pickupPoi || destinationPoi
      ? Boolean((newPickup || lineage?.pickupPoiVerified) && (newDestination || lineage?.destinationPoiVerified))
      : undefined,
  };
}
