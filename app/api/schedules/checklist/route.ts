import { NextRequest, NextResponse } from 'next/server';
import { queryServerSchedules } from '@/lib/dispatch/scheduleServerStore';
import {
  annotateBookingsWithConflicts,
  cleanDriverIdentity,
  mapScheduleItemToHqBooking,
} from '@/utils/dispatchConflictDetector';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    const { schedules, error } = await queryServerSchedules({
      role: 'hq',
      date,
    });

    if (error) {
      console.warn('[Checklist API] Notice querying schedules:', error);
      return NextResponse.json({
        summary: {
          total: 0,
          unsentDrafts: 0,
          unverifiedPlaces: 0,
          pendingDriverAck: 0,
          reconfirmNeeded: 0,
          unassigned: 0,
          conflicts: 0,
        },
        items: [],
      });
    }

    const unsentDrafts = schedules.filter((r) => r.dispatch_status === 'draft');
    const unverifiedPlaces = schedules.filter(
      (r) => r.dispatch_status !== 'cancelled' && r.place_verified === false
    );
    const unassigned = schedules.filter(
      (r) =>
        r.dispatch_status === 'unassigned' ||
        (r.dispatch_status !== 'cancelled' &&
          r.service_mode !== 'vehicle_only' &&
          !cleanDriverIdentity(r.driver_name) &&
          (!r.vehicle_no || r.vehicle_no === '미배정'))
    );
    const pendingDriverAck = schedules.filter((r) => {
      if (r.dispatch_status !== 'published') return false;
      if (r.service_mode !== 'vehicle_only' && !cleanDriverIdentity(r.driver_name) && (!r.vehicle_no || r.vehicle_no === '미배정')) {
        return false;
      }
      const ver = r.version || 1;
      const ackVer = r.last_ack_version || 0;
      return ackVer < ver;
    });
    const reconfirmNeeded = pendingDriverAck.filter((r) => (r.last_ack_version || 0) > 0 && (r.version || 1) > 1);

    const bookingsWithConflicts = annotateBookingsWithConflicts(
      schedules.map((s, idx) => mapScheduleItemToHqBooking(s, idx))
    );
    const conflictingIds = new Set(
      bookingsWithConflicts.filter((b) => b.hasConflict).map((b) => b.scheduleId || b.id)
    );
    const conflicts = schedules.filter((s) => conflictingIds.has(s.id));

    return NextResponse.json({
      summary: {
        total: schedules.length,
        unsentDrafts: unsentDrafts.length,
        unverifiedPlaces: unverifiedPlaces.length,
        pendingDriverAck: pendingDriverAck.length,
        reconfirmNeeded: reconfirmNeeded.length,
        unassigned: unassigned.length,
        conflicts: conflicts.length,
      },
      categories: {
        unsentDrafts,
        unverifiedPlaces,
        pendingDriverAck,
        reconfirmNeeded,
        unassigned,
        conflicts,
      },
      items: schedules,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
