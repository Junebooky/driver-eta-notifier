export interface CustodyBooking {
  id: string; version: number; vehicle_id: string | null; vehicle_plate: string;
  date: string; pickup_time: string; end_date: string | null; end_time: string | null;
  origin: string; destination: string;
}
export interface CustodyInspection {
  odometer: number; dte?: number; damage: string; parts: string[];
  parkingLocation?: string; keyLocation?: string; photoPath?: string;
}
export interface VehicleCustody {
  id: string; organization_id: string; driver_id: string; driver_name: string;
  booking_id: string; booking_version: number; vehicle_id: string; vehicle_plate: string;
  pickup_odometer: number; pickup_details: CustodyInspection; picked_up_at: string;
  pickup_request_id?: string; return_request_id?: string;
  expected_return_at: string; return_odometer: number | null; return_details: CustodyInspection | null;
  returned_at: string | null;
}
export interface CustodyMismatch {
  request_id: string; booking_id: string; driver_id: string; driver_name: string;
  created_at: string; resolved_at: string | null;
  result: { outcome: 'mismatch'; assignedPlate: string; actualPlate: string; reason: string; hasPhoto?: boolean };
}
export interface VehicleCustodyState {
  bookings: CustodyBooking[]; custodies: VehicleCustody[]; mismatches: CustodyMismatch[];
}
export interface CustodyWrite {
  action: 'pickup' | 'return'; bookingId?: string; expectedVersion?: number; custodyId?: string;
  vehicleId: string; confirmed: boolean; reason?: string; inspection: CustodyInspection;
  photo?: string;
}
export interface CustodyWriteResult {
  ok: true; outcome: 'picked_up' | 'returned' | 'mismatch'; requestId: string;
  custody?: VehicleCustody; assignedPlate?: string; actualPlate?: string; reason?: string;
}
