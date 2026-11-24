import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin, verifyServerAuth } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  FIELD_KNOWLEDGE_ORG, mapSharedKnowledgeRow, normalizeKnowledgeItem,
} from '@/utils/sharedFieldKnowledge';

export const dynamic = 'force-dynamic';
const TABLE = 'field_knowledge';

const jsonError = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });

/** HQ and authenticated drivers read only published (non-archived) shared items.
 * Never fall back to demo fixtures or localStorage when DB is unavailable.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyServerAuth(req);
  if (!auth.ok || !auth.session) return jsonError(auth.error || '로그인이 필요합니다.', auth.statusCode);
  try {
    const { data, error } = await supabaseAdmin.from(TABLE)
      .select('id,content,version,updated_at,updated_by')
      .eq('organization_id', FIELD_KNOWLEDGE_ORG)
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, items: (data || []).map(mapSharedKnowledgeRow) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '공용 현장 지식을 조회할 수 없습니다.', 503);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok || !auth.session) return jsonError(auth.error || '관리자 권한이 필요합니다.', auth.statusCode);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError('JSON 본문이 올바르지 않습니다.', 400); }
  try {
    const author = auth.session.displayName || 'HQ 관리자';
    const now = new Date().toISOString();

    // Explicit HQ-reviewed local import. Ignore duplicates, never overwrite
    // existing server content or silently publish the bundled sample catalog.
    if (body.action === 'import') {
      const candidates = body.items;
      if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 50) {
        return jsonError('가져올 항목은 한 번에 1~50개까지 선택해 주세요.', 400);
      }
      const parsed = candidates.map(normalizeKnowledgeItem);
      const invalid = parsed.find(v => !v.ok);
      if (invalid && !invalid.ok) return jsonError(invalid.error, 400);
      const ids = parsed.map(v => v.ok ? v.item.id : '');
      if (new Set(ids).size !== ids.length) return jsonError('중복된 항목 ID는 가져올 수 없습니다.', 400);
      const rows = parsed.map(value => {
        if (!value.ok) throw new Error(value.error);
        return {
          organization_id: FIELD_KNOWLEDGE_ORG, id: value.item.id,
          content: value.item, version: 1, archived: false,
          updated_at: now, updated_by: author,
        };
      });
      const { data, error } = await supabaseAdmin.from(TABLE)
        .upsert(rows, { onConflict: 'organization_id,id', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(error.message);
      return NextResponse.json({
        ok: true, imported: (data || []).length, skipped: rows.length - (data || []).length,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const parsed = normalizeKnowledgeItem(body.item);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const { data, error } = await supabaseAdmin.from(TABLE).insert({
      organization_id: FIELD_KNOWLEDGE_ORG, id: parsed.item.id,
      content: parsed.item, version: 1, archived: false,
      updated_at: now, updated_by: author,
    }).select('id,content,version,updated_at,updated_by').single();
    if (error?.code === '23505') return jsonError('이미 존재하는 항목입니다. 목록을 새로고침해 주세요.', 409);
    if (error || !data) throw new Error(error?.message || '등록 확인에 실패했습니다.');
    return NextResponse.json({ ok: true, item: mapSharedKnowledgeRow(data) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '현장 지식 저장에 실패했습니다.', 503);
  }
}

/** Existing items are updated only if the version opened by HQ is still current. */
export async function PUT(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok || !auth.session) return jsonError(auth.error || '관리자 권한이 필요합니다.', auth.statusCode);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError('JSON 본문이 올바르지 않습니다.', 400); }
  const parsed = normalizeKnowledgeItem(body.item);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const version = body.expectedVersion;
  if (!Number.isSafeInteger(version) || (version as number) < 1) return jsonError('수정 버전을 확인해 주세요.', 400);
  try {
    const { data, error } = await supabaseAdmin.from(TABLE)
      .update({
        content: parsed.item, version: (version as number) + 1,
        updated_at: new Date().toISOString(),
        updated_by: auth.session.displayName || 'HQ 관리자',
      })
      .eq('organization_id', FIELD_KNOWLEDGE_ORG)
      .eq('id', parsed.item.id)
      .eq('version', version)
      .eq('archived', false)
      .select('id,content,version,updated_at,updated_by').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return jsonError('다른 관리자가 먼저 수정하거나 삭제했습니다. 최신 내용을 다시 확인해 주세요.', 409);
    return NextResponse.json({ ok: true, item: mapSharedKnowledgeRow(data) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '현장 지식 수정에 실패했습니다.', 503);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireHqAdmin(req);
  if (!auth.ok || !auth.session) return jsonError(auth.error || '관리자 권한이 필요합니다.', auth.statusCode);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError('JSON 본문이 올바르지 않습니다.', 400); }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const version = body.expectedVersion;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id) ||
      !Number.isSafeInteger(version) || (version as number) < 1) {
    return jsonError('삭제할 항목과 버전을 확인해 주세요.', 400);
  }
  try {
    const { data, error } = await supabaseAdmin.from(TABLE)
      .update({
        archived: true, version: (version as number) + 1,
        updated_at: new Date().toISOString(),
        updated_by: auth.session.displayName || 'HQ 관리자',
      })
      .eq('organization_id', FIELD_KNOWLEDGE_ORG)
      .eq('id', id)
      .eq('version', version)
      .eq('archived', false)
      .select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return jsonError('다른 관리자가 먼저 수정하거나 삭제했습니다. 최신 내용을 다시 확인해 주세요.', 409);
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '현장 지식 삭제에 실패했습니다.', 503);
  }
}
