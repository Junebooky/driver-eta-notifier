import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { cleanDriverIdentity, cleanVehicleIdentity } from '@/utils/dispatchConflictDetector';

export const dynamic = 'force-dynamic';

export type OperationStatus = 'ready' | 'arrived_pickup' | 'boarded' | 'in_transit' | 'completed';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scheduleId, status, changedBy, role, note } = body;

    if (!scheduleId || !status) {
      return NextResponse.json({ ok: false, error: 'scheduleId and status are required' }, { status: 400 });
    }

    const validStatuses: OperationStatus[] = ['ready', 'arrived_pickup', 'boarded', 'in_transit', 'completed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ ok: false, error: `Invalid operation status: ${status}` }, { status: 400 });
    }

    // 1. Fetch current schedule to verify authorization and lifecycle state
    const { data: currentSchedule, error: fetchErr } = await supabaseAdmin
      .from('schedules')
      .select('id, operation_status, operation_history, driver_name, vehicle_no, vehicle_plate, dispatch_status, status')
      .eq('id', scheduleId)
      .maybeSingle();

    if (fetchErr || !currentSchedule) {
      return NextResponse.json({ ok: false, error: fetchErr?.message || '배차 일정을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Protection 1: Block status changes on cancelled schedules
    if (currentSchedule.dispatch_status === 'cancelled' || currentSchedule.status === 'cancelled') {
      return NextResponse.json({ ok: false, error: '취소된 배차의 운행 상태는 변경할 수 없습니다.' }, { status: 400 });
    }

    // Protection 2: Ensure only the assigned driver (or verified HQ admin) can update operation status
    const isHqAdmin = role === 'hq' || changedBy === 'hq' || changedBy === '본사 관리자' || changedBy === '대표님';
    const assignedDriver = cleanDriverIdentity(currentSchedule.driver_name);
    const reqDriver = cleanDriverIdentity(changedBy);

    if (!isHqAdmin && assignedDriver && reqDriver && assignedDriver !== reqDriver) {
      return NextResponse.json(
        { ok: false, error: `배정된 담당 기사(${currentSchedule.driver_name})만 운행 상태를 변경할 수 있습니다.` },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const existingHistory = Array.isArray(currentSchedule.operation_history)
      ? currentSchedule.operation_history
      : [];

    const newHistoryEntry = {
      fromStatus: currentSchedule.operation_status || 'ready',
      toStatus: status,
      timestamp: nowIso,
      changedBy: changedBy || currentSchedule.driver_name || '담당 기사',
      note: note || '',
    };

    const updatedHistory = [...existingHistory, newHistoryEntry];

    // 2. Update schedule in Supabase
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('schedules')
      .update({
        operation_status: status,
        operation_updated_at: nowIso,
        operation_history: updatedHistory,
        updated_at: nowIso,
      })
      .eq('id', scheduleId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      scheduleId,
      operationStatus: status,
      operationUpdatedAt: nowIso,
      operationHistory: updatedHistory,
    });
  } catch (err: any) {
    console.error('[OperationStatus API] Error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
