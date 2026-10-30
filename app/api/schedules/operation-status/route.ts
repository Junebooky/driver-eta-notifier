import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { encodeScheduleMeta, hydrateRawScheduleRow } from '@/lib/dispatch/scheduleServerStore';
import { verifyServerAuth, driverCanAccessSchedule } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

export type OperationStatus = 'ready' | 'arrived_pickup' | 'boarded' | 'in_transit' | 'completed';

// Valid sequential transitions for drivers in operation lifecycle
const VALID_NEXT_STATUSES: Record<OperationStatus, OperationStatus[]> = {
  ready: ['arrived_pickup', 'boarded', 'in_transit'],
  arrived_pickup: ['boarded', 'in_transit'],
  boarded: ['in_transit', 'completed'],
  in_transit: ['completed'],
  completed: [], // terminal state
};

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const body = await req.json();
    const { scheduleId, status, note } = body;

    if (!scheduleId || !status) {
      return NextResponse.json({ ok: false, error: 'scheduleId and status are required' }, { status: 400 });
    }

    const validStatuses: OperationStatus[] = ['ready', 'arrived_pickup', 'boarded', 'in_transit', 'completed'];
    if (!validStatuses.includes(status as OperationStatus)) {
      return NextResponse.json({ ok: false, error: `Invalid operation status: ${status}` }, { status: 400 });
    }

    // 1. Fetch current schedule to verify authorization and lifecycle state
    const { data: currentSchedule, error: fetchErr } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .eq('id', scheduleId)
      .maybeSingle();

    if (fetchErr || !currentSchedule) {
      return NextResponse.json({ ok: false, error: fetchErr?.message || '배차 일정을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Protection 1: Block status changes on cancelled schedules
    if (currentSchedule.dispatch_status === 'cancelled' || currentSchedule.status === 'cancelled') {
      return NextResponse.json({ ok: false, error: '취소된 배차의 운행 상태는 변경할 수 없습니다.' }, { status: 400 });
    }

    // Protection 2: Server-verified Authorization (HQ Admin or assigned Driver ONLY)
    const isHqAdmin = auth.session.role === 'hq_admin';
    if (!isHqAdmin) {
      const allowed = driverCanAccessSchedule(auth.session, currentSchedule);
      if (!allowed) {
        return NextResponse.json(
          { ok: false, error: `본인에게 배정된 배차(${currentSchedule.driver_name})만 운행 상태를 변경할 수 있습니다.` },
          { status: 403 }
        );
      }

      // Protection 3: Validate sequential operation status transition for drivers
      const currentOpStatus = (currentSchedule.operation_status || 'ready') as OperationStatus;
      if (currentOpStatus === status) {
        // No-op or update note
      } else {
        const allowedNext = VALID_NEXT_STATUSES[currentOpStatus] || [];
        if (!allowedNext.includes(status as OperationStatus)) {
          return NextResponse.json(
            {
              ok: false,
              error: `유효하지 않은 운행 상태 전환입니다. (현재: ${currentOpStatus} → 요청: ${status}). 순차적으로 진행해주세요.`,
            },
            { status: 400 }
          );
        }
      }
    }

    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(currentSchedule.operation_history)
      ? currentSchedule.operation_history
      : [];

    const verifiedActorName = isHqAdmin
      ? '본사 관리자'
      : auth.session.driverName || currentSchedule.driver_name || '담당 기사';

    const newHistoryEntry = {
      fromStatus: currentSchedule.operation_status || 'ready',
      toStatus: status,
      timestamp: nowIso,
      changedBy: verifiedActorName,
      note: note || '',
    };

    const updatedHistory = [...existingHistory, newHistoryEntry];

    // Auto-prepare customer arrival message draft when transitioning to 'arrived_pickup' (never auto-sends)
    const hydrated = hydrateRawScheduleRow(currentSchedule);
    const shouldPrepareArrivalMsg =
      status === 'arrived_pickup' && currentSchedule.operation_status !== 'arrived_pickup';

    const nextMeta = shouldPrepareArrivalMsg
      ? {
          ...hydrated._meta,
          pendingCustomerTrigger: 'arrived_pickup' as const,
          pendingCustomerTriggeredAt: nowIso,
        }
      : hydrated._meta;

    const updatePayload: Record<string, any> = {
      operation_status: status,
      operation_updated_at: nowIso,
      operation_history: updatedHistory,
      updated_at: nowIso,
    };

    if (shouldPrepareArrivalMsg) {
      updatePayload.schedule_meta = nextMeta;
      updatePayload.passenger_note = encodeScheduleMeta(nextMeta);
    }

    if (status === 'completed') {
      updatePayload.status = 'completed';
    }

    // 2. Update schedule in Supabase
    const { error: updateErr } = await supabaseAdmin
      .from('schedules')
      .update(updatePayload)
      .eq('id', scheduleId);

    if (updateErr) {
      console.error('[OperationStatus API] Update error:', updateErr);
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      scheduleId,
      operationStatus: status,
      updatedAt: nowIso,
      changedBy: verifiedActorName,
      preparedCustomerAlert: shouldPrepareArrivalMsg,
    });
  } catch (err: any) {
    console.error('[OperationStatus API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
