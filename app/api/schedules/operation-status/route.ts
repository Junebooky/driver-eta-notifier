import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export type OperationStatus = 'ready' | 'arrived_pickup' | 'boarded' | 'in_transit' | 'completed';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scheduleId, status, changedBy, note } = body;

    if (!scheduleId || !status) {
      return NextResponse.json({ ok: false, error: 'scheduleId and status are required' }, { status: 400 });
    }

    const validStatuses: OperationStatus[] = ['ready', 'arrived_pickup', 'boarded', 'in_transit', 'completed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ ok: false, error: `Invalid operation status: ${status}` }, { status: 400 });
    }

    // 1. Fetch current schedule
    const { data: currentSchedule, error: fetchErr } = await supabaseAdmin
      .from('schedules')
      .select('id, operation_status, operation_history')
      .eq('id', scheduleId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(currentSchedule?.operation_history)
      ? currentSchedule.operation_history
      : [];

    const newHistoryEntry = {
      fromStatus: currentSchedule?.operation_status || 'ready',
      toStatus: status,
      timestamp: nowIso,
      changedBy: changedBy || 'driver',
      note: note || '',
    };

    const updatedHistory = [...existingHistory, newHistoryEntry];

    // 2. Update schedule
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('schedules')
      .update({
        operation_status: status,
        operation_updated_at: nowIso,
        operation_history: updatedHistory,
        updated_at: nowIso,
      })
      .eq('id', scheduleId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      scheduleId,
      operationStatus: status,
      operationUpdatedAt: nowIso,
      operationHistory: updatedHistory,
    });
  } catch (err: any) {
    console.error('[OperationStatus API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
