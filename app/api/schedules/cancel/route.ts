import { NextRequest, NextResponse } from 'next/server';
import { cancelServerSchedule } from '@/lib/dispatch/scheduleServerStore';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const {
      scheduleId,
      reason = '고객 요청 취소',
      cancelledBy = '본사 관리자',
    } = body;

    if (!scheduleId) {
      return NextResponse.json({ ok: false, error: 'scheduleId is required' }, { status: 400 });
    }

    const result = await cancelServerSchedule({
      scheduleId,
      reason,
      cancelledBy,
    });

    if (result.error) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.statusCode || 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      scheduleId,
      version: result.version,
      dispatchStatus: 'cancelled',
      cancelledAt: result.cancelledAt,
      schedule: result.schedule,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
