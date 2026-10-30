import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  getDriverVehicleBundle,
  getLatestDispatchLogForBooking,
  recordInfoDispatchLog,
} from '@/lib/assets/driverAssetServerStore';
import { resolveVehicleEntity } from '@/utils/vehicleData';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hq/drivers/assets/dispatch
 * Records an immutable customer brochure / info dispatch snapshot.
 * Blocks dispatch if driver/vehicle is unassigned or Info is unregistered.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const payload = await req.json().catch(() => ({}));
    const {
      bookingId,
      driverId,
      driverName = '담당 기사',
      vehiclePlate,
      vehicleId,
      vehicleModel = '차량 미지정',
      channel = 'manual_copy',
      recipient = '',
      notes = '',
    } = payload;

    if (!bookingId || typeof bookingId !== 'string') {
      return NextResponse.json(
        { ok: false, error: '예약 식별자(bookingId)가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!driverId || typeof driverId !== 'string' || driverId === '미배정') {
      return NextResponse.json(
        { ok: false, error: '배차 미확정: 기사가 배정되지 않아 고객 안내자료를 발송할 수 없습니다.' },
        { status: 400 }
      );
    }

    if (!vehiclePlate || vehiclePlate === '미배정' || vehiclePlate === '-') {
      return NextResponse.json(
        { ok: false, error: '배차 미확정: 차량이 배정되지 않아 고객 안내자료를 발송할 수 없습니다.' },
        { status: 400 }
      );
    }

    const org = auth.session.org || 'vip_limousine_korea';
    const effVehicle = resolveVehicleEntity(vehicleId || vehiclePlate, vehicleModel);

    // Verify Info asset existence for this (driver, vehicle) pair
    const bundle = await getDriverVehicleBundle(driverId, effVehicle.uuid, vehicleModel, org);

    if (!bundle.isReadyForCustomerDispatch) {
      return NextResponse.json(
        {
          ok: false,
          error: `Info 미등록: [${bundle.driverName || driverName} × ${effVehicle.model}(${effVehicle.plate})] 조합의 PC/Mobile 안내자료가 아직 등록되지 않았습니다. 먼저 안내자료를 등록해주세요.`,
        },
        { status: 400 }
      );
    }

    const isPreparedOnly =
      payload.status === 'prepared' ||
      payload.isPreparationOnly === true ||
      channel === 'download';
    const brochureStatus = isPreparedOnly ? '준비완료' : '발송됨';
    const snapshotStatus = isPreparedOnly ? ('prepared' as const) : ('sent' as const);

    const now = new Date().toISOString();
    const snapshot = {
      bookingId,
      driverId,
      driverName: bundle.driverName || driverName,
      vehicleId: effVehicle.uuid,
      vehiclePlate: effVehicle.plate,
      vehicleModel: effVehicle.model,
      pcInfoAssetId: bundle.pcInfo?.id || null,
      mobileInfoAssetId: bundle.mobileInfo?.id || null,
      profileAssetId: bundle.profile?.id || null,
      pcFilePath: bundle.pcInfo?.filePath,
      mobileFilePath: bundle.mobileInfo?.filePath,
      dispatchedAt: now,
      dispatchedBy: auth.session.displayName || '본사 관리자',
      channel: channel as any,
      recipient: recipient.trim() || (isPreparedOnly ? '본사 다운로드' : '고객사 담당자'),
      status: snapshotStatus,
    };

    const logRecord = await recordInfoDispatchLog({
      organizationId: org,
      bookingId,
      driverId,
      driverName: bundle.driverName || driverName,
      vehicleId: effVehicle.uuid,
      vehiclePlate: effVehicle.plate,
      vehicleModel: effVehicle.model,
      profileAssetId: bundle.profile?.id || null,
      pcInfoAssetId: bundle.pcInfo?.id || null,
      mobileInfoAssetId: bundle.mobileInfo?.id || null,
      channel: channel as any,
      recipient: recipient.trim() || (isPreparedOnly ? '본사 다운로드' : '고객사 담당자'),
      dispatchedBy: auth.session.displayName || '본사 관리자',
      dispatchedAt: now,
      snapshot,
      notes: notes || undefined,
    });

    // Update schedule metadata if schedules table is available
    try {
      const { data: currentSchedule } = await supabaseAdmin
        .from('schedules')
        .select('schedule_meta')
        .eq('id', bookingId)
        .maybeSingle();

      const existingMeta = currentSchedule?.schedule_meta || {};
      await supabaseAdmin
        .from('schedules')
        .update({
          schedule_meta: {
            ...existingMeta,
            customer_brochure: brochureStatus,
            customer_brochure_snapshot: snapshot,
            customer_brochure_dispatched_at: now,
          },
          updated_at: now,
        })
        .eq('id', bookingId);
    } catch {
      // Ignore DB update error if table schema differs
    }

    return NextResponse.json({
      ok: true,
      log: logRecord,
      snapshot,
      brochureStatus,
      message: isPreparedOnly
        ? '고객사 안내자료 준비완료 상태가 기록되었습니다.'
        : '고객사 기사·차량 Info 안내자료 발송 기록이 보존되었습니다.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '발송 기록 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/hq/drivers/assets/dispatch
 * Retrieves the latest dispatch log and detects if current booking assignment has changed.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');
    const currentDriverId = searchParams.get('currentDriverId');
    const currentVehiclePlate = searchParams.get('currentVehiclePlate');

    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: '예약 식별자(bookingId)가 필요합니다.' },
        { status: 400 }
      );
    }

    const org = auth.session.org || 'vip_limousine_korea';
    const latestLog = await getLatestDispatchLogForBooking(bookingId, org);

    let hasMismatch = false;
    let mismatchReason: string | undefined;

    if (latestLog && latestLog.snapshot) {
      const snap = latestLog.snapshot;
      const driverDiff = currentDriverId && snap.driverId && currentDriverId !== snap.driverId;
      const vehicleDiff =
        currentVehiclePlate &&
        snap.vehiclePlate &&
        currentVehiclePlate.replace(/\s+/g, '') !== snap.vehiclePlate.replace(/\s+/g, '');

      if (driverDiff || vehicleDiff) {
        hasMismatch = true;
        mismatchReason = `발송된 안내자료(${snap.driverName} × ${snap.vehiclePlate})와 현재 확정된 배차 정보가 일치하지 않습니다.`;
      }
    }

    return NextResponse.json({
      ok: true,
      latestLog,
      hasMismatch,
      mismatchReason,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '발송 내역 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

