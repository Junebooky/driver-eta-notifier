import { NextRequest, NextResponse } from 'next/server';
import { acknowledgeServerSchedule } from '@/lib/dispatch/scheduleServerStore';
import { verifyServerAuth } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    if(auth.session.role!=='driver')return NextResponse.json({ok:false,error:'배차 확인은 지정된 기사 계정에서 진행해 주세요.'},{status:403});
    const body = await req.json().catch(() => ({}));
    const { scheduleId, version, deviceSummary = 'Driver Cockpit Mobile' } = body;

    if (!scheduleId) {
      return NextResponse.json({ ok: false, error: 'scheduleId is required' }, { status: 400 });
    }

    // Role-based verified identity (Never trust client-supplied changedBy or driverName)
    const verifiedDriverId = auth.session.role === 'driver'
      ? auth.session.driverId || auth.session.userId
      : body.driverId || 'hq_admin';

    const verifiedDriverName = auth.session.role === 'driver'
      ? auth.session.driverName || '담당 기사'
      : body.driverName || '본사 관리자';

    const result = await acknowledgeServerSchedule({
      scheduleId,
      version: version !== undefined ? Number(version) : undefined,
      driverId: verifiedDriverId,
      driverName: verifiedDriverName,
      deviceSummary: String(deviceSummary),
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
      acknowledgedAt: result.acknowledgedAt,
      schedule: result.schedule,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/schedules/ack error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
