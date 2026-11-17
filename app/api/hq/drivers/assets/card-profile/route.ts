import { NextRequest, NextResponse } from 'next/server';
import { requireHqAdmin } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { normalizePortraitPlacement, parsePortraitPlacement } from '@/lib/dispatchCards/portraitCrop';
import { validateDispatchCardProfile } from '@/lib/dispatchCards/chauffeurIdentity';

export const dynamic = 'force-dynamic';

function plainObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
}

/** Read a chauffeur's reusable card-only identity and portrait crop from the existing driver metadata. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireHqAdmin(request);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }
    const driverId = new URL(request.url).searchParams.get('driverId')?.trim();
    if (!driverId) return NextResponse.json({ ok: false, error: '기사 ID가 필요합니다.' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('drivers')
      .select('driver_name, phone, driver_meta').eq('id', driverId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: '기사를 찾을 수 없습니다.' }, { status: 404 });
    const meta = plainObject(data.driver_meta);
    const identity = plainObject(meta.dispatch_card_identity);
    const role = typeof identity.positionCode === 'string' ? identity.positionCode : '';
    const validStored = validateDispatchCardProfile({
      koreanName: identity.koreanName ?? data.driver_name,
      englishName: identity.englishName ?? '',
      phone: identity.phone ?? data.phone ?? '',
      positionCode: role,
    });
    return NextResponse.json({
      ok: true,
      profile: validStored || {
        koreanName: data.driver_name || '',
        englishName: typeof identity.englishName === 'string' ? identity.englishName : '',
        phone: typeof identity.phone === 'string' ? identity.phone : (data.phone || ''),
        positionCode: role === 'chauffeur' || role === 'senior_chauffeur' ? role : '',
      },
      placement: normalizePortraitPlacement(meta.dispatch_portrait_crop),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false,
      error: error instanceof Error ? error.message : '기사 배차카드 정보를 불러오지 못했습니다.',
    }, { status: 500 });
  }
}

/** One authenticated write preserves both identity and face crop for future vehicle cards. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireHqAdmin(request);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }
    const payload = await request.json().catch(() => null);
    const driverId = typeof payload?.driverId === 'string' ? payload.driverId.trim() : '';
    const profile = validateDispatchCardProfile(payload?.profile);
    const placement = parsePortraitPlacement(payload?.placement);
    if (!driverId || !profile || !placement) {
      return NextResponse.json({ ok: false, error: '한국어·영문 이름, 의전 직책, 연락처 및 사진 구도를 확인해 주세요.' }, { status: 400 });
    }
    const { data: existing, error: readError } = await supabaseAdmin.from('drivers')
      .select('driver_meta').eq('id', driverId).maybeSingle();
    if (readError) throw readError;
    if (!existing) return NextResponse.json({ ok: false, error: '기사를 찾을 수 없습니다.' }, { status: 404 });
    const meta = plainObject(existing.driver_meta);
    const { data: saved, error: writeError } = await supabaseAdmin.from('drivers')
      .update({ driver_meta: {
        ...meta,
        dispatch_card_identity: profile,
        dispatch_portrait_crop: placement,
      } }).eq('id', driverId).select('id').maybeSingle();
    if (writeError) throw writeError;
    if (!saved) return NextResponse.json({ ok: false, error: '정보를 저장하지 못했습니다.' }, { status: 500 });
    return NextResponse.json({ ok: true, profile, placement });
  } catch (error) {
    return NextResponse.json({ ok: false,
      error: error instanceof Error ? error.message : '기사 배차카드 정보를 저장하지 못했습니다.',
    }, { status: 500 });
  }
}
