/**
 * Fail-closed booking detection for actual HQ driving-log submissions only.
 * A copy/paste KakaoTalk report never calls this logic.
 *
 * Driver identity and organization must come from the authenticated server session.
 * We deliberately do NOT disambiguate multiple trips using customer names,
 * free-text routes, or vehicle plates: an HQ reviewer handles those cases.
 */
export interface AutoBookingCandidate {
  id: string;
  org_id?: string | null;
  driver_id?: string | null;
  date?: string | null;
  end_date?: string | null;
  vehicle_plate?: string | null;
  dispatch_status?: string | null;
  schedule_meta?: { serviceMode?: string; vehiclePlate?: string } | null;
}

export type AutoBookingMatch =
  | { bookingId: string; reason: 'unique_verified' }
  | { bookingId: null; reason: 'no_candidate' | 'multiple_candidates' | 'plate_missing' | 'plate_mismatch' };

export function normalizeAutoBookingPlate(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    : '';
}

export function findUnambiguousDrivingLogBooking(
  schedules: readonly AutoBookingCandidate[],
  context: {
    orgId: string;
    driverId: string;
    drivingDate: string;
    vehiclePlate?: string | null;
  },
): AutoBookingMatch {
  const candidates = schedules.filter((schedule) => (
    schedule.org_id === context.orgId &&
    schedule.driver_id === context.driverId &&
    schedule.dispatch_status === 'published' &&
    schedule.schedule_meta?.serviceMode !== 'vehicle_only' &&
    typeof schedule.date === 'string' &&
    schedule.date <= context.drivingDate &&
    (schedule.end_date || schedule.date) >= context.drivingDate
  ));

  if (candidates.length === 0) return { bookingId: null, reason: 'no_candidate' };
  // A driver may have several bookings on one day, even in the same vehicle.
  if (candidates.length !== 1) return { bookingId: null, reason: 'multiple_candidates' };

  const schedulePlate = normalizeAutoBookingPlate(
    candidates[0].vehicle_plate || candidates[0].schedule_meta?.vehiclePlate,
  );
  const reportPlate = normalizeAutoBookingPlate(context.vehiclePlate);
  if (!schedulePlate || !reportPlate) return { bookingId: null, reason: 'plate_missing' };
  if (schedulePlate !== reportPlate) return { bookingId: null, reason: 'plate_mismatch' };

  return { bookingId: candidates[0].id, reason: 'unique_verified' };
}
