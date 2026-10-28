import { NextRequest, NextResponse } from 'next/server';
import { acknowledgeServerSchedule } from '@/lib/dispatch/scheduleServerStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      scheduleId,
      version = 1,
      driverId = 'driver_mobile',
      driverName = '담당 기사',
      deviceSummary = 'Driver Cockpit Mobile',
    } = body;

    if (!scheduleId) {
      return NextResponse.json({ ok: false, error: 'scheduleId is required' }, { status: 400 });
    }

    const result = await acknowledgeServerSchedule({
      scheduleId,
      version: Number(version),
      driverId: String(driverId),
      driverName: String(driverName),
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
