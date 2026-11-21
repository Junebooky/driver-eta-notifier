/**
 * Immutable reference captured when a schedule is first saved in HQ.
 * Do not replace this on later driver, vehicle or time revisions.
 */
export interface OriginalDispatchBaseline {
  vehiclePlate: string;
  vehicleModel: string;
  pickupTime: string;
  endTime: string;
  capturedAt: string;
}
