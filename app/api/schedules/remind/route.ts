import { NextRequest, NextResponse } from 'next/server';
import { remindServerSchedule } from '@/lib/dispatch/scheduleServerStore';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const { scheduleId, remindedBy, note } = body || {};

    if (!scheduleId || typeof scheduleId !== 'string') {
      return NextResponse.json(
        { ok: false, error: '배차 ID(scheduleId)가 필요합니다.' },
        { status: 400 }
      );
    }

    const result = await remindServerSchedule({
      scheduleId: scheduleId.trim(),
      remindedBy: typeof remindedBy === 'string' && remindedBy.trim() ? remindedBy.trim() : '본사 관제',
      note: typeof note === 'string' && note.trim() ? note.trim() : undefined,
    });

    if (result.error) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.statusCode || 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      scheduleId: scheduleId.trim(),
      reminderCount: result.reminderCount,
      remindedAt: result.remindedAt,
      schedule: result.schedule,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/schedules/remind error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

