import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverEmailDetail } from '@/services/naverImapService';
import { HqEmailDetail } from '@/types/emailHq';

export const dynamic = 'force-dynamic';

// Server-side in-memory cache for immutable email bodies (max 200 items)
const emailDetailCache = new Map<number, HqEmailDetail>();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Email ID is required' }, { status: 400 });
    }

    // ID is formatted as "naver-<uid>" or numeric uid
    const uidStr = id.replace(/^naver-/, '');
    const uid = parseInt(uidStr, 10);

    if (isNaN(uid)) {
      return NextResponse.json({ ok: false, error: 'Invalid UID format' }, { status: 400 });
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
