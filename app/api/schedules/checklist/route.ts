import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { DbScheduleRow } from '@/types';
import { mapDbRowToScheduleItem } from '@/app/api/schedules/route';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    let query = supabaseAdmin.from('schedules').select('*');
    if (date) {
      query = query.eq('date', date);
    }

    const { data, error } = await query
      .order('date', { ascending: true })
      .order('pickup_time', { ascending: true });

    if (error) {
      console.warn('[Checklist API] Notice querying schedules:', error.message);
      return NextResponse.json({
        summary: {
          total: 0,
          unsentDrafts: 0,
          unverifiedPlaces: 0,
          pendingDriverAck: 0,
          unassigned: 0,
        },
        items: [],
      });
    }

    const rows: DbScheduleRow[] = data || [];

    const unsentDrafts = rows.filter((r) => r.dispatch_status === 'draft');
    const unverifiedPlaces = rows.filter((r) => r.place_verified === false);
    const pendingDriverAck = rows.filter((r) => {
      if (r.dispatch_status !== 'published') return false;
      if (!r.driver_id && !r.driver_name) return false; // Must be assigned to a driver first
      const ver = r.version || 1;
      const ackVer = r.last_ack_version || 0;
      return ackVer < ver;
    });
    const unassigned = rows.filter((r) => !r.driver_id && !r.driver_name);

    return NextResponse.json({
      summary: {
        total: rows.length,
        unsentDrafts: unsentDrafts.length,
        unverifiedPlaces: unverifiedPlaces.length,
        pendingDriverAck: pendingDriverAck.length,
        unassigned: unassigned.length,
      },
      categories: {
        unsentDrafts: unsentDrafts.map((r) => mapDbRowToScheduleItem(r)),
        unverifiedPlaces: unverifiedPlaces.map((r) => mapDbRowToScheduleItem(r)),
        pendingDriverAck: pendingDriverAck.map((r) => mapDbRowToScheduleItem(r)),
        unassigned: unassigned.map((r) => mapDbRowToScheduleItem(r)),
      },
      items: rows.map((r) => mapDbRowToScheduleItem(r)),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
