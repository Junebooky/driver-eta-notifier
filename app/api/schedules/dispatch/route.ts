import { NextRequest, NextResponse } from 'next/server';
import {
  checkServerDispatchConflicts,
  DispatchUpsertInput,
  upsertServerDispatchSchedule,
  queryServerSchedules,
  atomicUpsertServerDispatchBatch,
} from '@/lib/dispatch/scheduleServerStore';
import { ScheduleItem } from '@/data/ferrariSchedules';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { timeHHmmToMinutes, normalizeDateToIso } from '@/utils/dispatchConflictDetector';

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
    endDate: raw.endDate || raw.pickupEndDate || raw.date || raw.pickupDate || '',
    pickupTime: raw.pickupTime || '',
    endTime: raw.endTime || raw.pickupEndTime || '',
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

      // Mandatory explicit endTime validation for published dispatch (Point 5)
      if (cand.dispatchStatus === 'published') {
        if (!cand.endTime || !cand.endTime.trim()) {
          return NextResponse.json(
            {
              ok: false,
              code: 'END_TIME_REQUIRED_FOR_PUBLISHED_DISPATCH',
              error: '배차 확정(published)을 위해서는 명시적인 운행 종료 시간(endTime: HH:mm)이 필수입니다. 종료 시간을 입력해 주세요.',
            },
            { status: 400 }
          );
        }

        const startMin = timeHHmmToMinutes(cand.pickupTime);
        const endMin = timeHHmmToMinutes(cand.endTime);
        const candStartDate = normalizeDateToIso(cand.date);
        const candEndDate = normalizeDateToIso(cand.endDate || cand.date);

        if (startMin === null || endMin === null) {
          return NextResponse.json(
            {
              ok: false,
              code: 'INVALID_TIME_FORMAT',
              error: '유효한 시간(HH:mm) 형식을 입력해 주세요.',
            },
            { status: 400 }
          );
        }

        if (candStartDate === candEndDate && endMin <= startMin) {
          return NextResponse.json(
            {
              ok: false,
              code: 'INVALID_TIME_INTERVAL',
              error: '종료 시간은 출발(픽업) 시간보다 이후여야 합니다.',
            },
            { status: 400 }
          );
        }
      }

      // Server-side guard for email intake (Issue #33 P0 audit)
      if (cand.intakeSource === 'email' && cand.dispatchStatus === 'published') {
        if (
          !cand.placeVerified ||
          typeof cand.originLat !== 'number' ||
          typeof cand.originLng !== 'number' ||
          typeof cand.destinationLat !== 'number' ||
          typeof cand.destinationLng !== 'number'
        ) {
          return NextResponse.json(
            {
              ok: false,
              code: 'UNVERIFIED_COORDINATES_BLOCKED',
              error: '출발지 및 목적지의 TMAP 위치 좌표가 확정되지 않았습니다. POI 후보를 선택해 좌표를 확정해 주세요.',
            },
            { status: 400 }
          );
        }
        if (cand.passengerPhone && cand.passengerPhone.includes('@')) {
          return NextResponse.json(
            { ok: false, error: '승객 전화번호에 이메일 주소가 포함될 수 없습니다.' },
            { status: 400 }
          );
        }
      }
    }

    // P0 Concurrency Mutex & Atomic Batch Upsert Guard with All-or-Nothing Rollback (Point 1)
    const batchResult = await atomicUpsertServerDispatchBatch(candidates, undefined, req.headers.get('idempotency-key') || undefined);
    if (!batchResult.ok) {
      if (batchResult.conflicts && batchResult.conflicts.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            code: 'SCHEDULE_CONFLICT',
            error: batchResult.error || batchResult.conflicts[0].message,
            conflicts: batchResult.conflicts,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          ok: false,
          code: batchResult.statusCode === 409 ? 'SCHEDULE_CONFLICT' : batchResult.error?.includes('미확인 장소') ? 'UNRESOLVED_PLACE_GUARD' : 'DISPATCH_SAVE_FAILED',
          error: batchResult.error || '배차 저장에 실패했습니다.',
        },
        { status: batchResult.statusCode || 400 }
      );
    }

    const savedSchedules = batchResult.schedules || [];
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
