import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth } from '@/lib/auth/serverAuth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { BUCKET_NAME } from '@/lib/assets/driverAssetServerStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hq/drivers/assets/preview
 * Securely streams or proxies asset images from 'cockpit-assets' bucket.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.ok || !auth.session) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const storagePath = searchParams.get('path');

    if (!storagePath) {
      return NextResponse.json({ ok: false, error: 'path 파라미터가 필요합니다.' }, { status: 400 });
    }

    // Path traversal check
    if (storagePath.includes('..') || storagePath.startsWith('/')) {
      return NextResponse.json({ ok: false, error: '유효하지 않은 파일 경로입니다.' }, { status: 400 });
    }

    const org = auth.session.org || 'vip_limousine_korea';
    if (!storagePath.startsWith(`${org}/drivers/`)) {
      return NextResponse.json({ ok: false, error: '접근 권한이 없는 경로입니다. (403 Forbidden)' }, { status: 403 });
    }

    // Driver boundary check: drivers can only preview paths containing their own driverId UUID
    if (auth.session.role === 'driver') {
      const driverId = auth.session.driverId || auth.session.userId;
      if (!driverId || !storagePath.includes(`/${driverId}/`)) {
        return NextResponse.json({ ok: false, error: '본인 안내자료만 열람할 수 있습니다. (403 Forbidden)' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin.storage.from(BUCKET_NAME).download(storagePath);
    if (error || !data) {
      return NextResponse.json({ ok: false, error: '이미지 파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const isPng = storagePath.endsWith('.png');
    const isJpg = storagePath.endsWith('.jpg') || storagePath.endsWith('.jpeg');
    const isWebp = storagePath.endsWith('.webp');
    const isPdf = storagePath.endsWith('.pdf');

    const contentType = isPng
      ? 'image/png'
      : isJpg
      ? 'image/jpeg'
      : isWebp
      ? 'image/webp'
      : isPdf
      ? 'application/pdf'
      : 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || '이미지 미리보기 실패' }, { status: 500 });
  }
}

