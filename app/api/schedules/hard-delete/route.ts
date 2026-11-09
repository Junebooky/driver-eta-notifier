import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * Explicit hard delete, never a cancellation/status change.
 * HQ only. Related driving logs, expenses, settlement and custody records
 * are protected instead of being accidentally unlinked/deleted.
 *
 * A group delete resolves the entire saved group from the database, not the
 * partial set of vehicles currently visible in the operations filter.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });

    const payload = await req.json().catch(() => null);
    const id = typeof payload?.scheduleId === 'string' ? payload.scheduleId : '';
    const scope = payload?.scope === 'event' ? 'event' : payload?.scope === 'booking' ? 'booking' : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        || !scope || payload?.confirm !== true) {
      return NextResponse.json({ ok: false, error: '삭제할 일정과 삭제 범위 및 확인 동작을 지정해 주세요.' }, { status: 400 });
    }

    const { data: anchor, error: anchorError } = await supabaseAdmin.from('schedules')
      .select('id, group_id, event_id, status').eq('id', id).maybeSingle();
    if (anchorError) throw anchorError;
    if (!anchor) return NextResponse.json({ ok: false, error: '이미 삭제됐거나 존재하지 않는 배차입니다.' }, { status: 404 });

    // When the operations board groups cars into a named event, the server
    // selects ALL its schedules (including other filtered states).
    let targetQuery = supabaseAdmin.from('schedules').select('id');
    if (scope === 'event' && anchor.group_id) {
      targetQuery = targetQuery.eq('group_id', anchor.group_id);
    } else if (scope === 'event' && anchor.event_id) {
      targetQuery = targetQuery.eq('event_id', anchor.event_id);
    } else {
      targetQuery = targetQuery.eq('id', id);
    }
    const { data: targets, error: targetError } = await targetQuery;
    if (targetError) throw targetError;
    const ids = [...new Set((targets || []).map(row => row.id))];
    if (!ids.length || ids.length > 100) {
      return NextResponse.json({ ok: false, error: '삭제 대상 일정이 없거나 100건을 초과합니다.' }, { status: 409 });
    }

    // Refuse destructive changes to recorded work, financial or custody trails.
    // Driver dispatch-info notices are intentionally cleaned by the FK cascade;
    // they contain only the dispatched booking's communication state.
    const protectedRefs = [
      ['driving_logs', 'booking_id'],
      ['expenses', 'booking_id'],
      ['settlement_documents', 'schedule_id'],
      ['driving_log_booking_link_audit', 'booking_id'],
      ['vehicle_custodies', 'booking_id'],
      ['vehicle_custody_requests', 'booking_id'],
    ] as const;

    for (const [table, foreignKey] of protectedRefs) {
      const { data, error } = await supabaseAdmin.from(table).select(foreignKey).in(foreignKey, ids).limit(1);
      if (error) throw error;
      if (data?.length) {
        return NextResponse.json({
          ok: false,
          code: 'BOOKING_HAS_OPERATIONAL_RECORDS',
          error: '운행일지·경비·정산 또는 차량 인수 기록이 연결돼 있습니다. 업무 기록을 보존하기 위해 삭제할 수 없습니다. 관리자에게 확인해 주세요.',
        }, { status: 409 });
      }
    }

    // Single database delete statement removes all selected schedules.
    // Availability derives from active schedule rows, so vehicles/drivers become
    // bookable again; we never delete their permanent profile or fleet record.
    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from('schedules').delete().in('id', ids).select('id');
    if (deleteError) throw deleteError;
    const removed = deleted?.length || 0;
    if (removed !== ids.length) {
      return NextResponse.json({
        ok: false, error: '일정이 동시에 변경됐습니다. 서버 목록을 새로고침해 삭제 상태를 확인해 주세요.',
        deletedCount: removed,
      }, { status: 409 });
    }

    return NextResponse.json({ ok: true, deletedCount: removed, deletedScheduleIds: ids, assignmentsReleased: true });
  } catch (error: unknown) {
    console.error('HQ hard delete failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ok: false, error: '삭제에 실패했습니다. 서버 상태를 다시 확인해 주세요.' }, { status: 500 });
  }
}
