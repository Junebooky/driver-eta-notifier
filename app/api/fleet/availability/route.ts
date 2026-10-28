import { NextRequest, NextResponse } from 'next/server';
import { checkFleetAvailability } from '@/utils/availabilityEngine';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || searchParams.get('date') || '';
    const startTime = searchParams.get('startTime') || '09:00';
    const endDate = searchParams.get('endDate') || startDate;
    const endTime = searchParams.get('endTime') || '19:00';
    const requiredLanguage = (searchParams.get('language') as any) || 'ko';
    const category = (searchParams.get('category') as any) || 'all';
    const excludeScheduleId = searchParams.get('excludeScheduleId') || undefined;

    if (!startDate) {
      return NextResponse.json({ ok: false, error: 'startDate is required' }, { status: 400 });
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
    console.error('GET /api/fleet/availability error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
