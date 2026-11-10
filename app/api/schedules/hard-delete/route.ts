import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isNamedOperationalCustomer, normalizeOperationalCustomerName } from '@/utils/hqOperationsCustomerGroups';

const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type DeleteScope = 'booking' | 'event' | 'customer';
type DeleteMode = 'schedule_only' | 'include_drafts';

function failure(error: string, status: number) {
  return { ids: null, response: NextResponse.json({ ok: false, error }, { status }) };
}

/** Resolve exact server-owned IDs for both preview and confirmation. */
async function resolveIds(payload: Record<string, unknown> | null) {
  const id = typeof payload?.scheduleId === 'string' ? payload.scheduleId : '';
  const scope = payload?.scope as DeleteScope;
  if (!IS_UUID.test(id) || !['booking', 'event', 'customer'].includes(scope)) {
    return failure('삭제할 일정과 범위를 확인해 주세요.', 400);
  }

  const { data: anchor, error: anchorError } = await supabaseAdmin.from('schedules')
    .select('id, group_id, event_id, status, customer_name')
    .eq('id', id).maybeSingle();
  if (anchorError) throw anchorError;
  if (!anchor || anchor.status === 'deleted') {
    return failure('이미 삭제됐거나 존재하지 않는 배차입니다.', 404);
  }

  let ids: string[];
  if (scope === 'customer') {
    const supplied = payload?.scheduleIds;
    if (!Array.isArray(supplied) || supplied.length < 1 || supplied.length > 100 ||
        !supplied.every(value => typeof value === 'string' && IS_UUID.test(value))) {
      return failure('고객사 배차 목록이 올바르지 않습니다.', 400);
    }
    ids = [...new Set(supplied as string[])];
    if (!ids.includes(id) || !isNamedOperationalCustomer(anchor.customer_name)) {
      return failure('고객사 연결 정보를 확인해 주세요.', 409);
    }
    const { data: targets, error } = await supabaseAdmin.from('schedules')
      .select('id, customer_name, dispatch_status, status').in('id', ids);
    if (error) throw error;
    const normalized = normalizeOperationalCustomerName(anchor.customer_name);
    if (!targets || targets.length !== ids.length || !targets.every(item =>
      normalizeOperationalCustomerName(item.customer_name) === normalized &&
      item.dispatch_status === 'published' && item.status !== 'deleted')) {
      return failure('삭제 대상의 고객사 또는 배차 상태가 달라졌습니다. 새로고침 후 다시 확인해 주세요.', 409);
    }
  } else {
    let query = supabaseAdmin.from('schedules').select('id, status');
    if (scope === 'event' && anchor.group_id) query = query.eq('group_id', anchor.group_id);
    else if (scope === 'event' && anchor.event_id) query = query.eq('event_id', anchor.event_id);
    else query = query.eq('id', id);
    const { data: targets, error } = await query;
    if (error) throw error;
    ids = [...new Set((targets || []).filter(item => item.status !== 'deleted').map(item => item.id))];
  }

  if (!ids.length || ids.length > 100) {
    return failure('삭제 대상 일정이 없거나 100건을 초과합니다.', 409);
  }
  return { ids, response: null };
}

async function processRequest(req: NextRequest, inspect: boolean) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }
    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!inspect && payload?.confirm !== true) {
      return NextResponse.json({ ok: false, error: '관리자의 삭제 확인이 필요합니다.' }, { status: 400 });
    }
    const selection = await resolveIds(payload);
    if (selection.response) return selection.response;

    const mode = inspect ? 'inspect' : payload?.mode;
    if (!['inspect', 'schedule_only', 'include_drafts'].includes(String(mode))) {
      return NextResponse.json({ ok: false, error: '배차만 삭제할지 관련 초안까지 삭제할지 선택해 주세요.' }, { status: 400 });
    }

    // One database transaction handles inspection, reference integrity,
    // optional deletion of unsubmitted drafts and the final archive/delete.
    // This is authoritative even if the preview was outdated.
    const { data, error } = await supabaseAdmin.rpc('admin_schedule_delete', {
      p_ids: selection.ids,
      p_action: mode,
      p_actor: auth.session.userId,
    });
    if (error) {
      if (/RECORDS_REQUIRE_RETENTION/.test(error.message)) {
        return NextResponse.json({ ok: false, code: 'RECORDS_REQUIRE_RETENTION',
          error: '제출·승인·정산·증빙·차량 인수 기록이 있어 관련 기록을 전체 삭제할 수 없습니다. 배차만 삭제를 선택해 주세요.' }, { status: 409 });
      }
      if (/DELETE_TARGET_CHANGED/.test(error.message)) {
        return NextResponse.json({ ok: false, error: '삭제 대상이 변경됐습니다. 다시 확인해 주세요.' }, { status: 409 });
      }
      throw error;
    }
    if (!data || data.ok !== true) throw new Error('Deletion transaction did not confirm the requested action');
    return NextResponse.json(inspect ? { ...data, scheduleIds: selection.ids } :
      { ...data, deletedScheduleIds: selection.ids });
  } catch (error: unknown) {
    console.error('HQ schedule removal failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ok: false, error: '배차 삭제를 완료하지 못했습니다. 서버 상태를 확인해 주세요.' }, { status: 500 });
  }
}

/** Inspect server-held records before showing the delete options. Read-only. */
export async function POST(req: NextRequest) {
  return processRequest(req, true);
}

/** HQ-confirmed transaction; all IDs succeed together or nothing changes. */
export async function DELETE(req: NextRequest) {
  return processRequest(req, false);
}
