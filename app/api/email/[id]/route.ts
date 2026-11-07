import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverEmailDetail } from '@/services/naverImapService';
import { HqEmailDetail } from '@/types/emailHq';
import { requireHqAdmin } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

// Server-side in-memory cache for immutable email bodies (max 200 items)
const emailDetailCache = new Map<number, HqEmailDetail>();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // P0 Compliance: Require HQ Admin authentication before accessing email details
    const auth = await requireHqAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Email ID is required' }, { status: 400 });
    }

    // ID is formatted as "naver-<uid>" or numeric uid
    const uidStr = id.replace(/^naver-/, '');
    const uid = parseInt(uidStr, 10);

    if (isNaN(uid)) {
      if (id.startsWith('em-ref-')) {
        const { isDevAuthAllowed } = await import('@/lib/auth/serverAuth');
        if (isDevAuthAllowed()) {
          const { REFERENCE_EMAILS } = await import('@/components/hq/email/emailReferenceData');
          const refItem = REFERENCE_EMAILS.find((r) => r.summary.id === id);
          if (refItem) {
            return NextResponse.json({ ok: true, email: refItem.detail, isDemo: true });
          }
        }
      }
      return NextResponse.json({ ok: false, error: '유효하지 않은 이메일 식별자입니다.' }, { status: 400 });
    }

    // Check server cache first for instant retrieval
    if (emailDetailCache.has(uid)) {
      return NextResponse.json({
        ok: true,
        email: emailDetailCache.get(uid),
        fromServerCache: true,
      });
    }

    const detail = await fetchNaverEmailDetail(uid);
    if (!detail) {
      return NextResponse.json({ ok: false, error: 'Email not found' }, { status: 404 });
    }

    // Save to cache
    if (emailDetailCache.size >= 200) {
      const firstKey = emailDetailCache.keys().next().value;
      if (firstKey !== undefined) emailDetailCache.delete(firstKey);
    }
    emailDetailCache.set(uid, detail);

    return NextResponse.json({
      ok: true,
      email: detail,
      fromServerCache: false,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/[id]:', errorMsg);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}
