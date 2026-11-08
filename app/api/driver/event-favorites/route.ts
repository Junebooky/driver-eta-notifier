import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { queryServerSchedules } from '@/lib/dispatch/scheduleServerStore';
import { buildDriverEventFavorites } from '@/utils/driverEventFavorites';

/**
 * Read-only, per-driver, event favorites. Email dispatch records are the SSOT:
 * no duplicate personal preset rows, no stale snapshots in localStorage.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyServerAuth(req, 'driver');
  if (!auth.ok || !auth.session) {
    return NextResponse.json({ events: [], error: auth.error || '인증이 필요합니다.' }, { status: auth.statusCode });
  }
  const driverId = auth.session.driverId;
  if (!driverId) {
    return NextResponse.json({ events: [], error: '기사 계정이 연결되지 않았습니다.' }, { status: 403 });
  }

  try {
    const result = await queryServerSchedules({ driverId, role: 'driver', statusParam: 'published' });
    if (result.error) {
      return NextResponse.json({ events: [], error: '배정 행사 조회에 실패했습니다.' }, { status: 503 });
    }
    return NextResponse.json(
      { events: buildDriverEventFavorites(result.schedules, driverId) },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('[DriverEventFavorites] read failed:', error);
    return NextResponse.json({ events: [], error: '배정 행사를 불러오지 못했습니다.' }, { status: 500 });
  }
}
