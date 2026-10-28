import { NextRequest, NextResponse } from 'next/server';
import {
  checkServerDispatchConflicts,
  DispatchUpsertInput,
  upsertServerDispatchSchedule,
  queryServerSchedules,
} from '@/lib/dispatch/scheduleServerStore';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

function normalizePayloadItem(raw: Record<string, any>, rootBody: Record<string, any>): DispatchUpsertInput {
  return {
    scheduleId: raw.scheduleId || raw.id,
    bookingNo: raw.bookingNo,
    customerName: raw.customerName,
    customerId: raw.customerId,
    orderingAgency: raw.orderingAgency,
    endBrand: raw.endBrand,
    eventId: raw.eventId,
    eventName: raw.eventName,
    billingTarget: raw.billingTarget,
    billingTargetName: raw.billingTargetName,
    groupId: raw.groupId,
    groupName: raw.groupName,
    groupTotalVehicles: raw.groupTotalVehicles,
    groupVehicleIndex: raw.groupVehicleIndex,
    intakeSource: raw.intakeSource,
    vehicleNo: raw.vehicleNo,
    vehicleId: raw.vehicleId,
    vehicleModel: raw.vehicleModel,
    vehiclePlate: raw.vehiclePlate,
    driverId: raw.driverId,
    driverName: raw.driverName,
    driverPhone: raw.driverPhone,
    date: raw.date || raw.pickupDate || '',
    pickupTime: raw.pickupTime || '',
    timeDisplay: raw.timeDisplay,
    origin: raw.origin || raw.pickupLocation || '',
    originAddress: raw.originAddress,
    originLat: raw.originLat,
    originLng: raw.originLng,
    destination: raw.destination || '',
    destinationAddress: raw.destinationAddress,
    destinationLat: raw.destinationLat,
    destinationLng: raw.destinationLng,
    passengerName: raw.passengerName,
    passengerPhone: raw.passengerPhone,
    passengerCount: raw.passengerCount,
    flightNumber: raw.flightNumber,
    notes: raw.notes,
    dispatchStatus: raw.dispatchStatus || rootBody.dispatchStatus || 'published',
    placeVerified: raw.placeVerified,
    allowUnverified: raw.allowUnverified ?? rootBody.allowUnverified ?? false,
    allowConflictOverride: raw.allowConflictOverride ?? rootBody.allowConflictOverride ?? false,
    publishedBy: raw.publishedBy || rootBody.publishedBy || '대표님/관리자',
    customerBrochure: raw.customerBrochure,
    requestedLanguage: raw.requestedLanguage,
    languageOverrideConfirmed: raw.languageOverrideConfirmed,
    serviceMode: raw.serviceMode,
    appliedPricingSnapshot: raw.appliedPricingSnapshot,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const rawItems: Array<Record<string, any>> = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : [body];

    const candidates = rawItems.map((item) => normalizePayloadItem(item, body));

    for (const cand of candidates) {
      if (!cand.date || !cand.pickupTime || !cand.origin?.trim() || !cand.destination?.trim()) {
        return NextResponse.json(
          {
            ok: false,
            error: '운행 일자, 픽업 시간, 출발지, 목적지는 필수 입력 항목입니다.',
          },
          { status: 400 }
        );
      }
    }

    // Server-side Driver & Vehicle Schedule Conflict Guard
    const allowConflictOverride = candidates.every((c) => c.allowConflictOverride === true);
    if (!allowConflictOverride) {
      const conflicts = await checkServerDispatchConflicts(candidates);
      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            code: 'SCHEDULE_CONFLICT',
            error: conflicts[0].message,
            conflicts,
          },
          { status: 409 }
        );
      }
    }

    const savedSchedules: ScheduleItem[] = [];
    for (const cand of candidates) {
      const result = await upsertServerDispatchSchedule(cand);
      if (result.error || !result.schedule) {
        return NextResponse.json(
          {
            ok: false,
            code: result.error?.includes('미확인 장소') ? 'UNRESOLVED_PLACE_GUARD' : 'DISPATCH_SAVE_FAILED',
            error: result.error || '배차 저장에 실패했습니다.',
          },
          { status: result.statusCode || 400 }
        );
      }
      savedSchedules.push(result.schedule);
    }

    const primary = savedSchedules[0];
    const nowIso = new Date().toISOString();

    return NextResponse.json({
      ok: true,
      count: savedSchedules.length,
      schedule: primary,
      schedules: savedSchedules,
      dispatchStatus: primary?.dispatch_status || 'published',
      publishedAt: primary?.dispatch_status === 'published' ? primary.published_at || nowIso : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/schedules/dispatch error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const onlyDispatched = searchParams.get('onlyDispatched') === 'true';

    const { schedules, error } = await queryServerSchedules({
      role: 'hq',
      statusParam: onlyDispatched ? 'published' : 'all',
      date,
    });

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      schedules: schedules || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/schedules/dispatch error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
