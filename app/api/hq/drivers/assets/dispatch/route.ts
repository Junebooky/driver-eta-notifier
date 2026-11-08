import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  getDriverVehicleBundle,
  getLatestDispatchLogForBooking,
  recordInfoDispatchLog,
} from '@/lib/assets/driverAssetServerStore';
import { resolveRegisteredFleetVehicle } from '@/lib/fleet/resolveRegisteredVehicle';
import { hydrateRawScheduleRow, encodeScheduleMeta } from '@/lib/dispatch/scheduleServerStore';
import type { CockpitAuthSession } from '@/lib/auth/serverAuth';

async function loadBooking(bookingId: string, session: CockpitAuthSession) {
  const { data, error } = await supabaseAdmin.from('schedules').select('*').eq('id', bookingId).maybeSingle();
  if (error) return { response: NextResponse.json({ ok: false, error: '예약 정보를 확인하지 못했습니다.' }, { status: 503 }) };
  if (!data || (data.org_id && data.org_id !== session.org)) {
    return { response: NextResponse.json({ ok: false, error: '예약을 찾을 수 없습니다.' }, { status: 404 }) };
  }
  return { row: data, booking: hydrateRawScheduleRow(data) };
}


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

    if (typeof vehiclePlate !== 'string' || !vehiclePlate || vehiclePlate === '미배정' || vehiclePlate === '-') {
      return NextResponse.json(
        { ok: false, error: '배차 미확정: 차량이 배정되지 않아 고객 안내자료를 발송할 수 없습니다.' },
        { status: 400 }
      );
    }

    if (!['manual_copy', 'email', 'download'].includes(channel) ||
        typeof recipient !== 'string' || typeof notes !== 'string') {
      return NextResponse.json({ ok: false, error: '자료 전달 방식과 수신처를 확인해 주세요.' }, { status: 400 });
    }
    const isPreparedOnly = payload.status === 'prepared' || payload.isPreparationOnly === true || channel === 'download';
    // This endpoint records an operator's action; it does not send email/SMS.
    if (!isPreparedOnly && (payload.manualDeliveryConfirmed !== true || !recipient.trim())) {
      return NextResponse.json({ ok: false, error: '실제 수신처에 직접 전달했는지 확인해야 수동 발송을 기록할 수 있습니다.' }, { status: 400 });
    }
    const loaded = await loadBooking(bookingId, auth.session);
    if (loaded.response) return loaded.response;
    const { row, booking } = loaded;
    if (booking.dispatch_status !== 'published' || booking._meta.serviceMode === 'vehicle_only' ||
        !booking.driver_id || !booking.vehicle_id || !row.updated_at) {
      return NextResponse.json({ ok: false, error: '기사·차량이 확정된 최신 배차만 안내자료를 기록할 수 있습니다.' }, { status: 409 });
    }
    const org = auth.session.org;
    const canonicalPlate = booking._meta.vehiclePlate || row.vehicle_plate || row.vehicle_no || '';
    // Reject stale/mismatched requests before touching the fleet registry.
    // A changed schedule is always a version conflict (409), not a DB failure.
    if (driverId !== booking.driver_id ||
        vehiclePlate.replace(/\s+/g, '') !== canonicalPlate.replace(/\s+/g, '') ||
        (vehicleId && vehicleId !== booking.vehicle_id) || payload.expectedVersion !== booking.version) {
      return NextResponse.json({ ok: false, error: '배차가 변경되었습니다. 최신 기사·차량과 버전을 다시 확인해 주세요.' }, { status: 409 });
    }
    const effVehicle = await resolveRegisteredFleetVehicle(canonicalPlate);
    if (booking.vehicle_id !== effVehicle.uuid) {
      return NextResponse.json({ ok: false, error: '현재 배차의 차량 식별자가 등록부와 일치하지 않습니다.' }, { status: 409 });
    }

    // Verify Info asset existence for this (driver, vehicle) pair
    const bundle = await getDriverVehicleBundle(driverId, effVehicle.uuid, effVehicle.model, org, effVehicle);

    if (!bundle.isReadyForCustomerDispatch) {
      return NextResponse.json(
        {
          ok: false,
          error: `Info 미등록: [${bundle.driverName || driverName} × ${effVehicle.model}(${effVehicle.plate})] 조합의 PC/Mobile 안내자료가 아직 등록되지 않았습니다. 먼저 안내자료를 등록해주세요.`,
        },
        { status: 400 }
      );
    }

    const brochureStatus = isPreparedOnly ? ('준비완료' as const) : ('수동 발송 기록' as const);
    const snapshotStatus = isPreparedOnly ? ('prepared' as const) : ('manual_recorded' as const);

    const now = new Date(Math.max(Date.now(), new Date(row.updated_at).getTime() + 1)).toISOString();
    const snapshot = {
      bookingId,
      driverId,
      driverName: bundle.driverName || booking.driver_name || booking._meta.driverName || '담당 기사',
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
      channel,
      recipient: recipient.trim() || (isPreparedOnly ? '본사 다운로드' : '고객사 담당자'),
      status: snapshotStatus,
      scheduleVersion: booking.version,
      deliveryEvidence: isPreparedOnly ? ('prepared' as const) : ('operator_attested' as const),
    };

    const logRecord = await recordInfoDispatchLog({
      organizationId: org,
      bookingId,
      driverId,
      driverName: bundle.driverName || booking.driver_name || booking._meta.driverName || '담당 기사',
      vehicleId: effVehicle.uuid,
      vehiclePlate: effVehicle.plate,
      vehicleModel: effVehicle.model,
      profileAssetId: bundle.profile?.id || null,
      pcInfoAssetId: bundle.pcInfo?.id || null,
      mobileInfoAssetId: bundle.mobileInfo?.id || null,
      channel,
      recipient: recipient.trim() || (isPreparedOnly ? '본사 다운로드' : '고객사 담당자'),
      dispatchedBy: auth.session.displayName || '본사 관리자',
      dispatchedAt: now,
      snapshot,
      notes: notes || undefined,
    });

    // The log is authoritative. A failed/concurrent schedule update is reported explicitly.
    const nextMeta = {
      ...booking._meta,
      customerBrochure: brochureStatus,
      customer_brochure_snapshot: snapshot,
      customer_brochure_recorded_at: now,
    };
    let scheduleSynced = false;
    try {
      let update = supabaseAdmin.from('schedules').update({
        schedule_meta: nextMeta,
        passenger_note: encodeScheduleMeta(nextMeta),
        updated_at: now,
      }).eq('id', bookingId).eq('updated_at', row.updated_at);
      update = row.org_id ? update.eq('org_id', org) : update.is('org_id', null);
      const { data: synced, error: syncError } = await update.select('id').maybeSingle();
      scheduleSynced = !syncError && Boolean(synced);
    } catch {
      // The durable log still exists; do not report this as a missing delivery record.
    }

    return NextResponse.json({
      ok: true,
      log: logRecord,
      snapshot,
      brochureStatus,
      scheduleSynced,
      warning: scheduleSynced ? undefined : '자료 기록은 보존했지만 일정 상태 반영을 확인하지 못했습니다. 재발송하지 말고 최신 배차와 기록을 새로고침해 확인해 주세요.',
      message: isPreparedOnly
        ? '고객사 안내자료 준비 상태가 기록되었습니다. 실제 발송은 하지 않았습니다.'
        : '직접 전달한 수동 발송 기록이 보존되었습니다. 서버 이메일 발송이나 고객 수신 확인을 뜻하지 않습니다.',
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '발송 기록 중 오류가 발생했습니다.' },
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
    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: '예약 식별자(bookingId)가 필요합니다.' },
        { status: 400 }
      );
    }

    const loaded = await loadBooking(bookingId, auth.session);
    if (loaded.response) return loaded.response;
    const currentDriverId = loaded.booking.driver_id;
    const currentVehicleId = loaded.booking.vehicle_id;
    const currentVehiclePlate = loaded.booking._meta.vehiclePlate || loaded.row.vehicle_plate || loaded.row.vehicle_no;
    const org = auth.session.org;
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

      const versionDiff = snap.scheduleVersion !== undefined && snap.scheduleVersion !== loaded.booking.version;
      if (driverDiff || vehicleDiff || !currentDriverId || currentVehicleId !== snap.vehicleId ||
          loaded.booking.dispatch_status !== 'published' || versionDiff) {
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
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '발송 내역 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

