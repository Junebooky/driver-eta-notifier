import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverEmailDetail } from '@/services/naverImapService';

export const dynamic = 'force-dynamic';

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

    const detail = await fetchNaverEmailDetail(uid);
    if (!detail) {
      return NextResponse.json({ ok: false, error: 'Email not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      email: detail,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in /api/email/[id]:', errorMsg);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}
