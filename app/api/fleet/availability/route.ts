import { NextRequest, NextResponse } from 'next/server';
import { checkFleetAvailability } from '@/utils/availabilityEngine';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { normalizeDateToIso, normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // P0 Security Guard: Require authorized HQ Admin to view fleet availability & schedule details
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const rawStart = searchParams.get('startDate') || searchParams.get('date') || '';
    const rawEnd = searchParams.get('endDate') || rawStart;
    const rawStartTime = searchParams.get('startTime') || '';
    const rawEndTime = searchParams.get('endTime') || '';
    const requiredLanguage = (searchParams.get('language') as any) || 'ko';
    const category = (searchParams.get('category') as any) || 'all';
    const excludeScheduleId = searchParams.get('excludeScheduleId') || undefined;

    const startDate = normalizeDateToIso(rawStart);
    const endDate = normalizeDateToIso(rawEnd) || startDate;
    const startTime = normalizeTimeHHmm(rawStartTime) || (rawStartTime.trim() ? '' : '09:00');
    const endTime = normalizeTimeHHmm(rawEndTime) || (rawEndTime.trim() ? '' : '19:00');

    if (!startDate) {
      return NextResponse.json(
        { ok: false, error: '유효한 시작 날짜(startDate: YYYY-MM-DD)를 입력해 주세요.' },
        { status: 400 }
      );
    }

    const result = await checkFleetAvailability({
      startDate,
      startTime,
      endDate,
      endTime,
      requiredLanguage,
      category,
      excludeScheduleId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('GET /api/fleet/availability error (fail-closed):', err);
    return NextResponse.json(
      { ok: false, error: err.message || '차량 가용성 조회 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

