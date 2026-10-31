import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth, requireHqAdmin } from '@/lib/auth/serverAuth';
import { normalizeDateToIso,normalizeTimeHHmm } from '@/utils/dispatchConflictDetector';
import { HqDrivingLog, HqDrivingLogStatus } from '@/types/drivingLogHq';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUuid(val: any): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

function formatOdoNum(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9]/g, '');
  return parseInt(cleaned, 10) || 0;
}

function formatKmDisplay(val: any): string {
  const n = formatOdoNum(val);
  return n > 0 ? n.toLocaleString() : '';
}

/**
 * Maps DB row from cockpit.driving_logs to frontend HqDrivingLog interface
 */
export function mapDbRowToDrivingLog(row: any, index: number = 1): HqDrivingLog {
  const rawDate = row.driving_date || new Date().toISOString().split('T')[0];
  const dateParts = rawDate.split('-');
  const drivingDate = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : rawDate;

  const startKmNum = formatOdoNum(row.start_km);
  const endKmNum = formatOdoNum(row.end_km);
  const distNum = formatOdoNum(row.distance_km) || Math.max(0, endKmNum - startKmNum);

  return {
    id: row.id,
    no: index,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toLocaleString('ko-KR') : '',
    submittedDate: row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('ko-KR') : '',
    drivingDate,
    rawDate,
    driverName: row.driver_name,
    passengerCount: row.passenger_count ?? undefined,
    customerName: row.customer_name || '미지정 고객',
    vehicleModel: row.vehicle_model || '법인 차량',
    vehiclePlate: row.vehicle_plate || '',
    clockIn: row.clock_in ? String(row.clock_in).slice(0, 5) : '',
    clockOut: row.clock_out ? String(row.clock_out).slice(0, 5) : '',
    garageDepartureTime: row.garage_departure_time ? String(row.garage_departure_time).slice(0, 5) : undefined,
    customerServiceStart: row.customer_service_start ? String(row.customer_service_start).slice(0, 5) : undefined,
    customerServiceEnd: row.customer_service_end ? String(row.customer_service_end).slice(0, 5) : undefined,
    garageArrivalTime: row.garage_arrival_time ? String(row.garage_arrival_time).slice(0, 5) : undefined,
    totalDutyHours: row.total_duty_hours || '',
    startKm: formatKmDisplay(startKmNum),
    endKm: formatKmDisplay(endKmNum),
    distanceKm: distNum > 0 ? `${distNum.toLocaleString()} km` : '',
    expenseAmount: Number(row.expense_amount) || 0,
    expenseCount: Number(row.expense_count) || 0,
    status: (row.status as HqDrivingLogStatus) || '검토 대기',
    stops: Array.isArray(row.stops) ? row.stops : [],
    notes: row.notes || '',
    reviewHistory: Array.isArray(row.review_history) ? row.review_history : [],
    isDriverSubmitted: Boolean(row.submitted_at),
    bookingId: row.booking_id,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    eventId: row.event_id,
    eventName: row.event_name,
  };
}

