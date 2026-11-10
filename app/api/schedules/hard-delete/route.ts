import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isNamedOperationalCustomer, normalizeOperationalCustomerName } from '@/utils/hqOperationsCustomerGroups';

/**
 * Explicit administrator removal from active dispatch, not a cancellation notice.
 * A deleted schedule is retained as a non-active tombstone for foreign-key
 * integrity: work logs, expenses, issued settlements and custody histories
 * remain intact, while driver/calendar queries never return deleted rows.
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
    const scope = payload?.scope === 'event' ? 'event' : payload?.scope === 'booking' ? 'booking' : payload?.scope === 'customer' ? 'customer' : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        || !scope || payload?.confirm !== true) {
      return NextResponse.json({ ok: false, error: '삭제할 일정과 삭제 범위 및 확인 동작을 지정해 주세요.' }, { status: 400 });
    }

    const { data: anchor, error: anchorError } = await supabaseAdmin.from('schedules')
      .select('id, group_id, event_id, status, customer_name').eq('id', id).maybeSingle();
    if (anchorError) throw anchorError;
    if (!anchor || anchor.status === 'deleted') return NextResponse.json({ ok: false, error: '이미 삭제됐거나 존재하지 않는 배차입니다.' }, { status: 404 });

    let ids: string[];
    if (scope === 'customer') {
      // The customer card lists all its dispatches, even when it visually
      // collapses to five rows. Delete exactly those IDs, not just the first
      // driver's groupId or unrelated historic/draft records.
      const suppliedIds: unknown = payload?.scheduleIds;
      if (!Array.isArray(suppliedIds) || suppliedIds.length < 1 || suppliedIds.length > 100 ||
        !suppliedIds.every(value => typeof value === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) {
        return NextResponse.json({ ok: false, error: '고객사 배차 목록이 올바르지 않습니다.' }, { status: 400 });
      }
      ids = [...new Set(suppliedIds as string[])];
      if (!ids.includes(id) || !isNamedOperationalCustomer(anchor.customer_name)) {
        return NextResponse.json({ ok: false, error: '고객사 연결 정보를 확인해 주세요.' }, { status: 409 });
      }
      const { data: targets, error: targetError } = await supabaseAdmin.from('schedules')
        .select('id, customer_name, dispatch_status, status').in('id', ids);
      if (targetError) throw targetError;
      const normalized = normalizeOperationalCustomerName(anchor.customer_name);
      if (!targets || targets.length !== ids.length || !targets.every(item =>
        normalizeOperationalCustomerName(item.customer_name) === normalized &&
        item.dispatch_status === 'published' && item.status !== 'deleted')) {
        return NextResponse.json({
          ok: false,
          error: '삭제 대상의 고객사 또는 배차 상태가 달라졌습니다. 운영보드를 새로고침하고 다시 확인해 주세요.',
        }, { status: 409 });
      }
    } else {
      // Keep existing single-booking and saved-event deletion semantics.
      let targetQuery = supabaseAdmin.from('schedules').select('id, status');
      if (scope === 'event' && anchor.group_id) {
        targetQuery = targetQuery.eq('group_id', anchor.group_id);
      } else if (scope === 'event' && anchor.event_id) {
        targetQuery = targetQuery.eq('event_id', anchor.event_id);
      } else {
        targetQuery = targetQuery.eq('id', id);
      }
      const { data: targets, error: targetError } = await targetQuery;
      if (targetError) throw targetError;
      ids = [...new Set((targets || []).filter(row => row.status !== 'deleted').map(row => row.id))];
    }
    if (!ids.length || ids.length > 100) {
      return NextResponse.json({ ok: false, error: '삭제 대상 일정이 없거나 100건을 초과합니다.' }, { status: 409 });
    }

    // A real SQL DELETE would fail on the settlement/custody FK constraints.
    // Archive ALL selected rows in ONE statement instead. No linked operational
    // records are deleted or orphaned, and no extra data-destructive requests are
    // made. The cancelled dispatch status releases the active assignment; status
    // 'deleted' prevents even cancellation-history views from showing the row.
    // Preserve the original driver/vehicle IDs on the tombstone for custody audit.
    const { data: removedRows, error: removeError } = await supabaseAdmin
      .from('schedules')
      .update({ status: 'deleted', dispatch_status: 'cancelled', updated_at: new Date().toISOString() })
      .in('id', ids)
      .select('id');
    if (removeError) throw removeError;
    const removed = removedRows?.length || 0;
    if (removed !== ids.length) {
      return NextResponse.json({
        ok: false, error: '일정이 동시에 변경됐습니다. 서버 목록을 새로고침해 삭제 상태를 확인해 주세요.',
        deletedCount: removed,
      }, { status: 409 });
    }

    return NextResponse.json({ ok: true, deletedCount: removed, deletedScheduleIds: ids, assignmentsReleased: true, operationalRecordsPreserved: true });
  } catch (error: unknown) {
    console.error('HQ hard delete failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ok: false, error: '삭제에 실패했습니다. 서버 상태를 다시 확인해 주세요.' }, { status: 500 });
  }
}
