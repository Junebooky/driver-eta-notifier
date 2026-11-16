import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  normalizePortraitPlacement,
  parsePortraitPlacement,
} from '@/lib/dispatchCards/portraitCrop';

export const dynamic = 'force-dynamic';

function readMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Load saved per-driver portrait positioning; an unset value uses the 118% face-first default. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }
    const driverId = new URL(req.url).searchParams.get('driverId')?.trim();
    if (!driverId) {
      return NextResponse.json({ ok: false, error: '기사 ID가 필요합니다.' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from('drivers')
      .select('driver_meta').eq('id', driverId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: '기사를 찾을 수 없습니다.' }, { status: 404 });
    const meta = readMeta(data.driver_meta);
    return NextResponse.json({
      ok: true,
      placement: normalizePortraitPlacement(meta.dispatch_portrait_crop),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '기사 사진 위치를 불러오지 못했습니다.',
    }, { status: 500 });
  }
}

/** HQ-only save; update one key without discarding unrelated driver profile metadata. */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireHqAdmin(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }
    const payload = await req.json().catch(() => null);
    const driverId = typeof payload?.driverId === 'string' ? payload.driverId.trim() : '';
    const placement = parsePortraitPlacement(payload?.placement);
    if (!driverId || !placement) {
      return NextResponse.json({
        ok: false,
        error: '유효한 기사 ID와 사진 위치(확대 100~240%, 상하/좌우 -50~50%)가 필요합니다.',
      }, { status: 400 });
    }
    const { data: previous, error: readError } = await supabaseAdmin.from('drivers')
      .select('driver_meta').eq('id', driverId).maybeSingle();
    if (readError) throw readError;
    if (!previous) return NextResponse.json({ ok: false, error: '기사를 찾을 수 없습니다.' }, { status: 404 });
    const meta = readMeta(previous.driver_meta);
    const { data: saved, error: writeError } = await supabaseAdmin.from('drivers')
      .update({ driver_meta: { ...meta, dispatch_portrait_crop: placement } })
      .eq('id', driverId).select('id').maybeSingle();
    if (writeError) throw writeError;
    if (!saved) return NextResponse.json({ ok: false, error: '사진 위치 저장에 실패했습니다.' }, { status: 500 });
    return NextResponse.json({ ok: true, placement });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '기사 사진 위치를 저장하지 못했습니다.',
    }, { status: 500 });
  }
}
