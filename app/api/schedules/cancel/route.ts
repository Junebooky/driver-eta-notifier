import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { scheduleId, reason = '고객 요청 취소', cancelledBy = 'HQ_MANAGER' } = body;

    if (!scheduleId) {
      return NextResponse.json({ error: 'scheduleId is required' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // Fetch existing schedule to bump version
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('schedules')
      .select('version')
      .eq('id', scheduleId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const nextVersion = (existing.version || 1) + 1;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('schedules')
      .update({
        dispatch_status: 'cancelled',
        status: 'cancelled',
        version: nextVersion,
        protocol_notes: `[배차 취소 사유: ${reason} (처리자: ${cancelledBy})]`,
        updated_at: nowIso,
      })
      .eq('id', scheduleId)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      scheduleId,
      version: nextVersion,
      dispatchStatus: 'cancelled',
      cancelledAt: nowIso,
      schedule: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
