import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { scheduleId, version = 1, driverId = 'driver_4', driverName = '윤태준', deviceSummary = 'Mobile Browser' } = body;

    if (!scheduleId) {
      return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 1. Record immutable acknowledgment audit entry
    const ackPayload = {
      schedule_id: scheduleId,
      version: Number(version),
      driver_id: String(driverId),
      driver_name: String(driverName),
      device_summary: String(deviceSummary),
      acknowledged_at: nowIso,
    };

    const { error: ackError } = await supabaseAdmin
      .from('dispatch_acknowledgments')
      .upsert(ackPayload, { onConflict: 'schedule_id,version,driver_id' });

    if (ackError) {
      console.warn('[Dispatch Ack] Notice recording acknowledgment audit:', ackError.message);
    }

    // 2. Update schedule record with latest acknowledgment state
    const { data: updatedSchedule, error: updateError } = await supabaseAdmin
      .from('schedules')
      .update({
        last_ack_version: Number(version),
        last_ack_at: nowIso,
      })
      .eq('id', scheduleId)
      .select('id, version, last_ack_version, last_ack_at')
      .single();

    if (updateError) {
      console.warn('[Dispatch Ack] Notice updating schedule ack fields:', updateError.message);
    }

    return NextResponse.json({
      ok: true,
      scheduleId,
      version: Number(version),
      acknowledgedAt: nowIso,
      schedule: updatedSchedule,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/schedules/ack error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