/**
 * GET: Query driving logs
 * Drivers can only query their own logs.
 * HQ Admins can query all logs within their organization.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');
    const requestedDriverId = searchParams.get('driverId');
    const date = searchParams.get('date');
    const status = searchParams.get('status');

    // Organization-level isolation: Always enforce current session's organization
    let query = supabaseAdmin
      .from('driving_logs')
      .select('*')
      .eq('organization_id', auth.session.org);

    if (auth.session.role === 'driver') {
      const myDriverId = auth.session.driverId || auth.session.userId;
      // Reject if driver attempts to query another driver's ID
      if (requestedDriverId && requestedDriverId !== myDriverId) {
        return NextResponse.json(
          { ok: false, error: '다른 기사의 운행일지 목록을 조회할 수 없습니다. (403 Forbidden)' },
          { status: 403 }
        );
      }
      query = query.eq('driver_id', myDriverId);
    } else {
      // HQ Admin can optionally filter by driverId
      if (requestedDriverId) {
        query = query.eq('driver_id', requestedDriverId);
      }
    }

    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }
    if (date) {
      query = query.eq('driving_date', date);
    }
    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('driving_date', { ascending: false }).order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[DrivingLogs GET] DB Query error:', error.message);
      return NextResponse.json(
        { ok: false, error: `운행일지 목록 조회 실패: ${error.message}` },
        { status: 500 }
      );
    }

    const logs: HqDrivingLog[] = (data || []).map((row: any, idx: number) => mapDbRowToDrivingLog(row, idx + 1));

    return NextResponse.json({
      ok: true,
      logs,
    });
  } catch (err: any) {
    console.error('[DrivingLogs GET] Internal server error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * POST: Create or submit a driving log
 * Validates inputs and strictly enforces driver identity, organization, and schedule assignment.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const {
      id,
      bookingId,
      driverId,
      driverName,
      vehicleId,
      vehiclePlate,
      vehicleModel,
      customerName,
      customerId,
      drivingDate,
      clockIn,
      clockOut,
      garageDepartureTime,
      customerServiceStart,
      customerServiceEnd,
      garageArrivalTime,
      totalDutyHours,
      startKm,
      endKm,
      stops,
      notes,
      status = '검토 대기',
    } = body;

    if(!normalizeDateToIso(drivingDate))return NextResponse.json({ok:false,error:'운행 날짜를 확인해 주세요.'},{status:400});
    if((clockIn && !normalizeTimeHHmm(clockIn)) || (clockOut && !normalizeTimeHHmm(clockOut)))return NextResponse.json({ok:false,error:'출퇴근 시간을 확인해 주세요.'},{status:400});
    // 1. Role & Identity Enforcement
    const effectiveDriverId = auth.session.role==='driver' ? auth.session.driverId || auth.session.userId : driverId;
    if(!isValidUuid(effectiveDriverId))return NextResponse.json({ok:false,error:'실제 기사 UUID가 필요합니다.'},{status:400});
    const effectiveDriverName = (auth.session.driverName || driverName || '담당 기사').trim();

    if (auth.session.role === 'driver') {
      // Driver cannot submit on behalf of another driverId
      if (driverId && driverId !== effectiveDriverId) {
        return NextResponse.json(
          { ok: false, error: '다른 기사의 식별자(driverId)로 운행일지를 작성할 수 없습니다. (403 Forbidden)' },
          { status: 403 }
        );
      }
      // Driver cannot self-approve or reject
      if (status && status !== 'draft' && status !== '검토 대기' && status !== 'submitted') {
        return NextResponse.json(
          { ok: false, error: '기사는 승인 완료 또는 반려 상태를 직접 지정할 수 없습니다. (403 Forbidden)' },
          { status: 403 }
        );
      }
    }

    // 2. Ownership verification when updating existing log
    if (id && isValidUuid(id)) {
      const { data: existingLog, error: existErr } = await supabaseAdmin
        .from('driving_logs')
        .select('id, driver_id, organization_id, status, booking_id, driving_date')
        .eq('id', id)
        .maybeSingle();

      if (existErr) {
        return NextResponse.json(
          { ok: false, error: `기존 운행일지 검증 실패: ${existErr.message}` },
          { status: 500 }
        );
      }

      if (existingLog) {
        if((existingLog.booking_id || null)!==(bookingId || null) || existingLog.driving_date!==drivingDate)return NextResponse.json({ok:false,error:'다른 날짜·예약은 별도 운행일지로 기록해 주세요.'},{status:409});
        if(status==='draft' && existingLog.status!=='draft')return NextResponse.json({ok:false,error:'이미 제출한 일지를 임시 저장으로 변경할 수 없습니다.'},{status:409});
        // Must belong to same organization
        if (existingLog.organization_id !== auth.session.org) {
          return NextResponse.json(
            { ok: false, error: '다른 조직의 운행일지를 수정할 수 없습니다. (403 Forbidden)' },
            { status: 403 }
          );
        }
        // Driver can only edit their own records
        if (auth.session.role === 'driver') {
          if (existingLog.driver_id !== effectiveDriverId) {
            return NextResponse.json(
              { ok: false, error: '다른 기사의 운행일지를 수정할 권한이 없습니다. (403 Forbidden)' },
              { status: 403 }
            );
          }
          if (existingLog.status === '승인 완료' || existingLog.status === '검토 중') {
            return NextResponse.json(
              { ok: false, error: '이미 승인되었거나 검토 중인 운행일지는 수정할 수 없습니다. (403 Forbidden)' },
              { status: 403 }
            );
          }
        }
      }
    }

    // 3. Validation for submission
    const isSubmitting = status === '검토 대기' || status === 'submitted';
    const startKmNum = formatOdoNum(startKm);
    const endKmNum = formatOdoNum(endKm);

    if (isSubmitting) {
      if (!drivingDate) {
        return NextResponse.json(
          { ok: false, error: '운행일자(drivingDate)는 필수 입력 항목입니다.' },
          { status: 400 }
        );
      }
      if (startKmNum <= 0) {
        return NextResponse.json(
          { ok: false, error: '시작 계기판 거리(startKm)를 올바르게 입력해주세요.' },
          { status: 400 }
        );
      }
      if (endKmNum > 0 && endKmNum < startKmNum) {
        return NextResponse.json(
          { ok: false, error: '종료 거리는 시작 거리보다 작을 수 없습니다.' },
          { status: 400 }
        );
      }
      if (!Array.isArray(stops) || stops.length === 0) {
        return NextResponse.json(
          { ok: false, error: '운행 경로(stops)를 최소 1개 이상 등록해주세요.' },
          { status: 400 }
        );
      }
    }

    let verifiedSchedule: {vehicle_id?:string;vehicle_plate?:string;customer_id?:string;customer_name?:string;schedule_meta?:{vehicleModel?:string;vehiclePlate?:string;customerId?:string;customerName?:string}}|null=null;
    // 4. Verify bookingId and driver schedule assignment
    if (bookingId) {
      const { data: scheduleRow, error: schedErr } = await supabaseAdmin
        .from('schedules')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle();

      if (schedErr) {
        return NextResponse.json(
          { ok: false, error: `예약 정보 DB 조회 실패: ${schedErr.message}` },
          { status: 500 }
        );
      }

      if (!scheduleRow) {
        return NextResponse.json(
          { ok: false, error: `연결 대상 예약(bookingId: ${bookingId})을 찾을 수 없습니다.` },
          { status: 400 }
        );
      }

      if(scheduleRow.schedule_meta?.serviceMode==='vehicle_only' || ['draft','unassigned','cancelled'].includes(scheduleRow.dispatch_status))return NextResponse.json({ok:false,error:'현재 기사 운행으로 배정된 예약만 연결할 수 있습니다.'},{status:403});
      verifiedSchedule=scheduleRow;
      // If requester is a driver, verify that this booking is strictly assigned to their driver_id
      if (auth.session.role === 'driver') {
        const schedMetaDriverId = scheduleRow.driver_id || scheduleRow.schedule_meta?.driverId || scheduleRow.schedule_meta?.driver_id;
        if (!schedMetaDriverId || schedMetaDriverId !== effectiveDriverId) {
          return NextResponse.json(
            { ok: false, error: '본인에게 배정되지 않았거나 기사 식별자(UUID)가 확정되지 않은 예약입니다. (403 Forbidden)' },
            { status: 403 }
          );
        }
      }
    }

    const calculatedDist = endKmNum >= startKmNum && endKmNum>0 ? endKmNum - startKmNum : 0;
    const nowIso = new Date().toISOString();

    // Resolve the same logical report across devices, reconnects and navigation drafts.
    let lookup=supabaseAdmin.from('driving_logs').select('id, stops, status').eq('organization_id',auth.session.org).eq('driver_id',effectiveDriverId).eq('driving_date',drivingDate);
    lookup=bookingId?lookup.eq('booking_id',bookingId):lookup.is('booking_id',null);
    const previous=await lookup.maybeSingle();
    if(previous.error)return NextResponse.json({ok:false,error:'기존 운행일지 확인에 실패했습니다.'},{status:503});
    const existing=previous.data;
    if(existing && auth.session.role==='driver' && ['승인 완료','검토 중'].includes(existing.status))return NextResponse.json({ok:false,error:'이미 검토 중이거나 승인된 운행일지입니다.'},{status:403});
    if(existing && status==='draft' && existing.status!=='draft')return NextResponse.json({ok:false,error:'이미 제출한 일지를 임시 저장으로 변경할 수 없습니다.'},{status:409});
    const targetRowId=existing?.id || (isValidUuid(id)?id:crypto.randomUUID());
    // A background navigation append preserves stops; a deliberate final edit may delete/reorder them.
    const existingDraftStops = status==='draft' && Array.isArray(existing?.stops)?existing.stops:[];

    // Merge stops deduplicating by id or actionIdempotencyKey
    const incomingStops = Array.isArray(stops) ? stops : [];
    const mergedStops = [...existingDraftStops];
    for (const stop of incomingStops) {
      const exists = mergedStops.some(
        (m) =>
          (m.id && stop.id && m.id === stop.id) ||
          (m.actionIdempotencyKey && stop.actionIdempotencyKey && m.actionIdempotencyKey === stop.actionIdempotencyKey)
      );
      if (!exists) {
        mergedStops.push(stop);
      }
    }

    const insertPayload: Record<string, any> = {
      id: targetRowId,
      organization_id: auth.session.org,
      booking_id: bookingId || null,
      driver_id: effectiveDriverId,
      driver_name: effectiveDriverName,
      vehicle_id: verifiedSchedule?.vehicle_id || vehicleId || null,
      vehicle_plate: verifiedSchedule?.vehicle_plate || verifiedSchedule?.schedule_meta?.vehiclePlate || vehiclePlate || auth.session.carNumber || '',
      vehicle_model: verifiedSchedule?.schedule_meta?.vehicleModel || vehicleModel || '',
      customer_id: verifiedSchedule?.customer_id || verifiedSchedule?.schedule_meta?.customerId || customerId || null,
      customer_name: verifiedSchedule?.customer_name || verifiedSchedule?.schedule_meta?.customerName || customerName || '',
      driving_date: drivingDate || new Date().toISOString().split('T')[0],
      clock_in: clockIn || null,
      clock_out: clockOut || null,
      garage_departure_time: garageDepartureTime || null,
      customer_service_start: customerServiceStart || null,
      customer_service_end: customerServiceEnd || null,
      garage_arrival_time: garageArrivalTime || null,
      total_duty_hours: totalDutyHours || '',
      start_km: startKmNum,
      end_km: endKmNum,
      distance_km: calculatedDist,
      stops: mergedStops.length > 0 ? mergedStops : incomingStops,
      notes: notes || '',
      passenger_count: Number.isInteger(body.passengerCount) && body.passengerCount>=0 ? body.passengerCount : null,
      expense_amount: 0,
      expense_count: 0,
      status: isSubmitting ? '검토 대기' : 'draft',
      submitted_at: isSubmitting ? nowIso : null,
      submitted_by: isSubmitting ? (auth.session.displayName || auth.session.driverName || '기사') : null,
      updated_at: nowIso,
    };

    // Insert or update in cockpit.driving_logs
    const { data: savedRow, error: saveErr } = await supabaseAdmin
      .from('driving_logs')
      .upsert(insertPayload, { onConflict: 'id' })
      .select('*')
      .single();

    if (saveErr) {
      console.error('[DrivingLogs POST] DB Save Error:', saveErr);
      return NextResponse.json(
        { ok: false, error: `데이터베이스 저장 실패: ${saveErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      log: mapDbRowToDrivingLog(savedRow),
      message: isSubmitting ? '운행일지가 성공적으로 제출되었습니다.' : '임시 저장되었습니다.',
    });
  } catch (err: any) {
    console.error('[DrivingLogs POST] Internal error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || '운행일지 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * PUT: HQ Admin Review & Status Mutation
 * Requires HQ Admin authentication.
 * Verifies organization ownership and records immutable audit history.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json().catch(() => ({}));
    const { id, status, reviewNotes, patch } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: '수정할 운행일지 ID(id)가 필요합니다.' },
        { status: 400 }
      );
    }

    // Fetch existing row to verify organization ownership and preserve review history
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('driving_logs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json(
        { ok: false, error: `DB 조회 실패: ${findErr.message}` },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `해당 운행일지(${id})를 찾을 수 없습니다.` },
        { status: 404 }
      );
    }

    // Enforce organization boundary
    if (existing.organization_id !== auth.session.org) {
      return NextResponse.json(
        { ok: false, error: '해당 조직의 운행일지를 수정할 권한이 없습니다. (403 Forbidden)' },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const actor = auth.session.displayName || auth.session.driverName || '본사 관리자';
    const prevHistory = Array.isArray(existing.review_history) ? existing.review_history : [];

    let actionType: 'approved' | 'revision_requested' | 'rejected' | 'submission' = 'approved';
    let auditMessage = `관리자(${actor})가 승인 완료 처리했습니다.`;

    if (status === '보완 필요') {
      actionType = 'revision_requested';
      auditMessage = reviewNotes ? `보완 요청: ${reviewNotes}` : '추가 확인이 필요하여 보완 요청을 보냈습니다.';
    } else if (status === '반려') {
      actionType = 'rejected';
      auditMessage = reviewNotes ? `반려 사유: ${reviewNotes}` : '관리자에 의해 반려 처리되었습니다.';
    } else if (status === '승인 완료') {
      actionType = 'approved';
      auditMessage = reviewNotes ? `승인 완료: ${reviewNotes}` : '검토 후 승인 완료되었습니다.';
    } else if (patch) {
      actionType = 'submission';
      auditMessage = `${actor}가 운행일지 데이터를 수정했습니다.`;
    }

    const newAuditEntry = {
      id: `audit-${Date.now()}`,
      time: new Date().toLocaleString('ko-KR'),
      message: auditMessage,
      actor,
      actionType,
    };

    const updatePayload: Record<string, any> = {
      review_history: [newAuditEntry, ...prevHistory],
      updated_at: nowIso,
    };

    if (status) {
      updatePayload.status = status;
      updatePayload.reviewed_at = nowIso;
      updatePayload.reviewed_by = actor;
      if (reviewNotes !== undefined) updatePayload.review_notes = reviewNotes;
    }

    if (patch && typeof patch === 'object') {
      if (patch.customerServiceStart !== undefined) updatePayload.customer_service_start = patch.customerServiceStart;
      if (patch.customerServiceEnd !== undefined) updatePayload.customer_service_end = patch.customerServiceEnd;
      if (patch.garageDepartureTime !== undefined) updatePayload.garage_departure_time = patch.garageDepartureTime;
      if (patch.garageArrivalTime !== undefined) updatePayload.garage_arrival_time = patch.garageArrivalTime;
      if (patch.notes !== undefined) updatePayload.notes = patch.notes;
      if (patch.stops !== undefined) updatePayload.stops = patch.stops;
    }

    const { data: updatedRow, error: updateErr } = await supabaseAdmin
      .from('driving_logs')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: `DB 수정 실패: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      log: mapDbRowToDrivingLog(updatedRow),
      message: '운행일지 상태가 성공적으로 갱신되었습니다.',
    });
  } catch (err: any) {
    console.error('[DrivingLogs PUT] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || '상태 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
